import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookableDaysResponse, SlotsResponse, SlotView } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'
import { Layout } from '../components/Layout'
import { SuccessScreen, DatePicker, InfoBox, EmptyState } from '../components/UIComponents'

interface BookRouteProps {
  path: string
}

type Step = 'date' | 'time' | 'confirm' | 'success'

export function BookRoute(_props: BookRouteProps) {
  const params = new URLSearchParams(window.location.search)
  const teacherId = params.get('teacherId')
  const courseId = params.get('courseId')
  const rescheduleBookingId = params.get('rescheduleBookingId')

  const [step, setStep] = useState<Step>('date')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookableDays, setBookableDays] = useState<BookableDaysResponse | null>(null)
  const [slots, setSlots] = useState<SlotsResponse | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<SlotView | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!teacherId || !courseId) {
      setError('缺少必要参数')
      setLoading(false)
      return
    }
    loadBookableDays()
  }, [teacherId, courseId])

  async function loadBookableDays() {
    if (!teacherId || !courseId) return

    setLoading(true)
    setError(null)

    const today = new Date()
    const from = today.toISOString().split('T')[0]
    const to = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const response = await api.getBookableDays(teacherId, courseId, from, to)

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setBookableDays(response.data)
    setLoading(false)
  }

  async function loadSlots(date: string) {
    if (!teacherId || !courseId) return

    setLoading(true)
    setError(null)

    const response = await api.getSlots(teacherId, courseId, date)

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setSlots(response.data)
    setStep('time')
    setLoading(false)
  }

  async function handleConfirm() {
    if (!courseId || !selectedSlot) return

    setSubmitting(true)
    setError(null)

    const idempotencyKey = crypto.randomUUID()

    let response

    if (rescheduleBookingId) {
      response = await api.rescheduleBooking(
        rescheduleBookingId,
        { newStartAt: selectedSlot.startAt },
        idempotencyKey
      )
    } else {
      response = await api.createBooking(
        { courseId, startAt: selectedSlot.startAt },
        idempotencyKey
      )
    }

    if (!response.ok) {
      if (response.code === ErrorCode.SLOT_TAKEN) {
        setError('这个时间刚被预约了，请选择其他时间。')
        if (selectedDate) {
          await loadSlots(selectedDate)
        }
        setStep('time')
      } else if (response.code === ErrorCode.LATE_RESCHEDULE_INSUFFICIENT) {
        setError(response.message)
      } else {
        setError(response.message)
      }
      setSubmitting(false)
      return
    }

    setStep('success')
  }

  if (step === 'success') {
    return (
      <Layout currentPath="/book" hideTabBar>
        <SuccessScreen
          title={rescheduleBookingId ? '改期成功' : '预约成功'}
          message="已为你安排课程，老师将收到通知"
          onContinue={() => route('/', true)}
        />
      </Layout>
    )
  }

  if (!teacherId || !courseId) {
    return (
      <Layout currentPath="/book">
        <EmptyState
          title="缺少必要参数"
          action={{
            text: '返回首页',
            onClick: () => route('/'),
          }}
        />
      </Layout>
    )
  }

  if (loading && !bookableDays && !slots) {
    return (
      <Layout currentPath="/book">
        <div class="container">
          <div class="loading">加载中...</div>
        </div>
      </Layout>
    )
  }

  if (error && !bookableDays && !slots) {
    return (
      <Layout currentPath="/book">
        <div class="container" style={{ paddingTop: 'var(--spacing-2xl)' }}>
          <div class="error">{error}</div>
          <button class="button" onClick={() => route('/')} style={{ marginTop: 'var(--spacing-md)' }}>
            返回首页
          </button>
        </div>
      </Layout>
    )
  }

  if (step === 'date' && bookableDays) {
    if (bookableDays.days.length === 0) {
      return (
        <Layout currentPath="/book">
          <EmptyState
            title={bookableDays.reasonText || '老师近期还没有开放时间'}
            message="请联系老师"
            action={{
              text: '返回首页',
              onClick: () => route('/'),
            }}
          />
        </Layout>
      )
    }

    return (
      <Layout currentPath="/book">
        <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <h1 style={{ 
              fontSize: 'var(--font-size-2xl)', 
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
            }}>
              选择日期
            </h1>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              1/3
            </div>
          </div>

          {error && <InfoBox type="danger" message={error} />}

          <DatePicker
            days={bookableDays.days.map(d => ({ ...d, available: d.slotCount > 0 }))}
            onSelectDate={(date) => {
              setSelectedDate(date)
              loadSlots(date)
            }}
            selectedDate={selectedDate || undefined}
          />

          <button
            class="button button-secondary"
            style={{ marginTop: 'var(--spacing-md)' }}
            onClick={() => route('/')}
          >
            返回
          </button>
        </div>
      </Layout>
    )
  }

  if (step === 'time' && slots) {
    if (slots.slots.length === 0) {
      return (
        <Layout currentPath="/book">
          <EmptyState
            title={slots.reasonText || '该日期没有可用时间'}
            action={{
              text: '返回选择日期',
              onClick: () => setStep('date'),
            }}
          />
        </Layout>
      )
    }

    return (
      <Layout currentPath="/book">
        <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <div>
              <h1 style={{ 
                fontSize: 'var(--font-size-2xl)', 
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text)',
                marginBottom: '4px',
              }}>
                选择时间
              </h1>
              <div style={{ 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}>
                {slots.dateLabel}
              </div>
            </div>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              2/3
            </div>
          </div>

          {error && <InfoBox type="danger" message={error} />}

          <div class="card" style={{ padding: 'var(--spacing-sm)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 'var(--spacing-sm)',
            }}>
              {slots.slots.map((slot) => (
                <button
                  key={slot.startAt}
                  onClick={() => {
                    setSelectedSlot(slot)
                    setStep('confirm')
                  }}
                  style={{
                    padding: 'var(--spacing-md)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                    minHeight: 'var(--tap-target-min)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-md)',
                    color: 'var(--color-text)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-primary-light)'
                    e.currentTarget.style.borderColor = 'var(--color-primary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  {slot.timeRange}
                </button>
              ))}
            </div>
          </div>

          <button
            class="button button-secondary"
            style={{ marginTop: 'var(--spacing-md)' }}
            onClick={() => setStep('date')}
          >
            返回
          </button>
        </div>
      </Layout>
    )
  }

  if (step === 'confirm' && selectedSlot && slots) {
    return (
      <Layout currentPath="/book">
        <div class="container" style={{ paddingTop: 'var(--spacing-md)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-lg)',
          }}>
            <h1 style={{ 
              fontSize: 'var(--font-size-2xl)', 
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
            }}>
              确认预约
            </h1>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
            }}>
              3/3
            </div>
          </div>

          {error && <InfoBox type="danger" message={error} />}

          <div class="card">
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ 
                fontWeight: 'var(--font-weight-medium)', 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-xs)',
              }}>
                日期
              </div>
              <div style={{ 
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-semibold)',
              }}>
                {slots.dateLabel}
              </div>
            </div>

            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ 
                fontWeight: 'var(--font-weight-medium)', 
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--spacing-xs)',
              }}>
                时间
              </div>
              <div style={{ 
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-semibold)',
              }}>
                {selectedSlot.timeRange}
              </div>
            </div>

            {rescheduleBookingId && (
              <InfoBox
                type="warning"
                title="改期提示"
                message="此操作可能会根据取消政策扣除课时"
              />
            )}
          </div>

          <button
            class="button"
            style={{ marginTop: 'var(--spacing-md)' }}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? '提交中...' : (rescheduleBookingId ? '确认改期' : '确认预约')}
          </button>

          <button
            class="button button-secondary"
            style={{ marginTop: 'var(--spacing-sm)' }}
            onClick={() => setStep('time')}
            disabled={submitting}
          >
            返回
          </button>
        </div>
      </Layout>
    )
  }

  return null
}
