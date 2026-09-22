/**
 * Availability Routes
 * 
 * Authority: parallel-plan-v2.md §12.4
 */

import { Router } from 'express'
import type { AvailabilityRepository, TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser } from '../middleware'
import { assertCanActAsTeacher, getTeacherIdFromPrincipal } from '../auth'

export function createAvailabilityRouter(deps: {
  availabilityRepo: AvailabilityRepository
  teacherRepo: TeacherRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/availability
   * 
   * Get availability rules for current teacher
   */
  router.get('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const rules = await deps.availabilityRepo.listRules(teacherId)
    
    res.json(createSuccessEnvelope({ rules }, req.requestId))
  }))

  /**
   * POST /v1/availability/rules
   * 
   * Create availability rule
   */
  router.post('/rules', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { weekday, startMinute, endMinute } = req.body

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const rule = await deps.availabilityRepo.createRule(teacherId, {
      weekday,
      startMinute,
      endMinute,
    })
    
    res.json(createSuccessEnvelope({ rule }, req.requestId))
  }))

  /**
   * PATCH /v1/availability/rules/:ruleId
   * 
   * Update availability rule (teacher only - repository enforces ownership)
   */
  router.patch('/rules/:ruleId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { ruleId } = req.params
    const principal = req.principal

    // Verify teacher capability (repository checks rule ownership)
    await getTeacherIdFromPrincipal(principal, deps.teacherRepo)

    const rule = await deps.availabilityRepo.updateRule(ruleId, req.body)
    res.json(createSuccessEnvelope({ rule }, req.requestId))
  }))

  /**
   * DELETE /v1/availability/rules/:ruleId
   * 
   * Delete availability rule (teacher only - repository enforces ownership)
   */
  router.delete('/rules/:ruleId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { ruleId } = req.params
    const principal = req.principal

    // Verify teacher capability (repository checks rule ownership)
    await getTeacherIdFromPrincipal(principal, deps.teacherRepo)

    await deps.availabilityRepo.deleteRule(ruleId)
    res.json(createSuccessEnvelope({ deleted: true }, req.requestId))
  }))

  /**
   * POST /v1/availability/rules:copy
   * 
   * Copy rules from one weekday to others
   */
  router.post('/rules:copy', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { fromWeekday, toWeekdays } = req.body
    const principal = req.principal
    
    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    await deps.availabilityRepo.copyRules(teacherId, fromWeekday, toWeekdays)
    
    res.json(createSuccessEnvelope({ created: toWeekdays.length }, req.requestId))
  }))

  /**
   * POST /v1/availability/exceptions
   * 
   * Create availability exception
   */
  router.post('/exceptions', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { onDate, wholeDay, startMinute, endMinute, reason } = req.body

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const exception = await deps.availabilityRepo.createException(teacherId, {
      onDate,
      wholeDay,
      startMinute,
      endMinute,
      reason,
    })
    
    res.json(createSuccessEnvelope({ exception }, req.requestId))
  }))

  /**
   * DELETE /v1/availability/exceptions/:exceptionId
   * 
   * Delete availability exception (teacher only - repository enforces ownership)
   */
  router.delete('/exceptions/:exceptionId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { exceptionId } = req.params
    const principal = req.principal

    // Verify teacher capability (repository checks exception ownership)
    await getTeacherIdFromPrincipal(principal, deps.teacherRepo)

    await deps.availabilityRepo.deleteException(exceptionId)
    res.json(createSuccessEnvelope({ deleted: true }, req.requestId))
  }))

  return router
}
