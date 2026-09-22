/**
 * Teacher Repository Port
 * Handles teacher profile data access
 */

import type { TeacherProfile, CreateTeacherRequest, UpdateTeacherRequest } from '@rabbit/shared'

export interface TeacherRepository {
  /**
   * Find teacher by ID
   */
  findById(teacherId: string): Promise<TeacherProfile | null>

  /**
   * Find teacher by user ID
   */
  findByUserId(userId: string): Promise<TeacherProfile | null>

  /**
   * Create a new teacher profile
   */
  create(userId: string, data: CreateTeacherRequest): Promise<TeacherProfile>

  /**
   * Update teacher profile
   */
  update(teacherId: string, data: UpdateTeacherRequest): Promise<TeacherProfile>

  /**
   * Check if user has teacher capability
   */
  hasTeacherCapability(userId: string): Promise<boolean>

  /**
   * Get teacher's timezone
   */
  getTimezone(teacherId: string): Promise<string>

  /**
   * Get teacher's booking rules
   */
  getBookingRules(teacherId: string): Promise<{
    slotStepMinutes: number
    minLeadHours: number
    maxAdvanceDays: number
    freeCancelHours: number
    autoSettleHours: number
    undoCompleteDays: number
    maxReschedules: number
  }>

  /**
   * List all teachers (dev/test only)
   */
  listAll?(): Promise<TeacherProfile[]>
}
