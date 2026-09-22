/**
 * Authentication Integration Tests
 * 
 * Tests Principal resolution and session management
 */

import { describe, it, expect } from 'vitest'
import { createPublicPrincipal, createUserPrincipal, createStudentPrincipal } from '../../src/auth/principal'
import {
  generateUserAccessToken,
  generateUserRefreshToken,
  generateStudentAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/auth/jwt'

describe('Auth - Principal', () => {
  it('creates Public principal with all nulls', () => {
    const principal = createPublicPrincipal()
    expect(principal.kind).toBe('Public')
    expect(principal.userId).toBeNull()
    expect(principal.studentId).toBeNull()
    expect(principal.teacherId).toBeNull()
    expect(principal.inviteId).toBeNull()
  })

  it('creates User principal with userId', () => {
    const userId = 'user-123'
    const principal = createUserPrincipal(userId)
    expect(principal.kind).toBe('User')
    expect(principal.userId).toBe(userId)
    expect(principal.studentId).toBeNull()
    expect(principal.teacherId).toBeNull()
  })

  it('creates Student principal with studentId and teacherId', () => {
    const studentId = 'student-123'
    const teacherId = 'teacher-123'
    const principal = createStudentPrincipal(studentId, teacherId)
    expect(principal.kind).toBe('Student')
    expect(principal.studentId).toBe(studentId)
    expect(principal.teacherId).toBe(teacherId)
    expect(principal.userId).toBeNull()
  })
})

describe('Auth - JWT', () => {
  it('generates and verifies User access token', () => {
    const userId = 'user-123'
    const token = generateUserAccessToken(userId)
    expect(token).toBeTruthy()

    const payload = verifyAccessToken(token)
    expect(payload).toBeTruthy()
    expect(payload?.type).toBe('access')
    expect(payload?.sessionType).toBe('user')
    expect(payload?.userId).toBe(userId)
  })

  it('generates and verifies User refresh token', () => {
    const userId = 'user-123'
    const token = generateUserRefreshToken(userId)
    expect(token).toBeTruthy()

    const payload = verifyRefreshToken(token)
    expect(payload).toBeTruthy()
    expect(payload?.type).toBe('refresh')
    expect(payload?.sessionType).toBe('user')
    expect(payload?.userId).toBe(userId)
  })

  it('generates and verifies Student access token', () => {
    const studentId = 'student-123'
    const teacherId = 'teacher-123'
    const token = generateStudentAccessToken(studentId, teacherId)
    expect(token).toBeTruthy()

    const payload = verifyAccessToken(token)
    expect(payload).toBeTruthy()
    expect(payload?.type).toBe('access')
    expect(payload?.sessionType).toBe('student')
    expect(payload?.studentId).toBe(studentId)
    expect(payload?.teacherId).toBe(teacherId)
  })

  it('rejects invalid token', () => {
    const payload = verifyAccessToken('invalid-token')
    expect(payload).toBeNull()
  })

  it('rejects refresh token as access token', () => {
    const token = generateUserRefreshToken('user-123')
    const payload = verifyAccessToken(token)
    expect(payload).toBeNull()
  })
})
