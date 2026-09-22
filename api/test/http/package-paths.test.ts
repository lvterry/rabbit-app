/**
 * Real HTTP - Package Paths
 * 
 * Tests correct §12.6 paths (no doubled /students/students/)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken } from '../../src/auth'

describe('Real HTTP - Package Paths', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findByUserId: async (userId: string) =>
        userId === 'user-teacher'
          ? { teacherId: 'teacher-1', name: '张老师' } as any
          : null,
    } as any

    const mockPackageRepo = {
      create: async () => ({ packageId: 'pkg-1' } as any),
      getBalance: async () => ({ total: 10, available: 10 }),
      addTransaction: async () => ({ transactionId: 'txn-1' } as any),
      findById: async () => ({ packageId: 'pkg-1' } as any),
      listTransactionsByStudent: async () => [],
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: {} as any,
      studentRepo: {} as any,
      availabilityRepo: {} as any,
      packageRepo: mockPackageRepo,
      bookingRepo: {} as any,
      idempotencyRepo: {} as any,
      pool: createMockPool(),
    })
  })

  it('POST /v1/students/:studentId/packages - correct path', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/students/student-123/packages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId: 'course-1',
        sessions: 10,
        note: 'Test package',
      })
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('POST /v1/packages/:packageId/transactions - correct path', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .post('/v1/packages/pkg-1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'Deposit',
        sessions: 5,
        type: 'adjustment',
      })
      .expect(200)

    expect(response.body.ok).toBe(true)
  })

  it('GET /v1/students/:studentId/transactions - correct path', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .get('/v1/students/student-123/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.items).toBeDefined()
  })

  it('GET /v1/me/transactions - correct path', async () => {
    const token = generateUserAccessToken('user-teacher')

    const response = await request(app)
      .get('/v1/me/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
  })
})
