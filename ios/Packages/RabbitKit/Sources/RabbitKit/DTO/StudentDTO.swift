import Foundation

// MARK: - Student

/// Student entity
public struct Student: Codable, Identifiable {
    public let studentId: String
    public let name: String
    public let contact: String?
    public let status: StudentStatus
    public let bound: Bool
    public let boundName: String?
    public let boundEmail: String?
    public let boundAt: String?
    
    public var id: String { studentId }
}

public enum StudentStatus: String, Codable {
    case Active
    case Inactive
}

// MARK: - Student Detail

/// Teacher's view of student detail (T06)
public struct StudentDetailView: Codable {
    public let student: Student
    public let courses: [StudentCourse]
    public let packages: [Package]
    public let transactions: [Transaction]
    public let upcoming: [Booking]
    public let history: [Booking]
    public let invite: Invite?
}

public struct StudentCourse: Codable, Identifiable {
    public let courseId: String
    public let courseName: String
    public let durationMinutes: Int
    public let courseStatus: String
    public let remaining: Int
    public let reserved: Int
    public let available: Int
    
    public var id: String { courseId }
    
    public init(courseId: String, courseName: String, durationMinutes: Int, courseStatus: String, remaining: Int, reserved: Int, available: Int) {
        self.courseId = courseId
        self.courseName = courseName
        self.durationMinutes = durationMinutes
        self.courseStatus = courseStatus
        self.remaining = remaining
        self.reserved = reserved
        self.available = available
    }
}

// MARK: - Student List

/// Students list for teacher (T05)
public struct StudentListView: Codable {
    public let students: [StudentSummary]
    public let stats: StudentStats
}

public struct StudentSummary: Codable, Identifiable {
    public let studentId: String
    public let name: String
    public let contact: String?
    public let status: StudentStatus
    public let bound: Bool
    public let boundAt: String?
    public let courseSummaries: [CourseSummary]
    public let remainingTotal: Int
    public let nextBooking: Booking?
    
    public var id: String { studentId }
}

public struct CourseSummary: Codable {
    public let courseId: String
    public let courseName: String
    public let remaining: Int
    public let reserved: Int
    public let available: Int
}

public struct StudentStats: Codable {
    public let total: Int
    public let unbound: Int
    public let active: Int
}

// MARK: - Student Home (Web, for reference)

/// Student's home view (S01)
public struct StudentHomeView: Codable {
    public let cards: [TeacherCard]
    public let bound: Bool
}

public struct TeacherCard: Codable, Identifiable {
    public let teacherId: String
    public let teacherName: String
    public let teacherAvatarUrl: String?
    public let studentId: String
    public let studentName: String
    public let courses: [StudentCourseCard]
    public let remainingTotal: Int
    
    public var id: String { teacherId }
}

public struct StudentCourseCard: Codable, Identifiable {
    public let courseId: String
    public let courseName: String
    public let durationMinutes: Int
    public let allowSelfBooking: Bool
    public let remaining: Int
    public let purchased: Int?
    public let batchCount: Int
    public let available: Int
    public let exhausted: Bool
    public let fullyReserved: Bool
    public let nextBooking: Booking?
    
    public var id: String { courseId }
}
