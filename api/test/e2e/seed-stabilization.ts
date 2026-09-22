#!/usr/bin/env tsx
/**
 * Stabilization E2E Seed Script
 * 
 * Seeds minimal data for both API journey tests and Web Playwright E2E:
 * - Teacher (user + profile)
 * - Student (Active, unbound)
 * - Course (60min, self-bookable)
 * - Availability (all week, 08:00-20:00)
 * - Package (5 sessions via PACKAGE_CREATED)
 * - Invite token (Pending)
 * - Bookable slot (48h from now, passes L3 validation)
 * 
 * Output: JSON to stdout with env vars for Leo's web E2E
 * 
 * Authority: docs/wave1-stabilization.md
 */

import { Pool } from 'pg'
import { generateUserAccessToken, generateUserRefreshToken, generateStudentAccessToken, generateStudentRefreshToken } from '../../src/auth/jwt'

interface SeedOutput {
  // Teacher auth
  TEACHER_USER_ID: string
  TEACHER_ID: string
  TEACHER_ACCESS_TOKEN: string
  TEACHER_REFRESH_TOKEN: string
  
  // Student identity
  STUDENT_ID: string
  STUDENT_NAME: string
  
  // Invite (for student accept flow)
  INVITE_TOKEN: string
  INVITE_URL_PATH: string // e.g., /invites/{token}
  
  // After accept: student session (Leo can mint via POST /v1/invites/:token/accept)
  // Or use these pre-minted tokens for direct API calls
  STUDENT_ACCESS_TOKEN: string
  STUDENT_REFRESH_TOKEN: string
  
  // Course & package
  COURSE_ID: string
  COURSE_NAME: string
  PACKAGE_ID: string
  REMAINING_SESSIONS: number
  
  // Bookable slot (ISO times, passes L3: minLeadHours=2, maxAdvanceDays=30)
  SLOT_START_ISO: string
  SLOT_END_ISO: string
  SLOT_DATE: string
  
  // API base
  BASE_URL: string // e.g., http://localhost:8787/v1
}

async function seed(): Promise<SeedOutput> {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://rabbit:rabbit_test_password@localhost:5432/rabbit_test'
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.error('🌱 Seeding Stabilization E2E data...')

    // 1. Create user + teacher profile
    const userResult = await pool.query(
      `INSERT INTO app_user (nickname) VALUES ('E2E Teacher') RETURNING id`
    )
    const userId = userResult.rows[0].id

    const teacherResult = await pool.query(
      `INSERT INTO teacher_profile (user_id, name, timezone, min_lead_hours, free_cancel_hours, max_advance_days)
       VALUES ($1, 'E2E Teacher', 'Asia/Shanghai', 2, 24, 30)
       RETURNING id`,
      [userId]
    )
    const teacherId = teacherResult.rows[0].id

    // 2. Create course (60min, self-bookable)
    const courseResult = await pool.query(
      `INSERT INTO course (teacher_id, name, duration_minutes, allow_self_booking)
       VALUES ($1, 'E2E Course', 60, true)
       RETURNING id`,
      [teacherId]
    )
    const courseId = courseResult.rows[0].id

    // 3. Create availability rules (all week, 08:00-20:00 = 480-1200 minutes)
    await pool.query(
      `INSERT INTO availability_rule (teacher_id, weekday, start_minute, end_minute)
       VALUES 
         ($1, 1, 480, 1200), ($1, 2, 480, 1200), ($1, 3, 480, 1200),
         ($1, 4, 480, 1200), ($1, 5, 480, 1200), ($1, 6, 480, 1200), ($1, 7, 480, 1200)`,
      [teacherId]
    )

    // 4. Create student (Active, unbound)
    const studentResult = await pool.query(
      `INSERT INTO student (teacher_id, name, status)
       VALUES ($1, 'E2E Student', 'Active')
       RETURNING id`,
      [teacherId]
    )
    const studentId = studentResult.rows[0].id

    // 5. Create package with PACKAGE_CREATED transaction (5 sessions)
    const packageResult = await pool.query(
      `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
       VALUES ($1, $2, $3, 0, 0)
       RETURNING id`,
      [teacherId, studentId, courseId]
    )
    const packageId = packageResult.rows[0].id

    // Apply PACKAGE_CREATED transaction (+5 sessions)
    await pool.query(
      `SELECT * FROM apply_package_transaction($1, 'PACKAGE_CREATED', 5, NULL, NULL, 'Initial E2E package', NULL, NULL)`,
      [packageId]
    )

    // 6. Create invite token
    const inviteToken = `e2e-invite-${Date.now()}-${Math.random().toString(36).substring(7)}`
    await pool.query(
      `INSERT INTO student_invite (teacher_id, student_id, token, status, expires_at)
       VALUES ($1, $2, $3, 'Pending', now() + interval '7 days')`,
      [teacherId, studentId, inviteToken]
    )

    // 7. Calculate bookable slot (48h from now, passes minLeadHours=2)
    const now = new Date()
    const slotStart = new Date(now.getTime() + 48 * 3600 * 1000)
    
    // Round to next 30-min slot (slot_step_minutes=30)
    slotStart.setMinutes(Math.ceil(slotStart.getMinutes() / 30) * 30, 0, 0)
    
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000) // +60min
    const slotDate = slotStart.toISOString().substring(0, 10)

    // 8. Generate tokens
    const teacherAccessToken = generateUserAccessToken(userId)
    const teacherRefreshToken = generateUserRefreshToken(userId)
    const studentAccessToken = generateStudentAccessToken(studentId, teacherId)
    const studentRefreshToken = generateStudentRefreshToken(studentId, teacherId)

    console.error('✅ Seed complete!')

    const output: SeedOutput = {
      TEACHER_USER_ID: userId,
      TEACHER_ID: teacherId,
      TEACHER_ACCESS_TOKEN: teacherAccessToken,
      TEACHER_REFRESH_TOKEN: teacherRefreshToken,
      
      STUDENT_ID: studentId,
      STUDENT_NAME: 'E2E Student',
      
      INVITE_TOKEN: inviteToken,
      INVITE_URL_PATH: `/invites/${inviteToken}`,
      
      STUDENT_ACCESS_TOKEN: studentAccessToken,
      STUDENT_REFRESH_TOKEN: studentRefreshToken,
      
      COURSE_ID: courseId,
      COURSE_NAME: 'E2E Course',
      PACKAGE_ID: packageId,
      REMAINING_SESSIONS: 5,
      
      SLOT_START_ISO: slotStart.toISOString(),
      SLOT_END_ISO: slotEnd.toISOString(),
      SLOT_DATE: slotDate,
      
      BASE_URL: process.env.API_BASE_URL || 'http://localhost:8787/v1',
    }

    return output
  } finally {
    await pool.end()
  }
}

// Run seed and output JSON
import { pathToFileURL } from 'url'

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(output => {
      console.log(JSON.stringify(output, null, 2))
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Seed failed:', error)
      process.exit(1)
    })
}

export { seed, type SeedOutput }
