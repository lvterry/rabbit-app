import Foundation

// MARK: - Course

/// Course entity
public struct Course: Codable, Identifiable {
    public let courseId: String
    public let name: String
    public let durationMinutes: Int
    public let allowSelfBooking: Bool
    public let status: CourseStatus
    
    public var id: String { courseId }
}

public enum CourseStatus: String, Codable {
    case Active
    case Archived
}

// MARK: - Courses List

/// List of courses
public struct CoursesListView: Codable {
    public let courses: [Course]
}
