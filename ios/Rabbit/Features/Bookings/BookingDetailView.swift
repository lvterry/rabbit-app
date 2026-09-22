import SwiftUI
import RabbitKit

struct BookingDetailView: View {
    @Bindable var viewModel: BookingDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showCancelConfirm = false
    @State private var showUndoConfirm = false
    @State private var cancelReason = ""
    
    var body: some View {
        Group {
            if let booking = viewModel.booking {
                List {
                    // Basic info section
                    Section {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(booking.studentName)
                                        .font(.title2)
                                        .fontWeight(.bold)
                                    
                                    Text(booking.courseName)
                                        .font(.headline)
                                        .foregroundStyle(.secondary)
                                }
                                
                                Spacer()
                                
                                StatusBadge(status: booking.status)
                            }
                            
                            Divider()
                            
                            // Date and time
                            HStack {
                                Label(booking.dateLabel, systemImage: "calendar")
                                    .font(.subheadline)
                                
                                Spacer()
                                
                                Text(booking.timeRange)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                            }
                            
                            HStack {
                                Label("\(booking.durationMinutes) 分钟", systemImage: "clock")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                
                                Spacer()
                                
                                Text(booking.sourceLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                    
                    // Balance info (teacher view only)
                    if let remaining = booking.remaining,
                       let reserved = booking.reserved,
                       let available = booking.available {
                        Section("课时") {
                            HStack {
                                Text("剩余")
                                Spacer()
                                Text("\(remaining) 节")
                                    .fontWeight(.medium)
                            }
                            
                            HStack {
                                Text("已约")
                                Spacer()
                                Text("\(reserved) 节")
                                    .foregroundStyle(.secondary)
                            }
                            
                            HStack {
                                Text("可用")
                                Spacer()
                                Text("\(available) 节")
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                    
                    // Status-specific info
                    switch booking.status {
                    case .Completed:
                        CompletedInfoSection(booking: booking)
                    case .Cancelled:
                        CancelledInfoSection(booking: booking)
                    case .Upcoming:
                        if booking.started {
                            Section {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: "clock.fill")
                                        .foregroundStyle(.blue)
                                    
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("课程已开始")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                        
                                        Text("请在课程结束后标记完成")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    
                    // Reschedule history
                    if booking.rescheduleCount > 0 {
                        Section("改期记录") {
                            HStack {
                                Text("改期次数")
                                Spacer()
                                Text("\(booking.rescheduleCount) / \(booking.maxReschedules)")
                                    .foregroundStyle(booking.actions.rescheduleLimitReached ? .red : .secondary)
                            }
                            
                            if let fromId = booking.rescheduledFromBookingId {
                                HStack {
                                    Text("改期自")
                                    Spacer()
                                    Text(fromId.prefix(8) + "...")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            
                            if let toId = booking.rescheduledToBookingId {
                                HStack {
                                    Text("改期至")
                                    Spacer()
                                    Text(toId.prefix(8) + "...")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    
                    // Actions section - GATED ONLY ON booking.actions.* (no status checks)
                    let hasAnyAction = booking.actions.canComplete || 
                                       booking.actions.canMarkNoShow || 
                                       booking.actions.canReschedule || 
                                       booking.actions.canCancel || 
                                       booking.actions.canUndoComplete
                    
                    if hasAnyAction {
                        Section {
                            // Complete - show ONLY if booking.actions.canComplete
                            if booking.actions.canComplete {
                                Button {
                                    Task {
                                        await viewModel.complete()
                                    }
                                } label: {
                                    Label("完成课程", systemImage: "checkmark.circle")
                                }
                                .disabled(viewModel.isProcessing)
                            }
                            
                            // Mark no-show - show ONLY if booking.actions.canMarkNoShow
                            if booking.actions.canMarkNoShow {
                                Button {
                                    Task {
                                        await viewModel.settle(action: .markNoShow)
                                    }
                                } label: {
                                    Label("标记未上课", systemImage: "xmark.circle")
                                }
                                .disabled(viewModel.isProcessing)
                            }
                            
                            // Reschedule - show ONLY if booking.actions.canReschedule
                            if booking.actions.canReschedule {
                                Button {
                                    // TODO: Reschedule flow - needs date/time picker + POST /bookings/:id/reschedule
                                    // Server will validate reschedule limits and policies
                                } label: {
                                    Label("改期", systemImage: "arrow.right.circle")
                                }
                                .disabled(viewModel.isProcessing)
                            }
                            
                            // Cancel - show ONLY if booking.actions.canCancel
                            if booking.actions.canCancel {
                                Button(role: .destructive) {
                                    showCancelConfirm = true
                                } label: {
                                    Label("取消预约", systemImage: "trash")
                                }
                                .disabled(viewModel.isProcessing)
                            }
                            
                            // Undo completion - show ONLY if booking.actions.canUndoComplete
                            if booking.actions.canUndoComplete {
                                Button {
                                    showUndoConfirm = true
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Label("撤销完成", systemImage: "arrow.uturn.backward")
                                        
                                        if let deadline = booking.actions.undoDeadline {
                                            Text("截止时间: \(deadline)")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                                .disabled(viewModel.isProcessing)
                            }
                        }
                    }
                }
                .navigationTitle("预约详情")
                .navigationBarTitleDisplayMode(.inline)
                .refreshable {
                    await viewModel.refresh()
                }
                .confirmationDialog("取消预约", isPresented: $showCancelConfirm) {
                    Button("取消预约", role: .destructive) {
                        Task {
                            await viewModel.cancel(reason: cancelReason.isEmpty ? nil : cancelReason)
                        }
                    }
                    Button("返回", role: .cancel) { }
                } message: {
                    Text("确定要取消这次预约吗？")
                }
                .confirmationDialog("撤销完成", isPresented: $showUndoConfirm) {
                    Button("撤销完成", role: .destructive) {
                        Task {
                            await viewModel.undoCompletion()
                        }
                    }
                    Button("返回", role: .cancel) { }
                } message: {
                    Text("确定要撤销这次课程的完成状态吗？")
                }
                .alert("操作失败", isPresented: Binding(
                    get: { viewModel.error != nil },
                    set: { if !$0 { viewModel.error = nil } }
                )) {
                    Button("确定", role: .cancel) { }
                } message: {
                    if let error = viewModel.error {
                        Text(error.errorDescription ?? "未知错误")
                    }
                }
            } else if viewModel.isLoading {
                ProgressView()
            } else if let error = viewModel.error {
                ContentUnavailableView {
                    Label("加载失败", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error.errorDescription ?? "未知错误")
                } actions: {
                    Button("重试") {
                        Task { await viewModel.refresh() }
                    }
                }
            }
        }
        .task {
            if viewModel.booking == nil {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Completed Info Section

struct CompletedInfoSection: View {
    let booking: Booking
    
    var body: some View {
        Section("完成信息") {
            if let settledAt = booking.settledAt {
                HStack {
                    Text("完成时间")
                    Spacer()
                    Text(settledAt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            if let sessionSource = booking.sessionSource, let sessionSourceLabel = booking.sessionSourceLabel {
                HStack {
                    Text("完成方式")
                    Spacer()
                    Text(sessionSourceLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                if sessionSource == "AutoSettled" {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "clock.badge.checkmark")
                            .foregroundStyle(.green)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("系统自动结算")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            
                            Text("课程结束后自动标记为完成")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            
            if booking.consumedSession {
                HStack {
                    Text("课时消耗")
                    Spacer()
                    Text("已扣除 1 节")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}

// MARK: - Cancelled Info Section

struct CancelledInfoSection: View {
    let booking: Booking
    
    var body: some View {
        Section("取消信息") {
            if let cancelledAt = booking.cancelledAt {
                HStack {
                    Text("取消时间")
                    Spacer()
                    Text(cancelledAt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            if let cancelledByLabel = booking.cancelledByLabel {
                HStack {
                    Text("取消方")
                    Spacer()
                    Text(cancelledByLabel)
                        .foregroundStyle(.secondary)
                }
            }
            
            if let policyText = booking.policyText {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: booking.consumedSession ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(booking.consumedSession ? .orange : .green)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(policyText)
                            .font(.subheadline)
                        
                        if booking.consumedSession {
                            Text("已扣除 1 节课时")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        } else {
                            Text("未扣除课时")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        BookingDetailView(
            viewModel: BookingDetailViewModel(
                bookingId: "123",
                repo: MockBookingRepository(
                    booking: Booking(
                        bookingId: "1",
                        teacherId: "t1",
                        teacherName: "王老师",
                        studentId: "s1",
                        studentName: "张同学",
                        courseId: "c1",
                        courseName: "西班牙语",
                        durationMinutes: 60,
                        packageId: "p1",
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
                            canComplete: true,
                            canMarkNoShow: false,
                            canCancel: true,
                            canReschedule: true,
                            rescheduleLimitReached: false,
                            canUndoComplete: false,
                            undoDeadline: nil
                        )
                    )
                )
            )
        )
    }
}
