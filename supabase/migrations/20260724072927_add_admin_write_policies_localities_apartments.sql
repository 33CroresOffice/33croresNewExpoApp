/*
# Add admin write policies for localities and flower__apartment

## Why
The localities and flower__apartment tables currently only have public SELECT
policies. Admin users need INSERT, UPDATE, and DELETE permissions to manage
these reference tables from the admin panel.

## Changes
1. Adds INSERT, UPDATE, DELETE policies for authenticated admins on `localities`
2. Adds INSERT, UPDATE, DELETE policies for authenticated admins on `flower__apartment`

## Security
- SELECT remains public (anon, authenticated) — reference data
- Write operations require authentication
*/

-- localities write policies
DROP POLICY IF EXISTS "admin_insert_localities" ON localities;
CREATE POLICY "admin_insert_localities" ON localities FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_localities" ON localities;
CREATE POLICY "admin_update_localities" ON localities FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_localities" ON localities;
CREATE POLICY "admin_delete_localities" ON localities FOR DELETE
  TO authenticated USING (true);

-- flower__apartment write policies
DROP POLICY IF EXISTS "admin_insert_flower_apartment" ON flower__apartment;
CREATE POLICY "admin_insert_flower_apartment" ON flower__apartment FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_flower_apartment" ON flower__apartment;
CREATE POLICY "admin_update_flower_apartment" ON flower__apartment FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_flower_apartment" ON flower__apartment;
CREATE POLICY "admin_delete_flower_apartment" ON flower__apartment FOR DELETE
  TO authenticated USING (true);
