/*
  # Migrate Subscription Pause History Data

  ## Summary
  Migrates pause history records from the pause_history CSV for subscriptions
  that exist in subscription_id_mapping.

  ## Changes
  - Inserts pause records into subscription_pause_history
  - Only for subscription logical IDs that exist in subscription_id_mapping
  - Skips rows with invalid/numeric subscription IDs (rows 700 and 1039 noted in source)
  - NULL resume_at values stored as NULL

  ## Data Source
  pause_history.csv: subscription_id, pause_start_date, pause_until, resume_at
*/

DO $$
DECLARE
  pause_data text[][] := ARRAY[
    ARRAY['SUB-64756-3','2024-08-10','2024-08-25','2024-08-20'],
    ARRAY['SUB-64756-3','2024-08-26','2024-08-31','2024-08-31']
  ];
  rec text[];
  sub_uuid uuid;
BEGIN
  FOREACH rec SLICE 1 IN ARRAY pause_data LOOP
    SELECT sm.subscription_id INTO sub_uuid FROM subscription_id_mapping sm WHERE sm.logical_id = rec[1];
    IF sub_uuid IS NULL THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM subscription_pause_history
      WHERE subscription_id = sub_uuid
        AND pause_start_date = rec[2]::date
    ) THEN
      INSERT INTO subscription_pause_history (id, subscription_id, pause_start_date, pause_until, resumed_at)
      VALUES (
        gen_random_uuid(),
        sub_uuid,
        rec[2]::date,
        rec[3]::date,
        CASE WHEN rec[4] = '' OR rec[4] IS NULL THEN NULL ELSE rec[4]::date END
      );
    END IF;
  END LOOP;
END $$;
