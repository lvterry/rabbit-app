/**
 * JWT Token Management
 * 
 * Authority: impl-guide.md §4.2, auth-model.md §6.1
 * 
 * Two token types:
 * - Access token: Short-lived (15min), used in Authorization header
 * - Refresh token: Long-lived (180d), used to obtain new access tokens
 * 
 * Session types:
 * - User session: userId
 * - Student session: studentId + teacherId (scoped to one teacher)
 */

import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production'
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '180d'

export interface AccessTokenPayload {
  type: 'access'
  sessionType: 'user' | 'student'
  userId?: string
  studentId?: string
  teacherId?: string
}

export interface RefreshTokenPayload {
  type: 'refresh'
  sessionType: 'user' | 'student'
  userId?: string
  studentId?: string
  teacherId?: string
}

/**
 * Generate access token for User session
 */
export function generateUserAccessToken(userId: string): string {
  const payload: AccessTokenPayload = {
    type: 'access',
    sessionType: 'user',
    userId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

/**
 * Generate refresh token for User session
 */
export function generateUserRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = {
    type: 'refresh',
    sessionType: 'user',
    userId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL })
}

/**
 * Generate access token for Student session
 * Student sessions are scoped to (studentId, teacherId)
 */
export function generateStudentAccessToken(studentId: string, teacherId: string): string {
  const payload: AccessTokenPayload = {
    type: 'access',
    sessionType: 'student',
    studentId,
    teacherId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

/**
 * Generate refresh token for Student session
 */
export function generateStudentRefreshToken(studentId: string, teacherId: string): string {
  const payload: RefreshTokenPayload = {
    type: 'refresh',
    sessionType: 'student',
    studentId,
    teacherId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL })
}

/**
 * Verify and decode access token
 * Returns null if invalid or expired
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload
    if (payload.type !== 'access') {
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

/**
 * Verify and decode refresh token
 * Returns null if invalid or expired
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload
    if (payload.type !== 'refresh') {
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

/**
 * Check if JWT error is an expiration error
 */
export function isTokenExpired(error: unknown): boolean {
  return error instanceof jwt.TokenExpiredError
}
