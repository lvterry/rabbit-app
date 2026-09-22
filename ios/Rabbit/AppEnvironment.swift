import Foundation
import RabbitKit
import Observation

/// Application environment holding shared dependencies
@Observable
@MainActor
public final class AppEnvironment {
    public let apiClient: HTTPClient
    public let bookingRepository: any BookingRepositoryProtocol
    public let studentRepository: any StudentRepositoryProtocol
    public let courseRepository: any CourseRepositoryProtocol
    public let availabilityRepository: any AvailabilityRepositoryProtocol
    
    public init() {
        // Read configuration from environment or use defaults
        let baseURLString = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:8787"
        let baseURL = URL(string: baseURLString)!
        
        self.apiClient = HTTPClient(baseURL: baseURL, clientVersion: "1.0.0")
        
        // Create repositories
        self.bookingRepository = BookingRepository(client: apiClient)
        self.studentRepository = StudentRepository(client: apiClient)
        self.courseRepository = CourseRepository(client: apiClient)
        self.availabilityRepository = AvailabilityRepository(client: apiClient)
    }
}
