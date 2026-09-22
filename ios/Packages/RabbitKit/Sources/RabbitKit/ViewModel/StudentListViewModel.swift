import Foundation
import Observation

// MARK: - Student List View Model

@Observable
@MainActor
public final class StudentListViewModel {
    public private(set) var students: [StudentSummary] = []
    public private(set) var stats: StudentStats?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    public var searchQuery: String = ""
    
    private let repo: any StudentRepositoryProtocol
    
    public init(repo: any StudentRepositoryProtocol) {
        self.repo = repo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            let view = try await repo.students(
                query: searchQuery.isEmpty ? nil : searchQuery,
                status: nil
            )
            students = view.students
            stats = view.stats
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func search(_ query: String) async {
        searchQuery = query
        await refresh()
    }
}
