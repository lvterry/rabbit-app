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
        
        // TODO: Use refresh token to get new access token
        // For now, just mark as authenticated if we have a refresh token
        // Real implementation would call POST /v1/auth/refresh
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
        
        // TODO: Implement actual refresh API call
        // POST /v1/auth/refresh with refresh token
        // Update accessToken with new token
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
