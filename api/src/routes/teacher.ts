/**
 * Teacher Routes
 * 
 * Authority: parallel-plan-v2.md §12.2
 */

import { Router } from 'express'
import type { TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser } from '../middleware'

export function createTeacherRouter(deps: { teacherRepo: TeacherRepository }): Router {
  const router = Router()

  router.get('/', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }

    const ruleOptions = {
      slotStepMinutes: [15, 20, 30, 60],
      minLeadHours: [0, 1, 2, 6, 12, 24],
      maxAdvanceDays: [7, 14, 30, 60],
      freeCancelHours: [6, 12, 24, 48],
      autoSettleHours: [0, 6, 12, 24, 48],
    }

    res.json(createSuccessEnvelope({ teacher, ruleOptions }, req.requestId))
  })

  router.post('/', authMiddleware, requireUser, async (req, res) => {
    const { name, avatarUrl, bio } = req.body
    const teacher = await deps.teacherRepo.create(req.principal.userId!, { name, avatarUrl, bio })
    res.json(createSuccessEnvelope({ teacher, created: true }, req.requestId))
  })

  router.patch('/', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const updated = await deps.teacherRepo.update(teacher.teacherId, req.body)
    res.json(createSuccessEnvelope({ teacher: updated }, req.requestId))
  })

  return router
}
