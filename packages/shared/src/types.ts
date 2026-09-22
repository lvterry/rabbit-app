/**
 * Rabbit Shared Types
 * Executable contract for API and Web client
 */

// ============================================================================
// Principal & Auth (from auth-model.md)
// ============================================================================

export type PrincipalKind = 'Public' | 'InviteToken' | 'Student' | 'User'

export type Principal = {
  kind: PrincipalKind
  userId: string | null
  studentId: string | null
  teacherId: string | null
  inviteId: string | null
}

// ============================================================================
// Entity Status Types
// ============================================================================

export type BookingStatus = 'Upcoming' | 'Completed' | 'Cancelled'

export type BookingSource = 'SelfBooked' | 'TeacherCreated'

export type CancelledBy = 'Student' | 'Teacher'

export type CancellationPolicyResult = 'FREE_CANCEL' | 'LATE_CANCEL' | 'TEACHER_CANCEL'

export type SessionStatus = 'Active' | 'Voided'

export type SessionSource = 'Manual' | 'AutoSettled'

export type PackageStatus = 'Active' | 'Used Up' | 'Archived'

export type PackageTransactionType =
  | 'PACKAGE_CREATED'
  | 'MANUAL_ADD'
  | 'PURCHASE_ADJUSTMENT'
  | 'BALANCE_ADJUSTMENT'
  | 'SESSION_COMPLETED'
  | 'LATE_CANCEL'
  | 'MANUAL_DEDUCT'
  | 'REVERSAL'

export type StudentInviteStatus = 'Pending' | 'Consumed' | 'Expired' | 'Revoked'

export type CourseStatus = 'Active' | 'Archived'

export type StudentStatus = 'Active' | 'Inactive'

export type TeacherStatus = 'Active' | 'Suspended'

export type AvailabilityRuleStatus = 'Active' | 'Deleted'

// ============================================================================
// Booking Views (from parallel-plan.md §13)
// ============================================================================

export type BookingActions = {
  canComplete: boolean
  canMarkNoShow: boolean
  canCancel: boolean
  canReschedule: boolean
  rescheduleLimitReached: boolean
  canUndoComplete: boolean
  undoDeadline: string | null
}

export type BookingView = {
  bookingId: string

  teacherId: string
  teacherName: string

  studentId: string
  studentName: string

  courseId: string
  courseName: string
  durationMinutes: number

  packageId: string

  startAt: string
  endAt: string

  date: string
  dateLabel: string
  startLocal: string
  endLocal: string
  timeRange: string

  status: BookingStatus

  source: BookingSource
  sourceLabel: string

  cancelledAt: string | null
  cancelledBy: CancelledBy | null
  cancelledByLabel: string | null

  cancellationPolicyResult: CancellationPolicyResult | null

  policyText: string | null
  consumedSession: boolean

  policySnapshotFreeCancelHours: number

  rescheduledFromBookingId: string | null
  rescheduledToBookingId: string | null
  rescheduleCount: number
  maxReschedules: number

  settledAt: string | null

  sessionStatus: SessionStatus | null
  sessionSource: SessionSource | null
  sessionSourceLabel: string | null

  createdAt: string
  started: boolean

  remaining: number | null
  reserved: number | null
  available: number | null

  actions: BookingActions
}

// ============================================================================
// Slot Views (from parallel-plan.md §13.2)
// ============================================================================

export type SlotView = {
  startAt: string
  endAt: string
  startLocal: string
  endLocal: string
  timeRange: string
  label: string
}

export type SlotReason =
  | 'NO_AVAILABILITY'
  | 'FULLY_BOOKED'
  | 'INSUFFICIENT_SESSIONS'
  | 'SELF_BOOKING_DISABLED'
  | 'COURSE_ARCHIVED'

// ============================================================================
// Balance Views (from parallel-plan.md §13.3)
// ============================================================================

export type BalanceView = {
  remaining: number
  reserved: number | null
  available: number
}

// ============================================================================
// Teacher Views
// ============================================================================

export type TeacherProfile = {
  teacherId: string
  userId: string
  name: string
  avatar: string | null
  bio: string | null
  timezone: string
  slotStepMinutes: number
  minLeadHours: number
  maxAdvanceDays: number
  freeCancelHours: number
  autoSettleHours: number
  undoCompleteDays: number
  maxReschedules: number
  status: TeacherStatus
}

export type TeacherDayView = {
  date: string
  dateLabel: string
  todayBookings: BookingView[]
  pendingBookings: BookingView[]
  nextBooking: BookingView | null
  bookingCount: number
}

// ============================================================================
// Student Views
// ============================================================================

export type CourseCard = {
  courseId: string
  courseName: string
  durationMinutes: number
  teacherId: string
  teacherName: string
  teacherAvatar: string | null
  balance: BalanceView
  nextBooking: BookingView | null
  allowSelfBooking: boolean
}

export type StudentHomeView = {
  studentId: string
  studentName: string
  hasBoundAccount: boolean
  courses: CourseCard[]
}

export type StudentDetailView = {
  studentId: string
  studentName: string
  contact: string | null
  status: StudentStatus
  boundAt: string | null
  userEmail: string | null
  userNickname: string | null
  nextBooking: BookingView | null
  packages: PackageView[]
  totalRemaining: number
  totalReserved: number
  totalAvailable: number
  upcomingBookings: BookingView[]
}

// ============================================================================
// Package Views
// ============================================================================

export type PackageView = {
  packageId: string
  courseId: string
  courseName: string
  purchasedSessions: number
  remainingSessions: number
  status: PackageStatus
  createdAt: string
  archivedAt: string | null
}

export type PackageTransactionView = {
  transactionId: string
  packageId: string
  type: PackageTransactionType
  typeLabel: string
  amount: number
  before: number
  after: number
  note: string | null
  createdAt: string
  dateLabel: string
  bookingId: string | null
  sessionId: string | null
}

// ============================================================================
// Course Views
// ============================================================================

export type CourseView = {
  courseId: string
  teacherId: string
  name: string
  durationMinutes: number
  allowSelfBooking: boolean
  status: CourseStatus
  createdAt: string
}

// ============================================================================
// Availability Views
// ============================================================================

export type AvailabilityRuleView = {
  ruleId: string
  teacherId: string
  weekday: number
  startMinute: number
  endMinute: number
  startLocal: string
  endLocal: string
  timeRange: string
  status: AvailabilityRuleStatus
}

export type AvailabilityExceptionView = {
  exceptionId: string
  teacherId: string
  date: string
  dateLabel: string
  startMinute: number | null
  endMinute: number | null
  startLocal: string | null
  endLocal: string | null
  timeRange: string | null
  reason: string | null
  isAllDay: boolean
}

// ============================================================================
// Invite Views
// ============================================================================

export type InviteView = {
  inviteId: string
  token: string
  studentId: string
  teacherId: string
  teacherName: string
  studentName: string
  courseName: string
  status: StudentInviteStatus
  expiresAt: string
  consumedAt: string | null
  consumedByUserId: string | null
  createdAt: string
  url: string
}

export type InvitePreview = {
  token: string
  teacherName: string
  courseName: string
  status: StudentInviteStatus
  expiresAt: string
  alreadyAccepted: boolean
  redirectTo: string
}

// ============================================================================
// Bookable Days Response
// ============================================================================

export type BookableDayView = {
  date: string
  slotCount: number
}

export type BookableDaysResponse = {
  timezone: string
  generatedAt: string
  days: BookableDayView[]
}

// ============================================================================
// Slots Response
// ============================================================================

export type SlotsResponse = {
  date: string
  timezone: string
  generatedAt: string
  reason: SlotReason | null
  slots: SlotView[]
}

// ============================================================================
// API Envelope (from impl-guide.md §4.1)
// ============================================================================

export type APISuccessResponse<T> = {
  ok: true
  data: T
  meta: {
    generatedAt: string
    requestId: string
  }
}

export type APIErrorResponse = {
  ok: false
  code: string
  message: string
  retryable: boolean
  details: Record<string, unknown> | null
  requestId: string
}

export type APIResponse<T> = APISuccessResponse<T> | APIErrorResponse

// ============================================================================
// Request Types
// ============================================================================

export type CreateBookingRequest = {
  studentId?: string
  courseId: string
  startAt: string
}

export type CancelBookingRequest = Record<string, never>

export type RescheduleBookingRequest = {
  newStartAt: string
}

export type CompleteBookingRequest = Record<string, never>

export type CreatePackageRequest = {
  courseId: string
  purchasedSessions: number
  note?: string
}

export type AddPackageTransactionRequest = {
  type: PackageTransactionType
  amount: number
  note?: string
}

export type CreateCourseRequest = {
  name: string
  durationMinutes: number
  allowSelfBooking: boolean
}

export type UpdateCourseRequest = {
  name?: string
  durationMinutes?: number
  allowSelfBooking?: boolean
}

export type CreateAvailabilityRuleRequest = {
  weekday: number
  startMinute: number
  endMinute: number
}

export type CreateAvailabilityExceptionRequest = {
  date: string
  startMinute?: number
  endMinute?: number
  reason?: string
}

export type CreateStudentRequest = {
  name: string
  contact?: string
  courseId: string
  initialSessions: number
}

export type UpdateStudentRequest = {
  name?: string
  contact?: string
  status?: StudentStatus
}

export type CreateTeacherRequest = {
  name: string
  avatar?: string
  bio?: string
}

export type UpdateTeacherRequest = {
  name?: string
  avatar?: string
  bio?: string
  slotStepMinutes?: number
  minLeadHours?: number
  maxAdvanceDays?: number
  freeCancelHours?: number
  autoSettleHours?: number
  undoCompleteDays?: number
  maxReschedules?: number
}

export type AcceptInviteRequest = Record<string, never>

export type RegisterDeviceRequest = {
  platform: 'ios'
  token: string
  environment: 'sandbox' | 'production'
}

export type RegisterDeviceResponse = {
  deviceId: string
  registered: boolean
}

// ============================================================================
// Meta Response
// ============================================================================

export type MetaResponse = {
  version: string
  minSupportedVersion: string
  serverTime: string
}
