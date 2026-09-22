import Foundation
import Observation

// MARK: - Student Detail View Model

@Observable
@MainActor
public final class StudentDetailViewModel {
    public private(set) var detail: StudentDetailView?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    private let studentId: String
    private let studentRepo: any StudentRepositoryProtocol
    
    public init(studentId: String, studentRepo: any StudentRepositoryProtocol) {
        self.studentId = studentId
        self.studentRepo = studentRepo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            detail = try await studentRepo.studentDetail(id: studentId)
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func resendInvite() async {
        do {
            _ = try await studentRepo.createInvite(studentId: studentId)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
    
    public func updateStatus(_ status: StudentStatus) async {
        do {
            _ = try await studentRepo.updateStudent(id: studentId, name: nil, contact: nil, status: status)
            await refresh()
        } catch let err as RabbitAPIError {
            error = err
        } catch {
            error = .unknown(error)
        }
    }
}
