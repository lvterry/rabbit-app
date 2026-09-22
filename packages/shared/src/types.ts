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
  isToday: boolean
  dateLabel: string
  todayCount: number
  completedCount: number
  next: BookingView | null
  bookings: BookingView[]
  pending: BookingView[]
  hints: string[]
}

// ============================================================================
// Student Views
// ============================================================================

// Student-facing course card (within a StudentHomeCard)
// per impl-guide.md §5.8 GET /v1/me/student-home
export type StudentCourseCard = {
  courseId: string
  courseName: string
  durationMinutes: number
  allowSelfBooking: boolean
  remaining: number
  purchased: number | null // null for student-facing views per §6.6
  batchCount: number
  available: number
  exhausted: boolean
  fullyReserved: boolean
  nextBooking: BookingView | null
}

// Card representing one (teacher, student) relationship
// Anonymous sessions always have 1 card; multi-teacher users have multiple cards
export type StudentHomeCard = {
  teacherId: string
  teacherName: string
  teacherAvatarUrl: string | null
  studentId: string
  studentName: string
  courses: StudentCourseCard[]
  remainingTotal: number
}

// Student home view response (impl-guide.md §5.8)
// cards.length === 1 for anonymous Student sessions
// cards.length >= 1 for User sessions (multi-teacher)
export type StudentHomeView = {
  cards: StudentHomeCard[]
  bound: boolean
}

// Student detail response (GET /v1/students/{studentId})
// impl-guide.md §5.5
export type StudentDetailView = {
  student: {
    studentId: string
    name: string
    contact: string | null
    status: StudentStatus
    bound: boolean
    boundName: string | null
    boundEmail: string | null
    boundAt: string | null
  }
  courses: Array<{
    courseId: string
    courseName: string
    durationMinutes: number
    courseStatus: CourseStatus
    remaining: number
    reserved: number
    available: number
  }>
  packages: Array<{
    packageId: string
    courseId: string
    courseName: string
    purchasedSessions: number
    remainingSessions: number
    status: PackageStatus
    createdAt: string
    createdDate: string
  }>
  transactions: PackageTransactionView[]
  upcoming: BookingView[]
  history: Array<BookingView & { status: BookingStatus }>
  invite: InviteView | null
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
  courseId: string
  courseName: string
  type: PackageTransactionType
  label: string
  amount: number
  amountText: string
  beforeSessions: number
  afterSessions: number
  balanceText: string
  note: string | null
  createdAt: string
  createdLabel: string
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

// Pending invite preview (GET /v1/invites/{token} when Pending)
// impl-guide.md §5.5
export type PendingInvitePreview = {
  teacher: {
    teacherId: string
    name: string
    avatarUrl: string | null
  }
  studentName: string
  courses: Array<{
    courseId: string
    courseName: string
    remaining: number
  }>
  expiresAt: string
}

// Consumed invite with matching session (GET /v1/invites/{token} when already accepted)
// impl-guide.md §5.5
export type AcceptedInviteResponse = {
  alreadyAccepted: true
  redirectTo: string
}

// ============================================================================
// Bookable Days Response (impl-guide.md §5.7)
// ============================================================================

export type BookableDayView = {
  date: string
  dateLabel: string
  weekday: number
  weekdayLabel: string
  slotCount: number
}

export type BookableDaysResponse = {
  timezone: string
  generatedAt: string
  reason: SlotReason | null
  reasonText: string | null
  days: BookableDayView[]
  balance: BalanceView
}

// ============================================================================
// Slots Response (impl-guide.md §5.7)
// ============================================================================

export type SlotsResponse = {
  date: string
  dateLabel: string
  timezone: string
  generatedAt: string
  reason: SlotReason | null
  reasonText: string | null
  slots: SlotView[]
  balance: BalanceView
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
  sessions: number
  note?: string
}

// Package transaction request discriminated by mode (impl-guide.md §5.6)
// add/deduct: NO client-supplied type (server generates MANUAL_ADD/MANUAL_DEDUCT)
// set: type REQUIRED and must be PURCHASE_ADJUSTMENT or BALANCE_ADJUSTMENT
export type AddPackageTransactionRequest =
  | {
      mode: 'add'
      sessions: number // must be > 0
      note?: string
    }
  | {
      mode: 'deduct'
      sessions: number // must be > 0
      note?: string
    }
  | {
      mode: 'set'
      sessions: number // >= 0
      type: 'PURCHASE_ADJUSTMENT' | 'BALANCE_ADJUSTMENT' // REQUIRED for set
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
  onDate: string // YYYY-MM-DD per impl-guide.md §5.4
  wholeDay?: boolean
  startMinute?: number
  endMinute?: number
  reason?: string
}

export type CreateStudentRequest = {
  name: string
  contact?: string
  courseId?: string
  initialSessions?: number
  note?: string
}

export type UpdateStudentRequest = {
  name?: string
  contact?: string
  status?: StudentStatus
}

export type CreateTeacherRequest = {
  name: string
  avatarUrl?: string
  bio?: string
}

export type UpdateTeacherRequest = {
  name?: string
  avatarUrl?: string
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
// Auth Response Types (impl-guide.md §5.1)
// ============================================================================

export type StudentSummary = {
  teacherId: string
  teacherName: string
  teacherAvatarUrl: string | null
  studentId: string
  studentName: string
}

export type AuthResponse = {
  userId: string
  isTeacher: boolean
  teacher: TeacherProfile | null
  students: StudentSummary[]
}

export type MeResponse = {
  user: {
    userId: string
    nickname: string | null
    avatarUrl: string | null
  }
  isTeacher: boolean
  teacher: TeacherProfile | null
  students: StudentSummary[]
}

// ============================================================================
// Meta Response (impl-guide.md §4.6, §5.1)
// ============================================================================

export type MetaResponse = {
  minIOSVersion: string
  minWebBuild: string
  features: Record<string, boolean>
  serverTime: string
}
