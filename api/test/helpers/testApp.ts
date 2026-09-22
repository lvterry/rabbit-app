/**
 * Test App Helper
 * 
 * Creates Express app with test database for integration tests
 */

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { Pool } from 'pg'
import { createApiRouter } from '../../src/routes'
import { authMiddleware, createIdempotencyMiddleware, createErrorHandler } from '../../src/middleware'
import { requestIdMiddleware } from '../../src/middleware/requestId'

// Mock repositories for testing
import type {
  TeacherRepository,
  CourseRepository,
  StudentRepository,
  AvailabilityRepository,
  PackageRepository,
  BookingRepository,
  IdempotencyRepository,
} from '../../src/ports'

/**
 * Create test Express app with mocked dependencies
 */
export function createTestApp(repos: {
  teacherRepo: TeacherRepository
  courseRepo: CourseRepository
  studentRepo: StudentRepository
  availabilityRepo: AvailabilityRepository
  packageRepo: PackageRepository
  bookingRepo: BookingRepository
  idempotencyRepo: IdempotencyRepository
  pool: Pool
}) {
  const app = express()

  // Middleware
  app.use(cors())
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestIdMiddleware)

  // Auth middleware MUST run before idempotency (idempotency needs req.principal)
  app.use(authMiddleware)

  // Idempotency middleware (after auth, before routes)
  app.use(createIdempotencyMiddleware(repos.idempotencyRepo))

  // API routes
  app.use('/v1', createApiRouter(repos))

  // Error handler (with idempotency support for 23505 handling)
  app.use(createErrorHandler(repos.idempotencyRepo))

  return app
}

/**
 * Create mock pool for testing
 */
export function createMockPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    } as any),
  } as any
}
