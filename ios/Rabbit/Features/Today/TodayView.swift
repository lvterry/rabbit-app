import SwiftUI
import RabbitKit

struct TodayView: View {
    @Bindable var viewModel: TodayViewModel
    @Environment(AppEnvironment.self) private var environment
    @State private var showAddBooking = false
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.day == nil {
                    ProgressView()
                } else if let day = viewModel.day {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            // Date header
                            VStack(alignment: .leading, spacing: 4) {
                                Text(day.dateLabel)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                
                                Text("今天 \(day.todayCount) 节课 · 已完成 \(day.completedCount) 节")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal)
                            
                            // Next booking card
                            if let next = day.next {
                                NavigationLink {
                                    BookingDetailView(
                                        viewModel: BookingDetailViewModel(
                                            bookingId: next.bookingId,
                                            repo: environment.bookingRepository
                                        )
                                    )
                                } label: {
                                    NextBookingCard(booking: next)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal)
                            }
                            
                            // Pending actions section
                            if !day.pending.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text("待处理")
                                            .font(.subheadline)
                                            .fontWeight(.semibold)
                                        
                                        Text("\(day.pending.count)")
                                            .font(.caption)
                                            .fontWeight(.semibold)
                                            .foregroundColor(.stateWarning)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 2)
                                            .background(Color.accentYellowSoft)
                                            .cornerRadius(CornerRadius.pill)
                                    }
                                    .padding(.horizontal)
                                    .padding(.top, 4)
                                    
                                    VStack(spacing: Spacing.sm) {
                                        ForEach(day.pending) { booking in
                                            NavigationLink {
                                                BookingDetailView(
                                                    viewModel: BookingDetailViewModel(
                                                        bookingId: booking.bookingId,
                                                        repo: environment.bookingRepository
                                                    )
                                                )
                                            } label: {
                                                BookingRow(booking: booking, showDate: false)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                                .padding(.vertical, Spacing.md)
                                .background(Color.accentYellowSoft.opacity(0.3))
                                .cornerRadius(CornerRadius.lg)
                                .padding(.horizontal)
                            }
                            
                            // Today's bookings
                            if !day.bookings.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("今日课程")
                                        .font(.headline)
                                        .padding(.horizontal)
                                    
                                    ForEach(day.bookings) { booking in
                                        NavigationLink {
                                            BookingDetailView(
                                                viewModel: BookingDetailViewModel(
                                                    bookingId: booking.bookingId,
                                                    repo: environment.bookingRepository
                                                )
                                            )
                                        } label: {
                                            BookingRow(booking: booking, showDate: false)
                                        }
                                        .buttonStyle(.plain)
                                        .padding(.horizontal)
                                    }
                                }
                            }
                            
                            // Hints
                            if !day.hints.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(day.hints, id: \.self) { hint in
                                        Text(hint)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.horizontal)
                            }
                            
                            // Empty state
                            if day.bookings.isEmpty && day.next == nil && day.pending.isEmpty {
                                VStack(spacing: Spacing.lg) {
                                    Image(systemName: "calendar.badge.checkmark")
                                        .font(.system(size: 48))
                                        .foregroundStyle(Color.inkTertiary)
                                    
                                    Text("今天没有课")
                                        .font(.title3)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.inkPrimary)
                                    
                                    if let nextHint = day.hints.first {
                                        Text(nextHint)
                                            .font(.subheadline)
                                            .foregroundStyle(Color.inkSecondary)
                                            .multilineTextAlignment(.center)
                                    }
                                    
                                    Button {
                                        showAddBooking = true
                                    } label: {
                                        Label("快速创建预约", systemImage: "plus.circle.fill")
                                            .fontWeight(.semibold)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.brandGreen)
                                    .padding(.top, Spacing.sm)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
                                .padding(.horizontal, Spacing.xl)
                            }
                        }
                        .padding(.vertical)
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
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
                } else {
                    ContentUnavailableView("无数据", systemImage: "calendar")
                }
            }
            .navigationTitle("今天")
            .background(Color.bgApp)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddBooking = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddBooking) {
                AddBookingView(viewModel: AddBookingViewModel(
                    studentRepo: environment.studentRepository,
                    bookingRepo: environment.bookingRepository
                ))
            }
        }
        .task {
            if viewModel.day == nil {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Next Booking Card

struct NextBookingCard: View {
    let booking: Booking
    
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("下一节")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(Color.inkSecondary)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 4)
                .background(Color.brandGreenSoft)
                .cornerRadius(CornerRadius.sm)
            
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text(booking.studentName)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(.inkPrimary)
                
                Text(booking.courseName)
                    .font(.subheadline)
                    .foregroundStyle(Color.inkSecondary)
                
                HStack {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundColor(.brandGreen)
                    
                    Text(booking.timeRange)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.brandGreen)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .background(Color.bgElevated)
        .cornerRadius(CornerRadius.xl)
        .shadow(color: Color.black.opacity(0.04), radius: 8, x: 0, y: 2)
    }
}

#Preview {
    TodayView(viewModel: TodayViewModel(repo: MockBookingRepository()))
        .environment(AppEnvironment())
}
