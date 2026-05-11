/*
  # Add Renewal Fields to Subscriptions

  ## Summary
  Adds three new columns to the subscriptions table to support the subscription renewal management system.

  ## New Columns
  - `renewal_status` (text, default 'none'): Tracks the renewal lifecycle state
    - 'none': No renewal action taken yet
    - 'notified': 5-day reminder CRM task has been created for this subscription
    - 'expired': Subscription has passed the 2-day grace period after end_date
    - 'renewed': Customer has successfully renewed this subscription
  - `renewal_notified_at` (timestamptz): Records when the renewal reminder was first triggered,
    used to prevent duplicate CRM task creation on subsequent daily runs
  - `renewed_from_subscription_id` (uuid): Links a new renewal subscription back to the original
    subscription it was renewed from, enabling renewal chain tracking

  ## Security
  - No RLS changes needed; existing RLS policies on subscriptions table cover these columns

  ## Notes
  1. All existing subscriptions get renewal_status = 'none' by default (safe migration)
  2. The renewed_from_subscription_id references subscriptions(id) with ON DELETE SET NULL
     so deleting a predecessor does not cascade-delete the renewal subscription
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'renewal_status'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN renewal_status text NOT NULL DEFAULT 'none'
      CHECK (renewal_status IN ('none', 'notified', 'expired', 'renewed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'renewal_notified_at'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN renewal_notified_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'renewed_from_subscription_id'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN renewed_from_subscription_id uuid
      REFERENCES subscriptions(id) ON DELETE SET NULL;
  END IF;
END $$;
