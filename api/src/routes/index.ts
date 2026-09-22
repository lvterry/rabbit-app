/**
 * Route Module Exports
 * 
 * All Phase 0-2 endpoints per parallel-plan-v2.md §12
 */

import { Router } from 'express'
import type {
  TeacherRepository,
  CourseRepository,
  StudentRepository,
  AvailabilityRepository,
  PackageRepository,
  BookingRepository,
  IdempotencyRepository,
} from '../ports'
import { createAuthRouter } from './auth'
import { createInviteRouter } from './invite'
import { createBookingRouter } from './booking'
import { createSlotsRouter } from './slots'
import { createTeacherRouter } from './teacher'
import { createStudentRouter } from './student'
import { createCourseRouter } from './course'
import { createAvailabilityRouter } from './availability'
import { createPackageRouter } from './package'
import { createDeviceRouter } from './device'

export interface RouteDependencies {
  teacherRepo: TeacherRepository
  courseRepo: CourseRepository
  studentRepo: StudentRepository
  availabilityRepo: AvailabilityRepository
  packageRepo: PackageRepository
  bookingRepo: BookingRepository
  idempotencyRepo: IdempotencyRepository
}

/**
 * Create main API router with all Phase 0-2 routes
 */
export function createApiRouter(deps: RouteDependencies): Router {
  const router = Router()

  // Mount route modules (Phase 0-2)
  router.use('/auth', createAuthRouter(deps))
  router.use('/invites', createInviteRouter(deps))
  router.use('/bookings', createBookingRouter(deps))
  router.use('/teachers', createSlotsRouter(deps))
  router.use('/me/teacher', createTeacherRouter(deps))
  router.use('/students', createStudentRouter(deps))
  router.use('/courses', createCourseRouter(deps))
  router.use('/availability', createAvailabilityRouter(deps))
  router.use('/packages', createPackageRouter(deps))
  router.use('/me/devices', createDeviceRouter())

  return router
}
