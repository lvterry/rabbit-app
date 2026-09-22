/**
 * Slot Algorithm Test Vectors (slot-algorithm.md §5)
 * 
 * These tests verify the computeSlots algorithm against the 20 reference vectors
 * specified in the documentation. All vectors use:
 * - timezone: Asia/Shanghai (UTC+8)
 * - base date D: 2026-03-03 (Tuesday, weekday=2)
 * - now: 2026-02-20T00:00:00Z (10 days before D)
 * - minLeadHours: 0, maxAdvanceDays: 60 (unless noted)
 * - rules: Tuesday 14:00–18:00 (unless noted)
 * - duration: 60, step: 30 (unless noted)
 * - busy: empty (unless noted)
 */

import { describe, it, expect } from 'vitest'
import { computeSlots } from '../api/src/domain/slot'

const BASE_DATE = '2026-03-03'
const NOW = new Date('2026-02-20T00:00:00Z')
const TIMEZONE = 'Asia/Shanghai'

describe('Slot Algorithm Vectors (slot-algorithm.md §5)', () => {
  it('V1: baseline case', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
    ])
  })

  it('V2: busy 15:00–16:00', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const busy = [{
      startAt: new Date('2026-03-03T07:00:00Z'),
      endAt: new Date('2026-03-03T08:00:00Z'),
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '16:00', '16:30', '17:00'
    ])
  })

  it('V3: same as V2 but step=60', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const busy = [{
      startAt: new Date('2026-03-03T07:00:00Z'),
      endAt: new Date('2026-03-03T08:00:00Z'),
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 60,
      stepMinutes: 60,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual(['14:00', '16:00', '17:00'])
  })

  it('V4: busy 14:00–15:00 and 16:00–17:00', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const busy = [
      {
        startAt: new Date('2026-03-03T06:00:00Z'),
        endAt: new Date('2026-03-03T07:00:00Z'),
      },
      {
        startAt: new Date('2026-03-03T08:00:00Z'),
        endAt: new Date('2026-03-03T09:00:00Z'),
      },
    ]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual(['15:00', '17:00'])
  })

  it('V5: duration=90, no busy', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 90,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ])
  })

  it('V6: duration=90, busy 15:00–16:00', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const busy = [{
      startAt: new Date('2026-03-03T07:00:00Z'),
      endAt: new Date('2026-03-03T08:00:00Z'),
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 90,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual(['16:00', '16:30'])
  })

  it('V7: step=15, rules 14:00–16:00', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 960 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 15,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '14:15', '14:30', '14:45', '15:00'
    ])
  })

  it('V8: exception 12:00–14:00, rules 09:00–17:00', () => {
    const rules = [{ weekday: 2, startMinute: 540, endMinute: 1020 }]
    const exceptions = [{
      date: BASE_DATE,
      startMinute: 720,
      endMinute: 840,
      isAllDay: false,
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions,
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00'
    ])
  })

  it('V9: whole day exception', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const exceptions = [{
      date: BASE_DATE,
      startMinute: null,
      endMinute: null,
      isAllDay: true,
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions,
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots).toEqual([])
    expect(slots.reason).toBe('NO_AVAILABILITY')
  })

  it('V10: now=2026-03-03T05:00:00Z (13:00 CST), minLeadHours=2', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const nowSameDay = new Date('2026-03-03T05:00:00Z')

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 2,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: nowSameDay,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '15:00', '15:30', '16:00', '16:30', '17:00'
    ])
  })

  it('V11: maxAdvanceDays=5 (D is 10 days away)', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 5,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots).toEqual([])
    expect(slots.reason).toBe('NO_AVAILABILITY')
  })

  it('V12: rules 14:00–14:45, duration=60 (cannot fit)', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 885 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots).toEqual([])
  })

  it('V13: two rules 09:00–12:00 + 14:00–18:00, step=60', () => {
    const rules = [
      { weekday: 2, startMinute: 540, endMinute: 720 },
      { weekday: 2, startMinute: 840, endMinute: 1080 },
    ]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 60,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'
    ])
  })

  it('V14: busy 14:00–15:00 and 15:00–16:00, verify left-closed right-open', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1020 }]
    const busy = [
      {
        startAt: new Date('2026-03-03T06:00:00Z'),
        endAt: new Date('2026-03-03T07:00:00Z'),
      },
      {
        startAt: new Date('2026-03-03T07:00:00Z'),
        endAt: new Date('2026-03-03T08:00:00Z'),
      },
    ]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 60,
      stepMinutes: 60,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual(['16:00'])
  })

  it('V15: duration=240, rules 09:00–17:00, step=60', () => {
    const rules = [{ weekday: 2, startMinute: 540, endMinute: 1020 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 240,
      stepMinutes: 60,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00'
    ])
  })

  it('V18: duration=15 (< step), rules 14:00–15:00', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 900 }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 15,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual(['14:00', '14:30'])
  })

  it('V19: busy 17:00–18:00 (blocks 16:30)', () => {
    const rules = [{ weekday: 2, startMinute: 840, endMinute: 1080 }]
    const busy = [{
      startAt: new Date('2026-03-03T09:00:00Z'),
      endAt: new Date('2026-03-03T10:00:00Z'),
    }]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy,
      durationMinutes: 60,
      stepMinutes: 30,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '14:30', '15:00', '15:30', '16:00'
    ])
  })

  it('V20: adjacent rules 14:00–16:00 + 16:00–18:00, step=60', () => {
    const rules = [
      { weekday: 2, startMinute: 840, endMinute: 960 },
      { weekday: 2, startMinute: 960, endMinute: 1080 },
    ]

    const slots = computeSlots({
      date: BASE_DATE,
      rules,
      exceptions: [],
      busy: [],
      durationMinutes: 60,
      stepMinutes: 60,
      minLeadHours: 0,
      maxAdvanceDays: 60,
      timezone: TIMEZONE,
      now: NOW,
    })

    expect(slots.map(s => s.startLocal)).toEqual([
      '14:00', '15:00', '16:00', '17:00'
    ])
  })
})
