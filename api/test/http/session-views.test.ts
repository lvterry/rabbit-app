/**
 * Real HTTP - Session Views
 * 
 * Tests for:
 * - GET /v1/me/teacher-day (Nina blocker) - full TeacherDayView shape
 * - GET /v1/me/student-home (Leo blocker) - available calculation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createTestApp, createMockPool } from '../helpers/testApp'
import { generateUserAccessToken, generateStudentAccessToken } from '../../src/auth'

describe('Real HTTP - Session Views', () => {
  describe('GET /v1/me/teacher-day', () => {
    it('returns full TeacherDayView shape (not just date+bookings)', async () => {
      const mockTeacherRepo = {
        findByUserId: async (userId: string) =>
          userId === 'user-teacher'
            ? { teacherId: 'teacher-1', name: '张老师' }
            : null,
      } as any

      const mockBookingRepo = {
        getTeacherDayView: async (teacherId: string, date: string) => ({
          date,
          isToday: true,
          dateLabel: '今天',
          todayCount: 3,
          completedCount: 1,
          next: {
            bookingId: 'booking-next',
            startAt: '2026-09-23T10:00:00Z',
            endAt: '2026-09-23T11:00:00Z',
            status: 'Upcoming',
          } as any,
          bookings: [
            {
              bookingId: 'booking-1',
              startAt: '2026-09-22T08:00:00Z',
              endAt: '2026-09-22T09:00:00Z',
              status: 'Completed',
            },
          ] as any[],
          pending: [
            {
              bookingId: 'booking-2',
              startAt: '2026-09-22T10:00:00Z',
              endAt: '2026-09-22T11:00:00Z',
              status: 'Upcoming',
            },
          ] as any[],
          hints: ['还有2节课待确认'],
        }),
      } as any

      const app = createTestApp({
        teacherRepo: mockTeacherRepo,
        courseRepo: {} as any,
        studentRepo: {} as any,
        availabilityRepo: {} as any,
        packageRepo: {} as any,
        bookingRepo: mockBookingRepo,
        idempotencyRepo: {} as any,
        pool: createMockPool(),
      })

      const token = generateUserAccessToken('user-teacher')

      const response = await request(app)
        .get('/v1/me/teacher-day')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
      const data = response.body.data

      // Verify full TeacherDayView shape is returned
      expect(data).toHaveProperty('date')
      expect(data).toHaveProperty('isToday')
      expect(data).toHaveProperty('dateLabel')
      expect(data).toHaveProperty('todayCount')
      expect(data).toHaveProperty('completedCount')
      expect(data).toHaveProperty('next')
      expect(data).toHaveProperty('bookings')
      expect(data).toHaveProperty('pending')
      expect(data).toHaveProperty('hints')

      // Verify values
      expect(data.isToday).toBe(true)
      expect(data.dateLabel).toBe('今天')
      expect(data.todayCount).toBe(3)
      expect(data.completedCount).toBe(1)
      expect(data.next).toBeDefined()
      expect(data.bookings).toHaveLength(1)
      expect(data.pending).toHaveLength(1)
      expect(data.hints).toEqual(['还有2节课待确认'])
    })
  })

  describe('GET /v1/me/student-home', () => {
    it('calculates available correctly: remaining=5, no upcoming → available=5', async () => {
      const mockStudentRepo = {
        findById: async (studentId: string) => ({
          student: { studentId, name: '小明', teacherId: 'teacher-1', bound: false },
        }),
      } as any

      const mockTeacherRepo = {
        findById: async (teacherId: string) => ({
          teacherId,
          name: '张老师',
          avatar: null,
        }),
      } as any

      const mockPackageRepo = {
        listByStudent: async (studentId: string) => [
          {
            packageId: 'pkg-1',
            courseId: 'course-1',
            courseName: '西班牙语',
            remainingSessions: 5,
            purchasedSessions: 5,
            status: 'Active',
          },
        ],
      } as any

      const mockBookingRepo = {
        listUpcomingByStudent: async (studentId: string) => [],
      } as any

      const mockCourseRepo = {
        findById: async (courseId: string) => ({
          courseId,
          name: '西班牙语',
          durationMinutes: 60,
          allowSelfBooking: true,
        }),
      } as any

      const app = createTestApp({
        teacherRepo: mockTeacherRepo,
        courseRepo: mockCourseRepo,
        studentRepo: mockStudentRepo,
        availabilityRepo: {} as any,
        packageRepo: mockPackageRepo,
        bookingRepo: mockBookingRepo,
        idempotencyRepo: {} as any,
        pool: createMockPool(),
      })

      const token = generateStudentAccessToken('student-1', 'teacher-1')

      const response = await request(app)
        .get('/v1/me/student-home')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
      const card = response.body.data.cards[0]
      const course = card.courses[0]

      expect(course.remaining).toBe(5)
      expect(course.available).toBe(5)
      expect(course.exhausted).toBe(false)
      expect(course.fullyReserved).toBe(false)
      expect(course.durationMinutes).toBe(60)
      expect(course.allowSelfBooking).toBe(true)
    })

    it('calculates available correctly: remaining=5, 2 upcoming → available=3', async () => {
      const mockStudentRepo = {
        findById: async (studentId: string) => ({
          student: { studentId, name: '小明', teacherId: 'teacher-1', bound: false },
        }),
      } as any

      const mockTeacherRepo = {
        findById: async (teacherId: string) => ({
          teacherId,
          name: '张老师',
          avatar: null,
        }),
      } as any

      const mockPackageRepo = {
        listByStudent: async (studentId: string) => [
          {
            packageId: 'pkg-1',
            courseId: 'course-1',
            courseName: '西班牙语',
            remainingSessions: 5,
            purchasedSessions: 5,
            status: 'Active',
          },
        ],
      } as any

      const mockBookingRepo = {
        listUpcomingByStudent: async (studentId: string) => [
          {
            bookingId: 'booking-1',
            courseId: 'course-1',
            startAt: '2026-09-23T10:00:00Z',
            endAt: '2026-09-23T11:00:00Z',
            status: 'Upcoming',
          },
          {
            bookingId: 'booking-2',
            courseId: 'course-1',
            startAt: '2026-09-24T10:00:00Z',
            endAt: '2026-09-24T11:00:00Z',
            status: 'Upcoming',
          },
        ],
      } as any

      const mockCourseRepo = {
        findById: async (courseId: string) => ({
          courseId,
          name: '西班牙语',
          durationMinutes: 60,
          allowSelfBooking: true,
        }),
      } as any

      const app = createTestApp({
        teacherRepo: mockTeacherRepo,
        courseRepo: mockCourseRepo,
        studentRepo: mockStudentRepo,
        availabilityRepo: {} as any,
        packageRepo: mockPackageRepo,
        bookingRepo: mockBookingRepo,
        idempotencyRepo: {} as any,
        pool: createMockPool(),
      })

      const token = generateStudentAccessToken('student-1', 'teacher-1')

      const response = await request(app)
        .get('/v1/me/student-home')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
      const card = response.body.data.cards[0]
      const course = card.courses[0]

      expect(course.remaining).toBe(5)
      expect(course.available).toBe(3)
      expect(course.exhausted).toBe(false)
      expect(course.fullyReserved).toBe(false)
    })

    it('sets exhausted=true when remaining=0', async () => {
      const mockStudentRepo = {
        findById: async (studentId: string) => ({
          student: { studentId, name: '小明', teacherId: 'teacher-1', bound: false },
        }),
      } as any

      const mockTeacherRepo = {
        findById: async (teacherId: string) => ({
          teacherId,
          name: '张老师',
          avatar: null,
        }),
      } as any

      const mockPackageRepo = {
        listByStudent: async (studentId: string) => [
          {
            packageId: 'pkg-1',
            courseId: 'course-1',
            courseName: '西班牙语',
            remainingSessions: 0,
            purchasedSessions: 5,
            status: 'Active',
          },
        ],
      } as any

      const mockBookingRepo = {
        listUpcomingByStudent: async (studentId: string) => [],
      } as any

      const mockCourseRepo = {
        findById: async (courseId: string) => ({
          courseId,
          name: '西班牙语',
          durationMinutes: 60,
          allowSelfBooking: true,
        }),
      } as any

      const app = createTestApp({
        teacherRepo: mockTeacherRepo,
        courseRepo: mockCourseRepo,
        studentRepo: mockStudentRepo,
        availabilityRepo: {} as any,
        packageRepo: mockPackageRepo,
        bookingRepo: mockBookingRepo,
        idempotencyRepo: {} as any,
        pool: createMockPool(),
      })

      const token = generateStudentAccessToken('student-1', 'teacher-1')

      const response = await request(app)
        .get('/v1/me/student-home')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
      const card = response.body.data.cards[0]
      const course = card.courses[0]

      expect(course.remaining).toBe(0)
      expect(course.available).toBe(0)
      expect(course.exhausted).toBe(true)
      expect(course.fullyReserved).toBe(false)
    })

    it('sets fullyReserved=true when remaining>0 but available=0', async () => {
      const mockStudentRepo = {
        findById: async (studentId: string) => ({
          student: { studentId, name: '小明', teacherId: 'teacher-1', bound: false },
        }),
      } as any

      const mockTeacherRepo = {
        findById: async (teacherId: string) => ({
          teacherId,
          name: '张老师',
          avatar: null,
        }),
      } as any

      const mockPackageRepo = {
        listByStudent: async (studentId: string) => [
          {
            packageId: 'pkg-1',
            courseId: 'course-1',
            courseName: '西班牙语',
            remainingSessions: 3,
            purchasedSessions: 5,
            status: 'Active',
          },
        ],
      } as any

      const mockBookingRepo = {
        listUpcomingByStudent: async (studentId: string) => [
          { bookingId: 'b-1', courseId: 'course-1', status: 'Upcoming' },
          { bookingId: 'b-2', courseId: 'course-1', status: 'Upcoming' },
          { bookingId: 'b-3', courseId: 'course-1', status: 'Upcoming' },
        ],
      } as any

      const mockCourseRepo = {
        findById: async (courseId: string) => ({
          courseId,
          name: '西班牙语',
          durationMinutes: 60,
          allowSelfBooking: true,
        }),
      } as any

      const app = createTestApp({
        teacherRepo: mockTeacherRepo,
        courseRepo: mockCourseRepo,
        studentRepo: mockStudentRepo,
        availabilityRepo: {} as any,
        packageRepo: mockPackageRepo,
        bookingRepo: mockBookingRepo,
        idempotencyRepo: {} as any,
        pool: createMockPool(),
      })

      const token = generateStudentAccessToken('student-1', 'teacher-1')

      const response = await request(app)
        .get('/v1/me/student-home')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.ok).toBe(true)
      const card = response.body.data.cards[0]
      const course = card.courses[0]

      expect(course.remaining).toBe(3)
      expect(course.available).toBe(0)
      expect(course.exhausted).toBe(false)
      expect(course.fullyReserved).toBe(true)
    })
  })
})
