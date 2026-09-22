/**
 * Slot generation algorithm
 * 
 * This is the ONLY implementation of slot computation.
 * L1 (display), L2 (pre-check), and L3 (transaction) ALL use this same function.
 * 
 * Reference: docs/slot-algorithm.md §3
 */

import {
  localDateMinutesToUTC,
  utcToLocalTime,
  formatTimeRange,
  rangesOverlap,
  getLocalWeekday
} from './time.js'

export interface AvailabilityRule {
  startMinute: number // 0-1439, local time
  endMinute: number   // 0-1439, local time
}

export interface AvailabilityException {
  startMinute: number | null // null = whole day closed
  endMinute: number | null
}

export interface Interval {
  startAt: Date  // UTC
  endAt: Date    // UTC
}

export interface Slot {
  startAt: Date      // UTC timestamp
  endAt: Date        // UTC timestamp
  startLocal: string // HH:mm in teacher timezone
  endLocal: string   // HH:mm in teacher timezone
  timeRange: string  // "HH:mm-HH:mm"
  label: string      // for UI
}

export interface ComputeSlotsInput {
  date: string                      // YYYY-MM-DD in teacher's local timezone
  rules: AvailabilityRule[]         // Active rules for this weekday
  exceptions: AvailabilityException[] // Exceptions for this date
  busy: Interval[]                  // Existing Upcoming bookings (UTC)
  durationMinutes: number           // Course duration
  stepMinutes: number               // Slot step (default 30)
  minLeadHours: number              // Minimum advance booking hours
  maxAdvanceDays: number            // Maximum advance booking days
  timezone: string                  // Teacher timezone (fixed: Asia/Shanghai)
  now: Date                         // Current time (UTC)
}

export type SlotReason = 
  | 'NO_AVAILABILITY' 
  | 'FULLY_BOOKED' 
  | 'INSUFFICIENT_SESSIONS' 
  | 'SELF_BOOKING_DISABLED'
  | 'COURSE_ARCHIVED'

export interface ComputeSlotsResult {
  slots: Slot[]
  reason: SlotReason | null
}

/**
 * Compute available slots for a given date and course
 * 
 * Algorithm (docs/slot-algorithm.md §3.2):
 * 1. Check prerequisites (course status, self-booking, sessions)
 * 2. Construct blocked intervals (busy + exceptions, all in UTC)
 * 3. For each rule, generate slots at step intervals
 * 4. Filter slots that overlap with blocked intervals
 * 5. Filter slots outside min_lead_hours and max_advance_days
 * 6. Deduplicate and sort by start time
 * 
 * Key invariants:
 * - All intervals are [start, end) - left-closed, right-open
 * - Slots align to rule start, not to hour boundaries
 * - step != duration (allows overlapping candidate slots)
 * 
 * @param input Slot computation input
 * @returns Available slots and reason if empty
 */
export function computeSlots(input: ComputeSlotsInput): ComputeSlotsResult {
  const {
    date,
    rules,
    exceptions,
    busy,
    durationMinutes,
    stepMinutes,
    minLeadHours,
    maxAdvanceDays,
    now
  } = input

  // Step 1: Check if there are any rules (NO_AVAILABILITY)
  if (rules.length === 0) {
    return { slots: [], reason: 'NO_AVAILABILITY' }
  }

  // Step 2: Construct blocked intervals (all in UTC)
  const blocked: Interval[] = [...busy]

  // Add exception intervals (convert local time to UTC)
  for (const exception of exceptions) {
    if (exception.startMinute === null || exception.endMinute === null) {
      // Whole day closed - add 00:00-23:59 as blocked
      blocked.push({
        startAt: localDateMinutesToUTC(date, 0),
        endAt: localDateMinutesToUTC(date, 1440 - 1) // 23:59
      })
    } else {
      blocked.push({
        startAt: localDateMinutesToUTC(date, exception.startMinute),
        endAt: localDateMinutesToUTC(date, exception.endMinute)
      })
    }
  }

  // Calculate time boundaries
  const minStartTime = new Date(now.getTime() + minLeadHours * 60 * 60 * 1000)
  const maxStartTime = new Date(now.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000)

  // Step 3: Generate candidate slots from rules
  const candidates: Slot[] = []

  for (const rule of rules) {
    // Convert rule times to UTC for this specific date
    const ruleStart = localDateMinutesToUTC(date, rule.startMinute)
    const ruleEnd = localDateMinutesToUTC(date, rule.endMinute)

    // Generate slots starting from rule start, stepping by stepMinutes
    let currentStart = ruleStart

    while (true) {
      const currentEnd = new Date(currentStart.getTime() + durationMinutes * 60 * 1000)

      // Check if slot fits within rule (must be complete within interval)
      if (currentEnd > ruleEnd) {
        break // Slot would extend beyond rule end
      }

      // Check if slot overlaps with any blocked interval
      const overlapsBlocked = blocked.some(b =>
        rangesOverlap(currentStart, currentEnd, b.startAt, b.endAt)
      )

      if (!overlapsBlocked) {
        // Check time constraints
        if (currentStart >= minStartTime && currentStart <= maxStartTime) {
          // Generate slot
          const slot: Slot = {
            startAt: currentStart,
            endAt: currentEnd,
            startLocal: utcToLocalTime(currentStart),
            endLocal: utcToLocalTime(currentEnd),
            timeRange: formatTimeRange(
              utcToLocalTime(currentStart),
              utcToLocalTime(currentEnd)
            ),
            label: utcToLocalTime(currentStart)
          }
          candidates.push(slot)
        }
      }

      // Move to next step
      currentStart = new Date(currentStart.getTime() + stepMinutes * 60 * 1000)
    }
  }

  // Step 4: Deduplicate by startAt (defensive, database should prevent rule overlaps)
  const uniqueSlots = new Map<number, Slot>()
  for (const slot of candidates) {
    const key = slot.startAt.getTime()
    if (!uniqueSlots.has(key)) {
      uniqueSlots.set(key, slot)
    }
  }

  // Step 5: Sort by startAt (ascending)
  const slots = Array.from(uniqueSlots.values()).sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  )

  // Determine reason if empty
  let reason: SlotReason | null = null
  if (slots.length === 0) {
    // If we had rules but no slots, it's FULLY_BOOKED
    // (all slots within available time were blocked)
    reason = 'FULLY_BOOKED'
  }

  return { slots, reason }
}

/**
 * Validate if a specific start time is valid for booking
 * (Used by L3 create booking transaction)
 * 
 * @param startAt Proposed start time (UTC)
 * @param input Same input as computeSlots
 * @returns true if valid slot exists at this time
 */
export function isValidSlot(startAt: Date, input: ComputeSlotsInput): boolean {
  const result = computeSlots(input)
  return result.slots.some(slot => 
    slot.startAt.getTime() === startAt.getTime()
  )
}

/**
 * Get all bookable days in a date range
 * (For calendar view)
 * 
 * @param fromDate YYYY-MM-DD
 * @param toDate YYYY-MM-DD
 * @param getRulesForWeekday Function to get rules for a weekday
 * @param getExceptionsForDate Function to get exceptions for a date
 * @param other Other parameters (same as computeSlots)
 * @returns List of dates with slot counts
 */
export interface BookableDay {
  date: string           // YYYY-MM-DD
  dateLabel: string      // Formatted date
  weekday: number        // 1-7
  weekdayLabel: string   // e.g., "周一"
  slotCount: number
}

export async function computeBookableDays(
  fromDate: string,
  toDate: string,
  getRulesForWeekday: (weekday: number) => Promise<AvailabilityRule[]>,
  getExceptionsForDate: (date: string) => Promise<AvailabilityException[]>,
  getBusyForRange: (from: Date, to: Date) => Promise<Interval[]>,
  courseId: string,
  durationMinutes: number,
  stepMinutes: number,
  minLeadHours: number,
  maxAdvanceDays: number,
  now: Date
): Promise<BookableDay[]> {
  const days: BookableDay[] = []

  // Get all busy intervals for the entire range once
  const rangeStart = localDateMinutesToUTC(fromDate, 0)
  const rangeEnd = localDateMinutesToUTC(toDate, 1439)
  const allBusy = await getBusyForRange(rangeStart, rangeEnd)

  // Iterate through each date in range
  let currentDate = new Date(fromDate + 'T00:00:00Z')
  const endDate = new Date(toDate + 'T00:00:00Z')

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().substring(0, 10)
    const weekday = getLocalWeekday(currentDate)

    // Get rules and exceptions for this date
    const rules = await getRulesForWeekday(weekday)
    const exceptions = await getExceptionsForDate(dateStr)

    // Compute slots for this date
    const result = computeSlots({
      date: dateStr,
      rules,
      exceptions,
      busy: allBusy,
      durationMinutes,
      stepMinutes,
      minLeadHours,
      maxAdvanceDays,
      timezone: 'Asia/Shanghai',
      now
    })

    // Only include days with available slots
    if (result.slots.length > 0) {
      days.push({
        date: dateStr,
        dateLabel: `${currentDate.getUTCMonth() + 1}月${currentDate.getUTCDate()}日`,
        weekday,
        weekdayLabel: ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][weekday],
        slotCount: result.slots.length
      })
    }

    // Move to next day
    currentDate.setUTCDate(currentDate.getUTCDate() + 1)
  }

  return days
}
