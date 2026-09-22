/**
 * Rabbit Shared Constants
 * Labels, options, and display constants
 */

// ============================================================================
// Weekday Labels
// ============================================================================

export const weekdayLabels: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

// ============================================================================
// Slot Reason Labels
// ============================================================================

export const slotReasonLabels = {
  NO_AVAILABILITY: '老师近期还没有开放时间，请联系老师',
  FULLY_BOOKED: '这一天已经约满了',
  INSUFFICIENT_SESSIONS: '剩余课时不足，请联系老师续课',
  SELF_BOOKING_DISABLED: '该课程需要联系老师安排',
  COURSE_ARCHIVED: '课程已归档',
} as const

// ============================================================================
// Booking Source Labels
// ============================================================================

export const bookingSourceLabels = {
  SelfBooked: '学员自主预约',
  TeacherCreated: '老师代约',
} as const

// ============================================================================
// Cancelled By Labels
// ============================================================================

export const cancelledByLabels = {
  Student: '学员',
  Teacher: '老师',
} as const

// ============================================================================
// Cancellation Policy Labels
// ============================================================================

export const cancellationPolicyLabels = {
  FREE_CANCEL: '免费取消',
  LATE_CANCEL: '逾期取消（已扣 1 节课时）',
  TEACHER_CANCEL: '老师取消',
} as const

// ============================================================================
// Session Source Labels
// ============================================================================

export const sessionSourceLabels = {
  Manual: '老师确认',
  AutoSettled: '自动结算',
} as const

// ============================================================================
// Package Transaction Type Labels
// ============================================================================

export const packageTransactionTypeLabels = {
  PACKAGE_CREATED: '新建课包',
  MANUAL_ADD: '手动增加',
  PURCHASE_ADJUSTMENT: '购买量调整',
  BALANCE_ADJUSTMENT: '余额调整',
  SESSION_COMPLETED: '完成课程',
  LATE_CANCEL: '逾期取消',
  MANUAL_DEDUCT: '手动扣减',
  REVERSAL: '撤销完成',
} as const

// ============================================================================
// Package Status Labels
// ============================================================================

export const packageStatusLabels = {
  Active: '进行中',
  'Used Up': '已用完',
  Archived: '已归档',
} as const

// ============================================================================
// Course Status Labels
// ============================================================================

export const courseStatusLabels = {
  Active: '进行中',
  Archived: '已归档',
} as const

// ============================================================================
// Student Status Labels
// ============================================================================

export const studentStatusLabels = {
  Active: '活跃',
  Inactive: '停用',
} as const

// ============================================================================
// Rule Options (from mvp.md §8)
// ============================================================================

export const minLeadHoursOptions = [0, 1, 2, 6, 12, 24] as const

export const maxAdvanceDaysOptions = [7, 14, 30, 60] as const

export const freeCancelHoursOptions = [6, 12, 24, 48] as const

export const slotStepMinutesOptions = [15, 20, 30, 60] as const

export const autoSettleHoursOptions = [0, 6, 12, 24, 48] as const

export const undoCompleteDaysOptions = [3, 7, 14] as const

export const maxRescheduleOptions = [1, 2, 3, 5] as const

// ============================================================================
// Duration Options
// ============================================================================

export const courseDurationOptions = [15, 30, 45, 60, 90, 120, 180, 240] as const

// ============================================================================
// Default Values
// ============================================================================

export const defaultTeacherSettings = {
  timezone: 'Asia/Shanghai',
  slotStepMinutes: 30,
  minLeadHours: 2,
  maxAdvanceDays: 30,
  freeCancelHours: 24,
  autoSettleHours: 24,
  undoCompleteDays: 7,
  maxReschedules: 3,
} as const

export const defaultCourseDuration = 60

// ============================================================================
// Validation Constants
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
// Time Constants
// ============================================================================

export const MINUTES_PER_DAY = 1440
export const SECONDS_PER_HOUR = 3600
export const MILLISECONDS_PER_SECOND = 1000

// ============================================================================
// Pagination
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ============================================================================
// Query Window Limits
// ============================================================================

export const MAX_BOOKABLE_DAYS_RANGE = 62
