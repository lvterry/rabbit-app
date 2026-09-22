import Foundation

// MARK: - Teacher Profile

/// Teacher profile
public struct Teacher: Codable, Identifiable {
    public let teacherId: String
    public let userId: String
    public let name: String
    public let avatarUrl: String?
    public let bio: String?
    
    // Booking rules (snapshots for new bookings)
    public let slotStepMinutes: Int
    public let minLeadHours: Int
    public let maxAdvanceDays: Int
    public let freeCancelHours: Int
    public let autoSettleHours: Int
    public let undoCompleteDays: Int
    public let maxReschedules: Int
    
    public let createdAt: String
    
    public var id: String { teacherId }
}

// MARK: - Teacher Profile Response

/// GET /v1/me/teacher response
public struct TeacherProfileView: Codable {
    public let teacher: Teacher
    public let ruleOptions: RuleOptions
}

/// Available rule options (from server, not hardcoded)
public struct RuleOptions: Codable {
    public let slotStepMinutes: [Int]
    public let minLeadHours: [Int]
    public let maxAdvanceDays: [Int]
    public let freeCancelHours: [Int]
    public let autoSettleHours: [Int]
}

// MARK: - Auth / Me

/// Current user info
public struct MeView: Codable {
    public let user: User
    public let isTeacher: Bool
    public let teacher: Teacher?
    public let students: [StudentBinding]
}

public struct User: Codable, Identifiable {
    public let userId: String
    public let nickname: String?
    public let avatarUrl: String?
    
    public var id: String { userId }
}

public struct StudentBinding: Codable {
    public let teacherId: String
    public let teacherName: String
    public let teacherAvatarUrl: String?
    public let studentId: String
    public let studentName: String
}
