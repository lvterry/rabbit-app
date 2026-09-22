import SwiftUI
import RabbitKit

struct TodayView: View {
    @Bindable var viewModel: TodayViewModel
    
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
                                NextBookingCard(booking: next)
                                    .padding(.horizontal)
                            }
                            
                            // Pending actions section
                            if !day.pending.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("待处理 (\(day.pending.count))")
                                        .font(.headline)
                                        .padding(.horizontal)
                                    
                                    ForEach(day.pending) { booking in
                                        BookingRow(booking: booking, showDate: false)
                                            .padding(.horizontal)
                                    }
                                }
                            }
                            
                            // Today's bookings
                            if !day.bookings.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("今日课程")
                                        .font(.headline)
                                        .padding(.horizontal)
                                    
                                    ForEach(day.bookings) { booking in
                                        BookingRow(booking: booking, showDate: false)
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
                            if day.bookings.isEmpty && day.next == nil {
                                VStack(spacing: 16) {
                                    Image(systemName: "calendar.badge.checkmark")
                                        .font(.system(size: 60))
                                        .foregroundStyle(.secondary)
                                    
                                    Text("今天没有课程")
                                        .font(.headline)
                                    
                                    Text("享受您的休息时间")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        // TODO: Quick add booking
                    } label: {
                        Image(systemName: "plus")
                    }
                }
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
        VStack(alignment: .leading, spacing: 8) {
            Text("下一节课")
                .font(.caption)
                .foregroundStyle(.secondary)
            
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(booking.studentName)
                        .font(.headline)
                    
                    Text(booking.courseName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    
                    Text(booking.timeRange)
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

#Preview {
    TodayView(viewModel: TodayViewModel(repo: MockBookingRepository()))
        .environment(AppEnvironment())
}
