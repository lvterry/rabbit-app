/**
 * Error Mapping Tests
 * 
 * Tests PostgreSQL error code mapping per parallel-plan-v2.md §11
 */

import { describe, it, expect } from 'vitest'
import { mapPostgresError, AppError, isPostgresError } from '../../src/http/errors'
import { ErrorCode } from '@rabbit/shared'

describe('Error Mapping - PostgreSQL', () => {
  it('maps booking_no_overlap exclusion violation to SLOT_TAKEN', () => {
    const pgError = { code: '23P01', constraint: 'booking_no_overlap' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.SLOT_TAKEN)
  })

  it('maps idempotency unique violation to IDEMPOTENCY_KEY_REUSED', () => {
    const pgError = { code: '23505', constraint: 'idempotency_record_user_key' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSED)
  })

  it('maps session_one_active_per_booking to BOOKING_NOT_UPCOMING', () => {
    const pgError = { code: '23505', constraint: 'session_one_active_per_booking' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.BOOKING_NOT_UPCOMING)
  })

  it('maps package_balance_range check violation to BALANCE_GUARD_FAILED', () => {
    const pgError = { code: '23514', constraint: 'package_balance_range' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.BALANCE_GUARD_FAILED)
  })

  it('maps foreign key violation to VALIDATION_FAILED', () => {
    const pgError = { code: '23503', constraint: 'some_fk' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.VALIDATION_FAILED)
  })

  it('maps permission violation to INTERNAL', () => {
    const pgError = { code: '42501' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.INTERNAL)
  })

  it('maps unknown error to INTERNAL', () => {
    const pgError = { code: '99999' }
    const errorCode = mapPostgresError(pgError)
    expect(errorCode).toBe(ErrorCode.INTERNAL)
  })

  it('identifies PostgreSQL errors', () => {
    expect(isPostgresError({ code: '23505', constraint: 'test' })).toBe(true)
    expect(isPostgresError({ code: '23P01' })).toBe(true)
    expect(isPostgresError(new Error('test'))).toBe(false)
    expect(isPostgresError('string')).toBe(false)
    expect(isPostgresError(null)).toBe(false)
  })
})

describe('AppError', () => {
  it('creates AppError with code and message', () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, 'Test error')
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED)
    expect(error.message).toBe('Test error')
    expect(error.details).toBeUndefined()
  })

  it('creates AppError with details', () => {
    const details = { field: 'email' }
    const error = new AppError(ErrorCode.VALIDATION_FAILED, 'Test error', details)
    expect(error.details).toEqual(details)
  })
})
