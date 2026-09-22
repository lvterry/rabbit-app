/**
 * API Response Envelope
 * 
 * Authority: impl-guide.md §6 (API Envelope)
 * parallel-plan-v2.md §6
 * 
 * Success: { ok: true, data, meta }
 * Error: { ok: false, code, message, retryable, details, requestId }
 */

import { ErrorCode, getErrorInfo } from '@rabbit/shared'

export interface SuccessEnvelope<T = unknown> {
  ok: true
  data: T
  meta: {
    generatedAt: string
    requestId: string
  }
}

export interface ErrorEnvelope {
  ok: false
  code: ErrorCode
  message: string
  retryable: boolean
  details: Record<string, unknown> | null
  requestId: string
}

/**
 * Create success response envelope
 */
export function createSuccessEnvelope<T>(data: T, requestId: string): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      requestId,
    },
  }
}

/**
 * Create error response envelope
 */
export function createErrorEnvelope(
  code: ErrorCode,
  message?: string,
  details?: Record<string, unknown> | null,
  requestId?: string
): ErrorEnvelope {
  const errorInfo = getErrorInfo(code)

  return {
    ok: false,
    code,
    message: message || errorInfo.message,
    retryable: errorInfo.retryable,
    details: details || null,
    requestId: requestId || 'unknown',
  }
}
