/*
# Allow provider profile lookup by ownership link

1. Changes
- Grants authenticated clients SELECT access to auth_user_id so the provider's own-row ownership filter can be evaluated.

2. Security
- RLS still limits provider rows to auth.uid() = auth_user_id.
- Anonymous clients do not receive this column privilege.
*/
GRANT SELECT (auth_user_id) ON service_providers TO authenticated;
