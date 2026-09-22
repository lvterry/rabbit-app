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
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text(booking.studentName)
                    .font(.body)
                    .fontWeight(.semibold)
                    .foregroundColor(.inkPrimary)
                
                Spacer()
                
                StatusBadge(status: booking.status)
            }
            
            Text(booking.courseName)
                .font(.subheadline)
                .foregroundStyle(Color.inkSecondary)
            
            HStack {
                if showDate {
                    Text(booking.dateLabel)
                        .font(.callout)
                        .foregroundColor(.inkSecondary)
                }
                
                Text(booking.timeRange)
                    .font(.callout)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundColor(.inkPrimary)
                
                Spacer()
                
                if let remaining = booking.remaining {
                    Text("剩余 \(remaining) 节")
                        .font(.caption)
                        .foregroundStyle(Color.inkTertiary)
                }
            }
        }
        .padding(Spacing.lg)
        .background(Color.bgElevated)
        .cornerRadius(CornerRadius.md)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: BookingStatus
    
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
            return Color.bgGrouped
        case .Completed:
            return Color.brandGreenSoft
        case .Cancelled:
            return Color.bgGrouped
        }
    }
    
    private var foregroundColor: Color {
        switch status {
        case .Upcoming:
            return Color.inkSecondary
        case .Completed:
            return Color.brandGreen
        case .Cancelled:
            return Color.inkTertiary
        }
    }
}

#Preview {
    VStack {
        BookingRow(
            booking: Booking(
                bookingId: "1",
                teacherId: "1",
                teacherName: "王老师",
                studentId: "1",
                studentName: "张同学",
                courseId: "1",
                courseName: "西班牙语一对一",
                durationMinutes: 60,
                packageId: "1",
                startAt: "2026-03-03T06:00:00Z",
                endAt: "2026-03-03T07:00:00Z",
                date: "2026-03-03",
                dateLabel: "3月3日 周二",
                startLocal: "14:00",
                endLocal: "15:00",
                timeRange: "14:00-15:00",
                status: .Upcoming,
                source: .TeacherCreated,
                sourceLabel: "老师代约",
                cancelledAt: nil,
                cancelledBy: nil,
                cancelledByLabel: nil,
                cancellationPolicyResult: nil,
                policyText: nil,
                consumedSession: false,
                policySnapshotFreeCancelHours: 24,
                rescheduledFromBookingId: nil,
                rescheduledToBookingId: nil,
                rescheduleCount: 0,
                maxReschedules: 3,
                settledAt: nil,
                sessionStatus: nil,
                sessionSource: nil,
                sessionSourceLabel: nil,
                createdAt: "2026-02-20T01:00:00Z",
                started: false,
                remaining: 8,
                reserved: 2,
                available: 6,
                actions: BookingActions(
                    canComplete: false,
                    canMarkNoShow: false,
                    canCancel: true,
                    canReschedule: true,
                    rescheduleLimitReached: false,
                    canUndoComplete: false,
                    undoDeadline: nil
                )
            ),
            showDate: true
        )
    }
    .padding()
}
