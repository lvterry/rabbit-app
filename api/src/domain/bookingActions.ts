/**
 * Booking actions logic
 * 
 * Determines what actions are available for a booking based on:
 * - Current status
 * - Time relative to booking
 * - User capability (teacher vs student)
 * - Reschedule count
 * - Undo window
 * 
 * Reference: docs/impl-guide.md §5.8, docs/mvp.md §10
 */

export interface BookingActionsInput {
  status: 'Upcoming' | 'Completed' | 'Cancelled'
  startAt: Date
  endAt: Date
  rescheduleCount: number
  maxReschedules: number
  settledAt: Date | null
  undoCompleteDays: number
  isTeacher: boolean
  isStudent: boolean
  now: Date
}

export interface BookingActions {
  canComplete: boolean
  canMarkNoShow: boolean
  canCancel: boolean
  canReschedule: boolean
  rescheduleLimitReached: boolean
  canUndoComplete: boolean
  undoDeadline: string | null // ISO string
}

/**
 * Compute available actions for a booking
 * 
 * This is the ONLY place that determines action availability.
 * Clients MUST NOT reimplement this logic.
 * 
 * @param input Booking state and context
 * @returns Available actions
 */
export function computeBookingActions(input: BookingActionsInput): BookingActions {
  const {
    status,
    startAt,
    endAt,
    rescheduleCount,
    maxReschedules,
    settledAt,
    undoCompleteDays,
    isTeacher,
    isStudent,
    now
  } = input

  const hasStarted = now >= startAt
  const hasEnded = now >= endAt
  const rescheduleLimitReached = rescheduleCount >= maxReschedules

  // Calculate undo deadline (settledAt + undoCompleteDays)
  let undoDeadline: Date | null = null
  if (settledAt) {
    undoDeadline = new Date(settledAt.getTime() + undoCompleteDays * 24 * 60 * 60 * 1000)
  }
  const withinUndoWindow = undoDeadline ? now <= undoDeadline : false

  // Initialize all actions to false
  const actions: BookingActions = {
    canComplete: false,
    canMarkNoShow: false,
    canCancel: false,
    canReschedule: false,
    rescheduleLimitReached,
    canUndoComplete: false,
    undoDeadline: undoDeadline ? undoDeadline.toISOString() : null
  }

  // Upcoming booking actions
  if (status === 'Upcoming') {
    // Teacher actions
    if (isTeacher) {
      // Can complete: booking has ended (waiting for teacher to mark completion)
      actions.canComplete = hasEnded

      // Can mark no show: booking has ended (alternative to completion)
      actions.canMarkNoShow = hasEnded

      // Can cancel: anytime
      actions.canCancel = true

      // Can reschedule: anytime (no limit for teacher)
      actions.canReschedule = true
    }

    // Student actions
    if (isStudent) {
      // Can cancel: only before booking starts
      actions.canCancel = !hasStarted

      // Can reschedule: only before booking starts and within limit
      actions.canReschedule = !hasStarted && !rescheduleLimitReached
    }
  }

  // Completed booking actions
  if (status === 'Completed') {
    // Teacher can undo completion within window
    if (isTeacher && withinUndoWindow) {
      actions.canUndoComplete = true
    }
  }

  // Cancelled booking has no actions
  // (status === 'Cancelled' - all remain false)

  return actions
}

/**
 * Check if booking is in "pending settlement" state
 * (has ended but not yet completed or cancelled)
 * 
 * @param status Booking status
 * @param endAt Booking end time (UTC)
 * @param now Current time (UTC)
 * @returns true if pending settlement
 */
export function isPendingSettlement(
  status: string,
  endAt: Date,
  now: Date
): boolean {
  return status === 'Upcoming' && now >= endAt
}

/**
 * Check if booking should be auto-settled
 * Anchor point is end_at, not start_at (per docs/data-model.md §7.2)
 * 
 * @param status Booking status
 * @param endAt Booking end time (UTC)
 * @param autoSettleHours Hours after end_at to auto-settle
 * @param now Current time (UTC)
 * @returns true if should auto-settle
 */
export function shouldAutoSettle(
  status: string,
  endAt: Date,
  autoSettleHours: number,
  now: Date
): boolean {
  if (status !== 'Upcoming') {
    return false
  }

  if (autoSettleHours === 0) {
    return false // Auto-settle disabled
  }

  const autoSettleTime = new Date(endAt.getTime() + autoSettleHours * 60 * 60 * 1000)
  return now >= autoSettleTime
}
