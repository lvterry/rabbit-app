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
  'GET /v1/me/student-home': '/contracts/fixtures/students/student-home-anonymous.json',
  'GET /v1/bookings/:id': '/contracts/fixtures/bookings/upcoming-student.json',
  'GET /v1/teachers/:teacherId/bookable-days': '/contracts/fixtures/slots/bookable-days.json',
  'GET /v1/teachers/:teacherId/slots': '/contracts/fixtures/slots/slots.json',
}

const INVITE_TOKEN_MAP: Record<string, string> = {
  'pending': '/contracts/fixtures/invites/pending.json',
  'accepted': '/contracts/fixtures/invites/consumed-matching-session.json',
  'consumed': '/contracts/fixtures/invites/consumed-matching-session.json',
  'expired': '/contracts/fixtures/errors/token-expired.json',
  'foreign': '/contracts/fixtures/invites/consumed-foreign-session-error.json',
}

function getFixturePath(method: string, path: string, token?: string): string | null {
  if (path.includes('/me/student-bookings')) {
    return 'BOOKINGS_SPECIAL'
  }
  
  if (path.includes('/invites/') && token) {
    return INVITE_TOKEN_MAP[token] || INVITE_TOKEN_MAP['pending']
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

const FIXTURE_POST_RESPONSES: Record<string, string> = {
  'POST /v1/invites/:token/accept': '/contracts/fixtures/invites/consumed-matching-session.json',
  'POST /v1/bookings': '/contracts/fixtures/bookings/upcoming-student.json',
  'POST /v1/bookings/:id/cancellation': '/contracts/fixtures/bookings/cancelled-free.json',
  'POST /v1/bookings/:id/reschedule': '/contracts/fixtures/bookings/upcoming-student.json',
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
  isRetry = false
): Promise<APIResponse<T>> {
  if (USE_FIXTURES) {
    if (method === 'GET') {
      const token = path.match(/\/invites\/([^/?]+)/)?.[1]
      const fixturePath = getFixturePath(method, path, token)
      
      if (fixturePath === 'BOOKINGS_SPECIAL') {
        const upcomingFixture = await loadFixture<BookingView>('/contracts/fixtures/bookings/upcoming-student.json')
        const completedFixture = await loadFixture<BookingView>('/contracts/fixtures/bookings/completed.json')
        
        const scope = path.includes('scope=upcoming') ? 'upcoming' : 'history'
        if (scope === 'upcoming') {
          return {
            ok: true,
            data: { 
              upcoming: upcomingFixture.ok ? [upcomingFixture.data] : [],
              history: [],
            } as any,
            meta: upcomingFixture.ok ? upcomingFixture.meta : {
              generatedAt: new Date().toISOString(),
              requestId: 'fixture-bookings-upcoming',
            },
          } as APIResponse<T>
        } else {
          return {
            ok: true,
            data: { 
              upcoming: [],
              history: completedFixture.ok ? [completedFixture.data] : [],
            } as any,
            meta: completedFixture.ok ? completedFixture.meta : {
              generatedAt: new Date().toISOString(),
              requestId: 'fixture-bookings-history',
            },
          } as APIResponse<T>
        }
      }
      
      if (fixturePath) {
        const fixtureData = await loadFixture<any>(fixturePath)
        
        if (path.includes('/bookings/') && !path.includes('/bookable-days') && !path.includes('/slots')) {
          if (fixtureData.ok && fixtureData.data && !fixtureData.data.booking) {
            return {
              ok: true,
              data: { booking: fixtureData.data } as any,
              meta: fixtureData.meta,
            } as APIResponse<T>
          }
        }
        
        return fixtureData as APIResponse<T>
      }
    }
    
    if (method === 'POST' || method === 'DELETE') {
      const normalizedPath = path.replace(/\/v1\/invites\/[^/]+/, '/v1/invites/:token')
        .replace(/\/v1\/bookings\/[^/]+\//, '/v1/bookings/:id/')
        .replace(/\/v1\/bookings\/[^/]+$/, '/v1/bookings/:id')
      const key = `${method} ${normalizedPath}`
      
      const fixtureFile = FIXTURE_POST_RESPONSES[key]
      if (fixtureFile) {
        const fixtureData = await loadFixture<any>(fixtureFile)
        
        if (normalizedPath === '/v1/bookings' && fixtureData.ok && fixtureData.data) {
          return {
            ok: true,
            data: {
              bookingId: fixtureData.data.bookingId || crypto.randomUUID(),
              booking: fixtureData.data,
            } as any,
            meta: fixtureData.meta,
          } as APIResponse<T>
        }
        
        if (normalizedPath.includes('/cancellation') && fixtureData.ok && fixtureData.data) {
          return {
            ok: true,
            data: {
              bookingId: fixtureData.data.bookingId,
              booking: { ...fixtureData.data, status: 'Cancelled' },
            } as any,
            meta: fixtureData.meta,
          } as APIResponse<T>
        }
        
        if (normalizedPath.includes('/reschedule') && fixtureData.ok && fixtureData.data) {
          return {
            ok: true,
            data: {
              bookingId: crypto.randomUUID(),
              previousBookingId: path.match(/\/bookings\/([^/]+)/)?.[1] || '',
              booking: { ...fixtureData.data, rescheduleCount: 1 },
            } as any,
            meta: fixtureData.meta,
          } as APIResponse<T>
        }
        
        return fixtureData as APIResponse<T>
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
    
    if (!isRetry && response.status === 401 && path !== '/v1/auth/refresh') {
      const refreshResponse = await refreshToken()
      
      if (refreshResponse.ok) {
        setAccessToken(refreshResponse.data.accessToken)
        return apiRequest<T>(method, path, body, idempotencyKey, true)
      } else {
        setAccessToken(null)
        return data as APIResponse<T>
      }
    }
    
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
