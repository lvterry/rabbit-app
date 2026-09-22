/**
 * Error Handler Middleware
 * 
 * Authority: impl-guide.md §4.4
 * 
 * Converts all errors to ErrorEnvelope responses
 * Must be registered after all routes
 */

import type { Request, Response, NextFunction } from 'express'
import { ErrorCode, getErrorHttpStatus } from '@rabbit/shared'
import { AppError, toAppError, createErrorEnvelope } from '../http'

/**
 * Global error handler
 * 
 * Catches all thrown errors and converts to ErrorEnvelope
 * Always returns JSON (never leaks stack traces)
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
