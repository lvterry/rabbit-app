import Foundation

// MARK: - HTTP Client

/// HTTP client for API requests
public actor HTTPClient {
    private let baseURL: URL
    private let session: URLSession
    private let clientVersion: String
    
    public init(baseURL: URL, clientVersion: String = "1.0.0") {
        self.baseURL = baseURL
        self.clientVersion = clientVersion
        
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20.0  // Write operations
        configuration.timeoutIntervalForResource = 30.0
        configuration.waitsForConnectivity = true
        configuration.httpAdditionalHeaders = [
            "X-Client": "ios/\(clientVersion)",
            "Content-Type": "application/json"
        ]
        
        self.session = URLSession(configuration: configuration)
    }
    
    // MARK: - Request Methods
    
    public func get<T: Decodable>(
        _ endpoint: Endpoint,
        queryItems: [URLQueryItem] = []
    ) async throws -> T {
        try await request(endpoint: endpoint, method: "GET", queryItems: queryItems)
    }
    
    public func post<T: Decodable, Body: Encodable>(
        _ endpoint: Endpoint,
        body: Body? = nil as String?,
        idempotencyKey: String? = nil
    ) async throws -> T {
        try await request(
            endpoint: endpoint,
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        )
    }
    
    public func patch<T: Decodable, Body: Encodable>(
        _ endpoint: Endpoint,
        body: Body
    ) async throws -> T {
        try await request(endpoint: endpoint, method: "PATCH", body: body)
    }
    
    public func delete<T: Decodable>(
        _ endpoint: Endpoint,
        idempotencyKey: String? = nil
    ) async throws -> T {
        try await request(endpoint: endpoint, method: "DELETE", idempotencyKey: idempotencyKey)
    }
    
    // MARK: - Core Request
    
    private func request<T: Decodable, Body: Encodable>(
        endpoint: Endpoint,
        method: String,
        queryItems: [URLQueryItem] = [],
        body: Body? = nil as String?,
        idempotencyKey: String? = nil
    ) async throws -> T {
        var urlComponents = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: true)!
        
        if !queryItems.isEmpty {
            urlComponents.queryItems = queryItems
        }
        
        guard let url = urlComponents.url else {
            throw RabbitAPIError.invalidResponse
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        
        // Add idempotency key if provided
        if let key = idempotencyKey {
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        
        // Add authorization header (from session store)
        if let token = await SessionStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Encode body if present
        if let body = body {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .useDefaultKeys
            request.httpBody = try encoder.encode(body)
        }
        
        // Execute request
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RabbitAPIError.invalidResponse
        }
        
        // Handle HTTP errors
        if httpResponse.statusCode >= 400 {
            return try handleErrorResponse(data: data, statusCode: httpResponse.statusCode)
        }
        
        // Decode success response
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        
        do {
            let envelope = try decoder.decode(APIResponse<T>.self, from: data)
            return envelope.data
        } catch {
            throw RabbitAPIError.decodingError(error)
        }
    }
    
    private func handleErrorResponse<T>(data: Data, statusCode: Int) throws -> T {
        let decoder = JSONDecoder()
        
        do {
            let errorResponse = try decoder.decode(APIError.self, from: data)
            
            // Handle token expiration - trigger refresh
            if errorResponse.code == ErrorCode.tokenExpired || 
               errorResponse.code == ErrorCode.unauthenticated {
                // Session store will handle refresh
                throw RabbitAPIError.serverError(
                    code: errorResponse.code,
                    message: errorResponse.message,
                    retryable: false,
                    details: errorResponse.details?.mapValues { $0.value }
                )
            }
            
            throw RabbitAPIError.serverError(
                code: errorResponse.code,
                message: errorResponse.message,
                retryable: errorResponse.retryable,
                details: errorResponse.details?.mapValues { $0.value }
            )
        } catch let error as RabbitAPIError {
            throw error
        } catch {
            throw RabbitAPIError.decodingError(error)
        }
    }
}

// MARK: - Endpoint

/// API endpoint definition
public struct Endpoint {
    let path: String
    
    public init(_ path: String) {
        self.path = path
    }
}

// MARK: - Endpoint Definitions

extension Endpoint {
    // Meta
    public static let meta = Endpoint("v1/meta")
    
    // Auth
    public static let meTeacher = Endpoint("v1/me/teacher")
    public static let me = Endpoint("v1/me")
    
    // Today & Calendar
    public static let teacherDay = Endpoint("v1/me/teacher-day")
    public static let teacherCalendar = Endpoint("v1/me/teacher-calendar")
    
    // Students
    public static let students = Endpoint("v1/students")
    public static func student(_ id: String) -> Endpoint {
        Endpoint("v1/students/\(id)")
    }
    public static func studentInvites(_ id: String) -> Endpoint {
        Endpoint("v1/students/\(id)/invites")
    }
    
    // Courses
    public static let courses = Endpoint("v1/courses")
    public static func course(_ id: String) -> Endpoint {
        Endpoint("v1/courses/\(id)")
    }
    public static func courseStatus(_ id: String) -> Endpoint {
        Endpoint("v1/courses/\(id)/status")
    }
    
    // Availability
    public static let availability = Endpoint("v1/availability")
    public static let availabilityRules = Endpoint("v1/availability/rules")
    public static func availabilityRule(_ id: String) -> Endpoint {
        Endpoint("v1/availability/rules/\(id)")
    }
    public static let availabilityRulesCopy = Endpoint("v1/availability/rules:copy")
    public static let availabilityExceptions = Endpoint("v1/availability/exceptions")
    public static func availabilityException(_ id: String) -> Endpoint {
        Endpoint("v1/availability/exceptions/\(id)")
    }
    
    // Packages
    public static func studentPackages(_ studentId: String) -> Endpoint {
        Endpoint("v1/students/\(studentId)/packages")
    }
    public static func packageTransactions(_ packageId: String) -> Endpoint {
        Endpoint("v1/packages/\(packageId)/transactions")
    }
    public static func packageArchival(_ packageId: String) -> Endpoint {
        Endpoint("v1/packages/\(packageId)/archival")
    }
    public static func studentTransactions(_ studentId: String) -> Endpoint {
        Endpoint("v1/students/\(studentId)/transactions")
    }
    
    // Slots
    public static func teacherSlots(_ teacherId: String) -> Endpoint {
        Endpoint("v1/teachers/\(teacherId)/slots")
    }
    public static func teacherBookableDays(_ teacherId: String) -> Endpoint {
        Endpoint("v1/teachers/\(teacherId)/bookable-days")
    }
    
    // Bookings
    public static let bookings = Endpoint("v1/bookings")
    public static func booking(_ id: String) -> Endpoint {
        Endpoint("v1/bookings/\(id)")
    }
    public static func bookingCompletion(_ id: String) -> Endpoint {
        Endpoint("v1/bookings/\(id)/completion")
    }
    public static func bookingCancellation(_ id: String) -> Endpoint {
        Endpoint("v1/bookings/\(id)/cancellation")
    }
    public static func bookingReschedule(_ id: String) -> Endpoint {
        Endpoint("v1/bookings/\(id)/reschedule")
    }
    public static func bookingSettlement(_ id: String) -> Endpoint {
        Endpoint("v1/bookings/\(id)/settlement")
    }
}
