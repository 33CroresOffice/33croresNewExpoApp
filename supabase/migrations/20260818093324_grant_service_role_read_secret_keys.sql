/*
# Grant service_role read access to secret_keys

## Summary
Edge functions run with the service_role, which bypasses RLS but still
needs explicit table privileges. This migration grants SELECT on the
secret_keys table to the service_role so edge functions can look up
third-party API keys (MSG91, Razorpay, OTP) that the super-admin saved
through the Secret Keys admin screen.

## Security
- Only SELECT is granted — edge functions never write secret keys.
- The service_role bypasses RLS, so no policy changes are needed.
- anon and authenticated access remain unchanged (admin-only via RLS).
*/

GRANT SELECT ON TABLE public.secret_keys TO service_role;
