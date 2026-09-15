/*
# Remove ambiguous provider registration function overload

1. Problem
- Provider registration now sends a text[] category list so one provider can
  select multiple categories.
- The earlier registration function accepting one text category was left in
  the database when the text[] version was added.
- Supabase RPC sees both signatures with the same function name and cannot
  reliably select the intended function, causing application submission to
  fail after uploads complete.

2. Changes
- Remove only the obsolete function with p_category text.
- Keep the current function with p_category text[] unchanged.

3. Security
- The remaining function keeps its existing SECURITY DEFINER behavior,
  input validation, search_path, and anon/authenticated EXECUTE grants.
- No tables, provider data, storage objects, or policies are changed.
*/

DROP FUNCTION IF EXISTS public.register_service_provider(
  text, text, text, text, text, text, integer, text[], text, text, text, text, text
);
