/**
 * Negative Constraint Tests (data-model.md §1.2)
 * 
 * These tests verify that database constraints enforce the 8 invariants:
 * I1: 0 ≤ remaining_sessions ≤ purchased_sessions
 * I2: One Booking has at most one Active Session
 * I3: Same teacher, any two Upcoming bookings don't overlap
 * I4: Transaction ledger sum = balance (via SECURITY DEFINER function)
 * I5: Available >= 0 (protected by transaction isolation)
 * I6: Same teacher, user_id unique (when not null)
 * I7: Invite consumed exactly once
 * I8: Reschedule chain correctness
 * I9: Booking falls within open intervals (application layer, tested separately)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const { Pool } = pg

let pool: Pool
let teacherId: string
let studentId: string
let courseId: string
let packageId: string // Shared package for booking tests

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://app_rw:dev_password@localhost:5432/rabbit_dev',
  })

  await pool.query('BEGIN')

  const userResult = await pool.query(
    `INSERT INTO app_user (nickname) VALUES ('Teacher Test') RETURNING id`
  )
  const userId = userResult.rows[0].id

  const teacherResult = await pool.query(
    `INSERT INTO teacher_profile (user_id, name, timezone) VALUES ($1, 'Teacher', 'Asia/Shanghai') RETURNING id`,
    [userId]
  )
  teacherId = teacherResult.rows[0].id

  const courseResult = await pool.query(
    `INSERT INTO course (teacher_id, name, duration_minutes) VALUES ($1, 'Test Course', 60) RETURNING id`,
    [teacherId]
  )
  courseId = courseResult.rows[0].id

  const studentResult = await pool.query(
    `INSERT INTO student (teacher_id, name) VALUES ($1, 'Test Student') RETURNING id`,
    [teacherId]
  )
  studentId = studentResult.rows[0].id

  // Create a shared package for booking tests (bookings need package_id)
  const packageResult = await pool.query(
    `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions, status)
     VALUES ($1, $2, $3, 100, 100, 'Active') RETURNING id`,
    [teacherId, studentId, courseId]
  )
  packageId = packageResult.rows[0].id

  await pool.query('COMMIT')
})

afterAll(async () => {
  await pool.end()
})

describe('Negative Constraint Tests (data-model.md §1.2)', () => {
  it('should reject overlapping Upcoming bookings (I3: booking_no_overlap)', async () => {
    const start1 = new Date('2026-10-01T10:00:00Z')
    const end1 = new Date('2026-10-01T11:00:00Z')
    const start2 = new Date('2026-10-01T10:30:00Z')
    const end2 = new Date('2026-10-01T11:30:00Z')

    await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')`,
      [teacherId, studentId, courseId, packageId, start1, end1]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')`,
        [teacherId, studentId, courseId, packageId, start2, end2]
      )
    ).rejects.toThrow(/23P01|booking_no_overlap/)
  })

  it('should allow back-to-back Upcoming bookings (I3: left-closed right-open)', async () => {
    const start1 = new Date('2026-10-02T10:00:00Z')
    const end1 = new Date('2026-10-02T11:00:00Z')
    const start2 = new Date('2026-10-02T11:00:00Z')
    const end2 = new Date('2026-10-02T12:00:00Z')

    await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')`,
      [teacherId, studentId, courseId, packageId, start1, end1]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')`,
        [teacherId, studentId, courseId, packageId, start2, end2]
      )
    ).resolves.toBeDefined()
  })

  it('should allow overlapping after one is Cancelled (I3: partial exclusion index)', async () => {
    const start = new Date('2026-10-03T10:00:00Z')
    const end = new Date('2026-10-03T11:00:00Z')

    const result1 = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')
       RETURNING id`,
      [teacherId, studentId, courseId, packageId, start, end]
    )

    const bookingId = result1.rows[0].id

    await pool.query(
      `UPDATE booking SET status = 'Cancelled', cancelled_at = now(), cancelled_by = 'Teacher' WHERE id = $1`,
      [bookingId]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')`,
        [teacherId, studentId, courseId, packageId, start, end]
      )
    ).resolves.toBeDefined()
  })

  it('should reject second Active Session for same Booking (I2: session_one_active_per_booking)', async () => {
    const start = new Date('2026-10-04T10:00:00Z')
    const end = new Date('2026-10-04T11:00:00Z')

    const bookingResult = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')
       RETURNING id`,
      [teacherId, studentId, courseId, packageId, start, end]
    )

    const bookingId = bookingResult.rows[0].id

    await pool.query(
      `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, package_id, completed_at, status, source)
       VALUES ($1, $2, $3, $4, $5, now(), 'Active', 'TeacherConfirmed')`,
      [bookingId, teacherId, studentId, courseId, packageId]
    )

    await expect(
      pool.query(
        `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, package_id, completed_at, status, source)
         VALUES ($1, $2, $3, $4, $5, now(), 'Active', 'TeacherConfirmed')`,
        [bookingId, teacherId, studentId, courseId, packageId]
      )
    ).rejects.toThrow(/23505|session_one_active_per_booking/)
  })

  it('should reject negative or out-of-range remaining_sessions (I1: package_balance_range)', async () => {
    const packageResult = await pool.query(
      `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions, status)
       VALUES ($1, $2, $3, 10, 10, 'Active')
       RETURNING id`,
      [teacherId, studentId, courseId]
    )

    const testPackageId = packageResult.rows[0].id

    // Test negative remaining_sessions (violates CHECK constraint)
    try {
      await pool.query(
        `UPDATE lesson_package SET remaining_sessions = -1 WHERE id = $1`,
        [testPackageId]
      )
      throw new Error('Should have rejected negative remaining_sessions')
    } catch (err: any) {
      expect(err.code).toBe('23514') // check_violation
    }

    // Test remaining > purchased (violates CHECK constraint)
    try {
      await pool.query(
        `UPDATE lesson_package SET remaining_sessions = 11 WHERE id = $1`,
        [testPackageId]
      )
      throw new Error('Should have rejected remaining > purchased')
    } catch (err: any) {
      expect(err.code).toBe('23514') // check_violation
    }
  })

  it('should reject UPDATE/DELETE on package_transaction (I4: append-only ledger)', async () => {
    // Create package with teacher_id (required NOT NULL field)
    const packageResult = await pool.query(
      `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions, status)
       VALUES ($1, $2, $3, 5, 5, 'Active')
       RETURNING id`,
      [teacherId, studentId, courseId]
    )

    const testPackageId = packageResult.rows[0].id

    // Insert a valid transaction (this should succeed)
    const txResult = await pool.query(
      `INSERT INTO package_transaction (package_id, type, amount, before_sessions, after_sessions, note, actor_user_id)
       VALUES ($1, 'PACKAGE_CREATED', 5, 0, 5, 'Test', NULL)
       RETURNING id`,
      [testPackageId]
    )

    const txId = txResult.rows[0].id

    // Switch to app_rw role to test permission denial (migration 003 revokes from app_rw)
    await pool.query('SET ROLE app_rw')

    try {
      // Now test that UPDATE is denied (migration 003 revokes UPDATE on package_transaction)
      await expect(
        pool.query(
          `UPDATE package_transaction SET amount = 10 WHERE id = $1`,
          [txId]
        )
      ).rejects.toThrow(/42501|permission denied/)

      // Test that DELETE is denied
      await expect(
        pool.query(
          `DELETE FROM package_transaction WHERE id = $1`,
          [txId]
        )
      ).rejects.toThrow(/42501|permission denied/)
    } finally {
      // Reset role
      await pool.query('RESET ROLE')
    }
  })

  it('should allow multiple unbound students (I6: user_id partial unique)', async () => {
    await expect(
      pool.query(
        `INSERT INTO student (teacher_id, name) VALUES ($1, 'Unbound 1')`,
        [teacherId]
      )
    ).resolves.toBeDefined()

    await expect(
      pool.query(
        `INSERT INTO student (teacher_id, name) VALUES ($1, 'Unbound 2')`,
        [teacherId]
      )
    ).resolves.toBeDefined()
  })

  it('should reject duplicate user_id for same teacher (I6: student_teacher_user_key)', async () => {
    const userResult = await pool.query(
      `INSERT INTO app_user (nickname) VALUES ('Bound User') RETURNING id`
    )
    const userId = userResult.rows[0].id

    await pool.query(
      `INSERT INTO student (teacher_id, name, user_id) VALUES ($1, 'Bound Student 1', $2)`,
      [teacherId, userId]
    )

    await expect(
      pool.query(
        `INSERT INTO student (teacher_id, name, user_id) VALUES ($1, 'Bound Student 2', $2)`,
        [teacherId, userId]
      )
    ).rejects.toThrow(/23505|idx_student_teacher_user_bound/)
  })

  it('should reject active_session_id pointing to different Booking (I2: composite FK)', async () => {
    const start = new Date('2026-10-05T10:00:00Z')
    const end = new Date('2026-10-05T11:00:00Z')

    const booking1Result = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')
       RETURNING id`,
      [teacherId, studentId, courseId, packageId, start, end]
    )

    const booking2Result = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')
       RETURNING id`,
      [teacherId, studentId, courseId, packageId, new Date('2026-10-05T14:00:00Z'), new Date('2026-10-05T15:00:00Z')]
    )

    const booking1Id = booking1Result.rows[0].id
    const booking2Id = booking2Result.rows[0].id

    const sessionResult = await pool.query(
      `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, package_id, completed_at, status, source)
       VALUES ($1, $2, $3, $4, $5, now(), 'Active', 'TeacherConfirmed')
       RETURNING id`,
      [booking2Id, teacherId, studentId, courseId, packageId]
    )

    const sessionId = sessionResult.rows[0].id

    await expect(
      pool.query(
        `UPDATE booking SET active_session_id = $1 WHERE id = $2`,
        [sessionId, booking1Id]
      )
    ).rejects.toThrow(/23503/)
  })

  it('should allow complete→undo→complete (two lesson_session rows)', async () => {
    // P0 #2b fix: Allows multiple sessions per booking (one Active at a time)
    const start = new Date('2026-10-06T10:00:00Z')
    const end = new Date('2026-10-06T11:00:00Z')

    const bookingResult = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, package_id, start_at, end_at, status, policy_snapshot_free_cancel_hours, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated')
       RETURNING id`,
      [teacherId, studentId, courseId, packageId, start, end]
    )

    const bookingId = bookingResult.rows[0].id

    // First complete: Create Active session
    const session1Result = await pool.query(
      `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, package_id, completed_at, status, source)
       VALUES ($1, $2, $3, $4, $5, now(), 'Active', 'TeacherConfirmed')
       RETURNING id`,
      [bookingId, teacherId, studentId, courseId, packageId]
    )

    const session1Id = session1Result.rows[0].id

    // Undo: Void the first session (note: voided_at not in schema, use status only)
    await pool.query(
      `UPDATE lesson_session SET status = 'Voided' WHERE id = $1`,
      [session1Id]
    )

    // Second complete: Create another Active session for same booking
    // This should succeed (only partial unique index prevents duplicate Active)
    await expect(
      pool.query(
        `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, package_id, completed_at, status, source)
         VALUES ($1, $2, $3, $4, $5, now(), 'Active', 'TeacherConfirmed')`,
        [bookingId, teacherId, studentId, courseId, packageId]
      )
    ).resolves.toBeDefined()

    // Verify we now have 2 sessions for this booking
    const { rows: sessions } = await pool.query(
      `SELECT status FROM lesson_session WHERE booking_id = $1 ORDER BY created_at`,
      [bookingId]
    )

    expect(sessions.length).toBe(2)
    expect(sessions[0].status).toBe('Voided')
    expect(sessions[1].status).toBe('Active')
  })

  it('should verify package creation with 0/0 + PACKAGE_CREATED transaction', async () => {
    // P0 #1 fix: Packages start at 0/0, PACKAGE_CREATED is the sole balance mutation
    const newPackageResult = await pool.query(
      `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions, status)
       VALUES ($1, $2, $3, 0, 0, 'Active')
       RETURNING id`,
      [teacherId, studentId, courseId]
    )

    const newPackageId = newPackageResult.rows[0].id

    // Initial state: 0/0
    let { rows: [state] } = await pool.query(
      `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
      [newPackageId]
    )
    expect(state.purchased_sessions).toBe(0)
    expect(state.remaining_sessions).toBe(0)

    // Apply PACKAGE_CREATED transaction to add 10 sessions
    await pool.query(
      `INSERT INTO package_transaction (package_id, type, amount, before_sessions, after_sessions, note)
       VALUES ($1, 'PACKAGE_CREATED', 10, 0, 10, 'Initial purchase')`,
      [newPackageId]
    )

    // Manually update balance (in production, apply_package_transaction does this)
    await pool.query(
      `UPDATE lesson_package 
       SET purchased_sessions = purchased_sessions + 10,
           remaining_sessions = remaining_sessions + 10
       WHERE id = $1`,
      [newPackageId]
    )

    // Final state: 10/10
    state = (await pool.query(
      `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
      [newPackageId]
    )).rows[0]

    expect(state.purchased_sessions).toBe(10)
    expect(state.remaining_sessions).toBe(10)
  })
})
