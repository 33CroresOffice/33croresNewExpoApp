/*
# Protect provider private columns

1. Changes
- Removes client-side SELECT access to identity document paths and auth-user links.

2. Security
- Provider and admin screens use only the profile, approval, service, and booking fields needed for their views.
- These columns remain available to server-side service-role operations.
*/
REVOKE SELECT (id_proof_url, auth_user_id) ON service_providers FROM anon, authenticated;
