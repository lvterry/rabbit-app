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
import type { AvailabilityRepository } from '../../ports/AvailabilityRepository.js'
import {
  computeBookingActions,
  determineCancellationPolicy,
  determineReschedulePolicy,
  shouldAutoSettle,
  isPendingSettlement,
  utcToLocalDate,
  utcToLocalTime,
  formatTimeRange,
  isValidSlot,
  getLocalWeekday,
} from '../../domain/index.js'

export class BookingRepositoryImpl implements BookingRepository {
  constructor(
    private pool: Pool,
    private availabilityRepo?: AvailabilityRepository
  ) {}

  /**
   * P0 #4: Check if principal is authorized to act on this booking
   * Must match either teacher_id OR student_id
   */
  private async checkBookingAuthorization(
    booking: any,
    principal: Principal
  ): Promise<void> {
    // Check if principal can act as teacher for this booking
    if (principal.kind === 'User' && principal.userId) {
      const { rows: [teacher] } = await this.pool.query(
        `SELECT id FROM teacher_profile WHERE user_id = $1 AND id = $2`,
        [principal.userId, booking.teacher_id]
      )
      if (teacher) {
        return // Authorized as teacher
      }
    }

    // Check if principal can act as student for this booking
    if (principal.kind === 'Student' && principal.studentId === booking.student_id) {
      return // Authorized as student
    }

    // Check if User principal is bound to this booking's student
    if (principal.kind === 'User' && principal.userId) {
      const { rows: [student] } = await this.pool.query(
        `SELECT id FROM student WHERE id = $1 AND user_id = $2`,
        [booking.student_id, principal.userId]
      )
      if (student) {
        return // Authorized as student's user
      }
    }

    // Not authorized
    throw new Error('FORBIDDEN')
  }

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
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
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
      // P0 #3: Self-booked sessions must pass same validation as GET /slots (L1/L2)
      // For teacher creating, skip slot validation (docs/mvp.md §7.4)
      if (source === 'SelfBooked') {
        if (!this.availabilityRepo) {
          throw new Error('AvailabilityRepository required for self-booking validation')
        }

        // Check course allows self-booking
        if (!course.allow_self_booking) {
          throw new Error('SELF_BOOKING_DISABLED')
        }

        // Fetch rules and exceptions for validation
        const localDate = utcToLocalDate(startAt)
        const weekday = getLocalWeekday(new Date(localDate))
        const rules = await this.availabilityRepo.listActiveRulesForWeekday(teacher.id, weekday)
        const exception = await this.availabilityRepo.getExceptionForDate(teacher.id, localDate)
        const exceptions = exception ? [{
          startMinute: exception.startMinute,
          endMinute: exception.endMinute
        }] : []

        // Get existing upcoming bookings (busy intervals)
        const { rows: busyBookings } = await client.query(
          `SELECT start_at, end_at FROM booking
           WHERE teacher_id = $1 AND status = 'Upcoming'`,
          [teacher.id]
        )

        const busy = busyBookings.map((b: any) => ({
          startAt: b.start_at,
          endAt: b.end_at
        }))

        // Validate using same algorithm as L1/L2
        const isValid = isValidSlot(startAt, {
          date: localDate,
          rules: rules.map(r => ({
            startMinute: r.startMinute,
            endMinute: r.endMinute
          })),
          exceptions,
          busy,
          durationMinutes: course.duration_minutes,
          stepMinutes: teacher.slot_step_minutes,
          minLeadHours: teacher.min_lead_hours,
          maxAdvanceDays: teacher.max_advance_days,
          timezone: 'Asia/Shanghai',
          now: new Date()
        })

        if (!isValid) {
          // Determine specific error code based on validation failure
          // Check if in exception
          if (exception) {
            const startMinute = startAt.getUTCHours() * 60 + startAt.getUTCMinutes()
            if (exception.startMinute === null || 
                (startMinute >= exception.startMinute && startMinute < exception.endMinute!)) {
              throw new Error('SLOT_IN_EXCEPTION')
            }
          }

          // Check min lead hours
          const now = new Date()
          const minStartTime = new Date(now.getTime() + teacher.min_lead_hours * 60 * 60 * 1000)
          if (startAt < minStartTime) {
            throw new Error('SLOT_TOO_SOON')
          }

          // Check max advance days
          const maxStartTime = new Date(now.getTime() + teacher.max_advance_days * 24 * 60 * 60 * 1000)
          if (startAt > maxStartTime) {
            throw new Error('SLOT_TOO_FAR')
          }

          // Check if outside availability
          if (rules.length === 0) {
            throw new Error('SLOT_OUTSIDE_AVAILABILITY')
          }

          // Otherwise generic validation failure
          throw new Error('SLOT_TAKEN')
        }
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

      // Step 9: Record idempotency (P0 #5: with SHA-256 hash from middleware)
      const finalEndpoint = endpoint || 'POST /v1/bookings'
      const finalRequestHash = requestHash || (() => {
        const crypto = require('crypto')
        return crypto.createHash('sha256')
          .update(JSON.stringify({ courseId: data.courseId, startAt: data.startAt, studentId: data.studentId }))
          .digest('hex')
      })()
      
      // Use INSERT ... ON CONFLICT DO NOTHING for idempotency
      // The unique indexes handle the conflict detection
      try {
        await client.query(
          `INSERT INTO idempotency_record (
            user_id, student_id, idempotency_key, endpoint,
            request_hash, response_status, response_body, state
          ) VALUES ($1, $2, $3, $4, $5, 201, $6, 'Succeeded')`,
          [
            principal.userId,
            principal.studentId,
            idempotencyKey,
            finalEndpoint,
            finalRequestHash,
            JSON.stringify({ ok: true, data: { bookingId: booking.id } })
          ]
        )
      } catch (idemError: any) {
        // Conflict is OK (race condition), middleware will handle replay
        if (idemError.code !== '23505') {
          throw idemError
        }
      }

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
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
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

      // P0 #4: Check authorization before mutating
      await this.checkBookingAuthorization(booking, principal)

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

      // P0 #5: Record idempotency success (use middleware values)
      const finalEndpoint = endpoint || `POST /v1/bookings/${bookingId}/completion`
      const finalRequestHash = requestHash || (() => {
        const crypto = require('crypto')
        return crypto.createHash('sha256')
          .update(JSON.stringify({ bookingId }))
          .digest('hex')
      })()
      
      try {
        await client.query(
          `INSERT INTO idempotency_record (
            user_id, student_id, idempotency_key, endpoint,
            request_hash, response_status, response_body, state
          ) VALUES ($1, $2, $3, $4, $5, 200, $6, 'Succeeded')`,
          [
            principal.userId,
            principal.studentId,
            idempotencyKey,
            finalEndpoint,
            finalRequestHash,
            JSON.stringify({ ok: true, data: { bookingId } })
          ]
        )
      } catch (idemError: any) {
        if (idemError.code !== '23505') throw idemError
      }

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
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
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

      // P0 #4: Check authorization before mutating
      await this.checkBookingAuthorization(booking, principal)

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

      // P0 #5: Record idempotency success (use middleware values)
      const finalEndpoint = endpoint || `DELETE /v1/bookings/${bookingId}/completion`
      const finalRequestHash = requestHash || (() => {
        const crypto = require('crypto')
        return crypto.createHash('sha256')
          .update(JSON.stringify({ bookingId }))
          .digest('hex')
      })()
      
      try {
        await client.query(
          `INSERT INTO idempotency_record (
            user_id, student_id, idempotency_key, endpoint,
            request_hash, response_status, response_body, state
          ) VALUES ($1, $2, $3, $4, $5, 200, $6, 'Succeeded')`,
          [
            principal.userId,
            principal.studentId,
            idempotencyKey,
            finalEndpoint,
            finalRequestHash,
            JSON.stringify({ ok: true, data: { bookingId } })
          ]
        )
      } catch (idemError: any) {
        if (idemError.code !== '23505') throw idemError
      }

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
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
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

      // P0 #4: Check authorization before mutating
      await this.checkBookingAuthorization(booking, principal)

      if (booking.status !== 'Upcoming') {
        throw new Error('BOOKING_NOT_UPCOMING')
      }

      // Determine who is canceling (auth-model.md: teacher is capability, not identity)
      let cancelledBy: 'Teacher' | 'Student' = 'Student'
      
      if (principal.kind === 'User') {
        // Check actual teacher capability via teacher_profile lookup
        const { rows: [teacherProfile] } = await client.query(
          `SELECT id FROM teacher_profile 
           WHERE user_id = $1 AND status = 'Active'`,
          [principal.userId]
        )
        cancelledBy = teacherProfile ? 'Teacher' : 'Student'
      }

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

      // P0 #5: Record idempotency success (use middleware values)
      const finalEndpoint = endpoint || `POST /v1/bookings/${bookingId}/cancellation`
      const finalRequestHash = requestHash || (() => {
        const crypto = require('crypto')
        return crypto.createHash('sha256')
          .update(JSON.stringify({ bookingId }))
          .digest('hex')
      })()
      
      try {
        await client.query(
          `INSERT INTO idempotency_record (
            user_id, student_id, idempotency_key, endpoint,
            request_hash, response_status, response_body, state
          ) VALUES ($1, $2, $3, $4, $5, 200, $6, 'Succeeded')`,
          [
            principal.userId,
            principal.studentId,
            idempotencyKey,
            finalEndpoint,
            finalRequestHash,
            JSON.stringify({ ok: true, data: { bookingId } })
          ]
        )
      } catch (idemError: any) {
        if (idemError.code !== '23505') throw idemError
      }

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

  /**
   * P0 #6: Reschedule rewrite per docs/data-model.md §5.5 and docs/mvp.md §10.7
   * 
   * Key changes:
   * - maxReschedules only for student-initiated (teacher unlimited)
   * - L3 slot validation on new time
   * - Proper late vs free (freeCancelHours from old start_at)
   * - Late: available>=2, FIFO for both transactions
   * - Free: available>=1, FIFO for new booking only
   * - Cancel old + create new + link + course join for durationMinutes
   */
  async reschedule(
    bookingId: string,
    data: RescheduleBookingRequest,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
  ): Promise<BookingView> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Get old booking with course join for durationMinutes
      const { rows: [oldBooking] } = await client.query(
        `SELECT b.*, tp.max_reschedules, tp.free_cancel_hours, 
                tp.slot_step_minutes, tp.min_lead_hours, tp.max_advance_days,
                c.duration_minutes, c.allow_self_booking
         FROM booking b
         JOIN teacher_profile tp ON tp.id = b.teacher_id
         JOIN course c ON c.id = b.course_id
         WHERE b.id = $1
         FOR UPDATE`,
        [bookingId]
      )

      if (!oldBooking) {
        throw new Error('Booking not found')
      }

      // P0 #4: Check authorization before mutating
      await this.checkBookingAuthorization(oldBooking, principal)

      if (oldBooking.status !== 'Upcoming') {
        throw new Error('BOOKING_NOT_UPCOMING')
      }

      // Determine if teacher-initiated (teachers have unlimited reschedules)
      let cancelledBy: 'Teacher' | 'Student' = 'Student'
      let isTeacher = false
      
      if (principal.kind === 'User' && principal.userId) {
        const { rows: [teacherProfile] } = await client.query(
          `SELECT id FROM teacher_profile 
           WHERE user_id = $1 AND id = $2`,
          [principal.userId, oldBooking.teacher_id]
        )
        isTeacher = !!teacherProfile
        cancelledBy = isTeacher ? 'Teacher' : 'Student'
      }

      // P0 #6: Check reschedule limit ONLY for student-initiated
      if (!isTeacher && oldBooking.reschedule_count >= oldBooking.max_reschedules) {
        throw new Error('RESCHEDULE_LIMIT_REACHED')
      }

      // P0 #6: Validate new slot using L3 validation (same as self-book)
      const newStartAt = new Date(data.newStartAt)
      const newEndAt = new Date(newStartAt.getTime() + oldBooking.duration_minutes * 60 * 1000)

      if (this.availabilityRepo) {
        const localDate = utcToLocalDate(newStartAt)
        const weekday = getLocalWeekday(new Date(localDate))
        const rules = await this.availabilityRepo.listActiveRulesForWeekday(oldBooking.teacher_id, weekday)
        const exception = await this.availabilityRepo.getExceptionForDate(oldBooking.teacher_id, localDate)
        const exceptions = exception ? [{
          startMinute: exception.startMinute,
          endMinute: exception.endMinute
        }] : []

        const { rows: busyBookings } = await client.query(
          `SELECT start_at, end_at FROM booking
           WHERE teacher_id = $1 AND status = 'Upcoming' AND id != $2`,
          [oldBooking.teacher_id, bookingId]
        )

        const busy = busyBookings.map((b: any) => ({
          startAt: b.start_at,
          endAt: b.end_at
        }))

        const isValid = isValidSlot(newStartAt, {
          date: localDate,
          rules: rules.map(r => ({ startMinute: r.startMinute, endMinute: r.endMinute })),
          exceptions,
          busy,
          durationMinutes: oldBooking.duration_minutes,
          stepMinutes: oldBooking.slot_step_minutes,
          minLeadHours: oldBooking.min_lead_hours,
          maxAdvanceDays: oldBooking.max_advance_days,
          timezone: 'Asia/Shanghai',
          now: new Date()
        })

        if (!isValid) {
          if (exception) {
            throw new Error('SLOT_IN_EXCEPTION')
          }
          const now = new Date()
          const minStartTime = new Date(now.getTime() + oldBooking.min_lead_hours * 60 * 60 * 1000)
          if (newStartAt < minStartTime) {
            throw new Error('SLOT_TOO_SOON')
          }
          throw new Error('SLOT_TAKEN')
        }
      }

      // Determine policy: late vs free based on freeCancelHours from old start_at
      const policy = determineReschedulePolicy({
        startAt: new Date(oldBooking.start_at),
        freeCancelHours: oldBooking.policy_snapshot_free_cancel_hours,
        cancelledBy,
        now: new Date(),
        hasStarted: new Date() >= new Date(oldBooking.start_at)
      })

      // P0 #6: Late reschedule needs available>=2; free needs >=1
      const requiredSessions = policy === 'LATE_CANCEL' ? 2 : 1

      // Lock student for critical section
      await client.query(
        `SELECT id FROM student WHERE id = $1 FOR UPDATE`,
        [oldBooking.student_id]
      )

      // Get packages with locks (FIFO)
      const { rows: packages } = await client.query(
        `SELECT id, remaining_sessions, created_at
         FROM lesson_package
         WHERE student_id = $1 AND course_id = $2 AND status = 'Active'
         ORDER BY created_at ASC
         FOR UPDATE`,
        [oldBooking.student_id, oldBooking.course_id]
      )

      const totalRemaining = packages.reduce((sum: number, p: any) => sum + p.remaining_sessions, 0)

      const { rows: [{ reserved_count }] } = await client.query(
        `SELECT COUNT(*) as reserved_count
         FROM booking
         WHERE student_id = $1 AND course_id = $2 AND status = 'Upcoming' AND id != $3`,
        [oldBooking.student_id, oldBooking.course_id, bookingId]
      )

      const available = totalRemaining - parseInt(reserved_count, 10)

      if (available < requiredSessions) {
        throw new Error('LATE_RESCHEDULE_INSUFFICIENT')
      }

      // P0 #6: Cancel old booking with optional LATE_CANCEL transaction
      if (policy === 'LATE_CANCEL') {
        // Use FIFO package for late cancel penalty
        const penaltyPkg = packages.find((p: any) => p.remaining_sessions > 0)
        if (!penaltyPkg) {
          throw new Error('INSUFFICIENT_SESSIONS')
        }

        await client.query(
          `SELECT * FROM apply_package_transaction(
            $1, 'LATE_CANCEL', -1, $2, NULL, 'Late reschedule penalty', $3, $4
          )`,
          [penaltyPkg.id, oldBooking.id, principal.userId, principal.studentId]
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

      // P0 #6: Create new booking with FIFO package selection
      // Refresh packages after late cancel consumed one
      const { rows: refreshedPackages } = await client.query(
        `SELECT id, remaining_sessions
         FROM lesson_package
         WHERE student_id = $1 AND course_id = $2 AND status = 'Active'
         ORDER BY created_at ASC`,
        [oldBooking.student_id, oldBooking.course_id]
      )

      const newPackage = refreshedPackages.find((p: any) => p.remaining_sessions > 0)
      if (!newPackage) {
        throw new Error('INSUFFICIENT_SESSIONS')
      }

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
          newPackage.id,
          newStartAt,
          newEndAt,
          oldBooking.policy_snapshot_free_cancel_hours,
          oldBooking.source,
          idempotencyKey,
          oldBooking.id,
          oldBooking.reschedule_count + 1
        ]
      )

      // Link bookings
      await client.query(
        `UPDATE booking SET rescheduled_to_booking_id = $1 WHERE id = $2`,
        [newBooking.id, bookingId]
      )

      // P0 #5: Record idempotency success (use middleware values)
      const finalEndpoint = endpoint || `POST /v1/bookings/${bookingId}/reschedule`
      const finalRequestHash = requestHash || (() => {
        const crypto = require('crypto')
        return crypto.createHash('sha256')
          .update(JSON.stringify({ bookingId, newStartAt: data.newStartAt }))
          .digest('hex')
      })()
      
      try {
        await client.query(
          `INSERT INTO idempotency_record (
            user_id, student_id, idempotency_key, endpoint,
            request_hash, response_status, response_body, state
          ) VALUES ($1, $2, $3, $4, $5, 200, $6, 'Succeeded')`,
          [
            principal.userId,
            principal.studentId,
            idempotencyKey,
            finalEndpoint,
            finalRequestHash,
            JSON.stringify({ ok: true, data: { bookingId: newBooking.id } })
          ]
        )
      } catch (idemError: any) {
        if (idemError.code !== '23505') throw idemError
      }

      await client.query('COMMIT')

      // P0 #6: Response includes durationMinutes via course join
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
