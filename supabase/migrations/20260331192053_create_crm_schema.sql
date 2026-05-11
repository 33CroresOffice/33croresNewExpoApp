/*
  # CRM Schema

  ## Overview
  Extends the customer management system with a full CRM layer including
  tags, notes, segments, tasks, and activity timeline.

  ## New Tables

  1. `customer_tags`
     - id, name, color, description, created_by, created_at
     - Reusable labels to categorize customers

  2. `customer_tag_assignments`
     - customer_id, tag_id (composite PK)
     - Many-to-many link between customers and tags

  3. `customer_notes`
     - id, customer_id, author_id, content, note_type (general/call/complaint/feedback/renewal), is_pinned, created_at, updated_at
     - Admin notes attached to a customer profile

  4. `customer_segments`
     - id, name, description, color, filter_criteria (jsonb), customer_count (cached), created_by, created_at, updated_at
     - Named groups of customers based on filter rules

  5. `customer_segment_members`
     - segment_id, customer_id (composite PK)
     - Explicit membership (for manual segments)

  6. `crm_tasks`
     - id, title, description, task_type (follow_up/renewal/complaint/onboarding/general), due_date, customer_id, assigned_to, status (open/in_progress/done/cancelled), priority (low/medium/high/urgent), created_by, created_at, updated_at
     - Follow-up and action tasks linked to customers

  7. `customer_activity_log`
     - id, customer_id, actor_id, activity_type, description, metadata (jsonb), created_at
     - Immutable timeline of all CRM events for a customer

  ## Security
  - RLS enabled on all tables
  - Only admins can manage CRM data
*/

-- ─── CUSTOMER TAGS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#4A8C42',
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select customer_tags"
  ON customer_tags FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_tags"
  ON customer_tags FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update customer_tags"
  ON customer_tags FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete customer_tags"
  ON customer_tags FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── CUSTOMER TAG ASSIGNMENTS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (customer_id, tag_id)
);

ALTER TABLE customer_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_customer ON customer_tag_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignments_tag ON customer_tag_assignments(tag_id);

CREATE POLICY "Admins can select customer_tag_assignments"
  ON customer_tag_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_tag_assignments"
  ON customer_tag_assignments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete customer_tag_assignments"
  ON customer_tag_assignments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── CUSTOMER NOTES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'call', 'complaint', 'feedback', 'renewal', 'delivery_issue')),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_at ON customer_notes(created_at DESC);

CREATE POLICY "Admins can select customer_notes"
  ON customer_notes FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_notes"
  ON customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update customer_notes"
  ON customer_notes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete customer_notes"
  ON customer_notes FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER customer_notes_updated_at
  BEFORE UPDATE ON customer_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── CUSTOMER SEGMENTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#2D5A27',
  filter_criteria jsonb NOT NULL DEFAULT '{}',
  is_dynamic boolean NOT NULL DEFAULT false,
  customer_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select customer_segments"
  ON customer_segments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_segments"
  ON customer_segments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update customer_segments"
  ON customer_segments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete customer_segments"
  ON customer_segments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER customer_segments_updated_at
  BEFORE UPDATE ON customer_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── CUSTOMER SEGMENT MEMBERS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_segment_members (
  segment_id uuid NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (segment_id, customer_id)
);

ALTER TABLE customer_segment_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_csm_segment ON customer_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_csm_customer ON customer_segment_members(customer_id);

CREATE POLICY "Admins can select customer_segment_members"
  ON customer_segment_members FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_segment_members"
  ON customer_segment_members FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete customer_segment_members"
  ON customer_segment_members FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── CRM TASKS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT 'general' CHECK (task_type IN ('follow_up', 'renewal', 'complaint', 'onboarding', 'delivery_issue', 'general')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  due_date date,
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON crm_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm_tasks(assigned_to);

CREATE POLICY "Admins can select crm_tasks"
  ON crm_tasks FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert crm_tasks"
  ON crm_tasks FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update crm_tasks"
  ON crm_tasks FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete crm_tasks"
  ON crm_tasks FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── CUSTOMER ACTIVITY LOG ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN (
    'subscription_created', 'subscription_paused', 'subscription_cancelled', 'subscription_renewed',
    'payment_success', 'payment_failed', 'payment_refunded',
    'order_delivered', 'order_failed',
    'note_added', 'tag_added', 'tag_removed', 'segment_added',
    'task_created', 'task_completed',
    'profile_updated', 'address_added'
  )),
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cal_customer_id ON customer_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_cal_created_at ON customer_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_activity_type ON customer_activity_log(activity_type);

CREATE POLICY "Admins can select customer_activity_log"
  ON customer_activity_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert customer_activity_log"
  ON customer_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── SEED DEFAULT TAGS ────────────────────────────────────────────────────────

INSERT INTO customer_tags (name, color, description) VALUES
  ('VIP',            '#D4A853', 'High-value loyal customers'),
  ('At Risk',        '#C62828', 'Customers likely to churn'),
  ('New Customer',   '#2D5A27', 'Joined in last 30 days'),
  ('Gifter',         '#C8526A', 'Buys as gifts for others'),
  ('Complaint',      '#E65100', 'Has raised a complaint'),
  ('Renewal Due',    '#4A8C42', 'Subscription renewing soon'),
  ('Paused',         '#8C8880', 'Currently on pause'),
  ('Bulk Buyer',     '#2D5A27', 'Purchases multiple plans')
ON CONFLICT (name) DO NOTHING;

-- ─── SEED DEFAULT SEGMENTS ────────────────────────────────────────────────────

INSERT INTO customer_segments (name, description, color, filter_criteria, is_dynamic) VALUES
  ('Active Subscribers',   'All customers with at least one active subscription', '#2D5A27', '{"subscription_status": "active"}', true),
  ('Churned Customers',    'Customers who cancelled all subscriptions',            '#C62828', '{"subscription_status": "cancelled", "no_active": true}', true),
  ('High Value',           'Customers who have spent over ₹5,000',                '#D4A853', '{"min_total_spent": 500000}', true),
  ('New This Month',       'Registered in the current calendar month',             '#4A8C42', '{"joined_within_days": 30}', true),
  ('Paused Subscribers',   'Customers with a paused subscription',                 '#8C8880', '{"subscription_status": "paused"}', true),
  ('Never Paid',           'Registered but never completed a payment',             '#E65100', '{"payment_count": 0}', true)
ON CONFLICT (name) DO NOTHING;
