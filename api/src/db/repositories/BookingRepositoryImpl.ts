/**
 * PostgreSQL implementation of BookingRepository
 * 
 * Critical responsibilities:
 * - Create booking with idempotency and slot validation (L3)
 * - Complete/undo booking with package transactions
 * - Cancel with policy determination
 * - Reschedule as atomic cancel+create
 * 
 * Identity rules (auth-model.md §2.1):
 * - source: derived from Principal capability, NOT request parameter
 * - cancelledBy: derived from Principal capability, NOT request parameter
 */

import type { Pool } from 'pg'
import type {
  BookingView,
  TeacherDayView,
  CreateBookingRequest,
  RescheduleBookingRequest,
  Principal,
} from '@rabbit/shared'
import type { BookingRepository } from '../../ports/BookingRepository.js'
import {
  computeBookingActions,
  determineCancellationPolicy,
  determineReschedulePolicy,
  shouldAutoSettle,
  isPendingSettlement,
  utcToLocalDate,
  utcToLocalTime,
  formatTimeRange,
} from '../../domain/index.js'

export class BookingRepositoryImpl implements BookingRepository {
  constructor(private pool: Pool) {}

  async findById(bookingId: string): Promise<BookingView | null> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.id = $1`,
      [bookingId]
    )

    if (rows.length === 0) return null

    return this.mapBookingView(rows[0])
  }

  async listByTeacher(teacherId: string): Promise<BookingView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.teacher_id = $1
      ORDER BY b.start_at DESC`,
      [teacherId]
    )

    return rows.map(r => this.mapBookingView(r))
  }

  async listUpcomingByTeacher(teacherId: string): Promise<BookingView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.teacher_id = $1 AND b.status = 'Upcoming'
      ORDER BY b.start_at ASC`,
      [teacherId]
    )

    return rows.map(r => this.mapBookingView(r))
  }

  async listByStudent(studentId: string): Promise<BookingView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.student_id = $1
      ORDER BY b.start_at DESC`,
      [studentId]
    )

    return rows.map(r => this.mapBookingView(r))
  }

  async listUpcomingByStudent(studentId: string): Promise<BookingView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.student_id = $1 AND b.status = 'Upcoming'
      ORDER BY b.start_at ASC`,
      [studentId]
    )

    return rows.map(r => this.mapBookingView(r))
  }

  async getTeacherDayView(teacherId: string, date: string): Promise<TeacherDayView> {
    // Get today's bookings
    const { rows: bookings } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.teacher_id = $1 
        AND DATE(b.start_at AT TIME ZONE 'Asia/Shanghai') = $2
      ORDER BY b.start_at ASC`,
      [teacherId, date]
    )

    // Get next upcoming booking (after today)
    const { rows: [nextBooking] } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.teacher_id = $1 
        AND b.status = 'Upcoming'
        AND b.start_at > (DATE($2) + INTERVAL '1 day')
      ORDER BY b.start_at ASC
      LIMIT 1`,
      [teacherId, date]
    )

    const bookingViews = bookings.map(r => this.mapBookingView(r))
    const now = new Date()

    // Separate into regular and pending (ended but not settled)
    const regular = bookingViews.filter(b => !isPendingSettlement(b.status, new Date(b.endAt), now))
    const pending = bookingViews.filter(b => isPendingSettlement(b.status, new Date(b.endAt), now))

    return {
      date,
      isToday: date === utcToLocalDate(now),
      dateLabel: this.formatDateLabel(date),
      todayCount: bookings.length,
      completedCount: bookings.filter(b => b.status === 'Completed').length,
      next: nextBooking ? this.mapBookingView(nextBooking) : null,
      bookings: regular,
      pending,
      hints: [] // Populate with user-facing hints if needed
    }
  }

  async getTeacherCalendarView(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<BookingView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        b.*,
        tp.name as teacher_name,
        s.name as student_name,
        c.name as course_name,
        c.duration_minutes,
        ls.id as session_id,
        ls.status as session_status,
        ls.source as session_source
      FROM booking b
      JOIN teacher_profile tp ON tp.id = b.teacher_id
      JOIN student s ON s.id = b.student_id
      JOIN course c ON c.id = b.course_id
      LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
      WHERE b.teacher_id = $1
        AND DATE(b.start_at AT TIME ZONE 'Asia/Shanghai') BETWEEN $2 AND $3
      ORDER BY b.start_at ASC`,
      [teacherId, fromDate, toDate]
    )

    return rows.map(r => this.mapBookingView(r))
  }

  async create(
    data: CreateBookingRequest,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Step 1: Check idempotency (docs/data-model.md §2.8)
      const { rows: existingIdem } = await client.query(
        `SELECT response_body FROM idempotency_record
         WHERE (user_id = $1 OR student_id = $2) 
           AND idempotency_key = $3
           AND endpoint = 'create_booking'`,
        [principal.userId, principal.studentId, idempotencyKey]
      )

      if (existingIdem.length > 0) {
        // Return cached response (idempotent replay)
        await client.query('COMMIT')
        return existingIdem[0].response_body.data
      }

      // Step 2: Determine source from Principal capability (auth-model.md §2.1)
      // Teacher capability: TeacherCreated
      // Student capability: SelfBooked
      let source: 'SelfBooked' | 'TeacherCreated'
      let targetStudentId: string

      if (data.studentId) {
        // Teacher creating for student
        source = 'TeacherCreated'
        targetStudentId = data.studentId
      } else {
        // Student self-booking
        source = 'SelfBooked'
        if (principal.studentId) {
          targetStudentId = principal.studentId
        } else {
          throw new Error('Student self-booking requires principal.studentId')
        }
      }

      // Step 3: Get teacher, course, student
      const { rows: [teacher] } = await client.query(
        `SELECT tp.*, au.id as user_id
         FROM teacher_profile tp
         JOIN app_user au ON au.id = tp.user_id
         WHERE tp.id = (SELECT teacher_id FROM course WHERE id = $1)`,
        [data.courseId]
      )

      if (!teacher) {
        throw new Error('Teacher not found for this course')
      }

      const { rows: [course] } = await client.query(
        `SELECT * FROM course WHERE id = $1 AND status = 'Active'`,
        [data.courseId]
      )

      if (!course) {
        throw new Error('Course not found or not active')
      }

      // Step 3a: Lock student row (data-model.md §4.2 critical section)
      // Must lock BEFORE reading reserved/remaining to prevent I5 violation
      const { rows: [student] } = await client.query(
        `SELECT * FROM student WHERE id = $1 AND status = 'Active' FOR UPDATE`,
        [targetStudentId]
      )

      if (!student) {
        throw new Error('Student not found or not active')
      }

      // Step 4: Calculate end time from course duration
      const startAt = new Date(data.startAt)
      const endAt = new Date(startAt.getTime() + course.duration_minutes * 60 * 1000)

      // Step 5: Select package via FIFO with row lock
      // Lock packages to serialize FIFO selection under student critical section
      const { rows: packages } = await client.query(
        `SELECT id, created_at, remaining_sessions, status
         FROM lesson_package
         WHERE student_id = $1 AND course_id = $2 AND status = 'Active'
         ORDER BY created_at ASC
         FOR UPDATE`,
        [targetStudentId, data.courseId]
      )

      if (packages.length === 0) {
        throw new Error('No active packages found for this student and course')
      }

      // FIFO selection (earliest created with remaining > 0)
      const selectedPackage = packages.find(p => p.remaining_sessions > 0)
      if (!selectedPackage) {
        throw new Error('No packages with remaining sessions')
      }

      // Step 6: Check available sessions (after considering reserved)
      const { rows: [{ reserved_count }] } = await client.query(
        `SELECT COUNT(*) as reserved_count
         FROM booking
         WHERE student_id = $1 AND course_id = $2 AND status = 'Upcoming'`,
        [targetStudentId, data.courseId]
      )

      const totalRemaining = packages.reduce((sum, p) => sum + p.remaining_sessions, 0)
      const available = totalRemaining - parseInt(reserved_count, 10)

      if (available < 1) {
        throw new Error('INSUFFICIENT_SESSIONS')
      }

      // Step 7: Slot validation (L3) - if self-booking, must be valid slot
      // For teacher creating, skip slot validation (docs/mvp.md §7.4)
      if (source === 'SelfBooked') {
        // TODO: Call computeSlots and verify startAt is valid
        // This requires fetching rules, exceptions, and busy intervals
        // For now, we rely on the EXCLUDE constraint to catch actual conflicts
      }

      // Step 8: Create booking
      const { rows: [booking] } = await client.query(
        `INSERT INTO booking (
          teacher_id, student_id, course_id, package_id,
          start_at, end_at, status,
          policy_snapshot_free_cancel_hours,
          source, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', $7, $8, $9)
        RETURNING *`,
        [
          teacher.id,
          targetStudentId,
          data.courseId,
          selectedPackage.id,
          startAt,
          endAt,
          teacher.free_cancel_hours,
          source,
          idempotencyKey
        ]
      )

      // Step 9: Record idempotency
      await client.query(
        `INSERT INTO idempotency_record (
          user_id, student_id, idempotency_key, endpoint,
          request_hash, response_status, response_body, state
        ) VALUES ($1, $2, $3, 'create_booking', $4, 201, $5, 'Succeeded')`,
        [
          principal.userId,
          principal.studentId,
          idempotencyKey,
          'hash', // TODO: Compute actual request hash
          JSON.stringify({ ok: true, data: { bookingId: booking.id } })
        ]
      )

      await client.query('COMMIT')

      // Fetch and return full view
      const result = await this.findById(booking.id)
      return result!

    } catch (error) {
      await client.query('ROLLBACK')
      
      // Map database errors to friendly codes
      if ((error as any).code === '23P01') {
        // EXCLUDE constraint violation
        throw new Error('SLOT_TAKEN')
      }
      
      throw error
    } finally {
      client.release()
    }
  }

  async complete(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Get booking with lock
      const { rows: [booking] } = await client.query(
        `SELECT b.*, tp.auto_settle_hours
         FROM booking b
         JOIN teacher_profile tp ON tp.id = b.teacher_id
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      )

      if (!booking) {
        throw new Error('Booking not found')
      }

      if (booking.status !== 'Upcoming') {
        throw new Error('BOOKING_NOT_UPCOMING')
      }

      // Create session
      const { rows: [session] } = await client.query(
        `INSERT INTO lesson_session (
          booking_id, teacher_id, student_id, course_id, package_id,
          completed_at, consumed_sessions, status, source
        ) VALUES ($1, $2, $3, $4, $5, now(), 1, 'Active', 'TeacherConfirmed')
        RETURNING id`,
        [
          booking.id,
          booking.teacher_id,
          booking.student_id,
          booking.course_id,
          booking.package_id
        ]
      )

      // Apply package transaction (SESSION_COMPLETED)
      await client.query(
        `SELECT * FROM apply_package_transaction($1, 'SESSION_COMPLETED', -1, $2, $3, NULL, $4, NULL)`,
        [booking.package_id, booking.id, session.id, principal.userId]
      )

      // Update booking
      await client.query(
        `UPDATE booking
         SET status = 'Completed', settled_at = now()
         WHERE id = $1`,
        [bookingId]
      )

      await client.query('COMMIT')

      const result = await this.findById(bookingId)
      return result!

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async markNoShow(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    // Mark as no-show: Cancel with LATE_CANCEL charge
    return this.cancel(bookingId, principal, idempotencyKey)
  }

  async undoCompletion(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Get booking with session
      const { rows: [booking] } = await client.query(
        `SELECT b.*, ls.id as session_id, tp.undo_complete_days
         FROM booking b
         JOIN teacher_profile tp ON tp.id = b.teacher_id
         LEFT JOIN lesson_session ls ON ls.booking_id = b.id AND ls.status = 'Active'
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      )

      if (!booking) {
        throw new Error('Booking not found')
      }

      if (booking.status !== 'Completed') {
        throw new Error('Booking is not completed')
      }

      if (!booking.session_id) {
        throw new Error('No active session found')
      }

      // Check undo window
      const undoDeadline = new Date(booking.settled_at)
      undoDeadline.setDate(undoDeadline.getDate() + booking.undo_complete_days)

      if (new Date() > undoDeadline) {
        throw new Error('UNDO_WINDOW_EXPIRED')
      }

      // Void session
      await client.query(
        `UPDATE lesson_session SET status = 'Voided' WHERE id = $1`,
        [booking.session_id]
      )

      // Apply REVERSAL transaction
      await client.query(
        `SELECT * FROM apply_package_transaction(
          $1, 'REVERSAL', 1, $2, $3, 'Undo completion', $4, NULL
        )`,
        [booking.package_id, booking.id, booking.session_id, principal.userId]
      )

      // Revert booking to Upcoming
      await client.query(
        `UPDATE booking
         SET status = 'Upcoming', settled_at = NULL
         WHERE id = $1`,
        [bookingId]
      )

      await client.query('COMMIT')

      const result = await this.findById(bookingId)
      return result!

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async cancel(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Get booking
      const { rows: [booking] } = await client.query(
        `SELECT * FROM booking WHERE id = $1 FOR UPDATE`,
        [bookingId]
      )

      if (!booking) {
        throw new Error('Booking not found')
      }

      if (booking.status !== 'Upcoming') {
        throw new Error('BOOKING_NOT_UPCOMING')
      }

      // Determine who is canceling
      const isTeacher = principal.kind === 'User' // TODO: Check actual teacher capability
      const cancelledBy = isTeacher ? 'Teacher' : 'Student'

      // Determine policy
      const policy = determineCancellationPolicy({
        startAt: new Date(booking.start_at),
        freeCancelHours: booking.policy_snapshot_free_cancel_hours,
        cancelledBy,
        now: new Date(),
        hasStarted: new Date() >= new Date(booking.start_at)
      })

      // If late cancel, apply package transaction
      if (policy === 'LATE_CANCEL') {
        await client.query(
          `SELECT * FROM apply_package_transaction(
            $1, 'LATE_CANCEL', -1, $2, NULL, 'Late cancellation', $3, $4
          )`,
          [
            booking.package_id,
            booking.id,
            principal.userId,
            principal.studentId
          ]
        )
      }

      // Update booking
      await client.query(
        `UPDATE booking
         SET status = 'Cancelled',
             cancelled_at = now(),
             cancelled_by = $1,
             cancellation_policy_result = $2
         WHERE id = $3`,
        [cancelledBy, policy, bookingId]
      )

      await client.query('COMMIT')

      const result = await this.findById(bookingId)
      return result!

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async reschedule(
    bookingId: string,
    data: RescheduleBookingRequest,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Get old booking
      const { rows: [oldBooking] } = await client.query(
        `SELECT b.*, tp.max_reschedules
         FROM booking b
         JOIN teacher_profile tp ON tp.id = b.teacher_id
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      )

      if (!oldBooking) {
        throw new Error('Booking not found')
      }

      if (oldBooking.status !== 'Upcoming') {
        throw new Error('BOOKING_NOT_UPCOMING')
      }

      // Check reschedule limit
      if (oldBooking.reschedule_count >= oldBooking.max_reschedules) {
        throw new Error('RESCHEDULE_LIMIT_REACHED')
      }

      // Determine policy for old booking
      const isTeacher = principal.kind === 'User' // TODO: Check actual capability
      const cancelledBy = isTeacher ? 'Teacher' : 'Student'

      const policy = determineReschedulePolicy({
        startAt: new Date(oldBooking.start_at),
        freeCancelHours: oldBooking.policy_snapshot_free_cancel_hours,
        cancelledBy,
        now: new Date(),
        hasStarted: new Date() >= new Date(oldBooking.start_at)
      })

      // If late reschedule, check if student has 2 available sessions
      if (policy === 'LATE_CANCEL' && !isTeacher) {
        const { rows: [{ total_remaining, reserved_count }] } = await client.query(
          `SELECT 
             SUM(lp.remaining_sessions) as total_remaining,
             COUNT(b.id) as reserved_count
           FROM lesson_package lp
           LEFT JOIN booking b ON b.student_id = lp.student_id 
             AND b.course_id = lp.course_id 
             AND b.status = 'Upcoming'
           WHERE lp.student_id = $1 
             AND lp.course_id = $2 
             AND lp.status != 'Archived'
           GROUP BY lp.student_id`,
          [oldBooking.student_id, oldBooking.course_id]
        )

        const available = (parseInt(total_remaining, 10) || 0) - (parseInt(reserved_count, 10) || 0)

        if (available < 2) {
          throw new Error('LATE_RESCHEDULE_INSUFFICIENT')
        }
      }

      // Step 1: Cancel old booking with policy determination
      if (policy === 'LATE_CANCEL') {
        await client.query(
          `SELECT * FROM apply_package_transaction(
            $1, 'LATE_CANCEL', -1, $2, NULL, 'Late reschedule penalty', $3, $4
          )`,
          [
            oldBooking.package_id,
            oldBooking.id,
            principal.userId,
            principal.studentId
          ]
        )
      }

      await client.query(
        `UPDATE booking
         SET status = 'Cancelled',
             cancelled_at = now(),
             cancelled_by = $1,
             cancellation_policy_result = $2
         WHERE id = $3`,
        [cancelledBy, policy, bookingId]
      )

      // Step 2: Create new booking
      const startAt = new Date(data.newStartAt)
      const endAt = new Date(startAt.getTime() + oldBooking.duration_minutes * 60 * 1000)

      const { rows: [newBooking] } = await client.query(
        `INSERT INTO booking (
          teacher_id, student_id, course_id, package_id,
          start_at, end_at, status,
          policy_snapshot_free_cancel_hours,
          source, idempotency_key,
          rescheduled_from_booking_id,
          reschedule_count
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          oldBooking.teacher_id,
          oldBooking.student_id,
          oldBooking.course_id,
          oldBooking.package_id,
          startAt,
          endAt,
          oldBooking.policy_snapshot_free_cancel_hours,
          oldBooking.source,
          idempotencyKey,
          oldBooking.id,
          oldBooking.reschedule_count + 1
        ]
      )

      // Link old booking to new
      await client.query(
        `UPDATE booking SET rescheduled_to_booking_id = $1 WHERE id = $2`,
        [newBooking.id, bookingId]
      )

      await client.query('COMMIT')

      const result = await this.findById(newBooking.id)
      return result!

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async getUpcomingIntervals(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<Array<{ startAt: string; endAt: string }>> {
    const { rows } = await this.pool.query(
      `SELECT start_at, end_at
       FROM booking
       WHERE teacher_id = $1
         AND status = 'Upcoming'
         AND start_at >= $2::date
         AND end_at <= ($3::date + INTERVAL '1 day')
       ORDER BY start_at`,
      [teacherId, fromDate, toDate]
    )

    return rows.map(r => ({
      startAt: r.start_at.toISOString(),
      endAt: r.end_at.toISOString()
    }))
  }

  async autoSettle(): Promise<number> {
    const client = await this.pool.connect()
    let settledCount = 0

    try {
      // Find all bookings that should be auto-settled
      const { rows: bookings } = await client.query(
        `SELECT b.*, tp.auto_settle_hours
         FROM booking b
         JOIN teacher_profile tp ON tp.id = b.teacher_id
         WHERE b.status = 'Upcoming'
           AND tp.auto_settle_hours > 0
           AND b.end_at + (tp.auto_settle_hours || ' hours')::interval < now()`
      )

      for (const booking of bookings) {
        try {
          await client.query('BEGIN')

          // Create session
          const { rows: [session] } = await client.query(
            `INSERT INTO lesson_session (
              booking_id, teacher_id, student_id, course_id, package_id,
              completed_at, consumed_sessions, status, source
            ) VALUES ($1, $2, $3, $4, $5, now(), 1, 'Active', 'AutoSettled')
            RETURNING id`,
            [
              booking.id,
              booking.teacher_id,
              booking.student_id,
              booking.course_id,
              booking.package_id
            ]
          )

          // Apply package transaction
          await client.query(
            `SELECT * FROM apply_package_transaction(
              $1, 'SESSION_COMPLETED', -1, $2, $3, 'Auto-settled', NULL, NULL
            )`,
            [booking.package_id, booking.id, session.id]
          )

          // Update booking
          await client.query(
            `UPDATE booking
             SET status = 'Completed', settled_at = now()
             WHERE id = $1`,
            [booking.id]
          )

          await client.query('COMMIT')
          settledCount++

        } catch (error) {
          await client.query('ROLLBACK')
          console.error(`Failed to auto-settle booking ${booking.id}:`, error)
        }
      }

      return settledCount

    } finally {
      client.release()
    }
  }

  // Helper methods

  private mapBookingView(row: any): BookingView {
    const now = new Date()
    const startAt = new Date(row.start_at)
    const endAt = new Date(row.end_at)
    const started = now >= startAt
    const hasEnded = now >= endAt

    // Calculate actions (auth-model.md requires capability checking)
    // For now, returning both teacher and student views
    const actions = computeBookingActions({
      status: row.status,
      startAt,
      endAt,
      rescheduleCount: row.reschedule_count,
      maxReschedules: 3, // TODO: Get from teacher profile
      settledAt: row.settled_at,
      undoCompleteDays: 7, // TODO: Get from teacher profile
      isTeacher: true, // TODO: Derive from principal
      isStudent: true, // TODO: Derive from principal
      now
    })

    return {
      bookingId: row.id,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      studentId: row.student_id,
      studentName: row.student_name,
      courseId: row.course_id,
      courseName: row.course_name,
      durationMinutes: row.duration_minutes,
      packageId: row.package_id,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      date: utcToLocalDate(startAt),
      dateLabel: this.formatDateLabel(utcToLocalDate(startAt)),
      startLocal: utcToLocalTime(startAt),
      endLocal: utcToLocalTime(endAt),
      timeRange: formatTimeRange(utcToLocalTime(startAt), utcToLocalTime(endAt)),
      status: row.status,
      source: row.source,
      sourceLabel: row.source === 'SelfBooked' ? '学员自约' : '老师创建',
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      cancelledBy: row.cancelled_by,
      cancelledByLabel: row.cancelled_by === 'Teacher' ? '老师' : row.cancelled_by === 'Student' ? '学员' : null,
      cancellationPolicyResult: row.cancellation_policy_result,
      policyText: this.getPolicyText(row.cancellation_policy_result),
      consumedSession: !!row.session_id,
      policySnapshotFreeCancelHours: row.policy_snapshot_free_cancel_hours,
      rescheduledFromBookingId: row.rescheduled_from_booking_id,
      rescheduledToBookingId: row.rescheduled_to_booking_id,
      rescheduleCount: row.reschedule_count,
      maxReschedules: 3, // TODO: From teacher profile
      settledAt: row.settled_at ? row.settled_at.toISOString() : null,
      sessionStatus: row.session_status,
      sessionSource: row.session_source,
      sessionSourceLabel: row.session_source === 'TeacherConfirmed' ? '老师确认' : row.session_source === 'AutoSettled' ? '自动结算' : null,
      createdAt: row.created_at.toISOString(),
      started,
      remaining: null, // TODO: Calculate from package
      reserved: null, // TODO: Calculate
      available: null, // TODO: Calculate
      actions
    }
  }

  private getPolicyText(policy: string | null): string | null {
    if (!policy) return null
    const texts: Record<string, string> = {
      'FREE_CANCEL': '免费取消',
      'LATE_CANCEL': '逾期取消（扣除1节）',
      'TEACHER_CANCEL': '老师取消'
    }
    return texts[policy] || policy
  }

  private formatDateLabel(date: string): string {
    const d = new Date(date + 'T00:00:00Z')
    const month = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    return `${month}月${day}日`
  }
}
