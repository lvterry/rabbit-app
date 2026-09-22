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
  let requestHistory: Map<string, { hash: string; endpoint: string; response: any }>

  beforeEach(() => {
    requestHistory = new Map()

    const mockTeacherRepo = {
      findByUserId: async () => ({ teacherId: 'teacher-1' } as any),
      hasTeacherCapability: async () => true,
    } as any

    const mockBookingRepo = {
      create: async (data: any) => ({
        bookingId: `booking-${Date.now()}`,
        ...data,
      }),
    } as any

    const mockIdempotencyRepo = {
      findExisting: async (principal: any, endpoint: string, key: string) => {
        const record = requestHistory.get(`${principal.userId}-${key}`)
        if (record && record.endpoint === endpoint) {
          return {
            requestHash: record.hash,
            responseStatus: 200,
            responseBody: JSON.stringify(record.response),
          }
        }
        return null
      },
      recordSuccess: async (principal: any, endpoint: string, key: string, hash: string, status: number, body: any) => {
        requestHistory.set(`${principal.userId}-${key}`, {
          hash,
          endpoint,
          response: JSON.parse(body),
        })
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

    if (response1.status !== 200) {
      console.error('First request failed:', response1.status, response1.body)
    }
    expect(response1.status).toBe(200)

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
  })
})
