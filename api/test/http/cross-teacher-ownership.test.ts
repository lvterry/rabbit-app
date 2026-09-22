/**
 * Cross-Teacher Ownership Tests
 * 
 * Verify Teacher B cannot mutate Teacher A's resources
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../helpers/testApp'
import type { TeacherRepository, StudentRepository, AvailabilityRepository, CourseRepository, PackageRepository, BookingRepository, IdempotencyRepository } from '../../src/ports'
import { Pool } from 'pg'
import { generateUserAccessToken } from '../../src/auth'

describe('Real HTTP - Cross-Teacher Ownership', () => {
  let app: any

  beforeEach(() => {
    // Mock repos
    const mockTeacherRepo: Partial<TeacherRepository> = {
      findByUserId: async (userId: string) => {
        if (userId === 'user-teacher-a') {
          return { teacherId: 'teacher-a', userId: 'user-teacher-a', name: 'Teacher A', email: 'a@example.com', createdAt: '2024-01-01' }
        }
        if (userId === 'user-teacher-b') {
          return { teacherId: 'teacher-b', userId: 'user-teacher-b', name: 'Teacher B', email: 'b@example.com', createdAt: '2024-01-01' }
        }
        return null
      },
    }

    const mockStudentRepo: Partial<StudentRepository> = {
      listByTeacher: async (teacherId: string) => {
        if (teacherId === 'teacher-a') {
          return [
            {
              student: {
                studentId: 'student-a1',
                teacherId: 'teacher-a',
                name: 'Student A1',
                contact: null,
                status: 'active' as const,
                createdAt: '2024-01-01',
              },
              invite: {
                inviteId: 'invite-a1',
                teacherId: 'teacher-a',
                studentName: 'Student A1',
                token: 'token-a1',
                status: 'pending' as const,
                createdAt: '2024-01-01',
                expiresAt: '2024-12-31',
              },
              package: null,
            },
          ]
        }
        if (teacherId === 'teacher-b') {
          return [
            {
              student: {
                studentId: 'student-b1',
                teacherId: 'teacher-b',
                name: 'Student B1',
                contact: null,
                status: 'active' as const,
                createdAt: '2024-01-01',
              },
              invite: {
                inviteId: 'invite-b1',
                teacherId: 'teacher-b',
                studentName: 'Student B1',
                token: 'token-b1',
                status: 'pending' as const,
                createdAt: '2024-01-01',
                expiresAt: '2024-12-31',
              },
              package: null,
            },
          ]
        }
        return []
      },
      revokeInvite: async (inviteId: string) => {
        // Agent A impl does not check ownership - just mutates by id
        return
      },
    }

    const mockAvailabilityRepo: Partial<AvailabilityRepository> = {
      listRules: async (teacherId: string) => {
        if (teacherId === 'teacher-a') {
          return [
            {
              ruleId: 'rule-a1',
              teacherId: 'teacher-a',
              weekday: 1,
              startMinute: 540,
              endMinute: 1020,
              status: 'active' as const,
              createdAt: '2024-01-01',
            },
          ]
        }
        if (teacherId === 'teacher-b') {
          return [
            {
              ruleId: 'rule-b1',
              teacherId: 'teacher-b',
              weekday: 2,
              startMinute: 600,
              endMinute: 900,
              status: 'active' as const,
              createdAt: '2024-01-01',
            },
          ]
        }
        return []
      },
      listExceptions: async (teacherId: string, fromDate: string, toDate: string) => {
        if (teacherId === 'teacher-a') {
          return [
            {
              exceptionId: 'exception-a1',
              teacherId: 'teacher-a',
              onDate: '2024-06-01',
              wholeDay: true,
              startMinute: null,
              endMinute: null,
              reason: 'Holiday',
              createdAt: '2024-01-01',
            },
          ]
        }
        if (teacherId === 'teacher-b') {
          return [
            {
              exceptionId: 'exception-b1',
              teacherId: 'teacher-b',
              onDate: '2024-07-01',
              wholeDay: false,
              startMinute: 600,
              endMinute: 720,
              reason: 'Meeting',
              createdAt: '2024-01-01',
            },
          ]
        }
        return []
      },
      updateRule: async (ruleId: string) => {
        // Agent A impl does not check ownership - just mutates by id
        return {
          ruleId,
          teacherId: 'teacher-a',
          weekday: 1,
          startMinute: 540,
          endMinute: 1020,
          status: 'active' as const,
          createdAt: '2024-01-01',
        }
      },
      deleteRule: async (ruleId: string) => {
        // Agent A impl does not check ownership - just mutates by id
        return
      },
      deleteException: async (exceptionId: string) => {
        // Agent A impl does not check ownership - just mutates by id
        return
      },
    }

    const mockCourseRepo: Partial<CourseRepository> = {}
    const mockPackageRepo: Partial<PackageRepository> = {}
    const mockBookingRepo: Partial<BookingRepository> = {}
    const mockIdempotencyRepo: Partial<IdempotencyRepository> = {}
    const mockPool = {} as Pool

    app = createTestApp({
      teacherRepo: mockTeacherRepo as TeacherRepository,
      studentRepo: mockStudentRepo as StudentRepository,
      availabilityRepo: mockAvailabilityRepo as AvailabilityRepository,
      courseRepo: mockCourseRepo as CourseRepository,
      packageRepo: mockPackageRepo as PackageRepository,
      bookingRepo: mockBookingRepo as BookingRepository,
      idempotencyRepo: mockIdempotencyRepo as IdempotencyRepository,
      pool: mockPool,
    })
  })

  it('POST /v1/invites/:inviteId/revoke - Teacher B cannot revoke Teacher A invite', async () => {
    // Teacher B tries to revoke Teacher A's invite
    const tokenB = generateUserAccessToken('user-teacher-b')

    const response = await request(app)
      .post('/v1/invites/invite-a1/revoke')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('POST /v1/invites/:inviteId/revoke - Teacher A can revoke own invite', async () => {
    // Teacher A revokes their own invite
    const tokenA = generateUserAccessToken('user-teacher-a')

    const response = await request(app)
      .post('/v1/invites/invite-a1/revoke')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('PATCH /v1/availability/rules/:ruleId - Teacher B cannot update Teacher A rule', async () => {
    const tokenB = generateUserAccessToken('user-teacher-b')

    const response = await request(app)
      .patch('/v1/availability/rules/rule-a1')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ startMinute: 600 })
      .expect(403)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('PATCH /v1/availability/rules/:ruleId - Teacher A can update own rule', async () => {
    const tokenA = generateUserAccessToken('user-teacher-a')

    const response = await request(app)
      .patch('/v1/availability/rules/rule-a1')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ startMinute: 600 })
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('DELETE /v1/availability/rules/:ruleId - Teacher B cannot delete Teacher A rule', async () => {
    const tokenB = generateUserAccessToken('user-teacher-b')

    const response = await request(app)
      .delete('/v1/availability/rules/rule-a1')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('DELETE /v1/availability/rules/:ruleId - Teacher A can delete own rule', async () => {
    const tokenA = generateUserAccessToken('user-teacher-a')

    const response = await request(app)
      .delete('/v1/availability/rules/rule-a1')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('DELETE /v1/availability/exceptions/:exceptionId - Teacher B cannot delete Teacher A exception', async () => {
    const tokenB = generateUserAccessToken('user-teacher-b')

    const response = await request(app)
      .delete('/v1/availability/exceptions/exception-a1')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('DELETE /v1/availability/exceptions/:exceptionId - Teacher A can delete own exception', async () => {
    const tokenA = generateUserAccessToken('user-teacher-a')

    const response = await request(app)
      .delete('/v1/availability/exceptions/exception-a1')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })
})
