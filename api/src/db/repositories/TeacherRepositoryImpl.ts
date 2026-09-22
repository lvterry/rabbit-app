/**
 * TeacherRepositoryImpl
 * Handles teacher profile data access
 */

import type { Pool } from 'pg'
import type { TeacherProfile, CreateTeacherRequest, UpdateTeacherRequest, TeacherStatus } from '@rabbit/shared'

export class TeacherRepositoryImpl {
  constructor(private pool: Pool) {}

  private mapRowToProfile(row: any): TeacherProfile {
    return {
      teacherId: row.id,
      userId: row.user_id,
      name: row.name,
      avatar: row.avatar_url,
      bio: row.bio,
      timezone: row.timezone,
      slotStepMinutes: row.slot_step_minutes,
      minLeadHours: row.min_lead_hours,
      maxAdvanceDays: row.max_advance_days,
      freeCancelHours: row.free_cancel_hours,
      autoSettleHours: row.auto_settle_hours,
      undoCompleteDays: row.undo_complete_days,
      maxReschedules: row.max_reschedules,
      status: row.status as TeacherStatus,
    }
  }

  async findById(teacherId: string): Promise<TeacherProfile | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, avatar_url, bio, timezone,
              slot_step_minutes, min_lead_hours, max_advance_days,
              free_cancel_hours, auto_settle_hours, undo_complete_days,
              max_reschedules, status
       FROM teacher_profile
       WHERE id = $1`,
      [teacherId]
    )

    return result.rows.length > 0 ? this.mapRowToProfile(result.rows[0]) : null
  }

  async findByUserId(userId: string): Promise<TeacherProfile | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, avatar_url, bio, timezone,
              slot_step_minutes, min_lead_hours, max_advance_days,
              free_cancel_hours, auto_settle_hours, undo_complete_days,
              max_reschedules, status
       FROM teacher_profile
       WHERE user_id = $1`,
      [userId]
    )

    return result.rows.length > 0 ? this.mapRowToProfile(result.rows[0]) : null
  }

  async create(userId: string, data: CreateTeacherRequest): Promise<TeacherProfile> {
    const result = await this.pool.query(
      `INSERT INTO teacher_profile (
        user_id, name, avatar_url, bio
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, name, avatar_url, bio, timezone,
                slot_step_minutes, min_lead_hours, max_advance_days,
                free_cancel_hours, auto_settle_hours, undo_complete_days,
                max_reschedules, status`,
      [userId, data.name, data.avatarUrl || null, data.bio || null]
    )

    return this.mapRowToProfile(result.rows[0])
  }

  async update(teacherId: string, data: UpdateTeacherRequest): Promise<TeacherProfile> {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(data.name)
    }
    if (data.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`)
      values.push(data.avatarUrl)
    }
    if (data.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`)
      values.push(data.bio)
    }
    if (data.slotStepMinutes !== undefined) {
      updates.push(`slot_step_minutes = $${paramIndex++}`)
      values.push(data.slotStepMinutes)
    }
    if (data.minLeadHours !== undefined) {
      updates.push(`min_lead_hours = $${paramIndex++}`)
      values.push(data.minLeadHours)
    }
    if (data.maxAdvanceDays !== undefined) {
      updates.push(`max_advance_days = $${paramIndex++}`)
      values.push(data.maxAdvanceDays)
    }
    if (data.freeCancelHours !== undefined) {
      updates.push(`free_cancel_hours = $${paramIndex++}`)
      values.push(data.freeCancelHours)
    }
    if (data.autoSettleHours !== undefined) {
      updates.push(`auto_settle_hours = $${paramIndex++}`)
      values.push(data.autoSettleHours)
    }
    if (data.undoCompleteDays !== undefined) {
      updates.push(`undo_complete_days = $${paramIndex++}`)
      values.push(data.undoCompleteDays)
    }
    if (data.maxReschedules !== undefined) {
      updates.push(`max_reschedules = $${paramIndex++}`)
      values.push(data.maxReschedules)
    }

    values.push(teacherId)

    const result = await this.pool.query(
      `UPDATE teacher_profile
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, user_id, name, avatar_url, bio, timezone,
                 slot_step_minutes, min_lead_hours, max_advance_days,
                 free_cancel_hours, auto_settle_hours, undo_complete_days,
                 max_reschedules, status`,
      values
    )

    return this.mapRowToProfile(result.rows[0])
  }

  async hasTeacherCapability(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM teacher_profile WHERE user_id = $1 AND status = 'Active'`,
      [userId]
    )

    return result.rows.length > 0
  }

  async getTimezone(teacherId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT timezone FROM teacher_profile WHERE id = $1`,
      [teacherId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Teacher ${teacherId} not found`)
    }

    return result.rows[0].timezone
  }

  async getBookingRules(teacherId: string): Promise<{
    slotStepMinutes: number
    minLeadHours: number
    maxAdvanceDays: number
    freeCancelHours: number
    autoSettleHours: number
    undoCompleteDays: number
    maxReschedules: number
  }> {
    const result = await this.pool.query(
      `SELECT slot_step_minutes, min_lead_hours, max_advance_days,
              free_cancel_hours, auto_settle_hours, undo_complete_days,
              max_reschedules
       FROM teacher_profile
       WHERE id = $1`,
      [teacherId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Teacher ${teacherId} not found`)
    }

    const row = result.rows[0]
    return {
      slotStepMinutes: row.slot_step_minutes,
      minLeadHours: row.min_lead_hours,
      maxAdvanceDays: row.max_advance_days,
      freeCancelHours: row.free_cancel_hours,
      autoSettleHours: row.auto_settle_hours,
      undoCompleteDays: row.undo_complete_days,
      maxReschedules: row.max_reschedules,
    }
  }
}
