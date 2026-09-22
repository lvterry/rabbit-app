import Foundation
import Observation

// MARK: - Today View Model

@Observable
@MainActor
public final class TodayViewModel {
    public private(set) var day: TeacherDayView?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    private let repo: any BookingRepositoryProtocol
    
    public init(repo: any BookingRepositoryProtocol) {
        self.repo = repo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            day = try await repo.teacherDay(date: nil)
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func loadDate(_ date: String) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            day = try await repo.teacherDay(date: date)
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
}
