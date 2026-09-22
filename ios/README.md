# Rabbit iOS Teacher App

SwiftUI-based iOS app for independent teachers to manage bookings, students, courses, and availability.

## Phase 1 Complete ✅

All 10 required teacher screens implemented with mock-first approach.

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
│   ├── MainTabView.swift     # 4-tab root view
│   ├── Features/             # Feature screens
│   │   ├── Today/            # T01: Today view
│   │   ├── Calendar/         # T02: Calendar view  
│   │   ├── Students/         # T05-T07: Students, Detail, Add
│   │   ├── Bookings/         # T04: Manual Booking
│   │   ├── Courses/          # T09: Course Management
│   │   ├── Availability/     # T10: Availability Management
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

#### Local API Testing & Stabilization E2E

For **real API integration** (Wave 1 Stabilization E2E or local development against backend):

1. **Start Local Backend Stack:**
   ```bash
   # From repository root
   docker-compose up -d postgres
   pnpm dev  # Starts API on http://localhost:8787
   ```

2. **Configure Xcode Scheme:**
   - Menu: **Product → Scheme → Edit Scheme…** (`⌘<`)
   - Select **Run** → **Arguments** tab
   - Add environment variable:
     - `API_BASE_URL` = `http://localhost:8787`
   - **Note:** iOS Simulator's `localhost` automatically maps to host Mac's `localhost`

3. **Dev Teacher Authentication (DEBUG builds only):**
   - ⚠️ DEBUG builds include a **"Dev: Sign in as seeded teacher"** button on the Onboarding screen
   - This calls `POST /v1/auth/dev/teacher` (requires `NODE_ENV=development|test` on API)
   - Returns real User + Teacher JWTs with real Principal
   - **Maya must implement backend endpoint first** (Wave 1 Stabilization work)
   - Release builds never show this button (`#if DEBUG` gated)
   - **No DEMO_MODE login bypass** — this uses real auth flow via SessionStore

4. **Production Authentication:**
   - ⚠️ **Sign in with Apple** (`POST /v1/auth/apple`) is not yet implemented (returns 501)
   - Production auth path TBD; pilot/staging will require Apple Sign In implementation

5. **Verify API Connectivity:**
   ```bash
   curl http://localhost:8787/v1/meta
   # Should return: {"status":"ok",...}
   ```

**Important:** Mock/Preview-only testing does NOT satisfy the E2E exit gate. Real API integration with authenticated Principal is required for Wave 1 Stabilization validation. See `ios/docs/wave1-stabilization-e2e-checklist.md` for full walkthrough details.

### 3. Build & Run

Select iPhone 15 simulator and run (⌘R).

## Screens Implemented (10/10 ✅)

### Phase 1 Teacher Screens - ALL COMPLETE

- ✅ **Root/Onboarding** - Sign in with Apple placeholder
- ✅ **T01 Today** - Daily bookings, next class, pending actions
- ✅ **T02 Calendar** - Week view with booking/slot counts, course filter
- ✅ **T04 Manual Booking** (CRITICAL) - Student → Course → Date → Time flow
- ✅ **T05 Student List** - Search, stats, unbound badges
- ✅ **T06 Student Detail** - Complete with packages, transactions, actions
- ✅ **T07 Add Student** - Name → Course → Sessions → Invite with QR code
- ✅ **T08 Profile** - Teacher info, management shortcuts
- ✅ **T09 Course Management** - Create/edit/archive courses
- ✅ **T10 Availability** - Weekly rules + exceptions

### Navigation

All screens are wired and reachable:
- 4-tab root: Today / Calendar / Students / Profile
- Today → Add Booking (modal)
- Calendar → Day detail (modal)
- Students → Student Detail → Add Student (modal)
- Profile → Courses, Availability, Rules

## Key Features

### Acceptance Criteria Met ✅

- ✅ **Today + Students + Manual Booking** all usable offline via mocks
- ✅ DTOs decode from fixture samples
- ✅ All screens work with mock repositories
- ✅ Proper navigation between screens

### Architecture Principles

- ✅ Server-provided display strings (no timezone conversion in client)
- ✅ Server-calculated actions (`canComplete`, `canCancel`, etc.)
- ✅ View → ViewModel → Repository → APIClient layering
- ✅ No business logic in views
- ✅ Idempotency keys on write operations
- ✅ Error code handling from slot-algorithm.md §6.5

### Mock/Fixture Coverage

All DTOs match contract fixtures:
- `Booking` ← `bookings/upcoming-teacher.json`
- `StudentDetailView` ← `students/student-detail.json`
- `SlotsView` ← `slots/slots.json`
- `Course`, `Student`, `Package`, `Slot` - all fixture-aligned

Mock repositories return fixture-equivalent data for offline development.

## Tests

### DTO Decode Tests

```bash
cd ios/Packages/RabbitKit
swift test
```

Tests verify:
- Booking DTO decodes with all fields
- Slot, Student, Course DTOs decode correctly
- API response/error envelopes decode
- Unknown fields are tolerated

### ViewModel Tests

Tests verify:
- TodayViewModel refreshes with mock data
- StudentListViewModel loads and searches
- BookingDetailViewModel handles actions
- All ViewModels work offline with mocks

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

## Key Design Decisions

### 1. Server-Provided Display Strings

```swift
// ✅ Correct: Use server-provided display string
Text(booking.timeRange)  // "14:00-15:00"

// ❌ Wrong: Client-side formatting
Text(booking.startAt.formatted())  // Incorrect timezone
```

### 2. Server-Calculated Actions

```swift
// ✅ Correct: Read from server
Button("取消").disabled(!booking.actions.canCancel)

// ❌ Wrong: Client-side calculation
if Date() < booking.startAt.addingTimeInterval(-24*3600) { ... }
```

### 3. Observable ViewModels (iOS 17+)

Using new `@Observable` macro:

```swift
@Observable @MainActor
final class TodayViewModel {
    private(set) var day: TeacherDayView?
    private(set) var isLoading = false
}
```

### 4. Actor-Based Repositories

Thread-safe data access:

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

## Mock Development

Use mock repositories for UI development without backend:

```swift
#Preview {
    TodayView(viewModel: TodayViewModel(
        repo: MockBookingRepository(dayView: sampleDay)
    ))
}
```

## Next Steps

### Phase 2

1. Sign in with Apple integration
2. Real API connection (replace mock repositories)
3. APNs push notifications
4. Comprehensive unit tests
5. E2E tests with API

### Phase 3

1. Transaction history
2. Booking Rules (T11)
3. QR code generation for invites
4. Demo mode tools
5. Comprehensive error handling

## Platform-Specific Notes

### iOS 17+ Only

- Using `@Observable` macro (not `@Published`)
- SwiftUI-only (no UIKit)
- Requires iOS 17.0+

### No UIKit

SwiftUI-only, no UIViewRepresentable bridges.

### Keychain for Tokens

Using Security framework directly for refresh token storage (not UserDefaults).

## Contract Compliance

All DTOs match `contracts/fixtures/*.json` field-for-field:

| DTO | Fixture |
|-----|---------|
| `Booking` | `bookings/upcoming-teacher.json` |
| `StudentDetailView` | `students/student-detail.json` |
| `SlotsView` | `slots/slots.json` |
| `Course` | (matches API schema) |
| `Student` | (matches API schema) |

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

## Dependencies

### External

- None (iOS SDK only)

### Internal

- `RabbitKit` (local Swift package)

## Resources

- Product spec: `docs/mvp.md`
- Implementation guide: `docs/impl-guide.md`
- Auth model: `docs/auth-model.md`
- Contract fixtures: `contracts/fixtures/`

## License

Proprietary - Internal use only
