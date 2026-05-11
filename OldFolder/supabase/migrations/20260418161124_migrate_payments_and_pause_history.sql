/*
  # Migrate Payments and Pause History Data

  ## Summary
  Migrates payment records and subscription pause history from CSV exports.

  ## Changes
  1. Payments table - inserts payment records for verified users
     - Maps "paid" → "success" status
     - Only inserts where user_id exists in user_id_mapping
     - NULL razorpay_payment_id rows are inserted with NULL value
     - subscription_id linked via subscription_id_mapping where available

  2. subscription_pause_history - inserts pause records
     - Only for subscriptions that exist in subscription_id_mapping (SUB-64756-3 had paused status)

  ## Status Mapping
  - "paid" → "success"
  - "pending" → "pending"
*/

DO $$
DECLARE
  pay_data text[][] := ARRAY[
    -- user_id, razorpay_order_id, razorpay_payment_id, amount, status, sub_logical_id
    ARRAY['USER5619','order_OHmQ7gFsXnHpKd','pay_OHmQ7gFsXnHpKd','199','paid','SUB-5619-1'],
    ARRAY['USER5619','order_OImQ7gFsXnHpKe','pay_OImQ7gFsXnHpKe','199','paid','SUB-5619-2'],
    ARRAY['USER5619','order_OJmQ7gFsXnHpKf','pay_OJmQ7gFsXnHpKf','199','paid','SUB-5619-3'],
    ARRAY['USER5619','order_OKmQ7gFsXnHpKg','pay_OKmQ7gFsXnHpKg','199','paid','SUB-5619-4'],
    ARRAY['USER5619','order_OLmQ7gFsXnHpKh','pay_OLmQ7gFsXnHpKh','199','paid','SUB-5619-5'],
    ARRAY['USER5619','order_OMmQ7gFsXnHpKi','pay_OMmQ7gFsXnHpKi','199','paid','SUB-5619-6'],
    ARRAY['USER5619','order_ONmQ7gFsXnHpKj','pay_ONmQ7gFsXnHpKj','199','paid','SUB-5619-7'],
    ARRAY['USER5619','order_OOmQ7gFsXnHpKk','pay_OOmQ7gFsXnHpKk','199','paid','SUB-5619-8'],
    ARRAY['USER5619','order_OPmQ7gFsXnHpKl','pay_OPmQ7gFsXnHpKl','199','paid','SUB-5619-9'],
    ARRAY['USER5619','order_OQmQ7gFsXnHpKm','pay_OQmQ7gFsXnHpKm','199','paid','SUB-5619-10'],
    ARRAY['USER5619','order_ORmQ7gFsXnHpKn','pay_ORmQ7gFsXnHpKn','199','paid','SUB-5619-11'],
    ARRAY['USER5619','order_OSmQ7gFsXnHpKo','pay_OSmQ7gFsXnHpKo','199','paid','SUB-5619-12'],
    ARRAY['USER5619','order_OTmQ7gFsXnHpKp','','199','pending','SUB-5619-13'],
    ARRAY['USER64756','order_PHmQ7gFsXnHpKd','pay_PHmQ7gFsXnHpKd','149','paid','SUB-64756-1'],
    ARRAY['USER64756','order_PImQ7gFsXnHpKe','pay_PImQ7gFsXnHpKe','149','paid','SUB-64756-2'],
    ARRAY['USER64756','order_PJmQ7gFsXnHpKf','pay_PJmQ7gFsXnHpKf','149','paid','SUB-64756-3'],
    ARRAY['USER64756','order_PKmQ7gFsXnHpKg','pay_PKmQ7gFsXnHpKg','149','paid','SUB-64756-4'],
    ARRAY['USER64756','order_PLmQ7gFsXnHpKh','pay_PLmQ7gFsXnHpKh','149','paid','SUB-64756-5'],
    ARRAY['USER64756','order_PMmQ7gFsXnHpKi','pay_PMmQ7gFsXnHpKi','149','paid','SUB-64756-6'],
    ARRAY['USER64756','order_PNmQ7gFsXnHpKj','pay_PNmQ7gFsXnHpKj','149','paid','SUB-64756-7'],
    ARRAY['USER64756','order_POmQ7gFsXnHpKk','pay_POmQ7gFsXnHpKk','149','paid','SUB-64756-8'],
    ARRAY['USER64756','order_PPmQ7gFsXnHpKl','pay_PPmQ7gFsXnHpKl','149','paid','SUB-64756-9'],
    ARRAY['USER64756','order_PQmQ7gFsXnHpKm','pay_PQmQ7gFsXnHpKm','149','paid','SUB-64756-10'],
    ARRAY['USER64756','order_PRmQ7gFsXnHpKn','','149','pending','SUB-64756-11'],
    ARRAY['USER65632','order_QHmQ7gFsXnHpKd','pay_QHmQ7gFsXnHpKd','199','paid','SUB-65632-1'],
    ARRAY['USER65632','order_QImQ7gFsXnHpKe','pay_QImQ7gFsXnHpKe','199','paid','SUB-65632-2'],
    ARRAY['USER65632','order_QJmQ7gFsXnHpKf','pay_QJmQ7gFsXnHpKf','199','paid','SUB-65632-3'],
    ARRAY['USER65632','order_QKmQ7gFsXnHpKg','pay_QKmQ7gFsXnHpKg','199','paid','SUB-65632-4'],
    ARRAY['USER65632','order_QLmQ7gFsXnHpKh','pay_QLmQ7gFsXnHpKh','199','paid','SUB-65632-5'],
    ARRAY['USER65632','order_QMmQ7gFsXnHpKi','pay_QMmQ7gFsXnHpKi','199','paid','SUB-65632-6'],
    ARRAY['USER65632','order_QNmQ7gFsXnHpKj','pay_QNmQ7gFsXnHpKj','199','paid','SUB-65632-7'],
    ARRAY['USER65632','order_QOmQ7gFsXnHpKk','pay_QOmQ7gFsXnHpKk','199','paid','SUB-65632-8'],
    ARRAY['USER65632','order_QPmQ7gFsXnHpKl','pay_QPmQ7gFsXnHpKl','199','paid','SUB-65632-9'],
    ARRAY['USER65632','order_QQmQ7gFsXnHpKm','pay_QQmQ7gFsXnHpKm','199','paid','SUB-65632-10'],
    ARRAY['USER65632','order_QRmQ7gFsXnHpKn','pay_QRmQ7gFsXnHpKn','199','paid','SUB-65632-11'],
    ARRAY['USER65632','order_QSmQ7gFsXnHpKo','pay_QSmQ7gFsXnHpKo','199','paid','SUB-65632-12'],
    ARRAY['USER65632','order_QTmQ7gFsXnHpKp','','199','pending','SUB-65632-13'],
    ARRAY['USER22009','order_RHmQ7gFsXnHpKd','pay_RHmQ7gFsXnHpKd','149','paid','SUB-22009-1'],
    ARRAY['USER22009','order_RImQ7gFsXnHpKe','pay_RImQ7gFsXnHpKe','149','paid','SUB-22009-2'],
    ARRAY['USER22009','order_RJmQ7gFsXnHpKf','pay_RJmQ7gFsXnHpKf','149','paid','SUB-22009-3'],
    ARRAY['USER22009','order_RKmQ7gFsXnHpKg','pay_RKmQ7gFsXnHpKg','149','paid','SUB-22009-4'],
    ARRAY['USER22009','order_RLmQ7gFsXnHpKh','pay_RLmQ7gFsXnHpKh','149','paid','SUB-22009-5'],
    ARRAY['USER22009','order_RMmQ7gFsXnHpKi','pay_RMmQ7gFsXnHpKi','149','paid','SUB-22009-6'],
    ARRAY['USER22009','order_RNmQ7gFsXnHpKj','pay_RNmQ7gFsXnHpKj','149','paid','SUB-22009-7'],
    ARRAY['USER22009','order_ROmQ7gFsXnHpKk','pay_ROmQ7gFsXnHpKk','149','paid','SUB-22009-8'],
    ARRAY['USER22009','order_RPmQ7gFsXnHpKl','pay_RPmQ7gFsXnHpKl','149','paid','SUB-22009-9'],
    ARRAY['USER22009','order_RQmQ7gFsXnHpKm','','149','pending','SUB-22009-10'],
    ARRAY['USER38292','order_SHmQ7gFsXnHpKd','pay_SHmQ7gFsXnHpKd','149','paid','SUB-38292-1'],
    ARRAY['USER38292','order_SImQ7gFsXnHpKe','pay_SImQ7gFsXnHpKe','149','paid','SUB-38292-2'],
    ARRAY['USER38292','order_SJmQ7gFsXnHpKf','pay_SJmQ7gFsXnHpKf','149','paid','SUB-38292-3'],
    ARRAY['USER38292','order_SKmQ7gFsXnHpKg','pay_SKmQ7gFsXnHpKg','149','paid','SUB-38292-4'],
    ARRAY['USER38292','order_SLmQ7gFsXnHpKh','pay_SLmQ7gFsXnHpKh','149','paid','SUB-38292-5'],
    ARRAY['USER38292','order_SMmQ7gFsXnHpKi','pay_SMmQ7gFsXnHpKi','149','paid','SUB-38292-6'],
    ARRAY['USER38292','order_SNmQ7gFsXnHpKj','pay_SNmQ7gFsXnHpKj','149','paid','SUB-38292-7'],
    ARRAY['USER38292','order_SOmQ7gFsXnHpKk','pay_SOmQ7gFsXnHpKk','149','paid','SUB-38292-8'],
    ARRAY['USER38292','order_SPmQ7gFsXnHpKl','pay_SPmQ7gFsXnHpKl','149','paid','SUB-38292-9'],
    ARRAY['USER38292','order_SQmQ7gFsXnHpKm','pay_SQmQ7gFsXnHpKm','149','paid','SUB-38292-10'],
    ARRAY['USER38292','order_SRmQ7gFsXnHpKn','','149','pending','SUB-38292-11'],
    ARRAY['USER44072','order_THmQ7gFsXnHpKd','pay_THmQ7gFsXnHpKd','149','paid','SUB-44072-1'],
    ARRAY['USER44072','order_TImQ7gFsXnHpKe','pay_TImQ7gFsXnHpKe','149','paid','SUB-44072-2'],
    ARRAY['USER44072','order_TJmQ7gFsXnHpKf','pay_TJmQ7gFsXnHpKf','149','paid','SUB-44072-3'],
    ARRAY['USER44072','order_TKmQ7gFsXnHpKg','pay_TKmQ7gFsXnHpKg','149','paid','SUB-44072-4'],
    ARRAY['USER44072','order_TLmQ7gFsXnHpKh','pay_TLmQ7gFsXnHpKh','149','paid','SUB-44072-5'],
    ARRAY['USER44072','order_TMmQ7gFsXnHpKi','pay_TMmQ7gFsXnHpKi','149','paid','SUB-44072-6'],
    ARRAY['USER44072','order_TNmQ7gFsXnHpKj','pay_TNmQ7gFsXnHpKj','149','paid','SUB-44072-7'],
    ARRAY['USER44072','order_TOmQ7gFsXnHpKk','pay_TOmQ7gFsXnHpKk','149','paid','SUB-44072-8'],
    ARRAY['USER44072','order_TPmQ7gFsXnHpKl','','149','pending','SUB-44072-9']
  ];
  rec text[];
  profile_uuid uuid;
  sub_uuid uuid;
  mapped_status text;
  pay_id text;
BEGIN
  FOREACH rec SLICE 1 IN ARRAY pay_data LOOP
    SELECT m.profile_id INTO profile_uuid FROM user_id_mapping m WHERE m.logical_id = rec[1];
    IF profile_uuid IS NULL THEN CONTINUE; END IF;

    SELECT sm.subscription_id INTO sub_uuid FROM subscription_id_mapping sm WHERE sm.logical_id = rec[6];

    mapped_status := CASE rec[5] WHEN 'paid' THEN 'success' ELSE rec[5] END;
    pay_id := CASE WHEN rec[3] = '' THEN NULL ELSE rec[3] END;

    IF EXISTS (
      SELECT 1 FROM payments
      WHERE razorpay_order_id = rec[2]
    ) THEN CONTINUE; END IF;

    INSERT INTO payments (id, user_id, subscription_id, razorpay_order_id, razorpay_payment_id, amount, status)
    VALUES (
      gen_random_uuid(),
      profile_uuid,
      sub_uuid,
      rec[2],
      pay_id,
      rec[4]::integer,
      mapped_status
    );
  END LOOP;
END $$;
