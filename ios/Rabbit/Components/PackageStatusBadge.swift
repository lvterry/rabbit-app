import SwiftUI
import RabbitKit

struct PackageStatusBadge: View {
    let status: PackageStatus
    
    var body: some View {
        Text(statusText)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .foregroundColor(foregroundColor)
            .cornerRadius(CornerRadius.pill)
    }
    
    private var statusText: String {
        switch status {
        case .Active:
            return "使用中"
        case .UsedUp:
            return "已用完"
        case .Archived:
            return "已归档"
        }
    }
    
    private var backgroundColor: Color {
        switch status {
        case .Active:
            return Color.brandGreenSoft
        case .UsedUp:
            return Color.bgGrouped
        case .Archived:
            return Color.bgGrouped
        }
    }
    
    private var foregroundColor: Color {
        switch status {
        case .Active:
            return Color.brandGreen
        case .UsedUp:
            return Color.inkTertiary
        case .Archived:
            return Color.inkTertiary
        }
    }
}
