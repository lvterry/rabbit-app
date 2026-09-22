/**
 * Simplified Slots Routes (stub implementation)
 * 
 * TODO: Implement full slot computation with domain logic
 * For now, return empty slots to allow server to start
 */

import { Router } from 'express'
import { createSuccessEnvelope } from '../http'
import { authMiddleware, requireAuth } from '../middleware'

export function createSlotsRouter(): Router {
  const router = Router()

  router.get('/:teacherId/slots', authMiddleware, requireAuth, async (req, res) => {
    const { courseId, date } = req.query
    
    res.json(
      createSuccessEnvelope(
        {
          date,
          dateLabel: new Date(date as string).toLocaleDateString('zh-CN'),
          timezone: 'Asia/Shanghai',
          generatedAt: new Date().toISOString(),
          reason: 'NO_AVAILABILITY',
          reasonText: '当前日期没有可用时间',
          slots: [],
          balance: null,
        },
        req.requestId
      )
    )
  })

  router.get('/:teacherId/bookable-days', authMiddleware, requireAuth, async (req, res) => {
    res.json(
      createSuccessEnvelope(
        {
          timezone: 'Asia/Shanghai',
          generatedAt: new Date().toISOString(),
          reason: 'NO_AVAILABILITY',
          reasonText: '所选范围内没有可用时间',
          days: [],
          balance: null,
        },
        req.requestId
      )
    )
  })

  return router
}
