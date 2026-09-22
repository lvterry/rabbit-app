-- Migration 003: Ledger Append-Only + Session Constraint Fix
-- Wave 1 Stabilization P0 #2

-- P0 #2a: Make package_transaction truly append-only
-- Migration 002 revoked UPDATE on columns but not on the table itself
-- The table-level UPDATE/DELETE grants from migration 001 are still in effect
REVOKE UPDATE, DELETE ON package_transaction FROM app_rw;

-- Note on SECURITY DEFINER and lesson_package locks:
-- apply_package_transaction does SELECT ... FOR UPDATE on lesson_package.
-- This works because the function runs with app_migrator (owner) permissions,
-- not app_rw permissions. The column-level UPDATE revoke on lesson_package
-- only affects direct app_rw access, not the SECURITY DEFINER function.

-- Verify the package_transaction table now only allows INSERT
COMMENT ON TABLE package_transaction IS 
  'Append-only ledger: app_rw can only INSERT. '
  'UPDATE/DELETE revoked to enforce ledger integrity (Invariant I4).';

-- P0 #2b: Drop column-level UNIQUE constraint on lesson_session.booking_id
-- This allows Completed → Voided → Completed pattern to reuse the same booking_id
-- The partial unique index (WHERE status = 'Active') already exists and is sufficient
ALTER TABLE lesson_session DROP CONSTRAINT IF EXISTS lesson_session_booking_id_key;

-- Verify: Only the partial unique index remains (idx_lesson_session_booking_active)
-- This allows multiple lesson_session rows for one booking_id, but only one Active
COMMENT ON TABLE lesson_session IS 
  'One booking can have multiple sessions (Active/Voided), '
  'but at most one Active session (enforced by partial unique index).';
