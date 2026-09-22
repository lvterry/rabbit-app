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
export function computeBookingActions(
  bookingOrInput: any,
  capability?: 'Teacher' | 'Student',
  maxReschedulesParam?: number,
  undoCompleteDaysParam?: number,
  nowParam?: Date
): BookingActions {
  // Overload: handle both object input and individual parameters
  let input: BookingActionsInput
  
  if (capability !== undefined) {
    // Called with individual parameters (test/convenience format)
    const booking = bookingOrInput
    input = {
      status: booking.status,
      startAt: new Date(booking.startAt),
      endAt: new Date(booking.endAt),
      rescheduleCount: booking.rescheduleCount || 0,
      maxReschedules: maxReschedulesParam!,
      settledAt: booking.completedAt ? new Date(booking.completedAt) : (booking.settledAt ? new Date(booking.settledAt) : null),
      undoCompleteDays: undoCompleteDaysParam!,
      isTeacher: capability === 'Teacher',
      isStudent: capability === 'Student',
      now: nowParam!
    }
  } else {
    // Called with single object (production format)
    input = bookingOrInput
  }
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
      // Can complete: anytime for Upcoming bookings (teachers can mark complete early)
      actions.canComplete = true

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
 * @param statusOrEndAt Booking status or end time (overload support)
 * @param endAtOrNow End time or now (overload support)
 * @param nowParam Current time (optional, for 3-param overload)
 * @returns true if pending settlement
 */
export function isPendingSettlement(
  statusOrEndAt: string | Date,
  endAtOrNow: Date,
  nowParam?: Date
): boolean {
  if (typeof statusOrEndAt === 'string') {
    // 3-param: (status, endAt, now)
    return statusOrEndAt === 'Upcoming' && nowParam! >= endAtOrNow
  } else {
    // 2-param: (endAt, now) - assumes Upcoming status
    return endAtOrNow > statusOrEndAt // Use > not >= (exactly at end is not pending)
  }
}

/**
 * Check if booking should be auto-settled
 * Anchor point is end_at, not start_at (per docs/data-model.md §7.2)
 * 
 * @param statusOrEndAt Booking status or end time (overload support)
 * @param endAtOrHours End time or autoSettleHours (overload support)
 * @param autoSettleHoursOrNow Auto-settle hours or now (overload support)
 * @param nowParam Current time (optional, for 4-param overload)
 * @returns true if should auto-settle
 */
export function shouldAutoSettle(
  statusOrEndAt: string | Date,
  endAtOrHours: Date | number,
  autoSettleHoursOrNow: number | Date,
  nowParam?: Date
): boolean {
  let endAt: Date
  let autoSettleHours: number
  let now: Date

  if (typeof statusOrEndAt === 'string') {
    // 4-param: (status, endAt, autoSettleHours, now)
    if (statusOrEndAt !== 'Upcoming') {
      return false
    }
    endAt = endAtOrHours as Date
    autoSettleHours = autoSettleHoursOrNow as number
    now = nowParam!
  } else {
    // 3-param: (endAt, autoSettleHours, now) - assumes Upcoming status
    endAt = statusOrEndAt
    autoSettleHours = endAtOrHours as number
    now = autoSettleHoursOrNow as Date
  }

  // Special case: autoSettleHours=0 means immediate settlement after end
  if (autoSettleHours === 0) {
    return now > endAt
  }

  const autoSettleTime = new Date(endAt.getTime() + autoSettleHours * 60 * 60 * 1000)
  return now >= autoSettleTime
}
