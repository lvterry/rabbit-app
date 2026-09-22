import Foundation
import Security

// MARK: - Session Store

/// Manages user session and tokens
@MainActor
public final class SessionStore: ObservableObject {
    public static let shared = SessionStore()
    
    @Published public private(set) var isAuthenticated = false
    @Published public private(set) var currentUser: User?
    @Published public private(set) var teacher: Teacher?
    
    private(set) var accessToken: String?
    private let keychain = KeychainStore()
    
    private init() {
        Task {
            await loadSession()
        }
    }
    
    // MARK: - Session Management
    
    public func setSession(accessToken: String, refreshToken: String, user: User, teacher: Teacher?) {
        self.accessToken = accessToken
        self.currentUser = user
        self.teacher = teacher
        self.isAuthenticated = true
        
        // Store refresh token in keychain
        keychain.saveRefreshToken(refreshToken)
    }
    
    public func clearSession() {
        self.accessToken = nil
        self.currentUser = nil
        self.teacher = nil
        self.isAuthenticated = false
        
        keychain.deleteRefreshToken()
    }
    
    private func loadSession() async {
        // Try to restore session from keychain
        guard let refreshToken = keychain.loadRefreshToken() else {
            return
        }
        
        // Attempt to refresh access token and restore session
        do {
            try await refreshAccessToken()
        } catch {
            // If refresh fails, clear invalid session
            clearSession()
        }
    }
    
    // MARK: - Token Refresh
    
    public func refreshAccessToken() async throws {
        guard let refreshToken = keychain.loadRefreshToken() else {
            throw RabbitAPIError.serverError(
                code: ErrorCode.unauthenticated,
                message: "No refresh token available",
                retryable: false,
                details: nil
            )
        }
        
        // Get base URL from environment
        let baseURLString = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:8787"
        guard let baseURL = URL(string: baseURLString) else {
            throw RabbitAPIError.invalidResponse
        }
        
        // Call POST /v1/auth/refresh to get new access token
        let refreshURL = baseURL.appendingPathComponent("v1/auth/refresh")
        var request = URLRequest(url: refreshURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        struct RefreshRequest: Encodable {
            let refreshToken: String
        }
        
        let refreshRequest = RefreshRequest(refreshToken: refreshToken)
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(refreshRequest)
        
        // Execute request
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RabbitAPIError.invalidResponse
        }
        
        if httpResponse.statusCode >= 400 {
            throw RabbitAPIError.serverError(
                code: ErrorCode.tokenExpired,
                message: "Failed to refresh token",
                retryable: false,
                details: nil
            )
        }
        
        // Decode response
        struct RefreshResponse: Decodable {
            let accessToken: String
            let expiresIn: Int
        }
        
        let decoder = JSONDecoder()
        let envelope = try decoder.decode(APIResponse<RefreshResponse>.self, from: data)
        let refreshResponse = envelope.data
        
        // Update access token
        self.accessToken = refreshResponse.accessToken
        
        // Fetch current user info to restore full session
        let meURL = baseURL.appendingPathComponent("v1/me")
        var meRequest = URLRequest(url: meURL)
        meRequest.httpMethod = "GET"
        meRequest.setValue("Bearer \(refreshResponse.accessToken)", forHTTPHeaderField: "Authorization")
        meRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let (meData, meResponse) = try await URLSession.shared.data(for: meRequest)
        
        guard let meHttpResponse = meResponse as? HTTPURLResponse,
              meHttpResponse.statusCode < 400 else {
            throw RabbitAPIError.invalidResponse
        }
        
        let meEnvelope = try decoder.decode(APIResponse<MeView>.self, from: meData)
        let meView = meEnvelope.data
        
        // Auth gate: only authenticate if user is a teacher with valid profile
        guard meView.isTeacher, let teacher = meView.teacher else {
            // Not a teacher or teacher profile missing - fail closed
            clearSession()
            throw RabbitAPIError.serverError(
                code: ErrorCode.forbidden,
                message: "User is not a teacher",
                retryable: false,
                details: nil
            )
        }
        
        self.currentUser = meView.user
        self.teacher = teacher
        self.isAuthenticated = true
    }
}

// MARK: - Keychain Store

/// Secure storage for tokens
public struct KeychainStore {
    private let service = "com.rabbit.app"
    private let refreshTokenKey = "refreshToken"
    
    public func saveRefreshToken(_ token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenKey,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }
    
    public func loadRefreshToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return token
    }
    
    public func deleteRefreshToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: refreshTokenKey
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}
