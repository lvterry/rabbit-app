import Foundation

// MARK: - Server Metadata

/// Server metadata and version info
public struct ServerMeta: Codable {
    public let minIOSVersion: String
    public let minWebBuild: String?
    public let features: [String: Bool]?
    public let serverTime: String
}
