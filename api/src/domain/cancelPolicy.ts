/**
 * Cancellation policy logic
 * 
 * Reference: docs/mvp.md §11
 */

export type CancellationPolicyResult = 'FREE_CANCEL' | 'LATE_CANCEL' | 'TEACHER_CANCEL'

export interface CancelPolicyInput {
  startAt: Date                    // Booking start time (UTC)
  freeCancelHours: number          // Policy snapshot from booking
  cancelledBy: 'Student' | 'Teacher'
  now: Date                        // Current time (UTC)
  hasStarted?: boolean             // Has the booking started? (optional, computed if not provided)
}

/**
 * Determine cancellation policy result
 * 
 * Rules (docs/mvp.md §11):
 * - Teacher cancellation: always FREE (TEACHER_CANCEL)
 * - Student cancellation:
 *   - If now <= startAt - freeCancelHours: FREE_CANCEL
 *   - If startAt - freeCancelHours < now < startAt: LATE_CANCEL (charges 1 session)
 *   - If now >= startAt: Not allowed (should be caught earlier)
 * 
 * @param input Policy input
 * @returns Policy result
 */
export function determineCancellationPolicy(input: CancelPolicyInput): CancellationPolicyResult {
  const { startAt, freeCancelHours, cancelledBy, now } = input
  const hasStarted = input.hasStarted !== undefined ? input.hasStarted : now >= startAt

  // Teacher cancellation is always free
  if (cancelledBy === 'Teacher') {
    return 'TEACHER_CANCEL'
  }

  // Student cancellation after start is not allowed (should be rejected earlier)
  if (hasStarted) {
    throw new Error('Student cannot cancel after booking has started')
  }

  // Special case: freeCancelHours=0 means no free cancellation window
  if (freeCancelHours === 0) {
    return 'LATE_CANCEL'
  }

  // Calculate free cancellation deadline (docs/mvp.md §10.6, docs/data-model.md §5.3)
  // Rule: now <= startAt - freeCancelHours => FREE, otherwise LATE
  const freeCancelDeadline = new Date(startAt.getTime() - freeCancelHours * 60 * 60 * 1000)

  if (now <= freeCancelDeadline) {
    return 'FREE_CANCEL'
  } else {
    return 'LATE_CANCEL'
  }
}

/**
 * Check if student can cancel booking
 * 
 * @param startAt Booking start time (UTC)
 * @param freeCancelHours Free cancellation window (hours before start)
 * @param now Current time (UTC)
 * @returns true if can cancel (within free window or before start)
 */
export function canStudentCancel(startAt: Date, freeCancelHours: number, now: Date): boolean {
  // Student can cancel if booking hasn't started
  return now < startAt
}

/**
 * Check if teacher can cancel booking
 * Teacher can always cancel Upcoming bookings
 * 
 * @param startAt Booking start time (UTC) - ignored for teacher (always can cancel)
 * @param freeCancelHours Free cancellation hours - ignored for teacher
 * @param now Current time (UTC) - ignored for teacher
 * @returns true (teacher can always cancel upcoming)
 */
export function canTeacherCancel(startAt: Date, freeCancelHours: number, now: Date): boolean {
  return true // Teacher can always cancel upcoming bookings
}

/**
 * Determine reschedule policy (same as cancellation for the old booking)
 * Late reschedule = late cancellation of old booking + new booking
 * 
 * @param input Same as cancel policy
 * @returns Policy result for old booking
 */
export function determineReschedulePolicy(input: CancelPolicyInput): CancellationPolicyResult {
  return determineCancellationPolicy(input)
}
