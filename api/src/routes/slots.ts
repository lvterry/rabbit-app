/**
 * Slots Routes - Real Implementation
 * 
 * Authority: parallel-plan-v2.md §12.7, impl-guide.md §5.7
 * slot-algorithm.md §6 (interface contract)
 * 
 * View derivation (capability-based, never trust client):
 * - Teacher capability → teacher view (no restrictions)
 * - Student/User capability → student view (with restrictions)
 * - InviteToken → preview view
 * - Public → 401
 */

import { Router } from 'express'
import type {
  TeacherRepository,
  CourseRepository,
  StudentRepository,
  AvailabilityRepository,
  BookingRepository,
  PackageRepository,
} from '../ports'
import { createSuccessEnvelope, AppError } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'
import { computeSlots, computeBookableDays } from '../domain/slot'

export function createSlotsRouter(deps: {
  teacherRepo: TeacherRepository
  courseRepo: CourseRepository
  studentRepo: StudentRepository
  availabilityRepo: AvailabilityRepository
  bookingRepo: BookingRepository
  packageRepo: PackageRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/teachers/:teacherId/slots
   * 
   * Get available time slots for a specific date
   * View derived from Principal capability (never trust client view parameter)
   */
  router.get('/:teacherId/slots', authMiddleware, requireAuth, async (req, res) => {
    const { teacherId } = req.params
    const { courseId, date } = req.query
    const principal = req.principal

    if (!courseId || !date) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'courseId and date are required')
    }

    // Get teacher
    const teacher = await deps.teacherRepo.findById(teacherId)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher not found')
    }

    // Get course
    const course = await deps.courseRepo.findById(courseId as string)
    if (!course) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Course not found')
    }

    // Derive view from capability (never trust client)
    // Teacher view: User must own this teacherId
    let hasTeacherCapability = false
    if (principal.kind === 'User' && principal.userId) {
      const userTeacher = await deps.teacherRepo.findByUserId(principal.userId)
      hasTeacherCapability = userTeacher !== null && userTeacher.teacherId === teacherId
    }

    // Student view: Must be bound to this teacher
    let hasStudentCapability = false
    if (principal.kind === 'Student') {
      hasStudentCapability = principal.teacherId === teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      // Check if user has student binding to this teacher
      const student = await deps.studentRepo.findByTeacherAndUser(teacherId, principal.userId)
      hasStudentCapability = student !== null
    }

    // Authorization: must have either teacher OR student capability for this teacher
    if (!hasTeacherCapability && !hasStudentCapability) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Cannot access this teacher\'s slots')
    }

    const view = hasTeacherCapability ? 'teacher' : 'student'

    // Get weekday for the date
    const dateObj = new Date(date as string)
    const weekday = ((dateObj.getUTCDay() + 6) % 7) + 1 // Convert to 1-7

    // Get availability rules for this weekday
    const rules = await deps.availabilityRepo.listActiveRulesForWeekday(teacherId, weekday)

    // Get exceptions for this date
    const exceptions = await deps.availabilityRepo.listExceptions(teacherId, date as string, date as string)
    const dateExceptions = exceptions.filter((e) => e.date === date)

    // Get busy intervals (upcoming bookings) - convert strings to Dates
    const upcomingIntervalsRaw = await deps.bookingRepo.getUpcomingIntervals(
      teacherId,
      date as string,
      date as string
    )
    const busy = upcomingIntervalsRaw.map((interval) => ({
      startAt: new Date(interval.startAt),
      endAt: new Date(interval.endAt),
    }))

    // Compute slots using domain logic
    const result = computeSlots({
      date: date as string,
      rules: rules.map((r) => ({ startMinute: r.startMinute, endMinute: r.endMinute })),
      exceptions: dateExceptions.map((e) => ({ startMinute: e.startMinute, endMinute: e.endMinute })),
      busy,
      durationMinutes: course.durationMinutes,
      stepMinutes: teacher.slotStepMinutes,
      minLeadHours: view === 'teacher' ? 0 : teacher.minLeadHours,
      maxAdvanceDays: view === 'teacher' ? 999 : teacher.maxAdvanceDays,
      timezone: teacher.timezone,
      now: new Date(),
    })

    // Get balance for student view
    let balance = null
    if (principal.kind === 'Student') {
      balance = await deps.packageRepo.getBalance(principal.studentId!, courseId as string)
    } else if (principal.kind === 'User' && !hasTeacherCapability) {
      // User accessing as student - find their student record
      // For now, return null balance (would need to query student binding)
      balance = null
    }

    res.json(
      createSuccessEnvelope(
        {
          date,
          dateLabel: new Date(date as string).toLocaleDateString('zh-CN'),
          timezone: teacher.timezone,
          generatedAt: new Date().toISOString(),
          reason: result.reason || null,
          reasonText: result.reason
            ? {
                NO_AVAILABILITY: '当前日期没有开放时间',
                FULLY_BOOKED: '当前日期已被全部预约',
                INSUFFICIENT_SESSIONS: '剩余课时不足',
                SELF_BOOKING_DISABLED: '该课程需要联系老师安排',
                COURSE_ARCHIVED: '课程已归档',
              }[result.reason] || null
            : null,
          slots: result.slots.map((slot) => ({
            startAt: slot.startAt.toISOString(),
            endAt: slot.endAt.toISOString(),
            startLocal: slot.startLocal,
            endLocal: slot.endLocal,
            timeRange: slot.timeRange,
            label: slot.label,
          })),
          balance,
        },
        req.requestId
      )
    )
  })

  /**
   * GET /v1/teachers/:teacherId/bookable-days
   * 
   * Get days with available slots in a date range
   * Must fetch entire range in one call (not per-day)
   */
  router.get('/:teacherId/bookable-days', authMiddleware, requireAuth, async (req, res) => {
    const { teacherId } = req.params
    const { courseId, from, to } = req.query
    const principal = req.principal

    if (!courseId || !from || !to) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'courseId, from, and to are required')
    }

    // Validate date range (max 62 days)
    const fromDate = new Date(from as string)
    const toDate = new Date(to as string)
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff > 62) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Date range cannot exceed 62 days')
    }

    // Get teacher
    const teacher = await deps.teacherRepo.findById(teacherId)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher not found')
    }

    // Get course
    const course = await deps.courseRepo.findById(courseId as string)
    if (!course) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Course not found')
    }

    // Derive view and enforce authorization (same as slots endpoint)
    let hasTeacherCapability = false
    if (principal.kind === 'User' && principal.userId) {
      const userTeacher = await deps.teacherRepo.findByUserId(principal.userId)
      hasTeacherCapability = userTeacher !== null && userTeacher.teacherId === teacherId
    }

    let hasStudentCapability = false
    if (principal.kind === 'Student') {
      hasStudentCapability = principal.teacherId === teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      const student = await deps.studentRepo.findByTeacherAndUser(teacherId, principal.userId)
      hasStudentCapability = student !== null
    }

    if (!hasTeacherCapability && !hasStudentCapability) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Cannot access this teacher\'s availability')
    }

    const view = hasTeacherCapability ? 'teacher' : 'student'

    // Compute bookable days using callbacks per domain interface
    const days = await computeBookableDays(
      from as string,
      to as string,
      async (weekday: number) => {
        const rules = await deps.availabilityRepo.listActiveRulesForWeekday(teacherId, weekday)
        return rules.map((r) => ({ startMinute: r.startMinute, endMinute: r.endMinute }))
      },
      async (date: string) => {
        const exceptions = await deps.availabilityRepo.listExceptions(teacherId, date, date)
        return exceptions
          .filter((e) => e.date === date)
          .map((e) => ({ startMinute: e.startMinute, endMinute: e.endMinute }))
      },
      async (fromDate: Date, toDate: Date) => {
        const intervals = await deps.bookingRepo.getUpcomingIntervals(
          teacherId,
          fromDate.toISOString().substring(0, 10),
          toDate.toISOString().substring(0, 10)
        )
        return intervals.map((i) => ({ startAt: new Date(i.startAt), endAt: new Date(i.endAt) }))
      },
      courseId as string,
      course.durationMinutes,
      teacher.slotStepMinutes,
      view === 'teacher' ? 0 : teacher.minLeadHours,
      view === 'teacher' ? 999 : teacher.maxAdvanceDays,
      new Date()
    )

    // Get balance
    let balance = null
    if (principal.kind === 'Student') {
      balance = await deps.packageRepo.getBalance(principal.studentId!, courseId as string)
    }

    res.json(
      createSuccessEnvelope(
        {
          timezone: teacher.timezone,
          generatedAt: new Date().toISOString(),
          reason: days.length === 0 ? 'NO_AVAILABILITY' : null,
          reasonText: days.length === 0 ? '所选范围内没有可用时间' : null,
          days,
          balance,
        },
        req.requestId
      )
    )
  })

  return router
}
