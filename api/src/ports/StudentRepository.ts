/**
 * Student Repository Port
 * Handles student data access
 */

import type {
  StudentDetailView,
  StudentHomeView,
  CreateStudentRequest,
  UpdateStudentRequest,
  StudentStatus,
  InviteView,
  InvitePreview,
} from '@rabbit/shared'

export interface StudentRepository {
  /**
   * Find student by ID
   */
  findById(studentId: string): Promise<StudentDetailView | null>

  /**
   * Find student by teacher and user
   */
  findByTeacherAndUser(teacherId: string, userId: string): Promise<StudentDetailView | null>

  /**
   * List students for a teacher
   */
  listByTeacher(teacherId: string): Promise<StudentDetailView[]>

  /**
   * Get student home view (for student-facing API)
   */
  getHomeView(studentId: string, teacherId: string): Promise<StudentHomeView | null>

  /**
   * Get multi-teacher home view for a user
   */
  getMultiTeacherHomeView(userId: string): Promise<StudentHomeView | null>

  /**
   * Create a new student
   */
  create(teacherId: string, data: CreateStudentRequest): Promise<StudentDetailView>

  /**
   * Update a student
   */
  update(studentId: string, data: UpdateStudentRequest): Promise<StudentDetailView>

  /**
   * Update student status
   */
  updateStatus(studentId: string, status: StudentStatus): Promise<StudentDetailView>

  /**
   * Bind student to user account
   */
  bindToUser(studentId: string, userId: string): Promise<void>

  /**
   * Check if student is active
   */
  isActive(studentId: string): Promise<boolean>

  /**
   * Create invite for student
   */
  createInvite(studentId: string): Promise<InviteView>

  /**
   * Get invite by token
   */
  getInviteByToken(token: string): Promise<InvitePreview | null>

  /**
   * Consume invite (bind student to session)
   */
  consumeInvite(token: string, userId?: string): Promise<{
    studentId: string
    teacherId: string
    alreadyBound: boolean
  }>

  /**
   * Revoke invite
   */
  revokeInvite(inviteId: string): Promise<void>

  /**
   * Check if invite matches current session
   */
  inviteMatchesSession(token: string, studentId: string, teacherId: string): Promise<boolean>
}
