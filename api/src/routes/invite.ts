/**
 * Invite Routes
 * 
 * Authority: parallel-plan-v2.md §12.5, impl-guide.md §5.5
 * auth-model.md §3 (invite authentication)
 * 
 * Critical routes:
 * - GET /v1/invites/:token (preview, no auth required)
 * - POST /v1/invites/:token/accept (consume, creates session)
 */

import { Router } from 'express'
import type { StudentRepository, TeacherRepository, CourseRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'
import {
  generateStudentAccessToken,
  generateStudentRefreshToken,
  createInviteTokenPrincipal,
} from '../auth'

export function createInviteRouter(deps: {
  studentRepo: StudentRepository
  teacherRepo: TeacherRepository
  courseRepo: CourseRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/invites/:token
   * 
   * Preview invite (public endpoint, but checks session for consumed case)
   * 
   * Cases:
   * - Pending: Return teacher + student + course info
   * - Consumed + matching session: Return alreadyAccepted=true, redirectTo="/"
   * - Consumed + no session / wrong session: Error INVITE_CONSUMED (no identity leak)
   * - Expired / Revoked: Error
   */
  router.get('/:token', authMiddleware, asyncHandler(async (req, res) => {
    const { token } = req.params
    const principal = req.principal

    const invite = await deps.studentRepo.getInviteByToken(token)

    if (!invite) {
      throw new AppError(ErrorCode.INVITE_NOT_FOUND)
    }

    // Check status
    if (invite.status === 'Expired') {
      throw new AppError(ErrorCode.INVITE_EXPIRED)
    }

    if (invite.status === 'Revoked') {
      throw new AppError(ErrorCode.INVITE_REVOKED)
    }

    // Consumed case - check if this is the original student
    if (invite.status === 'Consumed') {
      // Check if current principal matches the student who consumed this invite
      const isOriginalStudent =
        (principal.kind === 'Student' &&
          principal.studentId === invite.studentId &&
          principal.teacherId === invite.teacherId) ||
        (principal.kind === 'User' &&
          (await deps.studentRepo.findByTeacherAndUser(invite.teacherId, principal.userId!)) !== null)

      if (isOriginalStudent) {
        // This is the student who consumed it - allow revisit
        res.json(
          createSuccessEnvelope(
            {
              alreadyAccepted: true,
              redirectTo: '/',
            },
            req.requestId
          )
        )
        return
      }

      // Not the original student - no identity leak
      throw new AppError(ErrorCode.INVITE_CONSUMED)
    }

    // Pending - return preview
    const teacher = await deps.teacherRepo.findById(invite.teacherId)
    const courses = await deps.courseRepo.listActiveByTeacher(invite.teacherId)

    if (!teacher) {
      throw new AppError(ErrorCode.INTERNAL, 'Teacher not found')
    }

    res.json(
      createSuccessEnvelope(
        {
          teacher: {
            teacherId: teacher.teacherId,
            name: teacher.name,
            avatarUrl: teacher.avatar,
          },
          studentName: invite.studentName,
          courses: courses.map((c) => ({
            courseId: c.courseId,
            courseName: c.name,
            // TODO: Add remaining sessions per course
          })),
          expiresAt: invite.expiresAt,
        },
        req.requestId
      )
    )
  }))

  /**
   * POST /v1/invites/:token/accept
   * 
   * Consume invite and create session
   * 
   * Two paths:
   * 1. Anonymous (no session): Create Student session
   * 2. Existing User session: Bind student to user, keep User session
   * 
   * Idempotent: If already consumed by this principal, return same result
   */
  router.post('/:token/accept', authMiddleware, asyncHandler(async (req, res) => {
    const { token } = req.params
    const principal = req.principal

    const invite = await deps.studentRepo.getInviteByToken(token)

    if (!invite) {
      throw new AppError(ErrorCode.INVITE_NOT_FOUND)
    }

    // Check if already consumed by this principal (idempotent)
    if (invite.status === 'Consumed') {
      // Check if current principal matches the student who consumed this invite
      const isOriginalStudent =
        (principal.kind === 'Student' &&
          principal.studentId === invite.studentId &&
          principal.teacherId === invite.teacherId) ||
        (principal.kind === 'User' &&
          (await deps.studentRepo.findByTeacherAndUser(invite.teacherId, principal.userId!)) !== null)

      if (isOriginalStudent) {
        // Idempotent success
        const teacher = await deps.teacherRepo.findById(invite.teacherId)
        res.json(
          createSuccessEnvelope(
            {
              alreadyAccepted: true,
              teacherId: invite.teacherId,
              teacherName: teacher?.name || '',
              studentId: invite.studentId,
              studentName: invite.studentName,
              redirectTo: '/',
            },
            req.requestId
          )
        )
        return
      }

      throw new AppError(ErrorCode.INVITE_CONSUMED)
    }

    // Check status
    if (invite.status === 'Expired') {
      throw new AppError(ErrorCode.INVITE_EXPIRED)
    }

    if (invite.status === 'Revoked') {
      throw new AppError(ErrorCode.INVITE_REVOKED)
    }

    // Consume invite
    const result = await deps.studentRepo.consumeInvite(token, principal)

    // If anonymous path, create Student session tokens
    let accessToken: string | undefined
    let refreshToken: string | undefined

    if (principal.kind === 'Public' || principal.kind === 'Student') {
      accessToken = generateStudentAccessToken(result.studentId, result.teacherId)
      refreshToken = generateStudentRefreshToken(result.studentId, result.teacherId)

      // Set HttpOnly cookie for Web (refresh token)
      res.cookie('rb_refresh', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days
        path: '/v1/auth',
      })
    }

    const teacher = await deps.teacherRepo.findById(result.teacherId)

    // Response: accessToken in JSON body, refreshToken ONLY in HttpOnly cookie
    res.json(
      createSuccessEnvelope(
        {
          alreadyAccepted: false,
          teacherId: result.teacherId,
          teacherName: teacher?.name || '',
          studentId: result.studentId,
          studentName: invite.studentName,
          redirectTo: '/',
          accessToken, // Short-lived token for immediate use (iOS/Web)
          // refreshToken: EXCLUDED - HttpOnly cookie only (Web long credential)
        },
        req.requestId
      )
    )
  }))

  /**
   * POST /v1/invites/:inviteId/revoke
   * 
   * Revoke an invite (teacher only)
   * §12.5 Phase 0-2
   */
  router.post('/:inviteId/revoke', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const { inviteId } = req.params
    const principal = req.principal

    // Only teachers can revoke invites
    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only teachers can revoke invites')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // Revoke the invite via repository
    await deps.studentRepo.revokeInvite(inviteId)

    res.json(
      createSuccessEnvelope(
        {
          inviteId,
          revoked: true,
        },
        req.requestId
      )
    )
  }))

  return router
}
