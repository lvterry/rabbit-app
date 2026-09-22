/**
 * Time utilities for Rabbit booking system
 * 
 * All business logic uses UTC internally.
 * Display strings are computed server-side in teacher's timezone (Asia/Shanghai).
 * 
 * Rules:
 * - Store: timestamptz (UTC)
 * - Compute: UTC Instant
 * - Display: server generates local strings
 * - Clients: never compute timezone, only display server-provided strings
 */

/**
 * Convert minutes since midnight to HH:mm format
 * @param minutes 0-1439 (0 = 00:00, 1439 = 23:59)
 * @returns HH:mm string
 */
export function minutesToHHMM(minutes: number): string {
  if (minutes < 0 || minutes >= 1440) {
    throw new Error(`Invalid minutes: ${minutes} (must be 0-1439)`)
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Convert HH:mm to minutes since midnight
 * @param time HH:mm format
 * @returns minutes since midnight (0-1439)
 */
export function hhmmToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid time format: ${time} (expected HH:mm)`)
  }
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time: ${time}`)
  }
  
  return hours * 60 + minutes
}

/**
 * Convert local date + minutes to UTC timestamp
 * Timezone is hardcoded to Asia/Shanghai (UTC+8) for MVP
 * 
 * @param date YYYY-MM-DD in teacher's local timezone
 * @param minutes minutes since midnight in local time
 * @returns UTC Date object
 */
export function localDateMinutesToUTC(date: string, minutes: number): Date {
  // Parse date (YYYY-MM-DD)
  const [year, month, day] = date.split('-').map(n => parseInt(n, 10))
  
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  // Create date in Asia/Shanghai timezone (UTC+8)
  // Note: This is a simplified implementation that doesn't handle DST
  // For production, use a proper timezone library like luxon or date-fns-tz
  const localDate = new Date(year, month - 1, day, hours, mins, 0, 0)
  
  // Convert to UTC by subtracting 8 hours
  // Asia/Shanghai is UTC+8, no DST since 1991
  const utcDate = new Date(localDate.getTime() - 8 * 60 * 60 * 1000)
  
  return utcDate
}

/**
 * Convert UTC timestamp to local date string
 * @param utcDate UTC Date
 * @returns YYYY-MM-DD in Asia/Shanghai
 */
export function utcToLocalDate(utcDate: Date): string {
  // Add 8 hours to get Asia/Shanghai time
  const localTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000)
  
  const year = localTime.getUTCFullYear()
  const month = (localTime.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = localTime.getUTCDate().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * Convert UTC timestamp to local HH:mm
 * @param utcDate UTC Date
 * @returns HH:mm in Asia/Shanghai
 */
export function utcToLocalTime(utcDate: Date): string {
  // Add 8 hours to get Asia/Shanghai time
  const localTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000)
  
  const hours = localTime.getUTCHours().toString().padStart(2, '0')
  const minutes = localTime.getUTCMinutes().toString().padStart(2, '0')
  
  return `${hours}:${minutes}`
}

/**
 * Get weekday (1-7, Monday=1, Sunday=7) from UTC date in Asia/Shanghai
 * @param utcDate UTC Date
 * @returns weekday 1-7
 */
export function getLocalWeekday(utcDate: Date): number {
  // Convert to local time first
  const localTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000)
  const day = localTime.getUTCDay()
  // JavaScript: Sunday=0, Monday=1, ..., Saturday=6
  // ISO: Monday=1, ..., Sunday=7
  return day === 0 ? 7 : day
}

/**
 * Format date for display (user-facing label)
 * @param date YYYY-MM-DD
 * @returns formatted date string
 */
export function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  
  // Simple Chinese format: YYYY年MM月DD日
  return `${year}年${month}月${day}日`
}

/**
 * Format time range for display
 * @param startLocal HH:mm
 * @param endLocal HH:mm
 * @returns formatted range
 */
export function formatTimeRange(startLocal: string, endLocal: string): string {
  return `${startLocal}-${endLocal}`
}

/**
 * Check if two UTC timestamp ranges overlap (left-closed, right-open intervals)
 * [a, b) overlaps [c, d) if a < d AND c < b
 * 
 * @param start1 First range start (inclusive)
 * @param end1 First range end (exclusive)
 * @param start2 Second range start (inclusive)
 * @param end2 Second range end (exclusive)
 * @returns true if ranges overlap
 */
export function rangesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  // [start1, end1) overlaps [start2, end2) if start1 < end2 AND start2 < end1
  return start1 < end2 && start2 < end1
}

/**
 * Check if a point is within a range [start, end)
 * @param point Time point
 * @param start Range start (inclusive)
 * @param end Range end (exclusive)
 * @returns true if point >= start AND point < end
 */
export function isInRange(point: Date, start: Date, end: Date): boolean {
  return point >= start && point < end
}
