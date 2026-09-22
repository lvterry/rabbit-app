import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookingView } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'

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
      <div class="container">
        <div class="loading">加载中...</div>
      </div>
    )
  }

  if (error && !booking) {
    return (
      <div class="container" style={{ paddingTop: '40px' }}>
        <div class="error">{error}</div>
        <button class="button" onClick={() => route('/bookings?scope=upcoming')}>
          返回列表
        </button>
      </div>
    )
  }

  if (!booking) {
    return null
  }

  const isUpcoming = booking.status === 'Upcoming'
  const canCancel = booking.actions.canCancel
  const canReschedule = booking.actions.canReschedule

  return (
    <div class="container" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: '16px' }}>
        课程详情
      </h1>

      {error && <div class="error">{error}</div>}

      <div class="card">
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-lg)', marginBottom: '8px' }}>
            {booking.courseName}
          </div>
          <div class="text-secondary">
            {booking.teacherName}
          </div>
        </div>

        <div class="divider" />

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>日期</div>
          <div>{booking.dateLabel}</div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>时间</div>
          <div>{booking.timeRange}</div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>时长</div>
          <div>{booking.durationMinutes} 分钟</div>
        </div>

        {booking.status === 'Upcoming' && (
          <>
            <div class="divider" />
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>状态</div>
              <div style={{ color: 'var(--color-primary)' }}>
                {booking.started ? '已开始' : '待上课'}
              </div>
            </div>
          </>
        )}

        {booking.status === 'Completed' && (
          <>
            <div class="divider" />
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>状态</div>
              <div style={{ color: 'var(--color-success)' }}>已完成</div>
            </div>
            {booking.consumedSession && (
              <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                已扣除 1 节课时
              </div>
            )}
          </>
        )}

        {booking.status === 'Cancelled' && (
          <>
            <div class="divider" />
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>状态</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>已取消</div>
            </div>
            {booking.cancelledByLabel && (
              <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)', marginBottom: '4px' }}>
                取消方：{booking.cancelledByLabel}
              </div>
            )}
            {booking.policyText && (
              <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {booking.policyText}
              </div>
            )}
          </>
        )}

        {booking.available !== null && (
          <>
            <div class="divider" />
            <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              剩余课时：{booking.remaining} 节
            </div>
          </>
        )}
      </div>

      {isUpcoming && booking.started && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(255, 149, 0, 0.1)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-sm)',
          marginTop: '16px',
          fontSize: 'var(--font-size-sm)',
          textAlign: 'center',
        }}>
          这节课已经开始，请联系老师确认
        </div>
      )}

      {isUpcoming && !booking.started && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            <div class="text-secondary" style={{ fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
              该课程已改期 {booking.maxReschedules} 次，请联系老师
            </div>
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
        style={{ marginTop: '16px' }}
        onClick={() => route('/bookings?scope=' + (isUpcoming ? 'upcoming' : 'history'))}
      >
        返回列表
      </button>

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
            padding: '16px',
            zIndex: 1000,
          }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            class="card"
            style={{ maxWidth: '400px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '16px' }}>确认取消</h2>
            
            <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
              确定要取消这次预约吗？
            </p>

            {booking.policyText && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'rgba(255, 149, 0, 0.1)',
                  border: '1px solid var(--color-warning)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {booking.policyText}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
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
  )
}
