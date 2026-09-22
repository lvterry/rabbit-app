/**
 * Availability Routes
 * 
 * Authority: parallel-plan-v2.md §12.4
 */

import { Router } from 'express'
import type { AvailabilityRepository, TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser } from '../middleware'

export function createAvailabilityRouter(deps: {
  availabilityRepo: AvailabilityRepository
  teacherRepo: TeacherRepository
}): Router {
  const router = Router()

  router.get('/', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const data = await deps.availabilityRepo.listRules(teacher.teacherId)
    res.json(createSuccessEnvelope(data, req.requestId))
  })

  router.post('/rules', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const { weekday, startMinute, endMinute } = req.body
    const rule = await deps.availabilityRepo.createRule(teacher.teacherId, {
      weekday,
      startMinute,
      endMinute,
    })
    res.json(createSuccessEnvelope({ rule }, req.requestId))
  })

  router.patch('/rules/:ruleId', authMiddleware, requireUser, async (req, res) => {
    const rule = await deps.availabilityRepo.updateRule(req.params.ruleId, req.body)
    res.json(createSuccessEnvelope({ rule }, req.requestId))
  })

  router.delete('/rules/:ruleId', authMiddleware, requireUser, async (req, res) => {
    await deps.availabilityRepo.deleteRule(req.params.ruleId)
    res.json(createSuccessEnvelope({ deleted: true }, req.requestId))
  })

  router.post('/rules:copy', authMiddleware, requireUser, async (req, res) => {
    const { fromWeekday, toWeekdays } = req.body
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    await deps.availabilityRepo.copyRules(teacher.teacherId, fromWeekday, toWeekdays)
    res.json(createSuccessEnvelope({ created: toWeekdays.length }, req.requestId))
  })

  router.post('/exceptions', authMiddleware, requireUser, async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const { onDate, wholeDay, startMinute, endMinute, reason } = req.body
    const exception = await deps.availabilityRepo.createException(teacher.teacherId, {
      onDate,
      wholeDay,
      startMinute,
      endMinute,
      reason,
    })
    res.json(createSuccessEnvelope({ exception }, req.requestId))
  })

  router.delete('/exceptions/:exceptionId', authMiddleware, requireUser, async (req, res) => {
    await deps.availabilityRepo.deleteException(req.params.exceptionId)
    res.json(createSuccessEnvelope({ deleted: true }, req.requestId))
  })

  return router
}
