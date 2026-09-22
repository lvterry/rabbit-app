import SwiftUI
import RabbitKit

struct CalendarView: View {
    @Bindable var viewModel: CalendarViewModel
    @State private var selectedDate: String?
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Week navigation
                WeekNavigationView(
                    currentWeek: viewModel.currentWeekLabel,
                    onPrevious: { Task { await viewModel.previousWeek() } },
                    onNext: { Task { await viewModel.nextWeek() } },
                    onToday: { Task { await viewModel.goToToday() } }
                )
                .padding()
                
                // Course filter (if multiple courses)
                if viewModel.courses.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            CourseFilterChip(
                                name: "全部课程",
                                isSelected: viewModel.selectedCourseId == nil,
                                action: { Task { await viewModel.selectCourse(nil) } }
                            )
                            
                            ForEach(viewModel.courses) { course in
                                CourseFilterChip(
                                    name: course.name,
                                    isSelected: viewModel.selectedCourseId == course.courseId,
                                    action: { Task { await viewModel.selectCourse(course.courseId) } }
                                )
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.bottom, 12)
                }
                
                // Calendar grid
                if let calendar = viewModel.calendar {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(calendar.days) { day in
                                CalendarDayRow(day: day)
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        selectedDate = day.date
                                    }
                            }
                        }
                        .padding()
                    }
                } else if viewModel.isLoading {
                    ProgressView()
                        .frame(maxHeight: .infinity)
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
            .navigationTitle("日历")
            .sheet(item: $selectedDate) { date in
                DayDetailView(date: date, viewModel: viewModel)
            }
        }
        .task {
            if viewModel.calendar == nil {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Week Navigation

struct WeekNavigationView: View {
    let currentWeek: String
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onToday: () -> Void
    
    var body: some View {
        HStack {
            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
            }
            
            Spacer()
            
            Text(currentWeek)
                .font(.headline)
            
            Spacer()
            
            Button(action: onNext) {
                Image(systemName: "chevron.right")
            }
            
            Divider()
                .frame(height: 20)
            
            Button("今天", action: onToday)
                .font(.subheadline)
        }
    }
}

// MARK: - Course Filter Chip

struct CourseFilterChip: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(name)
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.blue : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(20)
        }
    }
}

// MARK: - Calendar Day Row

struct CalendarDayRow: View {
    let day: CalendarDay
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(day.weekdayLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Text(String(day.dayOfMonth))
                    .font(.title3)
                    .fontWeight(.semibold)
                
                if day.isToday {
                    Text("今天")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(4)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    if day.bookingCount > 0 {
                        Text("\(day.bookingCount) 节课")
                            .font(.subheadline)
                    }
                    
                    if day.slotCount > 0 {
                        Text("\(day.slotCount) 个空位")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            // Booking list preview
            if !day.bookings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(day.bookings.prefix(3)) { booking in
                        HStack {
                            Text(booking.timeRange)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            Text(booking.studentName)
                                .font(.caption)
                            
                            Text("·")
                                .foregroundStyle(.secondary)
                            
                            Text(booking.courseName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    
                    if day.bookings.count > 3 {
                        Text("还有 \(day.bookings.count - 3) 节...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Day Detail Sheet

struct DayDetailView: View {
    let date: String
    @Bindable var viewModel: CalendarViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var environment
    
    var body: some View {
        NavigationStack {
            if let day = viewModel.calendar?.days.first(where: { $0.date == date }) {
                List {
                    Section {
                        Text(day.weekdayLabel + " " + String(day.dayOfMonth))
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                    
                    if !day.bookings.isEmpty {
                        Section("课程安排") {
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
                            }
                        }
                    } else {
                        ContentUnavailableView {
                            Label("这天没有课程", systemImage: "calendar")
                        }
                    }
                }
                .navigationTitle("课程详情")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("完成") {
                            dismiss()
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
    }
}

extension String: Identifiable {
    public var id: String { self }
}

#Preview {
    CalendarView(viewModel: CalendarViewModel(
        bookingRepo: MockBookingRepository(),
        courseRepo: MockCourseRepository()
    ))
}
