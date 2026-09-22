/**
 * Package Routes
 * 
 * Authority: parallel-plan-v2.md §12.6
 */

import { Router } from 'express'
import type { PackageRepository } from '../ports'
import { createSuccessEnvelope } from '../http'
import { authMiddleware, requireUser } from '../middleware'

export function createPackageRouter(deps: { packageRepo: PackageRepository }): Router {
  const router = Router()

  router.post('/students/:studentId/packages', authMiddleware, requireUser, async (req, res) => {
    const { courseId, sessions, note } = req.body
    
    // Get teacher ID from current user
    const teacher = await deps.packageRepo.findById('') // TODO: need teacherRepo
    const teacherId = 'placeholder-teacher-id' // TODO: derive from principal
    
    const pkg = await deps.packageRepo.create(
      req.params.studentId,
      teacherId,
      { courseId, sessions, note }
    )
    const balance = await deps.packageRepo.getBalance(req.params.studentId, courseId)
    res.json(createSuccessEnvelope({ package: pkg, balance }, req.requestId))
  })

  router.post('/packages/:packageId/transactions', authMiddleware, requireUser, async (req, res) => {
    const { mode, sessions, type, note } = req.body
    await deps.packageRepo.addTransaction(
      req.params.packageId,
      { mode, sessions, type, note },
      req.principal
    )
    const pkg = await deps.packageRepo.findById(req.params.packageId)
    res.json(createSuccessEnvelope({ package: pkg }, req.requestId))
  })

  router.post('/packages/:packageId/archival', authMiddleware, requireUser, async (req, res) => {
    const { archived } = req.body
    const pkg = archived
      ? await deps.packageRepo.archive(req.params.packageId)
      : await deps.packageRepo.restore(req.params.packageId)
    res.json(createSuccessEnvelope({ package: pkg }, req.requestId))
  })

  router.get('/students/:studentId/transactions', authMiddleware, requireUser, async (req, res) => {
    const transactions = await deps.packageRepo.listTransactionsByStudent(req.params.studentId)
    res.json(createSuccessEnvelope({ items: transactions, hasMore: false }, req.requestId))
  })

  return router
}
