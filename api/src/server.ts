/**
 * Rabbit API Server
 * 
 * Authority: impl-guide.md §1, §2
 * 
 * Main Express application with all Phase 0-2 endpoints
 */

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import { getPool } from './db/connection'
import {
  TeacherRepositoryImpl,
  CourseRepositoryImpl,
  StudentRepositoryImpl,
  AvailabilityRepositoryImpl,
  PackageRepositoryImpl,
  BookingRepositoryImpl,
  IdempotencyRepositoryImpl,
} from './db/repositories'
import { requestIdMiddleware, authMiddleware, createErrorHandler, notFoundHandler } from './middleware'
import { createIdempotencyMiddleware } from './middleware/idempotency'
import { createApiRouter } from './routes'

// Load environment variables
config()

const PORT = process.env.PORT || 8787
const NODE_ENV = process.env.NODE_ENV || 'development'

async function startServer() {
  const app = express()

  // Middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }))
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestIdMiddleware)

  // Initialize database connection
  const pool = getPool()

  // Initialize repositories
  const teacherRepo = new TeacherRepositoryImpl(pool)
  const courseRepo = new CourseRepositoryImpl(pool)
  const studentRepo = new StudentRepositoryImpl(pool)
  const availabilityRepo = new AvailabilityRepositoryImpl(pool)
  const packageRepo = new PackageRepositoryImpl(pool)
  const bookingRepo = new BookingRepositoryImpl(pool)
  const idempotencyRepo = new IdempotencyRepositoryImpl(pool)

  // Idempotency middleware (before routes)
  app.use(createIdempotencyMiddleware(idempotencyRepo))

  // Mount API routes at /v1
  const apiRouter = createApiRouter({
    teacherRepo,
    courseRepo,
    studentRepo,
    availabilityRepo,
    packageRepo,
    bookingRepo,
    idempotencyRepo,
    pool,
  })
  
  app.use('/v1', authMiddleware, apiRouter)

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // 404 handler
  app.use(notFoundHandler)

  // Error handler (must be last) - inject idempotencyRepo for 23505 handling  
  app.use(createErrorHandler(idempotencyRepo))

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Rabbit API server running`)
    console.log(`   Environment: ${NODE_ENV}`)
    console.log(`   Port: ${PORT}`)
    console.log(`   API: http://localhost:${PORT}/v1`)
    console.log(`   Health: http://localhost:${PORT}/health`)
  })
}

// Start server
startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
