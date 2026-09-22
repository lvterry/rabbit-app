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
import { assertCanActAsTeacher, getTeacherIdFromPrincipal } from '../auth'

export function createCourseRouter(deps: {
  courseRepo: CourseRepository
  teacherRepo: TeacherRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/courses
   * 
   * List courses for current teacher
   */
  router.get('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const courses = await deps.courseRepo.listByTeacher(teacherId)
    
    res.json(createSuccessEnvelope({ items: courses, hasMore: false }, req.requestId))
  }))

  /**
   * POST /v1/courses
   * 
   * Create course
   */
  router.post('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { name, durationMinutes, allowSelfBooking } = req.body

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const course = await deps.courseRepo.create(teacherId, {
      name,
      durationMinutes,
      allowSelfBooking,
    })
    
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  /**
   * PATCH /v1/courses/:courseId
   * 
   * Update course (teacher only)
   */
  router.patch('/:courseId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { courseId } = req.params
    const updates = req.body
    const principal = req.principal

    // Get course to check ownership
    const existingCourse = await deps.courseRepo.findById(courseId)
    if (!existingCourse) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Course not found')
    }

    // Assert teacher owns this course
    await assertCanActAsTeacher(principal, existingCourse.teacherId, deps.teacherRepo)

    const course = await deps.courseRepo.update(courseId, updates)
    
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  /**
   * POST /v1/courses/:courseId/status
   * 
   * Update course status (teacher only)
   */
  router.post('/:courseId/status', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { courseId } = req.params
    const { status } = req.body
    const principal = req.principal

    // Get course to check ownership
    const existingCourse = await deps.courseRepo.findById(courseId)
    if (!existingCourse) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Course not found')
    }

    // Assert teacher owns this course
    await assertCanActAsTeacher(principal, existingCourse.teacherId, deps.teacherRepo)

    const course = await deps.courseRepo.updateStatus(courseId, status)
    
    res.json(createSuccessEnvelope({ course }, req.requestId))
  }))

  return router
}
