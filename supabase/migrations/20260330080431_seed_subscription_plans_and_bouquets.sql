/*
  # Seed Data: Subscription Plans and Bouquets

  ## Overview
  Inserts initial subscription plans, bouquets, and their associations.

  ## Plans
  1. Bloom Starter - Monthly, 1 delivery, basic bouquet
  2. Petal Plus - Bi-weekly, 2 deliveries, more variety
  3. Garden Luxe - Weekly, 4 deliveries, premium selection

  ## Bouquets
  10 bouquet types across roses, mixed, seasonal, exotic, sunflowers, lilies
*/

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────

INSERT INTO subscription_plans (id, name, description, price, frequency, deliveries_per_month, image_url, is_active, features, sort_order) VALUES
(
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Bloom Starter',
  'Perfect for those new to flower subscriptions. Receive one beautifully curated bouquet each month, handpicked by our florists.',
  149900,
  'monthly',
  1,
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  true,
  '["1 bouquet per month", "Seasonal flowers", "Choose your bouquet type", "Free delivery", "Eco-friendly packaging"]',
  1
),
(
  'a1b2c3d4-0002-0002-0002-000000000002',
  'Petal Plus',
  'Elevate your space with two fresh deliveries every month. More variety, more beauty, and the joy of flowers twice a month.',
  279900,
  'biweekly',
  2,
  'https://images.pexels.com/photos/2263168/pexels-photo-2263168.jpeg',
  true,
  '["2 bouquets per month", "Premium seasonal flowers", "Full bouquet customization", "Free priority delivery", "Handwritten card option", "Eco-friendly packaging"]',
  2
),
(
  'a1b2c3d4-0003-0003-0003-000000000003',
  'Garden Luxe',
  'Our finest offering. A fresh luxury bouquet every week featuring rare and exotic blooms, curated by our master florists.',
  499900,
  'weekly',
  4,
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  true,
  '["4 bouquets per month", "Exotic & rare blooms", "Full customization per delivery", "Express delivery", "Handwritten card each delivery", "Vase included first month", "Dedicated florist advisor"]',
  3
)
ON CONFLICT (id) DO NOTHING;

-- ─── BOUQUETS ────────────────────────────────────────────────────────────────

INSERT INTO bouquets (id, name, description, image_url, category, is_available) VALUES
(
  'b1b2c3d4-0001-0001-0001-000000000001',
  'Red Rose Romance',
  'Classic long-stemmed red roses symbolizing deep love and passion. A timeless choice for any occasion.',
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  'roses',
  true
),
(
  'b1b2c3d4-0002-0002-0002-000000000002',
  'Pink Blush Roses',
  'Delicate pink roses with a soft, romantic appearance. Perfect for expressing admiration and appreciation.',
  'https://images.pexels.com/photos/2263168/pexels-photo-2263168.jpeg',
  'roses',
  true
),
(
  'b1b2c3d4-0003-0003-0003-000000000003',
  'Golden Sunflower Burst',
  'Bright, cheerful sunflowers that bring warmth and joy into any room. Nature''s natural mood lifter.',
  'https://images.pexels.com/photos/46160/field-clouds-sky-earth-46160.jpeg',
  'sunflowers',
  true
),
(
  'b1b2c3d4-0004-0004-0004-000000000004',
  'Spring Mixed Medley',
  'A vibrant mix of seasonal spring flowers including tulips, daisies, and baby''s breath. Fresh and lively.',
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  'mixed',
  true
),
(
  'b1b2c3d4-0005-0005-0005-000000000005',
  'White Lily Elegance',
  'Pure white lilies representing purity, elegance, and grace. A sophisticated choice for refined spaces.',
  'https://images.pexels.com/photos/2263168/pexels-photo-2263168.jpeg',
  'lilies',
  true
),
(
  'b1b2c3d4-0006-0006-0006-000000000006',
  'Pink Stargazer Lilies',
  'Striking pink stargazer lilies with their distinctive fragrance and dramatic appearance.',
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  'lilies',
  true
),
(
  'b1b2c3d4-0007-0007-0007-000000000007',
  'Exotic Orchid Collection',
  'Rare and beautiful orchids in a stunning arrangement. Long-lasting blooms with an exotic flair.',
  'https://images.pexels.com/photos/2263168/pexels-photo-2263168.jpeg',
  'exotic',
  true
),
(
  'b1b2c3d4-0008-0008-0008-000000000008',
  'Tropical Paradise Mix',
  'Exotic tropical flowers including birds of paradise, anthuriums, and tropical foliage.',
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  'exotic',
  true
),
(
  'b1b2c3d4-0009-0009-0009-000000000009',
  'Autumn Harvest Blend',
  'Warm autumnal tones with dahlias, chrysanthemums, and orange roses celebrating the season.',
  'https://images.pexels.com/photos/2263168/pexels-photo-2263168.jpeg',
  'seasonal',
  true
),
(
  'b1b2c3d4-0010-0010-0010-000000000010',
  'Garden Fresh Wildflowers',
  'A charming mix of wildflowers and garden blooms that feel freshly picked from a countryside meadow.',
  'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg',
  'mixed',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── PLAN BOUQUET OPTIONS ─────────────────────────────────────────────────────

-- Bloom Starter: basic bouquet options
INSERT INTO plan_bouquet_options (plan_id, bouquet_id) VALUES
('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0001-0001-0001-000000000001'),
('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0002-0002-0002-000000000002'),
('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0003-0003-0003-000000000003'),
('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0004-0004-0004-000000000004'),
('a1b2c3d4-0001-0001-0001-000000000001', 'b1b2c3d4-0010-0010-0010-000000000010')
ON CONFLICT DO NOTHING;

-- Petal Plus: more variety
INSERT INTO plan_bouquet_options (plan_id, bouquet_id) VALUES
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0001-0001-0001-000000000001'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0002-0002-0002-000000000002'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0003-0003-0003-000000000003'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0004-0004-0004-000000000004'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0005-0005-0005-000000000005'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0006-0006-0006-000000000006'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0009-0009-0009-000000000009'),
('a1b2c3d4-0002-0002-0002-000000000002', 'b1b2c3d4-0010-0010-0010-000000000010')
ON CONFLICT DO NOTHING;

-- Garden Luxe: all bouquets
INSERT INTO plan_bouquet_options (plan_id, bouquet_id) VALUES
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0001-0001-0001-000000000001'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0002-0002-0002-000000000002'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0003-0003-0003-000000000003'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0004-0004-0004-000000000004'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0005-0005-0005-000000000005'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0006-0006-0006-000000000006'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0007-0007-0007-000000000007'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0008-0008-0008-000000000008'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0009-0009-0009-000000000009'),
('a1b2c3d4-0003-0003-0003-000000000003', 'b1b2c3d4-0010-0010-0010-000000000010')
ON CONFLICT DO NOTHING;
