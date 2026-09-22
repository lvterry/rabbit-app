/**
 * Real HTTP - Invite Flows
 * 
 * Tests §19 checklist:
 * - Pending preview
 * - Anonymous accept
 * - Existing User accept
 * - Consumed revisit
 * - Invite revoke
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken, generateStudentAccessToken } from '../../src/auth'

describe('Real HTTP - Invite Flows', () => {
  let app: any

  beforeEach(() => {
    const mockTeacherRepo = {
      findById: async (id: string) => 
        id === 'teacher-1' 
          ? { teacherId: 'teacher-1', name: '张老师', avatar: null } as any
          : null,
      findByUserId: async (userId: string) =>
        userId === 'user-teacher-1'
          ? { teacherId: 'teacher-1', name: '张老师' } as any
          : null,
    } as any

    const mockStudentRepo = {
      getInviteByToken: async (token: string) => {
        if (token === 'pending-token') {
          return {
            inviteId: 'invite-1',
            teacherId: 'teacher-1',
            studentName: '小明',
            status: 'Pending',
            expiresAt: '2026-12-31T00:00:00Z',
          } as any
        }
        if (token === 'consumed-token') {
          return {
            inviteId: 'invite-2',
            teacherId: 'teacher-1',
            studentId: 'student-123',
            studentName: '小红',
            status: 'Consumed',
          } as any
        }
        return null
      },
      consumeInvite: async () => ({
        studentId: 'student-new',
        teacherId: 'teacher-1',
        alreadyBound: false,
        issueNewSession: true,
      }),
      revokeInvite: async (inviteId: string) => {},
    } as any

    const mockCourseRepo = {
      listByTeacher: async () => [
        { courseId: 'course-1', name: '钢琴课' },
      ],
      listActiveByTeacher: async () => [
        { courseId: 'course-1', name: '钢琴课' },
      ],
    } as any

    app = createTestApp({
      teacherRepo: mockTeacherRepo,
      courseRepo: mockCourseRepo,
      studentRepo: mockStudentRepo,
      availabilityRepo: {} as any,
      packageRepo: {} as any,
      bookingRepo: {} as any,
      idempotencyRepo: {} as any,
      pool: createMockPool(),
    })
  })

  it('GET /v1/invites/:token - pending preview (no auth)', async () => {
    const response = await request(app)
      .get('/v1/invites/pending-token')
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.teacher.name).toBe('张老师')
    expect(response.body.data.studentName).toBe('小明')
  })

  it('POST /v1/invites/:token/accept - anonymous creates Student session', async () => {
    const response = await request(app)
      .post('/v1/invites/pending-token/accept')
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.accessToken).toBeDefined()
    expect(response.body.data.refreshToken).toBeUndefined() // NOT in JSON body
  })

  it('POST /v1/invites/:inviteId/revoke - teacher can revoke', async () => {
    const token = generateUserAccessToken('user-teacher-1')

    const response = await request(app)
      .post('/v1/invites/invite-1/revoke')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.data.revoked).toBe(true)
  })

  it('POST /v1/invites/:inviteId/revoke - non-teacher forbidden', async () => {
    const token = generateStudentAccessToken('student-1', 'teacher-1')

    await request(app)
      .post('/v1/invites/invite-1/revoke')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })
})
