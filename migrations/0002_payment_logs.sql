-- ============================================================
-- KuratorKas × Curator.OS — Migration 0002: Payment Logs
-- Adds subscription/billing payment tracking
-- Doctrine: 03_KURATORKAS_ARCHITECTURE_v2.md
-- ============================================================

-- Payment logs (Duitku / Xendit / stub provider transactions)
CREATE TABLE IF NOT EXISTS payment_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    merchant_order_id TEXT UNIQUE NOT NULL,
    plan_id TEXT NOT NULL,             -- 'starter' | 'pro' | 'enterprise'
    amount INTEGER NOT NULL,           -- IDR
    provider TEXT NOT NULL,            -- 'duitku' | 'xendit' | 'stub'
    status TEXT DEFAULT 'pending',     -- 'pending' | 'paid' | 'failed' | 'refunded'
    payment_url TEXT,
    gateway_reference TEXT,            -- Duitku reference / Xendit invoice id
    raw_response TEXT,                 -- JSON dump of provider response
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON payment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs(status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_merchant_order_id ON payment_logs(merchant_order_id);
