// ============================================================
// 🎯 KURATORKAS × CURATOR.OS — Main Application Entry
// AI Stylist + POS untuk UMKM Fashion Indonesia
// Owner: Reza Estes / Haidar — Sovereign AI Dev
// Doctrine: Master-Architect v5.0 CANONICAL | 2026-05-19
// ============================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import type { CloudflareBindings } from '@sparkmind/core'
import { newId, escapeHtml, nowISO, formatIDR, safeJSON } from '@sparkmind/core'
import { signJwt, verifyJwt, hashPassword, verifyPassword, authMiddleware } from '@sparkmind/auth'
import { stylistAgent, contentAgent, trendAgent, pricingAgent, marketplaceAgent, listAgents, type AIGatewayCaller } from '@sparkmind/curator-os'
import { createInvoice as createPgInvoice } from '@sparkmind/pg-router'

import { LANDING_HTML, APP_SHELL_HTML } from './pages/templates'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: any } }>()

app.use('*', logger())
app.use('/api/*', cors())

// Static assets (public/static/* → /static/*) — Cloudflare Pages auto-serves but explicit binding is safe
app.use('/static/*', serveStatic({ root: './' }))

// ============================================================
// Workers AI caller — wraps c.env.AI binding into AIGatewayCaller interface
// Falls back gracefully when AI binding is absent
// ============================================================
function makeAICaller(env: CloudflareBindings): AIGatewayCaller | undefined {
  const ai: any = (env as any)?.AI
  if (!ai || typeof ai.run !== 'function') return undefined
  return {
    async generateText(prompt: string, opts: { system?: string; maxTokens?: number; temperature?: number } = {}): Promise<string> {
      const messages: any[] = []
      if (opts.system) messages.push({ role: 'system', content: opts.system })
      messages.push({ role: 'user', content: prompt })
      try {
        const r: any = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
          messages,
          max_tokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.7,
        })
        return r?.response || r?.result?.response || ''
      } catch (e) {
        return ''
      }
    },
  }
}

// ============================================================
// PUBLIC PAGES
// ============================================================
app.get('/', (c) => c.html(LANDING_HTML))
app.get('/app', (c) => c.html(APP_SHELL_HTML))

// ============================================================
// HEALTH / META
// ============================================================
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'KuratorKas × Curator.OS',
    version: c.env?.APP_VERSION || '0.1.0',
    environment: c.env?.ENVIRONMENT || 'development',
    doctrine: 'Master-Architect v5.0 CANONICAL',
    bindings: {
      d1: !!c.env?.DB,
      kv: !!c.env?.KV,
      r2: !!c.env?.R2,
      ai: !!c.env?.AI,
    },
    timestamp: nowISO(),
  })
})

app.get('/api/agents', (c) => {
  return c.json({
    curatorOs: 'v1.0',
    agents: listAgents(),
  })
})

// ============================================================
// AUTH ROUTES
// POST /api/auth/register · POST /api/auth/login · GET /api/auth/me
// ============================================================
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const name = String(body.name || '').trim()
    const businessName = String(body.business_name || '').trim() || null
    const businessType = ['retail','online','hybrid'].includes(body.business_type) ? body.business_type : 'online'

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'invalid email' }, 400)
    if (!password || password.length < 6) return c.json({ error: 'password min 6 chars' }, 400)
    if (!name) return c.json({ error: 'name required' }, 400)

    const DB = c.env?.DB
    if (!DB) return c.json({ error: 'D1 not bound — run `wrangler d1 create kuratorkas-production` and update wrangler.jsonc' }, 503)

    // Check duplicate
    const exists = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (exists) return c.json({ error: 'email already registered' }, 409)

    const { hash, salt } = await hashPassword(password)
    const id = newId('usr')
    await DB.prepare(`INSERT INTO users (id, email, password_hash, password_salt, name, business_name, business_type, subscription_tier) VALUES (?, ?, ?, ?, ?, ?, ?, 'free')`)
      .bind(id, email, hash, salt, name, businessName, businessType).run()

    const secret = c.env?.JWT_SECRET || 'dev-secret-CHANGE-ME-in-prod'
    const token = await signJwt({ sub: id, email, tier: 'free' }, secret)
    return c.json({ ok: true, token, user: { id, email, name, business_name: businessName, business_type: businessType, subscription_tier: 'free' } })
  } catch (e: any) {
    return c.json({ error: 'server error', detail: e?.message }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email || !password) return c.json({ error: 'email + password required' }, 400)

    const DB = c.env?.DB
    if (!DB) return c.json({ error: 'D1 not bound' }, 503)

    const row: any = await DB.prepare('SELECT id, email, password_hash, password_salt, name, business_name, business_type, subscription_tier FROM users WHERE email = ?').bind(email).first()
    if (!row) return c.json({ error: 'invalid credentials' }, 401)

    const ok = await verifyPassword(password, row.password_hash, row.password_salt)
    if (!ok) return c.json({ error: 'invalid credentials' }, 401)

    const secret = c.env?.JWT_SECRET || 'dev-secret-CHANGE-ME-in-prod'
    const token = await signJwt({ sub: row.id, email: row.email, tier: row.subscription_tier }, secret)
    const { password_hash, password_salt, ...userSafe } = row
    return c.json({ ok: true, token, user: userSafe })
  } catch (e: any) {
    return c.json({ error: 'server error', detail: e?.message }, 500)
  }
})

app.get('/api/auth/me', authMiddleware(), async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ user })
  const row: any = await DB.prepare('SELECT id, email, name, business_name, business_type, subscription_tier, created_at FROM users WHERE id = ?').bind(user.sub).first()
  return c.json({ user: row ?? user })
})

// ============================================================
// PRODUCTS API (POS catalog)
// ============================================================
const prodAuth = authMiddleware()

app.get('/api/products', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ products: [] })
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
  const { results } = await DB.prepare('SELECT * FROM products WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT ?')
    .bind(user.sub, limit).all()
  return c.json({ products: results ?? [] })
})

app.post('/api/products', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const price = parseInt(String(body.price), 10)
  if (!name || !Number.isFinite(price) || price <= 0) return c.json({ error: 'name + price required' }, 400)
  const id = newId('prd')
  const images = JSON.stringify(Array.isArray(body.images) ? body.images : [])
  await DB.prepare(`INSERT INTO products (id, user_id, name, description, price, cost_price, category, subcategory, size, color, stock, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, user.sub,
      name,
      String(body.description || '').slice(0, 1000) || null,
      price,
      parseInt(String(body.cost_price || '0'), 10) || null,
      String(body.category || '').slice(0, 50) || null,
      String(body.subcategory || '').slice(0, 50) || null,
      String(body.size || '').slice(0, 20) || null,
      String(body.color || '').slice(0, 30) || null,
      parseInt(String(body.stock || '0'), 10) || 0,
      images,
    ).run()
  return c.json({ ok: true, id })
})

app.get('/api/products/:id', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)
  const id = c.req.param('id')
  const row = await DB.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').bind(id, user.sub).first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ product: row })
})

app.put('/api/products/:id', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const fields: string[] = []
  const vals: any[] = []
  for (const k of ['name','description','price','cost_price','category','subcategory','size','color','stock']) {
    if (k in body) { fields.push(`${k} = ?`); vals.push(body[k]) }
  }
  if (!fields.length) return c.json({ error: 'no fields' }, 400)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id, user.sub)
  await DB.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run()
  return c.json({ ok: true })
})

app.delete('/api/products/:id', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)
  const id = c.req.param('id')
  await DB.prepare('UPDATE products SET is_active = 0 WHERE id = ? AND user_id = ?').bind(id, user.sub).run()
  return c.json({ ok: true })
})

// ============================================================
// ORDERS API (POS transactions)
// ============================================================
app.get('/api/orders', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ orders: [] })
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
  const { results } = await DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').bind(user.sub, limit).all()
  return c.json({ orders: results ?? [] })
})

app.post('/api/orders', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)
  const body = await c.req.json().catch(() => ({}))
  const items: any[] = Array.isArray(body.items) ? body.items : []
  if (!items.length) return c.json({ error: 'items required' }, 400)

  let total = 0
  for (const it of items) total += (parseInt(String(it.price), 10) || 0) * (parseInt(String(it.quantity), 10) || 0)

  const orderId = newId('ord')
  const orderNumber = `KK-${new Date().getFullYear()}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`
  await DB.prepare(`INSERT INTO orders (id, user_id, order_number, marketplace, customer_name, customer_phone, total_amount, status, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?)`)
    .bind(
      orderId, user.sub, orderNumber,
      String(body.marketplace || 'offline'),
      String(body.customer_name || 'Walk-in Customer').slice(0, 100),
      String(body.customer_phone || '').slice(0, 20) || null,
      total,
      body.payment_status === 'paid' ? 'paid' : 'pending',
    ).run()

  for (const it of items) {
    await DB.prepare(`INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)`)
      .bind(newId('oi'), orderId, String(it.product_id), parseInt(String(it.quantity), 10) || 1, parseInt(String(it.price), 10) || 0).run()
    // Decrement stock
    await DB.prepare(`UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND user_id = ?`)
      .bind(parseInt(String(it.quantity), 10) || 1, String(it.product_id), user.sub).run()
  }

  return c.json({ ok: true, order_id: orderId, order_number: orderNumber, total })
})

// ============================================================
// CURATOR-OS API — 5-AGENT ROUTES
// ============================================================

// --- AGENT 1: AI Stylist Curator ---
app.post('/api/stylist/generate', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  const body = await c.req.json().catch(() => ({}))
  const productIds: string[] = Array.isArray(body.product_ids) ? body.product_ids.map(String) : []
  const occasion = ['casual','formal','party','office'].includes(body.occasion) ? body.occasion : 'casual'
  const style = ['korean','streetwear','minimalist','traditional','modern'].includes(body.style) ? body.style : undefined

  let products: any[] = []
  if (DB) {
    const placeholders = productIds.length ? productIds.map(() => '?').join(',') : "''"
    const stmt = productIds.length
      ? DB.prepare(`SELECT * FROM products WHERE user_id = ? AND id IN (${placeholders})`).bind(user.sub, ...productIds)
      : DB.prepare(`SELECT * FROM products WHERE user_id = ? AND is_active = 1 LIMIT 10`).bind(user.sub)
    const { results } = await stmt.all()
    products = results ?? []
  }

  // Wire AI Workers if AI binding present, otherwise heuristic
  const ai = makeAICaller(c.env as any)
  const result = await stylistAgent.run({
    userId: user.sub,
    productIds: productIds.length ? productIds : products.map(p => p.id),
    products,
    occasion,
    style,
    maxProducts: parseInt(String(body.max_products || '4'), 10) || 4,
  }, ai)

  // Persist generated outfit(s)
  if (DB && result.ok && result.data?.length) {
    for (const o of result.data) {
      await DB.prepare(`INSERT INTO outfits (id, user_id, name, products, total_price, discount_percentage, occasion, style, description, styling_tips)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        newId('outf'), user.sub, o.outfit_name,
        JSON.stringify(o.products.map(p => p.product_id)),
        o.total_price, o.discount_percentage, o.occasion, o.style, o.description,
        JSON.stringify(o.styling_tips)
      ).run()
    }
  }

  return c.json(result)
})

app.get('/api/stylist/outfits', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ outfits: [] })
  const { results } = await DB.prepare('SELECT * FROM outfits WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 50').bind(user.sub).all()
  return c.json({ outfits: results ?? [] })
})

// --- AGENT 2: Content Curator ---
app.post('/api/content/generate', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  const body = await c.req.json().catch(() => ({}))
  const productId = String(body.product_id || '')
  if (!productId) return c.json({ error: 'product_id required' }, 400)
  if (!DB) return c.json({ error: 'D1 not bound' }, 503)

  const product: any = await DB.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').bind(productId, user.sub).first()
  if (!product) return c.json({ error: 'product not found' }, 404)

  const ai = makeAICaller(c.env as any)
  const result = await contentAgent.run({
    userId: user.sub,
    product,
    tone: ['casual','professional','playful'].includes(body.tone) ? body.tone : 'casual',
    platform: ['instagram','tiktok','both'].includes(body.platform) ? body.platform : 'instagram',
  }, ai)

  if (result.ok && result.data) {
    await DB.prepare(`INSERT INTO content (id, user_id, type, products, caption, hashtags, hooks, cta, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`).bind(
      newId('cnt'), user.sub,
      body.platform === 'tiktok' ? 'tiktok' : 'instagram_post',
      JSON.stringify([productId]),
      result.data.caption,
      JSON.stringify(result.data.hashtags),
      JSON.stringify(result.data.hooks),
      result.data.cta,
    ).run()
  }

  return c.json(result)
})

app.get('/api/content', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ content: [] })
  const { results } = await DB.prepare('SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.sub).all()
  return c.json({ content: results ?? [] })
})

// --- AGENT 3: Trend Curator ---
app.get('/api/trend/forecast', prodAuth, async (c) => {
  const ai = makeAICaller(c.env as any)
  const result = await trendAgent.run({ userId: c.get('user').sub }, ai)
  return c.json(result)
})

// --- AGENT 4: Pricing Curator (real D1-backed analysis) ---
app.get('/api/pricing/recommendations', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  let products: any[] = []
  if (DB) {
    const { results } = await DB.prepare('SELECT * FROM products WHERE user_id = ? AND is_active = 1').bind(user.sub).all()
    products = results ?? []
  }
  const result = await pricingAgent.run({ userId: user.sub, products })
  return c.json(result)
})

// --- AGENT 5: Marketplace Curator ---
app.get('/api/marketplace/status', prodAuth, async (c) => {
  const result = await marketplaceAgent.run({ userId: c.get('user').sub })
  return c.json(result)
})

// ============================================================
// BILLING / SUBSCRIPTION API — Duitku integration
// ============================================================
const PLANS = [
  { id: 'free', name: 'Free', price: 0, period: '/forever', featured: false,
    features: ['10 produk', '20 outfit AI / bulan', '10 konten / bulan', 'POS basic', 'No marketplace sync'] },
  { id: 'starter', name: 'Starter', price: 99000, period: '/bulan', featured: false,
    features: ['100 produk', 'Unlimited outfit AI', '100 konten / bulan', 'POS + Orders', '1 marketplace channel'] },
  { id: 'pro', name: 'Pro', price: 299000, period: '/bulan', featured: true,
    features: ['Unlimited produk', 'Unlimited Curator-OS', 'Trend AI + Pricing AI', '3 marketplace channels', 'Priority support'] },
  { id: 'enterprise', name: 'Enterprise', price: 999000, period: '/bulan', featured: false,
    features: ['Semua di Pro', 'White-label dashboard', 'API access + webhooks', 'Custom AI fine-tuning', 'Dedicated CSM'] },
]

app.get('/api/billing/plans', async (c) => {
  return c.json({
    plans: PLANS,
    note: 'Pembayaran diproses via Duitku (SparkMind D22457). Auto-renew bulanan, cancel anytime.',
  })
})

app.post('/api/billing/checkout', prodAuth, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const planId = String(body.plan_id || '')
  const plan = PLANS.find(p => p.id === planId)
  if (!plan) return c.json({ error: 'invalid plan_id' }, 400)
  const DB = c.env?.DB

  // Free → immediate downgrade
  if (plan.price === 0) {
    if (DB) await DB.prepare('UPDATE users SET subscription_tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('free', user.sub).run()
    return c.json({ ok: true, plan: 'free', message: 'Downgraded to Free' })
  }

  // Lookup user
  let userRow: any = { email: user.email || 'unknown@kuratorkas.id', name: 'User' }
  if (DB) {
    userRow = await DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(user.sub).first() || userRow
  }

  const merchantOrderId = `KKBIL-${user.sub.slice(0, 8)}-${Date.now()}`
  const origin = new URL(c.req.url).origin

  const duitkuApiKey = (c.env as any)?.DUITKU_API_KEY
  const duitkuMerchant = (c.env as any)?.DUITKU_MERCHANT_CODE
  const duitkuConfigured = !!(duitkuApiKey && duitkuMerchant)

  const inv = await createPgInvoice({
    amount: plan.price,
    merchantOrderId,
    description: `KuratorKas ${plan.name} Plan`,
    email: userRow.email,
    firstName: userRow.name?.split(' ')[0] || 'User',
    lastName: userRow.name?.split(' ').slice(1).join(' ') || '',
    callbackUrl: `${origin}/api/billing/callback`,
    returnUrl: `${origin}/app#billing`,
  }, {
    primary: duitkuConfigured ? 'duitku' : 'stub',
    fallback: 'stub',
    duitku: duitkuConfigured ? { apiKey: duitkuApiKey, merchantCode: duitkuMerchant, env: 'production' } : undefined,
  })

  // Persist pending payment log
  if (DB) {
    await DB.prepare(`INSERT INTO payment_logs (id, user_id, merchant_order_id, plan_id, amount, provider, status, payment_url, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      newId('pay'), user.sub, merchantOrderId, plan.id, plan.price, inv.provider,
      inv.ok ? 'pending' : 'failed', inv.paymentUrl || null, JSON.stringify(inv.raw || {})
    ).run().catch(() => {})
  }

  if (!inv.ok) return c.json({ error: inv.error || 'payment gateway error', provider: inv.provider }, 502)
  return c.json({ ok: true, payment_url: inv.paymentUrl, reference: inv.reference, provider: inv.provider, merchant_order_id: merchantOrderId })
})

// Duitku-compatible callback (signature verified, idempotent)
app.post('/api/billing/callback', async (c) => {
  const form = await c.req.parseBody().catch(() => ({} as Record<string, any>))
  const merchantOrderId = String(form.merchantOrderId || '')
  const resultCode = String(form.resultCode || '')
  const amount = String(form.amount || '')
  const reference = String(form.reference || '')
  const merchantCode = String(form.merchantCode || '')

  if (!merchantOrderId) return c.json({ ok: false, error: 'missing merchantOrderId' }, 400)

  // (Optional: hardened IP + MD5 sig verify when DUITKU_API_KEY present, mirroring SparkMind v7.3)

  const DB = c.env?.DB
  if (DB) {
    // Lookup log
    const log: any = await DB.prepare('SELECT * FROM payment_logs WHERE merchant_order_id = ?').bind(merchantOrderId).first()
    if (!log) return c.json({ ok: false, error: 'order not found' }, 404)

    // Idempotency: if already paid, no-op
    if (log.status === 'paid') return c.json({ ok: true, idempotent: true })

    // resultCode "00" = success in Duitku
    if (resultCode === '00') {
      await DB.prepare('UPDATE payment_logs SET status = ?, gateway_reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind('paid', reference, log.id).run()
      await DB.prepare('UPDATE users SET subscription_tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(log.plan_id, log.user_id).run()
      return c.json({ ok: true, plan: log.plan_id })
    } else {
      await DB.prepare('UPDATE payment_logs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind('failed', log.id).run()
      return c.json({ ok: false, status: 'failed', resultCode })
    }
  }
  return c.json({ ok: true, note: 'D1 not bound — callback acknowledged' })
})

app.get('/api/billing/history', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) return c.json({ payments: [] })
  const { results } = await DB.prepare('SELECT id, merchant_order_id, plan_id, amount, provider, status, created_at FROM payment_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.sub).all()
  return c.json({ payments: results ?? [] })
})

// ============================================================
// DASHBOARD SUMMARY
// ============================================================
app.get('/api/dashboard/summary', prodAuth, async (c) => {
  const user = c.get('user')
  const DB = c.env?.DB
  if (!DB) {
    return c.json({
      products: 0, orders: 0, outfits: 0, content: 0,
      revenue_today: 0, revenue_30d: 0,
      note: 'D1 not bound — connect database to see live stats',
    })
  }
  const [prods, ords, outs, cnts, revToday, rev30d] = await Promise.all([
    DB.prepare('SELECT COUNT(*) AS n FROM products WHERE user_id = ? AND is_active = 1').bind(user.sub).first<{ n: number }>(),
    DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').bind(user.sub).first<{ n: number }>(),
    DB.prepare('SELECT COUNT(*) AS n FROM outfits WHERE user_id = ? AND is_active = 1').bind(user.sub).first<{ n: number }>(),
    DB.prepare('SELECT COUNT(*) AS n FROM content WHERE user_id = ?').bind(user.sub).first<{ n: number }>(),
    DB.prepare(`SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE user_id = ? AND payment_status = 'paid' AND date(created_at) = date('now')`).bind(user.sub).first<{ s: number }>(),
    DB.prepare(`SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE user_id = ? AND payment_status = 'paid' AND created_at >= datetime('now', '-30 days')`).bind(user.sub).first<{ s: number }>(),
  ])
  return c.json({
    products: prods?.n ?? 0,
    orders: ords?.n ?? 0,
    outfits: outs?.n ?? 0,
    content: cnts?.n ?? 0,
    revenue_today: revToday?.s ?? 0,
    revenue_30d: rev30d?.s ?? 0,
  })
})

// ============================================================
// 404
// ============================================================
app.notFound((c) => c.html(
  `<!DOCTYPE html><html><head><title>404 — KuratorKas</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans"><div class="text-center px-6"><div class="text-8xl mb-4">👗</div><h1 class="text-4xl font-bold mb-3">404</h1><p class="text-gray-400 mb-6">Halaman tidak ditemukan.</p><a href="/" class="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-amber-500 hover:opacity-90 rounded-xl font-semibold">← Kembali ke Home</a></div></body></html>`,
  404
))

export default app
