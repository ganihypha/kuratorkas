-- ============================================================
-- KuratorKas × Curator.OS — Initial D1 Schema
-- Doctrine: 03_KURATORKAS_ARCHITECTURE_v2.md §2.3
-- Owner: Reza Estes / Haidar — Sovereign AI Dev
-- ============================================================

-- Users (UMKM fashion sellers)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    name TEXT NOT NULL,
    business_name TEXT,
    business_type TEXT DEFAULT 'online',   -- 'retail' | 'online' | 'hybrid'
    subscription_tier TEXT DEFAULT 'free', -- 'free' | 'starter' | 'pro' | 'enterprise'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Products (catalog)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,         -- IDR integer (no decimals for IDR)
    cost_price INTEGER,             -- for margin calculation
    category TEXT,
    subcategory TEXT,
    size TEXT,
    color TEXT,
    stock INTEGER DEFAULT 0,
    images TEXT,                    -- JSON array of image URLs
    marketplace_ids TEXT,           -- JSON: { shopee, tokopedia, tiktok }
    embedding_id TEXT,              -- Vectorize ID
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders (POS transactions)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    marketplace TEXT DEFAULT 'offline',  -- 'shopee'|'tokopedia'|'tiktok'|'offline'
    marketplace_order_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    total_amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',       -- pending|processing|shipped|delivered|cancelled
    payment_status TEXT DEFAULT 'pending', -- pending|paid|refunded
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Order items (line items per order)
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,        -- snapshot of product price at time of order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Outfits (AI Stylist Curator output)
CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    products TEXT NOT NULL,        -- JSON array of product IDs
    total_price INTEGER,
    discount_percentage INTEGER DEFAULT 0,
    occasion TEXT,                 -- 'casual'|'formal'|'party'|'office'
    style TEXT,                    -- 'korean'|'streetwear'|'minimalist'|...
    description TEXT,
    styling_tips TEXT,             -- JSON array of tips
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Content (Content Curator output)
CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,            -- 'instagram_post'|'carousel'|'tiktok'|'story'
    products TEXT,                 -- JSON array of product IDs
    caption TEXT,
    hashtags TEXT,                 -- JSON array
    hooks TEXT,                    -- JSON array (3 video hooks)
    cta TEXT,
    carousel_layout TEXT,
    scheduled_at TEXT,
    posted_at TEXT,
    status TEXT DEFAULT 'draft',   -- draft|scheduled|posted|failed
    viral_score INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trends (Trend Curator detected)
CREATE TABLE IF NOT EXISTS trends (
    id TEXT PRIMARY KEY,
    hashtag TEXT NOT NULL,
    platform TEXT NOT NULL,        -- 'tiktok'|'instagram'
    posts_count INTEGER,
    engagement_rate REAL,
    growth_rate REAL,
    related_products TEXT,
    detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
);

-- Price history (Pricing Curator audit trail)
CREATE TABLE IF NOT EXISTS price_history (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    old_price INTEGER,
    new_price INTEGER,
    reason TEXT,                   -- 'competitor_scan'|'demand_elasticity'|'flash_sale'|'manual'
    confidence_score REAL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Competitor prices (scraped)
CREATE TABLE IF NOT EXISTS competitor_prices (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    competitor_name TEXT,
    competitor_product_url TEXT,
    price INTEGER,
    marketplace TEXT,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Marketplace connections (OAuth tokens)
CREATE TABLE IF NOT EXISTS marketplace_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    marketplace TEXT NOT NULL,     -- 'shopee'|'tokopedia'|'tiktok'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    shop_id TEXT,
    shop_name TEXT,
    is_active INTEGER DEFAULT 1,
    connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity log (audit trail)
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,                  -- JSON
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_marketplace ON orders(marketplace);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_outfits_user_id ON outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_content_user_id ON content(user_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_trends_platform ON trends(platform);
CREATE INDEX IF NOT EXISTS idx_trends_expires_at ON trends(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
