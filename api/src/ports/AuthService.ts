/**
 * Authentication Service Port
 * Handles user authentication and session management
 */

import type { Principal } from '@rabbit/shared'

export interface AuthService {
  /**
   * Verify and decode a JWT access token
   */
  verifyAccessToken(token: string): Promise<Principal>

  /**
   * Refresh an access token using a refresh token
   */
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
  }>

  /**
   * Create a new session for Sign in with Apple
   */
  signInWithApple(appleToken: string): Promise<{
    accessToken: string
    refreshToken: string
    userId: string
  }>

  /**
   * Request email magic link
   */
  requestEmailMagicLink(email: string): Promise<void>

  /**
   * Verify email magic link token
   */
  verifyEmailMagicLink(token: string): Promise<{
    accessToken: string
    refreshToken: string
    userId: string
  }>

  /**
   * Create student session from invite token consumption
   */
  createStudentSession(studentId: string, teacherId: string): Promise<{
    accessToken: string
    refreshToken: string
  }>

  /**
   * Upgrade student session to user account
   */
  upgradeStudentSessionToUser(
    studentId: string,
    userId: string
  ): Promise<{
    accessToken: string
    refreshToken: string
  }>

  /**
   * Revoke a session
   */
  revokeSession(sessionId: string): Promise<void>
}
