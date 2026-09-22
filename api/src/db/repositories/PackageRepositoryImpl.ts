/**
 * PostgreSQL implementation of PackageRepository
 * 
 * Uses apply_package_transaction SECURITY DEFINER function for all balance modifications
 * (Invariant I4 enforcement)
 */

import type { Pool } from 'pg'
import type {
  PackageView,
  PackageTransactionView,
  CreatePackageRequest,
  AddPackageTransactionRequest,
  BalanceView,
  Principal,
} from '@rabbit/shared'
import type { PackageRepository } from '../../ports/PackageRepository.js'
import { selectPackageForBooking, calculateAggregateBalance } from '../../domain/index.js'

export class PackageRepositoryImpl implements PackageRepository {
  constructor(private pool: Pool) {}

  async findById(packageId: string): Promise<PackageView | null> {
    const { rows } = await this.pool.query(
      `SELECT 
        lp.id,
        lp.teacher_id,
        lp.student_id,
        lp.course_id,
        lp.purchased_sessions,
        lp.remaining_sessions,
        lp.status,
        lp.created_at,
        lp.archived_at,
        c.name as course_name,
        c.duration_minutes
      FROM lesson_package lp
      JOIN course c ON c.id = lp.course_id
      WHERE lp.id = $1`,
      [packageId]
    )

    if (rows.length === 0) return null

    return this.mapPackageView(rows[0])
  }

  async listByStudent(studentId: string): Promise<PackageView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        lp.id,
        lp.teacher_id,
        lp.student_id,
        lp.course_id,
        lp.purchased_sessions,
        lp.remaining_sessions,
        lp.status,
        lp.created_at,
        lp.archived_at,
        c.name as course_name,
        c.duration_minutes
      FROM lesson_package lp
      JOIN course c ON c.id = lp.course_id
      WHERE lp.student_id = $1
      ORDER BY lp.created_at DESC`,
      [studentId]
    )

    return rows.map(r => this.mapPackageView(r))
  }

  async listActiveByStudentAndCourse(
    studentId: string,
    courseId: string
  ): Promise<PackageView[]> {
    const { rows } = await this.pool.query(
      `SELECT 
        lp.id,
        lp.teacher_id,
        lp.student_id,
        lp.course_id,
        lp.purchased_sessions,
        lp.remaining_sessions,
        lp.status,
        lp.created_at,
        lp.archived_at,
        c.name as course_name,
        c.duration_minutes
      FROM lesson_package lp
      JOIN course c ON c.id = lp.course_id
      WHERE lp.student_id = $1 
        AND lp.course_id = $2
        AND lp.status != 'Archived'
      ORDER BY lp.created_at ASC`,
      [studentId, courseId]
    )

    return rows.map(r => this.mapPackageView(r))
  }

  async create(
    studentId: string,
    teacherId: string,
    data: CreatePackageRequest
  ): Promise<PackageView> {
    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')

      // Insert package
      const { rows: [pkg] } = await client.query(
        `INSERT INTO lesson_package (
          teacher_id, student_id, course_id,
          purchased_sessions, remaining_sessions,
          status
        ) VALUES ($1, $2, $3, $4, $5, 'Active')
        RETURNING *`,
        [teacherId, studentId, data.courseId, data.sessions, data.sessions]
      )

      // Create initial transaction via SECURITY DEFINER function
      await client.query(
        `SELECT * FROM apply_package_transaction($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pkg.id,                    // p_package_id
          'PACKAGE_CREATED',         // p_type
          data.sessions,             // p_amount
          null,                      // p_booking_id
          null,                      // p_session_id
          data.note || null,         // p_note
          data.actorUserId || null,  // p_actor_user_id
          data.actorStudentId || null // p_actor_student_id
        ]
      )

      await client.query('COMMIT')

      // Fetch and return
      const result = await this.findById(pkg.id)
      return result!
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async addTransaction(
    packageId: string,
    data: AddPackageTransactionRequest,
    principal: Principal
  ): Promise<PackageTransactionView> {
    // Extract actor from principal (docs/auth-model.md §1.1)
    const actorUserId = principal.userId
    const actorStudentId = principal.studentId

    // Map request mode to transaction type
    let type: string
    let amount: number

    if (data.mode === 'add') {
      type = 'MANUAL_ADD'
      amount = data.sessions
    } else if (data.mode === 'deduct') {
      type = 'MANUAL_DEDUCT'
      amount = -data.sessions
    } else if (data.mode === 'set') {
      // For 'set' mode, caller must explicitly provide type
      if (!data.type) {
        throw new Error('Type is required for mode=set')
      }
      type = data.type
      
      // Get current remaining to calculate amount
      const pkg = await this.findById(packageId)
      if (!pkg) {
        throw new Error(`Package ${packageId} not found`)
      }
      amount = data.sessions - pkg.remainingSessions
    } else {
      throw new Error(`Invalid mode: ${data.mode}`)
    }

    // Call SECURITY DEFINER function
    const { rows } = await this.pool.query(
      `SELECT * FROM apply_package_transaction($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        packageId,
        type,
        amount,
        null, // booking_id
        null, // session_id
        data.note || null,
        actorUserId,
        actorStudentId
      ]
    )

    const result = rows[0]

    // Fetch the created transaction
    const { rows: [tx] } = await this.pool.query(
      `SELECT * FROM package_transaction WHERE id = $1`,
      [result.transaction_id]
    )

    return this.mapTransactionView(tx)
  }

  async listTransactions(packageId: string): Promise<PackageTransactionView[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM package_transaction
      WHERE package_id = $1
      ORDER BY created_at DESC`,
      [packageId]
    )

    return rows.map(r => this.mapTransactionView(r))
  }

  async listTransactionsByStudent(studentId: string): Promise<PackageTransactionView[]> {
    const { rows } = await this.pool.query(
      `SELECT pt.*
      FROM package_transaction pt
      JOIN lesson_package lp ON lp.id = pt.package_id
      WHERE lp.student_id = $1
      ORDER BY pt.created_at DESC`,
      [studentId]
    )

    return rows.map(r => this.mapTransactionView(r))
  }

  async getBalance(studentId: string, courseId: string): Promise<BalanceView> {
    // Get all active packages
    const packages = await this.listActiveByStudentAndCourse(studentId, courseId)
    
    // Count upcoming bookings (reserved)
    const { rows: [{ count }] } = await this.pool.query(
      `SELECT COUNT(*) as count
      FROM booking
      WHERE student_id = $1 AND course_id = $2 AND status = 'Upcoming'`,
      [studentId, courseId]
    )

    const reserved = parseInt(count, 10)

    // Calculate aggregate balance
    const balance = calculateAggregateBalance(
      packages.map(p => ({
        id: p.id,
        createdAt: new Date(p.createdAt),
        remainingSessions: p.remainingSessions,
        status: p.status as 'Active' | 'Used Up' | 'Archived'
      })),
      reserved
    )

    return balance
  }

  async archive(packageId: string): Promise<PackageView> {
    await this.pool.query(
      `UPDATE lesson_package
      SET status = 'Archived', archived_at = now()
      WHERE id = $1`,
      [packageId]
    )

    const result = await this.findById(packageId)
    return result!
  }

  async restore(packageId: string): Promise<PackageView> {
    await this.pool.query(
      `UPDATE lesson_package
      SET status = CASE
        WHEN remaining_sessions > 0 THEN 'Active'
        ELSE 'Used Up'
      END,
      archived_at = NULL
      WHERE id = $1`,
      [packageId]
    )

    const result = await this.findById(packageId)
    return result!
  }

  async selectPackageForBooking(
    studentId: string,
    courseId: string
  ): Promise<string | null> {
    const packages = await this.listActiveByStudentAndCourse(studentId, courseId)
    
    return selectPackageForBooking(
      packages.map(p => ({
        id: p.id,
        createdAt: new Date(p.createdAt),
        remainingSessions: p.remainingSessions,
        status: p.status as 'Active' | 'Used Up' | 'Archived'
      }))
    )
  }

  async hasAvailableSessions(
    studentId: string,
    courseId: string,
    required: number = 1
  ): Promise<boolean> {
    const balance = await this.getBalance(studentId, courseId)
    return balance.available >= required
  }

  // Helper methods

  private mapPackageView(row: any): PackageView {
    return {
      id: row.id,
      teacherId: row.teacher_id,
      studentId: row.student_id,
      courseId: row.course_id,
      courseName: row.course_name,
      purchasedSessions: row.purchased_sessions,
      remainingSessions: row.remaining_sessions,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      createdDate: row.created_at.toISOString().substring(0, 10),
      archivedAt: row.archived_at ? row.archived_at.toISOString() : null
    }
  }

  private mapTransactionView(row: any): PackageTransactionView {
    return {
      id: row.id,
      packageId: row.package_id,
      type: row.type,
      label: this.getTransactionLabel(row.type),
      amount: row.amount,
      amountText: row.amount > 0 ? `+${row.amount}` : row.amount.toString(),
      beforeSessions: row.before_sessions,
      afterSessions: row.after_sessions,
      balanceText: `${row.before_sessions} → ${row.after_sessions}`,
      bookingId: row.booking_id,
      sessionId: row.session_id,
      note: row.note,
      createdAt: row.created_at.toISOString(),
      createdLabel: this.formatDateLabel(row.created_at)
    }
  }

  private getTransactionLabel(type: string): string {
    const labels: Record<string, string> = {
      'PACKAGE_CREATED': '创建课包',
      'MANUAL_ADD': '手动增加',
      'PURCHASE_ADJUSTMENT': '购买量调整',
      'BALANCE_ADJUSTMENT': '余额调整',
      'SESSION_COMPLETED': '课程完成',
      'LATE_CANCEL': '逾期取消',
      'MANUAL_DEDUCT': '手动扣减',
      'REVERSAL': '撤销完成'
    }
    return labels[type] || type
  }

  private formatDateLabel(date: Date): string {
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }
}
