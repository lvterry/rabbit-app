/**
 * Rabbit Shared Schemas
 * Zod schemas for validation and contract testing
 */

import { z } from 'zod'

// ============================================================================
// Principal Schemas
// ============================================================================

export const principalKindSchema = z.enum(['Public', 'InviteToken', 'Student', 'User'])

// Principal with per-kind invariants (auth-model.md §1.1)
const basePrincipalSchema = z.object({
  kind: principalKindSchema,
  userId: z.string().uuid().nullable(),
  studentId: z.string().uuid().nullable(),
  teacherId: z.string().uuid().nullable(),
  inviteId: z.string().uuid().nullable(),
})

export const principalSchema = basePrincipalSchema.refine(
  (p) => {
    if (p.kind === 'Public') {
      // Public: all IDs must be null
      return p.userId === null && p.studentId === null && p.teacherId === null && p.inviteId === null
    }
    if (p.kind === 'User') {
      // User: only userId set (studentId/teacherId/inviteId null)
      return p.userId !== null && p.studentId === null && p.teacherId === null && p.inviteId === null
    }
    if (p.kind === 'Student') {
      // Student: studentId + teacherId set (userId/inviteId null)
      return p.studentId !== null && p.teacherId !== null && p.userId === null && p.inviteId === null
    }
    if (p.kind === 'InviteToken') {
      // InviteToken: studentId + teacherId + inviteId set (userId null)
      return p.studentId !== null && p.teacherId !== null && p.inviteId !== null && p.userId === null
    }
    return false
  },
  {
    message: 'Principal IDs must match the kind invariants',
  }
)

// ============================================================================
// Status Schemas
// ============================================================================

export const bookingStatusSchema = z.enum(['Upcoming', 'Completed', 'Cancelled'])

export const bookingSourceSchema = z.enum(['SelfBooked', 'TeacherCreated'])

export const cancelledBySchema = z.enum(['Student', 'Teacher'])

export const cancellationPolicyResultSchema = z.enum([
  'FREE_CANCEL',
  'LATE_CANCEL',
  'TEACHER_CANCEL',
])

export const sessionStatusSchema = z.enum(['Active', 'Voided'])

export const sessionSourceSchema = z.enum(['Manual', 'AutoSettled'])

export const packageStatusSchema = z.enum(['Active', 'Used Up', 'Archived'])

export const packageTransactionTypeSchema = z.enum([
  'PACKAGE_CREATED',
  'MANUAL_ADD',
  'PURCHASE_ADJUSTMENT',
  'BALANCE_ADJUSTMENT',
  'SESSION_COMPLETED',
  'LATE_CANCEL',
  'MANUAL_DEDUCT',
  'REVERSAL',
])

export const studentInviteStatusSchema = z.enum(['Pending', 'Consumed', 'Expired', 'Revoked'])

export const courseStatusSchema = z.enum(['Active', 'Archived'])

export const studentStatusSchema = z.enum(['Active', 'Inactive'])

export const teacherStatusSchema = z.enum(['Active', 'Suspended'])

export const availabilityRuleStatusSchema = z.enum(['Active', 'Deleted'])

// ============================================================================
// View Schemas
// ============================================================================

export const bookingActionsSchema = z.object({
  canComplete: z.boolean(),
  canMarkNoShow: z.boolean(),
  canCancel: z.boolean(),
  canReschedule: z.boolean(),
  rescheduleLimitReached: z.boolean(),
  canUndoComplete: z.boolean(),
  undoDeadline: z.string().nullable(),
})

export const bookingViewSchema = z.object({
  bookingId: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  courseId: z.string().uuid(),
  courseName: z.string(),
  durationMinutes: z.number().int().positive(),
  packageId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  date: z.string(),
  dateLabel: z.string(),
  startLocal: z.string(),
  endLocal: z.string(),
  timeRange: z.string(),
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  sourceLabel: z.string(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: cancelledBySchema.nullable(),
  cancelledByLabel: z.string().nullable(),
  cancellationPolicyResult: cancellationPolicyResultSchema.nullable(),
  policyText: z.string().nullable(),
  consumedSession: z.boolean(),
  policySnapshotFreeCancelHours: z.number().int().nonnegative(),
  rescheduledFromBookingId: z.string().uuid().nullable(),
  rescheduledToBookingId: z.string().uuid().nullable(),
  rescheduleCount: z.number().int().nonnegative(),
  maxReschedules: z.number().int().positive(),
  settledAt: z.string().datetime().nullable(),
  sessionStatus: sessionStatusSchema.nullable(),
  sessionSource: sessionSourceSchema.nullable(),
  sessionSourceLabel: z.string().nullable(),
  createdAt: z.string().datetime(),
  started: z.boolean(),
  remaining: z.number().int().nonnegative().nullable(),
  reserved: z.number().int().nonnegative().nullable(),
  available: z.number().int().nullable(),
  actions: bookingActionsSchema,
})

export const slotReasonSchema = z.enum([
  'NO_AVAILABILITY',
  'FULLY_BOOKED',
  'INSUFFICIENT_SESSIONS',
  'SELF_BOOKING_DISABLED',
  'COURSE_ARCHIVED',
])

export const slotViewSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  startLocal: z.string(),
  endLocal: z.string(),
  timeRange: z.string(),
  label: z.string(),
})

export const balanceViewSchema = z.object({
  remaining: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative().nullable(),
  available: z.number().int(),
})

export const teacherProfileSchema = z.object({
  teacherId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  avatar: z.string().nullable(),
  bio: z.string().nullable(),
  timezone: z.string(),
  slotStepMinutes: z.number().int().positive(),
  minLeadHours: z.number().int().nonnegative(),
  maxAdvanceDays: z.number().int().positive(),
  freeCancelHours: z.number().int().nonnegative(),
  autoSettleHours: z.number().int().nonnegative(),
  undoCompleteDays: z.number().int().nonnegative(),
  maxReschedules: z.number().int().positive(),
  status: teacherStatusSchema,
})

// Student-facing course card schema (within a StudentHomeCard)
export const studentCourseCardSchema = z.object({
  courseId: z.string().uuid(),
  courseName: z.string(),
  durationMinutes: z.number().int().positive(),
  allowSelfBooking: z.boolean(),
  remaining: z.number().int().nonnegative(),
  purchased: z.number().int().nonnegative().nullable(), // null for student-facing views
  batchCount: z.number().int().nonnegative(),
  available: z.number().int(),
  exhausted: z.boolean(),
  fullyReserved: z.boolean(),
  nextBooking: bookingViewSchema.nullable(),
})

// Card representing one (teacher, student) relationship
export const studentHomeCardSchema = z.object({
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  teacherAvatarUrl: z.string().nullable(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  courses: z.array(studentCourseCardSchema),
  remainingTotal: z.number().int().nonnegative(),
})

// Student home view response (impl-guide.md §5.8)
export const studentHomeViewSchema = z.object({
  cards: z.array(studentHomeCardSchema),
  bound: z.boolean(),
})

export const packageViewSchema = z.object({
  packageId: z.string().uuid(),
  courseId: z.string().uuid(),
  courseName: z.string(),
  purchasedSessions: z.number().int().nonnegative(),
  remainingSessions: z.number().int().nonnegative(),
  status: packageStatusSchema,
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
})

export const packageTransactionViewSchema = z.object({
  transactionId: z.string().uuid(),
  packageId: z.string().uuid(),
  type: packageTransactionTypeSchema,
  typeLabel: z.string(),
  amount: z.number().int(),
  before: z.number().int().nonnegative(),
  after: z.number().int().nonnegative(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  dateLabel: z.string(),
  bookingId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
})

export const studentDetailViewSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  contact: z.string().nullable(),
  status: studentStatusSchema,
  boundAt: z.string().datetime().nullable(),
  userEmail: z.string().email().nullable(),
  userNickname: z.string().nullable(),
  nextBooking: bookingViewSchema.nullable(),
  packages: z.array(packageViewSchema),
  totalRemaining: z.number().int().nonnegative(),
  totalReserved: z.number().int().nonnegative(),
  totalAvailable: z.number().int(),
  upcomingBookings: z.array(bookingViewSchema),
})

export const courseViewSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  name: z.string(),
  durationMinutes: z.number().int().positive(),
  allowSelfBooking: z.boolean(),
  status: courseStatusSchema,
  createdAt: z.string().datetime(),
})

export const availabilityRuleViewSchema = z.object({
  ruleId: z.string().uuid(),
  teacherId: z.string().uuid(),
  weekday: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  startLocal: z.string(),
  endLocal: z.string(),
  timeRange: z.string(),
  status: availabilityRuleStatusSchema,
})

export const availabilityExceptionViewSchema = z.object({
  exceptionId: z.string().uuid(),
  teacherId: z.string().uuid(),
  date: z.string(),
  dateLabel: z.string(),
  startMinute: z.number().int().min(0).max(1439).nullable(),
  endMinute: z.number().int().min(0).max(1439).nullable(),
  startLocal: z.string().nullable(),
  endLocal: z.string().nullable(),
  timeRange: z.string().nullable(),
  reason: z.string().nullable(),
  isAllDay: z.boolean(),
})

export const inviteViewSchema = z.object({
  inviteId: z.string().uuid(),
  token: z.string(),
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  studentName: z.string(),
  courseName: z.string(),
  status: studentInviteStatusSchema,
  expiresAt: z.string().datetime(),
  consumedAt: z.string().datetime().nullable(),
  consumedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  url: z.string().url(),
})

export const invitePreviewSchema = z.object({
  token: z.string(),
  teacherName: z.string(),
  courseName: z.string(),
  status: studentInviteStatusSchema,
  expiresAt: z.string().datetime(),
  alreadyAccepted: z.boolean(),
  redirectTo: z.string(),
})

export const bookableDayViewSchema = z.object({
  date: z.string(),
  dateLabel: z.string(),
  weekday: z.number().int().min(1).max(7),
  weekdayLabel: z.string(),
  slotCount: z.number().int().nonnegative(),
})

export const bookableDaysResponseSchema = z.object({
  timezone: z.string(),
  generatedAt: z.string().datetime(),
  reason: slotReasonSchema.nullable(),
  reasonText: z.string().nullable(),
  days: z.array(bookableDayViewSchema),
  balance: balanceViewSchema,
})

export const slotsResponseSchema = z.object({
  date: z.string(),
  dateLabel: z.string(),
  timezone: z.string(),
  generatedAt: z.string().datetime(),
  reason: slotReasonSchema.nullable(),
  reasonText: z.string().nullable(),
  slots: z.array(slotViewSchema),
  balance: balanceViewSchema,
})

export const teacherDayViewSchema = z.object({
  date: z.string(),
  isToday: z.boolean(),
  dateLabel: z.string(),
  todayCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  next: bookingViewSchema.nullable(),
  bookings: z.array(bookingViewSchema),
  pending: z.array(bookingViewSchema),
  hints: z.array(z.string()),
})

// ============================================================================
// API Envelope Schemas
// ============================================================================

export const apiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: z.object({
      generatedAt: z.string().datetime(),
      requestId: z.string(),
    }),
  })

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).nullable(),
  requestId: z.string(),
})

// ============================================================================
// Request Schemas
// ============================================================================

export const createBookingRequestSchema = z.object({
  studentId: z.string().uuid().optional(),
  courseId: z.string().uuid(),
  startAt: z.string().datetime(),
})

export const rescheduleBookingRequestSchema = z.object({
  newStartAt: z.string().datetime(),
})

export const createPackageRequestSchema = z.object({
  courseId: z.string().uuid(),
  purchasedSessions: z.number().int().positive(),
  note: z.string().optional(),
})

export const addPackageTransactionRequestSchema = z.object({
  mode: z.enum(['add', 'deduct', 'set']),
  sessions: z.number().int().positive(),
  type: packageTransactionTypeSchema.optional(), // required when mode='set'
  note: z.string().optional(),
})

export const createCourseRequestSchema = z.object({
  name: z.string().min(1).max(100),
  durationMinutes: z.number().int().min(15).max(240),
  allowSelfBooking: z.boolean(),
})

export const updateCourseRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  allowSelfBooking: z.boolean().optional(),
})

export const createAvailabilityRuleRequestSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
})

export const createAvailabilityExceptionRequestSchema = z.object({
  onDate: z.string(), // YYYY-MM-DD
  wholeDay: z.boolean().optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  endMinute: z.number().int().min(0).max(1439).optional(),
  reason: z.string().optional(),
})

export const createStudentRequestSchema = z.object({
  name: z.string().min(1).max(100),
  contact: z.string().optional(),
  courseId: z.string().uuid(),
  initialSessions: z.number().int().positive(),
})

export const updateStudentRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  contact: z.string().optional(),
  status: studentStatusSchema.optional(),
})

export const createTeacherRequestSchema = z.object({
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
})

export const updateTeacherRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  slotStepMinutes: z.number().int().positive().optional(),
  minLeadHours: z.number().int().nonnegative().optional(),
  maxAdvanceDays: z.number().int().positive().optional(),
  freeCancelHours: z.number().int().nonnegative().optional(),
  autoSettleHours: z.number().int().nonnegative().optional(),
  undoCompleteDays: z.number().int().nonnegative().optional(),
  maxReschedules: z.number().int().positive().optional(),
})

export const registerDeviceRequestSchema = z.object({
  platform: z.literal('ios'),
  token: z.string(),
  environment: z.enum(['sandbox', 'production']),
})

export const registerDeviceResponseSchema = z.object({
  deviceId: z.string().uuid(),
  registered: z.boolean(),
})

// ============================================================================
// Auth Response Schemas (impl-guide.md §5.1)
// ============================================================================

export const studentSummarySchema = z.object({
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  teacherAvatarUrl: z.string().nullable(),
  studentId: z.string().uuid(),
  studentName: z.string(),
})

export const authResponseSchema = z.object({
  userId: z.string().uuid(),
  isTeacher: z.boolean(),
  teacher: teacherProfileSchema.nullable(),
  students: z.array(studentSummarySchema),
})

export const meResponseSchema = z.object({
  user: z.object({
    userId: z.string().uuid(),
    nickname: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  isTeacher: z.boolean(),
  teacher: teacherProfileSchema.nullable(),
  students: z.array(studentSummarySchema),
})

export const metaResponseSchema = z.object({
  minIOSVersion: z.string(),
  minWebBuild: z.string(),
  features: z.record(z.boolean()),
  serverTime: z.string().datetime(),
})
