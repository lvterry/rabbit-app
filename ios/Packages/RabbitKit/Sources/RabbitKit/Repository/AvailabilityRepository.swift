import Foundation

// MARK: - Availability Repository Protocol

public protocol AvailabilityRepositoryProtocol {
    func availability(includePast: Bool) async throws -> AvailabilityView
    func createRule(weekday: Int, startMinute: Int, endMinute: Int) async throws -> AvailabilityRule
    func updateRule(id: String, weekday: Int?, startMinute: Int?, endMinute: Int?) async throws -> AvailabilityRule
    func deleteRule(id: String) async throws
    func copyRules(fromWeekday: Int, toWeekdays: [Int]) async throws -> (created: Int, skipped: Int)
    func createException(onDate: String, wholeDay: Bool, startMinute: Int?, endMinute: Int?, reason: String?) async throws -> AvailabilityException
    func deleteException(id: String) async throws
}

// MARK: - Availability Repository Implementation

public actor AvailabilityRepository: AvailabilityRepositoryProtocol {
    private let client: HTTPClient
    
    public init(client: HTTPClient) {
        self.client = client
    }
    
    public func availability(includePast: Bool = false) async throws -> AvailabilityView {
        let queryItems = [
            URLQueryItem(name: "includePast", value: includePast ? "true" : "false")
        ]
        
        return try await client.get(.availability, queryItems: queryItems)
    }
    
    public func createRule(weekday: Int, startMinute: Int, endMinute: Int) async throws -> AvailabilityRule {
        struct CreateRuleRequest: Encodable {
            let weekday: Int
            let startMinute: Int
            let endMinute: Int
        }
        
        struct CreateRuleResponse: Decodable {
            let rule: AvailabilityRule
        }
        
        let request = CreateRuleRequest(weekday: weekday, startMinute: startMinute, endMinute: endMinute)
        let response: CreateRuleResponse = try await client.post(.availabilityRules, body: request)
        return response.rule
    }
    
    public func updateRule(
        id: String,
        weekday: Int? = nil,
        startMinute: Int? = nil,
        endMinute: Int? = nil
    ) async throws -> AvailabilityRule {
        struct UpdateRuleRequest: Encodable {
            let weekday: Int?
            let startMinute: Int?
            let endMinute: Int?
        }
        
        struct UpdateRuleResponse: Decodable {
            let rule: AvailabilityRule
        }
        
        let request = UpdateRuleRequest(weekday: weekday, startMinute: startMinute, endMinute: endMinute)
        let response: UpdateRuleResponse = try await client.patch(.availabilityRule(id), body: request)
        return response.rule
    }
    
    public func deleteRule(id: String) async throws {
        struct DeleteResponse: Decodable {
            let deleted: Bool
        }
        
        let _: DeleteResponse = try await client.delete(.availabilityRule(id))
    }
    
    public func copyRules(fromWeekday: Int, toWeekdays: [Int]) async throws -> (created: Int, skipped: Int) {
        struct CopyRulesRequest: Encodable {
            let fromWeekday: Int
            let toWeekdays: [Int]
        }
        
        struct CopyRulesResponse: Decodable {
            let created: Int
            let skipped: Int
        }
        
        let request = CopyRulesRequest(fromWeekday: fromWeekday, toWeekdays: toWeekdays)
        let response: CopyRulesResponse = try await client.post(.availabilityRulesCopy, body: request)
        return (response.created, response.skipped)
    }
    
    public func createException(
        onDate: String,
        wholeDay: Bool,
        startMinute: Int? = nil,
        endMinute: Int? = nil,
        reason: String? = nil
    ) async throws -> AvailabilityException {
        struct CreateExceptionRequest: Encodable {
            let onDate: String
            let wholeDay: Bool
            let startMinute: Int?
            let endMinute: Int?
            let reason: String?
        }
        
        struct CreateExceptionResponse: Decodable {
            let exception: AvailabilityException
        }
        
        let request = CreateExceptionRequest(
            onDate: onDate,
            wholeDay: wholeDay,
            startMinute: startMinute,
            endMinute: endMinute,
            reason: reason
        )
        
        let response: CreateExceptionResponse = try await client.post(.availabilityExceptions, body: request)
        return response.exception
    }
    
    public func deleteException(id: String) async throws {
        struct DeleteResponse: Decodable {
            let deleted: Bool
        }
        
        let _: DeleteResponse = try await client.delete(.availabilityException(id))
    }
}

// MARK: - Mock Repository

public final class MockAvailabilityRepository: AvailabilityRepositoryProtocol {
    private let view: AvailabilityView?
    
    public init(view: AvailabilityView? = nil) {
        self.view = view
    }
    
    public func availability(includePast: Bool) async throws -> AvailabilityView {
        guard let view = view else {
            throw RabbitAPIError.networkError
        }
        return view
    }
    
    public func createRule(weekday: Int, startMinute: Int, endMinute: Int) async throws -> AvailabilityRule {
        throw RabbitAPIError.networkError
    }
    
    public func updateRule(id: String, weekday: Int?, startMinute: Int?, endMinute: Int?) async throws -> AvailabilityRule {
        throw RabbitAPIError.networkError
    }
    
    public func deleteRule(id: String) async throws {
        throw RabbitAPIError.networkError
    }
    
    public func copyRules(fromWeekday: Int, toWeekdays: [Int]) async throws -> (created: Int, skipped: Int) {
        throw RabbitAPIError.networkError
    }
    
    public func createException(onDate: String, wholeDay: Bool, startMinute: Int?, endMinute: Int?, reason: String?) async throws -> AvailabilityException {
        throw RabbitAPIError.networkError
    }
    
    public func deleteException(id: String) async throws {
        throw RabbitAPIError.networkError
    }
}
