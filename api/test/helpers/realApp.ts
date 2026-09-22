/**
 * Real App Helper for E2E Testing
 * 
 * Creates Express app with REAL repository implementations and REAL Postgres pool
 * (unlike testApp.ts which accepts mocked repos).
 * 
 * Used by E2E tests that require full HTTP journey against real database.
 */

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import type { Pool } from 'pg'
import { createApiRouter } from '../../src/routes'
import { authMiddleware, createErrorHandler, requestIdMiddleware } from '../../src/middleware'
import { createIdempotencyMiddleware } from '../../src/middleware/idempotency'
import {
  TeacherRepositoryImpl,
  CourseRepositoryImpl,
  StudentRepositoryImpl,
  AvailabilityRepositoryImpl,
  PackageRepositoryImpl,
  BookingRepositoryImpl,
  IdempotencyRepositoryImpl,
} from '../../src/db/repositories'

/**
 * Create test Express app with REAL database repositories
 */
export function createRealApp(pool: Pool) {
  const app = express()

  // Middleware
  app.use(cors({ credentials: true }))
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestIdMiddleware)

  // Initialize REAL repositories with pool
  const teacherRepo = new TeacherRepositoryImpl(pool)
  const courseRepo = new CourseRepositoryImpl(pool)
  const studentRepo = new StudentRepositoryImpl(pool)
  const availabilityRepo = new AvailabilityRepositoryImpl(pool)
  const packageRepo = new PackageRepositoryImpl(pool)
  const bookingRepo = new BookingRepositoryImpl(pool)
  const idempotencyRepo = new IdempotencyRepositoryImpl(pool)

  // Auth middleware MUST run before idempotency
  app.use(authMiddleware)

  // Idempotency middleware (after auth, before routes)
  app.use(createIdempotencyMiddleware(idempotencyRepo))

  // Mount API routes
  app.use('/v1', createApiRouter({
    teacherRepo,
    courseRepo,
    studentRepo,
    availabilityRepo,
    packageRepo,
    bookingRepo,
    idempotencyRepo,
    pool,
  }))

  // Error handler (must be last)
  app.use(createErrorHandler(idempotencyRepo))

  return app
}
