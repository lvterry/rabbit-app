/**
 * Push Device Routes
 * 
 * Authority: parallel-plan-v2.md §12.9, impl-guide.md §8.3
 */

import { Router } from 'express'
import type { Pool } from 'pg'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'
import { DeviceManager } from '../notifications/deviceManager'

export function createDeviceRouter(pool: Pool): Router {
  const router = Router()
  const deviceManager = new DeviceManager(pool)

  /**
   * POST /v1/me/devices
   * 
   * Register or update push notification device token
   * 
   * Request body:
   * - platform: "ios"
   * - token: APNs device token
   * - environment: "sandbox" | "production"
   * 
   * Behavior:
   * - Same token再上報 → upsert / refresh lastSeenAt
   * - Token換User → 原owner解綁後綁定新User
   */
  router.post('/', authMiddleware, requireAuth, async (req, res) => {
    const { platform, token, environment } = req.body
    const principal = req.principal

    if (platform !== 'ios') {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Only iOS platform is supported')
    }

    if (!token) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Device token is required')
    }

    if (environment !== 'sandbox' && environment !== 'production') {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Environment must be sandbox or production')
    }

    // Only User principals can register devices (teachers)
    if (principal.kind !== 'User') {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Only user accounts can register devices')
    }

    // Register device
    const device = await deviceManager.registerDevice(principal, platform, token, environment)

    res.json(
      createSuccessEnvelope(
        {
          deviceId: device.deviceId,
          registered: true,
        },
        req.requestId
      )
    )
  })

  return router
}
