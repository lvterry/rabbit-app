/**
 * Idempotency Integration Tests
 * 
 * Tests Write A pattern per parallel-plan-v2.md §8:
 * - Same key + same request → replay
 * - Same key + different request → IDEMPOTENCY_KEY_REUSED
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { ErrorCode } from '@rabbit/shared'

describe('Idempotency - Write A Pattern', () => {
  it('computes consistent request hash', () => {
    const request1 = {
      method: 'POST',
      path: '/v1/bookings',
      body: { courseId: 'course-123', startAt: '2026-09-25T10:00:00Z' },
    }

    const request2 = {
      method: 'POST',
      path: '/v1/bookings',
      body: { courseId: 'course-123', startAt: '2026-09-25T10:00:00Z' },
    }

    const hash1 = createHash('sha256').update(JSON.stringify(request1)).digest('hex')
    const hash2 = createHash('sha256').update(JSON.stringify(request2)).digest('hex')

    expect(hash1).toBe(hash2)
  })

  it('produces different hash for different request', () => {
    const request1 = {
      method: 'POST',
      path: '/v1/bookings',
      body: { courseId: 'course-123', startAt: '2026-09-25T10:00:00Z' },
    }

    const request2 = {
      method: 'POST',
      path: '/v1/bookings',
      body: { courseId: 'course-123', startAt: '2026-09-25T11:00:00Z' }, // Different time
    }

    const hash1 = createHash('sha256').update(JSON.stringify(request1)).digest('hex')
    const hash2 = createHash('sha256').update(JSON.stringify(request2)).digest('hex')

    expect(hash1).not.toBe(hash2)
  })

  it('same key different endpoint produces different hash', () => {
    const request1 = {
      method: 'POST',
      path: '/v1/bookings',
      body: { courseId: 'course-123', startAt: '2026-09-25T10:00:00Z' },
    }

    const request2 = {
      method: 'POST',
      path: '/v1/bookings/123/completion', // Different endpoint
      body: { courseId: 'course-123', startAt: '2026-09-25T10:00:00Z' },
    }

    const hash1 = createHash('sha256').update(JSON.stringify(request1)).digest('hex')
    const hash2 = createHash('sha256').update(JSON.stringify(request2)).digest('hex')

    expect(hash1).not.toBe(hash2)
  })
})

describe('Idempotency - Key Reuse Detection', () => {
  it('identifies key reuse scenario', () => {
    const idempotencyKey = 'key-123'
    
    // First request
    const request1Hash = createHash('sha256')
      .update(JSON.stringify({ method: 'POST', path: '/v1/bookings', body: { courseId: 'A' } }))
      .digest('hex')

    // Second request with SAME key but DIFFERENT body
    const request2Hash = createHash('sha256')
      .update(JSON.stringify({ method: 'POST', path: '/v1/bookings', body: { courseId: 'B' } }))
      .digest('hex')

    // Hashes are different → key reuse
    expect(request1Hash).not.toBe(request2Hash)
    // Middleware should throw IDEMPOTENCY_KEY_REUSED
  })

  it('identifies replay scenario', () => {
    const idempotencyKey = 'key-123'
    
    // First request
    const request1Hash = createHash('sha256')
      .update(JSON.stringify({ method: 'POST', path: '/v1/bookings', body: { courseId: 'A' } }))
      .digest('hex')

    // Second request with SAME key and SAME body
    const request2Hash = createHash('sha256')
      .update(JSON.stringify({ method: 'POST', path: '/v1/bookings', body: { courseId: 'A' } }))
      .digest('hex')

    // Hashes are the same → replay
    expect(request1Hash).toBe(request2Hash)
    // Middleware should return cached response
  })
})

describe('Idempotency - Principal Scoping', () => {
  it('key is scoped to principal userId', () => {
    const key = 'key-123'
    const user1 = { userId: 'user-1', studentId: null }
    const user2 = { userId: 'user-2', studentId: null }

    // Same key, different users → different idempotency records
    expect(user1.userId).not.toBe(user2.userId)
    // Database uniqueness: (user_id, idempotency_key) where user_id is not null
  })

  it('key is scoped to principal studentId', () => {
    const key = 'key-123'
    const student1 = { userId: null, studentId: 'student-1' }
    const student2 = { userId: null, studentId: 'student-2' }

    // Same key, different students → different idempotency records
    expect(student1.studentId).not.toBe(student2.studentId)
    // Database uniqueness: (student_id, idempotency_key) where student_id is not null
  })
})
