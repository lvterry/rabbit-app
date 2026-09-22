import Foundation

// MARK: - Availability

/// Availability rules and exceptions
public struct AvailabilityView: Codable {
    public let rules: [AvailabilityRule]
    public let byWeekday: [String: [AvailabilityRule]]
    public let weekdayLabels: [String]
    public let exceptions: [AvailabilityException]
}

/// Weekly availability rule
public struct AvailabilityRule: Codable, Identifiable {
    public let ruleId: String
    public let weekday: Int  // 1-7 (Monday-Sunday)
    public let startMinute: Int
    public let endMinute: Int
    public let status: String?
    
    public var id: String { ruleId }
}

/// Exception (temporary closure)
public struct AvailabilityException: Codable, Identifiable {
    public let exceptionId: String
    public let onDate: String
    public let wholeDay: Bool
    public let startMinute: Int?
    public let endMinute: Int?
    public let reason: String?
    public let rangeLabel: String
    
    public var id: String { exceptionId }
}
