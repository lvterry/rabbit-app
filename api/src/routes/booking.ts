/**
 * Booking Routes
 * 
 * Authority: parallel-plan-v2.md §12.8, impl-guide.md §5.8
 * 
 * Critical endpoints:
 * - POST /v1/bookings (teacher代约 vs 学员自主)
 * - GET /v1/bookings/:bookingId
 * - POST /v1/bookings/:bookingId/completion
 * - DELETE /v1/bookings/:bookingId/completion
 * - POST /v1/bookings/:bookingId/cancellation
 * - POST /v1/bookings/:bookingId/reschedule
 * 
 * Authority enforcement (parallel-plan-v2.md §5, §19):
 * - Teacher capability → studentId REQUIRED
 * - Student path → studentId FORBIDDEN
 * - source/by/asTeacher in request → VALIDATION_FAILED
 */

import { Router } from 'express'
import type { BookingRepository, TeacherRepository, StudentRepository, IdempotencyRepository } from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth, requireIdempotencyKey } from '../middleware'
import { canActAsTeacher } from '../auth'

export function createBookingRouter(deps: {
  bookingRepo: BookingRepository
  teacherRepo: TeacherRepository
  studentRepo: StudentRepository
  idempotencyRepo: IdempotencyRepository
}): Router {
  const router = Router()

  /**
   * POST /v1/bookings
   * 
   * Create booking with strict source derivation:
   * - Teacher capability + studentId present → TeacherCreated
   * - Student/User capability + no studentId → SelfBooked
   * - studentId forbidden on student path (auth-model.md §2.1)
   * - source/by/asTeacher in body → VALIDATION_FAILED
   * 
   * Requires: Idempotency-Key header
   */
  router.post('/', authMiddleware, requireAuth, requireIdempotencyKey, async (req, res) => {
    const principal = req.principal
    const { studentId, courseId, startAt, source, by, asTeacher } = req.body

    // Reject forbidden identity fields (parallel-plan-v2.md §19)
    if (source !== undefined || by !== undefined || asTeacher !== undefined) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'source, by, and asTeacher fields are forbidden - identity is derived server-side'
      )
    }

    // Determine booking path
    const isTeacherPath = principal.kind === 'User' && (await deps.teacherRepo.findByUserId(principal.userId!)) !== null

    if (isTeacherPath) {
      // Teacher代约 path - studentId REQUIRED
      if (!studentId) {
        throw new AppError(
          ErrorCode.VALIDATION_FAILED,
          'studentId is required for teacher-initiated bookings'
        )
      }

      // Create booking via repository (source derived as TeacherCreated)
      const idempotencyKey = (req as any).idempotencyKey
      const booking = await deps.bookingRepo.create(
        { studentId, courseId, startAt },
        principal,
        idempotencyKey
      )

      res.json(createSuccessEnvelope({ booking, bookingId: booking.bookingId }, req.requestId))
    } else {
      // Student path - studentId FORBIDDEN
      if (studentId !== undefined) {
        throw new AppError(
          ErrorCode.VALIDATION_FAILED,
          'studentId is forbidden for student-initiated bookings - student derived from session'
        )
      }

      // Create booking via repository (source derived as SelfBooked)
      const idempotencyKey = (req as any).idempotencyKey
      const booking = await deps.bookingRepo.create(
        { courseId, startAt },
        principal,
        idempotencyKey
      )

      res.json(createSuccessEnvelope({ booking, bookingId: booking.bookingId }, req.requestId))
    }
  })

  /**
   * GET /v1/bookings/:bookingId
   * 
   * Get booking detail with authorization check
   */
  router.get('/:bookingId', authMiddleware, requireAuth, async (req, res) => {
    const { bookingId } = req.params
    const principal = req.principal

    const booking = await deps.bookingRepo.findById(bookingId)

    if (!booking) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Booking not found')
    }

    // Authorization: must be teacher OR authorized student for this booking
    let authorized = false

    // Teacher path: User must own this teacherId
    if (principal.kind === 'User' && principal.userId) {
      const userTeacher = await deps.teacherRepo.findByUserId(principal.userId)
      if (userTeacher && userTeacher.teacherId === booking.teacherId) {
        authorized = true
      }
    }

    // Student path: must be this booking's student with verified binding
    if (!authorized) {
      if (principal.kind === 'Student') {
        // Student session must match booking's studentId
        authorized = principal.studentId === booking.studentId
      } else if (principal.kind === 'User' && principal.userId) {
        // User must be bound to this booking's student
        // Check if this user has a binding to the booking's student
        const studentBinding = await deps.studentRepo.findByTeacherAndUser(booking.teacherId, principal.userId)
        authorized = studentBinding !== null && studentBinding.student.studentId === booking.studentId
      }
    }

    if (!authorized) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Cannot access this booking')
    }

    res.json(createSuccessEnvelope({ booking }, req.requestId))
  })

  /**
   * POST /v1/bookings/:bookingId/completion
   * 
   * Complete booking (teacher only)
   * Requires: Idempotency-Key header
   */
  router.post('/:bookingId/completion', authMiddleware, requireAuth, requireIdempotencyKey, async (req, res) => {
    const { bookingId } = req.params
    const principal = req.principal
    const idempotencyKey = (req as any).idempotencyKey

    const result = await deps.bookingRepo.complete(bookingId, principal, idempotencyKey)

    res.json(createSuccessEnvelope(result, req.requestId))
  })

  /**
   * DELETE /v1/bookings/:bookingId/completion
   * 
   * Undo completion (teacher only, within undo window)
   * REQUIRES: Idempotency-Key header (no fallback)
   */
  router.delete('/:bookingId/completion', authMiddleware, requireAuth, requireIdempotencyKey, async (req, res) => {
    const { bookingId } = req.params
    const principal = req.principal
    const idempotencyKey = (req as any).idempotencyKey

    const result = await deps.bookingRepo.undoCompletion(bookingId, principal, idempotencyKey)

    res.json(createSuccessEnvelope(result, req.requestId))
  })

  /**
   * POST /v1/bookings/:bookingId/cancellation
   * 
   * Cancel booking (teacher or student)
   * Requires: Idempotency-Key header
   */
  router.post('/:bookingId/cancellation', authMiddleware, requireAuth, requireIdempotencyKey, async (req, res) => {
    const { bookingId } = req.params
    const { reason } = req.body
    const principal = req.principal
    const idempotencyKey = (req as any).idempotencyKey

    const result = await deps.bookingRepo.cancel(bookingId, principal, idempotencyKey)

    res.json(createSuccessEnvelope(result, req.requestId))
  })

  /**
   * POST /v1/bookings/:bookingId/reschedule
   * 
   * Reschedule booking to new time (teacher or student)
   * Requires: Idempotency-Key header
   */
  router.post('/:bookingId/reschedule', authMiddleware, requireAuth, requireIdempotencyKey, async (req, res) => {
    const { bookingId } = req.params
    const { newStartAt } = req.body
    const principal = req.principal
    const idempotencyKey = (req as any).idempotencyKey

    const result = await deps.bookingRepo.reschedule(bookingId, { newStartAt }, principal, idempotencyKey)

    res.json(createSuccessEnvelope(result, req.requestId))
  })

  return router
}
