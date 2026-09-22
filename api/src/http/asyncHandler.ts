/**
 * Async Handler Wrapper
 * 
 * Wraps async route handlers to catch errors and pass them to Express error handler
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
