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

  // Mount route modules
  router.use('/auth', createAuthRouter(deps))
  router.use('/invites', createInviteRouter(deps))

  // TODO: Mount remaining route modules:
  // - /me (teacher, student views)
  // - /students
  // - /courses
  // - /availability
  // - /packages
  // - /teachers/:teacherId/slots
  // - /teachers/:teacherId/bookable-days
  // - /bookings
  // - /devices

  return router
}
