import SwiftUI
import RabbitKit

struct MainTabView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    
    @State private var todayViewModel: TodayViewModel?
    @State private var calendarViewModel: CalendarViewModel?
    @State private var studentListViewModel: StudentListViewModel?
    
    var body: some View {
        TabView {
            TodayView(viewModel: todayViewModel ?? TodayViewModel(repo: environment.bookingRepository))
                .tabItem {
                    Label("今天", systemImage: "calendar.day.timeline.leading")
                }
            
            CalendarView(viewModel: calendarViewModel ?? CalendarViewModel(
                bookingRepo: environment.bookingRepository,
                courseRepo: environment.courseRepository
            ))
                .tabItem {
                    Label("日历", systemImage: "calendar")
                }
            
            StudentListView(viewModel: studentListViewModel ?? StudentListViewModel(repo: environment.studentRepository))
                .tabItem {
                    Label("学员", systemImage: "person.2")
                }
            
            ProfileView()
                .tabItem {
                    Label("我的", systemImage: "person.circle")
                }
        }
        .tint(.brandGreen)
        .onAppear {
            if todayViewModel == nil {
                todayViewModel = TodayViewModel(repo: environment.bookingRepository)
            }
            if calendarViewModel == nil {
                calendarViewModel = CalendarViewModel(
                    bookingRepo: environment.bookingRepository,
                    courseRepo: environment.courseRepository
                )
            }
            if studentListViewModel == nil {
                studentListViewModel = StudentListViewModel(repo: environment.studentRepository)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await todayViewModel?.refresh()
                    await calendarViewModel?.refresh()
                    await studentListViewModel?.refresh()
                }
            }
        }
    }
}

#Preview {
    MainTabView()
        .environment(AppEnvironment())
}
