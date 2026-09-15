/*
# Restrict public pooja item visibility

Only expose item rows when their pooja setup is active and belongs to an
approved, active provider. Pandits and admins retain their own policies.
*/

DROP POLICY IF EXISTS "Public can view pooja setup items" ON provider_pooja_items;
CREATE POLICY "Public can view active pooja setup items" ON provider_pooja_items FOR SELECT
TO anon, authenticated
USING (EXISTS (
  SELECT 1
  FROM provider_pooja_setups ps
  JOIN service_providers sp ON sp.id = ps.provider_id
  WHERE ps.id = provider_pooja_items.pooja_setup_id
    AND ps.is_active = true
    AND sp.approval_status = 'approved'
    AND sp.is_active = true
));
