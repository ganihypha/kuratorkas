// ============================================================
// @sparkmind/core — shared types, Result monad, utility helpers
// Foundation package for SparkMind Sovereign Ecosystem
// Doctrine: Master-Architect v5.0 CANONICAL
// ============================================================

// ----- Result<T, E> monad for explicit error handling -----
export type Ok<T> = { ok: true; value: T }
export type Err<E> = { ok: false; error: E }
export type Result<T, E = string> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

// ----- Common business types -----
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise'
export type BusinessType = 'retail' | 'online' | 'hybrid'
export type Marketplace = 'shopee' | 'tokopedia' | 'tiktok' | 'offline'
export type Occasion = 'casual' | 'formal' | 'party' | 'office'
export type StyleTag = 'korean' | 'streetwear' | 'minimalist' | 'traditional' | 'modern'

export interface User {
  id: string
  email: string
  name: string
  business_name?: string
  business_type?: BusinessType
  subscription_tier: SubscriptionTier
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  user_id: string
  name: string
  description?: string
  price: number  // in IDR (integer cents)
  cost_price?: number
  category?: string
  subcategory?: string
  size?: string
  color?: string
  stock: number
  images?: string  // JSON array of image URLs
  marketplace_ids?: string  // JSON: { shopee: "id", tokopedia: "id", tiktok: "id" }
  embedding_id?: string  // Vectorize ID
  is_active: number  // 0/1 (SQLite boolean)
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  user_id: string
  order_number: string
  marketplace?: Marketplace
  marketplace_order_id?: string
  customer_name?: string
  customer_phone?: string
  customer_address?: string
  total_amount: number
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  payment_status: 'pending' | 'paid' | 'refunded'
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  price: number
}

export interface Outfit {
  id: string
  user_id: string
  name?: string
  products: string  // JSON array of product IDs
  total_price?: number
  discount_percentage?: number
  occasion?: Occasion
  style?: StyleTag
  description?: string
  is_active: number
  created_at: string
}

// ----- Cloudflare environment (bindings) -----
export interface CloudflareBindings {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  AI?: any  // Workers AI binding
  // Vars
  ENVIRONMENT?: 'preview' | 'staging' | 'production' | 'development'
  APP_NAME?: string
  APP_VERSION?: string
  // Secrets
  JWT_SECRET?: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  SHOPEE_CLIENT_ID?: string
  SHOPEE_CLIENT_SECRET?: string
  TOKOPEDIA_CLIENT_ID?: string
  TOKOPEDIA_CLIENT_SECRET?: string
  TIKTOK_SHOP_CLIENT_ID?: string
  TIKTOK_SHOP_CLIENT_SECRET?: string
  DUITKU_API_KEY?: string
  DUITKU_MERCHANT_CODE?: string
}

// ----- ID generation (URL-safe, time-sortable) -----
export function newId(prefix: string = ''): string {
  const ts = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 8)
  return prefix ? `${prefix}_${ts}${rnd}` : `${ts}${rnd}`
}

// ----- Money formatting (IDR) -----
export function formatIDR(amountCents: number): string {
  return 'Rp ' + Number(amountCents).toLocaleString('id-ID')
}

// ----- XSS-safe HTML escape -----
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string))
}

// ----- Sleep helper -----
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ----- ISO timestamp -----
export const nowISO = () => new Date().toISOString()

// ----- Safe JSON parse -----
export function safeJSON<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}
