/*
  # Fix nullable constraints for procurement tables

  1. procurement_order_items
     - price_per_unit: made nullable so orders can be created before prices are known
  2. procurement_orders
     - requirement_date: made nullable so orders can be created without a required date
*/

ALTER TABLE procurement_order_items ALTER COLUMN price_per_unit DROP NOT NULL;
ALTER TABLE procurement_orders ALTER COLUMN requirement_date DROP NOT NULL;
