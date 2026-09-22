/**
 * Session Routes
 * 
 * Authority: parallel-plan-v2.md §12.1
 * 
 * Session metadata endpoints (NOT under /auth):
 * - GET /v1/me (current session info)
 * - GET /v1/meta (session capabilities)
 */

import { Router } from 'express'
import type { TeacherRepository, StudentRepository } from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'

export function createSessionRouter(deps: {
  teacherRepo: TeacherRepository
  studentRepo: StudentRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/me
   * 
   * Get current session info
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
            kind: 'User',
            userId: principal.userId,
            teacher: teacher
              ? {
                  teacherId: teacher.teacherId,
                  name: teacher.name,
                  avatarUrl: teacher.avatar || null,
                }
              : null,
            students,
          },
          req.requestId
        )
      )
    } else if (principal.kind === 'Student') {
      // Fetch student info
      const student = await deps.studentRepo.findById(principal.studentId!)
      const teacher = await deps.teacherRepo.findById(principal.teacherId!)

      res.json(
        createSuccessEnvelope(
          {
            kind: 'Student',
            studentId: principal.studentId,
            studentName: student?.student.name || '',
            teacher: teacher
              ? {
                  teacherId: teacher.teacherId,
                  name: teacher.name,
                  avatarUrl: teacher.avatar || null,
                }
              : null,
          },
          req.requestId
        )
      )
    } else {
      res.json(
        createSuccessEnvelope(
          {
            kind: principal.kind,
          },
          req.requestId
        )
      )
    }
  })

  /**
   * GET /v1/meta
   * 
   * Get session capabilities
   */
  router.get('/meta', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    let canActAsTeacher = false
    let canActAsStudent = false

    if (principal.kind === 'User' && principal.userId) {
      // Check teacher capability
      const teacher = await deps.teacherRepo.findByUserId(principal.userId)
      canActAsTeacher = teacher !== null

      // Check student capability
      // User is a student if they have any student binding
      // (for simplicity, return false for now - routes will check specific binding)
      canActAsStudent = false
    } else if (principal.kind === 'Student') {
      canActAsStudent = true
    }

    res.json(
      createSuccessEnvelope(
        {
          version: '1.0.0',
          capabilities: {
            canActAsTeacher,
            canActAsStudent,
          },
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me/teacher-day
   * 
   * Get teacher's day view (today's bookings)
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-day', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // TODO: Wire to booking repo for today's bookings
    res.json(
      createSuccessEnvelope(
        {
          date: new Date().toISOString().substring(0, 10),
          bookings: [],
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me/teacher-calendar
   * 
   * Get teacher's calendar view (month bookings)
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-calendar', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // TODO: Wire to booking repo for calendar range
    res.json(
      createSuccessEnvelope(
        {
          month: new Date().toISOString().substring(0, 7),
          days: [],
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me/teacher-upcoming
   * 
   * Get teacher's upcoming bookings list
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-upcoming', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // TODO: Wire to booking repo for upcoming bookings
    res.json(
      createSuccessEnvelope(
        {
          items: [],
          hasMore: false,
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me/student-home
   * 
   * Get student's home view
   * §12.8 Phase 0-2
   */
  router.get('/me/student-home', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    // Student session or User with student binding
    let studentId: string | null = null
    let teacherId: string | null = null

    if (principal.kind === 'Student') {
      studentId = principal.studentId
      teacherId = principal.teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      // TODO: Get first student binding for this user
      // For now, return empty
    }

    if (!studentId || !teacherId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Student-only endpoint')
    }

    // TODO: Wire to booking + package repos
    res.json(
      createSuccessEnvelope(
        {
          upcomingBooking: null,
          recentBookings: [],
          balance: {},
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/me/student-bookings
   * 
   * Get student's bookings list
   * §12.8 Phase 0-2
   */
  router.get('/me/student-bookings', authMiddleware, requireAuth, async (req, res) => {
    const principal = req.principal

    // Student session or User with student binding
    let studentId: string | null = null
    let teacherId: string | null = null

    if (principal.kind === 'Student') {
      studentId = principal.studentId
      teacherId = principal.teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      // TODO: Get first student binding for this user
    }

    if (!studentId || !teacherId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Student-only endpoint')
    }

    // TODO: Wire to booking repo
    res.json(
      createSuccessEnvelope(
        {
          items: [],
          hasMore: false,
        },
        req.requestId
      )
    )
  })

  return router
}
