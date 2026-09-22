import type {
  APIResponse,
  PendingInvitePreview,
  AcceptedInviteResponse,
  StudentHomeView,
  BookingView,
  SlotsResponse,
  BookableDaysResponse,
  CreateBookingRequest,
  CancelBookingRequest,
  RescheduleBookingRequest,
} from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'

const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === '1'

const API_BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:8787'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

const FIXTURE_PATH_MAP: Record<string, string> = {
  'GET /v1/invites/:token': '/contracts/fixtures/invites/pending.json',
  'GET /v1/me/student-home': '/contracts/fixtures/students/student-home-anonymous.json',
  'GET /v1/bookings/:id': '/contracts/fixtures/bookings/upcoming-student.json',
  'GET /v1/teachers/:teacherId/bookable-days': '/contracts/fixtures/slots/bookable-days.json',
  'GET /v1/teachers/:teacherId/slots': '/contracts/fixtures/slots/slots.json',
}

const FIXTURE_BOOKINGS_RESPONSE = {
  ok: true,
  data: {
    upcoming: [
      {
        bookingId: '850e8400-e29b-41d4-a716-446655440014',
        teacherId: '550e8400-e29b-41d4-a716-446655440001',
        teacherName: '王老师',
        studentId: '650e8400-e29b-41d4-a716-446655440002',
        studentName: '张同学',
        courseId: '750e8400-e29b-41d4-a716-446655440003',
        courseName: '西班牙语一对一',
        durationMinutes: 60,
        packageId: '950e8400-e29b-41d4-a716-446655440005',
        startAt: '2026-03-03T06:00:00Z',
        endAt: '2026-03-03T07:00:00Z',
        date: '2026-03-03',
        dateLabel: '3月3日 周二',
        startLocal: '14:00',
        endLocal: '15:00',
        timeRange: '14:00-15:00',
        status: 'Upcoming' as const,
        source: 'SelfBooked' as const,
        sourceLabel: '学员自主预约',
        cancelledAt: null,
        cancelledBy: null,
        cancelledByLabel: null,
        cancellationPolicyResult: null,
        policyText: null,
        consumedSession: false,
        policySnapshotFreeCancelHours: 24,
        rescheduledFromBookingId: null,
        rescheduledToBookingId: null,
        rescheduleCount: 0,
        maxReschedules: 3,
        settledAt: null,
        sessionStatus: null,
        sessionSource: null,
        sessionSourceLabel: null,
        createdAt: '2026-02-20T01:00:00Z',
        started: false,
        remaining: null,
        reserved: null,
        available: null,
        actions: {
          canComplete: false,
          canMarkNoShow: false,
          canCancel: true,
          canReschedule: true,
          rescheduleLimitReached: false,
          canUndoComplete: false,
          undoDeadline: null,
        },
      },
    ],
    history: [],
  },
  meta: {
    generatedAt: new Date().toISOString(),
    requestId: 'fixture-bookings',
  },
}

function getFixturePath(method: string, path: string): string | null {
  if (path.includes('/me/student-bookings')) {
    return 'BOOKINGS_SPECIAL'
  }
  
  const normalizedPath = path.replace(/\/v1\/invites\/[^/]+/, '/v1/invites/:token')
    .replace(/\/v1\/bookings\/[^/]+\//, '/v1/bookings/:id/')
    .replace(/\/v1\/bookings\/[^/]+$/, '/v1/bookings/:id')
    .replace(/\/v1\/teachers\/[^/]+\//, '/v1/teachers/:teacherId/')
    .split('?')[0]
  
  const key = `${method} ${normalizedPath}`
  
  return FIXTURE_PATH_MAP[key] || null
}

async function loadFixture<T>(fixturePath: string): Promise<APIResponse<T>> {
  try {
    const response = await fetch(fixturePath)
    if (!response.ok) {
      throw new Error(`Fixture not found: ${fixturePath}`)
    }
    const envelope = await response.json()
    
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      return envelope as APIResponse<T>
    }
    
    return {
      ok: true,
      data: envelope as T,
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: 'fixture-' + Math.random().toString(36).substring(7),
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: ErrorCode.INTERNAL,
      message: 'Fixture loading failed: ' + (error as Error).message,
      retryable: false,
      details: null,
      requestId: 'fixture-error',
    }
  }
}

const FIXTURE_POST_RESPONSES: Record<string, unknown> = {
  'POST /v1/invites/:token/accept': {
    ok: true,
    data: {
      accessToken: 'fixture-access-token',
      redirectTo: '/',
    },
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: 'fixture-accept',
    },
  },
  'POST /v1/bookings': {
    ok: true,
    data: {
      bookingId: '850e8400-e29b-41d4-a716-446655440001',
      booking: {
        bookingId: '850e8400-e29b-41d4-a716-446655440001',
        teacherId: '550e8400-e29b-41d4-a716-446655440001',
        teacherName: '王老师',
        studentId: '650e8400-e29b-41d4-a716-446655440002',
        studentName: '张同学',
        courseId: '750e8400-e29b-41d4-a716-446655440003',
        courseName: '西班牙语一对一',
        durationMinutes: 60,
        packageId: '950e8400-e29b-41d4-a716-446655440005',
        startAt: '2026-03-03T06:00:00Z',
        endAt: '2026-03-03T07:00:00Z',
        date: '2026-03-03',
        dateLabel: '3月3日 周二',
        startLocal: '14:00',
        endLocal: '15:00',
        timeRange: '14:00-15:00',
        status: 'Upcoming',
        source: 'SelfBooked',
        sourceLabel: '学员自主预约',
        cancelledAt: null,
        cancelledBy: null,
        cancelledByLabel: null,
        cancellationPolicyResult: null,
        policyText: null,
        consumedSession: false,
        policySnapshotFreeCancelHours: 24,
        rescheduledFromBookingId: null,
        rescheduledToBookingId: null,
        rescheduleCount: 0,
        maxReschedules: 3,
        settledAt: null,
        sessionStatus: null,
        sessionSource: null,
        sessionSourceLabel: null,
        createdAt: new Date().toISOString(),
        started: false,
        remaining: null,
        reserved: null,
        available: null,
        actions: {
          canComplete: false,
          canMarkNoShow: false,
          canCancel: true,
          canReschedule: true,
          rescheduleLimitReached: false,
          canUndoComplete: false,
          undoDeadline: null,
        },
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: 'fixture-create-booking',
    },
  },
  'POST /v1/bookings/:id/cancellation': {
    ok: true,
    data: {
      bookingId: '850e8400-e29b-41d4-a716-446655440001',
      booking: {
        bookingId: '850e8400-e29b-41d4-a716-446655440001',
        status: 'Cancelled',
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: 'fixture-cancel',
    },
  },
  'POST /v1/bookings/:id/reschedule': {
    ok: true,
    data: {
      bookingId: '850e8400-e29b-41d4-a716-446655440002',
      previousBookingId: '850e8400-e29b-41d4-a716-446655440001',
      booking: {
        bookingId: '850e8400-e29b-41d4-a716-446655440002',
        status: 'Upcoming',
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: 'fixture-reschedule',
    },
  },
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<APIResponse<T>> {
  if (USE_FIXTURES) {
    if (method === 'GET') {
      const fixturePath = getFixturePath(method, path)
      
      if (fixturePath === 'BOOKINGS_SPECIAL') {
        const scope = path.includes('scope=upcoming') ? 'upcoming' : 'history'
        if (scope === 'upcoming') {
          return FIXTURE_BOOKINGS_RESPONSE as APIResponse<T>
        } else {
          return {
            ...FIXTURE_BOOKINGS_RESPONSE,
            data: { upcoming: [], history: FIXTURE_BOOKINGS_RESPONSE.data.upcoming },
          } as APIResponse<T>
        }
      }
      
      if (fixturePath) {
        return loadFixture<T>(fixturePath)
      }
    }
    
    if (method === 'POST' || method === 'DELETE') {
      const normalizedPath = path.replace(/\/v1\/invites\/[^/]+/, '/v1/invites/:token')
        .replace(/\/v1\/bookings\/[^/]+\//, '/v1/bookings/:id/')
        .replace(/\/v1\/bookings\/[^/]+$/, '/v1/bookings/:id')
      const key = `${method} ${normalizedPath}`
      
      if (FIXTURE_POST_RESPONSES[key]) {
        return FIXTURE_POST_RESPONSES[key] as APIResponse<T>
      }
      
      return {
        ok: true,
        data: {} as T,
        meta: {
          generatedAt: new Date().toISOString(),
          requestId: 'fixture-' + Math.random().toString(36).substring(7),
        },
      }
    }
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Client': 'web/2026.03.1',
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    })

    const data = await response.json()
    return data as APIResponse<T>
  } catch (error) {
    return {
      ok: false,
      code: ErrorCode.NETWORK_ERROR,
      message: '网络连接失败，请检查网络后重试',
      retryable: true,
      details: null,
      requestId: 'network-error',
    }
  }
}

export async function getInvite(
  token: string
): Promise<APIResponse<PendingInvitePreview | AcceptedInviteResponse>> {
  return apiRequest('GET', `/v1/invites/${token}`)
}

export async function acceptInvite(
  token: string
): Promise<APIResponse<{ accessToken: string; redirectTo: string }>> {
  return apiRequest('POST', `/v1/invites/${token}/accept`)
}

export async function getStudentHome(): Promise<APIResponse<StudentHomeView>> {
  return apiRequest('GET', '/v1/me/student-home')
}

export async function getStudentBookings(
  scope: 'upcoming' | 'history'
): Promise<APIResponse<{ upcoming?: BookingView[]; history?: BookingView[] }>> {
  return apiRequest('GET', `/v1/me/student-bookings?scope=${scope}`)
}

export async function getBooking(bookingId: string): Promise<APIResponse<{
  booking: BookingView
}>> {
  return apiRequest('GET', `/v1/bookings/${bookingId}`)
}

export async function getBookableDays(
  teacherId: string,
  courseId: string,
  from: string,
  to: string
): Promise<APIResponse<BookableDaysResponse>> {
  return apiRequest('GET', `/v1/teachers/${teacherId}/bookable-days?courseId=${courseId}&from=${from}&to=${to}`)
}

export async function getSlots(
  teacherId: string,
  courseId: string,
  date: string
): Promise<APIResponse<SlotsResponse>> {
  return apiRequest('GET', `/v1/teachers/${teacherId}/slots?courseId=${courseId}&date=${date}`)
}

export async function createBooking(
  request: CreateBookingRequest,
  idempotencyKey: string
): Promise<APIResponse<{ bookingId: string; booking: BookingView }>> {
  return apiRequest('POST', '/v1/bookings', request, idempotencyKey)
}

export async function cancelBooking(
  bookingId: string,
  idempotencyKey: string
): Promise<APIResponse<{ bookingId: string; booking: BookingView }>> {
  return apiRequest('POST', `/v1/bookings/${bookingId}/cancellation`, {}, idempotencyKey)
}

export async function rescheduleBooking(
  bookingId: string,
  request: RescheduleBookingRequest,
  idempotencyKey: string
): Promise<APIResponse<{ bookingId: string; booking: BookingView }>> {
  return apiRequest('POST', `/v1/bookings/${bookingId}/reschedule`, request, idempotencyKey)
}

export async function refreshToken(): Promise<APIResponse<{ accessToken: string }>> {
  return apiRequest('POST', '/v1/auth/refresh')
}
