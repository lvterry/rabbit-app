/**
 * Response Envelope Tests
 * 
 * Tests API response envelope format per impl-guide.md §6
 */

import { describe, it, expect } from 'vitest'
import { createSuccessEnvelope, createErrorEnvelope } from '../../src/http/envelope'
import { ErrorCode } from '@rabbit/shared'

describe('HTTP - Success Envelope', () => {
  it('creates success envelope with data and metadata', () => {
    const data = { userId: 'user-123', name: 'Test User' }
    const requestId = 'req_test123'

    const envelope = createSuccessEnvelope(data, requestId)

    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual(data)
    expect(envelope.meta.requestId).toBe(requestId)
    expect(envelope.meta.generatedAt).toBeTruthy()
    expect(new Date(envelope.meta.generatedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })
})

describe('HTTP - Error Envelope', () => {
  it('creates error envelope with code and default message', () => {
    const envelope = createErrorEnvelope(ErrorCode.SLOT_TAKEN, undefined, undefined, 'req_test')

    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe(ErrorCode.SLOT_TAKEN)
    expect(envelope.message).toBe('这个时间刚被预约了，请选择其他时间。')
    expect(envelope.retryable).toBe(false)
    expect(envelope.details).toBeNull()
    expect(envelope.requestId).toBe('req_test')
  })

  it('creates error envelope with custom message', () => {
    const customMessage = 'Custom error message'
    const envelope = createErrorEnvelope(ErrorCode.VALIDATION_FAILED, customMessage, null, 'req_test')

    expect(envelope.message).toBe(customMessage)
  })

  it('creates error envelope with details', () => {
    const details = { field: 'email', reason: 'invalid format' }
    const envelope = createErrorEnvelope(ErrorCode.VALIDATION_FAILED, undefined, details, 'req_test')

    expect(envelope.details).toEqual(details)
  })

  it('marks retryable errors correctly', () => {
    const retryable = createErrorEnvelope(ErrorCode.NETWORK_ERROR)
    expect(retryable.retryable).toBe(true)

    const notRetryable = createErrorEnvelope(ErrorCode.SLOT_TAKEN)
    expect(notRetryable.retryable).toBe(false)
  })
})
