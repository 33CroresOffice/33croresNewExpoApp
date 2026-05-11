/*
  # Add rider role to profiles

  Adds 'rider' as a valid role in the profiles_role_check constraint.

  1. Changes
    - Drop existing role check constraint
    - Re-add constraint with 'rider' included
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text, 'vendor'::text, 'rider'::text]));
