import Foundation
import Observation

// MARK: - Booking Detail View Model

@Observable
@MainActor
public final class BookingDetailViewModel {
    public private(set) var booking: Booking?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    public private(set) var isProcessing = false
    
    private let bookingId: String
    private let repo: any BookingRepositoryProtocol
    
    public init(bookingId: String, repo: any BookingRepositoryProtocol) {
        self.bookingId = bookingId
        self.repo = repo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            booking = try await repo.booking(id: bookingId)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func complete() async {
        isProcessing = true
        error = nil
        defer { isProcessing = false }
        
        do {
            booking = try await repo.completeBooking(id: bookingId)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func undoCompletion() async {
        isProcessing = true
        error = nil
        defer { isProcessing = false }
        
        do {
            booking = try await repo.undoCompletion(id: bookingId)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func cancel(reason: String?) async {
        isProcessing = true
        error = nil
        defer { isProcessing = false }
        
        do {
            booking = try await repo.cancelBooking(id: bookingId, reason: reason)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func reschedule(newStartAt: String) async {
        isProcessing = true
        error = nil
        defer { isProcessing = false }
        
        do {
            booking = try await repo.rescheduleBooking(id: bookingId, newStartAt: newStartAt)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func settle(action: SettlementAction) async {
        isProcessing = true
        error = nil
        defer { isProcessing = false }
        
        do {
            booking = try await repo.settleBooking(id: bookingId, action: action)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
}
