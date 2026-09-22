-- Migration 004: Grant app_migrator permissions for apply_package_transaction
-- Fixes Must-fix #1: Permission denied for table lesson_package
--
-- The SECURITY DEFINER function apply_package_transaction runs with app_migrator
-- permissions, but if tables are created by a different role (e.g. postgres in CI),
-- app_migrator needs explicit grants to SELECT and UPDATE lesson_package.

-- Ensure app_migrator can SELECT and UPDATE lesson_package
-- (needed for the SELECT ... FOR UPDATE in apply_package_transaction)
GRANT SELECT, UPDATE ON lesson_package TO app_migrator;

-- Also ensure app_migrator can INSERT into package_transaction
-- (the function inserts transaction records)
GRANT SELECT, INSERT ON package_transaction TO app_migrator;

-- Verify the function owner (should be app_migrator from migration 002)
-- This is defensive - if run by postgres, it ensures app_migrator owns it
DO $$
BEGIN
  -- Re-assert ownership if needed
  ALTER FUNCTION apply_package_transaction OWNER TO app_migrator;
END
$$;

COMMENT ON TABLE lesson_package IS
  'app_migrator has SELECT+UPDATE for SECURITY DEFINER function. '
  'app_rw has SELECT+INSERT but UPDATE revoked on balance columns (migrations 002/003).';

COMMENT ON TABLE package_transaction IS
  'app_migrator has SELECT+INSERT for SECURITY DEFINER function. '
  'app_rw has SELECT+INSERT but UPDATE+DELETE revoked (migration 003).';
