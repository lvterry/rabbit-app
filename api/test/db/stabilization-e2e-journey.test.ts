/**
 * Stabilization E2E Journey Test
 * 
 * Real Postgres + Real HTTP layer end-to-end journey test
 * 
 * Authority: docs/wave1-stabilization-e2e.md (E2E Exit Gate)
 *            docs/wave1-stabilization.md (Wave 1 backend P0s)
 * 
 * Journey coverage (per E2E doc §Journey):
 * 1. Teacher creates student + invite (seeded)
 * 2. Student accepts invite (gets session)
 * 3. Student views home (frozen shape: { cards, bound })
 * 4. Student self-books TWO sessions
 * 5. Student cancels one booking (early cancel, no LATE_CANCEL)
 * 6. On the other booking: teacher reschedules → teacher completes → teacher undoes → complete again
 * 
 * Accounting Assertions (per E2E doc §Accounting Assertions):
 * - Package create: 0/0 until PACKAGE_CREATED mutates balance
 * - Self-book / Free reschedule: Reserve-only (no ledger entry, remaining_sessions unchanged)
 * - Late cancel/reschedule: LATE_CANCEL ledger entry (balance decrements)
 * - Free cancel: No ledger entry (remaining_sessions unchanged)
 * - Complete: SESSION_COMPLETED −1 (balance decrements)
 * - Undo: Restores balance appropriately (REVERSAL or SESSION_VOIDED)
 * - Undo then complete-again: Two lesson_session rows (Voided + Active, no column UNIQUE constraint)
 * - Idempotency: Replay with same key+body returns same result without double-mutation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import supertest from 'supertest'
import { randomUUID } from 'crypto'
import { createRealApp } from '../helpers/realApp'

const { Pool } = pg

let pool: Pool
let request: supertest.SuperTest<supertest.Test>

// Test data IDs
let userId: string
let teacherId: string
let studentId: string
let courseId: string
let packageId: string
let inviteToken: string
let studentAccessToken: string
let teacherAccessToken: string
let completeIdempotencyKey: string // For test 8 & 9 idempotency replay

// Availability slot times (relative to "now" for self-bookable slots)
const slotStartOffsetHours = 500 // Far enough to avoid any conflicts with other tests

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set for E2E tests')
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  // Create app with real repositories
  const app = createRealApp(pool)
  request = supertest(app)

  // Seed test data
  await seedTestData()
})

afterAll(async () => {
  // Cleanup
  if (pool) {
    await pool.query('DELETE FROM booking WHERE student_id = $1', [studentId])
    await pool.query('DELETE FROM package_transaction WHERE package_id = $1', [packageId])
    await pool.query('DELETE FROM lesson_package WHERE id = $1', [packageId])
    await pool.query('DELETE FROM student WHERE id = $1', [studentId])
    await pool.query('DELETE FROM availability_rule WHERE teacher_id = $1', [teacherId])
    await pool.query('DELETE FROM course WHERE id = $1', [courseId])
    await pool.query('DELETE FROM teacher_profile WHERE id = $1', [teacherId])
    await pool.query('DELETE FROM app_user WHERE id = $1', [userId])
    await pool.end()
  }
})

/**
 * Seed test data: teacher, student, course, availability, package
 */
async function seedTestData() {
  // 1. Create user + teacher profile
  const userResult = await pool.query(
    `INSERT INTO app_user (nickname) VALUES ('E2E Teacher') RETURNING id`
  )
  userId = userResult.rows[0].id

  const teacherResult = await pool.query(
    `INSERT INTO teacher_profile (user_id, name, timezone, min_lead_hours, free_cancel_hours)
     VALUES ($1, 'E2E Teacher', 'Asia/Shanghai', 2, 24)
     RETURNING id`,
    [userId]
  )
  teacherId = teacherResult.rows[0].id

  // 2. Create course (60min, self-bookable)
  const courseResult = await pool.query(
    `INSERT INTO course (teacher_id, name, duration_minutes, allow_self_booking)
     VALUES ($1, 'E2E Course', 60, true)
     RETURNING id`,
    [teacherId]
  )
  courseId = courseResult.rows[0].id

  // 3. Create availability rule (all day, every day for next week)
  // Weekday 1 (Monday) - students can book slots starting 48h from now
  await pool.query(
    `INSERT INTO availability_rule (teacher_id, weekday, start_minute, end_minute)
     VALUES ($1, 1, 480, 1200), ($1, 2, 480, 1200), ($1, 3, 480, 1200),
            ($1, 4, 480, 1200), ($1, 5, 480, 1200), ($1, 6, 480, 1200), ($1, 7, 480, 1200)`,
    [teacherId]
  )

  // 4. Create student with Active package (5 sessions remaining)
  const studentResult = await pool.query(
    `INSERT INTO student (teacher_id, name, status)
     VALUES ($1, 'E2E Student', 'Active')
     RETURNING id`,
    [teacherId]
  )
  studentId = studentResult.rows[0].id

  // 5. Create package with PACKAGE_CREATED transaction via apply_package_transaction
  const packageResult = await pool.query(
    `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
     VALUES ($1, $2, $3, 0, 0)
     RETURNING id`,
    [teacherId, studentId, courseId]
  )
  packageId = packageResult.rows[0].id

  // Apply PACKAGE_CREATED transaction (+5 sessions)
  await pool.query(
    `SELECT * FROM apply_package_transaction($1, 'PACKAGE_CREATED', 5, NULL, NULL, 'Initial package', NULL, NULL)`,
    [packageId]
  )

  // 6. Create invite token for student
  const inviteResult = await pool.query(
    `INSERT INTO student_invite (teacher_id, student_id, token, status, expires_at)
     VALUES ($1, $2, $3, 'Pending', now() + interval '7 days')
     RETURNING token`,
    [teacherId, studentId, `e2e-invite-${Date.now()}`]
  )
  inviteToken = inviteResult.rows[0].token

  // 7. Generate teacher access token for teacher-initiated operations
  // Use dev auth endpoint with seeded teacherId to ensure correct ownership
  const teacherAuthRes = await request
    .post('/v1/auth/dev/teacher')
    .send({ teacherId })
    .expect(200)

  // Assert teacher auth response matches seeded teacher
  expect(teacherAuthRes.body.data.teacher.teacherId).toBe(teacherId)
  expect(teacherAuthRes.body.data.user.userId).toBe(userId)
  
  teacherAccessToken = teacherAuthRes.body.data.accessToken
}

describe('Stabilization E2E Journey (Real Postgres + HTTP)', () => {
  /**
   * Step 1: Student accepts invite
   */
  it('1. Student accepts invite and gets session', async () => {
    const res = await request
      .post(`/v1/invites/${inviteToken}/accept`)
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.studentId).toBe(studentId)
    expect(res.body.data.teacherId).toBe(teacherId)
    expect(res.body.data.accessToken).toBeDefined()
    // Note: refreshToken is NOT in response body (HttpOnly cookie only per docs)

    // Save student access token for subsequent requests
    studentAccessToken = res.body.data.accessToken

    // Verify invite is now Consumed
    const inviteCheck = await pool.query(
      `SELECT status FROM student_invite WHERE token = $1`,
      [inviteToken]
    )
    expect(inviteCheck.rows[0].status).toBe('Consumed')
  })

  /**
   * Step 2: Student views home (frozen shape: { cards, bound })
   * Authority: docs/wave1-stabilization.md §7, docs/wave1-stabilization-e2e.md
   */
  it('2. Student home shows credits in frozen shape { cards, bound }', async () => {
    const res = await request
      .get('/v1/me/student-home')
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .expect(200)

    expect(res.body.ok).toBe(true)
    
    // Assert frozen shape explicitly
    expect(res.body.data).toHaveProperty('cards')
    expect(res.body.data).toHaveProperty('bound')
    
    // Must NOT have old shape properties
    expect(res.body.data).not.toHaveProperty('upcomingBooking')
    expect(res.body.data).not.toHaveProperty('recentBookings')
    expect(res.body.data).not.toHaveProperty('balance')
    
    // Verify cards structure
    const { cards, bound } = res.body.data
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThan(0)
    
    const card = cards[0]
    expect(card.teacherId).toBe(teacherId)
    expect(card.studentId).toBe(studentId)
    expect(card.courses).toBeDefined()
    expect(Array.isArray(card.courses)).toBe(true)
    
    // Verify course shows 5 remaining sessions
    const course = card.courses.find((c: any) => c.courseId === courseId)
    expect(course).toBeDefined()
    expect(course.remaining).toBe(5)
    expect(card.remainingTotal).toBe(5)
  })

  /**
   * Step 3: Student self-books TWO sessions
   */
  it('3. Student self-books two sessions', async () => {
    // Calculate slot times (48h and 96h from now)
    const now = new Date()
    const slot1Start = new Date(now.getTime() + slotStartOffsetHours * 3600 * 1000)
    const slot2Start = new Date(now.getTime() + (slotStartOffsetHours + 48) * 3600 * 1000)

    // Round to next 30-min slot
    slot1Start.setMinutes(Math.ceil(slot1Start.getMinutes() / 30) * 30, 0, 0)
    slot2Start.setMinutes(Math.ceil(slot2Start.getMinutes() / 30) * 30, 0, 0)

    // Booking 1
    const booking1Res = await request
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        courseId,
        startAt: slot1Start.toISOString(),
      })
      .expect(200)

    expect(booking1Res.body.ok).toBe(true)
    const booking1Id = booking1Res.body.data.bookingId
    ; (global as any).booking1Id = booking1Id  // Save for later tests

    // Booking 2
    const booking2Res = await request
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        courseId,
        startAt: slot2Start.toISOString(),
      })
      .expect(200)

    expect(booking2Res.body.ok).toBe(true)
    const booking2Id = booking2Res.body.data.bookingId
    ; (global as any).booking2Id = booking2Id  // Save for later tests

    // Verify bookings in DB
    const bookingsCheck = await pool.query(
      `SELECT id, status FROM booking WHERE student_id = $1 ORDER BY start_at`,
      [studentId]
    )
    expect(bookingsCheck.rows.length).toBe(2)
    expect(bookingsCheck.rows[0].status).toBe('Upcoming')
    expect(bookingsCheck.rows[1].status).toBe('Upcoming')

    // Assert: Self-book is RESERVE-ONLY (per E2E doc §Accounting Assertions)
    // - remaining_sessions unchanged (still 5)
    // - No ledger entry written (no SESSION_COMPLETED, no LATE_CANCEL)
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(5)

    // Verify only PACKAGE_CREATED exists (self-book does NOT write ledger entry)
    const txCheck = await pool.query(
      `SELECT type FROM package_transaction WHERE package_id = $1`,
      [packageId]
    )
    const types = txCheck.rows.map(r => r.type)
    expect(types).toEqual(['PACKAGE_CREATED']) // Only one entry
    expect(types).not.toContain('SESSION_COMPLETED')
    expect(types).not.toContain('LATE_CANCEL')

    // Store booking IDs for next steps
    ;(global as any).booking1Id = booking1Id
    ;(global as any).booking2Id = booking2Id
  })

  /**
   * Step 4: Student cancels booking 1 (early cancel, no LATE_CANCEL)
   * Authority: E2E doc §Accounting Assertions - "Free cancel: No ledger entry"
   */
  it('4. Student cancels booking 1 (early cancel, no LATE_CANCEL)', async () => {
    const booking1Id = (global as any).booking1Id

    const res = await request
      .post(`/v1/bookings/${booking1Id}/cancellation`)
      .set('Authorization', `Bearer ${studentAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Test early cancel',
      })
      .expect(200)

    expect(res.body.ok).toBe(true)
    // Flat response shape per contracts/fixtures/bookings/cancelled-free.json
    expect(res.body.data.status).toBe('Cancelled')
    expect(res.body.data.cancellationPolicyResult).toBe('FREE_CANCEL')
    expect(res.body.data.consumedSession).toBe(false)

    // Verify booking is Cancelled
    const bookingCheck = await pool.query(
      `SELECT status, cancellation_policy_result FROM booking WHERE id = $1`,
      [booking1Id]
    )
    expect(bookingCheck.rows[0].status).toBe('Cancelled')
    expect(bookingCheck.rows[0].cancellation_policy_result).toBe('FREE_CANCEL')

    // Assert: Free cancel has NO ledger entry (per E2E doc)
    const txCheck = await pool.query(
      `SELECT type FROM package_transaction WHERE package_id = $1`,
      [packageId]
    )
    const types = txCheck.rows.map(r => r.type)
    expect(types).toEqual(['PACKAGE_CREATED']) // Still only PACKAGE_CREATED, no LATE_CANCEL
    expect(types).not.toContain('LATE_CANCEL')

    // Assert: remaining_sessions unchanged (still 5)
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(5)
  })

  /**
   * Step 5: Teacher reschedules booking 2 (free reschedule, reserve-only)
   * Authority: E2E doc §Accounting Assertions - "Free reschedule: Reserve only"
   */
  it('5. Teacher reschedules booking 2 (free reschedule, reserve-only)', async () => {
    const booking2Id = (global as any).booking2Id

    // New time (1000h from now - very far to ensure no conflicts)
    const now = new Date()
    const newStart = new Date(now.getTime() + 1000 * 3600 * 1000)
    newStart.setMinutes(Math.ceil(newStart.getMinutes() / 30) * 30, 0, 0)

    const res = await request
      .post(`/v1/bookings/${booking2Id}/reschedule`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        newStartAt: newStart.toISOString(),
      })
      .expect(200)

    expect(res.body.ok).toBe(true)
    const newBookingId = res.body.data.bookingId
    expect(newBookingId).not.toBe(booking2Id)
    
    // Update booking2Id to the new booking for subsequent tests
    ; (global as any).booking2Id = newBookingId

    // Verify old booking is Cancelled, new booking is Upcoming
    const oldBookingCheck = await pool.query(
      `SELECT status FROM booking WHERE id = $1`,
      [booking2Id]
    )
    expect(oldBookingCheck.rows[0].status).toBe('Cancelled')

    const newBookingCheck = await pool.query(
      `SELECT status, rescheduled_from_booking_id FROM booking WHERE id = $1`,
      [newBookingId]
    )
    expect(newBookingCheck.rows[0].status).toBe('Upcoming')
    expect(newBookingCheck.rows[0].rescheduled_from_booking_id).toBe(booking2Id)

    // Assert: Free reschedule is RESERVE-ONLY (per E2E doc)
    // - remaining_sessions unchanged (still 5)
    // - No new ledger entry written
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(5)
    
    // Verify still only PACKAGE_CREATED (no ledger entry for free reschedule)
    const txCheck = await pool.query(
      `SELECT type FROM package_transaction WHERE package_id = $1`,
      [packageId]
    )
    expect(txCheck.rows.map(r => r.type)).toEqual(['PACKAGE_CREATED'])

    // Store new booking ID
    ;(global as any).booking2Id = newBookingId
  })

  /**
   * Step 6: Teacher completes booking 2 (SESSION_COMPLETED −1)
   * Authority: E2E doc §Accounting Assertions - "Complete: SESSION_COMPLETED −1"
   */
  it('6. Teacher completes booking 2 (SESSION_COMPLETED −1)', async () => {
    const booking2Id = (global as any).booking2Id

    const res = await request
      .post(`/v1/bookings/${booking2Id}/completion`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.status).toBe('Completed')

    // Verify booking is Completed
    const bookingCheck = await pool.query(
      `SELECT status FROM booking WHERE id = $1`,
      [booking2Id]
    )
    expect(bookingCheck.rows[0].status).toBe('Completed')

    // Verify SESSION_COMPLETED transaction exists
    const txCheck = await pool.query(
      `SELECT type, amount FROM package_transaction WHERE package_id = $1 AND booking_id = $2`,
      [packageId, booking2Id]
    )
    const sessionCompletedTx = txCheck.rows.find(r => r.type === 'SESSION_COMPLETED')
    expect(sessionCompletedTx).toBeDefined()
    expect(sessionCompletedTx.amount).toBe(-1)

    // Verify remaining_sessions decremented to 4
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(4)

    // Verify lesson_session row exists (Active)
    const sessionCheck = await pool.query(
      `SELECT status FROM lesson_session WHERE booking_id = $1`,
      [booking2Id]
    )
    expect(sessionCheck.rows.length).toBe(1)
    expect(sessionCheck.rows[0].status).toBe('Active')
  })

  /**
   * Step 7: Teacher undoes completion (restores balance)
   * Authority: E2E doc §Accounting Assertions - "Undo: Restores balance appropriately"
   */
  it('7. Teacher undoes completion (restores balance)', async () => {
    const booking2Id = (global as any).booking2Id

    const res = await request
      .delete(`/v1/bookings/${booking2Id}/completion`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200)

    expect(res.body.ok).toBe(true)
    // Flat response shape
    expect(res.body.data.status).toBe('Upcoming')

    // Verify booking is back to Upcoming
    const bookingCheck = await pool.query(
      `SELECT status FROM booking WHERE id = $1`,
      [booking2Id]
    )
    expect(bookingCheck.rows[0].status).toBe('Upcoming')

    // Verify REVERSAL transaction exists
    const txCheck = await pool.query(
      `SELECT type, amount FROM package_transaction WHERE package_id = $1 AND booking_id = $2`,
      [packageId, booking2Id]
    )
    const reversalTx = txCheck.rows.find(r => r.type === 'REVERSAL')
    expect(reversalTx).toBeDefined()
    expect(reversalTx.amount).toBe(1)

    // Verify remaining_sessions back to 5
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(5)

    // Verify old lesson_session is Voided, NOT deleted
    const sessionCheck = await pool.query(
      `SELECT status FROM lesson_session WHERE booking_id = $1 ORDER BY created_at`,
      [booking2Id]
    )
    expect(sessionCheck.rows.length).toBe(1)
    expect(sessionCheck.rows[0].status).toBe('Voided')
  })

  /**
   * Step 8: Teacher completes booking 2 again (no column UNIQUE constraint blocks this)
   * Authority: E2E doc §Accounting Assertions - "Undo then complete-again: Two lesson_session rows"
   */
  it('8. Teacher completes booking 2 again (two lesson_session rows: Voided + Active)', async () => {
    const booking2Id = (global as any).booking2Id

    // Generate idempotency key for step 8 & 9 (will be reused in step 9)
    completeIdempotencyKey = randomUUID()

    const res = await request
      .post(`/v1/bookings/${booking2Id}/completion`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .set('Idempotency-Key', completeIdempotencyKey)
      .send({})
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.status).toBe('Completed')

    // Verify booking is Completed
    const bookingCheck = await pool.query(
      `SELECT status FROM booking WHERE id = $1`,
      [booking2Id]
    )
    expect(bookingCheck.rows[0].status).toBe('Completed')

    // Verify remaining_sessions decremented to 4 again
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(4)

    // Verify TWO lesson_session rows: one Voided, one Active
    const sessionCheck = await pool.query(
      `SELECT status FROM lesson_session WHERE booking_id = $1 ORDER BY created_at`,
      [booking2Id]
    )
    expect(sessionCheck.rows.length).toBe(2)
    expect(sessionCheck.rows[0].status).toBe('Voided')
    expect(sessionCheck.rows[1].status).toBe('Active')

    // This confirms: column-level UNIQUE constraint on booking_id was dropped in Stabilization
    // Only partial unique index WHERE status = 'Active' remains
  })

  /**
   * Step 9: Idempotency replay (same key+body returns same result)
   * Authority: E2E doc §Accounting Assertions - "Idempotency: Replay with same key+body"
   */
  it('9. Idempotency replay returns stored response without double-mutation', async () => {
    const booking2Id = (global as any).booking2Id

    // Replay complete request with same idempotency key
    const res = await request
      .post(`/v1/bookings/${booking2Id}/completion`)
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .set('Idempotency-Key', completeIdempotencyKey) // Same key as step 8
      .send({})
      .expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.status).toBe('Completed')

    // Verify remaining_sessions is STILL 4 (not decremented again)
    const packageCheck = await pool.query(
      `SELECT remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].remaining_sessions).toBe(4)

    // Verify STILL TWO lesson_session rows (not three)
    const sessionCheck = await pool.query(
      `SELECT status FROM lesson_session WHERE booking_id = $1`,
      [booking2Id]
    )
    expect(sessionCheck.rows.length).toBe(2)
  })

  /**
   * Step 10: Final ledger integrity check
   */
  it('10. Final ledger integrity: all transactions accounted for', async () => {
    const txResult = await pool.query(
      `SELECT type, amount FROM package_transaction WHERE package_id = $1 ORDER BY created_at`,
      [packageId]
    )

    const transactions = txResult.rows

    // Expected sequence:
    // 1. PACKAGE_CREATED +5
    // 2. SESSION_COMPLETED -1 (step 6)
    // 3. REVERSAL +1 (step 7)
    // 4. SESSION_COMPLETED -1 (step 8)
    expect(transactions.length).toBe(4)
    expect(transactions[0].type).toBe('PACKAGE_CREATED')
    expect(transactions[0].amount).toBe(5)
    expect(transactions[1].type).toBe('SESSION_COMPLETED')
    expect(transactions[1].amount).toBe(-1)
    expect(transactions[2].type).toBe('REVERSAL')
    expect(transactions[2].amount).toBe(1)
    expect(transactions[3].type).toBe('SESSION_COMPLETED')
    expect(transactions[3].amount).toBe(-1)

    // Final balance: 5 - 1 + 1 - 1 = 4
    const packageCheck = await pool.query(
      `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
      [packageId]
    )
    expect(packageCheck.rows[0].purchased_sessions).toBe(5)
    expect(packageCheck.rows[0].remaining_sessions).toBe(4)
  })
})
