# Rabbit iOS Teacher App

SwiftUI-based iOS app for independent teachers to manage bookings, students, courses, and availability.

## Architecture

### Layering

```
View (SwiftUI)
  ↓
ViewModel (@Observable, @MainActor)
  ↓
Repository (actor)
  ↓
APIClient (HTTPClient)
```

### Project Structure

```
ios/
├── Rabbit.xcodeproj          # Xcode project
├── Rabbit/                    # App layer
│   ├── RabbitApp.swift       # App entry point
│   ├── AppEnvironment.swift  # Dependency injection
│   ├── MainTabView.swift     # Root tab view
│   ├── Features/             # Feature screens
│   │   ├── Today/            # T01: Today view
│   │   ├── Students/         # T05: Student list, T06: Student detail
│   │   ├── Profile/          # T08: Profile & settings
│   │   └── Onboarding/       # Teacher onboarding
│   └── Components/           # Reusable UI components
└── Packages/RabbitKit/       # SwiftPM package
    ├── Package.swift
    ├── Sources/RabbitKit/
    │   ├── DTO/              # Data transfer objects (match fixtures)
    │   ├── APIClient/        # HTTP client & endpoints
    │   ├── Auth/             # SessionStore, Keychain
    │   ├── Repository/       # Data repositories
    │   └── ViewModel/        # View models
    └── Tests/RabbitKitTests/ # Unit tests
```

## Requirements

- iOS 17.0+
- Xcode 15.0+
- Swift 5.9+

## Getting Started

### 1. Open Project

```bash
open ios/Rabbit.xcodeproj
```

### 2. Configure Environment

Set environment variables in Xcode scheme (Edit Scheme → Run → Arguments → Environment Variables):

- `API_BASE_URL` - API server URL (default: `http://localhost:8787`)
- `DEMO_MODE` - Enable demo tools (set to `true` for development)

### 3. Build & Run

Select iPhone 15 simulator and run (⌘R).

## Features Implemented

### Phase 1 (MVP Mock-First)

#### Screens

- [x] **Root/Onboarding** - Sign in with Apple placeholder
- [x] **T01 Today** - Today's bookings, next class, pending actions
- [x] **T05 Students** - Student list with search
- [x] **T08 Profile** - Teacher info, management shortcuts

#### Architecture

- [x] **DTOs** - All types matching `contracts/fixtures/*.json` field-for-field
- [x] **API Client** - HTTPClient with error handling, idempotency keys
- [x] **Repositories** - Booking, Student, Course, Availability repositories
- [x] **ViewModels** - Observable ViewModels using @Observable (iOS 17+)
- [x] **Mock Repositories** - For SwiftUI Previews and offline development

#### Key Principles

- [x] Server-calculated display strings (no timezone conversion in client)
- [x] Actions from server (`canComplete`, `canCancel`, etc.)
- [x] View → ViewModel → Repository → APIClient layering
- [x] No business logic in views

### Not Yet Implemented

The following screens and features are defined in the architecture but not yet fully implemented:

- T02 Calendar
- T03 Booking Detail (teacher view)
- T04 Add/Reschedule Booking
- T06 Student Detail (started but incomplete)
- T07 Add Student
- T09 Course Management
- T10 Availability Management
- T11 Booking Rules
- Transaction list
- Sign in with Apple integration
- APNs push notifications
- QR code generation for invites

## Data Flow

### 1. User Interaction

```swift
Button("完成课程") {
    Task {
        await detail.complete()
        await today.refresh()  // Explicit refresh
    }
}
.disabled(!(detail.booking?.actions.canComplete ?? false))
```

### 2. ViewModel → Repository

```swift
@Observable @MainActor
final class BookingDetailViewModel {
    func complete() async {
        booking = try await repo.completeBooking(id: bookingId)
    }
}
```

### 3. Repository → APIClient

```swift
actor BookingRepository {
    func completeBooking(id: String) async throws -> Booking {
        let idempotencyKey = UUID().uuidString
        return try await client.post(.bookingCompletion(id), 
                                     idempotencyKey: idempotencyKey)
    }
}
```

### 4. APIClient → Server

```swift
POST /v1/bookings/:id/completion
Authorization: Bearer <token>
Idempotency-Key: <uuid>
```

## Key Design Decisions

### 1. Server-Provided Display Strings

**Rationale**: Timezone conversion is error-prone and violates business logic separation.

```swift
// ✅ Correct: Use server-provided display string
Text(booking.timeRange)  // "14:00-15:00"

// ❌ Wrong: Client-side formatting
Text(booking.startAt.formatted())  // Incorrect timezone
```

### 2. Server-Calculated Actions

**Rationale**: Business rules (cancel windows, reschedule limits) must be authoritative.

```swift
// ✅ Correct: Read from server
Button("取消").disabled(!booking.actions.canCancel)

// ❌ Wrong: Client-side calculation
if Date() < booking.startAt.addingTimeInterval(-24*3600) { ... }
```

### 3. Observable ViewModels (iOS 17+)

Using new `@Observable` macro instead of `@Published`:

```swift
@Observable @MainActor
final class TodayViewModel {
    private(set) var day: TeacherDayView?
    private(set) var isLoading = false
}
```

Benefits:
- Cleaner syntax (no `@Published` annotations)
- Better performance (fine-grained observation)
- Requires iOS 17+ (acceptable for this MVP)

### 4. Actor-Based Repositories

Thread-safe data access without explicit locks:

```swift
actor BookingRepository {
    func teacherDay() async throws -> TeacherDayView {
        // Automatically serialized
    }
}
```

### 5. No Local Database (Phase 1)

**Rationale**: 
- Offline caching introduces sync complexity
- Actions and balances must be fresh
- Memory + explicit refresh is sufficient for MVP

See `docs/impl-guide.md` §2.5 for full rationale.

## Testing

### Unit Tests

```bash
cd ios/Packages/RabbitKit
swift test
```

### iOS Tests

```bash
xcodebuild test \
  -project ios/Rabbit.xcodeproj \
  -scheme Rabbit \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Contract Compliance

All DTOs match `contracts/fixtures/*.json` field-for-field:

| DTO | Fixture |
|-----|---------|
| `Booking` | `bookings/upcoming-teacher.json` |
| `StudentDetailView` | `students/student-detail.json` |
| `SlotsView` | `slots/slots.json` |
| `TeacherDayView` | (to be added to fixtures) |

### Validation

```bash
# Run from workspace root
pnpm test:contract
```

## Error Handling

### API Error Codes

All error codes from `docs/slot-algorithm.md` §6.5:

```swift
switch error.errorCode {
case ErrorCode.slotTaken:
    // Refresh slots, return to Step 2, keep selected date
case ErrorCode.insufficientSessions:
    // Show "剩余课时不足，请联系老师续课"
case ErrorCode.tokenExpired:
    // Trigger silent refresh
default:
    // Show generic error with retry
}
```

### Network Errors

```swift
case .networkError, .timeout:
    // Retryable, keep form state
case .offline:
    // Show offline indicator, disable submit
```

## Dependencies

### External

- None (iOS SDK only)

### Internal

- `RabbitKit` (local Swift package)

## Mock Development

Use mock repositories for UI development without backend:

```swift
#Preview {
    TodayView(viewModel: TodayViewModel(
        repo: MockBookingRepository(dayView: sampleDay)
    ))
}
```

Mock data sources:
1. Inline in code (for Previews)
2. Load from `contracts/fixtures/*.json` (future)

## Next Steps

### Immediate (Phase 1 Completion)

1. Implement remaining screens (T02, T03, T04, T06, T07)
2. Add fixture-based mock data
3. Complete booking flow (create/cancel/reschedule)
4. Add error handling UI for all error codes
5. Add loading states and retry logic

### Phase 2

1. Sign in with Apple integration
2. Real API connection
3. APNs push notifications
4. Comprehensive unit tests
5. E2E tests with API

### Phase 3

1. Availability management
2. Course management
3. Transaction history
4. QR code for invites
5. Demo mode tools

## Resources

- Product spec: `docs/mvp.md`
- Implementation guide: `docs/impl-guide.md`
- Auth model: `docs/auth-model.md`
- Contract fixtures: `contracts/fixtures/`

## License

Proprietary - Internal use only
