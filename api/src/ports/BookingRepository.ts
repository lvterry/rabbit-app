/**
 * Booking Repository Port
 * Handles booking data access and business logic coordination
 */

import type {
  BookingView,
  TeacherDayView,
  CreateBookingRequest,
  RescheduleBookingRequest,
  Principal,
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
   * Principal is used to determine source (SelfBooked vs TeacherCreated) and permissions.
   * Do NOT pass actorUserId/actorStudentId separately - use Principal (auth-model.md §5.1).
   */
  create(
    data: CreateBookingRequest,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
  ): Promise<BookingView>

  /**
   * Complete a booking (teacher confirms class happened)
   * Principal must have teacher capability for this booking's teacher.
   */
  complete(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
  ): Promise<BookingView>

  /**
   * Mark booking as no-show and charge session
   * Principal must have teacher capability for this booking's teacher.
   */
  markNoShow(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string
  ): Promise<BookingView>

  /**
   * Undo completion (within undo window)
   * Principal must have teacher capability for this booking's teacher.
   */
  undoCompletion(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
  ): Promise<BookingView>

  /**
   * Cancel a booking
   * Principal determines cancelledBy (Teacher vs Student) and policy (auth-model.md §2.1).
   */
  cancel(
    bookingId: string,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
  ): Promise<BookingView>

  /**
   * Reschedule a booking (cancel + create in single transaction)
   * Principal determines whether this is free or late reschedule (auth-model.md §2.1).
   */
  reschedule(
    bookingId: string,
    data: RescheduleBookingRequest,
    principal: Principal,
    idempotencyKey: string,
    endpoint?: string,
    requestHash?: string
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
