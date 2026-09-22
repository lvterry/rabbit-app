/**
 * Authorization Helpers
 * 
 * Async helpers that verify teacher/student capability with resource scope
 * Authority: auth-model.md §2
 */

import type { Principal } from '@rabbit/shared'
import type { TeacherRepository, StudentRepository } from '../ports'
import { ErrorCode } from '@rabbit/shared'
import { AppError } from '../http'

/**
 * Assert that Principal can act as teacher for specific teacherId
 * 
 * Throws FORBIDDEN if:
 * - Principal is not User
 * - User does not have teacher profile
 * - User's teacherId does not match requested teacherId
 * 
 * @param principal - The principal to check
 * @param teacherId - The specific teacher ID to verify access for
 * @param teacherRepo - Repository to query teacher ownership
 * @throws AppError with FORBIDDEN if check fails
 */
export async function assertCanActAsTeacher(
  principal: Principal,
  teacherId: string,
  teacherRepo: TeacherRepository
): Promise<void> {
  if (principal.kind !== 'User' || !principal.userId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only operation')
  }

  const teacher = await teacherRepo.findByUserId(principal.userId)
  if (!teacher) {
    throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
  }

  if (teacher.teacherId !== teacherId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Cannot access another teacher\'s resources')
  }
}

/**
 * Assert that Principal can act as student for specific studentId/teacherId
 * 
 * Throws FORBIDDEN if:
 * - Student principal does not match studentId/teacherId exactly
 * - User principal does not have binding to this student
 * 
 * @param principal - The principal to check
 * @param studentId - The specific student ID to verify access for
 * @param teacherId - The teacher ID the student belongs to
 * @param studentRepo - Repository to query student binding
 * @throws AppError with FORBIDDEN if check fails
 */
export async function assertCanActAsStudent(
  principal: Principal,
  studentId: string,
  teacherId: string,
  studentRepo: StudentRepository
): Promise<void> {
  // Student principal: exact match required
  if (principal.kind === 'Student') {
    if (principal.studentId !== studentId || principal.teacherId !== teacherId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Cannot access another student\'s resources')
    }
    return
  }

  // User principal: must verify binding
  if (principal.kind === 'User' && principal.userId) {
    const binding = await studentRepo.findByTeacherAndUser(teacherId, principal.userId)
    if (!binding || binding.student.studentId !== studentId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'User not bound to this student')
    }
    return
  }

  // All other principals cannot act as student
  throw new AppError(ErrorCode.FORBIDDEN, 'Student-only operation')
}

/**
 * Get teacherId from User principal (fail closed)
 * 
 * @param principal - Must be User principal
 * @param teacherRepo - Repository to query teacher profile
 * @returns teacherId
 * @throws AppError with FORBIDDEN if not a teacher
 */
export async function getTeacherIdFromPrincipal(
  principal: Principal,
  teacherRepo: TeacherRepository
): Promise<string> {
  if (principal.kind !== 'User' || !principal.userId) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Teacher-only operation')
  }

  const teacher = await teacherRepo.findByUserId(principal.userId)
  if (!teacher) {
    throw new AppError(ErrorCode.FORBIDDEN, 'User does not have teacher capability')
  }

  return teacher.teacherId
}
