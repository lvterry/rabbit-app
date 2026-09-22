/**
 * AvailabilityRepositoryImpl
 * Handles teacher availability rules and exceptions
 */

import type { Pool } from 'pg'
import type {
  AvailabilityRuleView,
  AvailabilityExceptionView,
  CreateAvailabilityRuleRequest,
  CreateAvailabilityExceptionRequest,
} from '@rabbit/shared'
import { minutesToHHmm, formatDateLabel } from '../../domain/time'

export class AvailabilityRepositoryImpl {
  constructor(private pool: Pool) {}

  private mapRowToRuleView(row: any): AvailabilityRuleView {
    const startLocal = minutesToHHmm(row.start_minute)
    const endLocal = minutesToHHmm(row.end_minute)
    return {
      ruleId: row.id,
      teacherId: row.teacher_id,
      weekday: row.weekday,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      startLocal,
      endLocal,
      timeRange: `${startLocal}–${endLocal}`,
      status: row.status,
    }
  }

  private mapRowToExceptionView(row: any): AvailabilityExceptionView {
    const isAllDay = row.start_minute === null && row.end_minute === null
    let startLocal: string | null = null
    let endLocal: string | null = null
    let timeRange: string | null = null

    if (!isAllDay) {
      startLocal = minutesToHHmm(row.start_minute)
      endLocal = minutesToHHmm(row.end_minute)
      timeRange = `${startLocal}–${endLocal}`
    }

    return {
      exceptionId: row.id,
      teacherId: row.teacher_id,
      date: row.on_date,
      dateLabel: formatDateLabel(row.on_date),
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      startLocal,
      endLocal,
      timeRange,
      reason: row.reason,
      isAllDay,
    }
  }

  async listRules(teacherId: string): Promise<AvailabilityRuleView[]> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, weekday, start_minute, end_minute, status
       FROM availability_rule
       WHERE teacher_id = $1
       ORDER BY weekday, start_minute`,
      [teacherId]
    )

    return result.rows.map(row => this.mapRowToRuleView(row))
  }

  async listActiveRulesForWeekday(
    teacherId: string,
    weekday: number
  ): Promise<AvailabilityRuleView[]> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, weekday, start_minute, end_minute, status
       FROM availability_rule
       WHERE teacher_id = $1
         AND weekday = $2
         AND status = 'Active'
       ORDER BY start_minute`,
      [teacherId, weekday]
    )

    return result.rows.map(row => this.mapRowToRuleView(row))
  }

  async createRule(
    teacherId: string,
    data: CreateAvailabilityRuleRequest
  ): Promise<AvailabilityRuleView> {
    const result = await this.pool.query(
      `INSERT INTO availability_rule (teacher_id, weekday, start_minute, end_minute)
       VALUES ($1, $2, $3, $4)
       RETURNING id, teacher_id, weekday, start_minute, end_minute, status`,
      [teacherId, data.weekday, data.startMinute, data.endMinute]
    )

    return this.mapRowToRuleView(result.rows[0])
  }

  async updateRule(
    ruleId: string,
    data: Partial<CreateAvailabilityRuleRequest>
  ): Promise<AvailabilityRuleView> {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.weekday !== undefined) {
      updates.push(`weekday = $${paramIndex++}`)
      values.push(data.weekday)
    }
    if (data.startMinute !== undefined) {
      updates.push(`start_minute = $${paramIndex++}`)
      values.push(data.startMinute)
    }
    if (data.endMinute !== undefined) {
      updates.push(`end_minute = $${paramIndex++}`)
      values.push(data.endMinute)
    }

    if (updates.length === 0) {
      const existing = await this.pool.query(
        `SELECT id, teacher_id, weekday, start_minute, end_minute, status
         FROM availability_rule WHERE id = $1`,
        [ruleId]
      )
      return this.mapRowToRuleView(existing.rows[0])
    }

    values.push(ruleId)

    const result = await this.pool.query(
      `UPDATE availability_rule
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, teacher_id, weekday, start_minute, end_minute, status`,
      values
    )

    return this.mapRowToRuleView(result.rows[0])
  }

  async deleteRule(ruleId: string): Promise<void> {
    await this.pool.query(
      `UPDATE availability_rule SET status = 'Deleted' WHERE id = $1`,
      [ruleId]
    )
  }

  async copyRules(teacherId: string, fromWeekday: number, toWeekdays: number[]): Promise<void> {
    for (const toWeekday of toWeekdays) {
      await this.pool.query(
        `INSERT INTO availability_rule (teacher_id, weekday, start_minute, end_minute, status)
         SELECT teacher_id, $2, start_minute, end_minute, status
         FROM availability_rule
         WHERE teacher_id = $1 AND weekday = $3 AND status = 'Active'`,
        [teacherId, toWeekday, fromWeekday]
      )
    }
  }

  async listExceptions(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<AvailabilityExceptionView[]> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, on_date, start_minute, end_minute, reason
       FROM availability_exception
       WHERE teacher_id = $1
         AND on_date >= $2
         AND on_date <= $3
       ORDER BY on_date`,
      [teacherId, fromDate, toDate]
    )

    return result.rows.map(row => this.mapRowToExceptionView(row))
  }

  async getExceptionForDate(
    teacherId: string,
    date: string
  ): Promise<AvailabilityExceptionView | null> {
    const result = await this.pool.query(
      `SELECT id, teacher_id, on_date, start_minute, end_minute, reason
       FROM availability_exception
       WHERE teacher_id = $1 AND on_date = $2`,
      [teacherId, date]
    )

    return result.rows.length > 0 ? this.mapRowToExceptionView(result.rows[0]) : null
  }

  async createException(
    teacherId: string,
    data: CreateAvailabilityExceptionRequest
  ): Promise<AvailabilityExceptionView> {
    const isWholeDay = data.wholeDay === true
    const startMinute = isWholeDay ? null : data.startMinute
    const endMinute = isWholeDay ? null : data.endMinute

    const result = await this.pool.query(
      `INSERT INTO availability_exception (teacher_id, on_date, start_minute, end_minute, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, teacher_id, on_date, start_minute, end_minute, reason`,
      [teacherId, data.onDate, startMinute, endMinute, data.reason || null]
    )

    return this.mapRowToExceptionView(result.rows[0])
  }

  async deleteException(exceptionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM availability_exception WHERE id = $1`,
      [exceptionId]
    )
  }
}
