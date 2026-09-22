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

    enum CodingKeys: String, CodingKey {
        case inviteId, token, url, expiresAt, expiresLabel, studentName, status
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        inviteId = try c.decode(String.self, forKey: .inviteId)
        token = try c.decode(String.self, forKey: .token)
        url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
        expiresAt = try c.decode(String.self, forKey: .expiresAt)
        // Live list/detail invites omit expiresLabel; contract includes it.
        expiresLabel = try c.decodeIfPresent(String.self, forKey: .expiresLabel) ?? ""
        studentName = try c.decodeIfPresent(String.self, forKey: .studentName) ?? ""
        status = try c.decodeIfPresent(InviteStatus.self, forKey: .status)
    }
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
