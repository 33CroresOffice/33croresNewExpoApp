
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS msg91_whatsapp_variables jsonb DEFAULT '[]'::jsonb;
