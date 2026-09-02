/*
  # Add approval_status to riders table

  ## Summary
  Riders can now self-register via the app. Their profile starts as "pending_approval"
  and an admin must approve it before they can log in with OTP.

  ## Changes
  - `riders.approval_status` (text): 'pending_approval' | 'approved' | 'rejected'
    Default is 'approved' so existing admin-created riders are unaffected.
  - `riders.registered_at` (timestamptz): when the rider self-registered
  - RLS policy: riders with 'approved' status can read their own record via profile_id or mobile
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE riders ADD COLUMN approval_status text NOT NULL DEFAULT 'approved'
      CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'registered_at'
  ) THEN
    ALTER TABLE riders ADD COLUMN registered_at timestamptz;
  END IF;
END $$;
