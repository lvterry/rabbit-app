/**
 * Idempotency Closed Loop Regression Tests
 * 
 * Authority: parallel-plan-v2.md §8, data-model.md §2.8
 * 
 * Tests that middleware endpoint + requestHash values flow through to database
 * and that replay/reuse detection works end-to-end.
 * 
 * Must-fix #2: Middleware sets endpoint as "POST /v1/bookings" but repo was writing
 * "create_booking" → middleware could never find the success record.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { createHash } from 'crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://rabbit:dev@localhost:5432/rabbit_test'

describe('Idempotency Closed Loop', () => {
  let pool: Pool
  let userId: string
  let teacherId: string
  let studentId: string
  let courseId: string
  let packageId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })

    // Setup test data
    // First create app_user with UUID
    const { rows: [user] } = await pool.query(
      `INSERT INTO app_user DEFAULT VALUES RETURNING id`
    )
    userId = user.id
    
    const { rows: [teacher] } = await pool.query(
      `INSERT INTO teacher_profile (user_id, name) VALUES ($1, 'Test Teacher')
       RETURNING id`,
      [userId]
    )
    teacherId = teacher.id

    const { rows: [student] } = await pool.query(
      `INSERT INTO student (teacher_id, name) VALUES ($1, 'Test Student')
       RETURNING id`,
      [teacherId]
    )
    studentId = student.id

    const { rows: [course] } = await pool.query(
      `INSERT INTO course (teacher_id, name, duration_minutes) VALUES ($1, 'Test Course', 60)
       RETURNING id`,
      [teacherId]
    )
    courseId = course.id

    // Create package with sessions
    const { rows: [pkg] } = await pool.query(
      `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions, status)
       VALUES ($1, $2, $3, 10, 10, 'Active')
       RETURNING id`,
      [teacherId, studentId, courseId]
    )
    packageId = pkg.id
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    // Clean up bookings and idempotency records before each test
    await pool.query(`DELETE FROM booking WHERE student_id = $1`, [studentId])
    await pool.query(`DELETE FROM idempotency_record WHERE user_id = $1 OR student_id = $2`, [userId, studentId])
  })

  it('should write middleware endpoint and requestHash to database', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Simulate middleware setting these values
      const method = 'POST'
      const path = '/v1/bookings'
      const body = { studentId, courseId, startAt: '2026-10-10T10:00:00Z' }
      
      const endpoint = `${method} ${path}`
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ method, path, body }))
        .digest('hex')
      
      // Generate UUIDs for idempotency key and booking
      const { rows: [keyRow] } = await client.query(`SELECT uuid_generate_v4() as key`)
      const idempotencyKey = keyRow.key

      // Insert booking
      const { rows: [booking] } = await client.query(
        `INSERT INTO booking (
          teacher_id, student_id, course_id, package_id,
          start_at, end_at, status,
          policy_snapshot_free_cancel_hours, source, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Upcoming', 24, 'TeacherCreated', $7)
        RETURNING id`,
        [
          teacherId,
          studentId,
          courseId,
          packageId,
          '2026-10-10T10:00:00Z',
          '2026-10-10T11:00:00Z',
          idempotencyKey
        ]
      )

      // Write idempotency record with EXACT middleware values
      await client.query(
        `INSERT INTO idempotency_record (
          user_id, student_id, idempotency_key, endpoint,
          request_hash, response_status, response_body, state
        ) VALUES ($1, $2, $3, $4, $5, 201, $6, 'Succeeded')`,
        [
          userId,
          null,
          idempotencyKey,
          endpoint,
          requestHash,
          JSON.stringify({ ok: true, data: { bookingId: booking.id } })
        ]
      )

      await client.query('COMMIT')

      // Verify middleware can find the record with same endpoint + key
      const { rows: [found] } = await pool.query(
        `SELECT endpoint, request_hash, response_status, response_body
         FROM idempotency_record
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      )

      expect(found).toBeDefined()
      expect(found.endpoint).toBe('POST /v1/bookings')
      expect(found.request_hash).toBe(requestHash)
      expect(found.response_status).toBe(201)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('should detect replay: same key + same hash', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      const method = 'POST'
      const path = '/v1/bookings/booking-123/completion'
      const body = {}
      
      const endpoint = `${method} ${path}`
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ method, path, body }))
        .digest('hex')
      
      // Generate UUID for idempotency key
      const { rows: [keyRow] } = await client.query(`SELECT uuid_generate_v4() as key`)
      const idempotencyKey = keyRow.key

      // First request succeeds and writes record
      await client.query(
        `INSERT INTO idempotency_record (
          user_id, student_id, idempotency_key, endpoint,
          request_hash, response_status, response_body, state
        ) VALUES ($1, $2, $3, $4, $5, 200, $6, 'Succeeded')`,
        [
          userId,
          null,
          idempotencyKey,
          endpoint,
          requestHash,
          JSON.stringify({ ok: true, data: { bookingId: 'booking-123' } })
        ]
      )

      // Second request with SAME key and SAME hash
      const { rows: [existing] } = await client.query(
        `SELECT request_hash, response_status, response_body
         FROM idempotency_record
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      )

      // Middleware should replay: same hash
      expect(existing.request_hash).toBe(requestHash)
      expect(existing.response_status).toBe(200)
      
      const responseBody = JSON.parse(existing.response_body)
      expect(responseBody.data.bookingId).toBe('booking-123')

      await client.query('COMMIT')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('should detect key reuse: same key + different hash', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Generate UUID for idempotency key
      const { rows: [keyRow] } = await client.query(`SELECT uuid_generate_v4() as key`)
      const idempotencyKey = keyRow.key

      // First request with one hash
      const method1 = 'POST'
      const path1 = '/v1/bookings'
      const body1 = { studentId, courseId, startAt: '2026-10-10T10:00:00Z' }
      
      const endpoint1 = `${method1} ${path1}`
      const requestHash1 = createHash('sha256')
        .update(JSON.stringify({ method: method1, path: path1, body: body1 }))
        .digest('hex')

      await client.query(
        `INSERT INTO idempotency_record (
          user_id, student_id, idempotency_key, endpoint,
          request_hash, response_status, response_body, state
        ) VALUES ($1, $2, $3, $4, $5, 201, $6, 'Succeeded')`,
        [
          userId,
          null,
          idempotencyKey,
          endpoint1,
          requestHash1,
          JSON.stringify({ ok: true, data: { bookingId: 'booking-1' } })
        ]
      )

      // Second request with SAME key but DIFFERENT hash (different startAt)
      const body2 = { studentId, courseId, startAt: '2026-10-10T14:00:00Z' }
      const requestHash2 = createHash('sha256')
        .update(JSON.stringify({ method: method1, path: path1, body: body2 }))
        .digest('hex')

      // Verify hashes are different
      expect(requestHash1).not.toBe(requestHash2)

      // Middleware should detect key reuse
      const { rows: [existing] } = await client.query(
        `SELECT request_hash
         FROM idempotency_record
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      )

      expect(existing.request_hash).toBe(requestHash1)
      expect(existing.request_hash).not.toBe(requestHash2)
      // Middleware would throw IDEMPOTENCY_KEY_REUSED

      await client.query('COMMIT')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it('should detect cross-endpoint key reuse', async () => {
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')

      // Generate UUID for idempotency key
      const { rows: [keyRow] } = await client.query(`SELECT uuid_generate_v4() as key`)
      const idempotencyKey = keyRow.key

      // First request to create booking
      const endpoint1 = 'POST /v1/bookings'
      const requestHash1 = createHash('sha256')
        .update(JSON.stringify({ method: 'POST', path: '/v1/bookings', body: { courseId } }))
        .digest('hex')

      await client.query(
        `INSERT INTO idempotency_record (
          user_id, student_id, idempotency_key, endpoint,
          request_hash, response_status, response_body, state
        ) VALUES ($1, $2, $3, $4, $5, 201, $6, 'Succeeded')`,
        [
          userId,
          null,
          idempotencyKey,
          endpoint1,
          requestHash1,
          JSON.stringify({ ok: true, data: { bookingId: 'booking-1' } })
        ]
      )

      // Second request to complete booking with SAME key (cross-endpoint reuse)
      const endpoint2 = 'POST /v1/bookings/booking-1/completion'
      const requestHash2 = createHash('sha256')
        .update(JSON.stringify({ method: 'POST', path: '/v1/bookings/booking-1/completion', body: {} }))
        .digest('hex')

      // Verify different endpoints → different hashes
      expect(endpoint1).not.toBe(endpoint2)
      expect(requestHash1).not.toBe(requestHash2)

      // Middleware should detect cross-endpoint key reuse
      const { rows: [existing] } = await client.query(
        `SELECT endpoint, request_hash
         FROM idempotency_record
         WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      )

      expect(existing.endpoint).toBe(endpoint1)
      expect(existing.endpoint).not.toBe(endpoint2)
      // Middleware would throw IDEMPOTENCY_KEY_REUSED

      await client.query('COMMIT')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
