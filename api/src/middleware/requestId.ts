/**
 * Request ID Middleware
 * 
 * Generates unique request ID for tracing and error correlation
 */

import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Generate request ID middleware
 * 
 * Creates unique req_XXX identifier for each request
 * Used in response envelopes and logs
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  next()
}
