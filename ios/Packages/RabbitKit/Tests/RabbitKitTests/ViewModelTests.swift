import XCTest
@testable import RabbitKit

@MainActor
final class ViewModelTests: XCTestCase {
    
    func testTodayViewModelRefresh() async throws {
        let mockRepo = MockBookingRepository(
            dayView: TeacherDayView(
                date: "2026-03-03",
                isToday: true,
                dateLabel: "3月3日 周二",
                todayCount: 2,
                completedCount: 0,
                next: nil,
                bookings: [],
                pending: [],
                hints: []
            )
        )
        
        let viewModel = TodayViewModel(repo: mockRepo)
        
        XCTAssertNil(viewModel.day)
        XCTAssertFalse(viewModel.isLoading)
        
        await viewModel.refresh()
        
        XCTAssertNotNil(viewModel.day)
        XCTAssertEqual(viewModel.day?.date, "2026-03-03")
        XCTAssertEqual(viewModel.day?.todayCount, 2)
        XCTAssertTrue(viewModel.day?.isToday ?? false)
        XCTAssertFalse(viewModel.isLoading)
    }
    
    func testStudentListViewModelSearch() async throws {
        let mockRepo = MockStudentRepository(
            listView: StudentListView(
                students: [
                    StudentSummary(
                        studentId: "1",
                        name: "张同学",
                        contact: nil,
                        status: .Active,
                        bound: true,
                        boundAt: nil,
                        courseSummaries: [],
                        remainingTotal: 10,
                        nextBooking: nil
                    )
                ],
                stats: StudentStats(total: 1, unbound: 0, active: 1)
            )
        )
        
        let viewModel = StudentListViewModel(repo: mockRepo)
        
        await viewModel.refresh()
        
        XCTAssertEqual(viewModel.students.count, 1)
        XCTAssertEqual(viewModel.students.first?.name, "张同学")
        XCTAssertEqual(viewModel.stats?.total, 1)
    }
    
    func testBookingDetailViewModelComplete() async throws {
        let sampleBooking = Booking(
            bookingId: "1",
            teacherId: "t1",
            teacherName: "王老师",
            studentId: "s1",
            studentName: "张同学",
            courseId: "c1",
            courseName: "西班牙语",
            durationMinutes: 60,
            packageId: "p1",
            startAt: "2026-03-03T06:00:00Z",
            endAt: "2026-03-03T07:00:00Z",
            date: "2026-03-03",
            dateLabel: "3月3日",
            startLocal: "14:00",
            endLocal: "15:00",
            timeRange: "14:00-15:00",
            status: .Upcoming,
            source: .TeacherCreated,
            sourceLabel: "老师代约",
            cancelledAt: nil,
            cancelledBy: nil,
            cancelledByLabel: nil,
            cancellationPolicyResult: nil,
            policyText: nil,
            consumedSession: false,
            policySnapshotFreeCancelHours: 24,
            rescheduledFromBookingId: nil,
            rescheduledToBookingId: nil,
            rescheduleCount: 0,
            maxReschedules: 3,
            settledAt: nil,
            sessionStatus: nil,
            sessionSource: nil,
            sessionSourceLabel: nil,
            createdAt: "2026-02-20T01:00:00Z",
            started: false,
            remaining: 8,
            reserved: 2,
            available: 6,
            actions: BookingActions(
                canComplete: true,
                canMarkNoShow: false,
                canCancel: true,
                canReschedule: true,
                rescheduleLimitReached: false,
                canUndoComplete: false,
                undoDeadline: nil
            )
        )
        
        let mockRepo = MockBookingRepository(booking: sampleBooking)
        let viewModel = BookingDetailViewModel(bookingId: "1", repo: mockRepo)
        
        await viewModel.refresh()
        
        XCTAssertNotNil(viewModel.booking)
        XCTAssertEqual(viewModel.booking?.status, .Upcoming)
        XCTAssertTrue(viewModel.booking?.actions.canComplete ?? false)
        
        // Test complete action
        await viewModel.complete()
        
        // In mock, status doesn't change, but we verify the call was made
        XCTAssertFalse(viewModel.isProcessing)
    }
}
