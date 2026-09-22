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
import { createSuccessEnvelope } from '../http'
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

  return router
}
