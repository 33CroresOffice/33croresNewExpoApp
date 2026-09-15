/*
# Add metadata to in-app notifications

Stores structured navigation data such as a shared pooja list token without
putting internal identifiers into notification text.
*/

ALTER TABLE in_app_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
