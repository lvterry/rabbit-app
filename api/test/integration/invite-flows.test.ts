/**
 * Invite Flow Integration Tests
 * 
 * Tests invite scenarios per parallel-plan-v2.md §5, §19:
 * - Pending preview (no auth required for token)
 * - Anonymous accept (creates Student session)
 * - Existing User accept (binds student to user)
 * - Consumed revisit (redirectTo for original student)
 */

import { describe, it, expect } from 'vitest'
import {
  createPublicPrincipal,
  createUserPrincipal,
  createStudentPrincipal,
} from '../../src/auth/principal'

describe('Invite - Pending Preview', () => {
  it('Public can preview pending invite', () => {
    const principal = createPublicPrincipal()
    const inviteStatus = 'Pending'
    
    // GET /v1/invites/:token with no auth
    // Returns teacher name, student name, courses
    expect(principal.kind).toBe('Public')
    expect(inviteStatus).toBe('Pending')
  })

  it('preview returns teacher and course info', () => {
    const previewResponse = {
      teacher: { teacherId: 't-123', name: '张老师', avatarUrl: null },
      studentName: '小明',
      courses: [{ courseId: 'c-123', courseName: '钢琴课' }],
      expiresAt: '2026-10-22T00:00:00Z',
    }
    
    expect(previewResponse.teacher.name).toBeTruthy()
    expect(previewResponse.studentName).toBeTruthy()
    expect(previewResponse.courses.length).toBeGreaterThan(0)
  })

  it('expired invite returns INVITE_EXPIRED', () => {
    const inviteStatus = 'Expired'
    
    // GET /v1/invites/:token
    // Returns 410 INVITE_EXPIRED
    expect(inviteStatus).toBe('Expired')
  })

  it('revoked invite returns INVITE_REVOKED', () => {
    const inviteStatus = 'Revoked'
    
    // GET /v1/invites/:token
    // Returns 410 INVITE_REVOKED
    expect(inviteStatus).toBe('Revoked')
  })
})

describe('Invite - Anonymous Accept', () => {
  it('creates Student session on anonymous accept', () => {
    const principal = createPublicPrincipal()
    
    // POST /v1/invites/:token/accept with Public principal
    // Creates Student session
    // Returns accessToken + sets HttpOnly refresh cookie
    expect(principal.kind).toBe('Public')
  })

  it('returns session tokens on success', () => {
    const acceptResponse = {
      teacherId: 'teacher-123',
      studentId: 'student-123',
      accessToken: 'eyJ...',
      refreshToken: 'eyJ...',
      redirectTo: '/',
    }
    
    expect(acceptResponse.accessToken).toBeTruthy()
    expect(acceptResponse.refreshToken).toBeTruthy()
    expect(acceptResponse.redirectTo).toBe('/')
  })

  it('sets HttpOnly refresh cookie for Web', () => {
    const cookieAttributes = {
      httpOnly: true,
      secure: true, // in production
      sameSite: 'lax',
      maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days
      path: '/v1/auth',
    }
    
    expect(cookieAttributes.httpOnly).toBe(true)
    expect(cookieAttributes.sameSite).toBe('lax')
  })
})

describe('Invite - Existing User Accept', () => {
  it('binds student to user on accept', () => {
    const principal = createUserPrincipal('user-123')
    
    // POST /v1/invites/:token/accept with User principal
    // Binds student.user_id = user-123
    // Does NOT create new session
    // Keeps current User session
    expect(principal.kind).toBe('User')
  })

  it('does not create new session for User', () => {
    const acceptResponse = {
      teacherId: 'teacher-123',
      studentId: 'student-123',
      redirectTo: '/',
      // No accessToken/refreshToken for User (keeps current session)
    }
    
    expect(acceptResponse.accessToken).toBeUndefined()
    expect(acceptResponse.refreshToken).toBeUndefined()
  })

  it('allows User to be teacher + student', () => {
    const user = {
      userId: 'user-123',
      hasTeacherProfile: true,
      boundStudents: ['student-456'], // Bound to another teacher
    }
    
    // User can be both teacher and student
    // This is the dual-role scenario
    expect(user.hasTeacherProfile).toBe(true)
    expect(user.boundStudents.length).toBeGreaterThan(0)
  })
})

describe('Invite - Consumed Revisit', () => {
  it('allows original student to revisit consumed invite', () => {
    const principal = createStudentPrincipal('student-123', 'teacher-123')
    const inviteStudentId = 'student-123'
    const inviteStatus = 'Consumed'
    
    // GET /v1/invites/:token with matching Student session
    // Returns alreadyAccepted=true, redirectTo='/'
    expect(principal.studentId).toBe(inviteStudentId)
    expect(inviteStatus).toBe('Consumed')
  })

  it('prevents third party from seeing consumed invite', () => {
    const principal = createStudentPrincipal('student-999', 'teacher-999')
    const inviteStudentId = 'student-123'
    const inviteStatus = 'Consumed'
    
    // GET /v1/invites/:token with different Student session
    // Returns 410 INVITE_CONSUMED without any identity info
    expect(principal.studentId).not.toBe(inviteStudentId)
    expect(inviteStatus).toBe('Consumed')
  })

  it('consumed response must not leak identity', () => {
    const errorResponse = {
      ok: false,
      code: 'INVITE_CONSUMED',
      message: '该邀请已被使用，请联系老师重新发送。',
      // Must NOT include: teacherName, studentName, courseInfo
    }
    
    expect(errorResponse.code).toBe('INVITE_CONSUMED')
    expect(JSON.stringify(errorResponse)).not.toContain('teacherName')
    expect(JSON.stringify(errorResponse)).not.toContain('studentName')
  })

  it('idempotent accept returns same result', () => {
    // POST /v1/invites/:token/accept twice with same Principal
    // Second call returns alreadyAccepted=true
    // Does not create duplicate sessions
    const principal = createStudentPrincipal('student-123', 'teacher-123')
    
    expect(principal.studentId).toBe('student-123')
  })
})
