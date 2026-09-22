/**
 * Push Device Routes
 * 
 * Authority: parallel-plan-v2.md §12.9
 */

import { Router } from 'express'
import { createSuccessEnvelope } from '../http'
import { authMiddleware, requireAuth } from '../middleware'
import { randomUUID } from 'crypto'

export function createDeviceRouter(): Router {
  const router = Router()

  /**
   * POST /v1/me/devices
   * 
   * Register or update push notification device token
   * 
   * Request body:
   * - platform: "ios"
   * - token: APNs device token
   * - environment: "sandbox" | "production"
   */
  router.post('/', authMiddleware, requireAuth, async (req, res) => {
    const { platform, token, environment } = req.body
    const principal = req.principal

    // TODO: Store device token in push_device table
    // For now, just acknowledge registration

    const deviceId = randomUUID()

    res.json(
      createSuccessEnvelope(
        {
          deviceId,
          registered: true,
        },
        req.requestId
      )
    )
  })

  return router
}
