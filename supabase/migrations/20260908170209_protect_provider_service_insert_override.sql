/*
# Protect provider service insert fields

1. Changes
- Removes direct authenticated INSERT access to admin_override_price.

2. Security
- Provider-created services use the provider price only; admin overrides are set through the protected admin function.
*/
REVOKE INSERT (admin_override_price) ON provider_services FROM authenticated;
