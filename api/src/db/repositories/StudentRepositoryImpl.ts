/**
 * StudentRepositoryImpl
 * Handles student data access, invites, and multi-view composition
 */

import type { Pool, PoolClient } from 'pg'
import type {
  StudentDetailView,
  StudentHomeView,
  CreateStudentRequest,
  UpdateStudentRequest,
  StudentStatus,
  InviteView,
  Principal,
  StudentHomeCard,
  StudentCourseCard,
  CourseStatus,
} from '@rabbit/shared'
import { calculateAggregateBalance } from '../../domain/packageSelection'

export class StudentRepositoryImpl {
  constructor(private pool: Pool) {}

  private mapInviteRow(row: any): InviteView {
    return {
      inviteId: row.id,
      token: row.token,
      studentId: row.student_id,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      studentName: row.student_name,
      courseName: row.course_name || '',
      status: row.status,
      expiresAt: row.expires_at.toISOString(),
      consumedAt: row.consumed_at?.toISOString() || null,
      consumedByUserId: row.consumed_by_user_id || null,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      url: `https://example.com/invite/${row.token}`, // TODO: actual URL
    }
  }

  async findById(studentId: string): Promise<StudentDetailView | null> {
    const studentResult = await this.pool.query(
      `SELECT s.id, s.name, s.contact, s.status, s.user_id, s.bound_at, s.teacher_id,
              u.name as bound_name, u.email as bound_email
       FROM student s
       LEFT JOIN app_user u ON s.user_id = u.id
       WHERE s.id = $1`,
      [studentId]
    )

    if (studentResult.rows.length === 0) {
      return null
    }

    const student = studentResult.rows[0]
    const teacherId = student.teacher_id

    const coursesResult = await this.pool.query(
      `SELECT 
         c.id as course_id,
         c.name as course_name,
         c.duration_minutes,
         c.status as course_status,
         COALESCE(SUM(lp.remaining_sessions), 0) as remaining,
         COALESCE(SUM(
           CASE WHEN b.id IS NOT NULL AND b.status = 'Upcoming' THEN 1 ELSE 0 END
         ), 0) as reserved
       FROM course c
       LEFT JOIN lesson_package lp ON lp.course_id = c.id AND lp.student_id = $1 AND lp.status = 'Active'
       LEFT JOIN booking b ON b.student_id = $1 AND b.course_id = c.id AND b.status = 'Upcoming'
       WHERE c.teacher_id = $2
       GROUP BY c.id, c.name, c.duration_minutes, c.status
       ORDER BY c.created_at`,
      [studentId, teacherId]
    )

    const courses = coursesResult.rows.map(row => ({
      courseId: row.course_id,
      courseName: row.course_name,
      durationMinutes: row.duration_minutes,
      courseStatus: row.course_status as CourseStatus,
      remaining: parseInt(row.remaining, 10),
      reserved: parseInt(row.reserved, 10),
      available: parseInt(row.remaining, 10) - parseInt(row.reserved, 10),
    }))

    const packagesResult = await this.pool.query(
      `SELECT 
         lp.id as package_id,
         lp.course_id,
         c.name as course_name,
         lp.purchased_sessions,
         lp.remaining_sessions,
         lp.status,
         lp.created_at
       FROM lesson_package lp
       JOIN course c ON lp.course_id = c.id
       WHERE lp.student_id = $1
       ORDER BY lp.created_at DESC`,
      [studentId]
    )

    const packages = packagesResult.rows.map(row => ({
      packageId: row.package_id,
      courseId: row.course_id,
      courseName: row.course_name,
      purchasedSessions: row.purchased_sessions,
      remainingSessions: row.remaining_sessions,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      createdDate: row.created_at.toISOString().split('T')[0],
    }))

    // Get transactions (need PackageRepositoryImpl for this, stub for now)
    const transactions: any[] = [] // TODO: implement with PackageRepositoryImpl

    // Get upcoming bookings
    const upcomingResult = await this.pool.query(
      `SELECT * FROM booking WHERE student_id = $1 AND status = 'Upcoming' ORDER BY start_at`,
      [studentId]
    )
    const upcoming: any[] = [] // TODO: map to BookingView

    // Get history (completed/cancelled bookings)
    const historyResult = await this.pool.query(
      `SELECT * FROM booking WHERE student_id = $1 AND status IN ('Completed', 'Cancelled') ORDER BY start_at DESC`,
      [studentId]
    )
    const history: any[] = [] // TODO: map to BookingView

    // Get active invite
    const inviteResult = await this.pool.query(
      `SELECT si.*, t.name as teacher_name, s.name as student_name, '' as course_name
       FROM student_invite si
       JOIN student s ON si.student_id = s.id
       JOIN teacher_profile t ON s.teacher_id = t.id
       WHERE si.student_id = $1 AND si.status = 'Pending'
       ORDER BY si.created_at DESC
       LIMIT 1`,
      [studentId]
    )
    const invite = inviteResult.rows.length > 0 ? this.mapInviteRow(inviteResult.rows[0]) : null

    return {
      student: {
        studentId: student.id,
        name: student.name,
        contact: student.contact,
        status: student.status as StudentStatus,
        bound: student.user_id !== null,
        boundName: student.bound_name,
        boundEmail: student.bound_email,
        boundAt: student.bound_at?.toISOString() || null,
      },
      courses,
      packages,
      transactions,
      upcoming,
      history,
      invite,
    }
  }

  async findByTeacherAndUser(teacherId: string, userId: string): Promise<StudentDetailView | null> {
    const result = await this.pool.query(
      `SELECT id FROM student WHERE teacher_id = $1 AND user_id = $2`,
      [teacherId, userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.findById(result.rows[0].id)
  }

  async listByTeacher(teacherId: string): Promise<StudentDetailView[]> {
    const result = await this.pool.query(
      `SELECT id FROM student WHERE teacher_id = $1 ORDER BY created_at DESC`,
      [teacherId]
    )

    const students: StudentDetailView[] = []
    for (const row of result.rows) {
      const student = await this.findById(row.id)
      if (student) {
        students.push(student)
      }
    }

    return students
  }

  async getHomeView(studentId: string, teacherId: string): Promise<StudentHomeView | null> {
    const studentResult = await this.pool.query(
      `SELECT s.id, s.name, s.user_id, s.status,
              t.id as teacher_id, t.name as teacher_name, t.avatar_url as teacher_avatar
       FROM student s
       JOIN teacher_profile t ON s.teacher_id = t.id
       WHERE s.id = $1 AND s.teacher_id = $2`,
      [studentId, teacherId]
    )

    if (studentResult.rows.length === 0) {
      return null
    }

    const student = studentResult.rows[0]

    const card = await this.buildHomeCard(student.id, student.teacher_id)

    return {
      cards: [card],
      bound: student.user_id !== null,
    }
  }

  async getMultiTeacherHomeView(userId: string): Promise<StudentHomeView | null> {
    const studentsResult = await this.pool.query(
      `SELECT s.id, s.teacher_id
       FROM student s
       WHERE s.user_id = $1 AND s.status = 'Active'
       ORDER BY s.created_at`,
      [userId]
    )

    if (studentsResult.rows.length === 0) {
      return null
    }

    const cards: StudentHomeCard[] = []
    for (const row of studentsResult.rows) {
      const card = await this.buildHomeCard(row.id, row.teacher_id)
      cards.push(card)
    }

    return {
      cards,
      bound: true,
    }
  }

  private async buildHomeCard(studentId: string, teacherId: string): Promise<StudentHomeCard> {
    const teacherResult = await this.pool.query(
      `SELECT name, avatar_url FROM teacher_profile WHERE id = $1`,
      [teacherId]
    )

    const teacher = teacherResult.rows[0]

    const studentResult = await this.pool.query(
      `SELECT name FROM student WHERE id = $1`,
      [studentId]
    )

    const student = studentResult.rows[0]

    const coursesResult = await this.pool.query(
      `SELECT c.id, c.name, c.duration_minutes, c.allow_self_booking
       FROM course c
       WHERE c.teacher_id = $1 AND c.status = 'Active'
       ORDER BY c.created_at`,
      [teacherId]
    )

    const courses: StudentCourseCard[] = []
    let totalRemaining = 0

    for (const courseRow of coursesResult.rows) {
      const packagesResult = await this.pool.query(
        `SELECT id, purchased_sessions, remaining_sessions, created_at
         FROM lesson_package
         WHERE student_id = $1 AND course_id = $2 AND status = 'Active'
         ORDER BY created_at`,
        [studentId, courseRow.id]
      )

      const packages = packagesResult.rows.map(p => ({
        id: p.id,
        purchasedSessions: p.purchased_sessions,
        remainingSessions: p.remaining_sessions,
        status: p.status as 'Active' | 'Used Up' | 'Archived',
        createdAt: p.created_at,
      }))

      const bookingsResult = await this.pool.query(
        `SELECT id FROM booking
         WHERE student_id = $1 AND course_id = $2 AND status = 'Upcoming'
         ORDER BY start_at`,
        [studentId, courseRow.id]
      )

      const reserved = bookingsResult.rows.length

      const nextBookingResult = await this.pool.query(
        `SELECT b.id, b.start_at, b.end_at, b.status, b.policy_snapshot_free_cancel_hours,
                b.reschedule_count, b.rescheduled_from,
                bs.active_session_id, bs.completed_at, bs.cancelled_at, bs.cancelled_by
         FROM booking b
         LEFT JOIN (
           SELECT booking_id, 
                  MAX(CASE WHEN status = 'Active' THEN id END) as active_session_id,
                  MIN(completed_at) as completed_at,
                  MIN(cancelled_at) as cancelled_at,
                  MIN(cancelled_by) as cancelled_by
           FROM (
             SELECT booking_id, id, status, completed_at, cancelled_at, cancelled_by
             FROM lesson_session
             UNION ALL
             SELECT id as booking_id, NULL::uuid as id, status, completed_at, cancelled_at, cancelled_by
             FROM booking
           ) sub
           GROUP BY booking_id
         ) bs ON b.id = bs.booking_id
         WHERE b.student_id = $1 AND b.course_id = $2 AND b.status = 'Upcoming'
         ORDER BY b.start_at
         LIMIT 1`,
        [studentId, courseRow.id]
      )

      const nextBooking = nextBookingResult.rows.length > 0
        ? this.mapBookingRow(nextBookingResult.rows[0])
        : null

      const balance = calculateAggregateBalance(packages, reserved)

      totalRemaining += balance.remaining

      courses.push({
        courseId: courseRow.id,
        courseName: courseRow.name,
        durationMinutes: courseRow.duration_minutes,
        allowSelfBooking: courseRow.allow_self_booking,
        remaining: balance.remaining,
        purchased: null,
        batchCount: packages.length,
        available: balance.available,
        exhausted: balance.remaining === 0,
        fullyReserved: balance.available === 0 && balance.remaining > 0,
        nextBooking,
      })
    }

    return {
      teacherId,
      teacherName: teacher.name,
      teacherAvatarUrl: teacher.avatar_url,
      studentId,
      studentName: student.name,
      courses,
      remainingTotal: totalRemaining,
    }
  }

  private mapBookingRow(row: any): any {
    return {
      bookingId: row.id,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      status: row.status,
      freeCancelHours: row.policy_snapshot_free_cancel_hours,
      rescheduleCount: row.reschedule_count,
      rescheduledFrom: row.rescheduled_from,
      completedAt: row.completed_at?.toISOString() || null,
      cancelledAt: row.cancelled_at?.toISOString() || null,
      cancelledBy: row.cancelled_by,
    }
  }

  async create(teacherId: string, data: CreateStudentRequest): Promise<StudentDetailView> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const studentResult = await client.query(
        `INSERT INTO student (teacher_id, name, contact)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [teacherId, data.name, data.contact || null]
      )

      const studentId = studentResult.rows[0].id

      if (data.courseId && data.initialSessions && data.initialSessions > 0) {
        await client.query(
          `INSERT INTO lesson_package (student_id, course_id, purchased_sessions, remaining_sessions)
           VALUES ($1, $2, $3, $3)`,
          [studentId, data.courseId, data.initialSessions]
        )

        await client.query(
          `SELECT apply_package_transaction($1, $2, 'PACKAGE_CREATED', $3, $4)`,
          [studentId, data.courseId, data.initialSessions, data.note || 'Initial package']
        )
      }

      await client.query('COMMIT')

      return (await this.findById(studentId))!
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async update(studentId: string, data: UpdateStudentRequest): Promise<StudentDetailView> {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(data.name)
    }
    if (data.contact !== undefined) {
      updates.push(`contact = $${paramIndex++}`)
      values.push(data.contact)
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      values.push(data.status)
    }

    if (updates.length > 0) {
      values.push(studentId)
      await this.pool.query(
        `UPDATE student SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      )
    }

    return (await this.findById(studentId))!
  }

  async updateStatus(studentId: string, status: StudentStatus): Promise<StudentDetailView> {
    await this.pool.query(
      `UPDATE student SET status = $1 WHERE id = $2`,
      [status, studentId]
    )

    return (await this.findById(studentId))!
  }

  async bindToUser(studentId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE student SET user_id = $1, bound_at = now() WHERE id = $2`,
      [userId, studentId]
    )
  }

  async isActive(studentId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT status FROM student WHERE id = $1`,
      [studentId]
    )

    return result.rows.length > 0 && result.rows[0].status === 'Active'
  }

  async createInvite(studentId: string): Promise<InviteView> {
    const result = await this.pool.query(
      `INSERT INTO student_invite (student_id, token, expires_at)
       SELECT $1, encode(gen_random_bytes(16), 'hex'), now() + interval '7 days'
       RETURNING id, token, student_id`,
      [studentId]
    )

    const inviteId = result.rows[0].id

    const detailResult = await this.pool.query(
      `SELECT si.id, si.token, si.student_id, si.status, si.expires_at, si.consumed_at,
              s.teacher_id, t.name as teacher_name, t.avatar_url as teacher_avatar_url,
              s.name as student_name
       FROM student_invite si
       JOIN student s ON si.student_id = s.id
       JOIN teacher_profile t ON s.teacher_id = t.id
       WHERE si.id = $1`,
      [inviteId]
    )

    return this.mapInviteRow(detailResult.rows[0])
  }

  async getInviteByToken(token: string): Promise<InviteView | null> {
    const result = await this.pool.query(
      `SELECT si.id, si.token, si.student_id, si.status, si.expires_at, si.consumed_at,
              s.teacher_id, t.name as teacher_name, t.avatar_url as teacher_avatar_url,
              s.name as student_name
       FROM student_invite si
       JOIN student s ON si.student_id = s.id
       JOIN teacher_profile t ON s.teacher_id = t.id
       WHERE si.token = $1`,
      [token]
    )

    return result.rows.length > 0 ? this.mapInviteRow(result.rows[0]) : null
  }

  async consumeInvite(token: string, principal: Principal): Promise<{
    studentId: string
    teacherId: string
    alreadyBound: boolean
    issueNewSession: boolean
  }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const inviteResult = await client.query(
        `SELECT si.id, si.student_id, s.teacher_id, s.user_id as current_user_id
         FROM student_invite si
         JOIN student s ON si.student_id = s.id
         WHERE si.token = $1 AND si.status = 'Pending' AND si.expires_at > now()
         FOR UPDATE OF si`,
        [token]
      )

      if (inviteResult.rows.length === 0) {
        throw new Error('Invite not found or already consumed')
      }

      const { id: inviteId, student_id: studentId, teacher_id: teacherId, current_user_id: currentUserId } = inviteResult.rows[0]

      let alreadyBound = false
      let issueNewSession = false
      let consumedByUserId: string | null = null

      if (principal.kind === 'User') {
        consumedByUserId = principal.userId

        if (currentUserId === null) {
          await client.query(
            `UPDATE student SET user_id = $1, bound_at = now() WHERE id = $2`,
            [principal.userId, studentId]
          )
          issueNewSession = false
        } else if (currentUserId === principal.userId) {
          alreadyBound = true
          issueNewSession = false
        } else {
          throw new Error('Student already bound to a different user')
        }
      } else {
        issueNewSession = true
      }

      await client.query(
        `UPDATE student_invite
         SET status = 'Consumed', consumed_at = now(), consumed_by_user_id = $1
         WHERE id = $2`,
        [consumedByUserId, inviteId]
      )

      await client.query('COMMIT')

      return {
        studentId,
        teacherId,
        alreadyBound,
        issueNewSession,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.pool.query(
      `UPDATE student_invite SET status = 'Revoked' WHERE id = $1`,
      [inviteId]
    )
  }

  async inviteMatchesSession(token: string, studentId: string, teacherId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT si.id
       FROM student_invite si
       JOIN student s ON si.student_id = s.id
       WHERE si.token = $1 AND si.student_id = $2 AND s.teacher_id = $3`,
      [token, studentId, teacherId]
    )

    return result.rows.length > 0
  }
}
