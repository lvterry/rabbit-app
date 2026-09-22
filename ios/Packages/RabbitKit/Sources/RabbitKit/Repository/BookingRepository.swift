import Foundation

// MARK: - Booking Repository Protocol

public protocol BookingRepositoryProtocol {
    func teacherDay(date: String?) async throws -> TeacherDayView
    func teacherCalendar(from: String, to: String, courseId: String?) async throws -> TeacherCalendarView
    func booking(id: String) async throws -> Booking
    func createBooking(studentId: String, courseId: String, startAt: String) async throws -> Booking
    func completeBooking(id: String) async throws -> Booking
    func undoCompletion(id: String) async throws -> Booking
    func cancelBooking(id: String, reason: String?) async throws -> Booking
    func rescheduleBooking(id: String, newStartAt: String) async throws -> Booking
    func settleBooking(id: String, action: SettlementAction) async throws -> Booking
}

public enum SettlementAction: String, Encodable {
    case complete
    case markNoShow = "mark_no_show"
    case cancelFree = "cancel_free"
}

// MARK: - Booking Repository Implementation

public actor BookingRepository: BookingRepositoryProtocol {
    private let client: HTTPClient
    
    public init(client: HTTPClient) {
        self.client = client
    }
    
    public func teacherDay(date: String? = nil) async throws -> TeacherDayView {
        var queryItems: [URLQueryItem] = []
        if let date = date {
            queryItems.append(URLQueryItem(name: "date", value: date))
        }
        
        return try await client.get(.teacherDay, queryItems: queryItems)
    }
    
    public func teacherCalendar(from: String, to: String, courseId: String? = nil) async throws -> TeacherCalendarView {
        var queryItems = [
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to)
        ]
        if let courseId = courseId {
            queryItems.append(URLQueryItem(name: "courseId", value: courseId))
        }
        
        return try await client.get(.teacherCalendar, queryItems: queryItems)
    }
    
    public func booking(id: String) async throws -> Booking {
        return try await client.get(.booking(id))
    }
    
    public func createBooking(studentId: String, courseId: String, startAt: String) async throws -> Booking {
        struct CreateBookingRequest: Encodable {
            let studentId: String
            let courseId: String
            let startAt: String
        }
        
        let request = CreateBookingRequest(
            studentId: studentId,
            courseId: courseId,
            startAt: startAt
        )
        
        let idempotencyKey = UUID().uuidString
        return try await client.post(.bookings, body: request, idempotencyKey: idempotencyKey)
    }
    
    public func completeBooking(id: String) async throws -> Booking {
        let idempotencyKey = UUID().uuidString
        return try await client.post(.bookingCompletion(id), idempotencyKey: idempotencyKey)
    }
    
    public func undoCompletion(id: String) async throws -> Booking {
        let idempotencyKey = UUID().uuidString
        return try await client.delete(.bookingCompletion(id), idempotencyKey: idempotencyKey)
    }
    
    public func cancelBooking(id: String, reason: String? = nil) async throws -> Booking {
        struct CancelRequest: Encodable {
            let reason: String?
        }
        
        let request = CancelRequest(reason: reason)
        let idempotencyKey = UUID().uuidString
        return try await client.post(.bookingCancellation(id), body: request, idempotencyKey: idempotencyKey)
    }
    
    public func rescheduleBooking(id: String, newStartAt: String) async throws -> Booking {
        struct RescheduleRequest: Encodable {
            let newStartAt: String
        }
        
        let request = RescheduleRequest(newStartAt: newStartAt)
        let idempotencyKey = UUID().uuidString
        return try await client.post(.bookingReschedule(id), body: request, idempotencyKey: idempotencyKey)
    }
    
    public func settleBooking(id: String, action: SettlementAction) async throws -> Booking {
        struct SettleRequest: Encodable {
            let action: SettlementAction
        }
        
        let request = SettleRequest(action: action)
        return try await client.post(.bookingSettlement(id), body: request)
    }
}

// MARK: - Mock Repository for Previews

public final class MockBookingRepository: BookingRepositoryProtocol {
    private let dayView: TeacherDayView?
    private let calendarView: TeacherCalendarView?
    private let booking: Booking?
    
    public init(
        dayView: TeacherDayView? = nil,
        calendarView: TeacherCalendarView? = nil,
        booking: Booking? = nil
    ) {
        self.dayView = dayView
        self.calendarView = calendarView
        self.booking = booking
    }
    
    public func teacherDay(date: String?) async throws -> TeacherDayView {
        guard let dayView = dayView else {
            throw RabbitAPIError.networkError
        }
        return dayView
    }
    
    public func teacherCalendar(from: String, to: String, courseId: String?) async throws -> TeacherCalendarView {
        guard let calendarView = calendarView else {
            throw RabbitAPIError.networkError
        }
        return calendarView
    }
    
    public func booking(id: String) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func createBooking(studentId: String, courseId: String, startAt: String) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func completeBooking(id: String) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func undoCompletion(id: String) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func cancelBooking(id: String, reason: String?) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func rescheduleBooking(id: String, newStartAt: String) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
    
    public func settleBooking(id: String, action: SettlementAction) async throws -> Booking {
        guard let booking = booking else {
            throw RabbitAPIError.networkError
        }
        return booking
    }
}
