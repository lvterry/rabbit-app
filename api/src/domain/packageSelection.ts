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
 * - Account for reserved sessions (upcoming bookings)
 * 
 * @param packages List of packages for (student, course) (can have packageId or id)
 * @param reservedCount Number of upcoming bookings (reserved sessions)
 * @returns Selected package ID or null if none available
 */
export function selectPackageForBooking(
  packages: any[],
  reservedCount: number = 0
): string | null {
  // Normalize package structure (support both id and packageId)
  const normalized = packages.map(p => ({
    id: p.id || p.packageId,
    createdAt: p.createdAt,
    remainingSessions: p.remainingSessions,
    status: p.status || 'Active'
  }))

  // Calculate total remaining across all packages
  const totalRemaining = normalized.reduce((sum, p) => sum + (p.remainingSessions || 0), 0)
  const available = totalRemaining - reservedCount

  // If no available sessions after accounting for reserved, return null
  if (available < 1) {
    return null
  }

  // FIFO: Select earliest created package with remaining > 0
  // When multiple packages exist and reserved sessions span across them,
  // skip packages that are "fully allocated" to existing reservations
  const sortedPackages = normalized
    .filter(p => p.status === 'Active' && p.remainingSessions > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  // If we have reserved sessions, try to account for them in FIFO order
  let remainingReserved = reservedCount
  for (const pkg of sortedPackages) {
    if (pkg.remainingSessions > remainingReserved) {
      // This package has capacity beyond reserved
      return pkg.id
    }
    // This package is fully allocated to reserved bookings
    remainingReserved -= pkg.remainingSessions
  }

  // All packages are fully reserved (shouldn't reach here if available >= 1)
  return sortedPackages.length > 0 ? sortedPackages[0].id : null
}

/**
 * Calculate aggregate balance for (student, course)
 * 
 * @param packages All non-archived packages for (student, course)
 * @returns Aggregate balance
 */
export interface AggregateBalance {
  remaining: number    // Sum of remaining from Active packages
  reserved: number     // Count of Upcoming bookings
  available: number    // remaining - reserved
  exhausted: boolean   // remaining === 0
  fullyReserved: boolean // remaining > 0 but available === 0
}

export function calculateAggregateBalance(
  packages: any[],
  upcomingBookingCount: number
): AggregateBalance {
  // Normalize package structure
  const normalized = packages.map(p => ({
    remainingSessions: p.remainingSessions || 0,
    status: p.status || 'Active'
  }))

  // Sum remaining from non-archived packages
  const remaining = normalized
    .filter(p => p.status !== 'Archived')
    .reduce((sum, p) => sum + p.remainingSessions, 0)

  const reserved = upcomingBookingCount
  const available = remaining - reserved

  return {
    remaining,
    reserved,
    available,
    exhausted: remaining === 0,
    fullyReserved: remaining > 0 && available === 0
  }
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
 * @param packages Package list or balance object
 * @param reservedCount Number of reserved sessions (if packages provided)
 * @returns true if available >= 2
 */
export function canAffordLateReschedule(
  packagesOrBalance: any[] | AggregateBalance,
  reservedCount?: number
): boolean {
  let balance: AggregateBalance
  
  if (Array.isArray(packagesOrBalance)) {
    // Called with packages array
    balance = calculateAggregateBalance(packagesOrBalance, reservedCount || 0)
  } else {
    // Called with balance object
    balance = packagesOrBalance
  }
  
  // Need at least 2 available: 1 for penalty, 1 for new booking
  return balance.available >= 2
}
