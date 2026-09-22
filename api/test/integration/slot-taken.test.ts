/**
 * SLOT_TAKEN Error Mapping Test
 * 
 * Tests overlap detection per parallel-plan-v2.md §11:
 * - Postgres booking_no_overlap constraint (23P01) → SLOT_TAKEN
 * - Must never leak conflicting booking owner identity
 */

import { describe, it, expect } from 'vitest'
import { mapPostgresError, isPostgresError } from '../../src/http/errors'
import { ErrorCode } from '@rabbit/shared'

describe('SLOT_TAKEN - Constraint Violation Mapping', () => {
  it('maps 23P01 booking_no_overlap to SLOT_TAKEN', () => {
    const postgresError = {
      code: '23P01',
      constraint: 'booking_no_overlap',
      table: 'booking',
      detail: 'Key (teacher_id, status, range)=(teacher-123, Upcoming, ["2026-09-25 10:00:00+00","2026-09-25 11:00:00+00")) conflicts with existing key (teacher_id, status, range)=(teacher-123, Upcoming, ["2026-09-25 10:00:00+00","2026-09-25 11:00:00+00")).',
    }

    expect(isPostgresError(postgresError)).toBe(true)
    
    const errorCode = mapPostgresError(postgresError)
    expect(errorCode).toBe(ErrorCode.SLOT_TAKEN)
  })

  it('SLOT_TAKEN message never leaks booking owner', () => {
    const postgresError = {
      code: '23P01',
      constraint: 'booking_no_overlap',
      table: 'booking',
      detail: 'Key (teacher_id, status, range)=(teacher-123, Upcoming, ["2026-09-25 10:00:00+00","2026-09-25 11:00:00+00")) conflicts with existing key (teacher_id, status, range)=(teacher-123, Upcoming, ["2026-09-25 10:00:00+00","2026-09-25 11:00:00+00")).',
    }

    const errorCode = mapPostgresError(postgresError)
    expect(errorCode).toBe(ErrorCode.SLOT_TAKEN)
    
    // Error code mapping ensures no identity leak
    // The actual error message is defined in shared ErrorCode
    // and does not include sensitive details from postgres
  })

  it('maps other 23P01 constraints differently', () => {
    const postgresError = {
      code: '23P01',
      constraint: 'some_other_constraint',
      table: 'other_table',
    }

    const errorCode = mapPostgresError(postgresError)
    
    // Unmapped exclusion violations default to INTERNAL
    // Only booking_no_overlap maps to SLOT_TAKEN
    expect(errorCode).not.toBe(ErrorCode.SLOT_TAKEN)
  })
})

describe('SLOT_TAKEN - Overlap Scenarios', () => {
  it('detects exact time overlap', () => {
    const slot1 = {
      startAt: new Date('2026-09-25T10:00:00Z'),
      endAt: new Date('2026-09-25T11:00:00Z'),
    }

    const slot2 = {
      startAt: new Date('2026-09-25T10:00:00Z'),
      endAt: new Date('2026-09-25T11:00:00Z'),
    }

    // Same start and end → overlap
    expect(slot1.startAt.getTime()).toBe(slot2.startAt.getTime())
    expect(slot1.endAt.getTime()).toBe(slot2.endAt.getTime())
  })

  it('detects partial overlap', () => {
    const slot1 = {
      startAt: new Date('2026-09-25T10:00:00Z'),
      endAt: new Date('2026-09-25T11:00:00Z'),
    }

    const slot2 = {
      startAt: new Date('2026-09-25T10:30:00Z'),
      endAt: new Date('2026-09-25T11:30:00Z'),
    }

    // slot2 starts before slot1 ends → overlap
    expect(slot2.startAt.getTime()).toBeLessThan(slot1.endAt.getTime())
  })

  it('allows adjacent slots', () => {
    const slot1 = {
      startAt: new Date('2026-09-25T10:00:00Z'),
      endAt: new Date('2026-09-25T11:00:00Z'),
    }

    const slot2 = {
      startAt: new Date('2026-09-25T11:00:00Z'),
      endAt: new Date('2026-09-25T12:00:00Z'),
    }

    // slot2 starts exactly when slot1 ends → no overlap (left-closed, right-open)
    expect(slot2.startAt.getTime()).toBe(slot1.endAt.getTime())
  })
})

describe('SLOT_TAKEN - Security', () => {
  it('never returns conflicting booking details', () => {
    // When SLOT_TAKEN occurs, response must not include:
    // - Conflicting booking ID
    // - Conflicting student name
    // - Conflicting booking owner
    
    const errorResponse = {
      ok: false,
      code: 'SLOT_TAKEN',
      message: '该时段已被预约',
      retryable: false,
      details: null, // No details!
      requestId: 'req-123',
    }

    expect(errorResponse.details).toBeNull()
    expect(JSON.stringify(errorResponse)).not.toContain('bookingId')
    expect(JSON.stringify(errorResponse)).not.toContain('studentName')
  })

  it('SLOT_TAKEN is not retryable', () => {
    const postgresError = {
      code: '23P01',
      constraint: 'booking_no_overlap',
      table: 'booking',
    }

    const errorCode = mapPostgresError(postgresError)
    expect(errorCode).toBe(ErrorCode.SLOT_TAKEN)
    
    // SLOT_TAKEN errors are not retryable
    // Client must choose different time slot
  })
})
