/*
# Harden Pandit pooja policies

- Replace broad FOR ALL admin policies with separate CRUD policies.
- Remove the public SELECT policy from share records. The public edge function
  reads shares with the service role after validating the token.
*/

DROP POLICY IF EXISTS "Admin can manage all pooja setups" ON provider_pooja_setups;
CREATE POLICY "Admin can read all pooja setups" ON provider_pooja_setups FOR SELECT TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can insert pooja setups" ON provider_pooja_setups FOR INSERT TO authenticated WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can update pooja setups" ON provider_pooja_setups FOR UPDATE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can delete pooja setups" ON provider_pooja_setups FOR DELETE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can manage all pooja setup items" ON provider_pooja_items;
CREATE POLICY "Admin can read all pooja setup items" ON provider_pooja_items FOR SELECT TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can insert pooja setup items" ON provider_pooja_items FOR INSERT TO authenticated WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can update pooja setup items" ON provider_pooja_items FOR UPDATE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Admin can delete pooja setup items" ON provider_pooja_items FOR DELETE TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Public can view active pooja list shares by token" ON pooja_list_shares;
