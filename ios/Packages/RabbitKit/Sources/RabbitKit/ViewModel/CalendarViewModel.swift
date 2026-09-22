import Foundation
import Observation

@Observable
@MainActor
public final class CalendarViewModel {
    public private(set) var calendar: TeacherCalendarView?
    public private(set) var courses: [Course] = []
    public private(set) var selectedCourseId: String?
    public private(set) var isLoading = false
    public private(set) var error: RabbitAPIError?
    
    private let bookingRepo: any BookingRepositoryProtocol
    private let courseRepo: any CourseRepositoryProtocol
    
    private var currentFrom: String = ""
    private var currentTo: String = ""
    
    public var currentWeekLabel: String {
        guard let calendar = calendar else { return "" }
        return "\(calendar.from) - \(calendar.to)"
    }
    
    public init(bookingRepo: any BookingRepositoryProtocol, courseRepo: any CourseRepositoryProtocol) {
        self.bookingRepo = bookingRepo
        self.courseRepo = courseRepo
    }
    
    public func refresh() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            courses = try await courseRepo.courses(includeArchived: false)
            
            let today = Date()
            let calendar = Calendar.current
            let weekday = calendar.component(.weekday, from: today)
            let daysToMonday = (weekday == 1) ? 6 : weekday - 2
            
            guard let monday = calendar.date(byAdding: .day, value: -daysToMonday, to: today),
                  let sunday = calendar.date(byAdding: .day, value: 6, to: monday) else {
                return
            }
            
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            currentFrom = formatter.string(from: monday)
            currentTo = formatter.string(from: sunday)
            
            self.calendar = try await bookingRepo.teacherCalendar(
                from: currentFrom,
                to: currentTo,
                courseId: selectedCourseId
            )
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
    
    public func previousWeek() async {
        await moveWeek(by: -7)
    }
    
    public func nextWeek() async {
        await moveWeek(by: 7)
    }
    
    public func goToToday() async {
        await refresh()
    }
    
    public func selectCourse(_ courseId: String?) async {
        selectedCourseId = courseId
        await loadCalendar()
    }
    
    private func moveWeek(by days: Int) async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        
        guard let fromDate = formatter.date(from: currentFrom),
              let newFrom = Calendar.current.date(byAdding: .day, value: days, to: fromDate),
              let newTo = Calendar.current.date(byAdding: .day, value: 6, to: newFrom) else {
            return
        }
        
        currentFrom = formatter.string(from: newFrom)
        currentTo = formatter.string(from: newTo)
        
        await loadCalendar()
    }
    
    private func loadCalendar() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        
        do {
            self.calendar = try await bookingRepo.teacherCalendar(
                from: currentFrom,
                to: currentTo,
                courseId: selectedCourseId
            )
        } catch let err as RabbitAPIError {
            error = err
        } catch let caught {
            error = .unknown(caught)
        }
    }
}
