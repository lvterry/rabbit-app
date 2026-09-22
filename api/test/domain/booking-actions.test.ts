/**
 * Booking Actions Tests
 * Verifies computeBookingActions logic for UI state
 */

import { describe, it, expect } from 'vitest'
import {
  computeBookingActions,
  isPendingSettlement,
  shouldAutoSettle,
} from '../../src/domain/bookingActions'
import type { BookingView } from '@rabbit/shared'

describe('computeBookingActions', () => {
  const now = new Date('2026-03-03T00:00:00Z')

  const baseBooking: BookingView = {
    bookingId: 'test-booking',
    teacherId: 'teacher-1',
    studentId: 'student-1',
    courseId: 'course-1',
    startAt: '2026-03-03T10:00:00Z',
    endAt: '2026-03-03T11:00:00Z',
    status: 'Upcoming',
    freeCancelHours: 24,
    rescheduleCount: 0,
    rescheduledFrom: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
  }

  describe('as Teacher', () => {
    it('should allow complete for upcoming booking', () => {
      const actions = computeBookingActions(baseBooking, 'Teacher', 48, 7, now)
      expect(actions.canComplete).toBe(true)
      expect(actions.canCancel).toBe(true)
      expect(actions.canReschedule).toBe(true)
      expect(actions.canUndoComplete).toBe(false)
    })

    it('should allow undo within undo window', () => {
      const completedBooking: BookingView = {
        ...baseBooking,
        status: 'Completed',
        completedAt: '2026-03-02T10:00:00Z',
      }

      const actions = computeBookingActions(completedBooking, 'Teacher', 48, 7, now)
      expect(actions.canComplete).toBe(false)
      expect(actions.canCancel).toBe(false)
      expect(actions.canReschedule).toBe(false)
      expect(actions.canUndoComplete).toBe(true)
    })

    it('should not allow undo outside undo window', () => {
      const completedBooking: BookingView = {
        ...baseBooking,
        status: 'Completed',
        completedAt: '2026-02-20T10:00:00Z',
      }

      const actions = computeBookingActions(completedBooking, 'Teacher', 48, 7, now)
      expect(actions.canUndoComplete).toBe(false)
    })

    it('should not allow actions on cancelled booking', () => {
      const cancelledBooking: BookingView = {
        ...baseBooking,
        status: 'Cancelled',
        cancelledAt: '2026-03-02T10:00:00Z',
        cancelledBy: 'Teacher',
      }

      const actions = computeBookingActions(cancelledBooking, 'Teacher', 48, 7, now)
      expect(actions.canComplete).toBe(false)
      expect(actions.canCancel).toBe(false)
      expect(actions.canReschedule).toBe(false)
      expect(actions.canUndoComplete).toBe(false)
    })
  })

  describe('as Student', () => {
    it('should allow cancel within free window', () => {
      const actions = computeBookingActions(baseBooking, 'Student', 48, 7, now)
      expect(actions.canComplete).toBe(false)
      expect(actions.canCancel).toBe(true)
      expect(actions.canReschedule).toBe(true)
      expect(actions.canUndoComplete).toBe(false)
    })

    it('should allow cancel before start (even if late)', () => {
      // Student can cancel anytime before start (it's just FREE vs LATE policy)
      // Per docs/mvp.md §10.6 and §11
      const soonBooking: BookingView = {
        ...baseBooking,
        startAt: '2026-03-03T01:00:00Z', // 1 hour away
      }

      const actions = computeBookingActions(soonBooking, 'Student', 48, 7, now)
      expect(actions.canCancel).toBe(true) // Can cancel (will be LATE_CANCEL)
      expect(actions.canReschedule).toBe(true) // Can reschedule
    })

    it('should not allow reschedule if at max count', () => {
      const maxRescheduledBooking: BookingView = {
        ...baseBooking,
        rescheduleCount: 2, // Already rescheduled 2 times
      }

      // maxReschedules = 2, rescheduleCount = 2, so at limit
      const actions = computeBookingActions(maxRescheduledBooking, 'Student', 48, 2, now)
      expect(actions.canReschedule).toBe(false)
      expect(actions.rescheduleLimitReached).toBe(true)
    })

    it('should never allow student to complete or undo', () => {
      const actions = computeBookingActions(baseBooking, 'Student', 48, 7, now)
      expect(actions.canComplete).toBe(false)
      expect(actions.canUndoComplete).toBe(false)
    })
  })
})

describe('isPendingSettlement', () => {
  const now = new Date('2026-03-03T10:00:00Z')

  it('should return true for booking past end time', () => {
    const endAt = new Date('2026-03-03T09:00:00Z')
    expect(isPendingSettlement(endAt, now)).toBe(true)
  })

  it('should return false for future booking', () => {
    const endAt = new Date('2026-03-03T11:00:00Z')
    expect(isPendingSettlement(endAt, now)).toBe(false)
  })

  it('should return false for booking ending exactly now', () => {
    const endAt = new Date('2026-03-03T10:00:00Z')
    expect(isPendingSettlement(endAt, now)).toBe(false)
  })
})

describe('shouldAutoSettle', () => {
  const now = new Date('2026-03-03T10:00:00Z')

  it('should return true when past autoSettleHours', () => {
    const endAt = new Date('2026-03-03T01:00:00Z')
    expect(shouldAutoSettle(endAt, 8, now)).toBe(true)
  })

  it('should return false when within autoSettleHours', () => {
    const endAt = new Date('2026-03-03T03:00:00Z')
    expect(shouldAutoSettle(endAt, 8, now)).toBe(false)
  })

  it('should handle autoSettleHours=0', () => {
    const endAt = new Date('2026-03-03T09:59:59Z')
    expect(shouldAutoSettle(endAt, 0, now)).toBe(true)
  })
})
