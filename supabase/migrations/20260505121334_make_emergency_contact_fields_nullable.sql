/*
  # Make emergency contact fields nullable on riders

  These fields are optional during self-registration.
*/

ALTER TABLE riders
  ALTER COLUMN emergency_contact_name DROP NOT NULL,
  ALTER COLUMN emergency_contact_mobile DROP NOT NULL;
