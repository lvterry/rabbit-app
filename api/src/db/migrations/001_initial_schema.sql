-- Migration 001: Initial Schema
-- Extensions, Roles, Core Tables
--
-- ⚠️ SECURITY WARNING: Passwords in this file (*_changeme) are for LOCAL DOCKER ONLY
-- NEVER deploy these to production. Use environment-injected passwords or managed
-- PostgreSQL services. See api/src/db/README.md for production setup guidance.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Required for EXCLUDE constraints on booking time conflicts

-- Create roles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator WITH LOGIN PASSWORD 'migrator_password_changeme';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw WITH LOGIN PASSWORD 'app_password_changeme';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro WITH LOGIN PASSWORD 'readonly_password_changeme';
  END IF;
END
$$;

-- Grant schema permissions
GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;
GRANT USAGE ON SCHEMA public TO app_rw, app_ro;

-- app_user table (global identity)
CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nickname VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- auth_identity table (login methods: Apple, email)
CREATE TABLE auth_identity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('apple', 'email')),
  subject TEXT NOT NULL, -- provider-side unique identifier
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT auth_identity_provider_subject_unique UNIQUE (provider, subject)
);

CREATE INDEX idx_auth_identity_user_id ON auth_identity(user_id);

-- teacher_profile table (1:1 with app_user)
CREATE TABLE teacher_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Shanghai',
  slot_step_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_step_minutes IN (15, 20, 30, 60)),
  min_lead_hours INTEGER NOT NULL DEFAULT 2 CHECK (min_lead_hours >= 0),
  max_advance_days INTEGER NOT NULL DEFAULT 30 CHECK (max_advance_days > 0),
  free_cancel_hours INTEGER NOT NULL DEFAULT 24 CHECK (free_cancel_hours >= 0),
  auto_settle_hours INTEGER NOT NULL DEFAULT 24 CHECK (auto_settle_hours >= 0),
  undo_complete_days INTEGER NOT NULL DEFAULT 7 CHECK (undo_complete_days >= 0),
  max_reschedules INTEGER NOT NULL DEFAULT 3 CHECK (max_reschedules >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teacher_profile_user_id ON teacher_profile(user_id);
CREATE INDEX idx_teacher_profile_status ON teacher_profile(status);

-- course table
CREATE TABLE course (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 15 AND duration_minutes <= 240),
  allow_self_booking BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_teacher_id ON course(teacher_id);
CREATE INDEX idx_course_status ON course(status);

-- student table (relationship entity: Student = (User?, Teacher, name, status))
CREATE TABLE student (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  contact TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  bound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Invariant I6: (teacher_id, user_id) unique when user_id is not null
  CONSTRAINT student_teacher_user_unique UNIQUE (teacher_id, user_id) DEFERRABLE INITIALLY DEFERRED
);

-- Partial unique index for I6 (only when user_id is not null)
CREATE UNIQUE INDEX idx_student_teacher_user_bound 
  ON student(teacher_id, user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_student_teacher_id ON student(teacher_id);
CREATE INDEX idx_student_user_id ON student(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_student_status ON student(status);

-- availability_rule table (weekly recurring open times)
CREATE TABLE availability_rule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT availability_rule_time_order CHECK (start_minute < end_minute)
);

CREATE INDEX idx_availability_rule_teacher_weekday ON availability_rule(teacher_id, weekday);
CREATE INDEX idx_availability_rule_status ON availability_rule(status);

-- availability_exception table (temporary closures)
CREATE TABLE availability_exception (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  on_date DATE NOT NULL,
  start_minute INTEGER CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER CHECK (end_minute > 0 AND end_minute <= 1440),
  reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT availability_exception_time_order CHECK (
    (start_minute IS NULL AND end_minute IS NULL) OR 
    (start_minute IS NOT NULL AND end_minute IS NOT NULL AND start_minute < end_minute)
  )
);

CREATE INDEX idx_availability_exception_teacher_date ON availability_exception(teacher_id, on_date);

-- lesson_package table (batch model: one package = one purchase batch)
CREATE TABLE lesson_package (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  purchased_sessions INTEGER NOT NULL CHECK (purchased_sessions >= 0),
  remaining_sessions INTEGER NOT NULL CHECK (remaining_sessions >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Used Up', 'Archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  
  -- Invariant I1: 0 <= remaining_sessions <= purchased_sessions
  CONSTRAINT lesson_package_balance_bounds CHECK (remaining_sessions <= purchased_sessions)
);

CREATE INDEX idx_lesson_package_teacher_id ON lesson_package(teacher_id);
CREATE INDEX idx_lesson_package_student_id ON lesson_package(student_id);
CREATE INDEX idx_lesson_package_course_id ON lesson_package(course_id);
CREATE INDEX idx_lesson_package_status ON lesson_package(status);
CREATE INDEX idx_lesson_package_student_course_active 
  ON lesson_package(student_id, course_id) 
  WHERE status = 'Active';

-- package_transaction table (append-only ledger)
CREATE TABLE package_transaction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES lesson_package(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'PACKAGE_CREATED', 'MANUAL_ADD', 'PURCHASE_ADJUSTMENT',
    'BALANCE_ADJUSTMENT', 'SESSION_COMPLETED', 'LATE_CANCEL',
    'MANUAL_DEDUCT', 'REVERSAL'
  )),
  amount INTEGER NOT NULL,
  before_sessions INTEGER NOT NULL,
  after_sessions INTEGER NOT NULL,
  booking_id UUID, -- nullable, will add FK after booking table is created
  session_id UUID, -- nullable, will add FK after lesson_session table is created
  note TEXT,
  actor_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  actor_student_id UUID REFERENCES student(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- tx_sign constraint: type determines if amount should be positive or negative
  CONSTRAINT package_transaction_tx_sign CHECK (
    (type IN ('PACKAGE_CREATED', 'MANUAL_ADD', 'PURCHASE_ADJUSTMENT', 'REVERSAL') AND amount > 0) OR
    (type IN ('SESSION_COMPLETED', 'LATE_CANCEL', 'MANUAL_DEDUCT') AND amount < 0) OR
    (type = 'BALANCE_ADJUSTMENT' AND amount != 0)
  ),
  
  -- At most one actor (user or student)
  CONSTRAINT package_transaction_actor_exclusive CHECK (
    (actor_user_id IS NULL OR actor_student_id IS NULL)
  )
);

CREATE INDEX idx_package_transaction_package_id ON package_transaction(package_id);
CREATE INDEX idx_package_transaction_created_at ON package_transaction(package_id, created_at DESC);
CREATE INDEX idx_package_transaction_booking_id ON package_transaction(booking_id) WHERE booking_id IS NOT NULL;

-- booking table
CREATE TABLE booking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES lesson_package(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Completed', 'Cancelled')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by VARCHAR(50) CHECK (cancelled_by IN ('Student', 'Teacher', 'System')),
  cancellation_policy_result VARCHAR(50) CHECK (cancellation_policy_result IN ('FREE_CANCEL', 'LATE_CANCEL', 'TEACHER_CANCEL')),
  policy_snapshot_free_cancel_hours INTEGER NOT NULL,
  rescheduled_from_booking_id UUID REFERENCES booking(id) ON DELETE SET NULL,
  rescheduled_to_booking_id UUID REFERENCES booking(id) ON DELETE SET NULL,
  reschedule_count INTEGER NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0),
  settled_at TIMESTAMPTZ,
  source VARCHAR(50) NOT NULL CHECK (source IN ('SelfBooked', 'TeacherCreated')),
  idempotency_key UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT booking_time_order CHECK (start_at < end_at)
);

-- Invariant I3: No overlapping Upcoming bookings for same teacher
-- EXCLUDE constraint using GiST index with tstzrange
CREATE EXTENSION IF NOT EXISTS btree_gist; -- Ensure extension is created
ALTER TABLE booking ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    teacher_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'Upcoming');

CREATE INDEX idx_booking_teacher_id ON booking(teacher_id);
CREATE INDEX idx_booking_student_id ON booking(student_id);
CREATE INDEX idx_booking_course_id ON booking(course_id);
CREATE INDEX idx_booking_package_id ON booking(package_id);
CREATE INDEX idx_booking_status ON booking(status);
CREATE INDEX idx_booking_teacher_status_start ON booking(teacher_id, status, start_at);
CREATE INDEX idx_booking_student_status_start ON booking(student_id, status, start_at);
CREATE INDEX idx_booking_idempotency_key ON booking(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- lesson_session table (actual lessons taught)
CREATE TABLE lesson_session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES lesson_package(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  consumed_sessions INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Voided')),
  source VARCHAR(50) NOT NULL CHECK (source IN ('TeacherConfirmed', 'AutoSettled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invariant I2: One Booking can have at most one Active Session
CREATE UNIQUE INDEX idx_lesson_session_booking_active 
  ON lesson_session(booking_id) 
  WHERE status = 'Active';

CREATE INDEX idx_lesson_session_teacher_id ON lesson_session(teacher_id);
CREATE INDEX idx_lesson_session_student_id ON lesson_session(student_id);
CREATE INDEX idx_lesson_session_status ON lesson_session(status);

-- Now add FK constraints from package_transaction to booking and lesson_session
ALTER TABLE package_transaction 
  ADD CONSTRAINT fk_package_transaction_booking 
  FOREIGN KEY (booking_id) REFERENCES booking(id) ON DELETE SET NULL;

ALTER TABLE package_transaction 
  ADD CONSTRAINT fk_package_transaction_session 
  FOREIGN KEY (session_id) REFERENCES lesson_session(id) ON DELETE SET NULL;

-- student_invite table (invitation tokens)
CREATE TABLE student_invite (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Consumed', 'Expired', 'Revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invariant I7: token is unique
CREATE UNIQUE INDEX idx_student_invite_token ON student_invite(token);
CREATE INDEX idx_student_invite_teacher_id ON student_invite(teacher_id);
CREATE INDEX idx_student_invite_student_id ON student_invite(student_id);
CREATE INDEX idx_student_invite_status ON student_invite(status);

-- idempotency_record table (24h TTL, two nullable columns for principal)
CREATE TABLE idempotency_record (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  student_id UUID REFERENCES student(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB,
  state VARCHAR(50) NOT NULL DEFAULT 'Succeeded' CHECK (state IN ('Succeeded', 'Failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  
  -- At most one principal (user or student)
  CONSTRAINT idempotency_record_principal_exclusive CHECK (
    (user_id IS NULL OR student_id IS NULL)
  )
);

-- Two partial unique indexes for idempotency (user_id OR student_id)
CREATE UNIQUE INDEX idx_idempotency_user_key 
  ON idempotency_record(user_id, idempotency_key) 
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_idempotency_student_key 
  ON idempotency_record(student_id, idempotency_key) 
  WHERE student_id IS NOT NULL;

CREATE INDEX idx_idempotency_expires_at ON idempotency_record(expires_at);

-- push_device table (APNs device tokens)
CREATE TABLE push_device (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('ios')),
  token TEXT NOT NULL,
  environment VARCHAR(50) NOT NULL CHECK (environment IN ('sandbox', 'production')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT push_device_token_unique UNIQUE (token)
);

CREATE INDEX idx_push_device_user_id ON push_device(user_id);
CREATE INDEX idx_push_device_revoked ON push_device(revoked_at) WHERE revoked_at IS NULL;

-- notification_outbox table (transactional outbox pattern)
CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  notification_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_outbox_retry ON notification_outbox(next_retry_at) 
  WHERE sent_at IS NULL AND attempts < max_attempts;
CREATE INDEX idx_notification_outbox_user_id ON notification_outbox(user_id);

-- integrity_issue table (for reconciliation/auditing)
CREATE TABLE integrity_issue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_name VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('ERROR', 'WARN')),
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID NOT NULL,
  description TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrity_issue_detected_at ON integrity_issue(detected_at DESC);
CREATE INDEX idx_integrity_issue_severity ON integrity_issue(severity);

-- Grant permissions to app_rw (REVOKE balance columns later in separate migration)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;

-- Grant read-only permissions to app_ro
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ro;

-- Important: Make future grants automatic
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO app_ro;
