-- Backfill: any item with a price already set but no price_set_by was set by the vendor
-- (riders had no way to set prices before this column was added)
UPDATE procurement_order_items
SET price_set_by = 'vendor'
WHERE price_per_unit IS NOT NULL
  AND price_set_by IS NULL;