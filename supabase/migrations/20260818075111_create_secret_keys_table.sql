/*
# Create admin-managed secret keys

## Summary
Stores third-party service credentials used by the application.

## Security
- Row-level security is enabled.
- Only authenticated administrators can read or manage secrets.
- Anonymous users have no table privileges.
*/

CREATE TABLE IF NOT EXISTS public.secret_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.secret_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.secret_keys FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secret_keys TO authenticated;

CREATE POLICY "Admins can view secret keys"
  ON public.secret_keys FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert secret keys"
  ON public.secret_keys FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update secret keys"
  ON public.secret_keys FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can delete secret keys"
  ON public.secret_keys FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE OR REPLACE FUNCTION public.update_secret_keys_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS secret_keys_updated_at ON public.secret_keys;
CREATE TRIGGER secret_keys_updated_at
  BEFORE UPDATE ON public.secret_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_secret_keys_updated_at();
