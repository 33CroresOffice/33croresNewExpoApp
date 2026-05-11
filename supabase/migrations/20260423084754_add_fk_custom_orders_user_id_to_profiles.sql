/*
  # Add foreign key from custom_orders.user_id to profiles.id

  ## Summary
  The custom_orders table has user_id referencing auth.users(id), but PostgREST
  needs a foreign key to the public.profiles table to allow the join
  `.select('*, user:profiles(full_name, mobile)')` used in the admin panel.
  This migration adds that FK so the join works correctly.

  ## Changes
  - Adds FK constraint: custom_orders.user_id → profiles.id
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'custom_orders_user_id_profiles_fkey'
      AND table_name = 'custom_orders'
  ) THEN
    ALTER TABLE custom_orders
      ADD CONSTRAINT custom_orders_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
