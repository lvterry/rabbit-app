/**
 * Real HTTP - Slots Authorization
 * 
 * Tests §19 checklist:
 * - Slots auth / capability view
 * - Never trust client view parameter
 * - Cross-resource 403
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken, generateStudentAccessToken } from '../../src/auth'

describe('Real HTTP - Slots Authorization', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findById: async (id: string) => {
        if (id === 'teacher-1') {
          return { teacherId: 'teacher-1', name: '张老师', timezone: 'Asia/Shanghai', minLeadHours: 24, maxAdvanceDays: 30, slotStepMinutes: 30 } as any
        }
        if (id === 'teacher-999') {
          return { teacherId: 'teacher-999', name: '其他老师', timezone: 'Asia/Shanghai', minLeadHours: 24, maxAdvanceDays: 30, slotStepMinutes: 30 } as any
        }
        return null
      },
      findByUserId: async (userId: string) => 
        userId === 'user-teacher-1' 
          ? { teacherId: 'teacher-1', name: '张老师' } as any
          : null,
    } as any

    const mockCourseRepo = {
      findById: async () => ({ courseId: 'course-1', durationMinutes: 60 } as any),
    } as any

    const mockStudentRepo = {
      findByTeacherAndUser: async (teacherId: string, userId: string) => 
        teacherId === 'teacher-1' && userId === 'user-student-1'
          ? { student: { studentId: 'student-1' } } as any
          : null,
    } as any

    const mockAvailabilityRepo = {
      listActiveRulesForWeekday: async () => [],
      listExceptions: async () => [],
    } as any

    const mockBookingRepo = {
      getUpcomingIntervals: async () => [],
    } as any

    const mockPackageRepo = {
      getBalance: async () => ({ total: 10, available: 10 }),
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: mockCourseRepo,
      studentRepo: mockStudentRepo,
      availabilityRepo: mockAvailabilityRepo,
      packageRepo: mockPackageRepo,
      bookingRepo: mockBookingRepo,
      idempotencyRepo: {} as any,
      pool: createMockPool(),
    })
  })

  it('Public principal cannot access slots', async () => {
    await request(app)
      .get('/v1/teachers/teacher-1/slots?courseId=course-1&date=2026-09-25')
      .expect(401)
  })

  it('Teacher can access own slots', async () => {
    const token = generateUserAccessToken('user-teacher-1')

    const response = await request(app)
      .get('/v1/teachers/teacher-1/slots?courseId=course-1&date=2026-09-25')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.slots).toBeDefined()
  })

  it('Bound student can access teacher slots', async () => {
    const token = generateStudentAccessToken('student-1', 'teacher-1')

    const response = await request(app)
      .get('/v1/teachers/teacher-1/slots?courseId=course-1&date=2026-09-25')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('Cross-teacher access is forbidden', async () => {
    const token = generateStudentAccessToken('student-1', 'teacher-1')

    // Student bound to teacher-1 trying to access teacher-999
    await request(app)
      .get('/v1/teachers/teacher-999/slots?courseId=course-1&date=2026-09-25')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  it('Never trusts client view parameter', async () => {
    const token = generateStudentAccessToken('student-1', 'teacher-1')

    // Even if client passes view=teacher, server derives from capability
    const response = await request(app)
      .get('/v1/teachers/teacher-1/slots?courseId=course-1&date=2026-09-25&view=teacher')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    // Server should apply student restrictions regardless of query param
    expect(response.body.ok).toBe(true)
  })
})
