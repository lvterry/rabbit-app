/**
 * Real HTTP Integration Tests - Auth Flow
 * 
 * Tests actual HTTP endpoints with supertest
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import type {
  TeacherRepository,
  StudentRepository,
  IdempotencyRepository,
  CourseRepository,
  AvailabilityRepository,
  PackageRepository,
  BookingRepository,
} from '../../src/ports'

describe('Real HTTP - Auth Flow', () => {
  let app: any
  let mockTeacherRepo: TeacherRepository
  let mockStudentRepo: StudentRepository
  let mockIdempotencyRepo: IdempotencyRepository

  beforeEach(() => {
    // Create mock repositories
    mockTeacherRepo = {
      findById: async (id) => null,
      findByUserId: async (userId) => null,
      create: async () => ({ teacherId: 'teacher-1' } as any),
      update: async () => ({} as any),
      hasTeacherCapability: async () => false,
      getTimezone: async () => 'Asia/Shanghai',
      getMinLeadHours: async () => 24,
    } as any

    mockStudentRepo = {
      findById: async () => null,
      findByTeacherAndUser: async () => null,
      getInviteByToken: async () => null,
      consumeInvite: async () => ({ studentId: 's1', teacherId: 't1', alreadyBound: false, issueNewSession: true }),
    } as any

    mockIdempotencyRepo = {
      findExisting: async () => null,
      recordSuccess: async () => {},
      cleanup: async () => 0,
    } as any

    const mockCourseRepo: CourseRepository = {
      findById: async () => null,
      listByTeacher: async () => [],
      create: async () => ({} as any),
      update: async () => ({} as any),
      archive: async () => {},
      restore: async () => {},
    } as any

    const mockAvailabilityRepo: AvailabilityRepository = {
      listRules: async () => [],
      listActiveRulesForWeekday: async () => [],
      createRule: async () => ({} as any),
      updateRule: async () => ({} as any),
      deleteRule: async () => {},
      copyRules: async () => ({ copied: 0 }),
      listExceptions: async () => [],
      getExceptionForDate: async () => null,
      createException: async () => ({} as any),
      deleteException: async () => {},
    } as any

    const mockPackageRepo: PackageRepository = {
      findById: async () => null,
      listByStudent: async () => [],
      create: async () => ({} as any),
      addTransaction: async () => ({} as any),
      archive: async () => {},
      restore: async () => {},
      listTransactionsByStudent: async () => [],
      getBalance: async () => ({ total: 10, available: 10, consumed: 0 }),
    } as any

    const mockBookingRepo: BookingRepository = {
      findById: async () => null,
      create: async () => ({} as any),
      complete: async () => ({} as any),
      undoCompletion: async () => ({} as any),
      cancel: async () => ({} as any),
      reschedule: async () => ({} as any),
      getUpcomingIntervals: async () => [],
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: mockCourseRepo,
      studentRepo: mockStudentRepo,
      availabilityRepo: mockAvailabilityRepo,
      packageRepo: mockPackageRepo,
      bookingRepo: mockBookingRepo,
      idempotencyRepo: mockIdempotencyRepo,
      pool: createMockPool(),
    })
  })

  it('POST /v1/auth/apple - returns 501 Not Implemented', async () => {
    const response = await request(app)
      .post('/v1/auth/apple')
      .send({
        identityToken: 'fake-token',
        authorizationCode: 'fake-code',
      })
      .expect(501)

    expect(response.body.ok).toBe(false)
    expect(response.body.code).toBe('NOT_IMPLEMENTED')
    expect(response.body.message).toContain('not yet implemented')
  })

  it('GET /v1/me - requires authentication', async () => {
    await request(app)
      .get('/v1/me')
      .expect(401)
  })

  it('GET /v1/meta - requires authentication', async () => {
    await request(app)
      .get('/v1/meta')
      .expect(401)
  })
})
