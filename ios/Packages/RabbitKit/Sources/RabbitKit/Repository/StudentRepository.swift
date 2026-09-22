import Foundation

// MARK: - Student Repository Protocol

public protocol StudentRepositoryProtocol {
    func students(query: String?, status: StudentStatus?) async throws -> StudentListView
    func studentDetail(id: String) async throws -> StudentDetailView
    func createStudent(name: String, contact: String?, courseId: String?, initialSessions: Int?, note: String?) async throws -> (student: Student, package: Package?, invite: Invite)
    func updateStudent(id: String, name: String?, contact: String?, status: StudentStatus?) async throws -> Student
    func createInvite(studentId: String) async throws -> Invite
    func revokeInvite(inviteId: String) async throws -> Invite
}

// MARK: - Student Repository Implementation

public actor StudentRepository: StudentRepositoryProtocol {
    private let client: HTTPClient
    
    public init(client: HTTPClient) {
        self.client = client
    }
    
    public func students(query: String? = nil, status: StudentStatus? = nil) async throws -> StudentListView {
        var queryItems: [URLQueryItem] = []
        if let query = query {
            queryItems.append(URLQueryItem(name: "q", value: query))
        }
        if let status = status {
            queryItems.append(URLQueryItem(name: "status", value: status.rawValue))
        }
        
        return try await client.get(.students, queryItems: queryItems)
    }
    
    public func studentDetail(id: String) async throws -> StudentDetailView {
        return try await client.get(.student(id))
    }
    
    public func createStudent(
        name: String,
        contact: String? = nil,
        courseId: String? = nil,
        initialSessions: Int? = nil,
        note: String? = nil
    ) async throws -> (student: Student, package: Package?, invite: Invite) {
        struct CreateStudentRequest: Encodable {
            let name: String
            let contact: String?
            let courseId: String?
            let initialSessions: Int?
            let note: String?
        }
        
        struct CreateStudentResponse: Decodable {
            let student: Student
            let package: Package?
            let invite: Invite
        }
        
        let request = CreateStudentRequest(
            name: name,
            contact: contact,
            courseId: courseId,
            initialSessions: initialSessions,
            note: note
        )
        
        let response: CreateStudentResponse = try await client.post(.students, body: request)
        return (response.student, response.package, response.invite)
    }
    
    public func updateStudent(
        id: String,
        name: String? = nil,
        contact: String? = nil,
        status: StudentStatus? = nil
    ) async throws -> Student {
        struct UpdateStudentRequest: Encodable {
            let name: String?
            let contact: String?
            let status: StudentStatus?
        }
        
        struct UpdateStudentResponse: Decodable {
            let student: Student
        }
        
        let request = UpdateStudentRequest(name: name, contact: contact, status: status)
        let response: UpdateStudentResponse = try await client.patch(.student(id), body: request)
        return response.student
    }
    
    public func createInvite(studentId: String) async throws -> Invite {
        struct CreateInviteResponse: Decodable {
            let invite: Invite
        }
        
        let response: CreateInviteResponse = try await client.post(.studentInvites(studentId))
        return response.invite
    }
    
    public func revokeInvite(inviteId: String) async throws -> Invite {
        struct RevokeInviteResponse: Decodable {
            let invite: Invite
        }
        
        let response: RevokeInviteResponse = try await client.post(Endpoint("v1/invites/\(inviteId)/revoke"))
        return response.invite
    }
}

// MARK: - Mock Repository

public final class MockStudentRepository: StudentRepositoryProtocol {
    private let listView: StudentListView?
    private let detailView: StudentDetailView?
    
    public init(listView: StudentListView? = nil, detailView: StudentDetailView? = nil) {
        self.listView = listView
        self.detailView = detailView
    }
    
    public func students(query: String?, status: StudentStatus?) async throws -> StudentListView {
        guard let listView = listView else {
            throw RabbitAPIError.networkError
        }
        return listView
    }
    
    public func studentDetail(id: String) async throws -> StudentDetailView {
        guard let detailView = detailView else {
            throw RabbitAPIError.networkError
        }
        return detailView
    }
    
    public func createStudent(name: String, contact: String?, courseId: String?, initialSessions: Int?, note: String?) async throws -> (student: Student, package: Package?, invite: Invite) {
        throw RabbitAPIError.networkError
    }
    
    public func updateStudent(id: String, name: String?, contact: String?, status: StudentStatus?) async throws -> Student {
        throw RabbitAPIError.networkError
    }
    
    public func createInvite(studentId: String) async throws -> Invite {
        throw RabbitAPIError.networkError
    }
    
    public func revokeInvite(inviteId: String) async throws -> Invite {
        throw RabbitAPIError.networkError
    }
}
