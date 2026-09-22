/**
 * Idempotency Middleware
 * 
 * Authority: parallel-plan-v2.md §8, data-model.md §2.8
 * 
 * Implements Write A pattern:
 * - Pre-flight: Check for existing idempotency record
 * - If found with same requestHash + endpoint -> replay response
 * - If found with different requestHash/endpoint -> 409 IDEMPOTENCY_KEY_REUSED
 * - If not found -> proceed, route writes record
 * - On 23505 unique constraint: re-read winner's record and compare hash
 * 
 * Unique constraint is (principal+key) NOT (principal+key+endpoint).
 * This allows detection of cross-endpoint key reuse.
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
import { AppError, isPostgresError } from '../http'
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
 * 
 * On 23505 unique constraint violation during route execution:
 * - Re-read the winning record
 * - Same hash + endpoint -> replay (another identical request won)
 * - Different hash/endpoint -> IDEMPOTENCY_KEY_REUSED
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

    // Compute endpoint and hash for this request
    const endpoint = `${req.method} ${req.path}`
    const requestHash = computeRequestHash(req)
    
    // Attach for route handler use
    ;(req as any).endpoint = endpoint
    ;(req as any).requestHash = requestHash

    try {
      // Pre-flight check: look for existing record
      const existing = await idempotencyRepo.findExisting(req.principal, endpoint, idempotencyKey)

      if (!existing) {
        // No existing record - proceed to route handler
        // Route will attempt to write record; if 23505 occurs, see error handler below
        return next()
      }

      // Found existing record - check if replay or reuse
      if (existing.requestHash === requestHash) {
        // Replay: same request -> return cached response
        res.status(existing.responseStatus).json(JSON.parse(existing.responseBody))
        return
      }

      // Key reuse: different request with same key
      throw new AppError(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        '同一幂等键被用于不同的请求',
        {
          currentEndpoint: endpoint,
          currentHash: requestHash.substring(0, 8),
        }
      )
    } catch (error) {
      // Check if this is a 23505 from recordSuccess racing with another request
      if (isPostgresError(error) && error.code === '23505') {
        // Race detected: another request with same principal+key won
        // Re-read the winner's record to determine if replay or reuse
        try {
          const winner = await idempotencyRepo.findExisting(req.principal, endpoint, idempotencyKey)
          
          if (!winner) {
            // Should not happen - record was just written
            throw new AppError(ErrorCode.INTERNAL, 'Idempotency record not found after conflict')
          }

          // Compare hash and endpoint
          if (winner.requestHash === requestHash && winner.responseStatus) {
            // Same request won the race -> replay their response
            res.status(winner.responseStatus).json(JSON.parse(winner.responseBody))
            return
          }

          // Different request used same key
          throw new AppError(
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
            '同一幂等键被用于不同的请求',
            {
              currentEndpoint: endpoint,
              currentHash: requestHash.substring(0, 8),
            }
          )
        } catch (rereadError) {
          // Pass through the error (AppError or re-read failure)
          next(rereadError)
          return
        }
      }

      // Pass through other errors
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
