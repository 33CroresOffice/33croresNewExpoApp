/*
# Add early delivery WhatsApp secret keys

1. Purpose
- Adds the three secret key entries needed for the early delivery WhatsApp template override, mirroring the existing heavy rainfall pattern.

2. New secret keys
- MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_NAME — the approved MSG91 WhatsApp template name ("early_delivery").
- MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_ID — the approved MSG91 template ID (525521).
- MSG91_WHATSAPP_EARLY_DELIVERY_LANGUAGE — the language code for the template (defaults to "en").

3. Safety
- Inserts only when a key with the same name does not already exist.
- Does not modify or remove existing secret keys.
*/

INSERT INTO public.secret_keys (key, value)
SELECT 'MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_NAME', 'early_delivery'
WHERE NOT EXISTS (SELECT 1 FROM public.secret_keys WHERE key = 'MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_NAME');

INSERT INTO public.secret_keys (key, value)
SELECT 'MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_ID', '525521'
WHERE NOT EXISTS (SELECT 1 FROM public.secret_keys WHERE key = 'MSG91_WHATSAPP_EARLY_DELIVERY_TEMPLATE_ID');

INSERT INTO public.secret_keys (key, value)
SELECT 'MSG91_WHATSAPP_EARLY_DELIVERY_LANGUAGE', 'en'
WHERE NOT EXISTS (SELECT 1 FROM public.secret_keys WHERE key = 'MSG91_WHATSAPP_EARLY_DELIVERY_LANGUAGE');