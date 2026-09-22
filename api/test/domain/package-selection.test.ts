/**
 * Package Selection Tests
 * Verifies FIFO package selection and balance calculation
 */

import { describe, it, expect } from 'vitest'
import {
  selectPackageForBooking,
  calculateAggregateBalance,
  canAffordLateReschedule,
} from '../../src/domain/packageSelection'

describe('selectPackageForBooking', () => {
  it('should select earliest active package with sessions', () => {
    const packages = [
      {
        packageId: 'pkg-2',
        purchasedSessions: 5,
        remainingSessions: 0,
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 3,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        packageId: 'pkg-3',
        purchasedSessions: 8,
        remainingSessions: 5,
        createdAt: new Date('2026-03-03T00:00:00Z'),
      },
    ]

    const selected = selectPackageForBooking(packages, 0)
    expect(selected).toBe('pkg-1')
  })

  it('should skip exhausted packages', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 0,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        packageId: 'pkg-2',
        purchasedSessions: 5,
        remainingSessions: 3,
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
    ]

    const selected = selectPackageForBooking(packages, 0)
    expect(selected).toBe('pkg-2')
  })

  it('should account for reserved sessions', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 2,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        packageId: 'pkg-2',
        purchasedSessions: 5,
        remainingSessions: 3,
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
    ]

    const selected = selectPackageForBooking(packages, 2)
    expect(selected).toBe('pkg-2')
  })

  it('should return null when no available packages', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 0,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    const selected = selectPackageForBooking(packages, 0)
    expect(selected).toBeNull()
  })

  it('should return null when all available sessions are reserved', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 3,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    const selected = selectPackageForBooking(packages, 3)
    expect(selected).toBeNull()
  })
})

describe('calculateAggregateBalance', () => {
  it('should sum remaining sessions correctly', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 5,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        packageId: 'pkg-2',
        purchasedSessions: 8,
        remainingSessions: 3,
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
    ]

    const balance = calculateAggregateBalance(packages, 0)
    expect(balance.remaining).toBe(8)
    expect(balance.available).toBe(8)
    expect(balance.exhausted).toBe(false)
    expect(balance.fullyReserved).toBe(false)
  })

  it('should calculate available after reserved', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 5,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    const balance = calculateAggregateBalance(packages, 2)
    expect(balance.remaining).toBe(5)
    expect(balance.available).toBe(3)
    expect(balance.exhausted).toBe(false)
    expect(balance.fullyReserved).toBe(false)
  })

  it('should mark exhausted when remaining is 0', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 0,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    const balance = calculateAggregateBalance(packages, 0)
    expect(balance.remaining).toBe(0)
    expect(balance.available).toBe(0)
    expect(balance.exhausted).toBe(true)
    expect(balance.fullyReserved).toBe(false)
  })

  it('should mark fullyReserved when available is 0 but remaining > 0', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 3,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    const balance = calculateAggregateBalance(packages, 3)
    expect(balance.remaining).toBe(3)
    expect(balance.available).toBe(0)
    expect(balance.exhausted).toBe(false)
    expect(balance.fullyReserved).toBe(true)
  })

  it('should handle empty packages', () => {
    const balance = calculateAggregateBalance([], 0)
    expect(balance.remaining).toBe(0)
    expect(balance.available).toBe(0)
    expect(balance.exhausted).toBe(true)
    expect(balance.fullyReserved).toBe(false)
  })
})

describe('canAffordLateReschedule', () => {
  it('should return true when available >= 2', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 5,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    expect(canAffordLateReschedule(packages, 3)).toBe(true)
  })

  it('should return false when available < 2', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 2,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    expect(canAffordLateReschedule(packages, 1)).toBe(false)
  })

  it('should return false when exhausted', () => {
    const packages = [
      {
        packageId: 'pkg-1',
        purchasedSessions: 10,
        remainingSessions: 0,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]

    expect(canAffordLateReschedule(packages, 0)).toBe(false)
  })
})
