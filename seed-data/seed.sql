-- ============================================================
-- KuratorKas — Demo seed data (10 sample products + 1 demo user)
-- Use: npm run db:seed:local
-- Password 'demo123' (hashed with PBKDF2-SHA256, salt prepended)
-- ============================================================

-- Demo user — email: demo@kuratorkas.id / password: demo123
-- NOTE: hash + salt below are placeholders. Actual values set by `/api/auth/register` endpoint.
-- For dev convenience, registration endpoint creates user with hashed password on the fly.
-- This seed file only ensures `demo@kuratorkas.id` exists with a known hash for testing.

INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, name, business_name, business_type, subscription_tier)
VALUES (
  'usr_demo_001',
  'demo@kuratorkas.id',
  '__SEED_PASSWORD_HASH_PLACEHOLDER__',
  '__SEED_PASSWORD_SALT_PLACEHOLDER__',
  'Sari Demo',
  'Sari Fashion Bandung',
  'hybrid',
  'pro'
);

-- 10 sample fashion products
INSERT OR IGNORE INTO products (id, user_id, name, description, price, cost_price, category, subcategory, size, color, stock, images, is_active) VALUES
  ('prd_001', 'usr_demo_001', 'Kemeja Linen Putih',         'Kemeja linen premium, breathable, cocok untuk daily/office', 189000, 110000, 'Atasan', 'Kemeja', 'M', 'Putih',    25, '["https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400"]', 1),
  ('prd_002', 'usr_demo_001', 'Celana Wide-Leg Khaki',      'Celana high-waist wide-leg, korean-inspired',                 215000, 130000, 'Bawahan', 'Celana', 'M', 'Khaki',    18, '["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400"]', 1),
  ('prd_003', 'usr_demo_001', 'Blouse Floral Pastel',       'Blouse motif bunga lembut, vibe summer',                       175000, 105000, 'Atasan', 'Blouse', 'S', 'Pink',     20, '["https://images.unsplash.com/photo-1485518882345-15568b007407?w=400"]', 1),
  ('prd_004', 'usr_demo_001', 'Rok Midi A-Line Hitam',      'Rok A-line midi serbaguna untuk office/casual',               149000, 90000,  'Bawahan', 'Rok',    'M', 'Hitam',    30, '["https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=400"]', 1),
  ('prd_005', 'usr_demo_001', 'Outer Blazer Korean Beige',  'Blazer cutting oversized korean style',                       295000, 175000, 'Outerwear', 'Blazer', 'L', 'Beige',  12, '["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400"]', 1),
  ('prd_006', 'usr_demo_001', 'Kaos Basic Premium Cream',   'T-shirt katun premium, 100% combed 30s',                       89000,  45000,  'Atasan', 'Kaos',   'M', 'Cream',    50, '["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"]', 1),
  ('prd_007', 'usr_demo_001', 'Tas Mini Crossbody',         'Tas selempang mini PU leather',                                129000, 65000,  'Aksesori', 'Tas',  '-', 'Coklat',  22, '["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400"]', 1),
  ('prd_008', 'usr_demo_001', 'Sepatu Sneakers Putih',      'Sneakers minimalis canvas + rubber sole',                      249000, 150000, 'Sepatu', 'Sneakers', '38', 'Putih', 15, '["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400"]', 1),
  ('prd_009', 'usr_demo_001', 'Topi Bucket Tartan',         'Bucket hat motif tartan, streetwear vibe',                     79000,  40000,  'Aksesori', 'Topi', '-', 'Tartan',  28, '["https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=400"]', 1),
  ('prd_010', 'usr_demo_001', 'Dress Mini Casual',          'Dress mini santai, perfect untuk weekend brunch',              225000, 135000, 'Dress', 'Mini Dress', 'S', 'Hijau Sage', 14, '["https://images.unsplash.com/photo-1572804013427-4d7ca7268217?w=400"]', 1);

-- Sample order (offline POS transaction)
INSERT OR IGNORE INTO orders (id, user_id, order_number, marketplace, customer_name, total_amount, status, payment_status)
VALUES ('ord_demo_001', 'usr_demo_001', 'KK-2026-0001', 'offline', 'Walk-in Customer', 364000, 'delivered', 'paid');

INSERT OR IGNORE INTO order_items (id, order_id, product_id, quantity, price) VALUES
  ('oi_001', 'ord_demo_001', 'prd_001', 1, 189000),
  ('oi_002', 'ord_demo_001', 'prd_006', 1, 89000),
  ('oi_003', 'ord_demo_001', 'prd_009', 1, 79000);
