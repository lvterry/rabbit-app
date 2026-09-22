/**
 * Principal Resolution
 * 
 * Authority: auth-model.md §1, §2, §5
 * 
 * - Principal has 4 kinds: Public, InviteToken, Student, User
 * - Only 2 persistent identities: Student session, User session
 * - Teacher is a capability, not an identity
 * - Business code only reads ctx.principal
 */

import type { Principal } from '@rabbit/shared'

/**
 * Create a Public principal (unauthenticated)
 */
export function createPublicPrincipal(): Principal {
  return {
    kind: 'Public',
    userId: null,
    studentId: null,
    teacherId: null,
    inviteId: null,
  }
}

/**
 * Create a User principal (authenticated user session)
 */
export function createUserPrincipal(userId: string): Principal {
  return {
    kind: 'User',
    userId,
    studentId: null,
    teacherId: null,
    inviteId: null,
  }
}

/**
 * Create a Student principal (Student session)
 * Student sessions are scoped to (studentId, teacherId)
 */
export function createStudentPrincipal(studentId: string, teacherId: string): Principal {
  return {
    kind: 'Student',
    userId: null,
    studentId,
    teacherId,
    inviteId: null,
  }
}

/**
 * Create an InviteToken principal (one-time invite token)
 * Used for invite preview before consumption
 */
export function createInviteTokenPrincipal(
  studentId: string,
  teacherId: string,
  inviteId: string
): Principal {
  return {
    kind: 'InviteToken',
    userId: null,
    studentId,
    teacherId,
    inviteId,
  }
}

/**
 * Check if Principal can act as a specific teacher
 * 
 * Authority: auth-model.md §2
 * MUST enforce teacherId scope - fail closed
 * 
 * NOTE: This is a preliminary check. Routes MUST additionally verify
 * teacher ownership via teacherRepo.findByUserId() or teacherRepo.findById()
 * before granting access to teacher resources.
 */
export function canActAsTeacher(principal: Principal, teacherId: string): boolean {
  // Only User principals can potentially be teachers
  // But we cannot verify teacherId ownership without DB query
  // Fail closed: return false, routes MUST verify via repository
  return false
}

/**
 * Check if Principal can act as a specific student
 * 
 * Authority: auth-model.md §2
 * MUST enforce student binding - fail closed
 * 
 * Student principal: exact match on studentId + teacherId
 * User principal: CANNOT verify without DB - routes MUST check binding
 */
export function canActAsStudent(
  principal: Principal,
  targetStudentId: string,
  targetTeacherId: string
): boolean {
  // Path 1: Student session - exact match required
  if (principal.kind === 'Student') {
    return principal.studentId === targetStudentId && principal.teacherId === targetTeacherId
  }

  // Path 2: User session - CANNOT verify binding without DB query
  // Routes MUST call studentRepo.findByTeacherAndUser() to verify
  // Fail closed: return false, delegate to route handler
  if (principal.kind === 'User') {
    return false
  }

  return false
}

/**
 * Extract actor IDs for idempotency and transaction records
 * 
 * Authority: auth-model.md §4
 * Idempotency key is scoped to the acting principal
 */
export function getPrincipalActorIds(principal: Principal): {
  userId: string | null
  studentId: string | null
} {
  switch (principal.kind) {
    case 'User':
      return { userId: principal.userId, studentId: null }
    case 'Student':
      return { userId: null, studentId: principal.studentId }
    case 'InviteToken':
    case 'Public':
      return { userId: null, studentId: null }
  }
}
