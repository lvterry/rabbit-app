import Foundation

// MARK: - Course Repository Protocol

public protocol CourseRepositoryProtocol {
    func courses(includeArchived: Bool) async throws -> [Course]
    func createCourse(name: String, durationMinutes: Int, allowSelfBooking: Bool) async throws -> Course
    func updateCourse(id: String, name: String?, durationMinutes: Int?, allowSelfBooking: Bool?) async throws -> Course
    func updateCourseStatus(id: String, status: CourseStatus) async throws -> Course
}

// MARK: - Course Repository Implementation

public actor CourseRepository: CourseRepositoryProtocol {
    private let client: HTTPClient
    
    public init(client: HTTPClient) {
        self.client = client
    }
    
    public func courses(includeArchived: Bool = false) async throws -> [Course] {
        let queryItems = [
            URLQueryItem(name: "includeArchived", value: includeArchived ? "true" : "false")
        ]
        
        let response: CoursesListView = try await client.get(.courses, queryItems: queryItems)
        return response.courses
    }
    
    public func createCourse(
        name: String,
        durationMinutes: Int,
        allowSelfBooking: Bool = true
    ) async throws -> Course {
        struct CreateCourseRequest: Encodable {
            let name: String
            let durationMinutes: Int
            let allowSelfBooking: Bool
        }
        
        struct CreateCourseResponse: Decodable {
            let course: Course
        }
        
        let request = CreateCourseRequest(
            name: name,
            durationMinutes: durationMinutes,
            allowSelfBooking: allowSelfBooking
        )
        
        let response: CreateCourseResponse = try await client.post(.courses, body: request)
        return response.course
    }
    
    public func updateCourse(
        id: String,
        name: String? = nil,
        durationMinutes: Int? = nil,
        allowSelfBooking: Bool? = nil
    ) async throws -> Course {
        struct UpdateCourseRequest: Encodable {
            let name: String?
            let durationMinutes: Int?
            let allowSelfBooking: Bool?
        }
        
        struct UpdateCourseResponse: Decodable {
            let course: Course
        }
        
        let request = UpdateCourseRequest(
            name: name,
            durationMinutes: durationMinutes,
            allowSelfBooking: allowSelfBooking
        )
        
        let response: UpdateCourseResponse = try await client.patch(.course(id), body: request)
        return response.course
    }
    
    public func updateCourseStatus(id: String, status: CourseStatus) async throws -> Course {
        struct UpdateStatusRequest: Encodable {
            let status: CourseStatus
        }
        
        struct UpdateStatusResponse: Decodable {
            let course: Course
        }
        
        let request = UpdateStatusRequest(status: status)
        let response: UpdateStatusResponse = try await client.post(.courseStatus(id), body: request)
        return response.course
    }
}

// MARK: - Mock Repository

public final class MockCourseRepository: CourseRepositoryProtocol {
    private let courses: [Course]
    
    public init(courses: [Course] = []) {
        self.courses = courses
    }
    
    public func courses(includeArchived: Bool) async throws -> [Course] {
        return courses
    }
    
    public func createCourse(name: String, durationMinutes: Int, allowSelfBooking: Bool) async throws -> Course {
        throw RabbitAPIError.networkError
    }
    
    public func updateCourse(id: String, name: String?, durationMinutes: Int?, allowSelfBooking: Bool?) async throws -> Course {
        throw RabbitAPIError.networkError
    }
    
    public func updateCourseStatus(id: String, status: CourseStatus) async throws -> Course {
        throw RabbitAPIError.networkError
    }
}
