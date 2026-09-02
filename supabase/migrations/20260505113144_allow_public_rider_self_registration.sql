/*
  # Allow public rider self-registration

  Riders register before they have an auth account, so the insert must be
  allowed for anonymous (unauthenticated) users. The policy is tightly scoped:
  - Only INSERT is allowed publicly
  - Only rows with approval_status = 'pending_approval' can be inserted this way
  - All other operations (SELECT, UPDATE, DELETE) remain admin-only
*/

CREATE POLICY "Public can self-register as pending rider"
  ON riders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (approval_status = 'pending_approval');
