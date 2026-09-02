ALTER TABLE procurement_orders
ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
