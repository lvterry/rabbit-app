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
 * Teacher is a capability derived from data, not an identity type
 */
export function canActAsTeacher(principal: Principal, teacherId: string): boolean {
  // Only User principals can be teachers
  // Teacher capability is validated by checking teacher_profile(user_id, id)
  // This check is done at the repository layer
  return principal.kind === 'User' && principal.userId !== null
}

/**
 * Check if Principal can act as a specific student
 * 
 * Authority: auth-model.md §2
 * Two paths:
 * 1. Student session: studentId + teacherId must match
 * 2. User session: student.user_id must equal principal.userId
 */
export function canActAsStudent(
  principal: Principal,
  targetStudentId: string,
  targetTeacherId: string
): boolean {
  // Path 1: Student session (anonymous or pre-upgrade)
  if (principal.kind === 'Student') {
    return principal.studentId === targetStudentId && principal.teacherId === targetTeacherId
  }

  // Path 2: User session (account-upgraded student)
  // Actual user_id match is validated at repository layer
  if (principal.kind === 'User') {
    return true // Delegate to repository check
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
