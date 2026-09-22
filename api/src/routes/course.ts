/**
 * Course Routes
 * 
 * Authority: parallel-plan-v2.md §12.3
 */

import { Router } from 'express'
import type { CourseRepository, TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser } from '../middleware'

export function createCourseRouter(deps: {
  courseRepo: CourseRepository
  teacherRepo: TeacherRepository
}): Router {
  const router = Router()

  router.get('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const courses = await deps.courseRepo.listByTeacher(teacher.teacherId)
    res.json(createSuccessEnvelope({ courses }, req.requestId))
  }))

  router.post('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const teacher = await deps.teacherRepo.findByUserId(req.principal.userId!)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher profile not found')
    }
    const { name, durationMinutes, allowSelfBooking } = req.body
    const course = await deps.courseRepo.create(teacher.teacherId, {
      name,
      durationMinutes,
      allowSelfBooking,
    })
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  router.patch('/:courseId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const course = await deps.courseRepo.update(req.params.courseId, req.body)
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  router.post('/:courseId/status', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { status } = req.body
    const course = await deps.courseRepo.updateStatus(req.params.courseId, status)
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  return router
}
