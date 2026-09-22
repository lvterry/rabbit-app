/**
 * Package Routes
 * 
 * Authority: parallel-plan-v2.md §12.6
 */

import { Router } from 'express'
import type { Pool } from 'pg'
import type { PackageRepository, TeacherRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'

export function createPackageRouter(deps: { 
  packageRepo: PackageRepository
  teacherRepo: TeacherRepository
  pool: Pool
}): Router {
  const router = Router()

  // §12.6: POST /v1/students/:studentId/packages
  router.post('/students/:studentId/packages', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const { courseId, sessions, note } = req.body
    const principal = req.principal
    
    // Derive teacherId from principal (fail closed)
    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only teachers can create packages')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    const teacherId = teacher.teacherId
    
    const pkg = await deps.packageRepo.create(
      req.params.studentId,
      teacherId,
      { courseId, sessions, note }
    )
    const balance = await deps.packageRepo.getBalance(req.params.studentId, courseId)
    res.json(createSuccessEnvelope({ package: pkg, balance }, req.requestId))
  }))

  // §12.6: POST /v1/packages/:packageId/transactions
  router.post('/packages/:packageId/transactions', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const { mode, sessions, type, note } = req.body
    const principal = req.principal
    
    // P0 #4: Verify principal is a teacher
    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only teachers can modify package transactions')
    }
    
    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }
    
    // P0 #4: Verify THIS package belongs to THIS teacher
    const { rows } = await deps.pool.query(
      `SELECT teacher_id, student_id FROM lesson_package WHERE id = $1`,
      [req.params.packageId]
    )
    
    if (rows.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Package not found')
    }
    
    if (rows[0].teacher_id !== teacher.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to modify this package')
    }
    
    await deps.packageRepo.addTransaction(
      req.params.packageId,
      { mode, sessions, type, note },
      principal
    )
    const updatedPkg = await deps.packageRepo.findById(req.params.packageId)
    res.json(createSuccessEnvelope({ package: updatedPkg }, req.requestId))
  }))

  // §12.6: POST /v1/packages/:packageId/archival
  router.post('/packages/:packageId/archival', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const { archived } = req.body
    const principal = req.principal
    
    // P0 #4: Verify principal is a teacher
    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only teachers can archive packages')
    }
    
    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }
    
    // P0 #4: Verify THIS package belongs to THIS teacher
    const { rows } = await deps.pool.query(
      `SELECT teacher_id, student_id FROM lesson_package WHERE id = $1`,
      [req.params.packageId]
    )
    
    if (rows.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Package not found')
    }
    
    if (rows[0].teacher_id !== teacher.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to archive this package')
    }
    
    const pkg = archived
      ? await deps.packageRepo.archive(req.params.packageId)
      : await deps.packageRepo.restore(req.params.packageId)
    res.json(createSuccessEnvelope({ package: pkg }, req.requestId))
  }))

  // §12.6: GET /v1/students/:studentId/transactions
  router.get('/students/:studentId/transactions', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { studentId } = req.params
    
    // P0 #4: Verify principal is a teacher
    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only teachers can view student transactions')
    }
    
    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }
    
    // P0 #4: Verify THIS student belongs to THIS teacher
    const { rows } = await deps.pool.query(
      `SELECT teacher_id FROM student WHERE id = $1`,
      [studentId]
    )
    
    if (rows.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found')
    }
    
    if (rows[0].teacher_id !== teacher.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to view this student\'s transactions')
    }
    
    const transactions = await deps.packageRepo.listTransactionsByStudent(studentId)
    res.json(createSuccessEnvelope({ items: transactions, hasMore: false }, req.requestId))
  }))

  // §12.6: GET /v1/me/transactions
  router.get('/me/transactions', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal

    // Teacher path: User with teacher capability
    if (principal.kind === 'User' && principal.userId) {
      const teacher = await deps.teacherRepo.findByUserId(principal.userId)
      if (teacher) {
        // TODO: Get all transactions for this teacher's students
        res.json(createSuccessEnvelope({ items: [], hasMore: false }, req.requestId))
        return
      }
    }

    // Student path: Student session or User with student binding
    let studentId: string | null = null
    if (principal.kind === 'Student') {
      studentId = principal.studentId
    } else if (principal.kind === 'User' && principal.userId) {
      // TODO: Get first student binding
    }

    if (!studentId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'No student binding found')
    }

    const transactions = await deps.packageRepo.listTransactionsByStudent(studentId)
    res.json(createSuccessEnvelope({ items: transactions, hasMore: false }, req.requestId))
  }))

  return router
}
