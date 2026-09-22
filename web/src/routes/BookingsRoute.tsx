import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookingView } from '@rabbit/shared'
import * as api from '../api/client'

interface BookingsRouteProps {
  path: string
}

type Scope = 'upcoming' | 'history'

export function BookingsRoute(_props: BookingsRouteProps) {
  const params = new URLSearchParams(window.location.search)
  const initialScope = (params.get('scope') || 'upcoming') as Scope

  const [scope, setScope] = useState<Scope>(initialScope)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<BookingView[]>([])

  useEffect(() => {
    loadBookings()
  }, [scope])

  async function loadBookings() {
    setLoading(true)
    setError(null)

    const response = await api.getStudentBookings(scope)

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    const data = scope === 'upcoming' ? response.data.upcoming || [] : response.data.history || []
    setBookings(data)
    setLoading(false)
  }

  function handleTabChange(newScope: Scope) {
    setScope(newScope)
    const params = new URLSearchParams({ scope: newScope })
    history.replaceState(null, '', `/bookings?${params.toString()}`)
  }

  if (loading) {
    return (
      <div class="container">
        <div class="loading">加载中...</div>
      </div>
    )
  }

  return (
    <div class="container" style={{ paddingTop: '16px', paddingBottom: '80px' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: '16px' }}>
        我的课程
      </h1>

      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '1px solid var(--color-divider)',
      }}>
        <button
          class={scope === 'upcoming' ? 'tab-active' : 'tab'}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderBottom: scope === 'upcoming' ? '2px solid var(--color-primary)' : 'none',
            color: scope === 'upcoming' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: scope === 'upcoming' ? 600 : 'normal',
          }}
          onClick={() => handleTabChange('upcoming')}
        >
          进行中
        </button>
        <button
          class={scope === 'history' ? 'tab-active' : 'tab'}
          style={{
            flex: 1,
            padding: '12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderBottom: scope === 'history' ? '2px solid var(--color-primary)' : 'none',
            color: scope === 'history' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: scope === 'history' ? 600 : 'normal',
          }}
          onClick={() => handleTabChange('history')}
        >
          历史
        </button>
      </div>

      {error && <div class="error">{error}</div>}

      {bookings.length === 0 ? (
        <div class="empty-state">
          <div class="empty-state-title">
            {scope === 'upcoming' ? '暂无进行中的课程' : '暂无历史课程'}
          </div>
        </div>
      ) : (
        <div>
          {bookings.map((booking) => (
            <div
              key={booking.bookingId}
              class="list-item"
              onClick={() => route(`/bookings/${booking.bookingId}`)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                  {booking.courseName}
                </div>
                <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {booking.dateLabel} {booking.timeRange}
                </div>
                <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {booking.teacherName}
                </div>
                {booking.status === 'Completed' && (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(52, 199, 89, 0.1)',
                      color: 'var(--color-success)',
                    }}
                  >
                    已完成
                  </div>
                )}
                {booking.status === 'Cancelled' && (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(142, 142, 147, 0.1)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    已取消
                  </div>
                )}
              </div>
              <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)' }}>
                ›
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        backgroundColor: 'var(--color-background)',
        borderTop: '1px solid var(--color-divider)',
        padding: '8px 16px',
      }}>
        <button
          class="button button-secondary"
          style={{ flex: 1 }}
          onClick={() => route('/')}
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
