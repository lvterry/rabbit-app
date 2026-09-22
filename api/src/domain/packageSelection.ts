/**
 * Package selection logic (FIFO)
 * 
 * Reference: docs/mvp.md §6.3
 */

export interface PackageBrief {
  id: string
  createdAt: Date
  remainingSessions: number
  status: 'Active' | 'Used Up' | 'Archived'
}

/**
 * Select package for new booking using FIFO strategy
 * 
 * Rules (docs/mvp.md §6.3):
 * - Select earliest created package with remaining > 0
 * - Only consider Active packages (not Archived or Used Up)
 * - If manually specified packageId, validate it's available
 * 
 * @param packages List of packages for (student, course)
 * @param manualPackageId Optional manually specified package ID
 * @returns Selected package ID or null if none available
 */
export function selectPackageForBooking(
  packages: PackageBrief[],
  manualPackageId?: string
): string | null {
  // If manual package specified, validate and use it
  if (manualPackageId) {
    const manual = packages.find(p => p.id === manualPackageId)
    if (!manual) {
      throw new Error(`Package ${manualPackageId} not found`)
    }
    if (manual.status !== 'Active') {
      throw new Error(`Package ${manualPackageId} is not Active (status: ${manual.status})`)
    }
    if (manual.remainingSessions <= 0) {
      throw new Error(`Package ${manualPackageId} has no remaining sessions`)
    }
    return manualPackageId
  }

  // FIFO: Select earliest created Active package with remaining > 0
  const eligible = packages
    .filter(p => p.status === 'Active' && p.remainingSessions > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return eligible.length > 0 ? eligible[0].id : null
}

/**
 * Calculate aggregate balance for (student, course)
 * 
 * @param packages All non-archived packages for (student, course)
 * @returns Aggregate balance
 */
export interface AggregateBalance {
  remaining: number  // Sum of remaining from Active packages
  reserved: number   // Count of Upcoming bookings
  available: number  // remaining - reserved
}

export function calculateAggregateBalance(
  packages: PackageBrief[],
  upcomingBookingCount: number
): AggregateBalance {
  // Sum remaining from non-archived packages
  const remaining = packages
    .filter(p => p.status !== 'Archived')
    .reduce((sum, p) => sum + p.remainingSessions, 0)

  const reserved = upcomingBookingCount
  const available = remaining - reserved

  return { remaining, reserved, available }
}

/**
 * Check if student has sufficient available sessions for booking
 * 
 * @param balance Aggregate balance
 * @returns true if available >= 1
 */
export function hasSufficientSessions(balance: AggregateBalance): boolean {
  return balance.available >= 1
}

/**
 * Check if late reschedule is possible
 * Late reschedule requires TWO sessions:
 * - One for penalty (old booking)
 * - One for new booking
 * 
 * Reference: docs/mvp.md §10.7, docs/data-model.md §5.5
 * 
 * @param balance Current aggregate balance (before penalty)
 * @returns true if available >= 2
 */
export function canAffordLateReschedule(balance: AggregateBalance): boolean {
  // Need at least 2 available: 1 for penalty, 1 for new booking
  // After penalty is deducted, remaining - reserved - 1 must still be >= 1
  // Equivalently: remaining - reserved >= 2
  return balance.available >= 2
}
