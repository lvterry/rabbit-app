import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookingView } from '@rabbit/shared'
import * as api from '../api/client'
import { Layout } from '../components/Layout'
import { EmptyState } from '../components/UIComponents'

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
      <Layout currentPath="/">
        <div class="container">
          <div class="loading">加载中...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout currentPath="/">
      <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
        <h1 style={{ 
          fontSize: 'var(--font-size-2xl)', 
          fontWeight: 'var(--font-weight-bold)', 
          marginBottom: 'var(--spacing-lg)',
        }}>
          我的预约
        </h1>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-lg)',
          borderBottom: '2px solid var(--color-divider)',
        }}>
          <button
            style={{
              flex: 1,
              padding: 'var(--spacing-md)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderBottom: scope === 'upcoming' ? '3px solid var(--color-primary)' : 'none',
              color: scope === 'upcoming' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: scope === 'upcoming' ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
              fontSize: 'var(--font-size-md)',
              marginBottom: '-2px',
              transition: 'all 0.2s ease',
              minHeight: 'var(--tap-target-min)',
            }}
            onClick={() => handleTabChange('upcoming')}
          >
            进行中
          </button>
          <button
            style={{
              flex: 1,
              padding: 'var(--spacing-md)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderBottom: scope === 'history' ? '3px solid var(--color-primary)' : 'none',
              color: scope === 'history' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: scope === 'history' ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
              fontSize: 'var(--font-size-md)',
              marginBottom: '-2px',
              transition: 'all 0.2s ease',
              minHeight: 'var(--tap-target-min)',
            }}
            onClick={() => handleTabChange('history')}
          >
            历史
          </button>
        </div>

        {error && <div class="error">{error}</div>}

        {bookings.length === 0 ? (
          <EmptyState
            title={scope === 'upcoming' ? '暂无进行中的课程' : '暂无历史课程'}
            message={scope === 'upcoming' ? '预约课程后会显示在这里' : '已完成的课程会显示在这里'}
            playful
          />
        ) : (
          <div>
            {bookings.map((booking) => (
              <div
                key={booking.bookingId}
                class="list-item"
                onClick={() => route(`/bookings/${booking.bookingId}`)}
                style={{
                  marginBottom: 'var(--spacing-md)',
                  padding: 'var(--spacing-lg)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 'var(--font-weight-semibold)', 
                    fontSize: 'var(--font-size-lg)',
                    marginBottom: 'var(--spacing-xs)',
                  }}>
                    {booking.courseName}
                  </div>
                  <div class="text-secondary" style={{ 
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: '4px',
                  }}>
                    {booking.dateLabel} {booking.timeRange}
                  </div>
                  <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                    {booking.teacherName}
                  </div>
                  
                  {booking.status === 'Completed' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: 'var(--spacing-sm)',
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-medium)',
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      ✓ 已完成
                    </div>
                  )}
                  {booking.status === 'Cancelled' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: 'var(--spacing-sm)',
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-medium)',
                        backgroundColor: 'var(--color-background-tertiary)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      已取消
                    </div>
                  )}
                </div>
                <div style={{ 
                  fontSize: 'var(--font-size-2xl)', 
                  color: 'var(--color-text-tertiary)',
                }}>
                  ›
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
