/**
 * Cancel Policy Tests
 * Verifies the determineCancellationPolicy logic
 */

import { describe, it, expect } from 'vitest'
import {
  determineCancellationPolicy,
  canStudentCancel,
  canTeacherCancel,
} from '../../src/domain/cancelPolicy'

describe('determineCancellationPolicy', () => {
  const now = new Date('2026-03-03T00:00:00Z')

  it('should return FREE_CANCEL when cancelled by student within window', () => {
    const startAt = new Date('2026-03-03T10:00:00Z')
    const policy = determineCancellationPolicy({
      startAt,
      freeCancelHours: 24,
      cancelledBy: 'Student',
      now,
    })

    expect(policy).toBe('FREE_CANCEL')
  })

  it('should return LATE_CANCEL when cancelled by student outside window', () => {
    const startAt = new Date('2026-03-03T01:00:00Z')
    const policy = determineCancellationPolicy({
      startAt,
      freeCancelHours: 24,
      cancelledBy: 'Student',
      now,
    })

    expect(policy).toBe('LATE_CANCEL')
  })

  it('should return TEACHER_CANCEL when cancelled by teacher', () => {
    const startAt = new Date('2026-03-03T10:00:00Z')
    const policy = determineCancellationPolicy({
      startAt,
      freeCancelHours: 24,
      cancelledBy: 'Teacher',
      now,
    })

    expect(policy).toBe('TEACHER_CANCEL')
  })

  it('should handle edge case at exact boundary', () => {
    const startAt = new Date('2026-03-04T00:00:00Z')
    const policy = determineCancellationPolicy({
      startAt,
      freeCancelHours: 24,
      cancelledBy: 'Student',
      now,
    })

    expect(policy).toBe('FREE_CANCEL')
  })

  it('should handle freeCancelHours=0', () => {
    const startAt = new Date('2026-03-03T10:00:00Z')
    const policy = determineCancellationPolicy({
      startAt,
      freeCancelHours: 0,
      cancelledBy: 'Student',
      now,
    })

    expect(policy).toBe('LATE_CANCEL')
  })
})

describe('canStudentCancel', () => {
  const now = new Date('2026-03-03T00:00:00Z')

  it('should allow student to cancel within free window', () => {
    const startAt = new Date('2026-03-03T10:00:00Z')
    expect(canStudentCancel(startAt, 24, now)).toBe(true)
  })

  it('should disallow student to cancel outside free window', () => {
    const startAt = new Date('2026-03-03T01:00:00Z')
    expect(canStudentCancel(startAt, 24, now)).toBe(false)
  })

  it('should disallow student to cancel past bookings', () => {
    const startAt = new Date('2026-03-02T10:00:00Z')
    expect(canStudentCancel(startAt, 24, now)).toBe(false)
  })
})

describe('canTeacherCancel', () => {
  const now = new Date('2026-03-03T00:00:00Z')

  it('should allow teacher to cancel upcoming bookings', () => {
    const startAt = new Date('2026-03-03T10:00:00Z')
    expect(canTeacherCancel(startAt, now)).toBe(true)
  })

  it('should disallow teacher to cancel past bookings', () => {
    const startAt = new Date('2026-03-02T10:00:00Z')
    expect(canTeacherCancel(startAt, now)).toBe(false)
  })

  it('should allow teacher to cancel bookings that just started', () => {
    const startAt = new Date('2026-03-03T00:00:00Z')
    expect(canTeacherCancel(startAt, now)).toBe(true)
  })
})
