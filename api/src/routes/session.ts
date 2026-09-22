/**
 * Session Routes
 * 
 * Authority: parallel-plan-v2.md §12.1
 * 
 * Session metadata endpoints (NOT under /auth):
 * - GET /v1/me (current session info)
 * - GET /v1/meta (session capabilities)
 */

import { Router } from 'express'
import type { TeacherRepository, StudentRepository, BookingRepository, PackageRepository } from '../ports'
import { createSuccessEnvelope, AppError, asyncHandler } from '../http'
import { ErrorCode } from '@rabbit/shared'
import { authMiddleware, requireAuth } from '../middleware'

export function createSessionRouter(deps: {
  teacherRepo: TeacherRepository
  studentRepo: StudentRepository
  bookingRepo: BookingRepository
  packageRepo: PackageRepository
}): Router {
  const router = Router()

  /**
   * GET /v1/me
   * 
   * Get current session info
   */
  router.get('/me', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal

    if (principal.kind === 'User') {
      // Fetch user's teacher profile and student bindings
      const teacher = await deps.teacherRepo.findByUserId(principal.userId!)
      const students: any[] = [] // TODO: Query students bound to this user

      res.json(
        createSuccessEnvelope(
          {
            kind: 'User',
            userId: principal.userId,
            teacher: teacher
              ? {
                  teacherId: teacher.teacherId,
                  name: teacher.name,
                  avatarUrl: teacher.avatar || null,
                }
              : null,
            students,
          },
          req.requestId
        )
      )
    } else if (principal.kind === 'Student') {
      // Fetch student info
      const student = await deps.studentRepo.findById(principal.studentId!)
      const teacher = await deps.teacherRepo.findById(principal.teacherId!)

      res.json(
        createSuccessEnvelope(
          {
            kind: 'Student',
            studentId: principal.studentId,
            studentName: student?.student.name || '',
            teacher: teacher
              ? {
                  teacherId: teacher.teacherId,
                  name: teacher.name,
                  avatarUrl: teacher.avatar || null,
                }
              : null,
          },
          req.requestId
        )
      )
    } else {
      res.json(
        createSuccessEnvelope(
          {
            kind: principal.kind,
          },
          req.requestId
        )
      )
    }
  }))

  /**
   * GET /v1/meta
   * 
   * Get session capabilities
   */
  router.get('/meta', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal

    let canActAsTeacher = false
    let canActAsStudent = false

    if (principal.kind === 'User' && principal.userId) {
      // Check teacher capability
      const teacher = await deps.teacherRepo.findByUserId(principal.userId)
      canActAsTeacher = teacher !== null

      // Check student capability
      // User is a student if they have any student binding
      // (for simplicity, return false for now - routes will check specific binding)
      canActAsStudent = false
    } else if (principal.kind === 'Student') {
      canActAsStudent = true
    }

    res.json(
      createSuccessEnvelope(
        {
          version: '1.0.0',
          capabilities: {
            canActAsTeacher,
            canActAsStudent,
          },
        },
        req.requestId
      )
    )
  }))

  /**
   * GET /v1/me/teacher-day
   * 
   * Get teacher's day view (today's bookings)
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-day', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // Get today's bookings for this teacher
    const today = new Date().toISOString().substring(0, 10)
    const dayView = await deps.bookingRepo.getTeacherDayView(teacher.teacherId, today)
    
    const bookings = dayView.bookings

    res.json(
      createSuccessEnvelope(
        {
          date: today,
          bookings,
        },
        req.requestId
      )
    )
  }))

  /**
   * GET /v1/me/teacher-calendar
   * 
   * Get teacher's calendar view (month bookings)
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-calendar', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { month } = req.query // YYYY-MM format

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // Get calendar for month (or current month if not specified)
    const targetMonth = (month as string) || new Date().toISOString().substring(0, 7)
    const fromDate = `${targetMonth}-01`
    const toDate = `${targetMonth}-31`
    const bookings = await deps.bookingRepo.getTeacherCalendarView(teacher.teacherId, fromDate, toDate)
    
    // Group by date for calendar display
    const dayMap = new Map<string, any[]>()
    for (const booking of bookings) {
      const date = booking.startAt.substring(0, 10)
      if (!dayMap.has(date)) {
        dayMap.set(date, [])
      }
      dayMap.get(date)!.push(booking)
    }
    
    const days = Array.from(dayMap.entries()).map(([date, bookings]) => ({
      date,
      bookingCount: bookings.length,
      bookings,
    }))

    res.json(
      createSuccessEnvelope(
        {
          month: targetMonth,
          days,
        },
        req.requestId
      )
    )
  }))

  /**
   * GET /v1/me/teacher-upcoming
   * 
   * Get teacher's upcoming bookings list
   * §12.8 Phase 0-2
   */
  router.get('/me/teacher-upcoming', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { limit = '20', offset = '0' } = req.query

    if (principal.kind !== 'User' || !principal.userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only endpoint')
    }

    const teacher = await deps.teacherRepo.findByUserId(principal.userId)
    if (!teacher) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
    }

    // Get upcoming bookings for this teacher
    const allUpcoming = await deps.bookingRepo.listUpcomingByTeacher(teacher.teacherId)
    
    // Apply pagination
    const limitNum = parseInt(limit as string)
    const offsetNum = parseInt(offset as string)
    const items = allUpcoming.slice(offsetNum, offsetNum + limitNum)
    
    const result = {
      items,
      hasMore: allUpcoming.length > offsetNum + limitNum,
    }

    res.json(
      createSuccessEnvelope(
        {
          items: result.items,
          hasMore: result.hasMore,
        },
        req.requestId
      )
    )
  }))

  /**
   * GET /v1/me/student-home
   * 
   * Get student's home view
   * §12.8 Phase 0-2
   * 
   * For User principals, requires teacherId query param to resolve student binding
   */
  router.get('/me/student-home', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { teacherId: queryTeacherId } = req.query

    // Resolve student identity
    let studentId: string | null = null
    let teacherId: string | null = null

    if (principal.kind === 'Student') {
      studentId = principal.studentId
      teacherId = principal.teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      // User must provide teacherId to resolve student binding
      if (!queryTeacherId) {
        throw new AppError(ErrorCode.VALIDATION_FAILED, 'teacherId query parameter required for User principals')
      }

      const binding = await deps.studentRepo.findByTeacherAndUser(queryTeacherId as string, principal.userId)
      if (!binding) {
        throw new AppError(ErrorCode.FORBIDDEN, 'User not bound to any student for this teacher')
      }

      studentId = binding.student.studentId
      teacherId = queryTeacherId as string
    }

    if (!studentId || !teacherId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Student-only endpoint')
    }

    // P0 #7a: student-home must return {cards, bound} only
    // NOT upcomingBooking/recentBookings/balance at top level
    
    // Get teacher info
    const teacher = await deps.teacherRepo.findById(teacherId)
    if (!teacher) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Teacher not found')
    }

    // Get student info
    const student = await deps.studentRepo.findById(studentId)
    if (!student) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Student not found')
    }

    // Get packages and bookings for this student
    const packages = await deps.packageRepo.listByStudent(studentId)
    const upcomingBookings = await deps.bookingRepo.listUpcomingByStudent(studentId)
    
    // Build courses summary
    const coursesMap = new Map()
    for (const pkg of packages) {
      if (!coursesMap.has(pkg.courseId)) {
        const nextBooking = upcomingBookings.find((b: any) => b.courseId === pkg.courseId)
        coursesMap.set(pkg.courseId, {
          courseId: pkg.courseId,
          courseName: pkg.courseName,
          durationMinutes: 0, // TODO: get from course
          allowSelfBooking: true, // TODO: get from course
          remaining: 0,
          purchased: null,
          batchCount: 0,
          available: 0,
          exhausted: false,
          fullyReserved: false,
          nextBooking: nextBooking || null
        })
      }
      const course = coursesMap.get(pkg.courseId)
      course.remaining += pkg.remainingSessions
      course.batchCount++
      if (pkg.status === 'Active') {
        course.purchased = course.batchCount === 1 ? pkg.purchasedSessions : null
      }
    }

    const cards = [{
      teacherId,
      teacherName: teacher.name,
      teacherAvatarUrl: teacher.avatar || null,
      studentId,
      studentName: student.student.name,
      courses: Array.from(coursesMap.values()),
      remainingTotal: Array.from(coursesMap.values()).reduce((sum: number, c: any) => sum + c.remaining, 0)
    }]

    res.json(
      createSuccessEnvelope(
        {
          cards,
          bound: !!student.student.userId
        },
        req.requestId
      )
    )
  }))

  /**
   * GET /v1/me/student-bookings
   * 
   * P0 #7b: Must accept scope parameter and return {upcoming:[]} or {history:[]}
   * NOT {items, hasMore}
   * 
   * For User principals, requires teacherId query param to resolve student binding
   */
  router.get('/me/student-bookings', authMiddleware, requireAuth, asyncHandler(async (req, res) => {
    const principal = req.principal
    const { teacherId: queryTeacherId, scope } = req.query

    // Validate scope
    if (!scope || (scope !== 'upcoming' && scope !== 'history')) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'scope parameter required: upcoming or history')
    }

    // Resolve student identity
    let studentId: string | null = null
    let teacherId: string | null = null

    if (principal.kind === 'Student') {
      studentId = principal.studentId
      teacherId = principal.teacherId
    } else if (principal.kind === 'User' && principal.userId) {
      // User must provide teacherId to resolve student binding
      if (!queryTeacherId) {
        throw new AppError(ErrorCode.VALIDATION_FAILED, 'teacherId query parameter required for User principals')
      }

      const binding = await deps.studentRepo.findByTeacherAndUser(queryTeacherId as string, principal.userId)
      if (!binding) {
        throw new AppError(ErrorCode.FORBIDDEN, 'User not bound to any student for this teacher')
      }

      studentId = binding.student.studentId
      teacherId = queryTeacherId as string
    }

    if (!studentId || !teacherId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Student-only endpoint')
    }

    // Get student bookings based on scope
    if (scope === 'upcoming') {
      const upcoming = await deps.bookingRepo.listUpcomingByStudent(studentId)
      res.json(createSuccessEnvelope({ upcoming }, req.requestId))
    } else {
      // history: all non-upcoming bookings
      const allBookings = await deps.bookingRepo.listByStudent(studentId)
      const history = allBookings.filter((b: any) => b.status !== 'Upcoming')
      res.json(createSuccessEnvelope({ history }, req.requestId))
    }
  }))

  return router
}
