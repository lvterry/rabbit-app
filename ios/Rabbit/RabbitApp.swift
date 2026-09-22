import SwiftUI
import RabbitKit

@main
struct RabbitApp: App {
    @State private var environment = AppEnvironment()
    @ObservedObject private var sessionStore = SessionStore.shared
    
    var body: some Scene {
        WindowGroup {
            if sessionStore.isAuthenticated && sessionStore.teacher != nil {
                MainTabView()
                    .environment(environment)
                    .environmentObject(sessionStore)
            } else {
                OnboardingView()
                    .environment(environment)
                    .environmentObject(sessionStore)
            }
        }
    }
}
