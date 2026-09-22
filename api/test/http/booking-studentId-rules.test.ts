/**
 * Real HTTP - Booking studentId Rules
 * 
 * Tests §19 checklist:
 * - studentId required (teacher path)
 * - studentId forbidden (student path)
 * - Forbidden fields source/by/asTeacher → VALIDATION_FAILED
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken, generateStudentAccessToken } from '../../src/auth'

describe('Real HTTP - Booking studentId Rules', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findByUserId: async (userId: string) => 
        userId === 'user-teacher' 
          ? { teacherId: 'teacher-1', name: '张老师', timezone: 'Asia/Shanghai' } as any
          : null,
      hasTeacherCapability: async (userId: string) => userId === 'user-teacher',
    } as any

    const mockBookingRepo = {
      create: async (data: any) => ({
        bookingId: 'booking-123',
        ...data,
      }),
    } as any

    const mockIdempotencyRepo = {
      findExisting: async () => null,
      recordSuccess: async () => {},
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

  it('Teacher path requires studentId in request body', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-1')
      .send({
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
        // studentId missing!
      })
      .expect(422)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('VALIDATION_FAILED')
  })

  it('Student path forbids studentId in request body', async () => {
    const token = generateStudentAccessToken('student-123', 'teacher-456')

    const response = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-2')
      .send({
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
        studentId: 'student-123', // Forbidden!
      })
      .expect(422)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('VALIDATION_FAILED')
    expect(response.body.message).toContain('studentId is forbidden')
  })

  it('Rejects forbidden field: source', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-3')
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
        source: 'TeacherCreated', // Forbidden!
      })
      .expect(422)

    expect(response.body.code).toBe('VALIDATION_FAILED')
  })

  it('Rejects forbidden field: by', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-4')
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
        by: 'Teacher', // Forbidden!
      })
      .expect(422)

    expect(response.body.code).toBe('VALIDATION_FAILED')
  })

  it('Rejects forbidden field: asTeacher', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-5')
      .send({
        studentId: 'student-123',
        courseId: 'course-123',
        startAt: '2026-09-25T10:00:00Z',
        asTeacher: true, // Forbidden!
      })
      .expect(422)

    expect(response.body.code).toBe('VALIDATION_FAILED')
  })
})
