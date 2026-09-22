import Foundation

// MARK: - Slot

/// Time slot for booking
public struct Slot: Codable, Identifiable {
    public let startAt: String  // ISO8601 UTC
    public let endAt: String    // ISO8601 UTC
    public let startLocal: String   // Server-formatted local time
    public let endLocal: String     // Server-formatted local time
    public let timeRange: String    // Server-formatted display
    public let label: String        // Display label
    
    public var id: String { startAt }
    
    public init(startAt: String, endAt: String, startLocal: String, endLocal: String, timeRange: String, label: String) {
        self.startAt = startAt
        self.endAt = endAt
        self.startLocal = startLocal
        self.endLocal = endLocal
        self.timeRange = timeRange
        self.label = label
    }
}

// MARK: - Slots Response

/// Available slots for a specific day
public struct SlotsView: Codable {
    public let date: String
    public let dateLabel: String
    public let timezone: String
    public let generatedAt: String
    public let reason: SlotUnavailableReason?
    public let reasonText: String?
    public let slots: [Slot]
    public let balance: Balance
}

public enum SlotUnavailableReason: String, Codable {
    case NO_AVAILABILITY
    case FULLY_BOOKED
    case INSUFFICIENT_SESSIONS
    case SELF_BOOKING_DISABLED
    case COURSE_ARCHIVED
}

// MARK: - Bookable Days

/// Days with available slots
public struct BookableDaysView: Codable {
    public let timezone: String
    public let generatedAt: String
    public let reason: SlotUnavailableReason?
    public let reasonText: String?
    public let days: [BookableDay]
    public let balance: Balance
}

public struct BookableDay: Codable, Identifiable {
    public let date: String
    public let dateLabel: String
    public let weekday: Int
    public let weekdayLabel: String
    public let slotCount: Int
    
    public var id: String { date }
}
