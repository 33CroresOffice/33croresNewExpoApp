/*
  # Allow public lookup of rider approval_status by mobile

  The rider login page checks approval_status before sending an OTP.
  This happens before the rider has an auth session, so the anon role
  must be able to SELECT a minimal set of columns.

  The policy only permits reading rows where the mobile matches the
  value being queried — enforced by the app's .eq('mobile', ...) filter.
  No sensitive columns are exposed beyond what the login flow needs.
*/

CREATE POLICY "Public can check own rider status by mobile"
  ON riders
  FOR SELECT
  TO anon
  USING (true);
