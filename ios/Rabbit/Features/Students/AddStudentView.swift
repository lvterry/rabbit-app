import SwiftUI
import RabbitKit

struct AddStudentView: View {
    @Bindable var viewModel: AddStudentViewModel
    @Environment(\.dismiss) private var dismiss
    
    private var showErrorAlert: Binding<Bool> {
        Binding(
            get: { viewModel.error != nil },
            set: { _ in }
        )
    }
    
    var body: some View {
        NavigationStack {
            if viewModel.createdInvite != nil {
                // Success view with invite
                InviteSuccessView(viewModel: viewModel, onDone: { dismiss() })
            } else {
                // Form view
                Form {
                    Section("学员信息") {
                        TextField("学员姓名", text: $viewModel.studentName)
                        
                        TextField("联系方式（可选）", text: $viewModel.contact)
                    }
                    
                    Section("课程") {
                        if let course = viewModel.selectedCourse {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(course.name)
                                        .font(.headline)
                                    
                                    Text("\(course.durationMinutes) 分钟")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                
                                Spacer()
                                
                                Button("更换") {
                                    viewModel.selectedCourse = nil
                                }
                            }
                        } else {
                            Picker("选择课程", selection: $viewModel.selectedCourse) {
                                Text("请选择").tag(nil as Course?)
                                
                                ForEach(viewModel.courses) { course in
                                    Text(course.name).tag(course as Course?)
                                }
                            }
                        }
                    }
                    
                    Section {
                        Stepper("初始课时: \(viewModel.initialSessions) 节", value: $viewModel.initialSessions, in: 0...100)
                    } footer: {
                        Text("创建学员时可以直接分配初始课时，也可以之后单独添加课时包")
                    }
                    
                    Section {
                        TextField("备注（可选）", text: $viewModel.note, axis: .vertical)
                            .lineLimit(3...6)
                    }
                }
                .navigationTitle("添加学员")
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
                                await viewModel.createStudent()
                            }
                        }
                        .disabled(!viewModel.canCreate || viewModel.isCreating)
                    }
                }
                .alert("创建失败", isPresented: showErrorAlert) {
                    Button("确定", role: .cancel) { }
                } message: {
                    if let error = viewModel.error {
                        Text(error.errorDescription ?? "未知错误")
                    }
                }
            }
        }
        .task {
            await viewModel.loadCourses()
        }
    }
}

// MARK: - Invite Success View

struct InviteSuccessView: View {
    @Bindable var viewModel: AddStudentViewModel
    let onDone: () -> Void
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)
            
            VStack(spacing: 12) {
                Text("学员创建成功")
                    .font(.title2)
                    .fontWeight(.bold)
                
                if let student = viewModel.createdStudent {
                    Text(student.name)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }
            
            if let invite = viewModel.createdInvite {
                VStack(spacing: 20) {
                    Text("分享邀请链接")
                        .font(.headline)
                    
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
                            .lineLimit(2)
                        
                        HStack(spacing: 12) {
                            Button {
                                UIPasteboard.general.string = invite.url
                            } label: {
                                Label("复制", systemImage: "doc.on.doc")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            
                            ShareLink(item: invite.url) {
                                Label("分享", systemImage: "square.and.arrow.up")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding(.horizontal)
                    
                    Text("有效期至 \(invite.expiresLabel)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            Spacer()
            
            Button("完成") {
                onDone()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
    }
}

// MARK: - Add Student ViewModel

@Observable
@MainActor
public final class AddStudentViewModel {
    public var studentName = ""
    public var contact = ""
    public var note = ""
    public var initialSessions = 10
    public var selectedCourse: Course?
    
    public private(set) var courses: [Course] = []
    public private(set) var isCreating = false
    public private(set) var error: RabbitAPIError?
    public private(set) var createdStudent: Student?
    public private(set) var createdInvite: Invite?
    
    private let studentRepo: any StudentRepositoryProtocol
    private let courseRepo: any CourseRepositoryProtocol
    
    public var canCreate: Bool {
        !studentName.isEmpty
    }
    
    public init(studentRepo: any StudentRepositoryProtocol, courseRepo: any CourseRepositoryProtocol) {
        self.studentRepo = studentRepo
        self.courseRepo = courseRepo
    }
    
    public func loadCourses() async {
        do {
            courses = try await courseRepo.courses(includeArchived: false)
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func createStudent() async {
        isCreating = true
        error = nil
        defer { isCreating = false }
        
        do {
            let result = try await studentRepo.createStudent(
                name: studentName,
                contact: contact.isEmpty ? nil : contact,
                courseId: selectedCourse?.courseId,
                initialSessions: initialSessions > 0 ? initialSessions : nil,
                note: note.isEmpty ? nil : note
            )
            
            createdStudent = result.student
            createdInvite = result.invite
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
}

#Preview {
    AddStudentView(viewModel: AddStudentViewModel(
        studentRepo: MockStudentRepository(),
        courseRepo: MockCourseRepository()
    ))
}
