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

        // Contract (impl-guide): `{ students, stats }`.
        // Live API currently returns `{ items: [...], hasMore }` — map until Maya aligns.
        struct StudentsWire: Decodable {
            let students: [StudentSummary]?
            let stats: StudentStats?
            let items: [Item]?
            let hasMore: Bool?

            struct Item: Decodable {
                let student: StudentCore
                let courses: [CourseCore]?
                let upcoming: [Booking]?

                struct StudentCore: Decodable {
                    let studentId: String
                    let name: String
                    let contact: String?
                    let status: StudentStatus
                    let bound: Bool
                    let boundAt: String?
                }

                struct CourseCore: Decodable {
                    let courseId: String
                    let courseName: String
                    let remaining: Int
                    let reserved: Int
                    let available: Int
                }
            }
        }

        let wire: StudentsWire = try await client.get(.students, queryItems: queryItems)
        if let students = wire.students, let stats = wire.stats {
            return StudentListView(students: students, stats: stats)
        }

        let details = wire.items ?? []
        let summaries: [StudentSummary] = details.map { item in
            let courseSummaries = (item.courses ?? []).map {
                CourseSummary(
                    courseId: $0.courseId,
                    courseName: $0.courseName,
                    remaining: $0.remaining,
                    reserved: $0.reserved,
                    available: $0.available
                )
            }
            return StudentSummary(
                studentId: item.student.studentId,
                name: item.student.name,
                contact: item.student.contact,
                status: item.student.status,
                bound: item.student.bound,
                boundAt: item.student.boundAt,
                courseSummaries: courseSummaries,
                remainingTotal: courseSummaries.reduce(0) { $0 + $1.remaining },
                nextBooking: item.upcoming?.first
            )
        }
        let stats = StudentStats(
            total: summaries.count,
            unbound: summaries.filter { !$0.bound }.count,
            active: summaries.filter { $0.status == .Active }.count
        )
        return StudentListView(students: summaries, stats: stats)
    }

    public func studentDetail(id: String) async throws -> StudentDetailView {
        // Contract: full StudentDetailView from GET /v1/students/:id.
        // Live API returns `{ student }` only; list items omit upcoming.
        // Fill upcoming from teacher-upcoming until Maya aligns.
        struct ListWire: Decodable {
            let items: [StudentDetailView]?
        }
        struct UpcomingWire: Decodable {
            let items: [Booking]
        }

        let list: ListWire = try await client.get(.students)
        let base: StudentDetailView
        if let match = list.items?.first(where: { $0.student.studentId == id }) {
            base = match
        } else {
            struct Partial: Decodable { let student: Student }
            let partial: Partial = try await client.get(.student(id))
            base = StudentDetailView(
                student: partial.student,
                courses: [],
                packages: [],
                transactions: [],
                upcoming: [],
                history: [],
                invite: nil
            )
        }

        let upcoming: UpcomingWire = try await client.get(
            .teacherUpcoming,
            queryItems: [URLQueryItem(name: "limit", value: "50")]
        )
        let mine = upcoming.items.filter { $0.studentId == id && $0.status == .Upcoming }
        return StudentDetailView(
            student: base.student,
            courses: base.courses,
            packages: base.packages,
            transactions: base.transactions,
            upcoming: mine.isEmpty ? base.upcoming : mine,
            history: base.history,
            invite: base.invite
        )
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
