/**
 * Minimal debug test to isolate 500 error issue
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import supertest from 'supertest'
import { createRealApp } from '../helpers/realApp'
import { generateStudentAccessToken, generateTeacherAccessToken } from '../../src/auth/jwt'

let pool: Pool
let request: supertest.SuperTest<supertest.Test>
let teacherId: string
let studentId: string
let courseId: string
let packageId: string
let studentAccessToken: string

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const app = createRealApp(pool)
  request = supertest(app)

  // 1. Create teacher
  const userResult = await pool.query(
    `INSERT INTO app_user (nickname) VALUES ('Debug Teacher') RETURNING id`
  )
  const userId = userResult.rows[0].id

  const teacherResult = await pool.query(
    `INSERT INTO teacher_profile (user_id, name, timezone, min_lead_hours, free_cancel_hours)
     VALUES ($1, 'Debug Teacher', 'Asia/Shanghai', 2, 24)
     RETURNING id`,
    [userId]
  )
  teacherId = teacherResult.rows[0].id

  // 2. Create course
  const courseResult = await pool.query(
    `INSERT INTO course (teacher_id, name, duration_minutes, allow_self_booking)
     VALUES ($1, 'Debug Course', 60, true)
     RETURNING id`,
    [teacherId]
  )
  courseId = courseResult.rows[0].id

  // 3. Create student
  const studentResult = await pool.query(
    `INSERT INTO student (teacher_id, name, status)
     VALUES ($1, 'Debug Student', 'Active')
     RETURNING id`,
    [teacherId]
  )
  studentId = studentResult.rows[0].id

  // 4. Create package
  const packageResult = await pool.query(
    `INSERT INTO lesson_package (teacher_id, student_id, course_id, purchased_sessions, remaining_sessions)
     VALUES ($1, $2, $3, 0, 0)
     RETURNING id`,
    [teacherId, studentId, courseId]
  )
  packageId = packageResult.rows[0].id

  // Apply PACKAGE_CREATED transaction
  await pool.query(
    `SELECT * FROM apply_package_transaction($1, 'PACKAGE_CREATED', 5, NULL, NULL, 'Initial', NULL, NULL)`,
    [packageId]
  )

  // Generate token
  studentAccessToken = generateStudentAccessToken(studentId, teacherId)

  console.log('Debug setup complete:', { teacherId, studentId, courseId, packageId })
})

afterAll(async () => {
  if (pool) {
    await pool.query('DELETE FROM lesson_package WHERE id = $1', [packageId])
    await pool.query('DELETE FROM student WHERE id = $1', [studentId])
    await pool.query('DELETE FROM course WHERE id = $1', [courseId])
    await pool.query('DELETE FROM teacher_profile WHERE id = $1', [teacherId])
    await pool.end()
  }
})

describe('Debug E2E', () => {
  it('can call student-home with Student token', async () => {
    console.log('Calling student-home with token for student:', studentId, 'teacher:', teacherId)
    
    const res = await request
      .get('/v1/me/student-home')
      .set('Authorization', `Bearer ${studentAccessToken}`)

    console.log('Response status:', res.status)
    console.log('Response body:', JSON.stringify(res.body, null, 2))

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toHaveProperty('cards')
    expect(res.body.data).toHaveProperty('bound')
  })
})
