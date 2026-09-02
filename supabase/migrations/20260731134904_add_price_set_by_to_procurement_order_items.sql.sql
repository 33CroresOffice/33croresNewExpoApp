ALTER TABLE procurement_order_items
  ADD COLUMN IF NOT EXISTS price_set_by text DEFAULT NULL;

ALTER TABLE procurement_order_items
  ADD CONSTRAINT procurement_order_items_price_set_by_check
  CHECK (price_set_by IS NULL OR price_set_by IN ('vendor', 'rider'));
