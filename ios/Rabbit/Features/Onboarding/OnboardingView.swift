import SwiftUI
import RabbitKit

struct OnboardingView: View {
    @EnvironmentObject var sessionStore: SessionStore
    @State private var isAuthenticating = false
    @State private var authError: String?
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            // Rabbit mascot logo
            Image("RabbitLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
            
            VStack(spacing: 16) {
                Text("欢迎使用 Rabbit")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("让老师的排课和课时账，从微信聊天里搬出来")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            Spacer()
            
            VStack(spacing: 16) {
                // Sign in with Apple button
                Button {
                    // TODO: Implement Sign in with Apple
                } label: {
                    HStack {
                        Image(systemName: "applelogo")
                        Text("使用 Apple 登录")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.black)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                
                #if DEBUG
                // Dev teacher auth (DEBUG only, never in Release)
                Button {
                    Task {
                        await authenticateDevTeacher()
                    }
                } label: {
                    HStack {
                        Image(systemName: "wrench.and.screwdriver")
                        Text("Dev: Sign in as seeded teacher")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.orange.opacity(0.8))
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isAuthenticating)
                
                if let error = authError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
                #endif
                
                Text("登录即表示您同意我们的服务条款和隐私政策")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
    }
    
    #if DEBUG
    private func authenticateDevTeacher() async {
        isAuthenticating = true
        authError = nil
        
        do {
            try await sessionStore.authenticateDevTeacher()
            // Session is now authenticated; MainTabView will appear
        } catch {
            authError = "Dev auth failed: \(error.localizedDescription)"
        }
        
        isAuthenticating = false
    }
    #endif
}

#Preview {
    OnboardingView()
        .environmentObject(SessionStore.shared)
}
