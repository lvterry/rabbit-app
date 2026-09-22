import Foundation

// MARK: - Package (Lesson Package / 课时包)

/// Lesson package entity
public struct Package: Codable, Identifiable {
    public let packageId: String
    public let courseId: String
    public let courseName: String
    public let purchasedSessions: Int
    public let remainingSessions: Int
    public let status: PackageStatus
    public let createdAt: String
    public let createdDate: String
    
    public var id: String { packageId }
}

public enum PackageStatus: String, Codable {
    case Active
    case Archived
}

// MARK: - Balance

/// Session balance (remaining/reserved/available)
public struct Balance: Codable {
    public let remaining: Int
    public let reserved: Int?
    public let available: Int
}

// MARK: - Transaction

/// Package transaction (课时流水)
public struct Transaction: Codable, Identifiable {
    public let transactionId: String
    public let packageId: String
    public let courseId: String
    public let courseName: String
    public let type: TransactionType
    public let label: String
    public let amount: Int
    public let amountText: String
    public let beforeSessions: Int
    public let afterSessions: Int
    public let balanceText: String
    public let note: String?
    public let createdAt: String
    public let createdLabel: String
    
    public var id: String { transactionId }
}

public enum TransactionType: String, Codable {
    case PURCHASE
    case MANUAL_ADD
    case MANUAL_DEDUCT
    case PURCHASE_ADJUSTMENT
    case BALANCE_ADJUSTMENT
    case BOOKING_RESERVE
    case BOOKING_CONSUME
    case BOOKING_REFUND
}

// MARK: - Transaction List

/// List of transactions
public struct TransactionListView: Codable {
    public let items: [Transaction]
    public let nextCursor: String?
    public let hasMore: Bool
}
