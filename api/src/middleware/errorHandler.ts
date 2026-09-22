/**
 * Error Handler Middleware
 * 
 * Authority: impl-guide.md §4.4
 * 
 * Converts all errors to ErrorEnvelope responses
 * Must be registered after all routes
 * 
 * Special handling for idempotency 23505 race:
 * - When recordSuccess hits unique constraint during route execution
 * - Re-read winner's record to determine replay vs key reuse
 */

import type { Request, Response, NextFunction } from 'express'
import { ErrorCode, getErrorHttpStatus } from '@rabbit/shared'
import { AppError, toAppError, createErrorEnvelope, isPostgresError } from '../http'
import type { IdempotencyRepository } from '../ports'

/**
 * Create error handler with idempotency support
 * 
 * Line 840-863: Handles 23505 from recordSuccess during route execution
 */
export function createErrorHandler(idempotencyRepo?: IdempotencyRepository) {
  return (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    // Wrap async logic to prevent unhandled promise rejections
    handleErrorAsync(error, req, res, next, idempotencyRepo).catch(err => {
      console.error('[ErrorHandler] Fatal error in error handler:', err)
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          code: 'INTERNAL',
          message: 'Internal server error',
          retryable: false,
          requestId: req.requestId || 'unknown'
        })
      }
    })
  }
}

/**
 * Async error handling logic
 */
async function handleErrorAsync(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
  idempotencyRepo?: IdempotencyRepository
): Promise<void> {
    const requestId = req.requestId || 'unknown'

    // Check for idempotency 23505 race (from recordSuccess in route)
    if (idempotencyRepo && isPostgresError(error) && error.code === '23505') {
      const idempotencyKey = (req as any).idempotencyKey
      const endpoint = (req as any).endpoint
      const requestHash = (req as any).requestHash

      // Only handle if this request was using idempotency
      if (idempotencyKey && endpoint && requestHash && req.principal) {
        try {
          // Line 840: Re-read the winner's record
          // NOTE: findExisting filters by endpoint, but unique constraint is (principal+key)
          // Cross-endpoint reuse will 23505 but re-read may return null - see notes/contract-blockers/maya.md
          const winner = await idempotencyRepo.findExisting(req.principal, endpoint, idempotencyKey)

          if (winner) {
            // Found winner for same endpoint
            if (winner.requestHash === requestHash) {
              // Line 850: Same request won the race -> replay their response
              res.status(winner.responseStatus).json(JSON.parse(winner.responseBody))
              return
            }

            // Line 856: Different hash with same key on same endpoint -> key reuse
            const appError = new AppError(
              ErrorCode.IDEMPOTENCY_KEY_REUSED,
              '同一幂等键被用于不同的请求',
              { currentEndpoint: endpoint }
            )
            const httpStatus = getErrorHttpStatus(appError.code)
            const envelope = createErrorEnvelope(appError.code, appError.message, appError.details, requestId)
            res.status(httpStatus).json(envelope)
            return
          }

          // Winner not found for this endpoint (cross-endpoint reuse scenario)
          // Port limitation: findExisting filters by endpoint, can't find cross-endpoint winner
          // See notes/contract-blockers/maya.md for details
          const appError = new AppError(
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
            '同一幂等键被用于不同的请求（跨端点）',
            { currentEndpoint: endpoint }
          )
          const httpStatus = getErrorHttpStatus(appError.code)
          const envelope = createErrorEnvelope(appError.code, appError.message, appError.details, requestId)
          res.status(httpStatus).json(envelope)
          return
        } catch (rereadError) {
          // Failed to re-read - fall through to normal error handling
          console.error('[Idempotency] Re-read failed:', rereadError)
        }
      }
    }

    // Normal error handling
    const appError = toAppError(error)
    const httpStatus = getErrorHttpStatus(appError.code)

    const envelope = createErrorEnvelope(appError.code, appError.message, appError.details, requestId)

    // Log error for debugging (but don't expose to client)
    if (appError.code === ErrorCode.INTERNAL) {
      console.error('[ERROR]', requestId, error)
    }

    res.status(httpStatus).json(envelope)
}

/**
 * Default error handler (without idempotency support)
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const appError = toAppError(error)
  const httpStatus = getErrorHttpStatus(appError.code)
  const requestId = req.requestId || 'unknown'

  const envelope = createErrorEnvelope(appError.code, appError.message, appError.details, requestId)

  // Log error for debugging (but don't expose to client)
  if (appError.code === ErrorCode.INTERNAL) {
    console.error('[ERROR]', requestId, error)
  }

  res.status(httpStatus).json(envelope)
}

/**
 * 404 Not Found handler
 * 
 * Catches unmatched routes and returns structured error
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.requestId || 'unknown'
  const envelope = createErrorEnvelope(
    ErrorCode.VALIDATION_FAILED,
    'Route not found',
    { path: req.path, method: req.method },
    requestId
  )

  res.status(404).json(envelope)
}
