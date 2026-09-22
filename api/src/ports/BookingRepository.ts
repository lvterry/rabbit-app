/**
 * Booking Repository Port
 * Handles booking data access and business logic coordination
 */

import type {
  BookingView,
  TeacherDayView,
  CreateBookingRequest,
  RescheduleBookingRequest,
} from '@rabbit/shared'

export interface BookingRepository {
  /**
   * Find booking by ID
   */
  findById(bookingId: string): Promise<BookingView | null>

  /**
   * List bookings for a teacher
   */
  listByTeacher(teacherId: string): Promise<BookingView[]>

  /**
   * List upcoming bookings for a teacher
   */
  listUpcomingByTeacher(teacherId: string): Promise<BookingView[]>

  /**
   * List bookings for a student
   */
  listByStudent(studentId: string): Promise<BookingView[]>

  /**
   * List upcoming bookings for a student
   */
  listUpcomingByStudent(studentId: string): Promise<BookingView[]>

  /**
   * Get teacher's day view (today's bookings + pending)
   */
  getTeacherDayView(teacherId: string, date: string): Promise<TeacherDayView>

  /**
   * Get teacher's calendar view (bookings in date range)
   */
  getTeacherCalendarView(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<BookingView[]>

  /**
   * Create a new booking
   * This is a complex transaction involving availability check, balance check, and conflict check
   */
  create(
    teacherId: string,
    data: CreateBookingRequest,
    actorUserId?: string,
    actorStudentId?: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Complete a booking (teacher confirms class happened)
   */
  complete(
    bookingId: string,
    actorUserId: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Mark booking as no-show and charge session
   */
  markNoShow(
    bookingId: string,
    actorUserId: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Undo completion (within undo window)
   */
  undoCompletion(
    bookingId: string,
    actorUserId: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Cancel a booking
   */
  cancel(
    bookingId: string,
    actorUserId?: string,
    actorStudentId?: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Reschedule a booking (cancel + create in single transaction)
   */
  reschedule(
    bookingId: string,
    data: RescheduleBookingRequest,
    actorUserId?: string,
    actorStudentId?: string,
    idempotencyKey?: string
  ): Promise<BookingView>

  /**
   * Get all upcoming bookings for a teacher (for conflict detection)
   */
  getUpcomingIntervals(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<Array<{ startAt: string; endAt: string }>>

  /**
   * Auto-settle overdue bookings (background job)
   */
  autoSettle(): Promise<number>
}
