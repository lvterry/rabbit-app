/**
 * Student Routes
 * 
 * Authority: parallel-plan-v2.md §12.5
 */

import { Router } from 'express'
import type { StudentRepository, CourseRepository, PackageRepository, TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireUser, requireAuth } from '../middleware'
import { assertCanActAsTeacher, getTeacherIdFromPrincipal } from '../auth'

export function createStudentRouter(deps: {
  studentRepo: StudentRepository
  courseRepo: CourseRepository
  packageRepo: PackageRepository
  teacherRepo: TeacherRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/students
   * 
   * List students for current teacher
   */
  router.get('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal
    
    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const students = await deps.studentRepo.listByTeacher(teacherId)
    
    res.json(createSuccessEnvelope({ items: students, hasMore: false }, req.requestId))
  }))

  /**
   * GET /v1/students/:studentId
   * 
   * Get student detail (teacher only)
   */
  router.get('/:studentId', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const { studentId } = req.params
    const principal = req.principal
    
    // Verify teacher capability and check ownership via listByTeacher
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const students = await deps.studentRepo.listByTeacher(teacherId)
    const student = students.find((s: any) => s.student.studentId === studentId)
    
    if (!student) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found or not owned by teacher')
    }
    
    res.json(createSuccessEnvelope({ student }, req.requestId))
  }))

  /**
   * POST /v1/students
   * 
   * Create student (send invite)
   */
  router.post('/', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { name, contact, courseId, initialSessions, note } = req.body

    // Resolve teacherId from User principal
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const result = await deps.studentRepo.create(teacherId, {
      name,
      contact,
      courseId,
      initialSessions,
      note,
    })
    
    res.json(createSuccessEnvelope(result, req.requestId))
  }))

  /**
   * PATCH /v1/students/:studentId
   * 
   * Update student (teacher only)
   */
  router.patch('/:studentId', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { studentId } = req.params
    const updates = req.body
    const principal = req.principal

    // Get student to check ownership (use listByTeacher to get StudentDetailView)
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const students = await deps.studentRepo.listByTeacher(teacherId)
    const existingStudent = students.find((s: any) => s.student.studentId === studentId)
    
    if (!existingStudent) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found or not owned by teacher')
    }
    
    const student = await deps.studentRepo.update(studentId, updates)
    
    res.json(createSuccessEnvelope({ student }, req.requestId))
  }))

  /**
   * POST /v1/students/:studentId/invite
   * 
   * Create/regenerate invite for student (teacher only)
   */
  router.post('/:studentId/invite', authMiddleware, requireUser, asyncHandler(async (req, res) => {
    const { studentId } = req.params
    const principal = req.principal

    // Check ownership by listing teacher's students
    const teacherId = await getTeacherIdFromPrincipal(principal, deps.teacherRepo)
    const students = await deps.studentRepo.listByTeacher(teacherId)
    const existingStudent = students.find((s: any) => s.student.studentId === studentId)
    
    if (!existingStudent) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found or not owned by teacher')
    }
    
    const invite = await deps.studentRepo.createInvite(studentId)
    
    res.json(createSuccessEnvelope({ invite }, req.requestId))
  }))

  return router
}
