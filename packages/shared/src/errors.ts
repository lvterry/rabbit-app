/**
 * Rabbit Error Codes
 * Canonical error codes from slot-algorithm.md §6.5
 */

export enum ErrorCode {
  // Slot & Booking conflicts
  SLOT_TAKEN = 'SLOT_TAKEN',
  INSUFFICIENT_SESSIONS = 'INSUFFICIENT_SESSIONS',
  BALANCE_GUARD_FAILED = 'BALANCE_GUARD_FAILED',
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
  BOOKING_NOT_UPCOMING = 'BOOKING_NOT_UPCOMING',
  LATE_RESCHEDULE_INSUFFICIENT = 'LATE_RESCHEDULE_INSUFFICIENT',

  // Slot validation
  SLOT_OUTSIDE_AVAILABILITY = 'SLOT_OUTSIDE_AVAILABILITY',
  SLOT_IN_EXCEPTION = 'SLOT_IN_EXCEPTION',
  SLOT_TOO_SOON = 'SLOT_TOO_SOON',
  SLOT_TOO_FAR = 'SLOT_TOO_FAR',

  // Business rules
  SELF_BOOKING_DISABLED = 'SELF_BOOKING_DISABLED',
  STUDENT_INACTIVE = 'STUDENT_INACTIVE',
  COURSE_ARCHIVED = 'COURSE_ARCHIVED',
  ALREADY_STARTED = 'ALREADY_STARTED',

  // Authorization
  NOT_BOUND_TO_TEACHER = 'NOT_BOUND_TO_TEACHER',
  RESCHEDULE_LIMIT_REACHED = 'RESCHEDULE_LIMIT_REACHED',
  UNDO_WINDOW_EXPIRED = 'UNDO_WINDOW_EXPIRED',
  FORBIDDEN = 'FORBIDDEN',

  // Authentication
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Invites
  INVITE_NOT_FOUND = 'INVITE_NOT_FOUND',
  INVITE_EXPIRED = 'INVITE_EXPIRED',
  INVITE_CONSUMED = 'INVITE_CONSUMED',
  INVITE_REVOKED = 'INVITE_REVOKED',

  // System
  BOOKING_BUSY = 'BOOKING_BUSY',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  CLIENT_TOO_OLD = 'CLIENT_TOO_OLD',
  INTERNAL = 'INTERNAL',

  // Client-only (not from server)
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export type ErrorCodeType = keyof typeof ErrorCode

export type ErrorInfo = {
  code: ErrorCode
  httpStatus: number
  message: string
  retryable: boolean
}

/**
 * Error code metadata mapping
 * HTTP status, default message, and retry guidance
 */
export const errorCodeMap: Record<ErrorCode, ErrorInfo> = {
  [ErrorCode.SLOT_TAKEN]: {
    code: ErrorCode.SLOT_TAKEN,
    httpStatus: 409,
    message: '这个时间刚被预约了，请选择其他时间。',
    retryable: false,
  },
  [ErrorCode.INSUFFICIENT_SESSIONS]: {
    code: ErrorCode.INSUFFICIENT_SESSIONS,
    httpStatus: 409,
    message: '剩余课时不足，请联系老师续课。',
    retryable: false,
  },
  [ErrorCode.BALANCE_GUARD_FAILED]: {
    code: ErrorCode.BALANCE_GUARD_FAILED,
    httpStatus: 409,
    message: '课时余额调整失败，请刷新后重试。',
    retryable: false,
  },
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: {
    code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
    httpStatus: 409,
    message: '请求冲突，请重新操作。',
    retryable: false,
  },
  [ErrorCode.BOOKING_NOT_UPCOMING]: {
    code: ErrorCode.BOOKING_NOT_UPCOMING,
    httpStatus: 409,
    message: '预约状态已变更，请刷新后重试。',
    retryable: false,
  },
  [ErrorCode.LATE_RESCHEDULE_INSUFFICIENT]: {
    code: ErrorCode.LATE_RESCHEDULE_INSUFFICIENT,
    httpStatus: 409,
    message: '本次改期已超过免费期限，需要额外消耗 1 节课。当前剩余课时不足，请先联系老师。',
    retryable: false,
  },
  [ErrorCode.SLOT_OUTSIDE_AVAILABILITY]: {
    code: ErrorCode.SLOT_OUTSIDE_AVAILABILITY,
    httpStatus: 422,
    message: '所选时间不在开放时间内。',
    retryable: false,
  },
  [ErrorCode.SLOT_IN_EXCEPTION]: {
    code: ErrorCode.SLOT_IN_EXCEPTION,
    httpStatus: 422,
    message: '所选时间已被临时关闭。',
    retryable: false,
  },
  [ErrorCode.SLOT_TOO_SOON]: {
    code: ErrorCode.SLOT_TOO_SOON,
    httpStatus: 422,
    message: '预约时间太近，请选择更远的时间。',
    retryable: false,
  },
  [ErrorCode.SLOT_TOO_FAR]: {
    code: ErrorCode.SLOT_TOO_FAR,
    httpStatus: 422,
    message: '预约时间太远，请选择更近的时间。',
    retryable: false,
  },
  [ErrorCode.SELF_BOOKING_DISABLED]: {
    code: ErrorCode.SELF_BOOKING_DISABLED,
    httpStatus: 422,
    message: '该课程需要联系老师安排。',
    retryable: false,
  },
  [ErrorCode.STUDENT_INACTIVE]: {
    code: ErrorCode.STUDENT_INACTIVE,
    httpStatus: 422,
    message: '学员账户未激活，请联系老师。',
    retryable: false,
  },
  [ErrorCode.COURSE_ARCHIVED]: {
    code: ErrorCode.COURSE_ARCHIVED,
    httpStatus: 422,
    message: '课程已归档，无法预约。',
    retryable: false,
  },
  [ErrorCode.ALREADY_STARTED]: {
    code: ErrorCode.ALREADY_STARTED,
    httpStatus: 422,
    message: '课程已开始，请联系老师确认。',
    retryable: false,
  },
  [ErrorCode.NOT_BOUND_TO_TEACHER]: {
    code: ErrorCode.NOT_BOUND_TO_TEACHER,
    httpStatus: 403,
    message: '无权访问该资源，请使用邀请链接进入。',
    retryable: false,
  },
  [ErrorCode.RESCHEDULE_LIMIT_REACHED]: {
    code: ErrorCode.RESCHEDULE_LIMIT_REACHED,
    httpStatus: 403,
    message: '已达到改期次数上限，请联系老师。',
    retryable: false,
  },
  [ErrorCode.UNDO_WINDOW_EXPIRED]: {
    code: ErrorCode.UNDO_WINDOW_EXPIRED,
    httpStatus: 403,
    message: '撤销窗口已关闭。',
    retryable: false,
  },
  [ErrorCode.FORBIDDEN]: {
    code: ErrorCode.FORBIDDEN,
    httpStatus: 403,
    message: '无权访问该资源。',
    retryable: false,
  },
  [ErrorCode.UNAUTHENTICATED]: {
    code: ErrorCode.UNAUTHENTICATED,
    httpStatus: 401,
    message: '请重新登录。',
    retryable: false,
  },
  [ErrorCode.TOKEN_EXPIRED]: {
    code: ErrorCode.TOKEN_EXPIRED,
    httpStatus: 401,
    message: '登录已过期，请重新登录。',
    retryable: true,
  },
  [ErrorCode.INVITE_NOT_FOUND]: {
    code: ErrorCode.INVITE_NOT_FOUND,
    httpStatus: 404,
    message: '邀请不存在，请联系老师重新发送。',
    retryable: false,
  },
  [ErrorCode.INVITE_EXPIRED]: {
    code: ErrorCode.INVITE_EXPIRED,
    httpStatus: 410,
    message: '邀请已过期，请联系老师重新发送。',
    retryable: false,
  },
  [ErrorCode.INVITE_CONSUMED]: {
    code: ErrorCode.INVITE_CONSUMED,
    httpStatus: 410,
    message: '该邀请已被使用，请联系老师重新发送。',
    retryable: false,
  },
  [ErrorCode.INVITE_REVOKED]: {
    code: ErrorCode.INVITE_REVOKED,
    httpStatus: 410,
    message: '邀请已失效，请联系老师重新发送。',
    retryable: false,
  },
  [ErrorCode.BOOKING_BUSY]: {
    code: ErrorCode.BOOKING_BUSY,
    httpStatus: 409,
    message: '系统繁忙，请重试。',
    retryable: true,
  },
  [ErrorCode.VALIDATION_FAILED]: {
    code: ErrorCode.VALIDATION_FAILED,
    httpStatus: 422,
    message: '请求数据格式不正确。',
    retryable: false,
  },
  [ErrorCode.RATE_LIMITED]: {
    code: ErrorCode.RATE_LIMITED,
    httpStatus: 429,
    message: '请求过于频繁，请稍后再试。',
    retryable: true,
  },
  [ErrorCode.CLIENT_TOO_OLD]: {
    code: ErrorCode.CLIENT_TOO_OLD,
    httpStatus: 426,
    message: '客户端版本过低，请升级应用。',
    retryable: false,
  },
  [ErrorCode.INTERNAL]: {
    code: ErrorCode.INTERNAL,
    httpStatus: 500,
    message: '服务器错误，请稍后重试。',
    retryable: true,
  },
  [ErrorCode.NETWORK_ERROR]: {
    code: ErrorCode.NETWORK_ERROR,
    httpStatus: 0,
    message: '网络连接失败，请检查网络后重试。',
    retryable: true,
  },
}

/**
 * Get error info by code
 */
export function getErrorInfo(code: ErrorCode): ErrorInfo {
  return errorCodeMap[code]
}

/**
 * Get HTTP status for error code
 */
export function getErrorHttpStatus(code: ErrorCode): number {
  return errorCodeMap[code].httpStatus
}

/**
 * Check if error is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  return errorCodeMap[code].retryable
}

/**
 * Get default message for error code
 */
export function getErrorMessage(code: ErrorCode): string {
  return errorCodeMap[code].message
}
