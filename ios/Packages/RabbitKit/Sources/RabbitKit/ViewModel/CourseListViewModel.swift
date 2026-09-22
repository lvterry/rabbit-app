import Foundation
import Observation

// MARK: - Course List View Model

@Observable
@MainActor
public final class CourseListViewModel {
    public private(set) var courses: [Course] = []
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    private let repo: any CourseRepositoryProtocol
    
    public init(repo: any CourseRepositoryProtocol) {
        self.repo = repo
    }
    
    public func refresh(includeArchived: Bool = false) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            courses = try await repo.courses(includeArchived: includeArchived)
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func createCourse(name: String, durationMinutes: Int, allowSelfBooking: Bool) async {
        do {
            _ = try await repo.createCourse(
                name: name,
                durationMinutes: durationMinutes,
                allowSelfBooking: allowSelfBooking
            )
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func updateCourseStatus(id: String, status: CourseStatus) async {
        do {
            _ = try await repo.updateCourseStatus(id: id, status: status)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
}
