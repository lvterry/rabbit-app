import XCTest
@testable import RabbitKit

final class DTODecodeTests: XCTestCase {
    
    func testBookingDecode() throws {
        let json = """
        {
          "bookingId": "850e8400-e29b-41d4-a716-446655440004",
          "teacherId": "550e8400-e29b-41d4-a716-446655440001",
          "teacherName": "王老师",
          "studentId": "650e8400-e29b-41d4-a716-446655440002",
          "studentName": "张同学",
          "courseId": "750e8400-e29b-41d4-a716-446655440003",
          "courseName": "西班牙语一对一",
          "durationMinutes": 60,
          "packageId": "950e8400-e29b-41d4-a716-446655440005",
          "startAt": "2026-03-03T06:00:00Z",
          "endAt": "2026-03-03T07:00:00Z",
          "date": "2026-03-03",
          "dateLabel": "3月3日 周二",
          "startLocal": "14:00",
          "endLocal": "15:00",
          "timeRange": "14:00-15:00",
          "status": "Upcoming",
          "source": "TeacherCreated",
          "sourceLabel": "老师代约",
          "cancelledAt": null,
          "cancelledBy": null,
          "cancelledByLabel": null,
          "cancellationPolicyResult": null,
          "policyText": null,
          "consumedSession": false,
          "policySnapshotFreeCancelHours": 24,
          "rescheduledFromBookingId": null,
          "rescheduledToBookingId": null,
          "rescheduleCount": 0,
          "maxReschedules": 3,
          "settledAt": null,
          "sessionStatus": null,
          "sessionSource": null,
          "sessionSourceLabel": null,
          "createdAt": "2026-02-20T01:00:00Z",
          "started": false,
          "remaining": 8,
          "reserved": 2,
          "available": 6,
          "actions": {
            "canComplete": false,
            "canMarkNoShow": false,
            "canCancel": true,
            "canReschedule": true,
            "rescheduleLimitReached": false,
            "canUndoComplete": false,
            "undoDeadline": null
          }
        }
        """
        
        let data = json.data(using: .utf8)!
        let booking = try JSONDecoder().decode(Booking.self, from: data)
        
        XCTAssertEqual(booking.bookingId, "850e8400-e29b-41d4-a716-446655440004")
        XCTAssertEqual(booking.studentName, "张同学")
        XCTAssertEqual(booking.courseName, "西班牙语一对一")
        XCTAssertEqual(booking.timeRange, "14:00-15:00")
        XCTAssertEqual(booking.status, .Upcoming)
        XCTAssertEqual(booking.remaining, 8)
        XCTAssertTrue(booking.actions.canCancel)
        XCTAssertTrue(booking.actions.canReschedule)
        XCTAssertFalse(booking.actions.canComplete)
    }
    
    func testSlotDecode() throws {
        let json = """
        {
          "startAt": "2026-03-03T06:00:00Z",
          "endAt": "2026-03-03T07:00:00Z",
          "startLocal": "14:00",
          "endLocal": "15:00",
          "timeRange": "14:00-15:00",
          "label": "14:00"
        }
        """
        
        let data = json.data(using: .utf8)!
        let slot = try JSONDecoder().decode(Slot.self, from: data)
        
        XCTAssertEqual(slot.startAt, "2026-03-03T06:00:00Z")
        XCTAssertEqual(slot.timeRange, "14:00-15:00")
        XCTAssertEqual(slot.label, "14:00")
    }
    
    func testStudentDecode() throws {
        let json = """
        {
          "studentId": "650e8400-e29b-41d4-a716-446655440002",
          "name": "张同学",
          "contact": "微信: zhang123",
          "status": "Active",
          "bound": true,
          "boundName": "张同学",
          "boundEmail": "zhang@example.com",
          "boundAt": "2026-02-15T03:00:00Z"
        }
        """
        
        let data = json.data(using: .utf8)!
        let student = try JSONDecoder().decode(Student.self, from: data)
        
        XCTAssertEqual(student.studentId, "650e8400-e29b-41d4-a716-446655440002")
        XCTAssertEqual(student.name, "张同学")
        XCTAssertEqual(student.status, .Active)
        XCTAssertTrue(student.bound)
    }
    
    func testCourseDecode() throws {
        let json = """
        {
          "courseId": "750e8400-e29b-41d4-a716-446655440003",
          "name": "西班牙语一对一",
          "durationMinutes": 60,
          "allowSelfBooking": true,
          "status": "Active"
        }
        """
        
        let data = json.data(using: .utf8)!
        let course = try JSONDecoder().decode(Course.self, from: data)
        
        XCTAssertEqual(course.courseId, "750e8400-e29b-41d4-a716-446655440003")
        XCTAssertEqual(course.name, "西班牙语一对一")
        XCTAssertEqual(course.durationMinutes, 60)
        XCTAssertTrue(course.allowSelfBooking)
        XCTAssertEqual(course.status, .Active)
    }
    
    func testAPIResponseEnvelopeDecode() throws {
        let json = """
        {
          "ok": true,
          "data": {
            "courseId": "750e8400-e29b-41d4-a716-446655440003",
            "name": "西班牙语一对一",
            "durationMinutes": 60,
            "allowSelfBooking": true,
            "status": "Active"
          },
          "meta": {
            "generatedAt": "2026-02-20T02:11:00Z",
            "requestId": "req_test"
          }
        }
        """
        
        let data = json.data(using: .utf8)!
        let response = try JSONDecoder().decode(APIResponse<Course>.self, from: data)
        
        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.data.name, "西班牙语一对一")
        XCTAssertEqual(response.meta.requestId, "req_test")
    }
    
    func testAPIErrorDecode() throws {
        let json = """
        {
          "ok": false,
          "code": "SLOT_TAKEN",
          "message": "这个时间刚被预约了，请选择其他时间。",
          "retryable": false,
          "details": {"date": "2026-03-03"},
          "requestId": "req_test"
        }
        """
        
        let data = json.data(using: .utf8)!
        let error = try JSONDecoder().decode(APIError.self, from: data)
        
        XCTAssertFalse(error.ok)
        XCTAssertEqual(error.code, "SLOT_TAKEN")
        XCTAssertEqual(error.message, "这个时间刚被预约了，请选择其他时间。")
        XCTAssertFalse(error.retryable)
    }
}
