/*
  # Expand unit_type allowed values across all tables

  ## Changes
  - Drops and recreates unit_type CHECK constraints on:
    - flower_types
    - plan_flower_requirements
    - daily_requirements
    - procurement_order_items
    - warehouse_receipt_items
  - New allowed units: kg, grams, pieces, bunch, stems, dozen, ml, litre, packet, tray, box, meter
*/

ALTER TABLE flower_types
  DROP CONSTRAINT IF EXISTS flower_types_unit_type_check;
ALTER TABLE flower_types
  ADD CONSTRAINT flower_types_unit_type_check
  CHECK (unit_type = ANY (ARRAY['kg','grams','pieces','bunch','stems','dozen','ml','litre','packet','tray','box','meter']));

ALTER TABLE plan_flower_requirements
  DROP CONSTRAINT IF EXISTS plan_flower_requirements_unit_type_check;
ALTER TABLE plan_flower_requirements
  ADD CONSTRAINT plan_flower_requirements_unit_type_check
  CHECK (unit_type = ANY (ARRAY['kg','grams','pieces','bunch','stems','dozen','ml','litre','packet','tray','box','meter']));

ALTER TABLE daily_requirements
  DROP CONSTRAINT IF EXISTS daily_requirements_unit_type_check;
ALTER TABLE daily_requirements
  ADD CONSTRAINT daily_requirements_unit_type_check
  CHECK (unit_type = ANY (ARRAY['kg','grams','pieces','bunch','stems','dozen','ml','litre','packet','tray','box','meter']));

ALTER TABLE procurement_order_items
  DROP CONSTRAINT IF EXISTS procurement_order_items_unit_type_check;
ALTER TABLE procurement_order_items
  ADD CONSTRAINT procurement_order_items_unit_type_check
  CHECK (unit_type = ANY (ARRAY['kg','grams','pieces','bunch','stems','dozen','ml','litre','packet','tray','box','meter']));

ALTER TABLE warehouse_receipt_items
  DROP CONSTRAINT IF EXISTS warehouse_receipt_items_unit_type_check;
ALTER TABLE warehouse_receipt_items
  ADD CONSTRAINT warehouse_receipt_items_unit_type_check
  CHECK (unit_type = ANY (ARRAY['kg','grams','pieces','bunch','stems','dozen','ml','litre','packet','tray','box','meter']));
