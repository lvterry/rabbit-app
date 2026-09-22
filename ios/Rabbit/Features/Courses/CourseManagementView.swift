import SwiftUI
import RabbitKit

struct CourseManagementView: View {
    @Bindable var viewModel: CourseListViewModel
    @State private var showAddCourse = false
    @State private var editingCourse: Course?
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.courses.isEmpty {
                    ProgressView()
                } else if viewModel.courses.isEmpty {
                    ContentUnavailableView {
                        Label("还没有课程", systemImage: "book")
                    } description: {
                        Text("点击右上角添加您的第一门课程")
                    }
                } else {
                    List {
                        ForEach(viewModel.courses) { course in
                            CourseRow(course: course, onEdit: {
                                editingCourse = course
                            }, onArchive: {
                                Task {
                                    await viewModel.updateCourseStatus(
                                        id: course.courseId,
                                        status: course.status == .Active ? .Archived : .Active
                                    )
                                }
                            })
                        }
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
                }
            }
            .navigationTitle("课程管理")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddCourse = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddCourse) {
                CourseEditView(
                    course: nil,
                    onSave: { name, duration, allowSelfBooking in
                        Task {
                            await viewModel.createCourse(
                                name: name,
                                durationMinutes: duration,
                                allowSelfBooking: allowSelfBooking
                            )
                            showAddCourse = false
                        }
                    }
                )
            }
            .sheet(item: $editingCourse) { course in
                CourseEditView(
                    course: course,
                    onSave: { name, duration, allowSelfBooking in
                        // TODO: Update course
                        editingCourse = nil
                    }
                )
            }
        }
        .task {
            if viewModel.courses.isEmpty {
                await viewModel.refresh()
            }
        }
    }
}

// MARK: - Course Row

struct CourseRow: View {
    let course: Course
    let onEdit: () -> Void
    let onArchive: () -> Void
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(course.name)
                    .font(.headline)
                
                HStack {
                    Text("\(course.durationMinutes) 分钟")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    
                    if course.allowSelfBooking {
                        Text("·")
                            .foregroundStyle(.secondary)
                        
                        Text("允许自主预约")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            Spacer()
            
            if course.status == .Archived {
                Text("已归档")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.gray.opacity(0.2))
                    .cornerRadius(4)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(course.status == .Active ? "归档" : "恢复") {
                onArchive()
            }
            .tint(course.status == .Active ? .orange : .green)
            
            Button("编辑") {
                onEdit()
            }
            .tint(.blue)
        }
    }
}

// MARK: - Course Edit View

struct CourseEditView: View {
    let course: Course?
    let onSave: (String, Int, Bool) -> Void
    
    @State private var name: String
    @State private var durationMinutes: Int
    @State private var allowSelfBooking: Bool
    @Environment(\.dismiss) private var dismiss
    
    init(course: Course?, onSave: @escaping (String, Int, Bool) -> Void) {
        self.course = course
        self.onSave = onSave
        _name = State(initialValue: course?.name ?? "")
        _durationMinutes = State(initialValue: course?.durationMinutes ?? 60)
        _allowSelfBooking = State(initialValue: course?.allowSelfBooking ?? true)
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section("基本信息") {
                    TextField("课程名称", text: $name)
                    
                    Picker("课程时长", selection: $durationMinutes) {
                        Text("30 分钟").tag(30)
                        Text("45 分钟").tag(45)
                        Text("60 分钟").tag(60)
                        Text("90 分钟").tag(90)
                        Text("120 分钟").tag(120)
                    }
                }
                
                Section {
                    Toggle("允许学员自主预约", isOn: $allowSelfBooking)
                } footer: {
                    Text("关闭后，只能由您手动创建预约")
                }
            }
            .navigationTitle(course == nil ? "新建课程" : "编辑课程")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        onSave(name, durationMinutes, allowSelfBooking)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}

#Preview {
    CourseManagementView(viewModel: CourseListViewModel(
        repo: MockCourseRepository()
    ))
}
