/**
 * Course Repository Port
 * Handles course data access
 */

import type {
  CourseView,
  CreateCourseRequest,
  UpdateCourseRequest,
  CourseStatus,
} from '@rabbit/shared'

export interface CourseRepository {
  /**
   * Find course by ID
   */
  findById(courseId: string): Promise<CourseView | null>

  /**
   * List courses for a teacher
   */
  listByTeacher(teacherId: string): Promise<CourseView[]>

  /**
   * List active courses for a teacher
   */
  listActiveByTeacher(teacherId: string): Promise<CourseView[]>

  /**
   * Create a new course
   */
  create(teacherId: string, data: CreateCourseRequest): Promise<CourseView>

  /**
   * Update a course
   */
  update(courseId: string, data: UpdateCourseRequest): Promise<CourseView>

  /**
   * Update course status
   */
  updateStatus(courseId: string, status: CourseStatus): Promise<CourseView>

  /**
   * Check if course allows self booking
   */
  allowsSelfBooking(courseId: string): Promise<boolean>

  /**
   * Get course duration
   */
  getDuration(courseId: string): Promise<number>
}
