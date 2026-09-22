import Foundation

// MARK: - Invite

/// Invite entity
public struct Invite: Codable, Identifiable {
    public let inviteId: String
    public let token: String
    public let url: String
    public let expiresAt: String
    public let expiresLabel: String
    public let studentName: String
    public let status: InviteStatus?
    
    public var id: String { inviteId }
}

public enum InviteStatus: String, Codable {
    case Pending
    case Consumed
    case Expired
    case Revoked
}

// MARK: - Invite Preview

/// Invite preview (before accepting)
public struct InvitePreview: Codable {
    public let teacher: InviteTeacher
    public let studentName: String
    public let courses: [InviteCourse]
    public let expiresAt: String
}

public struct InviteTeacher: Codable {
    public let teacherId: String
    public let name: String
    public let avatarUrl: String?
}

public struct InviteCourse: Codable, Identifiable {
    public let courseId: String
    public let courseName: String
    public let remaining: Int
    
    public var id: String { courseId }
}
