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
import { createSessionRouter } from './session'
import { createInviteRouter } from './invite'
import { createBookingRouter } from './booking'
import { createSlotsRouter } from './slots'
import { createTeacherRouter } from './teacher'
import { createStudentRouter } from './student'
import { createCourseRouter } from './course'
import { createAvailabilityRouter } from './availability'
import { createPackageRouter } from './package'
import { createDeviceRouter } from './device'

import type { Pool } from 'pg'

export interface RouteDependencies {
  teacherRepo: TeacherRepository
  courseRepo: CourseRepository
  studentRepo: StudentRepository
  availabilityRepo: AvailabilityRepository
  packageRepo: PackageRepository
  bookingRepo: BookingRepository
  idempotencyRepo: IdempotencyRepository
  pool: Pool
}

/**
 * Create main API router with all Phase 0-2 routes
 */
export function createApiRouter(deps: RouteDependencies): Router {
  const router = Router()

  // Mount route modules per §12 Phase 0-2 freeze
  
  // Auth routes (login, refresh) - under /auth
  router.use('/auth', createAuthRouter(deps))
  
  // Session metadata routes - at root level (NOT under /auth)
  router.use('/', createSessionRouter(deps))
  
  // Business routes - mounted to match §12 exact paths
  router.use('/invites', createInviteRouter(deps))
  router.use('/bookings', createBookingRouter(deps))
  router.use('/teachers', createSlotsRouter(deps))
  router.use('/me/teacher', createTeacherRouter(deps))
  router.use('/students', createStudentRouter(deps))
  router.use('/courses', createCourseRouter(deps))
  router.use('/availability', createAvailabilityRouter(deps))
  
  // Package routes: mount at root to handle both /students/* and /packages/* paths
  router.use('/', createPackageRouter(deps))
  
  router.use('/me/devices', createDeviceRouter(deps.pool))

  return router
}
