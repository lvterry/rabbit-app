/**
 * Real HTTP - Cross-Resource 403
 * 
 * Tests §19 checklist:
 * - Cross-teacher access forbidden
 * - Cross-student access forbidden
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateStudentAccessToken, generateUserAccessToken } from '../../src/auth'

describe('Real HTTP - Cross-Resource 403', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findById: async (id: string) => 
        id === 'teacher-1' 
          ? { teacherId: 'teacher-1', name: '张老师', timezone: 'Asia/Shanghai', minLeadHours: 24, maxAdvanceDays: 30, slotStepMinutes: 30 } as any
          : null,
      findByUserId: async (userId: string) =>
        userId === 'user-teacher-1'
          ? { teacherId: 'teacher-1' } as any
          : null,
    } as any

    const mockCourseRepo = {
      findById: async () => ({ courseId: 'course-1', durationMinutes: 60 } as any),
    } as any

    const mockStudentRepo = {
      findByTeacherAndUser: async (teacherId: string, userId: string) => null,
    } as any

    const mockBookingRepo = {
      findById: async (id: string) => ({
        bookingId: id,
        teacherId: 'teacher-1',
        studentId: 'student-1',
      } as any),
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: mockCourseRepo,
      studentRepo: mockStudentRepo,
      availabilityRepo: {
        listActiveRulesForWeekday: async () => [],
        listExceptions: async () => [],
      } as any,
      packageRepo: {
        getBalance: async () => ({ total: 10, available: 10 }),
      } as any,
      bookingRepo: mockBookingRepo,
      idempotencyRepo: {} as any,
      pool: createMockPool(),
    })
  })

  it('Student cannot access another teacher slots', async () => {
    const token = generateStudentAccessToken('student-999', 'teacher-999')

    await request(app)
      .get('/v1/teachers/teacher-1/slots?courseId=course-1&date=2026-09-25')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  it('Student cannot access another student booking', async () => {
    const token = generateStudentAccessToken('student-999', 'teacher-999')

    await request(app)
      .get('/v1/bookings/booking-123')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  it('User without teacher capability cannot access teacher-day', async () => {
    const token = generateUserAccessToken('user-no-teacher')

    await request(app)
      .get('/v1/me/teacher-day')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })
})
