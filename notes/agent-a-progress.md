# Agent A (Backend Core) - Progress Report

## Completed (First Checkpoint)

### 1. Database Migrations ✓
- **001_initial_schema.sql**: Complete schema with all tables, constraints, indexes
  - Extensions: uuid-ossp, btree_gist
  - Roles: app_migrator, app_rw, app_ro with proper permissions
  - All tables per data-model.md
  - EXCLUDE constraint for booking time conflicts (Invariant I3)
  - Partial unique indexes for I6 (student-teacher binding), I2 (session uniqueness)
  - CHECK constraints for I1 (balance bounds)
  
- **002_apply_package_transaction_security_definer.sql**: Critical balance integrity
  - SECURITY DEFINER function owned by app_migrator
  - REVOKE UPDATE on balance columns from app_rw
  - Implements tx_sign validation
  - Correctly handles purchase vs balance transaction types
  - REVERSAL does NOT modify purchased_sessions (key regression)
  
- **migrate.ts**: Migration runner with version tracking

### 2. Domain Logic ✓
All pure functions, zero database dependencies, fully testable:

- **time.ts**: Time conversion utilities
  - minutesToHHMM / hhmmToMinutes
  - localDateMinutesToUTC / utcToLocalDate
  - Range overlap detection
  - Asia/Shanghai timezone handling (hardcoded for MVP, no DST)
  
- **slot.ts**: Core slot generation algorithm
  - computeSlots() - follows docs/slot-algorithm.md §3.2 exactly
  - [start, end) left-closed right-open intervals
  - Aligns to rule start, not hour boundaries
  - step != duration for flexibility
  - isValidSlot() for L3 validation
  - computeBookableDays() for calendar view
  
- **cancelPolicy.ts**: Cancellation rules
  - determineCancellationPolicy()
  - FREE_CANCEL / LATE_CANCEL / TEACHER_CANCEL
  - Uses policy_snapshot from booking
  
- **bookingActions.ts**: Action availability
  - computeBookingActions() - single source of truth
  - Handles teacher vs student capabilities
  - Reschedule limits, undo windows
  - isPendingSettlement(), shouldAutoSettle()
  
- **packageSelection.ts**: FIFO package logic
  - selectPackageForBooking() - FIFO by created_at
  - calculateAggregateBalance()
  - canAffordLateReschedule() - requires 2 available sessions

### 3. Repository Implementations (Partial)
- **PackageRepositoryImpl**: Complete implementation
  - Uses apply_package_transaction for ALL balance modifications
  - Implements FIFO selection
  - Maps request modes to transaction types
  - Aggregate balance calculation with reserved count
  
- **connection.ts**: Database connection helper

### 4. Tests (Partial)
- **package-transaction-regression.test.ts**: Critical REVERSAL test
  - 10/10 → SESSION_COMPLETED → 9/10 → REVERSAL → 10/10
  - Verifies purchased_sessions does NOT change on REVERSAL
  - Validates amount sign constraints

## In Progress / Not Yet Started

### Repository Implementations Remaining
- BookingRepository (critical)
- StudentRepository
- TeacherRepository
- CourseRepository
- AvailabilityRepository
- IdempotencyRepository
- AuthService implementation

### Tests Remaining
- Domain tests:
  - Slot algorithm vectors V1-V20 (spec-tests/)
  - Time utilities
  - Cancel policy scenarios
  - Booking actions matrix
  - Package FIFO selection
  
- Database tests:
  - Concurrent booking attempts (same slot)
  - EXCLUDE constraint enforcement
  - Booking time conflict scenarios
  - Late reschedule with insufficient balance
  - Idempotency
  - Cross-teacher FK validation

### Jobs
- Auto-settlement worker (api/src/jobs/settle.ts)
- Reconciliation job (api/src/jobs/reconcile.ts)

## Architecture Decisions Made

1. **Pure domain functions**: All business logic is database-independent
   - computeSlots can be tested without DB
   - Same function used for L1 (display), L2 (recheck), L3 (transaction)
   
2. **SECURITY DEFINER enforcement**: Balance integrity at database level
   - App role cannot UPDATE balance columns directly
   - Must go through apply_package_transaction function
   - Prevents "clever" balance manipulation bugs
   
3. **Transaction type determines behavior**: Not amount sign
   - REVERSAL explicitly typed, not inferred from positive amount
   - Prevents 11/10 bug (purchasing instead of reversing)
   
4. **Repository pattern**: Implements ports defined by Agent 0
   - Keeps domain pure
   - Enables testing without full DB setup
   - Clear separation of concerns

## Files Created

### api/src/db/
- migrations/001_initial_schema.sql
- migrations/002_apply_package_transaction_security_definer.sql
- migrate.ts
- connection.ts
- repositories/PackageRepositoryImpl.ts

### api/src/domain/
- time.ts
- slot.ts
- cancelPolicy.ts
- bookingActions.ts
- packageSelection.ts
- index.ts

### api/test/
- db/package-transaction-regression.test.ts

## Contract Compliance

### Ownership Boundaries: RESPECTED ✓
- Only modified api/src/db/, api/src/domain/, api/src/jobs/, api/test/
- Did NOT touch packages/shared/, contracts/, web/, ios/
- Did NOT modify routes, middleware, auth, notifications

### Must-Read Documents: FOLLOWED ✓
- data-model.md: Schema, constraints, SECURITY DEFINER, Invariants I1-I9
- auth-model.md: Principal types, capability resolution (used in PackageRepository.addTransaction)
- slot-algorithm.md: computeSlots algorithm, [start, end) intervals
- mvp.md: Business rules, cancel policy, package model
- impl-guide.md: Repository contracts
- rabbit-contract-parallel-plan-v2.md §18: Task boundaries

### Identity Handling: CORRECT ✓
- Package transactions record actor_user_id OR actor_student_id (not both)
- Principal extracted in PackageRepository.addTransaction
- No "as Teacher" or "by" fields in requests
- Identity from Principal/capability only (auth-model.md §2.1)

## Blockers

None. No architectural conflicts discovered. All specifications are implementable as written.

## Next Agent Dependencies

Agent B (Backend API) can proceed with:
- HTTP routes can import domain functions
- Repositories are ready for dependency injection
- Ports are implemented (at least PackageRepository)
- Migration runner is ready

## Risks / Notes

1. **Time zone**: Currently hardcoded to Asia/Shanghai with simple +8 offset
   - Works for China (no DST since 1991)
   - Will need proper timezone library (luxon/date-fns-tz) for global expansion
   - Current implementation documents this limitation
   
2. **Test coverage**: Only REVERSAL regression test so far
   - Need full slot algorithm test suite (V1-V20)
   - Need concurrent booking tests
   - Need idempotency tests
   
3. **Performance**: Not yet optimized
   - computeBookableDays does one query per weekday
   - Could batch rule/exception queries
   - Good enough for MVP, optimize if needed

## Acceptance Criteria Status

- [x] Postgres 16 migrations (extensions, roles, tables, constraints, SECURITY DEFINER)
- [x] apply_package_transaction with balance REVOKE
- [x] REVERSAL regression test (10/10 → 9/10 → 10/10) implemented
- [x] Domain: computeSlots (pure, shared L1/L2/L3)
- [x] Domain: time helpers, cancelPolicy, bookingActions, FIFO package pick
- [ ] Booking transactions (create/complete/undo/cancel/reschedule) - IN PROGRESS
- [ ] Implement all ports with real repos - PARTIAL (Package done, others pending)
- [ ] Negative constraint tests from data-model §1.2 - PENDING
- [ ] Slot vectors V1-V20 green - PENDING
- [ ] Domain/db tests comprehensive - PARTIAL

## Estimated Completion

Core implementation: ~40% complete
Testing: ~10% complete

Remaining work:
- 5 more repository implementations
- Booking transaction logic (most complex)
- Comprehensive test suite
- Job implementations

This represents significant progress on the data layer and domain logic. The foundation is solid and contract-compliant.
