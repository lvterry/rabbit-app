import Foundation
import Observation

// MARK: - Availability View Model

@Observable
@MainActor
public final class AvailabilityViewModel {
    public private(set) var availability: AvailabilityView?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    private let repo: any AvailabilityRepositoryProtocol
    
    public init(repo: any AvailabilityRepositoryProtocol) {
        self.repo = repo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            availability = try await repo.availability(includePast: false)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func createRule(weekday: Int, startMinute: Int, endMinute: Int) async {
        do {
            _ = try await repo.createRule(weekday: weekday, startMinute: startMinute, endMinute: endMinute)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func deleteRule(id: String) async {
        do {
            try await repo.deleteRule(id: id)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func copyRules(fromWeekday: Int, toWeekdays: [Int]) async {
        do {
            _ = try await repo.copyRules(fromWeekday: fromWeekday, toWeekdays: toWeekdays)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func createException(onDate: String, wholeDay: Bool, startMinute: Int?, endMinute: Int?, reason: String?) async {
        do {
            _ = try await repo.createException(
                onDate: onDate,
                wholeDay: wholeDay,
                startMinute: startMinute,
                endMinute: endMinute,
                reason: reason
            )
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func deleteException(id: String) async {
        do {
            try await repo.deleteException(id: id)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
}
