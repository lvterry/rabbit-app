import SwiftUI
import RabbitKit

struct BookingRow: View {
    let booking: Booking
    let showDate: Bool
    
    init(booking: Booking, showDate: Bool = true) {
        self.booking = booking
        self.showDate = showDate
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(booking.studentName)
                    .font(.headline)
                
                Spacer()
                
                StatusBadge(status: booking.status)
            }
            
            Text(booking.courseName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            
            HStack {
                if showDate {
                    Text(booking.dateLabel)
                        .font(.subheadline)
                }
                
                Text(booking.timeRange)
                    .font(.subheadline)
                
                Spacer()
                
                if let remaining = booking.remaining {
                    Text("剩余 \(remaining) 节")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: BookingStatus
    
    var body: some View {
        Text(statusText)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(4)
    }
    
    private var statusText: String {
        switch status {
        case .Upcoming:
            return "待上课"
        case .Completed:
            return "已完成"
        case .Cancelled:
            return "已取消"
        }
    }
    
    private var backgroundColor: Color {
        switch status {
        case .Upcoming:
            return .blue
        case .Completed:
            return .green
        case .Cancelled:
            return .gray
        }
    }
}
