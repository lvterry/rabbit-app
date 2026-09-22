/**
 * Real HTTP - Dual-Role User
 * 
 * Tests §19 checklist:
 * - User can be both teacher AND student
 * - Proper capability detection
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken } from '../../src/auth'

describe('Real HTTP - Dual-Role User', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findByUserId: async (userId: string) =>
        userId === 'user-dual'
          ? { teacherId: 'teacher-1', name: '张老师' } as any
          : null,
    } as any

    const mockStudentRepo = {
      findByTeacherAndUser: async (teacherId: string, userId: string) =>
        teacherId === 'teacher-2' && userId === 'user-dual'
          ? { student: { studentId: 'student-1', name: '小明' } } as any
          : null,
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: {} as any,
      studentRepo: mockStudentRepo,
      availabilityRepo: {} as any,
      packageRepo: {} as any,
      bookingRepo: {} as any,
      idempotencyRepo: {} as any,
      pool: createMockPool(),
    })
  })

  it('GET /v1/me - dual-role user shows both capabilities', async () => {
    const token = generateUserAccessToken('user-dual')

    const response = await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.kind).toBe('User')
    expect(response.body.data.teacher).toBeDefined()
    expect(response.body.data.teacher.teacherId).toBe('teacher-1')
  })

  it('GET /v1/meta - shows teacher capability', async () => {
    const token = generateUserAccessToken('user-dual')

    const response = await request(app)
      .get('/v1/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.capabilities.canActAsTeacher).toBe(true)
  })

  it('User can access teacher-day as teacher', async () => {
    const token = generateUserAccessToken('user-dual')

    const response = await request(app)
      .get('/v1/me/teacher-day')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })
})
