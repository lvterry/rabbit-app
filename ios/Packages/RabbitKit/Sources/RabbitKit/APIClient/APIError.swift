import Foundation

// MARK: - API Error

/// API error with business error codes
public enum RabbitAPIError: Error, LocalizedError {
    // Network errors (client-side)
    case networkError
    case timeout
    case offline
    case cancelled
    
    // Server errors (from API)
    case serverError(code: String, message: String, retryable: Bool, details: [String: Any]?)
    
    // Client errors
    case invalidResponse
    case decodingError(Error)
    case unknown(Error)
    
    public var errorDescription: String? {
        switch self {
        case .networkError:
            return "网络连接失败，请检查网络设置"
        case .timeout:
            return "请求超时，请稍后重试"
        case .offline:
            return "网络不可用，请检查网络连接"
        case .cancelled:
            return "请求已取消"
        case .serverError(_, let message, _, _):
            return message
        case .invalidResponse:
            return "服务器响应格式错误"
        case .decodingError:
            return "数据解析失败"
        case .unknown:
            return "未知错误"
        }
    }
    
    public var isRetryable: Bool {
        switch self {
        case .networkError, .timeout:
            return true
        case .serverError(_, _, let retryable, _):
            return retryable
        default:
            return false
        }
    }
    
    public var errorCode: String? {
        if case .serverError(let code, _, _, _) = self {
            return code
        }
        return nil
    }
}

// MARK: - Error Code Constants

public enum ErrorCode {
    // Slot conflicts
    public static let slotTaken = "SLOT_TAKEN"
    public static let insufficientSessions = "INSUFFICIENT_SESSIONS"
    public static let balanceGuardFailed = "BALANCE_GUARD_FAILED"
    public static let idempotencyKeyReused = "IDEMPOTENCY_KEY_REUSED"
    public static let bookingNotUpcoming = "BOOKING_NOT_UPCOMING"
    public static let lateRescheduleInsufficient = "LATE_RESCHEDULE_INSUFFICIENT"
    
    // Validation errors
    public static let slotOutsideAvailability = "SLOT_OUTSIDE_AVAILABILITY"
    public static let slotInException = "SLOT_IN_EXCEPTION"
    public static let slotTooSoon = "SLOT_TOO_SOON"
    public static let slotTooFar = "SLOT_TOO_FAR"
    public static let selfBookingDisabled = "SELF_BOOKING_DISABLED"
    public static let courseArchived = "COURSE_ARCHIVED"
    public static let studentInactive = "STUDENT_INACTIVE"
    public static let alreadyStarted = "ALREADY_STARTED"
    
    // Permission errors
    public static let rescheduleLimitReached = "RESCHEDULE_LIMIT_REACHED"
    public static let undoWindowExpired = "UNDO_WINDOW_EXPIRED"
    public static let notBoundToTeacher = "NOT_BOUND_TO_TEACHER"
    
    // Auth errors
    public static let unauthenticated = "UNAUTHENTICATED"
    public static let tokenExpired = "TOKEN_EXPIRED"
    public static let forbidden = "FORBIDDEN"
    
    // Invite errors
    public static let inviteNotFound = "INVITE_NOT_FOUND"
    public static let inviteExpired = "INVITE_EXPIRED"
    public static let inviteConsumed = "INVITE_CONSUMED"
    public static let inviteRevoked = "INVITE_REVOKED"
    
    // System errors
    public static let bookingBusy = "BOOKING_BUSY"
    public static let rateLimited = "RATE_LIMITED"
    public static let validationFailed = "VALIDATION_FAILED"
    public static let clientTooOld = "CLIENT_TOO_OLD"
    public static let internalError = "INTERNAL"
    public static let notImplemented = "NOT_IMPLEMENTED"
}
