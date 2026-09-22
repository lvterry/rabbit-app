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

async function fixtureGet<T>(path: string): Promise<T> {
  const fixturePath = `/fixtures${path.replace(/\/v1/, '')}.json`
  const response = await fetch(fixturePath)
  if (!response.ok) {
    throw new Error(`Fixture not found: ${fixturePath}`)
  }
  return response.json()
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<APIResponse<T>> {
  if (USE_FIXTURES && method === 'GET') {
    try {
      const data = await fixtureGet<T>(path)
      return {
        ok: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          requestId: 'fixture-' + Math.random().toString(36).substring(7),
        },
      }
    } catch (error) {
      return {
        ok: false,
        code: ErrorCode.INTERNAL,
        message: 'Fixture loading failed',
        retryable: false,
        details: null,
        requestId: 'fixture-error',
      }
    }
  }

  if (USE_FIXTURES && method !== 'GET') {
    return {
      ok: true,
      data: {} as T,
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: 'fixture-' + Math.random().toString(36).substring(7),
      },
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
