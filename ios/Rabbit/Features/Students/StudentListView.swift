import SwiftUI
import RabbitKit

struct StudentListView: View {
    @Bindable var viewModel: StudentListViewModel
    @Environment(AppEnvironment.self) private var environment
    @State private var showAddStudent = false
    
    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.students.isEmpty {
                    ProgressView()
                } else if viewModel.students.isEmpty {
                    if viewModel.searchQuery.isEmpty {
                        ContentUnavailableView {
                            Label("还没有学员", systemImage: "person.2")
                        } description: {
                            Text("点击右上角添加您的第一位学员")
                        }
                    } else {
                        ContentUnavailableView.search(text: viewModel.searchQuery)
                    }
                } else {
                    List {
                        // Stats section
                        if let stats = viewModel.stats, viewModel.searchQuery.isEmpty {
                            Section {
                                HStack {
                                    StatItem(label: "总计", value: "\(stats.total)")
                                    Divider()
                                    StatItem(label: "活跃", value: "\(stats.active)")
                                    Divider()
                                    StatItem(label: "未绑定", value: "\(stats.unbound)")
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        
                        // Students list
                        Section {
                            ForEach(viewModel.students) { student in
                                NavigationLink {
                                    StudentDetailView(
                                        viewModel: StudentDetailViewModel(
                                            studentId: student.studentId,
                                            studentRepo: viewModel.studentRepo
                                        )
                                    )
                                } label: {
                                    StudentListRow(student: student)
                                }
                            }
                        }
                    }
                    .refreshable {
                        await viewModel.refresh()
                    }
                }
            }
            .navigationTitle("学员")
            .background(Color.bgApp)
            .searchable(text: $viewModel.searchQuery, prompt: "搜索学员姓名")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showAddStudent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddStudent) {
                AddStudentView(viewModel: AddStudentViewModel(
                    studentRepo: environment.studentRepository,
                    courseRepo: environment.courseRepository
                ))
            }
        }
        .task {
            if viewModel.students.isEmpty && viewModel.searchQuery.isEmpty {
                await viewModel.refresh()
            }
        }
        .onChange(of: viewModel.searchQuery) { _, newQuery in
            Task {
                try? await Task.sleep(for: .milliseconds(300))
                await viewModel.search(newQuery)
            }
        }
    }
}

// MARK: - Student List Row

struct StudentListRow: View {
    let student: StudentSummary
    
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(spacing: Spacing.sm) {
                    Text(student.name)
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundColor(.inkPrimary)
                    
                    if !student.bound {
                        Text("未绑定")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(.accentBlush)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, 2)
                            .background(Color.accentBlushSoft)
                            .cornerRadius(CornerRadius.sm)
                    }
                }
                
                if !student.courseSummaries.isEmpty {
                    HStack(spacing: Spacing.xs) {
                        ForEach(student.courseSummaries, id: \.courseId) { course in
                            Text(course.courseName)
                                .font(.caption)
                                .foregroundColor(.inkSecondary)
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, 2)
                                .background(Color.bgGrouped)
                                .cornerRadius(CornerRadius.sm)
                        }
                    }
                }
                
                if let nextBooking = student.nextBooking {
                    HStack(spacing: 4) {
                        Image(systemName: "calendar")
                            .font(.caption2)
                            .foregroundColor(.brandGreen)
                        
                        Text("下节课: \(nextBooking.dateLabel) \(nextBooking.timeRange)")
                            .font(.caption)
                            .foregroundColor(.brandGreen)
                    }
                }
            }
            
            Spacer()
            
            if student.remainingTotal > 0 {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(student.remainingTotal)")
                        .font(.title3)
                        .fontWeight(.bold)
                        .monospacedDigit()
                        .foregroundColor(.brandGreen)
                    
                    Text("节")
                        .font(.caption)
                        .foregroundColor(.inkSecondary)
                }
            }
        }
        .padding(.vertical, Spacing.xs)
    }
}

// MARK: - Stat Item

struct StatItem: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: Spacing.xs) {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundColor(.inkPrimary)
            
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.inkSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    StudentListView(viewModel: StudentListViewModel(repo: MockStudentRepository()))
        .environment(AppEnvironment())
}
