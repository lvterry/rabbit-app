import SwiftUI
import RabbitKit

struct StudentDetailView: View {
    @Bindable var viewModel: StudentDetailViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var environment
    @State private var showAddPackage = false
    @State private var showAddBooking = false
    @State private var showInvite = false
    
    var body: some View {
        List {
            if let detail = viewModel.detail {
                // Summary section
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(detail.student.name)
                                .font(.title2)
                                .fontWeight(.bold)
                            
                            Spacer()
                            
                            if !detail.student.bound {
                                Image(systemName: "link.badge.plus")
                                    .foregroundStyle(.orange)
                            }
                        }
                        
                        if let contact = detail.student.contact {
                            Text(contact)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        
                        // Summary stats
                        HStack(spacing: 20) {
                            StatBadge(
                                label: "剩余",
                                value: "\(detail.courses.reduce(0) { $0 + $1.remaining }) 节"
                            )
                            
                            StatBadge(
                                label: "已约",
                                value: "\(detail.courses.reduce(0) { $0 + $1.reserved }) 节"
                            )
                        }
                    }
                    .padding(.vertical, 8)
                }
                
                // Actions section
                Section {
                    Button {
                        showAddPackage = true
                    } label: {
                        Label("续课", systemImage: "plus.circle")
                    }
                    
                    Button {
                        showAddBooking = true
                    } label: {
                        Label("创建预约", systemImage: "calendar.badge.plus")
                    }
                    
                    Button {
                        Task { await viewModel.resendInvite() }
                        showInvite = true
                    } label: {
                        Label("重新发送邀请", systemImage: "envelope")
                    }
                    
                    Button(role: .destructive) {
                        Task {
                            await viewModel.updateStatus(detail.student.status == .Active ? .Inactive : .Active)
                        }
                    } label: {
                        Label(
                            detail.student.status == .Active ? "停用" : "启用",
                            systemImage: detail.student.status == .Active ? "pause.circle" : "play.circle"
                        )
                    }
                }
                
                // Courses section
                Section("课程与课时") {
                    ForEach(detail.courses) { course in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(course.courseName)
                                .font(.headline)
                            
                            HStack {
                                Label("\(course.durationMinutes) 分钟", systemImage: "clock")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                
                                Spacer()
                                
                                Text("剩余 \(course.remaining) 节")
                                    .font(.subheadline)
                                
                                if course.reserved > 0 {
                                    Text("· 已约 \(course.reserved) 节")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                
                // Packages section
                if !detail.packages.isEmpty {
                    Section("课时包") {
                        ForEach(detail.packages) { package in
                            HStack {
                                VStack(alignment: .leading, spacing: Spacing.sm) {
                                    Text(package.courseName)
                                        .font(.body)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.inkPrimary)
                                    
                                    HStack(spacing: Spacing.xs) {
                                        Text("\(package.remainingSessions)")
                                            .font(.title3)
                                            .fontWeight(.bold)
                                            .monospacedDigit()
                                            .foregroundColor(.brandGreen)
                                        
                                        Text("/")
                                            .foregroundColor(.inkTertiary)
                                        
                                        Text("\(package.purchasedSessions)")
                                            .font(.body)
                                            .monospacedDigit()
                                            .foregroundColor(.inkSecondary)
                                        
                                        Text("节")
                                            .font(.caption)
                                            .foregroundColor(.inkSecondary)
                                    }
                                    
                                    Text(package.createdDate)
                                        .font(.caption)
                                        .foregroundStyle(Color.inkTertiary)
                                }
                                
                                Spacer()
                                
                                VStack(alignment: .trailing, spacing: Spacing.xs) {
                                    PackageStatusBadge(status: package.status)
                                    
                                    Button {
                                        // TODO: Show adjust package sheet
                                    } label: {
                                        Text("调整")
                                            .font(.caption)
                                            .fontWeight(.medium)
                                            .foregroundColor(.brandGreen)
                                    }
                                }
                            }
                            .padding(.vertical, Spacing.sm)
                        }
                    }
                }
                
                // Upcoming bookings
                if !detail.upcoming.isEmpty {
                    Section("即将上课") {
                        ForEach(detail.upcoming) { booking in
                            NavigationLink {
                                BookingDetailView(
                                    viewModel: BookingDetailViewModel(
                                        bookingId: booking.bookingId,
                                        repo: environment.bookingRepository
                                    )
                                )
                            } label: {
                                BookingRow(booking: booking)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                
                // History
                if !detail.history.isEmpty {
                    Section("历史课程") {
                        ForEach(detail.history.prefix(5)) { booking in
                            NavigationLink {
                                BookingDetailView(
                                    viewModel: BookingDetailViewModel(
                                        bookingId: booking.bookingId,
                                        repo: environment.bookingRepository
                                    )
                                )
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(booking.dateLabel)
                                            .font(.subheadline)
                                        
                                        Spacer()
                                        
                                        StatusBadge(status: booking.status)
                                    }
                                    
                                    Text(booking.courseName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        
                        if detail.history.count > 5 {
                            NavigationLink("查看全部历史") {
                                // TODO: Full history view
                                Text("历史课程")
                            }
                        }
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
        .navigationTitle("学员详情")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Color.bgApp)
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(isPresented: $showAddPackage) {
            // TODO: Add package view
            Text("续课")
        }
        .sheet(isPresented: $showAddBooking) {
            // TODO: Add booking view
            Text("创建预约")
        }
        .sheet(isPresented: $showInvite) {
            if let invite = viewModel.detail?.invite {
                InviteSheetView(invite: invite)
            }
        }
        .task {
            if viewModel.detail == nil {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Stat Badge

struct StatBadge: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
            
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Invite Sheet

struct InviteSheetView: View {
    let invite: Invite
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("邀请链接")
                    .font(.title2)
                    .fontWeight(.bold)
                
                // QR Code placeholder
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
                    .frame(width: 200, height: 200)
                    .overlay {
                        VStack {
                            Image(systemName: "qrcode")
                                .font(.system(size: 60))
                                .foregroundStyle(.secondary)
                            
                            Text("二维码")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                
                VStack(spacing: 12) {
                    Text(invite.url)
                        .font(.caption)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                    
                    Button {
                        UIPasteboard.general.string = invite.url
                    } label: {
                        Label("复制链接", systemImage: "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    
                    ShareLink(item: invite.url) {
                        Label("分享邀请", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(.horizontal)
                
                Text("有效期至 \(invite.expiresLabel)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        StudentDetailView(
            viewModel: StudentDetailViewModel(
                studentId: "123",
                studentRepo: MockStudentRepository()
            )
        )
    }
}
