/**
 * Critical regression test for package transaction balance logic
 * 
 * This test verifies Invariant I4 and the REVERSAL transaction type.
 * 
 * Regression scenario (docs/mvp.md §5.3, docs/data-model.md §2.1):
 * 10/10 → SESSION_COMPLETED → 9/10 → REVERSAL → 10/10
 * 
 * CRITICAL: REVERSAL must NOT increment purchased_sessions
 * If implemented incorrectly as `purchased += GREATEST(amount, 0)`,
 * it would produce 11/10 instead of 10/10.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { getPool, closePool } from '../../src/db/connection.js'

describe('Package Transaction Regression: REVERSAL', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = getPool()
    
    // Ensure database is migrated
    // In real tests, this would be handled by test setup
  })

  afterAll(async () => {
    await closePool()
  })

  test('10/10 → complete → 9/10 → reversal → 10/10 (NOT 11/10)', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Create test data
      // 1. Create user
      const { rows: [user] } = await client.query(
        `INSERT INTO app_user (nickname) VALUES ('Test User') RETURNING id`
      )

      // 2. Create teacher
      const { rows: [teacher] } = await client.query(
        `INSERT INTO teacher_profile (user_id, name) VALUES ($1, 'Test Teacher') RETURNING id`,
        [user.id]
      )

      // 3. Create student
      const { rows: [student] } = await client.query(
        `INSERT INTO student (teacher_id, name) VALUES ($1, 'Test Student') RETURNING id`,
        [teacher.id]
      )

      // 4. Create course
      const { rows: [course] } = await client.query(
        `INSERT INTO course (teacher_id, name, duration_minutes) 
         VALUES ($1, 'Test Course', 60) RETURNING id`,
        [teacher.id]
      )

      // 5. Create package with 10/10 sessions
      const { rows: [pkg] } = await client.query(
        `INSERT INTO lesson_package 
         (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
         VALUES ($1, $2, $3, 10, 10) RETURNING id`,
        [teacher.id, student.id, course.id]
      )

      // Initial state: 10/10
      let { rows: [state] } = await client.query(
        `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
        [pkg.id]
      )
      expect(state.purchased_sessions).toBe(10)
      expect(state.remaining_sessions).toBe(10)

      // Step 1: Create booking
      const { rows: [booking] } = await client.query(
        `INSERT INTO booking 
         (teacher_id, student_id, course_id, package_id, start_at, end_at, 
          policy_snapshot_free_cancel_hours, source)
         VALUES ($1, $2, $3, $4, now() + interval '1 hour', now() + interval '2 hours', 
                 24, 'SelfBooked')
         RETURNING id`,
        [teacher.id, student.id, course.id, pkg.id]
      )

      // Step 2: SESSION_COMPLETED (-1)
      await client.query(
        `SELECT * FROM apply_package_transaction($1, 'SESSION_COMPLETED', -1, $2, NULL, NULL, $3, NULL)`,
        [pkg.id, booking.id, user.id]
      )

      // After completion: 10/9
      state = (await client.query(
        `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
        [pkg.id]
      )).rows[0]
      expect(state.purchased_sessions).toBe(10)
      expect(state.remaining_sessions).toBe(9)

      // Create session
      const { rows: [session] } = await client.query(
        `INSERT INTO lesson_session 
         (booking_id, teacher_id, student_id, course_id, package_id, completed_at, source)
         VALUES ($1, $2, $3, $4, $5, now(), 'TeacherConfirmed')
         RETURNING id`,
        [booking.id, teacher.id, student.id, course.id, pkg.id]
      )

      // Step 3: REVERSAL (+1)
      // THIS IS THE CRITICAL TEST: must return to 10/10, NOT 11/10
      await client.query(
        `SELECT * FROM apply_package_transaction($1, 'REVERSAL', 1, $2, $3, 'Undo completion', $4, NULL)`,
        [pkg.id, booking.id, session.id, user.id]
      )

      // After reversal: MUST be 10/10 (NOT 11/10)
      state = (await client.query(
        `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
        [pkg.id]
      )).rows[0]
      
      // CRITICAL ASSERTIONS
      expect(state.purchased_sessions).toBe(10) // Must stay 10, NOT become 11
      expect(state.remaining_sessions).toBe(10) // Must return to 10

      // Verify transaction ledger
      const { rows: transactions } = await client.query(
        `SELECT type, amount, before_sessions, after_sessions, booking_id, session_id
         FROM package_transaction
         WHERE package_id = $1
         ORDER BY created_at, id`,
        [pkg.id]
      )

      expect(transactions).toHaveLength(2)
      
      // Find transactions by type (order-independent)
      const sessionCompleted = transactions.find(t => t.type === 'SESSION_COMPLETED')
      const reversal = transactions.find(t => t.type === 'REVERSAL')
      
      // Verify SESSION_COMPLETED
      expect(sessionCompleted).toBeDefined()
      expect(sessionCompleted!.amount).toBe(-1)
      expect(sessionCompleted!.before_sessions).toBe(10)
      expect(sessionCompleted!.after_sessions).toBe(9)
      expect(sessionCompleted!.booking_id).toBe(booking.id)
      
      // Verify REVERSAL
      expect(reversal).toBeDefined()
      expect(reversal!.amount).toBe(1)
      expect(reversal!.before_sessions).toBe(9)
      expect(reversal!.after_sessions).toBe(10)
      expect(reversal!.booking_id).toBe(booking.id)
      expect(reversal!.session_id).toBe(session.id)

      await client.query('ROLLBACK') // Clean up
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

  test('REVERSAL must have positive amount', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Create minimal test data
      const { rows: [user] } = await client.query(
        `INSERT INTO app_user (nickname) VALUES ('Test') RETURNING id`
      )
      const { rows: [teacher] } = await client.query(
        `INSERT INTO teacher_profile (user_id, name) VALUES ($1, 'Teacher') RETURNING id`,
        [user.id]
      )
      const { rows: [student] } = await client.query(
        `INSERT INTO student (teacher_id, name) VALUES ($1, 'Student') RETURNING id`,
        [teacher.id]
      )
      const { rows: [course] } = await client.query(
        `INSERT INTO course (teacher_id, name, duration_minutes) VALUES ($1, 'Course', 60) RETURNING id`,
        [teacher.id]
      )
      const { rows: [pkg] } = await client.query(
        `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
         VALUES ($1, $2, $3, 10, 9) RETURNING id`,
        [teacher.id, student.id, course.id]
      )

      // Try REVERSAL with negative amount (should fail)
      await expect(
        client.query(
          `SELECT * FROM apply_package_transaction($1, 'REVERSAL', -1, NULL, NULL, NULL, $2, NULL)`,
          [pkg.id, user.id]
        )
      ).rejects.toThrow(/positive amount/)

      await client.query('ROLLBACK')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

  test('REVERSAL does not modify purchased_sessions', async () => {
    // This is essentially the same as the first test, but with explicit focus
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Setup
      const { rows: [user] } = await client.query(
        `INSERT INTO app_user (nickname) VALUES ('Test') RETURNING id`
      )
      const { rows: [teacher] } = await client.query(
        `INSERT INTO teacher_profile (user_id, name) VALUES ($1, 'Teacher') RETURNING id`,
        [user.id]
      )
      const { rows: [student] } = await client.query(
        `INSERT INTO student (teacher_id, name) VALUES ($1, 'Student') RETURNING id`,
        [teacher.id]
      )
      const { rows: [course] } = await client.query(
        `INSERT INTO course (teacher_id, name, duration_minutes) VALUES ($1, 'Course', 60) RETURNING id`,
        [teacher.id]
      )
      const { rows: [pkg] } = await client.query(
        `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
         VALUES ($1, $2, $3, 20, 15) RETURNING id`,
        [teacher.id, student.id, course.id]
      )

      const initialPurchased = 20

      // Execute REVERSAL
      await client.query(
        `SELECT * FROM apply_package_transaction($1, 'REVERSAL', 1, NULL, NULL, 'Test reversal', $2, NULL)`,
        [pkg.id, user.id]
      )

      // Verify purchased_sessions unchanged
      const { rows: [state] } = await client.query(
        `SELECT purchased_sessions, remaining_sessions FROM lesson_package WHERE id = $1`,
        [pkg.id]
      )

      expect(state.purchased_sessions).toBe(initialPurchased) // MUST NOT change
      expect(state.remaining_sessions).toBe(16) // 15 + 1

      await client.query('ROLLBACK')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
})
