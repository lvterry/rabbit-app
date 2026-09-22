import SwiftUI
import RabbitKit

struct ProfileView: View {
    @EnvironmentObject var sessionStore: SessionStore
    
    var body: some View {
        NavigationStack {
            List {
                // Teacher info section
                if let teacher = sessionStore.teacher {
                    Section {
                        HStack {
                            if let avatarUrl = teacher.avatarUrl {
                                AsyncImage(url: URL(string: avatarUrl)) { image in
                                    image
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Color(.systemGray5)
                                }
                                .frame(width: 60, height: 60)
                                .clipShape(Circle())
                            } else {
                                Image(systemName: "person.circle.fill")
                                    .font(.system(size: 60))
                                    .foregroundStyle(.gray)
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(teacher.name)
                                    .font(.headline)
                                
                                if let user = sessionStore.currentUser, let nickname = user.nickname {
                                    Text(nickname)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.leading, 8)
                        }
                    }
                }
                
                // Management section
                Section("管理") {
                    NavigationLink {
                        CourseManagementView(viewModel: CourseListViewModel(
                            repo: CourseRepository(client: HTTPClient(baseURL: URL(string: ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:8787")!))
                        ))
                    } label: {
                        Label("课程管理", systemImage: "book")
                    }
                    
                    NavigationLink {
                        AvailabilityManagementView(viewModel: AvailabilityViewModel(
                            repo: AvailabilityRepository(client: HTTPClient(baseURL: URL(string: ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:8787")!))
                        ))
                    } label: {
                        Label("开放时间", systemImage: "clock")
                    }
                    
                    NavigationLink {
                        // TODO: Rules view
                        Text("预约规则")
                    } label: {
                        Label("预约规则", systemImage: "slider.horizontal.3")
                    }
                }
                
                // Settings section
                Section("设置") {
                    NavigationLink {
                        // TODO: Notifications
                        Text("通知设置")
                    } label: {
                        Label("通知设置", systemImage: "bell")
                    }
                    
                    Button(role: .destructive) {
                        sessionStore.clearSession()
                    } label: {
                        Label("退出登录", systemImage: "arrow.right.square")
                    }
                }
                
                // Demo tools (only in dev mode)
                if ProcessInfo.processInfo.environment["DEMO_MODE"] == "true" {
                    Section("开发工具") {
                        Button {
                            // TODO: Run settlement
                        } label: {
                            Label("运行自动结算", systemImage: "clock.arrow.circlepath")
                        }
                        
                        Button {
                            // TODO: Reset data
                        } label: {
                            Label("重置演示数据", systemImage: "arrow.clockwise")
                        }
                    }
                }
            }
            .navigationTitle("我的")
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(SessionStore.shared)
}
