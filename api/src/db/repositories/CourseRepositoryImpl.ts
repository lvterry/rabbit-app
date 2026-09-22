/**
 * CourseRepositoryImpl
 * Handles course data access
 */

import type { Pool } from 'pg'
import type {
  CourseView,
  CreateCourseRequest,
  UpdateCourseRequest,
  CourseStatus,
} from '@rabbit/shared'

export class CourseRepositoryImpl {
  constructor(private pool: Pool) {}

  private mapRowToCourseView(row: any): CourseView {
    return {
      courseId: row.id,
      teacherId: row.teacher_id,
      name: row.name,
      durationMinutes: row.duration_minutes,
      allowSelfBooking: row.allow_self_booking,
      status: row.status as CourseStatus,
      createdAt: row.created_at.toISOString(),
    }
  }

  async findById(courseId: string): Promise<CourseView | null> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at
       FROM course
       WHERE id = $1`,
      [courseId]
    )

    return result.rows.length > 0 ? this.mapRowToCourseView(result.rows[0]) : null
  }

  async listByTeacher(teacherId: string): Promise<CourseView[]> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at
       FROM course
       WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacherId]
    )

    return result.rows.map(row => this.mapRowToCourseView(row))
  }

  async listActiveByTeacher(teacherId: string): Promise<CourseView[]> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at
       FROM course
       WHERE teacher_id = $1 AND status = 'Active'
       ORDER BY created_at DESC`,
      [teacherId]
    )

    return result.rows.map(row => this.mapRowToCourseView(row))
  }

  async create(teacherId: string, data: CreateCourseRequest): Promise<CourseView> {
    const result = await this.pool.query(
      `INSERT INTO course (teacher_id, name, duration_minutes, allow_self_booking)
       VALUES ($1, $2, $3, $4)
       RETURNING id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at`,
      [teacherId, data.name, data.durationMinutes, data.allowSelfBooking]
    )

    return this.mapRowToCourseView(result.rows[0])
  }

  async update(courseId: string, data: UpdateCourseRequest): Promise<CourseView> {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(data.name)
    }
    if (data.durationMinutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex++}`)
      values.push(data.durationMinutes)
    }
    if (data.allowSelfBooking !== undefined) {
      updates.push(`allow_self_booking = $${paramIndex++}`)
      values.push(data.allowSelfBooking)
    }

    if (updates.length === 0) {
      return (await this.findById(courseId))!
    }

    values.push(courseId)

    const result = await this.pool.query(
      `UPDATE course
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at`,
      values
    )

    return this.mapRowToCourseView(result.rows[0])
  }

  async updateStatus(courseId: string, status: CourseStatus): Promise<CourseView> {
    const result = await this.pool.query(
      `UPDATE course
       SET status = $1
       WHERE id = $2
       RETURNING id, teacher_id, name, duration_minutes, allow_self_booking, status, created_at`,
      [status, courseId]
    )

    return this.mapRowToCourseView(result.rows[0])
  }

  async allowsSelfBooking(courseId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT allow_self_booking FROM course WHERE id = $1`,
      [courseId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Course ${courseId} not found`)
    }

    return result.rows[0].allow_self_booking
  }

  async getDuration(courseId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT duration_minutes FROM course WHERE id = $1`,
      [courseId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Course ${courseId} not found`)
    }

    return result.rows[0].duration_minutes
  }
}
