/**
 * Idempotency Middleware
 * 
 * Authority: parallel-plan-v2.md §8, data-model.md §2.8
 * 
 * Implements Write A pattern:
 * - Check for existing idempotency record
 * - If found with same requestHash -> replay response
 * - If found with different requestHash -> 409 IDEMPOTENCY_KEY_REUSED
 * - If not found -> proceed (record will be written in route handler)
 * 
 * Idempotency-Key is required for specific write operations:
 * - POST /v1/bookings
 * - POST /v1/bookings/:id/completion
 * - DELETE /v1/bookings/:id/completion
 * - POST /v1/bookings/:id/cancellation
 * - POST /v1/bookings/:id/reschedule
 */

import type { Request, Response, NextFunction } from 'express'
import { ErrorCode } from '@rabbit/shared'
import { AppError } from '../http'
import type { IdempotencyRepository } from '../ports'
import { createHash } from 'crypto'

/**
 * Compute request hash for idempotency check
 * 
 * Hash includes endpoint + method + body to detect different requests with same key
 */
function computeRequestHash(req: Request): string {
  const content = JSON.stringify({
    method: req.method,
    path: req.path,
    body: req.body,
  })
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Create idempotency middleware
 * 
 * Checks for replay conditions and prevents key reuse
 * Attaches idempotencyKey to req for route handlers
 */
export function createIdempotencyMiddleware(idempotencyRepo: IdempotencyRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined

    if (!idempotencyKey) {
      // No key provided - route handler should validate if required
      return next()
    }

    // Attach key to request for route handler
    ;(req as any).idempotencyKey = idempotencyKey

    // Check for existing record
    const endpoint = `${req.method} ${req.path}`
    const requestHash = computeRequestHash(req)

    try {
      const existing = await idempotencyRepo.findExisting(req.principal, endpoint, idempotencyKey)

      if (!existing) {
        // No existing record - proceed normally
        ;(req as any).requestHash = requestHash
        return next()
      }

      // Found existing record - check if it's a replay or key reuse
      if (existing.requestHash === requestHash) {
        // Same request -> replay response
        res.status(existing.responseStatus).json(JSON.parse(existing.responseBody))
        return
      }

      // Different request with same key -> error
      throw new AppError(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        '同一幂等键被用于不同的请求',
        {
          currentEndpoint: endpoint,
        }
      )
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Require idempotency key on specific write operations
 * 
 * Throws VALIDATION_FAILED if Idempotency-Key header is missing
 */
export function requireIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key']

  if (!idempotencyKey) {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      'Idempotency-Key header is required for this operation'
    )
  }

  next()
}
