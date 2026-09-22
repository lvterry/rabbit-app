import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { BookableDaysResponse, SlotsResponse, SlotView } from '@rabbit/shared'
import { ErrorCode } from '@rabbit/shared'
import * as api from '../api/client'

interface BookRouteProps {
  path: string
}

type Step = 'date' | 'time' | 'confirm'

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

    route('/', true)
  }

  if (!teacherId || !courseId) {
    return (
      <div class="container" style={{ paddingTop: '40px' }}>
        <div class="error">缺少必要参数</div>
        <button class="button" onClick={() => route('/')}>
          返回首页
        </button>
      </div>
    )
  }

  if (loading && !bookableDays && !slots) {
    return (
      <div class="container">
        <div class="loading">加载中...</div>
      </div>
    )
  }

  if (error && !bookableDays && !slots) {
    return (
      <div class="container" style={{ paddingTop: '40px' }}>
        <div class="error">{error}</div>
        <button class="button" onClick={() => route('/')}>
          返回首页
        </button>
      </div>
    )
  }

  if (step === 'date' && bookableDays) {
    if (bookableDays.days.length === 0) {
      return (
        <div class="container" style={{ paddingTop: '40px' }}>
          <div class="empty-state">
            <div class="empty-state-title">
              {bookableDays.reasonText || '老师近期还没有开放时间'}
            </div>
            <div class="text-secondary">请联系老师</div>
          </div>
          <button class="button" onClick={() => route('/')}>
            返回首页
          </button>
        </div>
      )
    }

    return (
      <div class="container" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: '16px' }}>
          选择日期
        </h1>

        {error && <div class="error">{error}</div>}

        <div class="card">
          {bookableDays.days.map((day) => (
            <button
              key={day.date}
              class="list-item"
              style={{
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                border: 'none',
              }}
              onClick={() => {
                setSelectedDate(day.date)
                loadSlots(day.date)
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{day.dateLabel}</div>
                <div class="text-secondary">{day.weekdayLabel}</div>
              </div>
              <div class="text-secondary">
                {day.slotCount} 个可选时间
              </div>
            </button>
          ))}
        </div>

        <button
          class="button button-secondary"
          style={{ marginTop: '16px' }}
          onClick={() => route('/')}
        >
          返回
        </button>
      </div>
    )
  }

  if (step === 'time' && slots) {
    if (slots.slots.length === 0) {
      return (
        <div class="container" style={{ paddingTop: '40px' }}>
          <div class="empty-state">
            <div class="empty-state-title">
              {slots.reasonText || '该日期没有可用时间'}
            </div>
          </div>
          <button class="button" onClick={() => setStep('date')}>
            返回选择日期
          </button>
        </div>
      )
    }

    return (
      <div class="container" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: '16px' }}>
          选择时间
        </h1>

        <div style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
          {slots.dateLabel}
        </div>

        {error && <div class="error">{error}</div>}

        <div class="card">
          {slots.slots.map((slot) => (
            <button
              key={slot.startAt}
              class="list-item"
              style={{
                justifyContent: 'center',
                width: '100%',
                textAlign: 'center',
                border: 'none',
                fontWeight: 600,
              }}
              onClick={() => {
                setSelectedSlot(slot)
                setStep('confirm')
              }}
            >
              {slot.timeRange}
            </button>
          ))}
        </div>

        <button
          class="button button-secondary"
          style={{ marginTop: '16px' }}
          onClick={() => setStep('date')}
        >
          返回
        </button>
      </div>
    )
  }

  if (step === 'confirm' && selectedSlot && slots) {
    return (
      <div class="container" style={{ paddingTop: '16px', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: '16px' }}>
          确认预约
        </h1>

        {error && <div class="error">{error}</div>}

        <div class="card">
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>日期</div>
            <div>{slots.dateLabel}</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>时间</div>
            <div>{selectedSlot.timeRange}</div>
          </div>

          {rescheduleBookingId && (
            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(255, 149, 0, 0.1)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              fontSize: 'var(--font-size-sm)',
            }}>
              注意：改期操作可能会根据政策扣除课时
            </div>
          )}
        </div>

        <button
          class="button"
          style={{ marginTop: '16px' }}
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? '提交中...' : '确认预约'}
        </button>

        <button
          class="button button-secondary"
          style={{ marginTop: '8px' }}
          onClick={() => setStep('time')}
          disabled={submitting}
        >
          返回
        </button>
      </div>
    )
  }

  return null
}
