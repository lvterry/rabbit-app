/**
 * Student Routes
 * 
 * Authority: parallel-plan-v2.md §12.5
 */

import { Router } from 'express'
import type { StudentRepository, CourseRepository, PackageRepository } from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser } from '../middleware'

export function createStudentRouter(deps: {
  studentRepo: StudentRepository
  courseRepo: CourseRepository
  packageRepo: PackageRepository
}): Router {
  const router = Router()

  router.get('/', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.studentRepo.listByTeacher(req.principal.userId!)
    res.json(createSuccessEnvelope({ students: teacher }, req.requestId))
  })

  router.get('/:studentId', authMiddleware, requireUser, async (req, res) => {
    const student = await deps.studentRepo.findById(req.params.studentId)
    if (!student) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found')
    }
    res.json(createSuccessEnvelope({ student }, req.requestId))
  })

  router.post('/', authMiddleware, requireUser, async (req, res) => {
    const { name, contact, courseId, initialSessions, note } = req.body
    const teacher = await deps.studentRepo.create(req.principal.userId!, {
      name,
      contact,
      courseId,
      initialSessions,
      note,
    })
    res.json(createSuccessEnvelope({ student: teacher }, req.requestId))
  })

  router.patch('/:studentId', authMiddleware, requireUser, async (req, res) => {
    const student = await deps.studentRepo.update(req.params.studentId, req.body)
    res.json(createSuccessEnvelope({ student }, req.requestId))
  })

  router.post('/:studentId/invites', authMiddleware, requireUser, async (req, res) => {
    const invite = await deps.studentRepo.createInvite(req.params.studentId)
    res.json(createSuccessEnvelope({ invite }, req.requestId))
  })

  return router
}
