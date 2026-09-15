/*
# Support multiple categories per service provider

1. Changes
- Converts service_providers.category from text to text[] so a provider can offer astrology, vaastu and pandit services simultaneously.
- Backfills existing single-category rows into single-element arrays.
- Updates the check constraint to validate each array element.
- Updates the register_service_provider function to accept a text[] parameter.

2. Security
- No new policies needed; existing RLS still applies.
- The register function validates each category element against the allowed set.
*/
ALTER TABLE service_providers DROP CONSTRAINT IF EXISTS service_providers_category_check;
ALTER TABLE service_providers ALTER COLUMN category TYPE text[] USING ARRAY[category];
ALTER TABLE service_providers ALTER COLUMN category SET DEFAULT '{}';
ALTER TABLE service_providers ADD CONSTRAINT service_providers_category_check
  CHECK (array_length(category, 1) >= 1 AND array_length(category, 1) <= 3
         AND category <@ ARRAY['astrology','vaastu','pandit']::text[]);

CREATE OR REPLACE FUNCTION register_service_provider(
  p_full_name text, p_mobile text, p_alternate_mobile text, p_email text,
  p_category text[], p_specialization text, p_experience_years integer,
  p_languages text[], p_bio text, p_city text, p_address text,
  p_profile_photo_url text, p_id_proof_url text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cat text[];
BEGIN
  IF length(trim(coalesce(p_full_name,''))) < 2 OR p_mobile !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid registration details'; END IF;
  v_cat := array(SELECT DISTINCT lower(trim(c)) FROM unnest(p_category) c WHERE trim(c) IN ('astrology','vaastu','pandit'));
  IF array_length(v_cat,1) IS NULL OR array_length(v_cat,1) < 1 THEN RAISE EXCEPTION 'Invalid category'; END IF;
  INSERT INTO service_providers(full_name,mobile,alternate_mobile,email,category,specialization,experience_years,languages,bio,city,address,profile_photo_url,id_proof_url)
  VALUES(trim(p_full_name),trim(p_mobile),NULLIF(trim(coalesce(p_alternate_mobile,'')),''),NULLIF(trim(coalesce(p_email,'')),''),v_cat,trim(coalesce(p_specialization,'')),greatest(0,least(coalesce(p_experience_years,0),100)),coalesce(p_languages,'{}'),trim(coalesce(p_bio,'')),trim(coalesce(p_city,'')),trim(coalesce(p_address,'')),p_profile_photo_url,p_id_proof_url)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Registration already exists';
END; $$;
REVOKE ALL ON FUNCTION register_service_provider(text,text,text,text,text[],text,integer,text[],text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_service_provider(text,text,text,text,text[],text,integer,text[],text,text,text,text,text) TO anon, authenticated;
