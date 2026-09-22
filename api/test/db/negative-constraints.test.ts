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
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')`,
      [teacherId, studentId, courseId, start1, end1]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, 'Upcoming')`,
        [teacherId, studentId, courseId, start2, end2]
      )
    ).rejects.toThrow(/23P01|booking_no_overlap/)
  })

  it('should allow back-to-back Upcoming bookings (I3: left-closed right-open)', async () => {
    const start1 = new Date('2026-10-02T10:00:00Z')
    const end1 = new Date('2026-10-02T11:00:00Z')
    const start2 = new Date('2026-10-02T11:00:00Z')
    const end2 = new Date('2026-10-02T12:00:00Z')

    await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')`,
      [teacherId, studentId, courseId, start1, end1]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, 'Upcoming')`,
        [teacherId, studentId, courseId, start2, end2]
      )
    ).resolves.toBeDefined()
  })

  it('should allow overlapping after one is Cancelled (I3: partial exclusion index)', async () => {
    const start = new Date('2026-10-03T10:00:00Z')
    const end = new Date('2026-10-03T11:00:00Z')

    const result1 = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')
       RETURNING id`,
      [teacherId, studentId, courseId, start, end]
    )

    const bookingId = result1.rows[0].id

    await pool.query(
      `UPDATE booking SET status = 'Cancelled', cancelled_at = now(), cancelled_by = 'Teacher' WHERE id = $1`,
      [bookingId]
    )

    await expect(
      pool.query(
        `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, 'Upcoming')`,
        [teacherId, studentId, courseId, start, end]
      )
    ).resolves.toBeDefined()
  })

  it('should reject second Active Session for same Booking (I2: session_one_active_per_booking)', async () => {
    const start = new Date('2026-10-04T10:00:00Z')
    const end = new Date('2026-10-04T11:00:00Z')

    const bookingResult = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')
       RETURNING id`,
      [teacherId, studentId, courseId, start, end]
    )

    const bookingId = bookingResult.rows[0].id

    await pool.query(
      `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active')`,
      [bookingId, teacherId, studentId, courseId, start, end]
    )

    await expect(
      pool.query(
        `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, start_at, end_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Active')`,
        [bookingId, teacherId, studentId, courseId, start, end]
      )
    ).rejects.toThrow(/23505|session_one_active_per_booking/)
  })

  it('should reject negative or out-of-range remaining_sessions (I1: package_balance_range)', async () => {
    const packageResult = await pool.query(
      `INSERT INTO lesson_package (student_id, course_id, purchased_sessions, remaining_sessions)
       VALUES ($1, $2, 10, 10)
       RETURNING id`,
      [studentId, courseId]
    )

    const packageId = packageResult.rows[0].id

    await expect(
      pool.query(
        `UPDATE lesson_package SET remaining_sessions = -1 WHERE id = $1`,
        [packageId]
      )
    ).rejects.toThrow(/23514/)

    await expect(
      pool.query(
        `UPDATE lesson_package SET remaining_sessions = 11 WHERE id = $1`,
        [packageId]
      )
    ).rejects.toThrow(/23514/)
  })

  it('should reject UPDATE/DELETE on package_transaction (I4: append-only ledger)', async () => {
    const packageResult = await pool.query(
      `INSERT INTO lesson_package (student_id, course_id, purchased_sessions, remaining_sessions)
       VALUES ($1, $2, 5, 5)
       RETURNING id`,
      [studentId, courseId]
    )

    const packageId = packageResult.rows[0].id

    const txResult = await pool.query(
      `INSERT INTO package_transaction (student_id, course_id, lesson_package_id, type, amount, note)
       VALUES ($1, $2, $3, 'PACKAGE_CREATED', 5, 'Test')
       RETURNING id`,
      [studentId, courseId, packageId]
    )

    const txId = txResult.rows[0].id

    await expect(
      pool.query(
        `UPDATE package_transaction SET amount = 10 WHERE id = $1`,
        [txId]
      )
    ).rejects.toThrow(/42501/)

    await expect(
      pool.query(
        `DELETE FROM package_transaction WHERE id = $1`,
        [txId]
      )
    ).rejects.toThrow(/42501/)
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
    ).rejects.toThrow(/23505|student_teacher_user_key/)
  })

  it('should reject active_session_id pointing to different Booking (I2: composite FK)', async () => {
    const start = new Date('2026-10-05T10:00:00Z')
    const end = new Date('2026-10-05T11:00:00Z')

    const booking1Result = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')
       RETURNING id`,
      [teacherId, studentId, courseId, start, end]
    )

    const booking2Result = await pool.query(
      `INSERT INTO booking (teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, 'Upcoming')
       RETURNING id`,
      [teacherId, studentId, courseId, new Date('2026-10-05T14:00:00Z'), new Date('2026-10-05T15:00:00Z')]
    )

    const booking1Id = booking1Result.rows[0].id
    const booking2Id = booking2Result.rows[0].id

    const sessionResult = await pool.query(
      `INSERT INTO lesson_session (booking_id, teacher_id, student_id, course_id, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active')
       RETURNING id`,
      [booking2Id, teacherId, studentId, courseId, start, end]
    )

    const sessionId = sessionResult.rows[0].id

    await expect(
      pool.query(
        `UPDATE booking SET active_session_id = $1 WHERE id = $2`,
        [sessionId, booking1Id]
      )
    ).rejects.toThrow(/23503/)
  })
})
