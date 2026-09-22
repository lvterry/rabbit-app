import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookingView } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'
import { Layout } from '../components/Layout'
import { InfoBox, EmptyState } from '../components/UIComponents'

interface BookingDetailRouteProps {
  id?: string
  path?: string
}

export function BookingDetailRoute({ id: idProp }: BookingDetailRouteProps) {
  const id = idProp || ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    loadBooking()
  }, [id])

  async function loadBooking() {
    setLoading(true)
    setError(null)

    const response = await api.getBooking(id)

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setBooking(response.data.booking)
    setLoading(false)
  }

  async function handleCancel() {
    if (!booking || actionInProgress) return

    setActionInProgress(true)
    setError(null)

    const idempotencyKey = crypto.randomUUID()
    const response = await api.cancelBooking(booking.bookingId, idempotencyKey)

    if (!response.ok) {
      setError(response.message)
      setActionInProgress(false)
      return
    }

    setShowCancelConfirm(false)
    await loadBooking()
    setActionInProgress(false)
  }

  function handleReschedule() {
    if (!booking) return
    
    const params = new URLSearchParams({
      teacherId: booking.teacherId,
      courseId: booking.courseId,
      rescheduleBookingId: booking.bookingId,
    })
    route(`/book?${params.toString()}`)
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

  if (error && !booking) {
    return (
      <Layout currentPath="/">
        <EmptyState
          title="加载失败"
          message={error}
          action={{
            text: '返回列表',
            onClick: () => route('/bookings?scope=upcoming'),
          }}
        />
      </Layout>
    )
  }

  if (!booking) {
    return null
  }

  const isUpcoming = booking.status === 'Upcoming'
  const canCancel = booking.actions.canCancel
  const canReschedule = booking.actions.canReschedule

  return (
    <Layout currentPath="/">
      <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
        <h1 style={{ 
          fontSize: 'var(--font-size-2xl)', 
          fontWeight: 'var(--font-weight-bold)', 
          marginBottom: 'var(--spacing-lg)',
        }}>
          课程详情
        </h1>

        {error && <InfoBox type="danger" message={error} />}

        <div class="card">
          {/* Course header */}
          <div style={{ 
            marginBottom: 'var(--spacing-lg)',
            paddingBottom: 'var(--spacing-md)',
            borderBottom: '1px solid var(--color-divider)',
          }}>
            <div style={{ 
              fontWeight: 'var(--font-weight-semibold)', 
              fontSize: 'var(--font-size-xl)', 
              marginBottom: 'var(--spacing-xs)',
            }}>
              {booking.courseName}
            </div>
            <div class="text-secondary" style={{ fontSize: 'var(--font-size-md)' }}>
              {booking.teacherName}
            </div>
          </div>

          {/* Date & Time */}
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <div style={{ 
              fontWeight: 'var(--font-weight-medium)', 
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-xs)',
            }}>
              日期时间
            </div>
            <div style={{ 
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
            }}>
              {booking.dateLabel}
            </div>
            <div style={{ 
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-text-secondary)',
              marginTop: '4px',
            }}>
              {booking.timeRange} · {booking.durationMinutes} 分钟
            </div>
          </div>

          {/* Status */}
          <div style={{ 
            marginTop: 'var(--spacing-lg)',
            paddingTop: 'var(--spacing-md)',
            borderTop: '1px solid var(--color-divider)',
          }}>
            <div style={{ 
              fontWeight: 'var(--font-weight-medium)', 
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-xs)',
            }}>
              状态
            </div>
            {booking.status === 'Upcoming' && (
              <div style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: booking.started ? 'var(--color-yellow-light)' : 'var(--color-primary-light)',
                color: booking.started ? 'var(--color-warning)' : 'var(--color-primary)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
              }}>
                {booking.started ? '⏰ 已开始' : '📅 待上课'}
              </div>
            )}
            {booking.status === 'Completed' && (
              <div>
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}>
                  ✓ 已完成
                </div>
                {booking.consumedSession && (
                  <div class="text-secondary" style={{ 
                    fontSize: 'var(--font-size-sm)',
                    marginTop: 'var(--spacing-xs)',
                  }}>
                    已扣除 1 节课时
                  </div>
                )}
              </div>
            )}
            {booking.status === 'Cancelled' && (
              <div>
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-background-tertiary)',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}>
                  已取消
                </div>
                {booking.cancelledByLabel && (
                  <div class="text-secondary" style={{ 
                    fontSize: 'var(--font-size-sm)', 
                    marginTop: 'var(--spacing-xs)',
                  }}>
                    取消方：{booking.cancelledByLabel}
                  </div>
                )}
                {booking.policyText && (
                  <div class="text-secondary" style={{ 
                    fontSize: 'var(--font-size-sm)',
                    marginTop: '4px',
                  }}>
                    {booking.policyText}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Remaining sessions */}
          {booking.available !== null && (
            <div style={{ 
              marginTop: 'var(--spacing-lg)',
              paddingTop: 'var(--spacing-md)',
              borderTop: '1px solid var(--color-divider)',
            }}>
              <div style={{ 
                fontWeight: 'var(--font-weight-medium)', 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-xs)',
              }}>
                剩余课时
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: booking.remaining > 0 
                  ? 'var(--color-primary-light)' 
                  : 'var(--color-background-tertiary)',
                color: booking.remaining > 0 
                  ? 'var(--color-primary)' 
                  : 'var(--color-text-tertiary)',
                fontSize: 'var(--font-size-md)',
                fontWeight: 'var(--font-weight-semibold)',
              }}>
                {booking.remaining} 节
              </div>
            </div>
          )}
        </div>

        {/* Warning for started courses */}
        {isUpcoming && booking.started && (
          <InfoBox
            type="warning"
            title="课程已开始"
            message="这节课已经开始，请联系老师确认。"
          />
        )}

        {/* Actions for upcoming courses */}
        {isUpcoming && !booking.started && (
          <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            {canReschedule && (
              <button
                class="button"
                onClick={handleReschedule}
                disabled={actionInProgress}
              >
                改期
              </button>
            )}

            {booking.actions.rescheduleLimitReached && (
              <InfoBox
                type="info"
                message={`该课程已改期 ${booking.maxReschedules} 次，如需继续改期请联系老师。`}
              />
            )}

            {canCancel && (
              <button
                class="button button-danger"
                onClick={() => setShowCancelConfirm(true)}
                disabled={actionInProgress}
              >
                取消预约
              </button>
            )}
          </div>
        )}

        <button
          class="button button-secondary"
          style={{ marginTop: 'var(--spacing-md)' }}
          onClick={() => route('/bookings?scope=' + (isUpcoming ? 'upcoming' : 'history'))}
        >
          返回列表
        </button>

        {/* Cancel confirmation modal */}
        {showCancelConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--spacing-lg)',
              zIndex: 1000,
            }}
            onClick={() => setShowCancelConfirm(false)}
          >
            <div
              class="card"
              style={{ maxWidth: '400px', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ 
                fontSize: 'var(--font-size-xl)',
                fontWeight: 'var(--font-weight-bold)',
                marginBottom: 'var(--spacing-md)',
              }}>
                确认取消
              </h2>
              
              <p style={{ 
                marginBottom: 'var(--spacing-lg)', 
                color: 'var(--color-text-secondary)',
                lineHeight: 'var(--line-height-relaxed)',
              }}>
                确定要取消这次预约吗？
              </p>

              {booking.policyText && (
                <InfoBox
                  type="warning"
                  title="取消政策"
                  message={booking.policyText}
                />
              )}

              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <button
                  class="button button-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={actionInProgress}
                >
                  返回
                </button>
                <button
                  class="button button-danger"
                  style={{ flex: 1 }}
                  onClick={handleCancel}
                  disabled={actionInProgress}
                >
                  {actionInProgress ? '处理中...' : '确认取消'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
