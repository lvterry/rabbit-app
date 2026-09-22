import Foundation

// MARK: - Package Repository Protocol

public protocol PackageRepositoryProtocol {
    func adjustPackage(
        packageId: String,
        newValue: Int,
        type: PackageTransactionType,
        note: String?
    ) async throws -> Package
}

// MARK: - Package Transaction Type

public enum PackageTransactionType: String, Encodable {
    case purchaseAdjustment = "PURCHASE_ADJUSTMENT"
    case balanceAdjustment = "BALANCE_ADJUSTMENT"
}

// MARK: - Package Repository Implementation

public actor PackageRepository: PackageRepositoryProtocol {
    private let client: HTTPClient
    
    public init(client: HTTPClient) {
        self.client = client
    }
    
    public func adjustPackage(
        packageId: String,
        newValue: Int,
        type: PackageTransactionType,
        note: String?
    ) async throws -> Package {
        struct AdjustPackageRequest: Encodable {
            let mode: String
            let sessions: Int
            let type: String
            let note: String?
        }
        
        struct AdjustPackageResponse: Decodable {
            let package: Package
        }
        
        let request = AdjustPackageRequest(
            mode: "set",
            sessions: newValue,
            type: type.rawValue,
            note: note
        )
        
        let response: AdjustPackageResponse = try await client.post(
            Endpoint("v1/packages/\(packageId)/transactions"),
            body: request
        )
        
        return response.package
    }
}

// MARK: - Mock Repository

public final class MockPackageRepository: PackageRepositoryProtocol {
    public init() {}
    
    public func adjustPackage(
        packageId: String,
        newValue: Int,
        type: PackageTransactionType,
        note: String?
    ) async throws -> Package {
        // Mock implementation for previews
        return Package(
            packageId: packageId,
            studentId: "student-1",
            courseId: "course-1",
            courseName: "Mock Course",
            purchasedSessions: max(10, newValue),
            remainingSessions: newValue,
            status: .Active,
            createdAt: "2026-01-01T00:00:00Z",
            createdDate: "2026-01-01",
            archivedAt: nil
        )
    }
}
