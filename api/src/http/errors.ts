/**
 * Error Mapping
 * 
 * Authority: impl-guide.md §4.4, parallel-plan-v2.md §11
 * 
 * Maps database errors and business logic errors to stable ErrorCodes
 * 
 * Critical mappings:
 * - 23P01 booking_no_overlap -> SLOT_TAKEN
 * - 23505 unique violations -> specific codes based on constraint name
 * - Named constraints -> stable ErrorCode
 */

import { ErrorCode } from '@rabbit/shared'

/**
 * Application error with ErrorCode
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * PostgreSQL error codes
 */
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const

/**
 * Map PostgreSQL error to ErrorCode
 * 
 * Authority: parallel-plan-v2.md §11
 * Named constraints provide stable error mapping
 */
export function mapPostgresError(error: any): ErrorCode {
  const code = error.code
  const constraint = error.constraint

  // Exclusion violation (booking time overlap)
  if (code === PG_ERROR_CODES.EXCLUSION_VIOLATION) {
    if (constraint === 'booking_no_overlap') {
      return ErrorCode.SLOT_TAKEN
    }
  }

  // Unique violations
  if (code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    if (constraint === 'idempotency_record_user_key' || constraint === 'idempotency_record_student_key') {
      // Idempotency key conflict - caller should check for replay vs reuse
      return ErrorCode.IDEMPOTENCY_KEY_REUSED
    }
    if (constraint === 'session_one_active_per_booking') {
      return ErrorCode.BOOKING_NOT_UPCOMING
    }
    if (constraint === 'student_teacher_user_key') {
      return ErrorCode.VALIDATION_FAILED
    }
  }

  // Check constraint violations
  if (code === PG_ERROR_CODES.CHECK_VIOLATION) {
    if (constraint === 'package_balance_range') {
      return ErrorCode.BALANCE_GUARD_FAILED
    }
  }

  // Permission violations (append-only ledger, REVOKE on balance columns)
  if (code === PG_ERROR_CODES.INSUFFICIENT_PRIVILEGE) {
    return ErrorCode.INTERNAL
  }

  // Foreign key violations
  if (code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return ErrorCode.VALIDATION_FAILED
  }

  // Default to internal error
  return ErrorCode.INTERNAL
}

/**
 * Check if error is a PostgreSQL error
 */
export function isPostgresError(error: unknown): error is { code: string; constraint?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  )
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (isPostgresError(error)) {
    const code = mapPostgresError(error)
    return new AppError(code, undefined, { pgCode: error.code, constraint: error.constraint })
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.INTERNAL, error.message)
  }

  return new AppError(ErrorCode.INTERNAL, 'Unknown error')
}
