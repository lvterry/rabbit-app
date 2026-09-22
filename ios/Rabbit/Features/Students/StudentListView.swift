import SwiftUI
import RabbitKit

struct StudentListView: View {
    @Bindable var viewModel: StudentListViewModel
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
                                    // TODO: Student detail view
                                    Text("学员详情: \(student.name)")
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
                // TODO: Add student view
                Text("添加学员")
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
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(student.name)
                    .font(.headline)
                
                if !student.bound {
                    Image(systemName: "link.badge.plus")
                        .foregroundStyle(.orange)
                        .font(.caption)
                }
                
                Spacer()
                
                if student.remainingTotal > 0 {
                    Text("剩余 \(student.remainingTotal) 节")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            
            if !student.courseSummaries.isEmpty {
                HStack(spacing: 8) {
                    ForEach(student.courseSummaries, id: \.courseId) { course in
                        Text(course.courseName)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(.systemGray6))
                            .cornerRadius(4)
                    }
                }
            }
            
            if let nextBooking = student.nextBooking {
                Text("下节课: \(nextBooking.dateLabel) \(nextBooking.timeRange)")
                    .font(.caption)
                    .foregroundStyle(.blue)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Stat Item

struct StatItem: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    StudentListView(viewModel: StudentListViewModel(repo: MockStudentRepository()))
        .environment(AppEnvironment())
}
