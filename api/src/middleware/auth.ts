/**
 * Authentication Middleware
 * 
 * Authority: auth-model.md §1, §5, impl-guide.md §4.2
 * 
 * Resolves Principal from:
 * - Authorization: Bearer <access-token>
 * - Cookie: rb_session (Web refresh token)
 * - Invite token in URL path
 * 
 * Business routes only read ctx.principal, never raw tokens
 */

import type { Request, Response, NextFunction } from 'express'
import type { Principal } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import {
  createPublicPrincipal,
  createUserPrincipal,
  createStudentPrincipal,
  verifyAccessToken,
} from '../auth'
import { AppError } from '../http'

declare global {
  namespace Express {
    interface Request {
      principal: Principal
      requestId: string
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

/**
 * Authentication middleware
 * 
 * Always sets req.principal (defaults to Public if no valid token)
 * Does not throw - authorization checks happen in route handlers
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract access token from Authorization header
  const token = extractBearerToken(req.headers.authorization)

  if (!token) {
    // No token = Public principal
    req.principal = createPublicPrincipal()
    return next()
  }

  // Verify access token
  const payload = verifyAccessToken(token)

  if (!payload) {
    // Invalid or expired token = Public principal
    // Route handlers will check if authentication is required
    req.principal = createPublicPrincipal()
    return next()
  }

  // Create Principal from token payload
  if (payload.sessionType === 'user' && payload.userId) {
    req.principal = createUserPrincipal(payload.userId)
  } else if (payload.sessionType === 'student' && payload.studentId && payload.teacherId) {
    req.principal = createStudentPrincipal(payload.studentId, payload.teacherId)
  } else {
    // Malformed payload
    req.principal = createPublicPrincipal()
  }

  next()
}

/**
 * Require authentication
 * 
 * Throws UNAUTHENTICATED if principal is Public
 * Use this on routes that require any authenticated session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.principal.kind === 'Public') {
    throw new AppError(ErrorCode.UNAUTHENTICATED)
  }
  next()
}

/**
 * Require User session
 * 
 * Throws UNAUTHENTICATED if not a User principal
 * Use this on teacher-only routes
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (req.principal.kind !== 'User') {
    throw new AppError(ErrorCode.UNAUTHENTICATED)
  }
  next()
}

/**
 * Require Student session
 * 
 * Throws UNAUTHENTICATED if not a Student principal
 * Use this on student-only routes (rare - most accept User OR Student)
 */
export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  if (req.principal.kind !== 'Student') {
    throw new AppError(ErrorCode.UNAUTHENTICATED)
  }
  next()
}
