/**
 * Rabbit Shared Constants
 * Protocol constants and validation limits shared between client and server.
 * 
 * NOTE: Display labels, rule options, and business defaults are SERVER-AUTHORITATIVE
 * and MUST come from API responses, not from this file (impl-guide.md §4.4).
 */

// ============================================================================
// Protocol Constants
// ============================================================================

export const MINUTES_PER_DAY = 1440
export const SECONDS_PER_HOUR = 3600
export const MILLISECONDS_PER_SECOND = 1000

// ============================================================================
// Validation Limits (shared for client-side validation)
// ============================================================================

export const INVITE_TOKEN_TTL_DAYS = 7
export const SESSION_TTL_DAYS = 180
export const MAX_COURSE_NAME_LENGTH = 100
export const MAX_STUDENT_NAME_LENGTH = 100
export const MAX_TEACHER_NAME_LENGTH = 100
export const MAX_BIO_LENGTH = 500
export const MIN_DURATION_MINUTES = 15
export const MAX_DURATION_MINUTES = 240
export const MAX_RESCHEDULES = 10
export const IDEMPOTENCY_KEY_TTL_HOURS = 24

// ============================================================================
// Pagination
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ============================================================================
// Query Window Limits
// ============================================================================

export const MAX_BOOKABLE_DAYS_RANGE = 62
