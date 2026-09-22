/**
 * Real HTTP - Idempotency Replay & Key Reuse
 * 
 * Tests §19 checklist:
 * - Idempotent replay (same key + same request)
 * - IDEMPOTENCY_KEY_REUSED (same key + different request)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken } from '../../src/auth'
import { createHash } from 'crypto'

describe('Real HTTP - Idempotency', () => {
  let app: any
  let requestHistory: Map<string, { hash: string; status: number; body: string; endpoint: string }>
  let bookingCounter: number

  beforeEach(() => {
    requestHistory = new Map()
    bookingCounter = 0

    const mockTeacherRepo = {
      findByUserId: async () => ({ teacherId: 'teacher-1' } as any),
      hasTeacherCapability: async () => true,
    } as any

    const mockIdempotencyRepo = {
      findExisting: async (principal: any, endpoint: string, key: string) => {
        const principalKey = principal.userId || principal.studentId
        const recordKey = `${principalKey}-${endpoint}-${key}`
        const record = requestHistory.get(recordKey)
        if (record) {
          return {
            requestHash: record.hash,
            responseStatus: record.status,
            responseBody: record.body,
          }
        }
        return null
      },
      recordSuccess: async (principal: any, endpoint: string, key: string, hash: string, status: number, body: string) => {
        const principalKey = principal.userId || principal.studentId
        const recordKey = `${principalKey}-${endpoint}-${key}`
        
        // Simulate 23505 unique constraint violation if record already exists
        const existing = requestHistory.get(recordKey)
        if (existing) {
          const error: any = new Error('duplicate key value violates unique constraint')
          error.code = '23505'
          throw error
        }
        
        requestHistory.set(recordKey, {
          hash,
          status,
          body,
          endpoint,
        })
      },
    } as any

    const mockBookingRepo = {
      create: async (data: any, principal: any, idempotencyKey: string) => {
        const booking = {
          bookingId: `booking-${++bookingCounter}`,
          ...data,
        }
        
        // Agent A pattern: record idempotency in same "transaction"
        // Compute hash matching middleware's logic
        const endpoint = 'POST /v1/bookings'
        const requestHash = createHash('sha256').update(JSON.stringify({
          method: 'POST',
          path: '/v1/bookings',
          body: data,
        })).digest('hex')
        
        const responseBody = JSON.stringify({ ok: true, data: { booking, bookingId: booking.bookingId } })
        
        await mockIdempotencyRepo.recordSuccess(
          principal,
          endpoint,
          idempotencyKey,
          requestHash,
          200,
          responseBody
        )
        
        return booking
      },
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: {} as any,
      studentRepo: {} as any,
      availabilityRepo: {} as any,
      packageRepo: {} as any,
      bookingRepo: mockBookingRepo,
      idempotencyRepo: mockIdempotencyRepo,
      pool: createMockPool(),
    })
  })

  it('Replay: same key + same request returns cached response', async () => {
    const token = generateUserAccessToken('user-1')
    const idempotencyKey = 'replay-test-key'

    // First request
    const response1 = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
      })
      .expect(200)

    const bookingId1 = response1.body.data.bookingId

    // Second request with SAME key and SAME body
    const response2 = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
      })
      .expect(200)

    const bookingId2 = response2.body.data.bookingId

    // Should return SAME booking (replay)
    expect(bookingId2).toBe(bookingId1)
    expect(bookingCounter).toBe(1) // Only one booking created
  })

  it('Key reuse: same key + different request returns IDEMPOTENCY_KEY_REUSED', async () => {
    const token = generateUserAccessToken('user-1')
    const idempotencyKey = 'reuse-test-key'

    // First request
    await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
      })
      .expect(200)

    // Second request with SAME key but DIFFERENT body
    const response2 = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T11:00:00Z', // Different time!
      })
      .expect(409)

    expect(response2.body.ok).toBe(false)
    expect(response2.body.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(bookingCounter).toBe(1) // Only first booking created
  })
})
