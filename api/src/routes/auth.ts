/**
 * Authentication Routes
 * 
 * Authority: parallel-plan-v2.md §12.1, impl-guide.md §5.1
 * 
 * Phase 0-2 endpoints:
 * - POST /v1/auth/apple (iOS Sign in with Apple)
 * - POST /v1/auth/email/request (magic link request)
 * - POST /v1/auth/email/verify (magic link verification)
 * - POST /v1/auth/refresh (exchange refresh token for access token)
 * - GET /v1/me (current user info)
 * - GET /v1/meta (server metadata, version)
 */

import { Router } from 'express'
import type { TeacherRepository, StudentRepository } from '../ports'
import { createSuccessEnvelope } from '../http'
import { authMiddleware, requireAuth } from '../middleware'
import {
  generateUserAccessToken,
  generateUserRefreshToken,
  generateStudentAccessToken,
  generateStudentRefreshToken,
  verifyRefreshToken,
} from '../auth'
import { ErrorCode } from '@rabbit/shared'
import { AppError } from '../http'

export function createAuthRouter(deps: {
  teacherRepo: TeacherRepository
  studentRepo: StudentRepository
}): Router {
  const router = Router()

  /**
   * POST /v1/auth/apple
   * 
   * Sign in with Apple for iOS teacher app
   * 
   * STUB: Not implemented - hard fail with 501
   * Production requirements:
   * - Verify identityToken with Apple's public keys
   * - Extract sub (Apple user ID) from JWT
   * - Create or find user by apple_id
   * - Issue real User session tokens
   */
  router.post('/apple', async (req, res) => {
    // Hard fail with 501 Not Implemented - no silent mock success
    res.status(501).json({
      ok: false,
      code: 'NOT_IMPLEMENTED',
      message: 'Apple Sign In not yet implemented',
      retryable: false,
      details: {
        feature: 'apple-signin-ios',
        requiresImplementation: true,
      },
      requestId: req.requestId,
    })
  })

  /**
   * POST /v1/auth/email/request
   * 
   * Request magic link for email authentication
   * Used for student account upgrade or teacher alternative login
   */
  router.post('/email/request', async (req, res) => {
    const { email, inviteToken } = req.body

    // TODO: Generate magic link token
    // TODO: Send email with magic link
    // For MVP, just acknowledge request without revealing if email exists

    res.json(
      createSuccessEnvelope(
        {
          sent: true,
        },
        req.requestId
      )
    )
  })

  /**
   * POST /v1/auth/email/verify
   * 
   * Verify magic link token and create/upgrade session
   */
  router.post('/email/verify', async (req, res) => {
    const { token } = req.body

    // TODO: Verify magic link token
    // TODO: Create or upgrade user account

    throw new AppError(ErrorCode.INTERNAL, 'Email verification not yet implemented')
  })

  /**
   * POST /v1/auth/refresh
   * 
   * Exchange refresh token for new access token
   * 
   * Web: Reads refresh token from HttpOnly cookie
   * iOS: Accepts refresh token in request body
   */
  router.post('/refresh', async (req, res) => {
    // Try cookie first (Web), then body (iOS)
    const refreshToken = req.cookies?.rb_refresh || req.body?.refreshToken

    if (!refreshToken) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Refresh token required')
    }

    const payload = verifyRefreshToken(refreshToken)

    if (!payload) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token expired or invalid')
    }

    // Generate new access token
    let accessToken: string

    if (payload.sessionType === 'user' && payload.userId) {
      accessToken = generateUserAccessToken(payload.userId)
    } else if (payload.sessionType === 'student' && payload.studentId && payload.teacherId) {
      accessToken = generateStudentAccessToken(payload.studentId, payload.teacherId)
    } else {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Invalid refresh token payload')
    }

    res.json(
      createSuccessEnvelope(
        {
          accessToken,
          expiresIn: 900, // 15 minutes in seconds
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me
   * 
   * Get current user info (requires authentication)
   */
  router.get('/me', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    if (principal.kind === 'User') {
      // Fetch user's teacher profile and student bindings
      const teacher = await deps.teacherRepo.findByUserId(principal.userId!)
      const students: any[] = [] // TODO: Query students bound to this user

      res.json(
        createSuccessEnvelope(
          {
            user: {
              userId: principal.userId,
              nickname: teacher?.name || 'User',
              avatarUrl: teacher?.avatar || null,
            },
            isTeacher: teacher !== null,
            teacher,
            students,
          },
          req.requestId
        )
      )
    } else if (principal.kind === 'Student') {
      // Student session - return minimal info
      res.json(
        createSuccessEnvelope(
          {
            studentId: principal.studentId,
            teacherId: principal.teacherId,
          },
          req.requestId
        )
      )
    } else {
      throw new AppError(ErrorCode.UNAUTHENTICATED)
    }
  })

  /**
   * GET /v1/meta
   * 
   * Server metadata (public endpoint)
   * Returns version requirements and server time
   */
  router.get('/meta', (req, res) => {
    res.json(
      createSuccessEnvelope(
        {
          minIOSVersion: '1.0.0',
          minWebBuild: '2026.01.01',
          features: {},
          serverTime: new Date().toISOString(),
        },
        req.requestId
      )
    )
  })

  return router
}
