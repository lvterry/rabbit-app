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
  hasStarted: boolean              // Has the booking started?
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
  const { startAt, freeCancelHours, cancelledBy, now, hasStarted } = input

  // Teacher cancellation is always free
  if (cancelledBy === 'Teacher') {
    return 'TEACHER_CANCEL'
  }

  // Student cancellation after start is not allowed (should be rejected earlier)
  if (hasStarted) {
    throw new Error('Student cannot cancel after booking has started')
  }

  // Calculate free cancellation deadline
  const freeCancelDeadline = new Date(startAt.getTime() - freeCancelHours * 60 * 60 * 1000)

  // Check if within free cancellation period
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
 * @param now Current time (UTC)
 * @returns true if can cancel (not started yet)
 */
export function canStudentCancel(startAt: Date, now: Date): boolean {
  return now < startAt
}

/**
 * Check if teacher can cancel booking
 * Teacher can always cancel Upcoming bookings
 * 
 * @param status Booking status
 * @returns true if can cancel
 */
export function canTeacherCancel(status: string): boolean {
  return status === 'Upcoming'
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
