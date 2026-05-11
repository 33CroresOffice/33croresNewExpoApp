/*
  # Create custom_orders table

  ## Summary
  Adds support for standalone one-time custom flower/garland orders placed by customers,
  separate from their subscription deliveries.

  ## New Tables
  - `custom_orders`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK to auth.users)
    - `order_type` (text) - 'flower' or 'garland'
    - `items` (jsonb) - array of {flower_name, quantity, unit} objects
    - `delivery_date` (date) - requested delivery date
    - `delivery_time` (text) - requested delivery time slot (e.g. "06:34 PM")
    - `address_id` (uuid, FK to addresses) - nullable, references saved address
    - `special_instructions` (text) - optional customer notes
    - `status` (text) - pending | confirmed | out_for_delivery | delivered | cancelled
    - `admin_note` (text) - internal admin note
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Customers can insert/select/update their own orders
  - Admins (via JWT app_metadata role) can select/update all orders
*/

CREATE TABLE IF NOT EXISTS custom_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_type text NOT NULL DEFAULT 'flower' CHECK (order_type IN ('flower', 'garland')),
  items jsonb NOT NULL DEFAULT '[]',
  delivery_date date NOT NULL,
  delivery_time text NOT NULL DEFAULT '',
  address_id uuid REFERENCES addresses(id) ON DELETE SET NULL,
  special_instructions text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled')),
  admin_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE custom_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can insert own custom orders"
  ON custom_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customers can view own custom orders"
  ON custom_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Customers can update own pending custom orders"
  ON custom_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
