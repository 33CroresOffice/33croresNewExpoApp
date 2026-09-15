/*
# Protect provider service overrides

1. Changes
- Prevents providers from changing admin_override_price through direct table updates.
- The admin_set_service_override function remains the only client-callable path for that field.
*/
REVOKE UPDATE (admin_override_price) ON provider_services FROM authenticated;
