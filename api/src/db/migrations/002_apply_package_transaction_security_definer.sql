-- Migration 002: apply_package_transaction SECURITY DEFINER
-- This is the ONLY way to modify lesson_package balance columns
-- Implements Invariant I4: balance integrity through single entry point

-- First, REVOKE direct UPDATE permissions on balance columns from app_rw
-- This ensures app code MUST go through apply_package_transaction
REVOKE UPDATE (remaining_sessions, purchased_sessions) ON lesson_package FROM app_rw;

-- Create the SECURITY DEFINER function
-- Owner: app_migrator (has full permissions)
-- Execution: granted to app_rw (application role)
CREATE OR REPLACE FUNCTION apply_package_transaction(
  p_package_id UUID,
  p_type VARCHAR(50),
  p_amount INTEGER,
  p_booking_id UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_student_id UUID DEFAULT NULL
) RETURNS TABLE(
  transaction_id UUID,
  new_purchased INTEGER,
  new_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER -- Run with owner (app_migrator) permissions
SET search_path = pg_catalog, public -- Prevent search_path attacks
AS $$
DECLARE
  v_current_purchased INTEGER;
  v_current_remaining INTEGER;
  v_new_purchased INTEGER;
  v_new_remaining INTEGER;
  v_transaction_id UUID;
  v_is_purchase_type BOOLEAN;
BEGIN
  -- Lock the package row FOR UPDATE to prevent concurrent modifications
  SELECT purchased_sessions, remaining_sessions
  INTO v_current_purchased, v_current_remaining
  FROM lesson_package
  WHERE id = p_package_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found: %', p_package_id;
  END IF;
  
  -- Validate type (belt-and-suspenders with table constraint)
  IF p_type NOT IN (
    'PACKAGE_CREATED', 'MANUAL_ADD', 'PURCHASE_ADJUSTMENT',
    'BALANCE_ADJUSTMENT', 'SESSION_COMPLETED', 'LATE_CANCEL',
    'MANUAL_DEDUCT', 'REVERSAL'
  ) THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_type;
  END IF;
  
  -- Validate amount sign matches type (implements tx_sign logic from data-model.md)
  IF p_type IN ('PACKAGE_CREATED', 'MANUAL_ADD', 'PURCHASE_ADJUSTMENT', 'REVERSAL') THEN
    IF p_amount <= 0 THEN
      RAISE EXCEPTION 'Type % requires positive amount, got %', p_type, p_amount;
    END IF;
  ELSIF p_type IN ('SESSION_COMPLETED', 'LATE_CANCEL', 'MANUAL_DEDUCT') THEN
    IF p_amount >= 0 THEN
      RAISE EXCEPTION 'Type % requires negative amount, got %', p_type, p_amount;
    END IF;
  ELSIF p_type = 'BALANCE_ADJUSTMENT' THEN
    IF p_amount = 0 THEN
      RAISE EXCEPTION 'BALANCE_ADJUSTMENT requires non-zero amount';
    END IF;
  END IF;
  
  -- Determine if this is a "purchase quantity" type (affects purchased_sessions)
  -- CRITICAL: Only these three types modify purchased_sessions
  -- REVERSAL does NOT modify purchased_sessions (see regression test: 10/10 → 9/10 → 10/10)
  v_is_purchase_type := p_type IN ('PACKAGE_CREATED', 'MANUAL_ADD', 'PURCHASE_ADJUSTMENT');
  
  -- Calculate new values
  IF v_is_purchase_type THEN
    -- Purchase quantity types: both purchased and remaining move together
    v_new_purchased := v_current_purchased + p_amount;
    v_new_remaining := v_current_remaining + p_amount;
  ELSE
    -- Balance types: only remaining changes, purchased stays the same
    v_new_purchased := v_current_purchased;
    v_new_remaining := v_current_remaining + p_amount;
  END IF;
  
  -- Validate Invariant I1: 0 <= remaining_sessions <= purchased_sessions
  IF v_new_remaining < 0 THEN
    RAISE EXCEPTION 'Balance would go negative: current=%, amount=%, type=%', 
      v_current_remaining, p_amount, p_type;
  END IF;
  
  IF v_new_remaining > v_new_purchased THEN
    RAISE EXCEPTION 'Remaining (%) would exceed purchased (%)', 
      v_new_remaining, v_new_purchased;
  END IF;
  
  -- Validate at most one actor
  IF p_actor_user_id IS NOT NULL AND p_actor_student_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot have both actor_user_id and actor_student_id';
  END IF;
  
  -- Update package balance
  UPDATE lesson_package
  SET 
    purchased_sessions = v_new_purchased,
    remaining_sessions = v_new_remaining,
    -- Update status based on remaining
    status = CASE
      WHEN v_new_remaining = 0 THEN 'Used Up'
      WHEN status = 'Used Up' AND v_new_remaining > 0 THEN 'Active'
      ELSE status
    END
  WHERE id = p_package_id;
  
  -- Insert transaction record (append-only ledger)
  INSERT INTO package_transaction (
    id, package_id, type, amount,
    before_sessions, after_sessions,
    booking_id, session_id, note,
    actor_user_id, actor_student_id,
    created_at
  ) VALUES (
    uuid_generate_v4(), p_package_id, p_type, p_amount,
    v_current_remaining, v_new_remaining,
    p_booking_id, p_session_id, p_note,
    p_actor_user_id, p_actor_student_id,
    now()
  ) RETURNING id INTO v_transaction_id;
  
  -- Return result
  RETURN QUERY SELECT v_transaction_id, v_new_purchased, v_new_remaining;
END;
$$;

-- Set function owner to app_migrator
ALTER FUNCTION apply_package_transaction OWNER TO app_migrator;

-- Revoke all permissions from PUBLIC
REVOKE ALL ON FUNCTION apply_package_transaction FROM PUBLIC;

-- Grant EXECUTE permission to app_rw (application role)
GRANT EXECUTE ON FUNCTION apply_package_transaction TO app_rw;

-- Add helpful comment
COMMENT ON FUNCTION apply_package_transaction IS 
  'SECURITY DEFINER: Only entry point for modifying lesson_package balance. '
  'Implements Invariant I4. Balance columns have UPDATE revoked from app_rw. '
  'Regression test: 10/10 → SESSION_COMPLETED → 9/10 → REVERSAL → 10/10';
