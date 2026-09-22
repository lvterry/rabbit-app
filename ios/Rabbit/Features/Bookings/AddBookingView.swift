import SwiftUI
import RabbitKit

struct AddBookingView: View {
    @Bindable var viewModel: AddBookingViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            Form {
                // Step 1: Select Student
                Section("选择学员") {
                    if let student = viewModel.selectedStudent {
                        HStack {
                            Text(student.name)
                                .font(.headline)
                            
                            Spacer()
                            
                            Button("更换") {
                                viewModel.clearStudent()
                            }
                            .font(.subheadline)
                        }
                    } else {
                        NavigationLink {
                            StudentPickerView(viewModel: viewModel)
                        } label: {
                            Text("选择学员")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                
                // Step 2: Select Course
                if viewModel.selectedStudent != nil {
                    Section("选择课程") {
                        if let course = viewModel.selectedCourse {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(course.courseName)
                                        .font(.headline)
                                    
                                    Text("\(course.durationMinutes) 分钟")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                
                                Spacer()
                                
                                Button("更换") {
                                    viewModel.clearCourse()
                                }
                                .font(.subheadline)
                            }
                            
                            HStack {
                                Text("剩余课时")
                                    .foregroundStyle(.secondary)
                                
                                Spacer()
                                
                                Text("\(course.available) 节")
                                        .fontWeight(.medium)
                            }
                        } else {
                            ForEach(viewModel.availableCourses) { course in
                                Button {
                                    viewModel.selectCourse(course)
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading) {
                                            Text(course.courseName)
                                            
                                            Text("\(course.durationMinutes) 分钟")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        
                                        Spacer()
                                        
                                        Text("剩余 \(course.available) 节")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .foregroundColor(.primary)
                            }
                        }
                    }
                }
                
                // Step 3: Select Date
                if viewModel.selectedCourse != nil {
                    Section("选择日期") {
                        if let date = viewModel.selectedDate {
                            HStack {
                                Text(date)
                                    .font(.headline)
                                
                                Spacer()
                                
                                Button("更换") {
                                    viewModel.clearDate()
                                }
                                .font(.subheadline)
                            }
                        } else {
                            DatePicker(
                                "日期",
                                selection: Binding(
                                    get: { Date() },
                                    set: { date in
                                        let formatter = DateFormatter()
                                        formatter.dateFormat = "yyyy-MM-dd"
                                        let dateString = formatter.string(from: date)
                                        Task {
                                            await viewModel.selectDate(dateString)
                                        }
                                    }
                                ),
                                displayedComponents: .date
                            )
                        }
                    }
                }
                
                // Step 4: Select Time
                if viewModel.selectedDate != nil {
                    Section("选择时间") {
                        if let slot = viewModel.selectedSlot {
                            HStack {
                                Text(slot.timeRange)
                                    .font(.headline)
                                
                                Spacer()
                                
                                Button("更换") {
                                    viewModel.clearSlot()
                                }
                                .font(.subheadline)
                            }
                        } else if viewModel.isLoadingSlots {
                            HStack {
                                ProgressView()
                                Text("加载可用时间...")
                                    .foregroundStyle(.secondary)
                            }
                        } else if let reasonText = viewModel.slotsReasonText {
                            Text(reasonText)
                                .foregroundStyle(.secondary)
                        } else if !viewModel.availableSlots.isEmpty {
                            ForEach(viewModel.availableSlots) { slot in
                                Button {
                                    viewModel.selectSlot(slot)
                                } label: {
                                    HStack {
                                        Text(slot.timeRange)
                                        
                                        Spacer()
                                        
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .foregroundColor(.primary)
                            }
                        }
                    }
                }
                
                // Outside availability warning
                if viewModel.showOutsideAvailabilityWarning {
                    Section {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("时间不在开放时间内")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                
                                Text("该时间不在你的开放时间内，学员将无法自主预约此时间。")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("创建预约")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("创建") {
                        Task {
                            await viewModel.createBooking()
                            if viewModel.createdBooking != nil {
                                dismiss()
                            }
                        }
                    }
                    .disabled(!viewModel.canCreate || viewModel.isCreating)
                }
            }
            .alert("创建预约", isPresented: $viewModel.showOutsideAvailabilityConfirm) {
                Button("取消", role: .cancel) { }
                Button("仍要创建") {
                    Task {
                        await viewModel.confirmCreateOutsideAvailability()
                        if viewModel.createdBooking != nil {
                            dismiss()
                        }
                    }
                }
            } message: {
                Text("该时间不在你的开放时间内，学员将无法自主预约此时间。仍要创建吗？")
            }
            .alert("创建失败", isPresented: Binding(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.clearError() } }
            )) {
                Button("确定", role: .cancel) { }
            } message: {
                if let error = viewModel.error {
                    Text(error.errorDescription ?? "未知错误")
                }
            }
        }
        .task {
            await viewModel.loadInitialData()
        }
    }
}

// MARK: - Student Picker

struct StudentPickerView: View {
    @Bindable var viewModel: AddBookingViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        List {
            ForEach(viewModel.students) { student in
                Button {
                    viewModel.selectStudent(student)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(student.name)
                            .font(.headline)
                        
                        if student.remainingTotal > 0 {
                            Text("剩余 \(student.remainingTotal) 节课")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle("选择学员")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Add Booking ViewModel

@Observable
@MainActor
public final class AddBookingViewModel {
    public private(set) var students: [StudentSummary] = []
    public private(set) var courses: [Course] = []
    public private(set) var availableSlots: [Slot] = []
    public private(set) var isLoadingSlots = false
    public private(set) var slotsReasonText: String?
    public private(set) var isCreating = false
    public private(set) var error: RabbitAPIError?
    public private(set) var createdBooking: Booking?
    
    public var selectedStudent: StudentSummary?
    public var selectedCourse: StudentCourse?
    public var selectedDate: String?
    public var selectedSlot: Slot?
    public var showOutsideAvailabilityWarning = false
    public var showOutsideAvailabilityConfirm = false
    
    private let studentRepo: any StudentRepositoryProtocol
    private let bookingRepo: any BookingRepositoryProtocol
    private var teacherId: String = ""
    
    public var availableCourses: [StudentCourse] {
        guard let student = selectedStudent else { return [] }
        return student.courseSummaries.map { summary in
            StudentCourse(
                courseId: summary.courseId,
                courseName: summary.courseName,
                durationMinutes: 60, // Default, should come from course
                courseStatus: "Active",
                remaining: summary.remaining,
                reserved: summary.reserved,
                available: summary.available
            )
        }
    }
    
    public var canCreate: Bool {
        selectedStudent != nil && selectedCourse != nil && selectedDate != nil && selectedSlot != nil
    }
    
    public init(studentRepo: any StudentRepositoryProtocol, bookingRepo: any BookingRepositoryProtocol) {
        self.studentRepo = studentRepo
        self.bookingRepo = bookingRepo
    }
    
    public func loadInitialData() async {
        do {
            let listView = try await studentRepo.students(query: nil, status: .Active)
            students = listView.students
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func selectStudent(_ student: StudentSummary) {
        selectedStudent = student
        // Clear downstream selections
        selectedCourse = nil
        selectedDate = nil
        selectedSlot = nil
    }
    
    public func clearStudent() {
        selectedStudent = nil
        selectedCourse = nil
        selectedDate = nil
        selectedSlot = nil
    }
    
    public func selectCourse(_ course: StudentCourse) {
        selectedCourse = course
        selectedDate = nil
        selectedSlot = nil
    }
    
    public func clearCourse() {
        selectedCourse = nil
        selectedDate = nil
        selectedSlot = nil
    }
    
    public func selectDate(_ date: String) async {
        selectedDate = date
        selectedSlot = nil
        await loadSlots()
    }
    
    public func clearDate() {
        selectedDate = nil
        selectedSlot = nil
    }
    
    public func selectSlot(_ slot: Slot) {
        selectedSlot = slot
    }
    
    public func clearSlot() {
        selectedSlot = nil
    }
    
    private func loadSlots() async {
        guard let courseId = selectedCourse?.courseId,
              let date = selectedDate else {
            return
        }
        
        isLoadingSlots = true
        slotsReasonText = nil
        availableSlots = []
        defer { isLoadingSlots = false }
        
        // Mock: Generate some sample slots
        // In real implementation, would call API
        availableSlots = [
            Slot(startAt: date + "T06:00:00Z", endAt: date + "T07:00:00Z",
                 startLocal: "14:00", endLocal: "15:00", timeRange: "14:00-15:00", label: "14:00"),
            Slot(startAt: date + "T06:30:00Z", endAt: date + "T07:30:00Z",
                 startLocal: "14:30", endLocal: "15:30", timeRange: "14:30-15:30", label: "14:30"),
            Slot(startAt: date + "T08:00:00Z", endAt: date + "T09:00:00Z",
                 startLocal: "16:00", endLocal: "17:00", timeRange: "16:00-17:00", label: "16:00")
        ]
    }
    
    public func createBooking() async {
        guard let student = selectedStudent,
              let course = selectedCourse,
              let slot = selectedSlot else {
            return
        }
        
        isCreating = true
        error = nil
        defer { isCreating = false }
        
        do {
            createdBooking = try await bookingRepo.createBooking(
                studentId: student.studentId,
                courseId: course.courseId,
                startAt: slot.startAt
            )
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func confirmCreateOutsideAvailability() async {
        await createBooking()
    }
    
    public func clearError() {
        error = nil
    }
}
