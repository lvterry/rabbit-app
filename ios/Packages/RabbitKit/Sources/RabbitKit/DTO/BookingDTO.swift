import Foundation

// MARK: - Booking

/// Booking entity matching fixtures/bookings/*.json
public struct Booking: Codable, Identifiable {
    public let bookingId: String
    public let teacherId: String
    public let teacherName: String
    public let studentId: String
    public let studentName: String
    public let courseId: String
    public let courseName: String
    public let durationMinutes: Int
    public let packageId: String
    
    // Time fields - server provides both UTC and local display strings
    public let startAt: String  // ISO8601 UTC
    public let endAt: String    // ISO8601 UTC
    public let date: String     // YYYY-MM-DD
    public let dateLabel: String    // Server-formatted display label
    public let startLocal: String   // Server-formatted local time
    public let endLocal: String     // Server-formatted local time
    public let timeRange: String    // Server-formatted time range
    
    // Status and metadata
    public let status: BookingStatus
    public let source: BookingSource
    public let sourceLabel: String
    
    // Cancellation
    public let cancelledAt: String?
    public let cancelledBy: String?
    public let cancelledByLabel: String?
    public let cancellationPolicyResult: String?
    public let policyText: String?
    public let consumedSession: Bool
    public let policySnapshotFreeCancelHours: Int
    
    // Reschedule
    public let rescheduledFromBookingId: String?
    public let rescheduledToBookingId: String?
    public let rescheduleCount: Int
    public let maxReschedules: Int
    
    // Settlement
    public let settledAt: String?
    public let sessionStatus: String?
    public let sessionSource: String?
    public let sessionSourceLabel: String?
    
    public let createdAt: String
    public let started: Bool
    
    // Balance (teacher view only, null for student view)
    public let remaining: Int?
    public let reserved: Int?
    public let available: Int?
    
    // Actions - server-calculated permissions
    public let actions: BookingActions
    
    public var id: String { bookingId }
}

public enum BookingStatus: String, Codable {
    case Upcoming
    case Completed
    case Cancelled
}

public enum BookingSource: String, Codable {
    case TeacherCreated
    case SelfBooked
}

public struct BookingActions: Codable {
    public let canComplete: Bool
    public let canMarkNoShow: Bool
    public let canCancel: Bool
    public let canReschedule: Bool
    public let rescheduleLimitReached: Bool
    public let canUndoComplete: Bool
    public let undoDeadline: String?
}

// MARK: - Teacher Day View

/// Teacher's daily view (T01 Today page)
/// Decodes both the full shared TeacherDayView shape and the slim
/// `{ date, bookings }` envelope currently returned by GET /v1/me/teacher-day.
public struct TeacherDayView: Codable {
    public let date: String
    public let isToday: Bool
    public let dateLabel: String
    public let todayCount: Int
    public let completedCount: Int
    public let next: Booking?
    public let bookings: [Booking]
    public let pending: [Booking]
    public let hints: [String]

    enum CodingKeys: String, CodingKey {
        case date, isToday, dateLabel, todayCount, completedCount, next, bookings, pending, hints
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decode(String.self, forKey: .date)
        bookings = try c.decodeIfPresent([Booking].self, forKey: .bookings) ?? []
        isToday = try c.decodeIfPresent(Bool.self, forKey: .isToday) ?? true
        dateLabel = try c.decodeIfPresent(String.self, forKey: .dateLabel) ?? date
        todayCount = try c.decodeIfPresent(Int.self, forKey: .todayCount) ?? bookings.count
        completedCount = try c.decodeIfPresent(Int.self, forKey: .completedCount)
            ?? bookings.filter { $0.status == .Completed }.count
        next = try c.decodeIfPresent(Booking.self, forKey: .next)
        pending = try c.decodeIfPresent([Booking].self, forKey: .pending) ?? []
        hints = try c.decodeIfPresent([String].self, forKey: .hints) ?? []
    }
}

// MARK: - Teacher Calendar View

/// Teacher's calendar view (T02 Calendar page)
public struct TeacherCalendarView: Codable {
    public let from: String
    public let to: String
    public let courseId: String?
    public let courses: [Course]
    public let days: [CalendarDay]
}

public struct CalendarDay: Codable, Identifiable {
    public let date: String
    public let weekdayLabel: String
    public let dayOfMonth: Int
    public let isToday: Bool
    public let bookingCount: Int
    public let slotCount: Int
    public let bookings: [Booking]
    
    public var id: String { date }
}
