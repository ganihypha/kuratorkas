import { Hono } from 'hono'
import { cors } from 'hono/cors'

// ============================================
// CLOUDFLARE BINDINGS (env vars)
// ============================================
type Bindings = {
  DUITKU_API_KEY?: string
  DUITKU_MERCHANT_CODE?: string
  DUITKU_ENV?: string  // 'sandbox' | 'production'
  PUBLIC_BASE_URL?: string
}

const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', cors())

// ============================================
// CANONICAL PUBLIC URL (FIX: stable callback/return for Duitku)
// Hardcoded fallback ensures Duitku callbacks ALWAYS hit the main domain,
// not ephemeral preview hashes. Override via wrangler pages secret put PUBLIC_BASE_URL.
// ============================================
const CANONICAL_BASE_URL = 'https://sparkmind-v2.pages.dev'

// ============================================
// DUITKU PRODUCTION CALLBACK IPs (V7.3 HARDENING)
// Source of truth: Email Rieza Camelia (Duitku Customer Care, 2026-04)
// Docs: https://docs.duitku.com/api/id/#callback
// 9 production IPs — server MUST whitelist these for /api/payment/callback
// Sandbox IPs (4) intentionally NOT included — production-only mode.
// ============================================
const DUITKU_PROD_CALLBACK_IPS = new Set<string>([
  '182.23.85.8',   '182.23.85.9',   '182.23.85.10',
  '182.23.85.13',  '182.23.85.14',     // 14 = Primary
  '103.177.101.184','103.177.101.185','103.177.101.186',
  '103.177.101.189','103.177.101.190',  // 190 = Primary
])

// IP guard helper — uses CF-Connecting-IP (Cloudflare-injected, can't be spoofed).
// NEVER trust X-Forwarded-For for security decisions on Cloudflare.
function isDuitkuCallbackIP(c: any): { ok: boolean; ip: string } {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('cf-connecting-ip') || ''
  return { ok: DUITKU_PROD_CALLBACK_IPS.has(ip), ip }
}

// In-memory idempotency cache (best-effort within a single Worker isolate).
// For durable idempotency across isolates use KV/D1 — see Step 4.4 in HANDOFF v2.
// This cache is sufficient to prevent double-processing within burst windows
// (Duitku retries on timeout); persistent layer is roadmap (v7.4).
const _SEEN_ORDERS = new Map<string, { ts: number; result: any }>()
function _cacheOrder(id: string, result: any) {
  _SEEN_ORDERS.set(id, { ts: Date.now(), result })
  // soft TTL prune (keep <1000 entries)
  if (_SEEN_ORDERS.size > 1000) {
    const cutoff = Date.now() - 60 * 60 * 1000 // 1h
    for (const [k, v] of _SEEN_ORDERS) if (v.ts < cutoff) _SEEN_ORDERS.delete(k)
  }
}

// ============================================
// DUITKU CONFIG (V7.3 PRODUCTION HARDENED — Callback Lockdown)
// Migration: sandbox → production (Merchant Code DS30026 → D22457)
// V7.3: All HTML constants reconciled with Worker (no stale templates), all
// payment endpoints production-by-default, baseUrl canonical-locked.
// Override via: wrangler pages secret put DUITKU_API_KEY / DUITKU_MERCHANT_CODE / DUITKU_ENV
// Docs: https://docs.duitku.com/pop/en/  &  https://docs.duitku.com/api/en/
// ============================================
const DUITKU_DEFAULT = {
  // PRODUCTION credentials (Merchant: D22457)
  apiKey: '82ba4f6755c2b05f0ca4ff397488af96',
  merchantCode: 'D22457',
  env: 'production' as const,
}

function getDuitkuConfig(c: any) {
  const env = c.env || {}
  const baseUrl = env.PUBLIC_BASE_URL || CANONICAL_BASE_URL || new URL(c.req.url).origin
  return {
    apiKey: env.DUITKU_API_KEY || DUITKU_DEFAULT.apiKey,
    merchantCode: env.DUITKU_MERCHANT_CODE || DUITKU_DEFAULT.merchantCode,
    isProd: (env.DUITKU_ENV || DUITKU_DEFAULT.env) === 'production',
    baseUrl,
  }
}

// Cache-control middleware for HTML routes — bust CDN cache so users always
// see latest deployment on main domain (FIX for stale main domain).
function noCacheHTML(c: any) {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
}

// HTML escape utility (XSS-safe)
function escClarity(s: string): string {
  return String(s || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch] as string))
}

// SHA256 using Web Crypto API (Cloudflare Workers compatible)
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// MD5 for callback signature verification (Duitku callback uses MD5)
// Lightweight pure-JS MD5 implementation
function md5(s: string): string {
  function rh(n: number) { let j, s = ''; for (j = 0; j <= 3; j++) s += ((n >> (j * 8 + 4)) & 0x0F).toString(16) + ((n >> (j * 8)) & 0x0F).toString(16); return s }
  function ad(x: number, y: number) { const l = (x & 0xFFFF) + (y & 0xFFFF); const m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xFFFF) }
  function rl(n: number, c: number) { return (n << c) | (n >>> (32 - c)) }
  function cm(q: number, a: number, b: number, x: number, s: number, t: number) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b) }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & c) | ((~b) & d), a, b, x, s, t) }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & d) | (c & (~d)), a, b, x, s, t) }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(b ^ c ^ d, a, b, x, s, t) }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(c ^ (b | (~d)), a, b, x, s, t) }
  function cv(s: string) { let n = ((s.length + 8) >> 6) + 1; const m = new Array(n * 16); let i; for (i = 0; i < n * 16; i++) m[i] = 0; for (i = 0; i < s.length; i++) m[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8); m[i >> 2] |= 0x80 << ((i % 4) * 8); m[n * 16 - 2] = s.length * 8; return m }
  // UTF-8 encode
  s = unescape(encodeURIComponent(s))
  const x = cv(s); let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d
    a = ff(a, b, c, d, x[i + 0], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330)
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983)
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162)
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329)
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i + 0], 20, -373897302)
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848)
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501)
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734)
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556)
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640)
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i + 0], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189)
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651)
    a = ii(a, b, c, d, x[i + 0], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055)
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799)
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649)
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551)
    a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od)
  }
  return rh(a) + rh(b) + rh(c) + rh(d)
}

// Pricing plan catalog (server-side source of truth — prevent price tampering)
const PRICING_PLANS: Record<string, { id: string; name: string; amount: number; description: string; category: 'core' | 'painkiller' }> = {
  // Core SparkMind plans
  'pro-monthly':   { id: 'pro-monthly',   name: 'SparkMind Pro (Monthly)',          amount: 49000,   description: 'SparkMind Pro - 1 bulan langganan',                           category: 'core' },
  'pro-yearly':    { id: 'pro-yearly',    name: 'SparkMind Pro (Yearly)',           amount: 470000,  description: 'SparkMind Pro - 1 tahun langganan (hemat 20%)',              category: 'core' },
  'team-monthly':  { id: 'team-monthly',  name: 'SparkMind Team (5 user / bulan)',  amount: 745000,  description: 'SparkMind Team - 5 user x 1 bulan',                           category: 'core' },
  'lifetime':      { id: 'lifetime',      name: 'SparkMind Lifetime Deal',          amount: 1490000, description: 'SparkMind Pro - akses seumur hidup',                          category: 'core' },
  // Painkiller — AI Clarity & Recovery Coach (V7.0)
  'clarity-monthly':        { id: 'clarity-monthly',        name: 'AI Clarity Coach (Monthly)',      amount: 59000,  description: 'AI Clarity & Recovery Coach - akses bulanan (Situation Decoder + Draft Review + Boundary Checker)', category: 'painkiller' },
  'clarity-yearly':         { id: 'clarity-yearly',         name: 'AI Clarity Coach (Yearly)',       amount: 399000, description: 'AI Clarity & Recovery Coach - 1 tahun (hemat 44%)',           category: 'painkiller' },
  'pack-after-block':       { id: 'pack-after-block',       name: '"After Block" Recovery Pack',     amount: 39000,  description: 'Pack lifetime - Recovery Plan 30 hari setelah diblokir/ghosting', category: 'painkiller' },
  'pack-stop-overthinking': { id: 'pack-stop-overthinking', name: '"Stop Overthinking" 21-Day Pack', amount: 29000,  description: 'Pack lifetime - 21 hari plan keluar dari overthinking',        category: 'painkiller' },
  'pack-mature-comm':       { id: 'pack-mature-comm',       name: '"Mature Communication" Pack',     amount: 49000,  description: 'Pack lifetime - template & analyzer komunikasi dewasa',         category: 'painkiller' },
  'pack-healthy-closure':   { id: 'pack-healthy-closure',   name: '"Healthy Closure" Pack',          amount: 39000,  description: 'Pack lifetime - protokol closure sehat tanpa drama',            category: 'painkiller' },
}

// ============================================
// ROUTES
// ============================================
app.get('/', (c) => { noCacheHTML(c); return c.html(LANDING_HTML) })
app.get('/app', (c) => { noCacheHTML(c); return c.html(APP_HTML) })
app.get('/pricing', (c) => { noCacheHTML(c); return c.html(PRICING_HTML) })
app.get('/clarity', (c) => { noCacheHTML(c); return c.html(CLARITY_HTML) })
// Duitku Onboarding Doc #10 — Alur/flow pembayaran pada website yang didaftarkan
app.get('/flow', (c) => { noCacheHTML(c); return c.html(PAYMENT_FLOW_HTML) })
app.get('/payment-flow', (c) => { noCacheHTML(c); return c.html(PAYMENT_FLOW_HTML) })
// Email draft balasan ke Tim Onboarding Duitku (copy-paste ready) + 10-dok checklist
app.get('/email-duitku', (c) => { noCacheHTML(c); return c.html(EMAIL_DUITKU_HTML) })
app.get('/duitku-email', (c) => { noCacheHTML(c); return c.html(EMAIL_DUITKU_HTML) })
app.get('/legal', (c) => { noCacheHTML(c); return c.html(LEGAL_HTML) })
app.get('/terms', (c) => c.redirect('/legal#tos'))
app.get('/privacy', (c) => c.redirect('/legal#privacy'))
app.get('/refund', (c) => c.redirect('/legal#refund'))
app.get('/manifest.webmanifest', (c) => {
  c.header('Content-Type', 'application/manifest+json')
  return c.body(JSON.stringify({
    name: 'SparkMind — AI Strategic Guide',
    short_name: 'SparkMind',
    description: 'AI Strategic Guide untuk hidup berdaulat. 18+ kategori AI + tools produktivitas.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#0a0a1a',
    theme_color: '#4f46e5',
    orientation: 'portrait',
    icons: [
      { src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#4f46e5"/><text x="50" y="68" font-size="60" text-anchor="middle" fill="white" font-family="system-ui" font-weight="bold">S</text></svg>'), sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#4f46e5"/><text x="50" y="68" font-size="60" text-anchor="middle" fill="white" font-family="system-ui" font-weight="bold">S</text></svg>'), sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  }))
})
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8')
  c.header('Cache-Control', 'no-cache')
  return c.body(SERVICE_WORKER_JS)
})

// ============================================
// API ROUTES
// ============================================
app.post('/api/analyze', async (c) => {
  try {
    const { message, mode, history } = await c.req.json()
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return c.json({ error: 'Message required' }, 400)
    }
    const response = generateStrategicResponse(message.slice(0, 2000), mode || 'strategic', Array.isArray(history) ? history.slice(-6) : [])
    return c.json({ response, timestamp: new Date().toISOString(), mode, tokens: Math.floor(Math.random() * 200) + 100 })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message || 'unknown' }, 500)
  }
})

app.post('/api/swot', async (c) => {
  try {
    const { business } = await c.req.json()
    if (!business || typeof business !== 'string' || business.trim().length === 0) {
      return c.json({ error: 'Business required' }, 400)
    }
    return c.json({ response: generateSWOT(business.slice(0, 200)), timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error' }, 500)
  }
})

app.post('/api/coach', async (c) => {
  try {
    const { goal, currentState, obstacles } = await c.req.json()
    if (!goal || typeof goal !== 'string') return c.json({ error: 'Goal required' }, 400)
    return c.json({ response: generateCoachResponse(goal.slice(0, 300), (currentState || '').slice(0, 300), (obstacles || '').slice(0, 300)), timestamp: new Date().toISOString() })
  } catch {
    return c.json({ error: 'Server error' }, 500)
  }
})

app.get('/api/resources', (c) => c.json({ resources: RESOURCES_DATA }))
app.get('/api/insights', (c) => c.json({ insights: INSIGHTS_DATA }))
app.get('/api/quotes', (c) => {
  const q = QUOTES_DATA[Math.floor(Math.random() * QUOTES_DATA.length)]
  return c.json(q)
})
app.get('/api/health', (c) => {
  const cfg = getDuitkuConfig(c)
  return c.json({
    status: 'ok',
    service: 'SparkMind V7.3 PRODUCTION HARDENED (Callback Lockdown — IP+Sig+Idempotent)',
    version: '7.3.0',
    engine: 'Sovereign AI Engine V7.3 + Clarity & Recovery Coach + Duitku Callback Hardened',
    categories: 19,
    payment: {
      provider: 'Duitku',
      mode: cfg.isProd ? 'production' : 'sandbox',
      merchantCode: cfg.merchantCode,
      baseUrl: cfg.baseUrl,
      callbackUrl: `${cfg.baseUrl}/api/payment/callback`,
      returnUrl: `${cfg.baseUrl}/payment/return`,
      plans: Object.keys(PRICING_PLANS).length,
      callbackHardening: {
        ipWhitelist: true,
        ipCount: DUITKU_PROD_CALLBACK_IPS.size,
        signatureVerify: 'md5',
        idempotent: true,
      },
    },
    modules: {
      core: ['ai-coach','swot','pomodoro','journal','goals','habits','vision','review','resources'],
      painkiller: ['situation-decoder','draft-tone-review','boundary-checker','recovery-plan','relationship-swot','decision-mode'],
    },
    features: [
      'duitku-payment-gateway','duitku-pop-js','sha256-signature','md5-callback-verify',
      'callback-ip-whitelist-9-prod','callback-idempotent','callback-fail-closed',
      'server-side-pricing-catalog','payment-plans','payment-success-page','payment-failed-page',
      'canonical-base-url','no-cache-html','auto-resolve-callback-url',
      'clarity-recovery-coach','pain-killer-mode',
      'situation-decoder','draft-tone-review','boundary-checker','recovery-plan-30d',
      'relationship-swot','decision-mode','crisis-detector','probability-language',
      'pwa-installable','service-worker-offline','xss-safe-render','error-boundary',
      'pomodoro-resume-on-tab','storage-quota-guard','onboarding-tour-v6',
      'quick-add-modal','pricing-page','seo-og-tags','copy-share-ai-response',
      'habit-heatmap-30d','density-toggle','reduced-motion-respect',
      'chat-memory-persist','mobile-sidebar-fix','backup-restore-json',
      'weekly-trend-chart','smart-delete-modal','debounced-search','keyboard-shortcuts',
      'spiritual-faith','side-hustle','19-categories'
    ]
  })
})

// ============================================
// AI CLARITY & RECOVERY COACH — PAINKILLER MODULE (V7.0)
// Etis: probability-language, NO manipulation, boundary-first, crisis-aware
// ============================================
const CRISIS_KEYWORDS = /\b(bunuh diri|self harm|menyakiti diri|self-?harm|suicide|nggak mau hidup|gak mau hidup|tidak ingin hidup|akhiri hidup|akhiri saja|menyerah hidup|ingin mati|pengen mati)\b/i
function crisisCheck(text: string): { crisis: boolean; message?: string } {
  if (CRISIS_KEYWORDS.test(text)) {
    return {
      crisis: true,
      message: 'Saya membaca ada tanda kamu sedang sangat berat. Yang kamu rasakan valid. Tolong hubungi layanan profesional sekarang: <b>Into the Light Indonesia 119 ext 8</b> (24/7 gratis) atau <b>Yayasan Pulih</b>. Kamu tidak sendirian. ❤️',
    }
  }
  return { crisis: false }
}

const BLOCKED_KEYWORDS = /\b(diblokir|di-?block|diblock|block aku|mute aku|di-?mute|nggak balas|gak balas|no contact|silent treatment|hilang|ghost(ing)?)\b/i
function detectBoundary(text: string): boolean {
  return BLOCKED_KEYWORDS.test(text)
}

// FITUR 1: Situation Decoder
app.post('/api/clarity/decode', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const story = String(body.story || body.input || '').slice(0, 2000).trim()
    if (!story) return c.json({ error: 'story required' }, 400)
    const crisis = crisisCheck(story)
    const blocked = detectBoundary(story)
    const html = renderSituationDecode(story, blocked, crisis)
    return c.json({ ok: true, blocked, crisis: crisis.crisis, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// FITUR 2: Chat & WA Draft Review (Tone Analyzer)
app.post('/api/clarity/draft-review', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const draft = String(body.draft || body.input || '').slice(0, 2000).trim()
    if (!draft) return c.json({ error: 'draft required' }, 400)
    const scores = analyzeTone(draft)
    const verdict = decideVerdict(scores)
    const html = renderDraftReview(draft, scores, verdict)
    return c.json({ ok: true, scores, verdict, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// FITUR 3: Boundary Checker
app.post('/api/clarity/boundary', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const story = String(body.story || body.input || '').slice(0, 2000).trim()
    if (!story) return c.json({ error: 'story required' }, 400)
    const blocked = detectBoundary(story)
    const crisis = crisisCheck(story)
    const html = renderBoundaryChecker(story, blocked, crisis)
    return c.json({ ok: true, blocked, crisis: crisis.crisis, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// FITUR 4: Recovery Plan (7/21/30 day)
app.post('/api/clarity/recovery-plan', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const days = Math.min(30, Math.max(7, parseInt(String(body.days || '30'), 10) || 30))
    const context = String(body.context || body.input || '').slice(0, 500).trim()
    const html = renderRecoveryPlan(days, context)
    return c.json({ ok: true, days, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// FITUR 5: Decision Mode
app.post('/api/clarity/decision', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const story = String(body.story || body.input || '').slice(0, 2000).trim()
    if (!story) return c.json({ error: 'story required' }, 400)
    const html = renderDecisionMode(story)
    return c.json({ ok: true, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// FITUR 6: Relationship SWOT
app.post('/api/clarity/relationship-swot', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const context = String(body.context || body.input || '').slice(0, 500).trim()
    if (!context) return c.json({ error: 'context required' }, 400)
    const html = renderRelationshipSWOT(context)
    return c.json({ ok: true, html, timestamp: new Date().toISOString() })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message }, 500)
  }
})

// ============================================
// CLARITY TOOLS CATALOG (V7.3) — 6 painkiller tools
// Each tool MUST include `disclaimer` (ethical pain-killer mode invariant)
// ============================================
const CLARITY_TOOLS = [
  {
    id: 'situation-decoder',
    name: 'Situation Decoder',
    endpoint: '/api/clarity/decode',
    description: 'Decode situasi rumit (ghosting / silent treatment / mixed signal) jadi probability framing yang bisa kamu pegang.',
    disclaimer: 'Ini bukan diagnosis psikologi. Output berupa kemungkinan, bukan kepastian. Untuk krisis hubungi 119 ext 8 (Into the Light Indonesia).',
  },
  {
    id: 'draft-tone-review',
    name: 'Draft & Tone Review',
    endpoint: '/api/clarity/draft-review',
    description: 'Cek tone draft chat / WA sebelum dikirim — flag potensi escalation, manipulasi, atau over-apologizing.',
    disclaimer: 'Tool ini menganalisa tone bahasa, bukan menggantikan empati & komunikasi langsung. Hormati batas pihak lain.',
  },
  {
    id: 'boundary-checker',
    name: 'Boundary Checker',
    endpoint: '/api/clarity/boundary',
    description: 'Validasi apakah situasi yang kamu hadapi adalah boundary sehat dari pihak lain — bukan ajakan untuk bypass.',
    disclaimer: 'Kalau kamu diblokir / di-mute, itu boundary yang HARUS dihormati. Tool ini tidak akan kasih cara untuk bypass blokir.',
  },
  {
    id: 'recovery-plan',
    name: 'Recovery Plan (7 / 21 / 30 hari)',
    endpoint: '/api/clarity/recovery-plan',
    description: 'Rencana recovery harian setelah breakup / ghosting / closure paksa. Fokus ke diri sendiri, bukan stalking.',
    disclaimer: 'Ini self-care framework, bukan terapi profesional. Kalau gejala depresi / cemas berat menetap >2 minggu, temui psikolog.',
  },
  {
    id: 'decision-mode',
    name: 'Decision Mode',
    endpoint: '/api/clarity/decision',
    description: 'Frame keputusan sulit dengan probability + cost-benefit, hindari decision dari panic / sunk-cost.',
    disclaimer: 'Output berupa kerangka berpikir, bukan instruksi. Keputusan akhir tetap tanggung jawab kamu.',
  },
  {
    id: 'relationship-swot',
    name: 'Relationship SWOT',
    endpoint: '/api/clarity/relationship-swot',
    description: 'SWOT analysis untuk hubungan (romantic / family / kerja) — strengths, weaknesses, opportunities, threats.',
    disclaimer: 'Tool reflektif, bukan alasan untuk menghakimi pihak lain. Gunakan untuk insight pribadi, bukan amunisi konflik.',
  },
] as const

app.get('/api/clarity/tools', (c) => {
  return c.json({
    ok: true,
    version: '7.3.0',
    count: CLARITY_TOOLS.length,
    tools: CLARITY_TOOLS,
  })
})

// ============================================
// DUITKU PAYMENT GATEWAY ENDPOINTS
// Docs: https://docs.duitku.com/pop/en/
// ============================================

// Public: list available plans (so frontend can render dynamically)
app.get('/api/payment/plans', (c) => {
  return c.json({ plans: Object.values(PRICING_PLANS) })
})

// Create Invoice — backend integration
// POST /api/payment/create-invoice
// Body: { planId, email, firstName?, lastName?, phoneNumber? }
app.post('/api/payment/create-invoice', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const planId = String(body.planId || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const firstName = String(body.firstName || 'SparkMind').slice(0, 50).trim()
    const lastName = String(body.lastName || 'User').slice(0, 50).trim()
    const phoneNumber = String(body.phoneNumber || '08123456789').replace(/[^\d+]/g, '').slice(0, 20)

    // Validate plan
    const plan = PRICING_PLANS[planId]
    if (!plan) return c.json({ error: 'Invalid plan ID', validPlans: Object.keys(PRICING_PLANS) }, 400)

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Valid email required' }, 400)

    const cfg = getDuitkuConfig(c)
    const timestamp = Date.now().toString()
    const signature = await sha256Hex(cfg.merchantCode + timestamp + cfg.apiKey)

    // Unique order ID
    const merchantOrderId = `SM${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    // Duitku POP — Create Invoice endpoint
    // Source: https://docs.duitku.com/pop/en/#create-invoice
    const apiUrl = cfg.isProd
      ? 'https://api-prod.duitku.com/api/merchant/createInvoice'
      : 'https://api-sandbox.duitku.com/api/merchant/createInvoice'

    const payload = {
      paymentAmount: plan.amount,
      merchantOrderId,
      productDetails: plan.description,
      additionalParam: planId,
      merchantUserInfo: email,
      customerVaName: (firstName + ' ' + lastName).slice(0, 20),
      email,
      phoneNumber,
      itemDetails: [{ name: plan.name, price: plan.amount, quantity: 1 }],
      customerDetail: {
        firstName, lastName, email, phoneNumber,
        billingAddress: { firstName, lastName, address: 'Jakarta', city: 'Jakarta', postalCode: '10000', phone: phoneNumber, countryCode: 'ID' },
        shippingAddress: { firstName, lastName, address: 'Jakarta', city: 'Jakarta', postalCode: '10000', phone: phoneNumber, countryCode: 'ID' },
      },
      callbackUrl: `${cfg.baseUrl}/api/payment/callback`,
      returnUrl: `${cfg.baseUrl}/payment/return`,
      expiryPeriod: 60,
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-duitku-signature': signature,
        'x-duitku-timestamp': timestamp,
        'x-duitku-merchantcode': cfg.merchantCode,
      },
      body: JSON.stringify(payload),
    })

    const text = await resp.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!resp.ok || data.statusCode !== '00') {
      return c.json({
        error: 'Duitku createInvoice failed',
        httpStatus: resp.status,
        duitku: data,
        merchantOrderId,
      }, 502)
    }

    return c.json({
      success: true,
      merchantOrderId,
      reference: data.reference,
      paymentUrl: data.paymentUrl,
      amount: plan.amount,
      planId,
      planName: plan.name,
      mode: cfg.isProd ? 'production' : 'sandbox',
    })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message || 'unknown' }, 500)
  }
})

// Callback — Duitku notifies merchant about payment status
// POST /api/payment/callback (x-www-form-urlencoded)
// V7.3 HARDENED: 3-layer defense — (1) IP whitelist (9 prod IPs from Duitku),
// (2) MD5 signature verify, (3) idempotency. Fail-closed on every layer.
app.post('/api/payment/callback', async (c) => {
  try {
    const cfg = getDuitkuConfig(c)

    // LAYER 1 — IP Whitelist (only enforce in production mode)
    if (cfg.isProd) {
      const { ok: ipOk, ip } = isDuitkuCallbackIP(c)
      if (!ipOk) {
        console.warn(`[Duitku Callback] Reject non-whitelisted IP: ${ip || '(none)'}`)
        return c.json({ ok: false, error: 'IP_NOT_WHITELISTED' }, 403)
      }
    }

    // Parse form data
    const form = await c.req.parseBody()
    const merchantCode = String(form.merchantCode || '')
    const amount = String(form.amount || '')
    const merchantOrderId = String(form.merchantOrderId || '')
    const signature = String(form.signature || '')
    const resultCode = String(form.resultCode || '')
    const reference = String(form.reference || '')

    if (!merchantCode || !amount || !merchantOrderId || !signature) {
      return c.json({ ok: false, error: 'BAD_PARAMETER' }, 400)
    }

    // Sanity guard — merchant code must match our configured merchant
    if (merchantCode !== cfg.merchantCode) {
      console.warn(`[Duitku Callback] Merchant mismatch: got=${merchantCode} want=${cfg.merchantCode}`)
      return c.json({ ok: false, error: 'MERCHANT_MISMATCH' }, 403)
    }

    // LAYER 2 — Signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
    const expected = md5(merchantCode + amount + merchantOrderId + cfg.apiKey)
    if (signature.toLowerCase() !== expected.toLowerCase()) {
      console.warn(`[Duitku Callback] Bad signature for order ${merchantOrderId}`)
      return c.json({ ok: false, error: 'BAD_SIGNATURE' }, 403)
    }

    // LAYER 3 — Idempotency: same merchantOrderId returns prior result, no re-processing
    const seen = _SEEN_ORDERS.get(merchantOrderId)
    if (seen) {
      console.log(`[Duitku Callback] Idempotent replay order=${merchantOrderId}`)
      return c.json({ ok: true, idempotent: true, ...seen.result })
    }

    // Signature valid + first time → log + (in production: update DB)
    console.log('[Duitku Callback] OK', { merchantOrderId, amount, resultCode, reference })

    // resultCode: 00 = Success, 02 = Failed
    // In a real app, update DB / activate Pro user here.
    const result = { merchantOrderId, amount, resultCode, reference, ts: Date.now() }
    _cacheOrder(merchantOrderId, result)

    return c.json({ ok: true, ...result })
  } catch (e: any) {
    return c.json({ ok: false, error: 'SERVER_ERROR', detail: e?.message || 'unknown' }, 500)
  }
})

// Check transaction status (server-side polling helper)
// GET /api/payment/status/:merchantOrderId
app.get('/api/payment/status/:merchantOrderId', async (c) => {
  try {
    const merchantOrderId = c.req.param('merchantOrderId')
    if (!merchantOrderId) return c.json({ error: 'merchantOrderId required' }, 400)

    const cfg = getDuitkuConfig(c)
    const signature = md5(cfg.merchantCode + merchantOrderId + cfg.apiKey)

    // FIX V7.1: Transaction-status endpoint lives on passport.duitku.com (production)
    // and sandbox.duitku.com (sandbox), NOT on api-prod/api-sandbox subdomains.
    // Source: https://docs.duitku.com/api/en/#check-transaction
    const apiUrl = cfg.isProd
      ? 'https://passport.duitku.com/webapi/api/merchant/transactionStatus'
      : 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus'

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantCode: cfg.merchantCode, merchantOrderId, signature }),
    })

    const text = await resp.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    return c.json({ merchantOrderId, duitku: data, mode: cfg.isProd ? 'production' : 'sandbox' })
  } catch (e: any) {
    return c.json({ error: 'Server error', detail: e?.message || 'unknown' }, 500)
  }
})

// Return URL — user redirected here after payment
app.get('/payment/return', (c) => { noCacheHTML(c); return c.html(PAYMENT_RETURN_HTML) })

// 404 fallback
app.notFound((c) => c.html(`<!DOCTYPE html><html><head><title>404 — SparkMind</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans"><div class="text-center px-6"><div class="text-8xl mb-4">🧠</div><h1 class="text-4xl font-bold mb-3">404</h1><p class="text-gray-400 mb-6">Halaman tidak ditemukan.</p><a href="/" class="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold">← Kembali</a></div></body></html>`, 404))

// ============================================
// AI STRATEGIC ENGINE V6 — 18+ CATEGORIES
// ============================================
function generateStrategicResponse(message: string, mode: string, history: any[]): string {
  const m = message.toLowerCase()
  const ctx = history.length > 0 ? `<div class="mb-3"><span class="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded border border-white/5">💭 Context: ${history.length} pesan sebelumnya</span></div>` : ''

  const wrap = (title: string, badge: string, badgeColor: string, content: string) => `
    <div class="space-y-4">${ctx}
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-2.5 py-1 bg-${badgeColor}-500/10 text-${badgeColor}-400 text-[10px] rounded-full border border-${badgeColor}-500/20 font-bold uppercase tracking-wider">${badge}</span>
        <span class="text-[10px] text-gray-500">${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      <p class="font-bold text-white text-base leading-snug">${title}</p>
      ${content}
    </div>`

  const insight = (color: string, label: string, body: string) =>
    `<div class="bg-${color}-500/5 border-l-2 border-${color}-500 rounded-r p-3"><p class="text-[10px] text-${color}-400 font-bold uppercase tracking-wider mb-1">${label}</p><p class="text-sm text-gray-200 leading-relaxed">${body}</p></div>`

  const list = (items: string[]) =>
    `<div class="space-y-2">${items.map(i => `<div class="flex items-start gap-2.5"><span class="text-indigo-400 text-sm leading-none mt-0.5">▸</span><p class="text-sm text-gray-300 leading-relaxed flex-1">${i}</p></div>`).join('')}</div>`

  // Spiritual & Faith
  if (m.match(/spiritual|iman|agama|tuhan|allah|doa|ibadah|sholat|sabar|syukur|tawakal|ikhlas|hijrah|takwa|akhirat|dosa|tobat|berkah|rezeki halal|barokah/)) {
    return wrap('Spiritual & Faith Strategy 🕊️','Spiritual','emerald',`
      ${insight('emerald','FONDASI','Tanpa kompas spiritual, sukses dunia jadi kosong. Iman bukan beban — iman adalah <b>recharge</b> harian.')}
      ${list([
        '<b>Morning routine spiritual:</b> 5 menit muhasabah/refleksi sebelum hp dibuka',
        '<b>Tadabbur weekly:</b> 1x/minggu baca 1 ayat + tadabbur dalam',
        '<b>Sedekah otomatis:</b> 2.5% income → auto-transfer setiap gajian',
        '<b>Niat ulang:</b> setiap mulai kerja, ucap "Bismillah, untuk berkah"',
        '<b>Tahajud streak:</b> mulai 1x/minggu lalu naikkan bertahap',
      ])}
      ${insight('cyan','PROTOKOL HARIAN','Sholat 5 waktu on-time + dzikir 5 menit pagi & sore + 1 amal kebaikan/hari.')}
      ${insight('amber','MINDSET','Rezeki sudah ditulis. Tugas kita adalah <b>menjemput dengan ikhtiar terbaik dan akhlak terbaik</b>.')}`)
  }

  // Side Hustle
  if (m.match(/side hustle|sampingan|freelance|kerja sampingan|extra income|cuan tambahan|jualan online|bisnis sampingan|hustle/)) {
    return wrap('Side Hustle Blueprint 💼','Side Hustle','rose',`
      ${insight('rose','REALITAS','Side hustle = aset kebebasan. Mulai kecil, scale ketika valid. Jangan resign sebelum side income > expenses 3 bulan.')}
      ${list([
        '<b>Pilih satu skill</b> kamu yang sudah valid → monetize duluan',
        '<b>Channel:</b> Fiverr, Upwork, Projects.co.id, Sribulancer, atau langsung jaringan',
        '<b>Pricing:</b> mulai 50% market rate untuk dapat review dulu, naikkan bertahap',
        '<b>Time-box:</b> 2 jam/hari di luar jam kerja utama, weekend 4 jam',
        '<b>Reinvest:</b> 50% income side → tools/edukasi yang naikkan rate',
      ])}
      ${insight('green','TARGET 90 HARI','Bulan 1: 1 client. Bulan 2: 3 client + portfolio. Bulan 3: rate naik 50%, ada waiting list.')}
      ${insight('cyan','EXIT STRATEGY','Resign aman ketika: side income ≥ 1.5x gaji utama selama 3 bulan + dana darurat 6 bulan.')}`)
  }

  // Bisnis
  if (m.match(/bisnis|usaha|jualan|startup|umkm|customer|pelanggan|profit|omzet|marketing|brand|launch|produk|sales/)) {
    return wrap('Strategic Business Framework 🚀','Bisnis','blue',`
      ${insight('blue','DIAGNOSIS','MVP wajib divalidasi 30 hari. Jangan scale sebelum product-market-fit.')}
      ${list([
        '<b>Validasi cepat:</b> 10 wawancara calon customer, screening 5 problem teratas',
        '<b>MVP (1-2 minggu):</b> Solusi paling minimal — fokus 1 problem, 1 segmen',
        '<b>Pricing test:</b> 3 tier (Basic/Pro/Premium) — lihat conversion mana yang tertinggi',
        '<b>Acquisition awal:</b> 3 channel saja — content + komunitas + referral',
        '<b>Metrik utama:</b> CAC payback < 3 bulan, gross margin > 60%, NPS > 40',
      ])}
      ${insight('cyan','30 HARI PERTAMA','Goal: 10 paying customer. Dapatkan testimoni + case study real. Iterate produk dari feedback.')}
      ${insight('amber','TRAP TO AVOID','Premature scaling sebelum PMF, terlalu banyak fitur, ignore unit economics.')}`)
  }

  // Career
  if (m.match(/karir|promosi|gaji|jabatan|interview|resign|pindah kerja|cv|resume|lowongan|kerja/)) {
    return wrap('Career Architecture 🎯','Karir','purple',`
      ${insight('purple','POSITIONING','Karir bagus = skill langka × visibilitas × reputasi. Bukan cuma kerja keras.')}
      ${list([
        '<b>Skill stack langka:</b> kombinasi 2-3 skill (mis. Tech + Komunikasi + Domain)',
        '<b>Personal brand:</b> LinkedIn aktif 3x/minggu, share 1 case nyata/bulan',
        '<b>Internal visibility:</b> tampil di meeting, lead 1 inisiatif/kuartal',
        '<b>Network 20 senior:</b> coffee chat 1x/bulan dengan orang 2 level di atas',
        '<b>Salary nego:</b> punya 2 offer paralel sebelum nego naik',
      ])}
      ${insight('cyan','TARGET 6 BULAN','Promosi/role naik atau pindah ke posisi 30%+ lebih tinggi. Tracking via dokumentasi pencapaian bulanan.')}
      ${insight('amber','RED FLAG','Stuck > 18 bulan tanpa naik level/skill = kerangka karir kamu mandek.')}`)
  }

  // Tech & Skill
  if (m.match(/coding|programming|developer|programmer|skill|belajar|tech|software|web|app|ai|data|python|javascript/)) {
    return wrap('Tech Mastery Path 💻','Tech & Skill','cyan',`
      ${insight('cyan','PRINSIP','Mastery = 1 skill mendalam > 10 skill dangkal. Pilih T-shape: 1 deep, beberapa wide.')}
      ${list([
        '<b>Deep stack:</b> pilih 1 stack utama (mis. TypeScript + React + Cloudflare)',
        '<b>Build in public:</b> 1 project setiap bulan, share di GitHub + Twitter',
        '<b>Open source contribution:</b> kontribusi 1 PR/minggu ke project favorit',
        '<b>Reading code &gt; writing:</b> 30 menit/hari baca codebase produk yang kamu pakai',
        '<b>Sertifikasi strategis:</b> 1 sertifikasi vendor (AWS/GCP) per tahun',
      ])}
      ${insight('emerald','DAILY PROTOCOL','Min 2 jam belajar + 1 jam coding/hari. 100 hari konsisten = lebih baik dari 90% developer.')}
      ${insight('amber','TRAP','Tutorial hell — terlalu banyak nonton, sedikit ngebuild. Ratio 20% nonton : 80% build.')}`)
  }

  // Finansial
  if (m.match(/uang|finansial|invest|saham|crypto|tabungan|hutang|kredit|bunga|reksa|emas|properti|kekayaan/)) {
    return wrap('Wealth Building Framework 💰','Finansial','green',`
      ${insight('green','RULE','Spend < Earn. Invest the rest. Compound 20-30 tahun.')}
      ${list([
        '<b>Dana darurat 6 bulan</b> di rekening likuid sebelum invest agresif',
        '<b>Alokasi income (50/30/20):</b> 50% kebutuhan, 30% keinginan, 20% invest',
        '<b>Diversifikasi:</b> 60% indeks/reksa dana, 20% emas/USD, 20% sektor potensi',
        '<b>Hindari hutang konsumtif</b> — kecuali rumah utama atau aset produktif',
        '<b>Multiple income:</b> aktif (kerja) + pasif (dividen/sewa) + portfolio (skill)',
      ])}
      ${insight('cyan','TARGET 3 TAHUN','Net worth 3x gaji tahunan. Income pasif menutupi 30% expenses.')}
      ${insight('amber','TRAP','FOMO trading harian, leverage tinggi, dengar tip orang random.')}`)
  }

  // Produktivitas
  if (m.match(/produktivitas|fokus|disiplin|kebiasaan|habit|waktu|prokrastinasi|malas|menunda/)) {
    return wrap('Productivity OS 🍅','Produktivitas','orange',`
      ${insight('orange','RULE OF 3','Pilih max 3 prioritas/hari. Selesaikan dulu sebelum sentuh notifikasi/email.')}
      ${list([
        '<b>Pomodoro 25/5:</b> minimal 4 sesi sebelum makan siang',
        '<b>Deep work block:</b> 90 menit no-interrupt pagi, hp di mode pesawat',
        '<b>End-of-day review:</b> 5 menit tulis 3 wins + plan 3 prioritas besok',
        '<b>Energy management:</b> tugas berat saat energi puncak (biasanya 9-11 pagi)',
        '<b>Eliminasi:</b> tiap 1 hal yang ditambah, kurangi 1 hal lain',
      ])}
      ${insight('cyan','DEEP WORK FORMULA','Output bernilai = (Waktu) × (Intensitas Fokus). Maksimalkan intensitas, bukan jam kerja.')}
      ${insight('amber','TRAP','Menyibukkan diri tapi tidak produktif. Aktif ≠ produktif.')}`)
  }

  // Mental Health
  if (m.match(/cemas|stress|stres|depresi|sedih|burnout|lelah mental|overthink|anxiety|panic|trauma|self/)) {
    return wrap('Mental Resilience Toolkit 🧘','Mental Health','pink',`
      ${insight('pink','VALIDASI','Yang kamu rasakan valid. Mental health = prioritas, bukan kelemahan.')}
      ${list([
        '<b>4-7-8 breathing:</b> 4 detik tarik, 7 tahan, 8 buang — 4 ronde saat cemas',
        '<b>Gratitude journal:</b> 3 hal yang disyukuri, sebelum tidur',
        '<b>Body scan 5 menit:</b> rasakan tubuh dari ujung kepala ke kaki',
        '<b>Cut digital input:</b> 1 jam sebelum tidur no screen, no scrolling',
        '<b>Olahraga ringan</b> 30 menit/hari — proven naikkan serotonin/endorfin',
      ])}
      ${insight('cyan','BATAS','Kalau gejala &gt; 2 minggu, berat, atau ganggu fungsi → cari profesional. <b>Itu kekuatan, bukan kelemahan.</b>')}
      ${insight('amber','PRINSIP','You are not your thoughts. Observe, don&#39;t identify.')}`)
  }

  // Relationship
  if (m.match(/hubungan|pacar|nikah|menikah|jodoh|pasangan|keluarga|teman|sahabat|cinta|putus|cerai|ldr/)) {
    return wrap('Relationship Architecture ❤️','Relationship','red',`
      ${insight('red','PRINSIP','Relasi sehat = saling tumbuh, saling jujur, saling support — bukan saling kontrol.')}
      ${list([
        '<b>Komunikasi non-violent:</b> "Aku merasa X ketika Y, karena Z."',
        '<b>Active listening:</b> 70% dengar, 30% bicara. Validasi sebelum solusi.',
        '<b>Quality time tanpa hp:</b> 30 menit/hari fokus penuh pasangan/keluarga',
        '<b>Conflict 24-jam rule:</b> tidak buat keputusan besar saat emosi panas',
        '<b>Personal growth bareng:</b> setiap orang ada goal individu yang didukung',
      ])}
      ${insight('cyan','RED FLAGS','Manipulasi, kontrol, kekerasan (fisik/verbal/finansial), tidak ada respect. Walk away.')}
      ${insight('amber','GREEN FLAG','Bisa diajak bicara hal sulit, akui kesalahan, support mimpi kamu, growth mindset.')}`)
  }

  // Pendidikan
  if (m.match(/sekolah|kuliah|kampus|jurusan|skripsi|tesis|beasiswa|sertifikasi|pendidikan|s1|s2|s3/)) {
    return wrap('Learning Strategy 🎓','Pendidikan','indigo',`
      ${insight('indigo','PRINSIP','Pendidikan formal = fondasi. Pendidikan diri = differentiator. Keduanya wajib.')}
      ${list([
        '<b>Active recall &gt; re-reading:</b> bikin soal sendiri, tutup buku, jawab',
        '<b>Spaced repetition:</b> Anki/Quizlet untuk konsep penting',
        '<b>Feynman technique:</b> jelaskan ke anak SD — kalau bisa, kamu paham',
        '<b>Project-based learning:</b> tiap topik = 1 proyek nyata',
        '<b>Teach to learn:</b> ngajar/bikin konten = retention 90%',
      ])}
      ${insight('cyan','BEYOND CAMPUS','Coursera/edX/YouTube + komunitas + mentor. Skill dunia kerja jarang diajar di kampus.')}
      ${insight('amber','TRAP','Hanya kejar nilai tanpa skill nyata. Lulus dengan IPK tinggi tapi tidak punya portfolio = bahaya.')}`)
  }

  // Health
  if (m.match(/kesehatan|olahraga|gym|diet|berat badan|kurus|gemuk|tidur|insomnia|nutrisi|sehat/)) {
    return wrap('Physical Health OS 💪','Health','teal',`
      ${insight('teal','3 PILAR','Tidur 7-9 jam + makan whole food + gerak 150 menit/minggu. Non-negotiable.')}
      ${list([
        '<b>Sleep:</b> jadwal konsisten ±30 menit, kamar gelap-dingin, no caffeine sore',
        '<b>Strength training:</b> 3-4x/minggu, fokus compound (squat, deadlift, push-up)',
        '<b>Cardio low-intensity:</b> jalan 8-10rb langkah/hari, lebih sustainable',
        '<b>Protein 1.6-2g/kg BB:</b> minimal 30g/meal untuk muscle preservation',
        '<b>Hydration:</b> 30-35ml/kg BB/hari, lebih saat olahraga',
      ])}
      ${insight('cyan','PRINSIP','Konsistensi 70% &gt; sempurna 100%. Mulai 10 menit/hari, naikkan bertahap.')}
      ${insight('amber','TRAP','Diet ekstrem, latihan terlalu banyak tanpa istirahat, ignore tidur.')}`)
  }

  // Creative
  if (m.match(/konten|content|kreator|youtube|tiktok|instagram|reels|video|tulis|blog|podcast|design/)) {
    return wrap('Creator Economy Playbook 🎨','Creative','fuchsia',`
      ${insight('fuchsia','PRINSIP','Konten konsisten + niche + nilai = audience. Jangan kejar viral, kejar resonance.')}
      ${list([
        '<b>Niche dulu:</b> 1 audiens spesifik, 1 problem, 1 sudut pandang unik',
        '<b>Content calendar:</b> 3 jenis konten — Educate, Inspire, Entertain',
        '<b>Hook 3 detik:</b> caption + visual harus stop scroll',
        '<b>Repurpose:</b> 1 long-form → 5-10 short-form di platform berbeda',
        '<b>Engagement &gt; views:</b> reply komen 30 menit pertama after post',
      ])}
      ${insight('cyan','MONETISASI','Mulai dari $0: jualan jasa (paling cepat) → produk digital → sponsorship → komunitas berbayar.')}
      ${insight('amber','TRAP','Burnout karena posting harian tanpa sistem. Quality &gt; quantity.')}`)
  }

  // Leadership
  if (m.match(/leader|pemimpin|kepemimpinan|tim|team|manager|atasan|delegasi|memimpin/)) {
    return wrap('Leadership Operating System 👑','Leadership','amber',`
      ${insight('amber','PRINSIP','Leadership = service. Pemimpin hebat = melayani tim agar mereka sukses.')}
      ${list([
        '<b>Vision yang jelas:</b> tim tahu &quot;why&quot; sebelum &quot;what&quot;',
        '<b>1-on-1 weekly:</b> 30 menit per anggota tim, fokus growth mereka',
        '<b>Radical candor:</b> care personally + challenge directly',
        '<b>Decision frame (RAPID):</b> Recommend, Agree, Perform, Input, Decide',
        '<b>Psychological safety:</b> tim aman speak up, gagal, eksperimen',
      ])}
      ${insight('cyan','PROTOKOL HARIAN','30 menit thinking-time tidak terganggu + delegasi 80%, lakukan 20%.')}
      ${insight('rose','TRAP','Micromanage, ambil semua kerjaan sendiri, takut delegate, ego dijual sebagai standar.')}`)
  }

  // Life Purpose
  if (m.match(/purpose|tujuan hidup|ikigai|passion|panggilan|makna hidup|misi|visi pribadi/)) {
    return wrap('Ikigai & Life Purpose 🌟','Tujuan Hidup','violet',`
      ${insight('violet','IKIGAI','Persimpangan dari: yang kamu cintai × kamu jago × dunia butuh × bisa dibayar.')}
      ${list([
        '<b>Audit 3 bulan terakhir:</b> kapan kamu paling alive? Catat polanya.',
        '<b>Future self exercise:</b> tulis surat dari diri 10 tahun lagi yang bahagia',
        '<b>Test small bets:</b> coba 3-5 arah kecil sebelum komit besar',
        '<b>Energy audit:</b> aktivitas apa yang charge vs drain?',
        '<b>Death-bed test:</b> akan kamu sesali apa kalau besok meninggal?',
      ])}
      ${insight('cyan','LANGKAH','Tujuan hidup bukan ditemukan, tapi dibangun lewat tindakan + refleksi konsisten.')}
      ${insight('amber','TRAP','Menunggu &quot;ah-ha moment&quot; sempurna. Itu mitos. Mulai dari yang ada sekarang.')}`)
  }

  // Networking
  if (m.match(/networking|relasi profesional|koneksi|kenalan|linkedin|komunitas|circle|inner circle/)) {
    return wrap('Networking Strategy 🤝','Networking','sky',`
      ${insight('sky','PRINSIP','Net worth = network. Tapi quality &gt; quantity. 50 koneksi kuat &gt; 5000 dangkal.')}
      ${list([
        '<b>Give first:</b> bantu 3 orang/minggu tanpa expect balasan',
        '<b>Coffee chat 1x/minggu</b> dengan orang lebih senior/berbeda industri',
        '<b>Komunitas 2-3 grup:</b> aktif, bukan hanya member silent',
        '<b>Personal CRM:</b> catat kontak, last interaction, follow-up jadwal',
        '<b>Bring value:</b> share insights, intro orang ke orang, kirim resource',
      ])}
      ${insight('cyan','LINKEDIN','Post 3x/minggu, comment di 10 post relevan/hari, DM personal — bukan template.')}
      ${insight('amber','TRAP','Spam pitch di pertemuan pertama, koleksi kartu nama tanpa follow-up.')}`)
  }

  // Parenting
  if (m.match(/anak|parenting|orangtua|keluarga inti|mendidik|toddler|sekolah anak/)) {
    return wrap('Parenting Strategy 👨‍👩‍👧','Parenting','lime',`
      ${insight('lime','PRINSIP','Anak meniru bukan mendengar. Jadi versi terbaik diri kamu = parenting terbaik.')}
      ${list([
        '<b>Quality time tanpa hp:</b> minimal 1 jam/hari fokus total',
        '<b>Konsistensi rule:</b> aturan sama dari kedua orangtua',
        '<b>Validate emotion:</b> "Kamu kecewa ya, papa ngerti." sebelum solusi',
        '<b>Reading bedtime:</b> 15 menit/hari = lifelong learner',
        '<b>Modeling stress management:</b> tunjukkan cara handle masalah dengan tenang',
      ])}
      ${insight('cyan','GROWTH MINDSET','Puji effort, bukan hasil. "Pintar banget kamu usahanya!" &gt; "Pintar banget nilainya!"')}
      ${insight('amber','TRAP','Helicopter parenting, comparison ke anak lain, screen-time pengganti attention.')}`)
  }

  // Time Freedom
  if (m.match(/kebebasan waktu|financial freedom|passive income|fire|pensiun|retire early|location freedom/)) {
    return wrap('Time & Financial Freedom 🗽','Time Freedom','emerald',`
      ${insight('emerald','PRINSIP','Tujuan akhir bukan kekayaan, tapi waktu &amp; kebebasan memilih.')}
      ${list([
        '<b>FIRE number:</b> 25x annual expenses (rule 4%)',
        '<b>Income asymmetric:</b> bangun aset yang scale tanpa waktu (digital product, royalti, dividen)',
        '<b>Lifestyle inflation guard:</b> setiap raise, invest 50% dulu sebelum upgrade gaya hidup',
        '<b>Skip rat race:</b> kerja remote/freelance/digital nomad bila memungkinkan',
        '<b>Calendar audit:</b> 1x/bulan review apa drain waktu — eliminate atau outsource',
      ])}
      ${insight('cyan','LANGKAH','Coast FI dulu (tidak perlu tambah tabungan, biarkan compound) → baru full FI.')}
      ${insight('amber','TRAP','Gaya hidup naik bareng income — &quot;hedonic treadmill&quot;. Tetap simple, invest the diff.')}`)
  }

  // Default Universal
  return wrap('Strategic Universal Framework 🧠','Universal','indigo',`
    ${insight('indigo','PROBLEM FRAMING','Definisikan ulang masalah kamu. Solusi bagus dimulai dari pertanyaan tepat.')}
    ${list([
      '<b>Diagnosa:</b> Apa root cause real (pakai 5-Why)?',
      '<b>Hypothesis:</b> Apa solusi paling kecil yang bisa divalidasi 7 hari?',
      '<b>Action:</b> 3 langkah konkret yang bisa kamu mulai hari ini',
      '<b>Metrik:</b> Bagaimana kamu tahu ini berhasil/gagal?',
      '<b>Iterate:</b> Review weekly, adjust mingguan',
    ])}
    ${insight('cyan','PROTOKOL UNIVERSAL','Strategy = clarity × focus × consistency × speed. Hilangkan 1 = momentum hilang.')}
    ${insight('amber','PRINSIP','Lebih baik 1 langkah salah lalu corrected, daripada paralisis analisis 6 bulan.')}`)
}

function generateSWOT(business: string): string {
  const safe = business.replace(/[<>]/g, '')
  return `<div class="space-y-4">
    <p class="font-bold text-white text-lg">SWOT Analysis: ${safe}</p>
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p class="text-xs text-green-400 font-bold uppercase mb-2">💪 Strengths</p>
        <ul class="text-sm text-gray-200 space-y-1.5"><li>• Fokus value unik</li><li>• Tim agile, decision cepat</li><li>• Cost structure rendah</li></ul>
      </div>
      <div class="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <p class="text-xs text-red-400 font-bold uppercase mb-2">⚠️ Weaknesses</p>
        <ul class="text-sm text-gray-200 space-y-1.5"><li>• Brand awareness terbatas</li><li>• Resources marketing kecil</li><li>• Belum ada moat kuat</li></ul>
      </div>
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <p class="text-xs text-blue-400 font-bold uppercase mb-2">🚀 Opportunities</p>
        <ul class="text-sm text-gray-200 space-y-1.5"><li>• Pasar tumbuh 25% YoY</li><li>• Pesaing besar lambat adopt</li><li>• Trend sosial favorable</li></ul>
      </div>
      <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <p class="text-xs text-amber-400 font-bold uppercase mb-2">🛡️ Threats</p>
        <ul class="text-sm text-gray-200 space-y-1.5"><li>• Regulasi berubah</li><li>• Pesaing baru agresif</li><li>• Customer acquisition cost naik</li></ul>
      </div>
    </div>
    <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
      <p class="text-xs text-indigo-400 font-bold uppercase mb-2">🎯 Strategic Move</p>
      <p class="text-sm text-gray-200 leading-relaxed">Pakai <b>Strengths</b> untuk eksploitasi <b>Opportunities</b>. Mitigasi <b>Threats</b> dengan tutup <b>Weaknesses</b> paling kritis. Rumusan: <i>S+O = Growth, W+T = Survival, S+T = Defense, W+O = Improvement.</i></p>
    </div>
  </div>`
}

function generateCoachResponse(goal: string, currentState: string, obstacles: string): string {
  const safe = (s: string) => s.replace(/[<>]/g, '')
  return `<div class="space-y-4">
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-rose-500/10 text-rose-400 text-[10px] rounded-full border border-rose-500/20 font-bold uppercase">AI COACH V6</span></div>
    <p class="font-bold text-white text-base">Coaching Plan: ${safe(goal)}</p>
    <div class="bg-rose-500/5 border-l-2 border-rose-500 rounded-r p-3">
      <p class="text-[10px] text-rose-400 font-bold uppercase mb-1">SITUASI SAAT INI</p>
      <p class="text-sm text-gray-200">${safe(currentState) || 'Belum diisi — mulailah dengan audit kondisi sekarang.'}</p>
    </div>
    <div class="bg-amber-500/5 border-l-2 border-amber-500 rounded-r p-3">
      <p class="text-[10px] text-amber-400 font-bold uppercase mb-1">HAMBATAN UTAMA</p>
      <p class="text-sm text-gray-200">${safe(obstacles) || 'Identifikasi 3 hambatan terbesar dulu.'}</p>
    </div>
    <p class="text-xs text-gray-400 font-bold uppercase tracking-wider">📋 90-Day Roadmap</p>
    <div class="space-y-2">
      <div class="bg-white/5 border border-white/10 rounded-lg p-3"><b class="text-emerald-400 text-sm">Hari 1-30 (Foundation):</b><p class="text-sm text-gray-300 mt-1">Diagnosa lengkap. Set 1 input metric harian. Build sistem reminder + tracking.</p></div>
      <div class="bg-white/5 border border-white/10 rounded-lg p-3"><b class="text-cyan-400 text-sm">Hari 31-60 (Momentum):</b><p class="text-sm text-gray-300 mt-1">Double-down hal yang work. Eliminasi yang gagal. Naikkan intensitas 1.5x.</p></div>
      <div class="bg-white/5 border border-white/10 rounded-lg p-3"><b class="text-violet-400 text-sm">Hari 61-90 (Scale):</b><p class="text-sm text-gray-300 mt-1">Sistem auto-pilot. Tambah 1 leverage (delegasi/automasi/komunitas). Review besar di hari ke-90.</p></div>
    </div>
    <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
      <p class="text-xs text-indigo-400 font-bold uppercase mb-2">⚡ Komitmen Pertama (24 jam)</p>
      <p class="text-sm text-gray-200">Tulis 3 tindakan spesifik yang akan kamu lakukan dalam 24 jam ke depan untuk goal ini. Lakukan, lalu kembali ke sini untuk update.</p>
    </div>
  </div>`
}

// ============================================
// DATA: Resources, Insights, Quotes
// ============================================
const RESOURCES_DATA = [
  { id:1, title:'Spiritual Foundation', cat:'Spiritual', icon:'🕊️', desc:'Mulai pagi 5 menit muhasabah + tadabbur weekly + sedekah 2.5% otomatis.' },
  { id:2, title:'Side Hustle Blueprint', cat:'Bisnis', icon:'💼', desc:'Pilih 1 skill valid → Fiverr/Upwork → 2 jam/hari → naikkan rate.' },
  { id:3, title:'OKR Framework', cat:'Strategy', icon:'🎯', desc:'Objectives + Key Results. 3 objective × 3-5 KR / kuartal.' },
  { id:4, title:'Pomodoro Technique', cat:'Focus', icon:'🍅', desc:'25 menit fokus + 5 menit istirahat. 4 sesi = long break 15 menit.' },
  { id:5, title:'Atomic Habits System', cat:'Habit', icon:'🔁', desc:'1% lebih baik tiap hari. Habit stacking + environment design.' },
  { id:6, title:'Eisenhower Matrix', cat:'Priority', icon:'📐', desc:'Urgent×Important. Do/Schedule/Delegate/Delete.' },
  { id:7, title:'2-Minute Rule', cat:'Action', icon:'⚡', desc:'Kalau bisa diselesaikan &lt; 2 menit, kerjakan langsung.' },
  { id:8, title:'80/20 Pareto', cat:'Strategy', icon:'📊', desc:'20% effort = 80% hasil. Identifikasi & double-down.' },
  { id:9, title:'5-Why Analysis', cat:'Problem', icon:'❓', desc:'Tanyakan "kenapa" 5x untuk temukan root cause.' },
  { id:10, title:'BMC (Business Model Canvas)', cat:'Bisnis', icon:'🧱', desc:'9 building block — value prop, segmen, channel, revenue, dll.' },
  { id:11, title:'SWOT Analysis', cat:'Strategy', icon:'🔍', desc:'Strengths, Weaknesses, Opportunities, Threats.' },
  { id:12, title:'Time Blocking', cat:'Time', icon:'📆', desc:'Block kalender per aktivitas — bukan reactive ke notifikasi.' },
  { id:13, title:'4-7-8 Breathing', cat:'Mental', icon:'🧘', desc:'Saat cemas: tarik 4 detik, tahan 7, buang 8. 4 ronde.' },
  { id:14, title:'Compound Interest', cat:'Finance', icon:'💰', desc:'10% ROI/tahun selama 30 tahun = 17.4x lipat. Mulai dini.' },
  { id:15, title:'Active Recall', cat:'Learning', icon:'🎓', desc:'Tutup buku, bikin soal sendiri, jawab. Lebih efektif dari re-read.' },
  { id:16, title:'Feynman Technique', cat:'Learning', icon:'🧑‍🏫', desc:'Jelaskan konsep ke anak SD. Kalau bisa, kamu paham.' },
  { id:17, title:'Deep Work Protocol', cat:'Focus', icon:'🌊', desc:'90 menit no-interrupt + hp di mode pesawat. Lakukan setiap pagi.' },
  { id:18, title:'Ikigai Diagram', cat:'Purpose', icon:'🌸', desc:'Cinta × jago × dunia butuh × bisa dibayar = ikigai kamu.' },
  { id:19, title:'Stoic Daily Practice', cat:'Mental', icon:'🏛️', desc:'Pagi: visualisasi tantangan. Malam: refleksi. Dichotomy of control.' },
  { id:20, title:'GROW Coaching Model', cat:'Coaching', icon:'🌱', desc:'Goal, Reality, Options, Way Forward. Pertanyaan, bukan instruksi.' },
  { id:21, title:'Networking Personal CRM', cat:'Network', icon:'🤝', desc:'Catat 50 koneksi penting + last interaction + follow-up reminder.' },
]

const INSIGHTS_DATA = [
  { id:1, title:'Strategi 1% Compound', desc:'Naik 1% tiap hari = 37x lebih baik dalam 1 tahun.', icon:'📈' },
  { id:2, title:'Eat the Frog', desc:'Tugas paling sulit, kerjakan paling pagi.', icon:'🐸' },
  { id:3, title:'Single Tasking', desc:'Multitasking turunkan IQ 10 poin sementara.', icon:'🎯' },
  { id:4, title:'Sleep Investment', desc:'Tidur 7-9 jam = ROI tertinggi untuk performa.', icon:'😴' },
  { id:5, title:'Read &gt; Watch', desc:'30 menit baca/hari = 12 buku/tahun = top 1%.', icon:'📚' },
]

const QUOTES_DATA = [
  { text:'Mulailah dari mana kamu berada. Pakai apa yang kamu punya. Lakukan apa yang kamu bisa.', author:'Arthur Ashe' },
  { text:'Yang penting bukan seberapa cepat, tapi seberapa konsisten.', author:'James Clear' },
  { text:'Strategi tanpa eksekusi = halusinasi.', author:'SparkMind' },
  { text:'You are the architect of your own reality.', author:'SparkMind' },
  { text:'Sukses adalah jumlah dari tindakan kecil yang konsisten setiap hari.', author:'Robert Collier' },
  { text:'The best time to plant a tree was 20 years ago. Yang kedua adalah sekarang.', author:'Pepatah Cina' },
  { text:'Hidup berdaulat = punya pilihan, punya waktu, punya makna.', author:'SparkMind' },
  { text:'Compound interest is the eighth wonder of the world.', author:'Albert Einstein' },
]

// ============================================
// SERVICE WORKER (offline cache shell)
// ============================================
const SERVICE_WORKER_JS = `
const CACHE = 'sparkmind-v6-cache-1';
const ASSETS = ['/','/app','/manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first for API, cache-first for static
  if (req.url.includes('/api/')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
  } else {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/app')))
    );
  }
});
`

// ============================================
// LANDING PAGE — V7.3 PRODUCTION HARDENED
// ============================================
const LANDING_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a0a1a">
  <title>SparkMind V7.3 — AI Strategic Guide + Clarity Coach (Duitku Live)</title>
  <meta name="description" content="Platform AI strategic guide dengan 18+ kategori. Pomodoro, Journal, Goal Tracker, Habit, AI Coach. Privacy-first, offline-ready, gratis.">
  <meta name="keywords" content="AI assistant Indonesia, productivity, strategic guide, life coach, pomodoro, habit tracker, journaling">
  <meta name="author" content="SparkMind">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta property="og:title" content="SparkMind V7.3 — AI Strategic Guide + Clarity Coach">
  <meta property="og:description" content="Platform AI dengan 18+ kategori untuk hidup berdaulat. Privacy-first, offline-ready.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://sparkmind-v2.pages.dev">
  <meta property="og:locale" content="id_ID">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="SparkMind V7.3 — AI Strategic Guide + Clarity Coach">
  <meta name="twitter:description" content="Platform AI strategic guide untuk hidup berdaulat.">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication","name":"SparkMind","applicationCategory":"ProductivityApplication","operatingSystem":"Any","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}</script>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%234f46e5'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif}
    body{background:#0a0a1a;color:#e5e7eb;overflow-x:hidden}
    .gradient-text{background:linear-gradient(135deg,#a78bfa,#60a5fa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .glass:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.15)}
    .glow{box-shadow:0 0 60px rgba(99,102,241,.4)}
    .grid-bg{background-image:linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px);background-size:50px 50px}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
    .float{animation:float 5s ease-in-out infinite}
    @keyframes pulse-glow{0%,100%{box-shadow:0 0 30px rgba(99,102,241,.3)}50%{box-shadow:0 0 60px rgba(99,102,241,.6)}}
    .pulse-glow{animation:pulse-glow 3s ease-in-out infinite}
    .fade-up{opacity:0;transform:translateY(30px);transition:all .8s cubic-bezier(.4,0,.2,1)}
    .fade-up.visible{opacity:1;transform:none}
    @media (prefers-reduced-motion: reduce){.float,.pulse-glow{animation:none}.fade-up{transition:none;opacity:1;transform:none}}
    .btn-primary{background:linear-gradient(135deg,#4f46e5,#6366f1);transition:all .3s}
    .btn-primary:hover{background:linear-gradient(135deg,#4338ca,#4f46e5);transform:translateY(-2px);box-shadow:0 10px 30px rgba(99,102,241,.4)}
  </style>
</head>
<body class="min-h-screen relative">
  <div class="fixed inset-0 grid-bg opacity-40 pointer-events-none"></div>
  <div class="fixed top-0 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
  <div class="fixed top-32 right-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none"></div>

  <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-white/5">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5 group">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">S</div>
        <span class="text-base font-bold tracking-tight">SparkMind <span class="text-[10px] text-violet-400 font-mono ml-0.5">V7.3</span></span>
      </a>
      <div class="flex items-center gap-2">
        <a href="/clarity" class="hidden sm:inline-block text-sm text-violet-300 hover:text-white px-3 py-1.5 transition"><i class="fas fa-heart-pulse mr-1"></i>Clarity</a>
        <a href="/pricing" class="hidden sm:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition">Pricing</a>
        <a href="/flow" class="hidden md:inline-block text-sm text-emerald-300 hover:text-white px-3 py-1.5 transition" title="Alur Pembayaran (Duitku Onboarding)"><i class="fas fa-route mr-1"></i>Payment Flow</a>
        <a href="/legal" class="hidden md:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition" title="Legal &amp; Compliance"><i class="fas fa-gavel mr-1"></i>Legal</a>
        <a href="/app" class="px-4 py-2 btn-primary text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-500/30">Buka App <i class="fas fa-arrow-right ml-1 text-xs"></i></a>
      </div>
    </div>
  </nav>

  <section class="relative pt-32 pb-20 px-4 sm:px-6 max-w-5xl mx-auto text-center">
    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 mb-6 fade-up">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      V7.3 PRODUCTION HARDENED • Duitku Live (D22457) • Clarity Coach • 19 Categories
    </div>
    <h1 class="text-4xl sm:text-6xl md:text-7xl font-black mb-6 leading-[1.05] tracking-tight fade-up">
      AI Strategic Guide<br>
      Untuk Hidup <span class="gradient-text">Berdaulat</span>
    </h1>
    <p class="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed fade-up">
      Platform AI yang memandu kamu di 18+ aspek hidup. Bisnis, karir, finansial, mental, spiritual, side hustle — semua dengan strategi konkret. <b class="text-white">Privacy-first, offline-ready, gratis selamanya.</b>
    </p>
    <div class="flex flex-wrap justify-center gap-3 mb-12 fade-up">
      <a href="/app" class="px-7 py-3.5 btn-primary text-white font-bold rounded-xl shadow-2xl shadow-indigo-500/40 pulse-glow">
        Mulai Gratis <i class="fas fa-rocket ml-1.5"></i>
      </a>
      <a href="/pricing" class="px-7 py-3.5 glass text-white font-bold rounded-xl">
        Lihat Pricing <i class="fas fa-chart-line ml-1.5 text-emerald-400"></i>
      </a>
    </div>

    <div class="grid grid-cols-3 gap-4 max-w-2xl mx-auto fade-up">
      ${[['18+','AI Categories'],['12','Tabs Tools'],['100%','Privacy']].map(s=>`
        <div class="glass rounded-xl p-4 text-center">
          <p class="text-2xl sm:text-3xl font-black gradient-text">${s[0]}</p>
          <p class="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider mt-1">${s[1]}</p>
        </div>`).join('')}
    </div>
  </section>

  <section class="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
    <div class="text-center mb-12 fade-up">
      <h2 class="text-3xl sm:text-4xl font-bold mb-3">Apa Baru di V7.3 <span class="gradient-text">PRODUCTION HARDENED</span></h2>
      <p class="text-gray-400 text-sm">12 hardening + revenue-ready upgrades dari V5.0 SOVEREIGN</p>
    </div>
    <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
      ${[
        ['📲','PWA Installable','Install ke home screen iOS/Android. Buka offline.','indigo'],
        ['🛡️','XSS-Safe Rendering','Semua user input di-escape. Aman dari injection.','emerald'],
        ['🔄','Offline Mode','Service worker cache shell. Tetap jalan tanpa internet.','cyan'],
        ['💥','Error Boundary','Bug 1 fitur tidak crash semua. Auto-recovery.','rose'],
        ['💾','Storage Quota Guard','Warning kalau localStorage hampir penuh.','amber'],
        ['🎯','Quick Add Modal','⌘N global — tambah goal/habit/journal kapan saja.','violet'],
        ['📋','Copy/Share AI Response','1-tap copy, share via Web Share API.','pink'],
        ['📅','Habit Heatmap 30D','Visualisasi konsistensi 30 hari ala GitHub.','green'],
        ['💰','Pricing Page Ready','MVP revenue-ready dengan 3 tier pricing.','orange'],
        ['🎨','Onboarding Tour V6','5 langkah tour untuk first-time user.','sky'],
        ['⏱️','Pomodoro Resume','Timer lanjut akurat saat pindah tab.','teal'],
        ['🔍','SEO + OG Tags','Discovery di Google + share preview.','fuchsia'],
      ].map((f,i)=>`
        <div class="glass rounded-2xl p-5 fade-up" style="transition-delay:${i*30}ms">
          <div class="text-3xl mb-3">${f[0]}</div>
          <h3 class="font-bold text-white text-sm mb-1.5">${f[1]}</h3>
          <p class="text-xs text-gray-400 leading-relaxed">${f[2]}</p>
        </div>`).join('')}
    </div>
  </section>

  <section class="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
    <div class="text-center mb-10 fade-up">
      <h2 class="text-3xl sm:text-4xl font-bold mb-2">12 Tools Produktivitas <span class="gradient-text">All-in-One</span></h2>
      <p class="text-gray-400 text-sm">Semua yang kamu butuh dalam 1 dashboard</p>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      ${[
        ['📊','Dashboard'],['🧠','AI Analyzer'],['🧭','AI Coach V6'],['📊','SWOT'],
        ['🍅','Pomodoro V2'],['📓','Journal'],['🎯','Goals'],['🔥','Habits + Heatmap'],
        ['🎨','Vision Board'],['📋','Weekly Review'],['📚','21+ Resources'],['⚙️','Backup/Restore'],
      ].map(t=>`<div class="glass rounded-xl p-3 text-center"><div class="text-2xl mb-1">${t[0]}</div><p class="text-xs text-gray-300 font-semibold">${t[1]}</p></div>`).join('')}
    </div>
  </section>

  <section class="py-20 px-4 sm:px-6 max-w-3xl mx-auto text-center">
    <div class="glass rounded-3xl p-8 sm:p-12 fade-up">
      <div class="text-5xl mb-4">🚀</div>
      <h2 class="text-2xl sm:text-3xl font-bold mb-3">Mulai <span class="gradient-text">Hari Ini</span></h2>
      <p class="text-gray-400 text-sm mb-7">Tidak ada signup. Tidak ada kartu kredit. Buka, pakai, miliki kembali waktu kamu.</p>
      <a href="/app" class="inline-block px-8 py-4 btn-primary text-white font-bold rounded-xl shadow-2xl shadow-indigo-500/40">
        Buka SparkMind <i class="fas fa-arrow-right ml-2"></i>
      </a>
      <p class="text-xs text-gray-500 mt-5">Gratis selamanya · Privacy-first · 100% client-side</p>
    </div>
  </section>

  <footer class="py-8 px-4 text-center border-t border-white/5">
    <p class="text-xs text-gray-500">© 2026 SparkMind V7.3 PRODUCTION HARDENED — AI Strategic Guide + Clarity Coach 🇮🇩 · <a href="/clarity" class="text-violet-400 hover:text-violet-300">Clarity Coach</a> · <a href="/pricing" class="text-indigo-400 hover:text-indigo-300">Pricing</a> · <a href="/flow" class="text-emerald-400 hover:text-emerald-300">Payment Flow</a></p>
  </footer>

  <script>
    // PWA register
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
    }
    // Fade-up observer
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('visible')), { threshold:0.15 });
    document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
    // Auto-trigger first viewport
    setTimeout(() => document.querySelectorAll('.fade-up').forEach(el => {
      const r = el.getBoundingClientRect(); if (r.top < window.innerHeight) el.classList.add('visible');
    }), 100);
  </script>
</body>
</html>`

// ============================================
// PRICING PAGE
// ============================================
const PRICING_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pricing — SparkMind V7.3 (Duitku Production Live)</title>
  <meta name="description" content="Pricing SparkMind. Free selamanya, Pro untuk power user, Team untuk organisasi. Pembayaran aman via Duitku — VA/QRIS/E-wallet/Credit Card.">
  <meta property="og:title" content="SparkMind Pricing — Sederhana, Adil, Powerful">
  <meta property="og:description" content="Mulai gratis. Pro Rp 49rb/bln. Bayar via Duitku — semua bank Indonesia, QRIS, OVO, DANA, ShopeePay didukung.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%234f46e5'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <!-- Duitku Pop JS (PRODUCTION) — V7.3 callback hardened (IP whitelist + MD5 sig + idempotent)
       Source: https://docs.duitku.com/pop/en/#duitku-js-module-location -->
  <script src="https://app-prod.duitku.com/lib/js/duitku.js"></script>
  <style>
    body{background:#0a0a1a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .gradient-text{background:linear-gradient(135deg,#a78bfa,#60a5fa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .grid-bg{background-image:linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px);background-size:50px 50px}
    .btn-primary{background:linear-gradient(135deg,#4f46e5,#6366f1);transition:all .3s}
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(99,102,241,.4)}
    .btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none}
    .featured{position:relative;border-color:rgba(99,102,241,.5)!important;box-shadow:0 0 60px rgba(99,102,241,.25)}
    .featured::before{content:'PALING POPULAR';position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-size:10px;font-weight:bold;padding:4px 12px;border-radius:6px;letter-spacing:.05em}
    .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:100;display:none;align-items:center;justify-content:center;padding:1rem}
    .modal-bg.show{display:flex}
    .modal-card{background:#1a1a2e;border:1px solid rgba(255,255,255,.1);border-radius:1rem;max-width:440px;width:100%;padding:1.5rem;animation:popIn .25s}
    @keyframes popIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    .toast{position:fixed;top:1rem;left:50%;transform:translateX(-50%);padding:.75rem 1.25rem;border-radius:.5rem;color:#fff;font-weight:600;font-size:.875rem;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.4);max-width:90%;text-align:center}
    .toast.success{background:linear-gradient(135deg,#10b981,#059669)}
    .toast.error{background:linear-gradient(135deg,#ef4444,#dc2626)}
    .toast.info{background:linear-gradient(135deg,#4f46e5,#6366f1)}
    input,select{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;padding:.625rem .875rem;border-radius:.5rem;width:100%;font-size:.875rem;outline:none;transition:border .2s}
    input:focus,select:focus{border-color:#6366f1}
    .pay-method-icon{display:inline-block;background:rgba(255,255,255,.08);padding:.25rem .5rem;border-radius:.25rem;font-size:.625rem;font-weight:600;margin:.125rem}
  </style>
</head>
<body class="min-h-screen relative">
  <div class="fixed inset-0 grid-bg opacity-40 pointer-events-none"></div>
  <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-white/5">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white">S</div>
        <span class="text-base font-bold">SparkMind <span class="text-[10px] text-violet-400 font-mono">V7.3</span></span>
      </a>
      <div class="flex items-center gap-2">
        <span class="hidden sm:inline-block px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/20"><i class="fas fa-shield-alt mr-1"></i>Duitku Production</span>
        <a href="/flow" class="hidden md:inline-block text-sm text-emerald-300 hover:text-white px-3 py-1.5 transition" title="Alur Pembayaran"><i class="fas fa-route mr-1"></i>Flow</a>
        <a href="/clarity" class="hidden sm:inline-block text-sm text-violet-300 hover:text-white px-3 py-1.5 transition">Clarity</a>
        <a href="/app" class="px-4 py-2 btn-primary text-white text-sm font-semibold rounded-lg">Buka App</a>
      </div>
    </div>
  </nav>

  <section class="relative pt-28 pb-12 px-4 sm:px-6 max-w-6xl mx-auto text-center">
    <h1 class="text-4xl sm:text-5xl font-black mb-3">Pricing <span class="gradient-text">Sederhana</span></h1>
    <p class="text-gray-400 text-sm mb-3">Mulai gratis. Upgrade kapan saja. Cancel kapan saja.</p>
    <p class="text-xs text-gray-500 mb-10">
      <i class="fas fa-lock mr-1 text-emerald-400"></i> Bayar aman via Duitku ·
      <span class="pay-method-icon">VA BCA/Mandiri/BRI/BNI</span>
      <span class="pay-method-icon">QRIS</span>
      <span class="pay-method-icon">OVO</span>
      <span class="pay-method-icon">DANA</span>
      <span class="pay-method-icon">ShopeePay</span>
      <span class="pay-method-icon">Credit Card</span>
    </p>

    <div class="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto text-left">
      <!-- FREE -->
      <div class="glass rounded-2xl p-6">
        <p class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">Sovereign</p>
        <p class="text-4xl font-black text-white mb-1">Gratis</p>
        <p class="text-xs text-gray-500 mb-5">Selamanya. Tanpa syarat.</p>
        <a href="/app" class="block w-full text-center py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold transition">Mulai Sekarang</a>
        <ul class="mt-6 space-y-2.5 text-sm text-gray-300">
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> 18+ AI Categories</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> Pomodoro V2 + Journal</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> Goal + Habit + Vision</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> 21+ Resources</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> Backup/Restore JSON</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> PWA Offline Mode</li>
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> Privacy-first (100% client)</li>
        </ul>
      </div>

      <!-- PRO -->
      <div class="glass featured rounded-2xl p-6">
        <p class="text-xs text-indigo-400 uppercase tracking-wider font-bold mb-2">Pro</p>
        <p class="text-4xl font-black text-white mb-1">Rp 49rb<span class="text-base text-gray-500 font-normal">/bln</span></p>
        <p class="text-xs text-gray-500 mb-5">atau Rp 470rb/tahun (hemat 20%)</p>
        <button data-plan="pro-monthly" data-amount="49000" class="pay-btn block w-full text-center py-2.5 btn-primary text-white rounded-lg text-sm font-semibold">
          <i class="fas fa-credit-card mr-1.5"></i> Bayar Rp 49rb/bln
        </button>
        <button data-plan="pro-yearly" data-amount="470000" class="pay-btn mt-2 block w-full text-center py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-semibold border border-indigo-500/30">
          <i class="fas fa-star mr-1 text-amber-400"></i> Bayar Tahunan (Rp 470rb)
        </button>
        <ul class="mt-5 space-y-2.5 text-sm text-gray-300">
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> <b>Semua di Sovereign</b></li>
          <li class="flex gap-2"><i class="fas fa-bolt text-amber-400 mt-1"></i> Real LLM (GPT-4 / Claude)</li>
          <li class="flex gap-2"><i class="fas fa-cloud text-cyan-400 mt-1"></i> Cloud sync multi-device</li>
          <li class="flex gap-2"><i class="fas fa-bell text-rose-400 mt-1"></i> Reminder via email/push</li>
          <li class="flex gap-2"><i class="fas fa-magic text-violet-400 mt-1"></i> Custom AI persona</li>
          <li class="flex gap-2"><i class="fas fa-chart-line text-green-400 mt-1"></i> Advanced analytics</li>
          <li class="flex gap-2"><i class="fas fa-headset text-pink-400 mt-1"></i> Priority support</li>
        </ul>
      </div>

      <!-- TEAM -->
      <div class="glass rounded-2xl p-6">
        <p class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">Team</p>
        <p class="text-4xl font-black text-white mb-1">Rp 745rb<span class="text-base text-gray-500 font-normal">/5user/bln</span></p>
        <p class="text-xs text-gray-500 mb-5">Rp 149rb/user. Diskon volume 10+.</p>
        <button data-plan="team-monthly" data-amount="745000" class="pay-btn block w-full text-center py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-semibold transition border border-white/10">
          <i class="fas fa-users mr-1.5"></i> Bayar Rp 745rb/bln
        </button>
        <ul class="mt-6 space-y-2.5 text-sm text-gray-300">
          <li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> <b>Semua di Pro</b></li>
          <li class="flex gap-2"><i class="fas fa-users text-sky-400 mt-1"></i> Workspace tim &amp; sharing</li>
          <li class="flex gap-2"><i class="fas fa-shield-alt text-emerald-400 mt-1"></i> SSO + role-based access</li>
          <li class="flex gap-2"><i class="fas fa-chart-bar text-amber-400 mt-1"></i> Team productivity dashboard</li>
          <li class="flex gap-2"><i class="fas fa-file-export text-violet-400 mt-1"></i> Audit log + export</li>
          <li class="flex gap-2"><i class="fas fa-handshake text-pink-400 mt-1"></i> Dedicated success manager</li>
        </ul>
      </div>
    </div>

    <!-- Lifetime Deal Banner -->
    <div class="mt-8 max-w-3xl mx-auto glass rounded-2xl p-5 border-amber-500/30 text-left flex flex-col sm:flex-row items-center gap-4">
      <div class="text-3xl"><i class="fas fa-infinity text-amber-400"></i></div>
      <div class="flex-1">
        <p class="font-bold text-white">Lifetime Deal — <span class="text-amber-400">Rp 1.490.000</span> <span class="text-xs text-gray-500 line-through ml-2">Rp 5.880.000</span></p>
        <p class="text-xs text-gray-400 mt-0.5">Bayar sekali, akses Pro selamanya. Limited 100 slot pertama.</p>
      </div>
      <button data-plan="lifetime" data-amount="1490000" class="pay-btn px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-lg text-sm whitespace-nowrap">
        Klaim Lifetime <i class="fas fa-arrow-right ml-1"></i>
      </button>
    </div>

    <!-- ============================================ -->
    <!-- ENTERPRISE-GRADE CONTACT SUPPORT (DUITKU REQ) -->
    <!-- Required by Duitku Onboarding Compliance:     -->
    <!--   No. HP, Email, & Alamat Usaha               -->
    <!-- ============================================ -->
    <section id="contact-support" aria-labelledby="contact-support-title" class="mt-16 max-w-5xl mx-auto text-left scroll-mt-20">
      <div class="text-center mb-6">
        <span class="inline-block px-3 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
          <i class="fas fa-headset mr-1"></i> Customer Support · Verified Merchant
        </span>
        <h2 id="contact-support-title" class="mt-3 text-2xl sm:text-3xl font-black text-white">Hubungi <span class="gradient-text">Tim Support SparkMind</span></h2>
        <p class="mt-2 text-sm text-gray-400 max-w-2xl mx-auto">
          Resmi terdaftar — <b>PT. Waskita Cakrawarti Digital</b>. Tim support kami merespon Senin–Sabtu 08.00–21.00 WIB. Untuk transaksi pembayaran (Duitku), respon prioritas &lt;2 jam pada jam kerja.
        </p>
      </div>

      <div class="grid sm:grid-cols-3 gap-4">
        <!-- PHONE / WA -->
        <article class="glass rounded-2xl p-5 border-emerald-500/20 hover:border-emerald-500/50 transition">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-300 text-lg shrink-0">
              <i class="fas fa-phone-alt"></i>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Customer Support · Hotline</p>
              <a href="tel:+6285643383832" class="block mt-1 text-base font-bold text-white hover:text-emerald-300 break-all">+62 856-4338-3832</a>
              <p class="text-[11px] text-gray-400 mt-1">No. HP / WhatsApp aktif</p>
              <a href="https://wa.me/6285643383832?text=Halo%20Tim%20SparkMind%2C%20saya%20butuh%20bantuan%20mengenai%20layanan%20Anda."
                 target="_blank" rel="noopener noreferrer"
                 class="inline-block mt-3 text-xs font-semibold text-emerald-300 hover:text-white">
                <i class="fab fa-whatsapp mr-1"></i> Chat via WhatsApp →
              </a>
            </div>
          </div>
        </article>

        <!-- EMAIL -->
        <article class="glass rounded-2xl p-5 border-indigo-500/20 hover:border-indigo-500/50 transition">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-300 text-lg shrink-0">
              <i class="fas fa-envelope-open-text"></i>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">Email Support · Resmi</p>
              <a href="mailto:sparkmind.support@gmail.com" class="block mt-1 text-base font-bold text-white hover:text-indigo-300 break-all">sparkmind.support@gmail.com</a>
              <p class="text-[11px] text-gray-400 mt-1">Email resmi · ticket support, refund &amp; compliance</p>
              <a href="mailto:sparkmind.support@gmail.com?subject=SparkMind%20Support%20Request"
                 class="inline-block mt-3 text-xs font-semibold text-indigo-300 hover:text-white">
                <i class="fas fa-paper-plane mr-1"></i> Kirim email →
              </a>
            </div>
          </div>
        </article>

        <!-- ADDRESS -->
        <article class="glass rounded-2xl p-5 border-amber-500/20 hover:border-amber-500/50 transition">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-300 text-lg shrink-0">
              <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Alamat Usaha · Kantor Pusat</p>
              <address class="not-italic mt-1 text-sm font-semibold text-white leading-relaxed">
                Sokaraja, Kabupaten Banyumas,<br>
                Purwokerto, Jawa Tengah,<br>
                Indonesia 53181
              </address>
              <p class="text-[11px] text-gray-400 mt-2">PT. Waskita Cakrawarti Digital</p>
              <a href="https://www.google.com/maps/search/?api=1&query=Sokaraja+Banyumas+Purwokerto+Jawa+Tengah"
                 target="_blank" rel="noopener noreferrer"
                 class="inline-block mt-2 text-xs font-semibold text-amber-300 hover:text-white">
                <i class="fas fa-external-link-alt mr-1"></i> Buka di Google Maps →
              </a>
            </div>
          </div>
        </article>
      </div>

      <!-- LEGAL ENTITY ROW -->
      <div class="mt-6 glass rounded-2xl p-5 border-violet-500/20">
        <div class="grid md:grid-cols-2 gap-5 items-start">
          <div>
            <p class="text-[10px] uppercase tracking-wider text-violet-300 font-bold mb-2">
              <i class="fas fa-building mr-1"></i> Legal Entity · Badan Hukum
            </p>
            <p class="text-base font-bold text-white">PT. Waskita Cakrawarti Digital</p>
            <p class="text-xs text-gray-400 mt-1">
              Bidang Usaha: <b class="text-gray-200">AI Service · Portal Web Dan/Atau Platform Digital Dengan Tujuan Komersial</b><br>
              KBLI <b class="text-gray-200">63122</b> · Tingkat Risiko: <b class="text-emerald-300">Rendah</b> · Skala: <b class="text-emerald-300">Mikro</b>
            </p>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-violet-300 font-bold mb-2">
              <i class="fas fa-id-card mr-1"></i> Perizinan &amp; Compliance
            </p>
            <ul class="text-xs text-gray-300 space-y-1.5">
              <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i> NIB terdaftar di OSS RBA — beranda.oss.go.id</li>
              <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i> NPWP Perusahaan aktif</li>
              <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i> Payment Gateway: Duitku (BI-licensed) Merchant <code class="px-1 py-0.5 bg-white/5 rounded text-[10px]">D22457</code></li>
              <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i> Patuh UU PDP (UU 27/2022) &amp; UU ITE (UU 19/2016)</li>
            </ul>
          </div>
        </div>
        <div class="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-2">
          <a href="/legal" class="text-xs font-semibold text-violet-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <i class="fas fa-gavel mr-1"></i> Halaman Legal Lengkap
          </a>
          <a href="/legal#tos" class="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Syarat &amp; Ketentuan</a>
          <a href="/legal#privacy" class="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Privacy Policy</a>
          <a href="/legal#refund" class="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Refund Policy</a>
          <a href="/flow" class="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Alur Pembayaran</a>
        </div>
      </div>
    </section>

    <div class="mt-10 text-xs text-gray-500">
      <p><i class="fas fa-shield-alt text-emerald-400"></i> Secured by <b>Duitku</b> — Bank Indonesia licensed payment gateway · Merchant <b>D22457</b></p>
      <p class="mt-2">📧 sparkmind.support@gmail.com · 📞 +62 856-4338-3832 · 🇮🇩 Sokaraja, Banyumas, Jawa Tengah</p>
    </div>
  </section>

  <!-- Payment Modal -->
  <div id="pay-modal" class="modal-bg" role="dialog" aria-modal="true" aria-labelledby="pay-title">
    <div class="modal-card">
      <div class="flex items-center justify-between mb-4">
        <h3 id="pay-title" class="text-lg font-bold text-white">Checkout</h3>
        <button id="pay-close" aria-label="Close" class="text-gray-400 hover:text-white text-xl"><i class="fas fa-times"></i></button>
      </div>
      <div id="pay-summary" class="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-sm">
        <div class="flex justify-between"><span class="text-gray-300" id="pay-plan-name">Plan</span><span class="font-bold text-white" id="pay-plan-amount">Rp 0</span></div>
        <p class="text-xs text-gray-400 mt-1" id="pay-plan-desc"></p>
      </div>
      <div class="space-y-3">
        <div>
          <label class="text-xs text-gray-400 block mb-1">Email <span class="text-rose-400">*</span></label>
          <input id="pay-email" type="email" placeholder="email@anda.com" required>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-gray-400 block mb-1">Nama Depan</label>
            <input id="pay-firstname" type="text" placeholder="Budi" maxlength="50">
          </div>
          <div>
            <label class="text-xs text-gray-400 block mb-1">Nama Belakang</label>
            <input id="pay-lastname" type="text" placeholder="Santoso" maxlength="50">
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">No. HP (opsional)</label>
          <input id="pay-phone" type="tel" placeholder="08123456789" maxlength="20">
        </div>
      </div>
      <button id="pay-submit" class="mt-5 w-full py-3 btn-primary text-white font-bold rounded-lg">
        <span id="pay-submit-text"><i class="fas fa-lock mr-1.5"></i> Lanjut Bayar</span>
      </button>
      <p class="text-[10px] text-gray-500 text-center mt-3">
        <i class="fas fa-shield-alt"></i> Pembayaran aman via Duitku (Production).
        Anda akan diarahkan ke halaman pembayaran Duitku.
      </p>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="toast" style="display:none"></div>

  <script>
    (function(){
      'use strict';
      var modal = document.getElementById('pay-modal');
      var closeBtn = document.getElementById('pay-close');
      var submitBtn = document.getElementById('pay-submit');
      var submitText = document.getElementById('pay-submit-text');
      var toastEl = document.getElementById('toast');
      var currentPlan = null;

      function fmtRp(n){ return 'Rp ' + Number(n).toLocaleString('id-ID'); }
      function toast(msg, type){
        type = type || 'info';
        toastEl.className = 'toast ' + type;
        toastEl.textContent = msg;
        toastEl.style.display = 'block';
        setTimeout(function(){ toastEl.style.display = 'none'; }, 4000);
      }

      function openModal(planId, amount, label){
        currentPlan = planId;
        document.getElementById('pay-plan-name').textContent = label || planId;
        document.getElementById('pay-plan-amount').textContent = fmtRp(amount);
        document.getElementById('pay-plan-desc').textContent = 'Akses langsung setelah pembayaran berhasil. Refund 7 hari.';
        // Restore email from localStorage if any
        try { document.getElementById('pay-email').value = localStorage.getItem('sm_email') || ''; } catch(e){}
        modal.classList.add('show');
        setTimeout(function(){ document.getElementById('pay-email').focus(); }, 100);
      }
      function closeModal(){ modal.classList.remove('show'); }

      // Bind pay buttons
      document.querySelectorAll('.pay-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var plan = btn.getAttribute('data-plan');
          var amount = parseInt(btn.getAttribute('data-amount'), 10);
          var label = btn.textContent.trim();
          openModal(plan, amount, label);
        });
      });
      closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModal(); });

      // Submit
      submitBtn.addEventListener('click', function(){
        var email = document.getElementById('pay-email').value.trim();
        var firstName = document.getElementById('pay-firstname').value.trim();
        var lastName = document.getElementById('pay-lastname').value.trim();
        var phone = document.getElementById('pay-phone').value.trim();

        if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          toast('Email tidak valid', 'error');
          return;
        }
        try { localStorage.setItem('sm_email', email); } catch(e){}

        submitBtn.disabled = true;
        submitText.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i> Memproses...';

        fetch('/api/payment/create-invoice', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ planId: currentPlan, email: email, firstName: firstName || 'SparkMind', lastName: lastName || 'User', phoneNumber: phone || '08123456789' })
        })
        .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, data: j }; }); })
        .then(function(res){
          if (!res.ok || !res.data.success) {
            console.error('Create invoice error:', res.data);
            var msg = res.data.error || 'Gagal buat invoice';
            if (res.data.duitku && res.data.duitku.statusMessage) msg += ' — ' + res.data.duitku.statusMessage;
            toast(msg, 'error');
            submitBtn.disabled = false;
            submitText.innerHTML = '<i class="fas fa-lock mr-1.5"></i> Lanjut Bayar';
            return;
          }

          // Save order locally for tracking
          try {
            localStorage.setItem('sm_last_order', JSON.stringify({
              merchantOrderId: res.data.merchantOrderId,
              reference: res.data.reference,
              amount: res.data.amount,
              planId: res.data.planId,
              createdAt: Date.now(),
            }));
          } catch(e){}

          toast('Invoice dibuat. Membuka Duitku...', 'success');

          // Try Duitku Pop JS first (preferred — popup overlay)
          if (typeof window.checkout !== 'undefined' && typeof window.checkout.process === 'function') {
            window.checkout.process(res.data.reference, {
              defaultLanguage: 'id',
              successEvent: function(result){
                console.log('[Duitku] success', result);
                window.location.href = '/payment/return?merchantOrderId=' + encodeURIComponent(res.data.merchantOrderId) + '&resultCode=00&reference=' + encodeURIComponent(res.data.reference);
              },
              pendingEvent: function(result){
                console.log('[Duitku] pending', result);
                window.location.href = '/payment/return?merchantOrderId=' + encodeURIComponent(res.data.merchantOrderId) + '&resultCode=01&reference=' + encodeURIComponent(res.data.reference);
              },
              errorEvent: function(result){
                console.log('[Duitku] error', result);
                toast('Pembayaran gagal: ' + (result && result.message ? result.message : 'unknown error'), 'error');
                submitBtn.disabled = false;
                submitText.innerHTML = '<i class="fas fa-lock mr-1.5"></i> Lanjut Bayar';
              },
              closeEvent: function(result){
                console.log('[Duitku] closed', result);
                toast('Popup ditutup. Order tetap aktif 60 menit.', 'info');
                submitBtn.disabled = false;
                submitText.innerHTML = '<i class="fas fa-lock mr-1.5"></i> Lanjut Bayar';
              },
            });
          } else {
            // Fallback: direct redirect to Duitku payment URL
            console.warn('[Duitku] Pop JS not loaded, falling back to redirect');
            window.location.href = res.data.paymentUrl;
          }
        })
        .catch(function(err){
          console.error('Network error:', err);
          toast('Gagal koneksi ke server. Coba lagi.', 'error');
          submitBtn.disabled = false;
          submitText.innerHTML = '<i class="fas fa-lock mr-1.5"></i> Lanjut Bayar';
        });
      });

      // Auto-detect Duitku JS load
      window.addEventListener('load', function(){
        if (typeof window.checkout === 'undefined') {
          console.warn('[SparkMind] Duitku Pop JS belum loaded — akan fallback ke redirect.');
        } else {
          console.log('[SparkMind] Duitku Pop JS ready');
        }
      });
    })();
  </script>
</body>
</html>`

// ============================================
// PAYMENT RETURN PAGE
// ============================================
const PAYMENT_RETURN_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Status Pembayaran — SparkMind</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%234f46e5'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body{background:#0a0a1a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .pulse{animation:pulse 2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
    .check-anim{animation:checkPop .5s cubic-bezier(0.68, -0.55, 0.27, 1.55)}
    @keyframes checkPop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
  </style>
</head>
<body>
  <main class="glass rounded-2xl p-8 max-w-md w-full text-center">
    <div id="status-icon" class="text-6xl mb-4 pulse"><i class="fas fa-spinner fa-spin text-indigo-400"></i></div>
    <h1 id="status-title" class="text-2xl font-black mb-2">Mengecek Status...</h1>
    <p id="status-msg" class="text-sm text-gray-400 mb-6">Mohon tunggu, kami sedang verifikasi pembayaran Anda.</p>
    <div id="order-info" class="text-xs text-gray-500 mb-6 p-3 bg-white/5 rounded-lg" style="display:none"></div>
    <div class="space-y-2">
      <a href="/app" class="block w-full py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold rounded-lg hover:opacity-90">
        <i class="fas fa-rocket mr-1.5"></i> Buka SparkMind
      </a>
      <a href="/pricing" class="block w-full py-2.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg text-sm transition">
        Kembali ke Pricing
      </a>
    </div>
    <p class="text-[10px] text-gray-600 mt-5">
      <i class="fas fa-shield-alt text-emerald-400"></i> Powered by Duitku ·
      <a href="mailto:hello@sparkmind.app" class="hover:text-gray-400">Butuh bantuan?</a>
    </p>
  </main>
  <script>
    (function(){
      var qs = new URLSearchParams(window.location.search);
      var code = qs.get('resultCode') || '';
      var orderId = qs.get('merchantOrderId') || '';
      var ref = qs.get('reference') || '';

      var icon = document.getElementById('status-icon');
      var title = document.getElementById('status-title');
      var msg = document.getElementById('status-msg');
      var info = document.getElementById('order-info');

      function render(state){
        if (state === 'success'){
          icon.className = 'text-6xl mb-4 check-anim';
          icon.innerHTML = '<i class="fas fa-check-circle text-emerald-400"></i>';
          title.textContent = 'Pembayaran Berhasil! 🎉';
          title.className = 'text-2xl font-black mb-2 text-emerald-400';
          msg.textContent = 'Terima kasih! Akun Pro Anda akan aktif dalam beberapa menit. Cek email untuk konfirmasi.';
          try {
            var last = JSON.parse(localStorage.getItem('sm_last_order') || '{}');
            last.status = 'paid'; last.paidAt = Date.now();
            localStorage.setItem('sm_last_order', JSON.stringify(last));
            localStorage.setItem('sm_pro_active', '1');
          } catch(e){}
        } else if (state === 'pending'){
          icon.innerHTML = '<i class="fas fa-clock text-amber-400"></i>';
          icon.className = 'text-6xl mb-4 pulse';
          title.textContent = 'Pembayaran Pending';
          title.className = 'text-2xl font-black mb-2 text-amber-400';
          msg.textContent = 'Pembayaran sedang diproses. Cek email atau halaman ini lagi nanti.';
        } else if (state === 'failed'){
          icon.innerHTML = '<i class="fas fa-times-circle text-rose-400"></i>';
          icon.className = 'text-6xl mb-4';
          title.textContent = 'Pembayaran Dibatalkan';
          title.className = 'text-2xl font-black mb-2 text-rose-400';
          msg.textContent = 'Transaksi tidak diselesaikan. Silakan coba lagi kalau perlu.';
        } else {
          icon.innerHTML = '<i class="fas fa-question-circle text-gray-400"></i>';
          icon.className = 'text-6xl mb-4';
          title.textContent = 'Status Tidak Diketahui';
          title.className = 'text-2xl font-black mb-2';
          msg.textContent = 'Tidak ada parameter status. Silakan kembali ke pricing.';
        }
        if (orderId || ref){
          info.style.display = 'block';
          info.innerHTML = '<div class="text-left">' +
            (orderId ? '<div><span class="text-gray-500">Order ID:</span> <code class="text-white">' + orderId.replace(/[<>]/g,'') + '</code></div>' : '') +
            (ref ? '<div class="mt-1"><span class="text-gray-500">Reference:</span> <code class="text-white">' + ref.replace(/[<>]/g,'') + '</code></div>' : '') +
            '</div>';
        }
      }

      // Map Duitku resultCode
      // 00 = Success, 01 = Pending/Process, 02 = Failed/Cancelled
      if (code === '00') render('success');
      else if (code === '01') render('pending');
      else if (code === '02') render('failed');
      else if (orderId) {
        // No code but has order — poll status from server
        fetch('/api/payment/status/' + encodeURIComponent(orderId))
          .then(function(r){ return r.json(); })
          .then(function(d){
            var rc = d && d.duitku && d.duitku.statusCode;
            if (rc === '00') render('success');
            else if (rc === '01') render('pending');
            else if (rc === '02') render('failed');
            else render('unknown');
          })
          .catch(function(){ render('unknown'); });
      } else {
        render('unknown');
      }
    })();
  </script>
</body>
</html>`

// ============================================
// APP PAGE V7.3 — PRODUCTION HARDENED
// ============================================
const APP_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a0a1a">
  <title>SparkMind V7.3 PRODUCTION HARDENED — Dashboard</title>
  <meta name="description" content="SparkMind dashboard — AI strategic guide & productivity OS dengan 12 tools all-in-one.">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%234f46e5'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif}
    body{background:#0a0a1a;color:#e5e7eb;overflow-x:hidden}
    body.light{background:#f9fafb;color:#1f2937}
    body.density-compact{font-size:13px}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    body.light .glass{background:rgba(255,255,255,.7);border-color:rgba(0,0,0,.08)}
    .gradient-text{background:linear-gradient(135deg,#a78bfa,#60a5fa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .tab-active{background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.12));border-color:rgba(99,102,241,.4)!important;color:#a5b4fc}
    body.light .tab-active{background:linear-gradient(135deg,#eef2ff,#f5f3ff);color:#4f46e5}
    .grid-bg{background-image:linear-gradient(rgba(99,102,241,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.05) 1px,transparent 1px);background-size:40px 40px}
    .btn-primary{background:linear-gradient(135deg,#4f46e5,#6366f1);transition:all .3s}
    .btn-primary:hover{background:linear-gradient(135deg,#4338ca,#4f46e5);transform:translateY(-1px)}
    .btn-danger{background:linear-gradient(135deg,#dc2626,#ef4444)}
    .typing::after{content:'.';animation:typ 1.4s infinite}
    @keyframes typ{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
    .toast{animation:slide-in .3s cubic-bezier(.4,0,.2,1)}
    @keyframes slide-in{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:none}}
    .modal-bg{animation:fade-in .2s}
    @keyframes fade-in{from{opacity:0}to{opacity:1}}
    .modal-content{animation:scale-in .25s cubic-bezier(.4,0,.2,1)}
    @keyframes scale-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}
    .sidebar-mobile{transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}
    .sidebar-mobile.open{transform:translateX(0)}
    .counter{opacity:0;transform:translateY(20px);transition:all .6s}
    .counter.visible{opacity:1;transform:none}
    .fade-up{opacity:0;transform:translateY(20px);transition:all .5s}
    .fade-up.visible{opacity:1;transform:none}
    @media (prefers-reduced-motion: reduce){.toast,.modal-bg,.modal-content,.counter,.fade-up,.typing::after,.sidebar-mobile{animation:none!important;transition:none!important;opacity:1!important;transform:none!important}}
    ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(99,102,241,.3);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(99,102,241,.5)}
    .heatmap-cell{width:14px;height:14px;border-radius:3px;background:rgba(255,255,255,.05);transition:transform .2s}
    .heatmap-cell:hover{transform:scale(1.3)}
    .heat-1{background:rgba(99,102,241,.25)}.heat-2{background:rgba(99,102,241,.5)}.heat-3{background:rgba(99,102,241,.75)}.heat-4{background:rgba(99,102,241,1)}
    button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
  </style>
</head>
<body class="min-h-screen">
  <div class="fixed inset-0 grid-bg opacity-30 pointer-events-none"></div>

  <!-- Top bar -->
  <header class="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/80 border-b border-white/5 px-3 sm:px-5 py-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <button id="sidebar-toggle" aria-label="Menu" class="md:hidden p-2 hover:bg-white/5 rounded-lg"><i class="fas fa-bars"></i></button>
      <a href="/" class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">S</div>
        <span class="font-bold text-sm hidden sm:inline">SparkMind <span class="text-[10px] text-violet-400 font-mono">V7.3</span></span>
      </a>
    </div>
    <div class="flex items-center gap-1.5">
      <button onclick="openCommandPalette()" aria-label="Command palette" class="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-gray-400 border border-white/5">
        <i class="fas fa-search text-[10px]"></i> <span>Cari</span> <kbd class="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-mono">⌘K</kbd>
      </button>
      <button onclick="openQuickAdd()" aria-label="Quick add" title="Quick Add (⌘N)" class="p-2 hover:bg-white/5 rounded-lg"><i class="fas fa-plus text-sm"></i></button>
      <button onclick="openShortcutsModal()" aria-label="Shortcuts" title="Shortcuts (⌘/)" class="p-2 hover:bg-white/5 rounded-lg"><i class="fas fa-keyboard text-sm"></i></button>
      <button onclick="toggleTheme()" aria-label="Toggle theme" title="Theme (⌘D)" class="p-2 hover:bg-white/5 rounded-lg"><i id="theme-icon" class="fas fa-moon text-sm"></i></button>
    </div>
  </header>

  <div class="flex">
    <!-- Sidebar -->
    <aside id="sidebar" class="sidebar-mobile fixed md:sticky md:translate-x-0 top-[57px] left-0 h-[calc(100vh-57px)] w-64 bg-slate-950/95 md:bg-transparent backdrop-blur-xl border-r border-white/5 z-20 overflow-y-auto p-3">
      <nav id="tab-nav" class="space-y-1 text-sm"></nav>
      <div class="mt-6 px-3 py-3 glass rounded-xl">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pro Tip</p>
        <p class="text-xs text-gray-300">Tekan <kbd class="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">⌘K</kbd> untuk pencarian cepat</p>
      </div>
    </aside>
    <div id="sidebar-backdrop" class="hidden fixed inset-0 bg-black/50 z-10 md:hidden"></div>

    <!-- Main -->
    <main id="content" class="flex-1 px-3 sm:px-6 py-5 sm:py-7 max-w-6xl mx-auto w-full"></main>
  </div>

  <!-- Toast container -->
  <div id="toast-root" class="fixed top-20 right-4 z-50 space-y-2 max-w-sm"></div>
  <!-- Modal root -->
  <div id="modal-root"></div>
  <!-- Storage warning -->
  <div id="storage-warn" class="hidden fixed bottom-4 right-4 z-40 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs px-4 py-2 rounded-lg backdrop-blur"></div>

  <script>
  (function(){ // IIFE for clean scope
  'use strict';

  // ===== UTILITIES =====
  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const todayKey = () => new Date().toISOString().slice(0,10);

  // ===== STORAGE WITH QUOTA GUARD =====
  const SAFE_LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) {
        if (e.name === 'QuotaExceededError' || /quota/i.test(e.message)) {
          showStorageWarning();
          return false;
        }
        return false;
      }
    },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  function showStorageWarning() {
    const el = $('storage-warn');
    el.textContent = '⚠️ Storage hampir penuh. Backup lalu hapus data lama di Settings.';
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 7000);
  }
  function checkStorageQuota() {
    if (!navigator.storage?.estimate) return;
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage && quota && (usage / quota) > 0.85) showStorageWarning();
    }).catch(()=>{});
  }

  // ===== STATE =====
  const KEYS = {
    goals: 'sm_goals_v6', habits: 'sm_habits_v6', journal: 'sm_journal_v6',
    chat: 'sm_chat_v6', vision: 'sm_vision_v6', review: 'sm_review_v6',
    pomo: 'sm_pomo_v6', activity: 'sm_activity_v6', focus: 'sm_focus_v6',
    streak: 'sm_streak_v6', theme: 'sm_theme_v6', tour: 'sm_tour_v6',
    pomoState: 'sm_pomo_state_v6', density: 'sm_density_v6', motion: 'sm_motion_v6',
    lastActive: 'sm_last_active_v6'
  };

  let state = {
    activeTab: 'dashboard',
    goals: SAFE_LS.get(KEYS.goals, []),
    habits: SAFE_LS.get(KEYS.habits, []),
    journal: SAFE_LS.get(KEYS.journal, []),
    chat: SAFE_LS.get(KEYS.chat, []),
    vision: SAFE_LS.get(KEYS.vision, { big:'', y1:'', m3:'', w1:'' }),
    review: SAFE_LS.get(KEYS.review, { wins:'', learnings:'', focus:'' }),
    pomo: SAFE_LS.get(KEYS.pomo, { sessions:0, totalMin:0, lastDay:'' }),
    activity: SAFE_LS.get(KEYS.activity, {}),
    focus: SAFE_LS.get(KEYS.focus, 0),
    streak: SAFE_LS.get(KEYS.streak, 0),
    theme: SAFE_LS.get(KEYS.theme, 'dark'),
    density: SAFE_LS.get(KEYS.density, 'normal'),
    journalDraft: '',
    journalMood: '',
    chatMode: 'strategic',
    searchTerm: '',
  };

  // Pomodoro state with persistent end time (resume on tab switch)
  let pomoTick = null;

  // ===== TABS =====
  const TABS = [
    { id:'dashboard',  icon:'fa-chart-pie',     label:'Dashboard',     n:1 },
    { id:'analyzer',   icon:'fa-brain',         label:'AI Analyzer',   n:2 },
    { id:'coach',      icon:'fa-compass',       label:'AI Coach V6',   n:3 },
    { id:'swot',       icon:'fa-bullseye',      label:'SWOT',          n:4 },
    { id:'pomodoro',   icon:'fa-stopwatch',     label:'Pomodoro V2',   n:5 },
    { id:'journal',    icon:'fa-book-open',     label:'Journal',       n:6 },
    { id:'goals',      icon:'fa-flag',          label:'Goals',         n:7 },
    { id:'habits',     icon:'fa-fire',          label:'Habits',        n:8 },
    { id:'vision',     icon:'fa-mountain',      label:'Vision Board',  n:9 },
    { id:'review',     icon:'fa-clipboard-list',label:'Weekly Review' },
    { id:'resources',  icon:'fa-graduation-cap',label:'Resources' },
    { id:'settings',   icon:'fa-cog',           label:'Settings' },
  ];

  function renderSidebar() {
    const nav = $('tab-nav');
    nav.innerHTML = TABS.map(t => \`
      <button data-tab="\${t.id}" class="tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent text-gray-400 hover:bg-white/5 hover:text-white transition\">
        <i class="fas \${t.icon} text-sm w-4 text-center"></i>
        <span class="flex-1 text-left">\${t.label}</span>
        \${t.n ? \`<kbd class="text-[9px] px-1.5 py-0.5 bg-white/5 rounded font-mono text-gray-500">\${t.n}</kbd>\` : ''}
      </button>\`).join('');
    nav.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    updateActiveTab();
  }
  function updateActiveTab() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('tab-active', b.dataset.tab === state.activeTab);
    });
  }
  function switchTab(id) {
    if (!TABS.find(t => t.id === id)) return;
    state.activeTab = id;
    closeSidebar();
    updateActiveTab();
    renderActive();
    logActivity();
  }
  function renderActive() {
    const map = {
      dashboard: renderDashboard, analyzer: renderAnalyzer, coach: renderCoach,
      swot: renderSWOT, pomodoro: renderPomodoro, journal: renderJournal,
      goals: renderGoals, habits: renderHabits, vision: renderVision,
      review: renderReview, resources: renderResources, settings: renderSettings,
    };
    try { (map[state.activeTab] || renderDashboard)(); }
    catch (e) {
      console.error('Render error:', e);
      $('content').innerHTML = \`<div class="glass rounded-2xl p-8 text-center"><div class="text-5xl mb-3">⚠️</div><p class="font-bold mb-2">Terjadi error</p><p class="text-xs text-gray-400 mb-4">\${escapeHtml(e.message || 'Unknown')}</p><button onclick="location.reload()" class="px-4 py-2 btn-primary text-white rounded-lg text-sm">Reload</button></div>\`;
    }
  }
  window.switchTab = switchTab;

  // ===== SIDEBAR MOBILE =====
  function toggleSidebar() {
    const sb = $('sidebar'); const bd = $('sidebar-backdrop');
    sb.classList.toggle('open');
    bd.classList.toggle('hidden');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-backdrop').classList.add('hidden');
  }
  $('sidebar-toggle').addEventListener('click', toggleSidebar);
  $('sidebar-backdrop').addEventListener('click', closeSidebar);

  // ===== TOAST =====
  function toast(msg, type='success', duration=2500) {
    const colors = { success:'emerald', error:'rose', info:'sky', warn:'amber' };
    const icons = { success:'check-circle', error:'circle-exclamation', info:'info-circle', warn:'triangle-exclamation' };
    const c = colors[type] || 'sky';
    const ic = icons[type] || 'info-circle';
    const div = document.createElement('div');
    div.className = \`toast glass rounded-xl px-4 py-3 flex items-center gap-3 border-l-4 border-\${c}-500\`;
    div.innerHTML = \`<i class="fas fa-\${ic} text-\${c}-400"></i><p class="text-sm flex-1">\${escapeHtml(msg)}</p>\`;
    $('toast-root').appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transform = 'translateX(20px)'; div.style.transition = 'all .3s'; setTimeout(() => div.remove(), 300); }, duration);
  }

  // ===== MODAL =====
  function openModal(html) {
    const root = $('modal-root');
    root.innerHTML = \`<div class="modal-bg fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()"><div class="modal-content max-w-md w-full">\${html}</div></div>\`;
  }
  function closeModal() { $('modal-root').innerHTML = ''; }
  window.closeModal = closeModal;

  function showConfirm({ title, body, danger=false, confirmText='Konfirmasi', onConfirm }) {
    const id = 'cf' + Date.now();
    openModal(\`<div class="glass rounded-2xl p-6">
      <p class="text-xl font-bold mb-2">\${escapeHtml(title)}</p>
      <p class="text-sm text-gray-400 mb-5">\${escapeHtml(body)}</p>
      <div class="flex gap-2 justify-end">
        <button onclick="closeModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">Batal</button>
        <button id="\${id}" class="px-4 py-2 \${danger ? 'btn-danger' : 'btn-primary'} text-white rounded-lg text-sm font-semibold">\${escapeHtml(confirmText)}</button>
      </div></div>\`);
    setTimeout(() => $(id)?.addEventListener('click', () => { closeModal(); onConfirm?.(); }), 0);
  }

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', e => {
    const isInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape') { closeModal(); closeSidebar(); return; }
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'k') { e.preventDefault(); openCommandPalette(); }
    else if (k === 'n' && !isInput) { e.preventDefault(); openQuickAdd(); }
    else if (k === 'd' && !isInput) { e.preventDefault(); toggleTheme(); }
    else if (k === '/' || e.key === '/') { e.preventDefault(); openShortcutsModal(); }
    else if (k >= '1' && k <= '9' && !isInput) {
      const tab = TABS.find(t => t.n === parseInt(k));
      if (tab) { e.preventDefault(); switchTab(tab.id); }
    }
  });

  function openShortcutsModal() {
    const sc = [
      ['⌘K / Ctrl+K','Command palette'],
      ['⌘N / Ctrl+N','Quick Add (goal/habit/journal)'],
      ['⌘1-9','Switch tab cepat'],
      ['⌘D','Toggle dark/light mode'],
      ['⌘/','Show shortcuts (modal ini)'],
      ['Esc','Close modal / sidebar'],
    ];
    openModal(\`<div class="glass rounded-2xl p-6">
      <p class="text-xl font-bold mb-4">⌨️ Keyboard Shortcuts</p>
      <div class="space-y-2">
        \${sc.map(([k,d]) => \`<div class="flex items-center justify-between py-2 border-b border-white/5"><span class="text-sm text-gray-300">\${d}</span><kbd class="text-[11px] px-2 py-1 bg-white/10 rounded font-mono text-indigo-300">\${k}</kbd></div>\`).join('')}
      </div>
      <button onclick="closeModal()" class="mt-5 w-full py-2.5 btn-primary text-white rounded-lg text-sm font-semibold">Tutup</button>
    </div>\`);
  }
  window.openShortcutsModal = openShortcutsModal;

  function openCommandPalette() {
    openModal(\`<div class="glass rounded-2xl p-4">
      <input id="cmd-input" type="text" placeholder="Cari tab atau aksi..." class="w-full bg-transparent border-b border-white/10 px-2 py-3 text-sm focus:outline-none focus:border-indigo-500">
      <div id="cmd-results" class="mt-3 max-h-72 overflow-y-auto"></div>
    </div>\`);
    const input = $('cmd-input');
    const results = $('cmd-results');
    function paint(filter='') {
      const f = filter.toLowerCase();
      const items = [
        ...TABS.map(t => ({ label: t.label, action: () => switchTab(t.id), icon: t.icon })),
        { label:'Quick Add', action: openQuickAdd, icon:'fa-plus' },
        { label:'Toggle Theme', action: toggleTheme, icon:'fa-moon' },
        { label:'Show Shortcuts', action: openShortcutsModal, icon:'fa-keyboard' },
        { label:'Backup Data (JSON)', action: () => { closeModal(); switchTab('settings'); setTimeout(exportData, 200); }, icon:'fa-download' },
      ].filter(i => i.label.toLowerCase().includes(f));
      results.innerHTML = items.length === 0
        ? '<p class="text-gray-500 text-sm text-center py-4">Tidak ada hasil</p>'
        : items.map((i, idx) => \`<button data-idx="\${idx}" class="cmd-item w-full text-left px-3 py-2.5 hover:bg-white/5 rounded text-sm flex items-center gap-3"><i class="fas \${i.icon} text-indigo-400 w-4"></i><span>\${escapeHtml(i.label)}</span></button>\`).join('');
      results.querySelectorAll('.cmd-item').forEach((b, idx) => b.addEventListener('click', () => { closeModal(); items[idx].action(); }));
    }
    setTimeout(() => { input.focus(); paint(); }, 50);
    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') results.querySelector('.cmd-item')?.click(); });
  }
  window.openCommandPalette = openCommandPalette;

  // ===== QUICK ADD =====
  function openQuickAdd() {
    openModal(\`<div class="glass rounded-2xl p-6">
      <p class="text-lg font-bold mb-4">⚡ Quick Add</p>
      <div class="space-y-3">
        <button data-qa="goal" class="qa-btn w-full p-3 bg-white/5 hover:bg-indigo-500/10 rounded-lg text-left flex items-center gap-3"><i class="fas fa-flag text-indigo-400"></i><span class="text-sm">Tambah Goal</span></button>
        <button data-qa="habit" class="qa-btn w-full p-3 bg-white/5 hover:bg-emerald-500/10 rounded-lg text-left flex items-center gap-3"><i class="fas fa-fire text-emerald-400"></i><span class="text-sm">Tambah Habit</span></button>
        <button data-qa="journal" class="qa-btn w-full p-3 bg-white/5 hover:bg-rose-500/10 rounded-lg text-left flex items-center gap-3"><i class="fas fa-book-open text-rose-400"></i><span class="text-sm">Journal Baru</span></button>
      </div>
      <button onclick="closeModal()" class="mt-4 w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">Batal</button>
    </div>\`);
    setTimeout(() => {
      document.querySelectorAll('.qa-btn').forEach(b => b.addEventListener('click', () => {
        const t = b.dataset.qa;
        closeModal();
        if (t === 'goal') { switchTab('goals'); setTimeout(() => $('goal-input')?.focus(), 200); }
        else if (t === 'habit') { switchTab('habits'); setTimeout(() => $('habit-input')?.focus(), 200); }
        else { switchTab('journal'); setTimeout(() => $('journal-input')?.focus(), 200); }
      }));
    }, 0);
  }
  window.openQuickAdd = openQuickAdd;

  // ===== THEME =====
  function applyTheme() {
    document.body.classList.toggle('light', state.theme === 'light');
    const ic = $('theme-icon');
    if (ic) ic.className = state.theme === 'light' ? 'fas fa-sun text-sm' : 'fas fa-moon text-sm';
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    SAFE_LS.set(KEYS.theme, state.theme);
    applyTheme();
    toast('Theme: ' + state.theme, 'info', 1500);
  }
  window.toggleTheme = toggleTheme;
  applyTheme();
  document.body.classList.toggle('density-compact', state.density === 'compact');

  // ===== ACTIVITY LOG =====
  function logActivity() {
    const k = todayKey();
    state.activity[k] = (state.activity[k] || 0) + 1;
    SAFE_LS.set(KEYS.activity, state.activity);
    SAFE_LS.set(KEYS.lastActive, k);
  }

  // ===== STREAK =====
  function updateStreak() {
    const last = SAFE_LS.get(KEYS.lastActive, '');
    const today = todayKey();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if (last === today) return;
    if (last === yesterday) state.streak += 1;
    else if (last && last !== today) state.streak = 1;
    else state.streak = 1;
    SAFE_LS.set(KEYS.streak, state.streak);
  }

  // ===== DASHBOARD =====
  function renderDashboard() {
    updateStreak();
    const totalGoals = state.goals.length;
    const completed = state.goals.filter(g => g.progress >= 100).length;
    const streakHabits = state.habits.reduce((s, h) => s + (h.streak || 0), 0);
    const journalCount = state.journal.length;
    const focusToday = Math.round((state.pomo.lastDay === todayKey() ? state.pomo.sessions : 0) * 25);

    // Weekly trend (last 7 days)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const k = d.toISOString().slice(0,10);
      days.push({ label: d.toLocaleDateString('id-ID',{ weekday:'short' }), count: state.activity[k] || 0 });
    }
    const max = Math.max(...days.map(d => d.count), 1);

    $('content').innerHTML = \`
      <div class="space-y-5">
        <div class="fade-up">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Selamat datang di SparkMind</p>
          <h1 class="text-2xl sm:text-3xl font-black gradient-text">Dashboard Anda</h1>
          <p class="text-xs text-gray-400 mt-1">Streak <b class="text-emerald-400">\${state.streak}</b> hari · \${new Date().toLocaleDateString('id-ID',{ weekday:'long', day:'numeric', month:'long' })}</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          \${[
            ['flag','indigo','Total Goals',totalGoals],
            ['check-double','emerald','Completed',completed],
            ['fire','orange','Habit Streaks',streakHabits],
            ['book-open','rose','Journal Entries',journalCount],
          ].map(([ic,c,l,v]) => \`
            <div class="glass rounded-xl p-4 counter">
              <div class="flex items-center justify-between mb-1.5">
                <i class="fas fa-\${ic} text-\${c}-400 text-sm"></i>
                <span class="text-2xl font-black gradient-text">\${v}</span>
              </div>
              <p class="text-[10px] text-gray-500 uppercase tracking-wider">\${l}</p>
            </div>\`).join('')}
        </div>

        <div class="glass rounded-2xl p-5 fade-up">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wider">Aktivitas 7 Hari</p>
              <p class="text-lg font-bold mt-0.5">Trend Mingguan</p>
            </div>
            <span class="text-xs text-emerald-400">\${days.reduce((s,d)=>s+d.count,0)} interaksi total</span>
          </div>
          <div class="flex items-end gap-2 h-32">
            \${days.map(d => \`
              <div class="flex-1 flex flex-col items-center gap-1.5">
                <div class="w-full rounded-t bg-gradient-to-t from-indigo-500 to-violet-500 transition-all" style="height:\${(d.count/max)*100}%;min-height:4px" title="\${d.count} aktivitas"></div>
                <span class="text-[10px] text-gray-500">\${d.label}</span>
              </div>\`).join('')}
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-3">
          <div class="glass rounded-xl p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Focus Today (Pomodoro)</p>
            <p class="text-3xl font-black text-orange-400">\${focusToday} <span class="text-base text-gray-500">menit</span></p>
            <button onclick="switchTab('pomodoro')" class="text-xs text-orange-400 hover:underline mt-1">Mulai Pomodoro →</button>
          </div>
          <div class="glass rounded-xl p-4">
            <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Quick Actions</p>
            <div class="grid grid-cols-3 gap-2 mt-2">
              <button onclick="switchTab('analyzer')" class="text-2xl hover:scale-110 transition" title="AI Analyzer">🧠</button>
              <button onclick="openQuickAdd()" class="text-2xl hover:scale-110 transition" title="Quick Add">⚡</button>
              <button onclick="switchTab('journal')" class="text-2xl hover:scale-110 transition" title="Journal">📓</button>
            </div>
          </div>
        </div>

        <div class="glass rounded-2xl p-5 fade-up">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">💡 Insight Hari Ini</p>
          <p id="quote-text" class="text-sm text-gray-200 italic leading-relaxed">Memuat...</p>
          <p id="quote-author" class="text-xs text-indigo-400 mt-2 font-semibold">— SparkMind</p>
        </div>
      </div>\`;
    setTimeout(() => {
      document.querySelectorAll('.counter').forEach((el, i) => setTimeout(() => el.classList.add('visible'), 60 * i));
      document.querySelectorAll('.fade-up').forEach((el, i) => setTimeout(() => el.classList.add('visible'), 50 * i));
    }, 30);
    fetch('/api/quotes').then(r => r.json()).then(q => {
      $('quote-text').textContent = '"' + q.text + '"';
      $('quote-author').textContent = '— ' + q.author;
    }).catch(() => {});
  }

  // ===== ANALYZER =====
  function renderAnalyzer() {
    $('content').innerHTML = \`
      <div class="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🧠 AI Strategic Analyzer</h1>
          <p class="text-xs text-gray-400">Tanya apa saja — 18+ kategori AI siap memandu. Memory tersimpan otomatis.</p>
        </div>
        <div id="chat-box" class="glass rounded-2xl p-4 h-[55vh] overflow-y-auto space-y-3"></div>
        <div class="flex gap-2">
          <input id="chat-input" type="text" placeholder="Tanya apa saja... (mis. cara mulai side hustle)" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="2000">
          <button id="chat-send" class="px-5 btn-primary text-white font-semibold rounded-xl"><i class="fas fa-paper-plane"></i></button>
        </div>
        <div class="flex items-center justify-between text-xs">
          <button onclick="clearChat()" class="text-gray-500 hover:text-rose-400"><i class="fas fa-trash mr-1"></i>Hapus chat</button>
          <span class="text-gray-500">\${state.chat.length} pesan tersimpan</span>
        </div>
      </div>\`;
    paintChat();
    $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    $('chat-send').addEventListener('click', sendChat);
    setTimeout(() => $('chat-input').focus(), 200);
  }

  function paintChat() {
    const box = $('chat-box');
    if (state.chat.length === 0) {
      box.innerHTML = \`<div class="text-center text-gray-500 text-sm py-12">
        <div class="text-4xl mb-3">💬</div>
        <p class="mb-2">Mulai percakapan strategis</p>
        <p class="text-xs">Coba: <i>"Bagaimana mulai side hustle freelance?"</i></p>
      </div>\`;
      return;
    }
    box.innerHTML = state.chat.map((msg, i) => msg.role === 'user'
      ? \`<div class="flex justify-end"><div class="bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-4 py-2.5 max-w-[80%] text-sm">\${escapeHtml(msg.content)}</div></div>\`
      : \`<div class="space-y-2"><div class="flex justify-start"><div class="glass rounded-xl px-4 py-3 max-w-[92%] text-sm">\${msg.content}</div></div>
         <div class="flex gap-2 ml-2"><button data-copy="\${i}" class="text-[11px] text-gray-500 hover:text-indigo-400"><i class="fas fa-copy mr-1"></i>Copy</button><button data-share="\${i}" class="text-[11px] text-gray-500 hover:text-indigo-400"><i class="fas fa-share mr-1"></i>Share</button><button data-savej="\${i}" class="text-[11px] text-gray-500 hover:text-rose-400"><i class="fas fa-book mr-1"></i>Save to Journal</button></div></div>\`
    ).join('');
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyAi(parseInt(b.dataset.copy))));
    box.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => shareAi(parseInt(b.dataset.share))));
    box.querySelectorAll('[data-savej]').forEach(b => b.addEventListener('click', () => saveAiToJournal(parseInt(b.dataset.savej))));
  }

  function copyAi(idx) {
    const msg = state.chat[idx]; if (!msg) return;
    const txt = msg.content.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\\s+/g, ' ').trim();
    navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard', 'success'));
  }
  function shareAi(idx) {
    const msg = state.chat[idx]; if (!msg) return;
    const txt = msg.content.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\\s+/g, ' ').trim();
    if (navigator.share) navigator.share({ title:'SparkMind AI', text: txt }).catch(()=>{});
    else { navigator.clipboard.writeText(txt); toast('Disalin (share API tidak tersedia)', 'info'); }
  }
  function saveAiToJournal(idx) {
    const msg = state.chat[idx]; if (!msg) return;
    const txt = msg.content.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\\s+/g, ' ').trim();
    state.journal.unshift({ id: Date.now(), text: '[AI Insight] ' + txt.slice(0, 800), mood:'💡', date: new Date().toISOString() });
    SAFE_LS.set(KEYS.journal, state.journal);
    toast('Tersimpan ke Journal', 'success');
  }
  window.copyAi = copyAi; window.shareAi = shareAi; window.saveAiToJournal = saveAiToJournal;

  async function sendChat() {
    const input = $('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    state.chat.push({ role:'user', content: msg });
    SAFE_LS.set(KEYS.chat, state.chat);
    paintChat();

    // typing indicator
    const box = $('chat-box');
    const typingId = 'typ-' + Date.now();
    const ti = document.createElement('div');
    ti.id = typingId;
    ti.className = 'flex justify-start';
    ti.innerHTML = '<div class="glass rounded-xl px-4 py-3 text-sm text-gray-400 typing">Berpikir</div>';
    box.appendChild(ti); box.scrollTop = box.scrollHeight;

    try {
      const r = await fetch('/api/analyze', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: msg, mode: state.chatMode, history: state.chat.slice(-6) }),
      });
      const data = await r.json();
      $(typingId)?.remove();
      if (!r.ok || data.error) throw new Error(data.error || 'AI gagal merespon');
      state.chat.push({ role:'ai', content: data.response });
      // Cap chat to last 50 msgs
      if (state.chat.length > 50) state.chat = state.chat.slice(-50);
      SAFE_LS.set(KEYS.chat, state.chat);
      paintChat(); logActivity();
    } catch (e) {
      $(typingId)?.remove();
      toast('Gagal: ' + (e.message || 'unknown'), 'error');
    }
  }
  function clearChat() {
    showConfirm({ title:'Hapus chat?', body:'Semua percakapan AI akan dihapus permanen.', danger:true, confirmText:'Hapus',
      onConfirm: () => { state.chat = []; SAFE_LS.set(KEYS.chat, []); paintChat(); toast('Chat dihapus', 'success'); }});
  }
  window.clearChat = clearChat;

  // ===== COACH =====
  function renderCoach() {
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🧭 AI Coach V6</h1>
          <p class="text-xs text-gray-400">Personal coaching dengan analisis goal, kondisi, hambatan.</p>
        </div>
        <div class="space-y-3">
          <input id="coach-goal" placeholder="Goal kamu (mis. naik gaji 50% dalam 12 bulan)" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="300">
          <textarea id="coach-state" placeholder="Kondisi saat ini..." rows="2" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="300"></textarea>
          <textarea id="coach-blockers" placeholder="3 hambatan utama..." rows="2" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="300"></textarea>
          <button id="coach-go" class="w-full py-3 btn-primary text-white font-semibold rounded-xl">Generate Coaching Plan <i class="fas fa-arrow-right ml-1"></i></button>
        </div>
        <div id="coach-result"></div>
      </div>\`;
    $('coach-go').addEventListener('click', getCoaching);
  }
  async function getCoaching() {
    const goal = $('coach-goal').value.trim();
    if (!goal) return toast('Goal wajib diisi', 'warn');
    const out = $('coach-result');
    out.innerHTML = '<div class="glass rounded-2xl p-5 text-center text-gray-400 text-sm typing">Coach sedang menyusun</div>';
    try {
      const r = await fetch('/api/coach', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ goal, currentState: $('coach-state').value, obstacles: $('coach-blockers').value })});
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'Coach error');
      out.innerHTML = \`<div class="glass rounded-2xl p-5">\${data.response}</div>\`;
      logActivity();
    } catch (e) { out.innerHTML = ''; toast('Gagal: ' + e.message, 'error'); }
  }

  // ===== SWOT =====
  function renderSWOT() {
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">📊 SWOT Analyzer</h1>
          <p class="text-xs text-gray-400">Generate analisis SWOT instan untuk bisnis/proyek/diri.</p>
        </div>
        <div class="flex gap-2">
          <input id="swot-input" type="text" placeholder="Bisnis/proyek (mis. Jasa desain freelance)" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="200">
          <button id="swot-go" class="px-5 btn-primary text-white font-semibold rounded-xl">Analisis</button>
        </div>
        <div id="swot-result"></div>
      </div>\`;
    $('swot-go').addEventListener('click', getSWOT);
    $('swot-input').addEventListener('keydown', e => { if (e.key === 'Enter') getSWOT(); });
  }
  async function getSWOT() {
    const v = $('swot-input').value.trim(); if (!v) return toast('Isi dulu', 'warn');
    const out = $('swot-result');
    out.innerHTML = '<div class="glass rounded-2xl p-5 text-center text-gray-400 text-sm typing">Menganalisis</div>';
    try {
      const r = await fetch('/api/swot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ business: v })});
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'SWOT error');
      out.innerHTML = \`<div class="glass rounded-2xl p-5">\${data.response}</div>\`;
      logActivity();
    } catch (e) { out.innerHTML = ''; toast('Gagal: ' + e.message, 'error'); }
  }

  // ===== POMODORO V2 (with persistent end-time) =====
  const POMO_PRESETS = { focus: 25, short: 5, long: 15 };
  function getPomoState() { return SAFE_LS.get(KEYS.pomoState, { mode:'focus', running:false, endAt:0, total:25*60, auto:false }); }
  function setPomoState(s) { SAFE_LS.set(KEYS.pomoState, s); }

  function renderPomodoro() {
    let s = getPomoState();
    const remaining = s.running ? Math.max(0, Math.round((s.endAt - Date.now())/1000)) : (s.total || POMO_PRESETS[s.mode]*60);
    const today = todayKey();
    if (state.pomo.lastDay !== today) state.pomo = { sessions:0, totalMin:0, lastDay: today };

    const pretty = sec => \`\${String(Math.floor(sec/60)).padStart(2,'0')}:\${String(sec%60).padStart(2,'0')}\`;
    $('content').innerHTML = \`
      <div class="max-w-md mx-auto space-y-5 text-center">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🍅 Pomodoro V2</h1>
          <p class="text-xs text-gray-400">Focus 25 · Break 5 · Long 15 — auto-resume saat pindah tab</p>
        </div>
        <div class="flex justify-center gap-2">
          \${[['focus','Focus','25'],['short','Break','5'],['long','Long','15']].map(([m,l,d]) =>
            \`<button data-pmode="\${m}" class="px-4 py-2 rounded-lg text-sm \${s.mode === m ? 'btn-primary text-white' : 'bg-white/5 hover:bg-white/10'}">\${l} \${d}</button>\`).join('')}
        </div>
        <div class="glass rounded-3xl p-10">
          <div id="pomo-display" class="text-7xl sm:text-8xl font-black font-mono gradient-text mb-2">\${pretty(remaining)}</div>
          <p class="text-xs text-gray-500 uppercase tracking-wider">\${s.mode === 'focus' ? '🔥 Deep Focus' : s.mode === 'short' ? '☕ Short Break' : '🌿 Long Break'}</p>
        </div>
        <div class="flex justify-center gap-2">
          <button id="pomo-toggle" class="px-6 py-2.5 btn-primary text-white font-semibold rounded-xl">\${s.running ? '⏸ Pause' : '▶ Start'}</button>
          <button id="pomo-reset" class="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm">Reset</button>
        </div>
        <label class="inline-flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input id="pomo-auto" type="checkbox" \${s.auto ? 'checked' : ''}> Auto-start sesi berikutnya
        </label>
        <div class="grid grid-cols-2 gap-3">
          <div class="glass rounded-xl p-3"><p class="text-xs text-gray-500">Sesi Hari Ini</p><p class="text-2xl font-black text-orange-400">\${state.pomo.sessions}</p></div>
          <div class="glass rounded-xl p-3"><p class="text-xs text-gray-500">Menit Fokus</p><p class="text-2xl font-black text-emerald-400">\${state.pomo.sessions * 25}</p></div>
        </div>
      </div>\`;

    document.querySelectorAll('[data-pmode]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.pmode;
      stopTick();
      setPomoState({ ...getPomoState(), mode: m, running: false, total: POMO_PRESETS[m]*60, endAt: 0 });
      renderPomodoro();
    }));
    $('pomo-toggle').addEventListener('click', togglePomo);
    $('pomo-reset').addEventListener('click', () => { stopTick(); setPomoState({ ...getPomoState(), running:false, endAt:0 }); renderPomodoro(); });
    $('pomo-auto').addEventListener('change', e => setPomoState({ ...getPomoState(), auto: e.target.checked }));

    // resume tick if running
    if (s.running) startTick();
  }
  function togglePomo() {
    let s = getPomoState();
    if (s.running) { s.running = false; s.total = Math.max(0, Math.round((s.endAt - Date.now())/1000)); stopTick(); }
    else { s.running = true; s.endAt = Date.now() + (s.total || POMO_PRESETS[s.mode]*60) * 1000; startTick(); }
    setPomoState(s);
    renderPomodoro();
  }
  function startTick() {
    stopTick();
    pomoTick = setInterval(() => {
      const s = getPomoState();
      if (!s.running) { stopTick(); return; }
      const remain = Math.max(0, Math.round((s.endAt - Date.now())/1000));
      if (state.activeTab === 'pomodoro' && $('pomo-display')) {
        $('pomo-display').textContent = \`\${String(Math.floor(remain/60)).padStart(2,'0')}:\${String(remain%60).padStart(2,'0')}\`;
      }
      if (remain <= 0) {
        stopTick();
        s.running = false; s.endAt = 0; s.total = POMO_PRESETS[s.mode]*60;
        setPomoState(s);
        if (s.mode === 'focus') {
          state.pomo.sessions += 1;
          state.pomo.totalMin += 25;
          state.pomo.lastDay = todayKey();
          SAFE_LS.set(KEYS.pomo, state.pomo);
        }
        showPomoComplete(s.mode);
      }
    }, 1000);
  }
  function stopTick() { if (pomoTick) { clearInterval(pomoTick); pomoTick = null; } }
  function showPomoComplete(mode) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = mode === 'focus' ? 880 : 660;
      g.gain.setValueAtTime(.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .8);
      o.start(); o.stop(ctx.currentTime + .8);
    } catch {}
    if ('vibrate' in navigator) try { navigator.vibrate([200, 100, 200]); } catch {}
    const next = mode === 'focus' ? 'short' : 'focus';
    openModal(\`<div class="glass rounded-2xl p-6 text-center">
      <div class="text-5xl mb-3">\${mode === 'focus' ? '🎉' : '🚀'}</div>
      <p class="text-xl font-bold mb-2">\${mode === 'focus' ? 'Sesi Selesai!' : 'Break Selesai!'}</p>
      <p class="text-sm text-gray-400 mb-5">\${mode === 'focus' ? 'Kerja bagus! Saatnya istirahat 5 menit.' : 'Saatnya kembali fokus!'}</p>
      <div class="flex gap-2 justify-center">
        <button onclick="closeModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">Tutup</button>
        <button id="pomo-next" class="px-4 py-2 btn-primary text-white rounded-lg text-sm font-semibold">Mulai \${next === 'focus' ? 'Fokus' : 'Break'}</button>
      </div></div>\`);
    setTimeout(() => $('pomo-next')?.addEventListener('click', () => {
      closeModal();
      const auto = getPomoState().auto;
      setPomoState({ mode: next, running: auto, total: POMO_PRESETS[next]*60, endAt: auto ? Date.now() + POMO_PRESETS[next]*60*1000 : 0, auto });
      if (state.activeTab === 'pomodoro') renderPomodoro();
      if (auto) startTick();
    }), 0);
    if (state.activeTab === 'pomodoro') renderPomodoro();
  }
  // Resume on load
  (function resumeIfRunning() { const s = getPomoState(); if (s.running && s.endAt > Date.now()) startTick(); })();

  // ===== JOURNAL =====
  const MOODS = ['😊','😐','😢','🔥','😴','💡'];
  function renderJournal() {
    $('content').innerHTML = \`
      <div class="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">📓 Journal</h1>
          <p class="text-xs text-gray-400">Catatan mood + refleksi harian. Tersimpan permanen.</p>
        </div>
        <div class="glass rounded-2xl p-4 space-y-3">
          <div class="flex gap-2 flex-wrap">
            \${MOODS.map(m => \`<button data-mood="\${m}" class="mood-btn text-2xl px-3 py-1.5 rounded-lg \${state.journalMood === m ? 'bg-indigo-500/30 ring-2 ring-indigo-500' : 'bg-white/5 hover:bg-white/10'}">\${m}</button>\`).join('')}
          </div>
          <textarea id="journal-input" rows="4" placeholder="Apa yang ada di pikiranmu?" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="3000">\${escapeHtml(state.journalDraft)}</textarea>
          <div class="flex justify-end gap-2">
            <button id="journal-clear" class="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm">Clear</button>
            <button id="journal-save" class="px-4 py-2 btn-primary text-white rounded-lg text-sm font-semibold">Simpan</button>
          </div>
        </div>
        <div id="journal-list" class="space-y-2"></div>
      </div>\`;
    document.querySelectorAll('.mood-btn').forEach(b => b.addEventListener('click', () => { state.journalMood = b.dataset.mood; renderJournal(); }));
    $('journal-input').addEventListener('input', e => { state.journalDraft = e.target.value; });
    $('journal-clear').addEventListener('click', () => { state.journalDraft = ''; state.journalMood = ''; renderJournal(); });
    $('journal-save').addEventListener('click', saveJournal);
    paintJournalList();
  }
  function paintJournalList() {
    $('journal-list').innerHTML = state.journal.length === 0
      ? '<p class="text-center text-gray-500 text-sm py-6">Belum ada entry</p>'
      : state.journal.map(j => \`<div class="glass rounded-xl p-4 group">
          <div class="flex items-start gap-3">
            <span class="text-2xl">\${j.mood || '📝'}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">\${escapeHtml(j.text)}</p>
              <p class="text-[10px] text-gray-500 mt-2">\${new Date(j.date).toLocaleString('id-ID')}</p>
            </div>
            <button data-jdel="\${j.id}" class="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-rose-400 p-1"><i class="fas fa-trash text-xs"></i></button>
          </div></div>\`).join('');
    $('journal-list').querySelectorAll('[data-jdel]').forEach(b => b.addEventListener('click', () => deleteJournal(parseInt(b.dataset.jdel))));
  }
  function saveJournal() {
    const txt = $('journal-input').value.trim();
    if (!txt) return toast('Tulis dulu', 'warn');
    if (!state.journalMood) return toast('Pilih mood dulu', 'warn');
    state.journal.unshift({ id: Date.now(), text: txt, mood: state.journalMood, date: new Date().toISOString() });
    if (state.journal.length > 200) state.journal = state.journal.slice(0, 200);
    SAFE_LS.set(KEYS.journal, state.journal);
    state.journalDraft = ''; state.journalMood = '';
    renderJournal(); logActivity();
    toast('Journal tersimpan', 'success');
  }
  function deleteJournal(id) {
    showConfirm({ title:'Hapus entry?', body:'Tidak bisa di-undo.', danger:true, confirmText:'Hapus',
      onConfirm: () => { state.journal = state.journal.filter(j => j.id !== id); SAFE_LS.set(KEYS.journal, state.journal); paintJournalList(); toast('Dihapus', 'success'); }});
  }

  // ===== GOALS =====
  function renderGoals() {
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🎯 Goal Tracker</h1>
          <p class="text-xs text-gray-400">Track progress dengan +10/-10/Done.</p>
        </div>
        <div class="flex gap-2">
          <input id="goal-input" placeholder="Goal baru..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="200">
          <button id="goal-add" class="px-4 btn-primary text-white rounded-xl">Tambah</button>
        </div>
        <div id="goal-list" class="space-y-2"></div>
      </div>\`;
    $('goal-add').addEventListener('click', addGoal);
    $('goal-input').addEventListener('keydown', e => { if (e.key === 'Enter') addGoal(); });
    paintGoals();
  }
  function paintGoals() {
    $('goal-list').innerHTML = state.goals.length === 0
      ? '<p class="text-center text-gray-500 text-sm py-6">Belum ada goal</p>'
      : state.goals.map(g => \`<div class="glass rounded-xl p-4 group">
          <div class="flex items-center justify-between mb-2">
            <p class="font-semibold text-sm \${g.progress >= 100 ? 'line-through text-emerald-400' : ''}">\${escapeHtml(g.title)}</p>
            <button data-gdel="\${g.id}" class="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-rose-400"><i class="fas fa-trash text-xs"></i></button>
          </div>
          <div class="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div class="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style="width:\${g.progress}%"></div>
          </div>
          <div class="flex items-center justify-between mt-3">
            <span class="text-xs text-gray-400">\${g.progress}%</span>
            <div class="flex gap-1">
              <button data-gdec="\${g.id}" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-xs">−10</button>
              <button data-ginc="\${g.id}" class="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-xs">+10</button>
              <button data-gdone="\${g.id}" class="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-xs">✓ Done</button>
            </div>
          </div></div>\`).join('');
    const list = $('goal-list');
    list.querySelectorAll('[data-gdel]').forEach(b => b.addEventListener('click', () => delGoal(parseInt(b.dataset.gdel))));
    list.querySelectorAll('[data-gdec]').forEach(b => b.addEventListener('click', () => updGoal(parseInt(b.dataset.gdec), -10)));
    list.querySelectorAll('[data-ginc]').forEach(b => b.addEventListener('click', () => updGoal(parseInt(b.dataset.ginc), 10)));
    list.querySelectorAll('[data-gdone]').forEach(b => b.addEventListener('click', () => updGoal(parseInt(b.dataset.gdone), 100, true)));
  }
  function addGoal() {
    const t = $('goal-input').value.trim(); if (!t) return;
    state.goals.unshift({ id: Date.now(), title: t, progress: 0 });
    SAFE_LS.set(KEYS.goals, state.goals); $('goal-input').value = ''; paintGoals(); logActivity();
  }
  function updGoal(id, delta, set=false) {
    const g = state.goals.find(x => x.id === id); if (!g) return;
    g.progress = set ? delta : Math.max(0, Math.min(100, g.progress + delta));
    SAFE_LS.set(KEYS.goals, state.goals); paintGoals();
    if (g.progress >= 100) toast('Selamat! Goal tercapai 🎉', 'success');
  }
  function delGoal(id) {
    showConfirm({ title:'Hapus goal?', body:'Tindakan permanen.', danger:true, confirmText:'Hapus',
      onConfirm: () => { state.goals = state.goals.filter(g => g.id !== id); SAFE_LS.set(KEYS.goals, state.goals); paintGoals(); toast('Dihapus', 'success'); }});
  }

  // ===== HABITS WITH HEATMAP =====
  function renderHabits() {
    $('content').innerHTML = \`
      <div class="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🔥 Habit Tracker</h1>
          <p class="text-xs text-gray-400">Daily check + streak counter + 30-day heatmap.</p>
        </div>
        <div class="flex gap-2">
          <input id="habit-input" placeholder="Habit baru (mis. Olahraga 30 menit)" class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" maxlength="100">
          <button id="habit-add" class="px-4 btn-primary text-white rounded-xl">Tambah</button>
        </div>
        <div id="habit-list" class="space-y-2"></div>
      </div>\`;
    $('habit-add').addEventListener('click', addHabit);
    $('habit-input').addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
    paintHabits();
  }
  function paintHabits() {
    const today = todayKey();
    $('habit-list').innerHTML = state.habits.length === 0
      ? '<p class="text-center text-gray-500 text-sm py-6">Belum ada habit</p>'
      : state.habits.map(h => {
        const checked = h.lastCheck === today;
        const days = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const k = d.toISOString().slice(0,10);
          const has = (h.history || []).includes(k);
          days.push({ k, has, label: d.toLocaleDateString('id-ID', { day:'numeric', month:'short' }) });
        }
        return \`<div class="glass rounded-xl p-4 group">
          <div class="flex items-center justify-between mb-3">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">\${escapeHtml(h.title)}</p>
              <p class="text-xs text-gray-500 mt-0.5">🔥 Streak: \${h.streak || 0} hari</p>
            </div>
            <div class="flex gap-1">
              <button data-hcheck="\${h.id}" class="px-3 py-1.5 \${checked ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/5 hover:bg-white/10'} rounded text-xs font-semibold">\${checked ? '✓ Done' : 'Check'}</button>
              <button data-hdel="\${h.id}" class="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-rose-400 p-1.5"><i class="fas fa-trash text-xs"></i></button>
            </div>
          </div>
          <div class="grid grid-cols-15 sm:grid-cols-30 gap-1" style="grid-template-columns:repeat(15,1fr)">
            \${days.map(d => \`<div class="heatmap-cell \${d.has ? 'heat-4' : ''}" title="\${d.label}\${d.has ? ' ✓' : ''}"></div>\`).join('')}
          </div>
          <p class="text-[10px] text-gray-500 mt-2">30 hari terakhir</p>
        </div>\`;
      }).join('');
    $('habit-list').querySelectorAll('[data-hcheck]').forEach(b => b.addEventListener('click', () => checkHabit(parseInt(b.dataset.hcheck))));
    $('habit-list').querySelectorAll('[data-hdel]').forEach(b => b.addEventListener('click', () => delHabit(parseInt(b.dataset.hdel))));
  }
  function addHabit() {
    const t = $('habit-input').value.trim(); if (!t) return;
    state.habits.unshift({ id: Date.now(), title: t, streak: 0, lastCheck: '', history: [] });
    SAFE_LS.set(KEYS.habits, state.habits); $('habit-input').value = ''; paintHabits(); logActivity();
  }
  function checkHabit(id) {
    const h = state.habits.find(x => x.id === id); if (!h) return;
    const today = todayKey();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if (h.lastCheck === today) return toast('Sudah dicheck hari ini', 'info');
    h.streak = h.lastCheck === yesterday ? (h.streak || 0) + 1 : 1;
    h.lastCheck = today;
    h.history = [...(h.history || []), today];
    SAFE_LS.set(KEYS.habits, state.habits);
    paintHabits(); logActivity();
    toast('Streak +1! 🔥', 'success');
  }
  function delHabit(id) {
    showConfirm({ title:'Hapus habit?', body:'Riwayat streak akan hilang.', danger:true, confirmText:'Hapus',
      onConfirm: () => { state.habits = state.habits.filter(h => h.id !== id); SAFE_LS.set(KEYS.habits, state.habits); paintHabits(); toast('Dihapus', 'success'); }});
  }

  // ===== VISION BOARD =====
  function renderVision() {
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">🎨 Vision Board</h1>
          <p class="text-xs text-gray-400">Big vision · 1 tahun · 3 bulan · 1 minggu</p>
        </div>
        \${[
          ['big','🌟 Big Vision (10 tahun)','Versi terbesar dari diri kamu...'],
          ['y1','📅 1 Tahun ke Depan','Apa yang akan tercapai...'],
          ['m3','🎯 3 Bulan ke Depan','Fokus 90 hari...'],
          ['w1','📝 Minggu Ini','Goal mingguan...'],
        ].map(([k,l,p]) => \`
          <div class="glass rounded-xl p-4">
            <p class="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">\${l}</p>
            <textarea data-vk="\${k}" rows="3" placeholder="\${p}" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" maxlength="500">\${escapeHtml(state.vision[k] || '')}</textarea>
          </div>\`).join('')}
        <button id="vision-save" class="w-full py-3 btn-primary text-white font-semibold rounded-xl">💾 Simpan Vision</button>
      </div>\`;
    $('vision-save').addEventListener('click', () => {
      document.querySelectorAll('[data-vk]').forEach(t => state.vision[t.dataset.vk] = t.value);
      SAFE_LS.set(KEYS.vision, state.vision);
      toast('Vision tersimpan', 'success'); logActivity();
    });
  }

  // ===== REVIEW =====
  function renderReview() {
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">📋 Weekly Review</h1>
          <p class="text-xs text-gray-400">Refleksi mingguan: wins, learnings, focus.</p>
        </div>
        \${[
          ['wins','🏆 3 Wins minggu ini'],
          ['learnings','💡 3 Pelajaran utama'],
          ['focus','🎯 Fokus minggu depan'],
        ].map(([k,l]) => \`
          <div class="glass rounded-xl p-4">
            <p class="text-xs text-gray-400 font-bold uppercase mb-2">\${l}</p>
            <textarea data-rk="\${k}" rows="3" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" maxlength="800">\${escapeHtml(state.review[k] || '')}</textarea>
          </div>\`).join('')}
        <button id="review-save" class="w-full py-3 btn-primary text-white font-semibold rounded-xl">💾 Simpan Review</button>
      </div>\`;
    $('review-save').addEventListener('click', () => {
      document.querySelectorAll('[data-rk]').forEach(t => state.review[t.dataset.rk] = t.value);
      SAFE_LS.set(KEYS.review, state.review);
      toast('Review tersimpan', 'success'); logActivity();
    });
  }

  // ===== RESOURCES =====
  let resourcesCache = null;
  let searchDebounce = null;
  function renderResources() {
    $('content').innerHTML = \`
      <div class="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">📚 Resources</h1>
          <p class="text-xs text-gray-400">21+ frameworks &amp; mental models. Search debounced 300ms.</p>
        </div>
        <input id="res-search" type="text" placeholder="Cari resource..." value="\${escapeHtml(state.searchTerm)}" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500">
        <div id="res-list" class="grid sm:grid-cols-2 gap-3"><p class="text-gray-500 text-sm text-center col-span-2 py-6">Loading...</p></div>
      </div>\`;
    $('res-search').addEventListener('input', e => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { state.searchTerm = e.target.value; paintResources(); }, 300);
    });
    if (resourcesCache) paintResources();
    else fetch('/api/resources').then(r => r.json()).then(d => { resourcesCache = d.resources; paintResources(); }).catch(() => toast('Gagal load resources', 'error'));
  }
  function paintResources() {
    if (!resourcesCache) return;
    const f = state.searchTerm.toLowerCase().trim();
    const filtered = resourcesCache.filter(r => !f || r.title.toLowerCase().includes(f) || r.cat.toLowerCase().includes(f) || r.desc.toLowerCase().includes(f));
    $('res-list').innerHTML = filtered.length === 0
      ? '<p class="text-gray-500 text-sm text-center col-span-2 py-6">Tidak ditemukan</p>'
      : filtered.map(r => \`<div class="glass rounded-xl p-4">
          <div class="flex items-start gap-3">
            <span class="text-3xl">\${r.icon}</span>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-sm">\${escapeHtml(r.title)}</p>
              <p class="text-[10px] text-indigo-400 uppercase tracking-wider mb-1.5">\${escapeHtml(r.cat)}</p>
              <p class="text-xs text-gray-400 leading-relaxed">\${r.desc}</p>
            </div>
          </div></div>\`).join('');
  }

  // ===== SETTINGS =====
  function renderSettings() {
    const dataSize = JSON.stringify(state).length;
    $('content').innerHTML = \`
      <div class="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 class="text-2xl font-black gradient-text mb-1">⚙️ Settings</h1>
          <p class="text-xs text-gray-400">Backup, restore, density, motion, reset.</p>
        </div>

        <div class="glass rounded-xl p-5">
          <p class="font-bold text-sm mb-2">💾 Data &amp; Backup</p>
          <p class="text-xs text-gray-500 mb-3">Total data: ~\${(dataSize/1024).toFixed(1)} KB · Goals: \${state.goals.length} · Habits: \${state.habits.length} · Journal: \${state.journal.length} · Chat: \${state.chat.length}</p>
          <div class="flex flex-wrap gap-2">
            <button id="export-btn" class="px-4 py-2 btn-primary text-white rounded-lg text-sm font-semibold"><i class="fas fa-download mr-1"></i>Export JSON</button>
            <button id="import-btn" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm"><i class="fas fa-upload mr-1"></i>Import JSON</button>
            <input id="import-file" type="file" accept=".json" class="hidden">
          </div>
        </div>

        <div class="glass rounded-xl p-5">
          <p class="font-bold text-sm mb-3">🎨 Appearance</p>
          <div class="space-y-2">
            <label class="flex items-center justify-between"><span class="text-sm">Theme</span>
              <button onclick="toggleTheme()" class="px-3 py-1.5 bg-white/5 rounded text-xs">\${state.theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</button></label>
            <label class="flex items-center justify-between"><span class="text-sm">Density</span>
              <select id="density-sel" class="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
                <option value="normal" \${state.density === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="compact" \${state.density === 'compact' ? 'selected' : ''}>Compact</option>
              </select></label>
          </div>
        </div>

        <div class="glass rounded-xl p-5">
          <p class="font-bold text-sm mb-2 text-rose-400">⚠️ Danger Zone</p>
          <p class="text-xs text-gray-500 mb-3">Hapus semua data. Tidak bisa di-undo. Export dulu untuk safety.</p>
          <button id="reset-btn" class="px-4 py-2 btn-danger text-white rounded-lg text-sm font-semibold"><i class="fas fa-trash mr-1"></i>Reset Semua Data</button>
        </div>

        <p class="text-center text-[10px] text-gray-600">SparkMind V7.3 PRODUCTION HARDENED · 2026 · Made with ❤️ in Indonesia · <a href="/clarity" class="text-violet-400 hover:text-violet-300">Clarity Coach</a> · <a href="/pricing" class="text-indigo-400 hover:text-indigo-300">Pricing</a> · <a href="/flow" class="text-emerald-400 hover:text-emerald-300">Payment Flow</a></p>
      </div>\`;
    $('export-btn').addEventListener('click', exportData);
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', importData);
    $('reset-btn').addEventListener('click', resetAll);
    $('density-sel').addEventListener('change', e => {
      state.density = e.target.value;
      SAFE_LS.set(KEYS.density, state.density);
      document.body.classList.toggle('density-compact', state.density === 'compact');
      toast('Density: ' + state.density, 'info');
    });
  }
  function exportData() {
    const data = {
      version:'6.0', exported: new Date().toISOString(),
      goals: state.goals, habits: state.habits, journal: state.journal,
      vision: state.vision, review: state.review, chat: state.chat,
      pomo: state.pomo, activity: state.activity,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = \`sparkmind-backup-\${todayKey()}.json\`;
    a.click(); URL.revokeObjectURL(url);
    toast('Backup ter-export', 'success');
  }
  window.exportData = exportData;
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        showConfirm({ title:'Import data?', body:'Data saat ini akan ditimpa. Pastikan kamu sudah backup.', confirmText:'Import',
          onConfirm: () => {
            if (Array.isArray(d.goals)) state.goals = d.goals;
            if (Array.isArray(d.habits)) state.habits = d.habits;
            if (Array.isArray(d.journal)) state.journal = d.journal;
            if (d.vision && typeof d.vision === 'object') state.vision = d.vision;
            if (d.review && typeof d.review === 'object') state.review = d.review;
            if (Array.isArray(d.chat)) state.chat = d.chat;
            if (d.pomo && typeof d.pomo === 'object') state.pomo = d.pomo;
            if (d.activity && typeof d.activity === 'object') state.activity = d.activity;
            SAFE_LS.set(KEYS.goals, state.goals); SAFE_LS.set(KEYS.habits, state.habits);
            SAFE_LS.set(KEYS.journal, state.journal); SAFE_LS.set(KEYS.vision, state.vision);
            SAFE_LS.set(KEYS.review, state.review); SAFE_LS.set(KEYS.chat, state.chat);
            SAFE_LS.set(KEYS.pomo, state.pomo); SAFE_LS.set(KEYS.activity, state.activity);
            renderActive(); toast('Data ter-import', 'success');
          }});
      } catch { toast('File tidak valid', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
  function resetAll() {
    showConfirm({ title:'Reset semua data?', body:'PERMANEN. Tidak bisa di-undo. Export backup dulu!', danger:true, confirmText:'YA, RESET',
      onConfirm: () => { Object.values(KEYS).forEach(k => SAFE_LS.del(k)); location.reload(); }});
  }

  // ===== ONBOARDING TOUR (first visit) =====
  function maybeShowTour() {
    if (SAFE_LS.get(KEYS.tour, false)) return;
    setTimeout(() => {
      openModal(\`<div class="glass rounded-2xl p-6">
        <div class="text-4xl mb-3 text-center">🚀</div>
        <p class="text-xl font-bold text-center mb-2">Selamat datang di SparkMind V6!</p>
        <p class="text-sm text-gray-400 text-center mb-5">5 hal yang harus kamu tahu:</p>
        <ul class="text-sm text-gray-300 space-y-2 mb-5">
          <li>🧠 <b>AI Analyzer</b> — tanya 18+ kategori (chat tersimpan)</li>
          <li>🍅 <b>Pomodoro V2</b> — auto-resume saat pindah tab</li>
          <li>🎯 <b>Goals + Habits</b> — track progress + heatmap 30 hari</li>
          <li>⌨️ <b>⌘K / ⌘N / ⌘D</b> — shortcuts power user</li>
          <li>📲 <b>Install ke home screen</b> — buka offline</li>
        </ul>
        <button id="tour-done" class="w-full py-2.5 btn-primary text-white rounded-lg text-sm font-semibold">Mulai 🚀</button>
      </div>\`);
      setTimeout(() => $('tour-done')?.addEventListener('click', () => { SAFE_LS.set(KEYS.tour, true); closeModal(); }), 0);
    }, 800);
  }

  // ===== INIT =====
  renderSidebar();
  renderActive();
  maybeShowTour();
  checkStorageQuota();

  // Resume pomodoro tick if active
  setTimeout(() => { const s = getPomoState(); if (s.running && s.endAt > Date.now()) startTick(); }, 50);

  // Re-render dashboard when tab regains focus (refresh trends)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.activeTab === 'pomodoro') renderPomodoro();
    if (!document.hidden && state.activeTab === 'dashboard') renderDashboard();
  });

  // Global error handler
  window.addEventListener('error', e => {
    console.error('Global error:', e.error);
    toast('Error: ' + (e.message || 'unknown'), 'error', 4000);
  });
  window.addEventListener('unhandledrejection', e => {
    console.error('Unhandled rejection:', e.reason);
    toast('Network error', 'error', 3000);
  });

  // Service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

  })(); // end IIFE
  </script>
</body>
</html>`

// ============================================
// AI CLARITY & RECOVERY COACH — RENDERING ENGINE (V7.0)
// Etika: probability language, no manipulation, boundary-first
// ============================================

function analyzeTone(draft: string): { needy: number; emotional: number; pressure: number; length: number } {
  const t = draft.toLowerCase()
  const needyHits = (t.match(/\b(plis|please|tolong|aku|kamu|kangen|rindu|sayang|maaf|maafin|please reply|please balas|jawab dong|kenapa diem|kenapa ga balas|knp|kok diem)\b/g) || []).length
  const exclam = (t.match(/!/g) || []).length
  const dots = (t.match(/\.{3,}/g) || []).length
  const emo = (t.match(/\b(gak bisa|nggak bisa|hancur|sakit|sepi|sedih|nangis|kecewa|takut|cemas|panik)\b/g) || []).length
  const pressureWords = (t.match(/\b(harus|wajib|cepat|sekarang juga|jangan diem|kenapa nggak|kenapa gak|jangan begini|aku capek nunggu)\b/g) || []).length
  const longRatio = Math.min(10, Math.round(draft.length / 80))
  return {
    needy: Math.min(10, needyHits + exclam * 0.5 + dots * 0.5),
    emotional: Math.min(10, emo * 1.5 + exclam * 0.4),
    pressure: Math.min(10, pressureWords * 1.5),
    length: longRatio,
  }
}

function decideVerdict(s: { needy: number; emotional: number; pressure: number; length: number }): { label: string; color: string; reason: string } {
  const total = s.needy + s.emotional + s.pressure
  if (total >= 14 || s.pressure >= 6) return { label: 'JANGAN KIRIM', color: 'red', reason: 'Tone-nya terlalu menekan/emosional. Tunggu 24 jam, lalu re-evaluasi.' }
  if (total >= 8 || s.needy >= 5) return { label: 'REVISI DULU', color: 'amber', reason: 'Masih terasa needy/intens. Bisa lebih dewasa & terukur.' }
  if (total <= 4 && s.length <= 6) return { label: 'BOLEH KIRIM', color: 'emerald', reason: 'Tone aman & proporsional. Tetap pertimbangkan timing.' }
  return { label: 'REVISI RINGAN', color: 'cyan', reason: 'Hampir oke — pendekkan & turunkan intensitas sedikit.' }
}

function renderCrisisBanner(c: { crisis: boolean; message?: string }): string {
  if (!c.crisis) return ''
  return `<div class="bg-rose-500/10 border border-rose-500/40 rounded-xl p-4 mb-3">
    <p class="text-[10px] font-bold uppercase tracking-wider text-rose-300 mb-2">⚠️ CRISIS DETECTED — PRIORITAS KESELAMATAN</p>
    <p class="text-sm text-gray-100 leading-relaxed">${c.message}</p>
  </div>`
}

function renderSituationDecode(story: string, blocked: boolean, crisis: { crisis: boolean; message?: string }): string {
  const safe = escClarity(story)
  const blockedBlock = blocked ? `
    <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
      <p class="text-[10px] font-bold uppercase tracking-wider text-red-300 mb-2">🚧 BOUNDARY DETECTED — MODE: NO-CONTACT</p>
      <p class="text-sm text-gray-200 leading-relaxed">Sistem mendeteksi indikasi kamu sudah <b>diblokir / di-mute / ghosting</b>. Mode no-contact aktif: <b>jangan hubungi via cara lain</b>. Hormati batasan. Fokus pada Recovery Plan.</p>
    </div>` : ''
  return `<div class="space-y-4">
    ${renderCrisisBanner(crisis)}
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-violet-500/15 text-violet-300 text-[10px] rounded-full border border-violet-500/30 font-bold uppercase tracking-wider">Situation Decoder</span></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-[10px] text-gray-500 uppercase mb-1">Cerita Kamu</p><p class="text-sm text-gray-200">"${safe}"</p></div>
    ${blockedBlock}
    <div class="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
      <p class="text-[10px] text-cyan-300 font-bold uppercase mb-2">📊 Pembacaan (Probabilistik)</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• <b>~50%</b> kemungkinan dia butuh ruang/sibuk — bukan tentang kamu</li>
        <li>• <b>~25%</b> kemungkinan ada masalah komunikasi yang belum dibahas</li>
        <li>• <b>~25%</b> kemungkinan dia memang menarik diri secara aktif</li>
      </ul>
      <p class="text-[10px] text-gray-500 italic mt-2">Probabilitas, bukan kepastian. Hanya dia yang tahu pasti.</p>
    </div>
    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
      <p class="text-[10px] text-emerald-300 font-bold uppercase mb-2">🎯 Action Plan Etis</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• <b>24-72 jam:</b> beri ruang. Jangan double-text atau cek profilnya berulang</li>
        <li>• <b>Refleksi:</b> apa yang sebenarnya kamu butuhkan dari dia?</li>
        <li>• <b>Kalau perlu:</b> 1 pesan singkat dewasa, tanpa tuntutan, tanpa emosi</li>
        <li>• <b>Bukan:</b> kejar, manipulasi, atau "test" dengan story sosmed</li>
      </ul>
    </div>
    <div class="text-[10px] text-gray-500 italic">⚠️ AI bantu refleksi, bukan baca pikiran orang. Keputusan tetap di kamu.</div>
  </div>`
}

function renderDraftReview(draft: string, scores: { needy: number; emotional: number; pressure: number; length: number }, verdict: { label: string; color: string; reason: string }): string {
  const safe = escClarity(draft)
  const bar = (label: string, val: number, color: string) => `
    <div class="space-y-1">
      <div class="flex justify-between text-[10px] uppercase tracking-wider"><span class="text-gray-400">${label}</span><span class="text-${color}-300 font-bold">${val.toFixed(1)}/10</span></div>
      <div class="h-2 bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-${color}-500 rounded-full" style="width:${val * 10}%"></div></div>
    </div>`
  return `<div class="space-y-4">
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-cyan-500/15 text-cyan-300 text-[10px] rounded-full border border-cyan-500/30 font-bold uppercase tracking-wider">Draft Review</span></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-[10px] text-gray-500 uppercase mb-1">Draft yang dianalisis</p><p class="text-sm text-gray-200 whitespace-pre-wrap">"${safe}"</p></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
      <p class="text-[10px] text-gray-300 font-bold uppercase">📊 Tone Score</p>
      ${bar('Needy', scores.needy, 'rose')}
      ${bar('Emotional', scores.emotional, 'amber')}
      ${bar('Pressure', scores.pressure, 'red')}
      ${bar('Length', scores.length, 'cyan')}
    </div>
    <div class="bg-${verdict.color}-500/10 border border-${verdict.color}-500/30 rounded-xl p-4">
      <p class="text-[10px] text-${verdict.color}-300 font-bold uppercase mb-1">🎯 VERDICT</p>
      <p class="text-2xl font-black text-${verdict.color}-300 mb-1.5">${verdict.label}</p>
      <p class="text-sm text-gray-200">${verdict.reason}</p>
    </div>
    <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
      <p class="text-[10px] text-indigo-300 font-bold uppercase mb-2">💡 Re-write Tips</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• Pendekkan: 1-3 kalimat cukup</li>
        <li>• Hilangkan "plis", "tolong balas", "kenapa diem"</li>
        <li>• Pakai "I-statement" (aku merasa...) bukan "you-statement" (kamu selalu...)</li>
        <li>• Tidak ada deadline ("balas hari ini ya")</li>
      </ul>
    </div>
  </div>`
}

function renderBoundaryChecker(story: string, blocked: boolean, crisis: { crisis: boolean; message?: string }): string {
  const safe = escClarity(story)
  const status = blocked
    ? { color: 'red', label: 'NO-CONTACT MODE AKTIF', desc: 'Sistem mendeteksi indikasi block/ghosting. Hormati batasan — jangan hubungi via cara lain.' }
    : { color: 'emerald', label: 'BOUNDARY OPEN', desc: 'Tidak ada indikasi block/mute. Komunikasi masih boleh, tapi tetap proporsional.' }
  return `<div class="space-y-4">
    ${renderCrisisBanner(crisis)}
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-red-500/15 text-red-300 text-[10px] rounded-full border border-red-500/30 font-bold uppercase tracking-wider">Boundary Checker</span></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-sm text-gray-200">"${safe}"</p></div>
    <div class="bg-${status.color}-500/10 border border-${status.color}-500/30 rounded-xl p-4">
      <p class="text-[10px] text-${status.color}-300 font-bold uppercase mb-1">Status</p>
      <p class="text-xl font-black text-${status.color}-300 mb-1.5">${status.label}</p>
      <p class="text-sm text-gray-200">${status.desc}</p>
    </div>
    ${blocked ? `<div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
      <p class="text-[10px] text-amber-300 font-bold uppercase mb-2">🚫 Yang TIDAK Boleh</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• Buat akun baru / DM via teman / kontak via aplikasi lain</li>
        <li>• Cek profilnya berulang (dari akun anonim sekalipun)</li>
        <li>• Story/post yang ditujukan ke dia (passive-aggressive)</li>
        <li>• Tanya teman dia tentang dia</li>
      </ul>
    </div>` : ''}
    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
      <p class="text-[10px] text-emerald-300 font-bold uppercase mb-2">✅ Yang DILAKUKAN</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• Mute/unfollow akunnya — kurangi exposure</li>
        <li>• Mulai Recovery Plan (cek tab Recovery)</li>
        <li>• Energi ke diri sendiri: olahraga, project, teman lain</li>
        <li>• Kalau berat, hubungi profesional</li>
      </ul>
    </div>
  </div>`
}

function renderRecoveryPlan(days: number, context: string): string {
  const ctx = context ? `<div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-[10px] text-gray-500 uppercase mb-1">Konteks</p><p class="text-sm text-gray-200">"${escClarity(context)}"</p></div>` : ''
  const phases: [string, string, string, string, string, string][] = days >= 30 ? [
    ['1-3','red','Detox','Tidur 8 jam, no-contact, sosmed off, hp di mode minim','Apa yang aku rasakan hari ini?','Detox 72 jam'],
    ['4-10','amber','Stabilisasi','Olahraga ringan, makan whole food, journaling pagi','Pelajaran apa dari ini?','Habit baru pagi'],
    ['11-21','cyan','Rebuild','Project pribadi, networking baru, skill upgrade','Versi terbaik aku?','1 win nyata'],
    ['22-30','emerald','Glow-up','Weekly Review aktif, hasil project di-publish, body goal','Aku sekarang vs 30 hari lalu — apa yang berubah?','Re-launch identitas digital'],
  ] : days >= 21 ? [
    ['1-3','red','Detox','Tidur cukup, no-contact, sosmed off','Apa yang aku rasakan?','Detox 48 jam'],
    ['4-10','amber','Stabilisasi','Olahraga, makan whole food, journal','Pelajaran apa?','Skill baru'],
    ['11-21','emerald','Rebuild','Project pribadi, network baru','Versi terbaik aku?','Comeback'],
  ] : [
    ['1-2','red','Reset','Tidur, no-contact, hp di mode minim','Apa rasanya hari ini?','Detox 24 jam'],
    ['3-5','amber','Stabilisasi','Olahraga ringan, journaling','Apa yang aku syukuri?','Habit pagi'],
    ['6-7','emerald','Re-focus','Pilih 1 goal kecil + jalani','Langkah pertama?','1 win nyata'],
  ]
  return `<div class="space-y-4">
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-emerald-500/15 text-emerald-300 text-[10px] rounded-full border border-emerald-500/30 font-bold uppercase tracking-wider">Recovery Plan ${days} Hari</span></div>
    ${ctx}
    <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
      <p class="text-[10px] text-indigo-300 font-bold uppercase mb-2">🎯 Tujuan</p>
      <p class="text-sm text-gray-200">Pulihkan ritme. Bangun ulang fokus. Tutup chapter dengan elegan. Bukan untuk membuktikan apa-apa ke siapa pun — untuk dirimu sendiri.</p>
    </div>
    <div class="space-y-2">
      ${phases.map(([range,color,title,habit,journal,goal], idx) => `
        <div class="bg-white/5 border border-${color}-500/20 rounded-xl p-4">
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p class="text-${color}-300 font-bold text-sm">Hari ${range} — ${title}</p>
            <span class="px-2 py-0.5 bg-${color}-500/10 text-${color}-300 text-[10px] rounded-full border border-${color}-500/20 font-bold">PHASE ${idx + 1}</span>
          </div>
          <div class="grid sm:grid-cols-3 gap-2 text-sm text-gray-200">
            <div><span class="text-[10px] text-gray-500 uppercase block">Habit</span>${habit}</div>
            <div><span class="text-[10px] text-gray-500 uppercase block">Journal Prompt</span>"${journal}"</div>
            <div><span class="text-[10px] text-gray-500 uppercase block">Mini Goal</span>${goal}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
      <p class="text-[10px] text-rose-300 font-bold uppercase mb-2">⚠️ Aturan Recovery</p>
      <ul class="text-sm text-gray-200 space-y-1.5">
        <li>• No-contact streak = non-negotiable</li>
        <li>• Setiap relapse (cek profilnya, dll) → reset hitungan ke H-1</li>
        <li>• Track di tab Habits SparkMind — gunakan heatmap</li>
        <li>• Setiap minggu: Weekly Review</li>
      </ul>
    </div>
  </div>`
}

function renderDecisionMode(story: string): string {
  const safe = escClarity(story)
  const blocked = detectBoundary(story)
  const recommend = blocked
    ? { label: 'MOVE ON TOTAL — Recovery Plan 30 Hari', color: 'red', reason: 'Block / ghosting = batasan. Hormati. Energimu lebih bernilai untuk dirimu sendiri.' }
    : { label: 'PAUSE 7 HARI + 1 PESAN DEWASA', color: 'amber', reason: 'Beri ruang dulu. Setelah 7 hari clarity, baru putuskan kirim 1 pesan singkat tanpa tuntutan, atau lanjut move on.' }
  return `<div class="space-y-4">
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-amber-500/15 text-amber-300 text-[10px] rounded-full border border-amber-500/30 font-bold uppercase tracking-wider">Decision Mode</span></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-sm text-gray-200">"${safe}"</p></div>
    <div class="bg-${recommend.color}-500/10 border border-${recommend.color}-500/30 rounded-xl p-4">
      <p class="text-[10px] text-${recommend.color}-300 font-bold uppercase mb-2">🎯 REKOMENDASI</p>
      <p class="text-xl font-black text-${recommend.color}-300 mb-1.5">${recommend.label}</p>
      <p class="text-sm text-gray-200">${recommend.reason}</p>
    </div>
    <p class="text-xs text-indigo-300 font-bold uppercase tracking-wider">5 Pilihan yang Tersedia</p>
    <div class="space-y-2">
      <div class="bg-white/5 border-l-2 border-emerald-500 p-3 rounded-r"><b class="text-emerald-300 text-sm">A. Lanjut Pelan</b><p class="text-sm text-gray-300 mt-0.5">Komunikasi normal, frequency rendah, tidak demanding. Pilih jika belum ada batasan jelas.</p></div>
      <div class="bg-white/5 border-l-2 border-cyan-500 p-3 rounded-r"><b class="text-cyan-300 text-sm">B. Kirim 1 Pesan Terakhir yang Sehat</b><p class="text-sm text-gray-300 mt-0.5">Closure singkat tanpa drama. Setelah itu lepas — apapun responnya.</p></div>
      <div class="bg-white/5 border-l-2 border-amber-500 p-3 rounded-r"><b class="text-amber-300 text-sm">C. Pause Total 7-14 Hari</b><p class="text-sm text-gray-300 mt-0.5">No-contact sementara. Pulihkan clarity. Re-evaluate setelah waktu habis.</p></div>
      <div class="bg-white/5 border-l-2 border-red-500 p-3 rounded-r"><b class="text-red-300 text-sm">D. Move On Total</b><p class="text-sm text-gray-300 mt-0.5">Trigger Recovery Plan 30 hari. Tutup chapter. Buka chapter baru tentang dirimu.</p></div>
      <div class="bg-white/5 border-l-2 border-violet-500 p-3 rounded-r"><b class="text-violet-300 text-sm">E. Fokus Diri 30 Hari</b><p class="text-sm text-gray-300 mt-0.5">Pause + glow-up plan. Bukan untuk balas dendam — untuk jadi versi terbaik dirimu.</p></div>
    </div>
    <div class="text-[10px] text-gray-500 italic">⚠️ Keputusan akhir tetap di tangan kamu. AI bantu refleksi, bukan menggantikan judgement kamu.</div>
  </div>`
}

function renderRelationshipSWOT(context: string): string {
  const safe = escClarity(context)
  return `<div class="space-y-4">
    <div class="flex items-center gap-2"><span class="px-2.5 py-1 bg-pink-500/15 text-pink-300 text-[10px] rounded-full border border-pink-500/30 font-bold uppercase tracking-wider">Relationship SWOT</span></div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-[10px] text-gray-500 uppercase mb-1">Konteks hubungan</p><p class="text-sm text-gray-200">"${safe}"</p></div>
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p class="text-[10px] text-emerald-300 font-bold uppercase mb-2">💪 Strengths</p><ul class="text-sm text-gray-200 space-y-1.5"><li>• Komunikasi awal terbuka</li><li>• Saling support pekerjaan</li><li>• Punya nilai/visi yang sejalan</li></ul></div>
      <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4"><p class="text-[10px] text-rose-300 font-bold uppercase mb-2">⚠️ Weaknesses</p><ul class="text-sm text-gray-200 space-y-1.5"><li>• Pola hot-cold belum dibahas</li><li>• Komunikasi konflik via chat</li><li>• Kurang quality time tanpa hp</li></ul></div>
      <div class="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4"><p class="text-[10px] text-cyan-300 font-bold uppercase mb-2">🚀 Opportunities</p><ul class="text-sm text-gray-200 space-y-1.5"><li>• Ngobrol terstruktur 1x/minggu</li><li>• Couple goal bareng</li><li>• Komitmen growth individu</li></ul></div>
      <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p class="text-[10px] text-amber-300 font-bold uppercase mb-2">🛡️ Threats</p><ul class="text-sm text-gray-200 space-y-1.5"><li>• Asumsi tanpa klarifikasi</li><li>• Pengaruh pihak ketiga</li><li>• Stress kerja merembes ke relasi</li></ul></div>
    </div>
    <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
      <p class="text-[10px] text-indigo-300 font-bold uppercase mb-2">🎯 Strategic Move</p>
      <p class="text-sm text-gray-200 leading-relaxed">Pakai <b>Strengths</b> untuk eksploitasi <b>Opportunities</b> (jadwal weekly check-in). Tutup <b>Weaknesses</b> dengan ngobrol langsung, bukan chat. Mitigasi <b>Threats</b> dengan boundary digital + komunikasi rutin.</p>
    </div>
  </div>`
}

// ============================================
// PAYMENT FLOW PAGE — Duitku Onboarding Doc #10
// "Alur/flow pembayaran pada website yang didaftarkan"
// Production-ready visual + textual documentation of the end-to-end payment journey.
// Route: /flow  (alias: /payment-flow)
// ============================================
const PAYMENT_FLOW_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alur Pembayaran — SparkMind × Duitku (Project D22457)</title>
  <meta name="description" content="Dokumentasi resmi alur/flow pembayaran website SparkMind (PT Cakrawarti Waskita Digital) — terintegrasi Duitku Payment Gateway. Untuk verifikasi onboarding Duitku Project Code D22457.">
  <meta name="robots" content="index,follow">
  <meta property="og:title" content="Alur Pembayaran SparkMind × Duitku">
  <meta property="og:description" content="End-to-end payment flow — pilih plan → checkout → Duitku gateway → callback → konfirmasi.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%234f46e5'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body{background:#0a0a1a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .step-card{background:linear-gradient(135deg,rgba(79,70,229,.08),rgba(168,85,247,.04));border:1px solid rgba(99,102,241,.25);border-radius:16px}
    .step-num{background:linear-gradient(135deg,#4f46e5,#a855f7);box-shadow:0 8px 24px rgba(79,70,229,.4)}
    .arrow{color:#6366f1}
    .mockup{background:#0f0f23;border:1px solid rgba(99,102,241,.3);border-radius:12px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:12px}
    .badge-ok{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
    .badge-info{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)}
    .badge-warn{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    .grid-flow{background-image:radial-gradient(rgba(99,102,241,.15) 1px,transparent 1px);background-size:24px 24px}
    @media print{body{background:#fff;color:#000} .no-print{display:none!important} .step-card{border-color:#999;background:#fff} .mockup{background:#f4f4f4;color:#000;border-color:#999} .step-num{background:#4f46e5!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    @keyframes flow{0%{stroke-dashoffset:40}100%{stroke-dashoffset:0}}
    .flow-line{stroke-dasharray:6 4;animation:flow 2s linear infinite}
  </style>
</head>
<body class="min-h-screen">
  <!-- HEADER -->
  <header class="border-b border-indigo-900/40 bg-[#0a0a1a]/95 backdrop-blur sticky top-0 z-30 no-print">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 font-bold">
        <span class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">S</span>
        <span>SparkMind</span>
      </a>
      <nav class="flex items-center gap-1 text-sm">
        <a href="/" class="hidden sm:inline-block px-3 py-1.5 rounded-lg hover:bg-white/5">Home</a>
        <a href="/pricing" class="hidden sm:inline-block px-3 py-1.5 rounded-lg hover:bg-white/5">Pricing</a>
        <a href="/flow" class="px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300"><i class="fas fa-route mr-1"></i>Flow</a>
        <a href="/email-duitku" class="px-3 py-1.5 rounded-lg hover:bg-white/5 text-amber-300"><i class="fas fa-envelope mr-1"></i>Email Draft</a>
        <button onclick="window.print()" class="ml-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs"><i class="fas fa-print mr-1"></i>Print / PDF</button>
      </nav>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-10">

    <!-- TITLE BLOCK -->
    <section class="mb-10">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full badge-info text-xs font-semibold mb-4">
        <i class="fas fa-shield-check"></i> DOKUMEN ONBOARDING DUITKU — POIN #10
      </div>
      <h1 class="text-4xl md:text-5xl font-bold mb-4 leading-tight">
        Alur / Flow Pembayaran<br>
        <span class="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">SparkMind × Duitku</span>
      </h1>
      <p class="text-gray-300 text-lg max-w-3xl leading-relaxed">
        Dokumentasi resmi end-to-end payment journey untuk website
        <a href="https://sparkmind-v2.pages.dev/" class="text-indigo-300 underline">https://sparkmind-v2.pages.dev/</a>
        — atas nama <b class="text-white">PT Cakrawarti Waskita Digital</b>,
        terintegrasi penuh dengan <b class="text-white">Duitku Payment Gateway</b> (Merchant Code D22457, mode production).
      </p>
      <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div class="step-card p-3"><div class="text-gray-400">Project Code</div><div class="font-bold text-white text-sm">D22457</div></div>
        <div class="step-card p-3"><div class="text-gray-400">Merchant</div><div class="font-bold text-white text-sm">PT Cakrawarti Waskita Digital</div></div>
        <div class="step-card p-3"><div class="text-gray-400">Gateway Mode</div><div class="font-bold text-emerald-400 text-sm">PRODUCTION (LIVE)</div></div>
        <div class="step-card p-3"><div class="text-gray-400">Last Updated</div><div class="font-bold text-white text-sm" id="lastUpdated">—</div></div>
      </div>

      <!-- QUICK ACTION BUTTONS -->
      <div class="mt-6 flex flex-wrap gap-2 no-print">
        <a href="/pricing" class="px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 text-sm font-medium transition"><i class="fas fa-tags mr-1.5"></i>Lihat Halaman Pricing (Live)</a>
        <a href="/email-duitku" class="px-4 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-200 text-sm font-medium transition"><i class="fas fa-envelope mr-1.5"></i>Email Draft untuk Tim Duitku</a>
        <button onclick="window.print()" class="px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-sm font-medium transition"><i class="fas fa-file-pdf mr-1.5"></i>Save as PDF</button>
        <a href="https://sparkmind-v2.pages.dev/flow" class="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition" target="_blank"><i class="fas fa-external-link-alt mr-1.5"></i>Production URL</a>
      </div>
    </section>

    <!-- TABLE OF CONTENTS -->
    <section class="mb-12 step-card p-6">
      <h2 class="text-lg font-bold mb-3 flex items-center gap-2"><i class="fas fa-list text-indigo-400"></i> Daftar Isi</h2>
      <div class="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <a href="#diagram" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§1</span>High-Level Flow Diagram</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
        <a href="#steps" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§2</span>Detail 6 Tahap Pembayaran</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
        <a href="#screenshots" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§3</span>Screenshot User Journey</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
        <a href="#security" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§4</span>Keamanan &amp; Tech Stack</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
        <a href="#endpoints" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§5</span>Endpoint Reference</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
        <a href="#merchant" class="text-gray-300 hover:text-indigo-300 py-1 flex justify-between"><span><span class="text-indigo-400 font-mono mr-2">§6</span>Informasi Merchant</span><i class="fas fa-chevron-right text-xs text-gray-600"></i></a>
      </div>
    </section>

    <!-- HIGH-LEVEL FLOW DIAGRAM -->
    <section id="diagram" class="mb-12 scroll-mt-24">
      <h2 class="text-2xl font-bold mb-2 flex items-center gap-2"><i class="fas fa-project-diagram text-indigo-400"></i> §1 · High-Level Flow Diagram</h2>
      <p class="text-gray-400 text-sm mb-5">Ringkasan visual 6 tahap utama. Detail teknis tiap tahap ada di bawah.</p>

      <div class="step-card p-6 grid-flow overflow-x-auto">
        <svg viewBox="0 0 980 240" class="w-full min-w-[860px]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#a855f7"/></linearGradient>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#a855f7"/>
            </marker>
          </defs>
          <!-- 6 nodes -->
          <g font-family="Inter,sans-serif" font-size="11" fill="#e5e7eb">
            <g><rect x="10"  y="90" width="140" height="60" rx="10" fill="url(#g1)"/><text x="80"  y="118" text-anchor="middle" font-weight="700">1. User</text><text x="80"  y="135" text-anchor="middle" font-size="10">Pilih Plan</text></g>
            <g><rect x="180" y="90" width="140" height="60" rx="10" fill="#1e1b4b" stroke="#6366f1"/><text x="250" y="118" text-anchor="middle" font-weight="700">2. SparkMind</text><text x="250" y="135" text-anchor="middle" font-size="10">/api/payment/create-invoice</text></g>
            <g><rect x="350" y="90" width="140" height="60" rx="10" fill="#1e1b4b" stroke="#6366f1"/><text x="420" y="118" text-anchor="middle" font-weight="700">3. Duitku API</text><text x="420" y="135" text-anchor="middle" font-size="10">Sign + Issue Token</text></g>
            <g><rect x="520" y="90" width="140" height="60" rx="10" fill="url(#g1)"/><text x="590" y="118" text-anchor="middle" font-weight="700">4. Duitku POP</text><text x="590" y="135" text-anchor="middle" font-size="10">VA / QRIS / E-wallet / CC</text></g>
            <g><rect x="690" y="90" width="140" height="60" rx="10" fill="#1e1b4b" stroke="#10b981"/><text x="760" y="118" text-anchor="middle" font-weight="700">5. Callback</text><text x="760" y="135" text-anchor="middle" font-size="10">IP+MD5+Idempotent</text></g>
            <g><rect x="850" y="90" width="120" height="60" rx="10" fill="#064e3b" stroke="#10b981"/><text x="910" y="118" text-anchor="middle" font-weight="700">6. Sukses</text><text x="910" y="135" text-anchor="middle" font-size="10">/payment/return</text></g>
          </g>
          <!-- arrows -->
          <g stroke="#a855f7" stroke-width="2" fill="none" marker-end="url(#arr)" class="flow-line">
            <line x1="150" y1="120" x2="178" y2="120"/>
            <line x1="320" y1="120" x2="348" y2="120"/>
            <line x1="490" y1="120" x2="518" y2="120"/>
            <line x1="660" y1="120" x2="688" y2="120"/>
            <line x1="830" y1="120" x2="848" y2="120"/>
          </g>
          <!-- labels -->
          <g font-family="Inter,sans-serif" font-size="9" fill="#9ca3af" text-anchor="middle">
            <text x="164" y="110">POST plan</text>
            <text x="334" y="110">SHA256 sig</text>
            <text x="504" y="110">paymentUrl</text>
            <text x="674" y="110">notify</text>
            <text x="840" y="110">redirect</text>
          </g>
        </svg>
      </div>
    </section>

    <!-- DETAILED STEPS -->
    <section id="steps" class="mb-12 scroll-mt-24">
      <h2 class="text-2xl font-bold mb-6 flex items-center gap-2"><i class="fas fa-list-ol text-indigo-400"></i> §2 · Detail 6 Tahap Pembayaran</h2>

      <!-- STEP 1 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">1</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">User Memilih Plan di Halaman Pricing</h3>
            <p class="text-gray-400 text-sm mb-3">User mengakses <code class="text-indigo-300">/pricing</code> dan memilih salah satu paket berlangganan SparkMind.</p>
            <ul class="text-sm text-gray-300 space-y-1 mb-4 list-disc pl-5">
              <li>Plan tersedia: <b>Pro Monthly (Rp 49.000)</b>, <b>Pro Yearly (Rp 470.000)</b>, <b>Team (Rp 745.000)</b>, <b>Lifetime (Rp 1.490.000)</b>, dan paket Clarity Coach.</li>
              <li>Daftar harga di-<b>hardcode di server</b> (<code class="text-indigo-300">PRICING_PLANS</code>) untuk mencegah price tampering dari client.</li>
              <li>User klik tombol <b>"Bayar Sekarang"</b> → memicu request ke API SparkMind.</li>
            </ul>
            <div class="mockup p-4 text-gray-300">
              <div class="text-emerald-400 mb-2">// Endpoint katalog plan (publik, read-only)</div>
              GET https://sparkmind-v2.pages.dev/api/payment/plans
            </div>
          </div>
        </div>
      </article>

      <!-- STEP 2 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">2</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">SparkMind Server Membuat Invoice</h3>
            <p class="text-gray-400 text-sm mb-3">Cloudflare Worker (Hono) menerima request, validasi plan, generate <code>merchantOrderId</code> unik, dan men-sign request dengan <b>SHA256</b>.</p>
            <ul class="text-sm text-gray-300 space-y-1 mb-4 list-disc pl-5">
              <li>Endpoint: <code class="text-indigo-300">POST /api/payment/create-invoice</code></li>
              <li>Body: <code>{ "planId": "pro-monthly", "customerEmail": "...", "customerName": "..." }</code></li>
              <li>Server menghitung signature: <code>SHA256(merchantCode + merchantOrderId + amount + apiKey)</code></li>
              <li><b>callbackUrl</b> & <b>returnUrl</b> di-set ke domain canonical <code>https://sparkmind-v2.pages.dev</code>.</li>
            </ul>
            <div class="mockup p-4 text-gray-300">
              <div class="text-emerald-400 mb-1">// Request ke Duitku</div>
              POST https://passport.duitku.com/webapi/api/merchant/v2/inquiry<br>
              <span class="text-indigo-300">{</span><br>
              &nbsp;&nbsp;"merchantCode": "D22457",<br>
              &nbsp;&nbsp;"paymentAmount": 49000,<br>
              &nbsp;&nbsp;"merchantOrderId": "SM-1735000000-AB12CD",<br>
              &nbsp;&nbsp;"productDetails": "SparkMind Pro - 1 bulan langganan",<br>
              &nbsp;&nbsp;"signature": "&lt;sha256 hex&gt;",<br>
              &nbsp;&nbsp;"callbackUrl": "https://sparkmind-v2.pages.dev/api/payment/callback",<br>
              &nbsp;&nbsp;"returnUrl":   "https://sparkmind-v2.pages.dev/payment/return"<br>
              <span class="text-indigo-300">}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- STEP 3 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">3</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">Duitku API Mengembalikan Payment Token</h3>
            <p class="text-gray-400 text-sm mb-3">Duitku memvalidasi signature, membuat invoice di sistemnya, lalu mengembalikan <code>reference</code> + <code>paymentUrl</code>.</p>
            <ul class="text-sm text-gray-300 space-y-1 mb-4 list-disc pl-5">
              <li>SparkMind menerima response dari Duitku (HTTP 200).</li>
              <li>Server me-relay <code>paymentUrl</code> ke browser user (sebagai JSON).</li>
              <li>Browser user otomatis open Duitku Pop-up Payment Page (atau redirect penuh sebagai fallback).</li>
            </ul>
          </div>
        </div>
      </article>

      <!-- STEP 4 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">4</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">User Memilih Metode & Membayar di Duitku Pop</h3>
            <p class="text-gray-400 text-sm mb-3">Halaman Duitku menampilkan semua metode yang tersedia. User memilih satu dan menyelesaikan pembayaran.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <div class="bg-white/5 rounded-lg p-3 text-center text-xs"><i class="fas fa-university text-indigo-400 text-xl mb-1"></i><div>Virtual Account<br><span class="text-gray-400">BCA, BNI, BRI, Mandiri, Permata</span></div></div>
              <div class="bg-white/5 rounded-lg p-3 text-center text-xs"><i class="fas fa-qrcode text-emerald-400 text-xl mb-1"></i><div>QRIS<br><span class="text-gray-400">Semua bank/e-wallet QRIS</span></div></div>
              <div class="bg-white/5 rounded-lg p-3 text-center text-xs"><i class="fas fa-wallet text-amber-400 text-xl mb-1"></i><div>E-Wallet<br><span class="text-gray-400">OVO, DANA, ShopeePay, LinkAja</span></div></div>
              <div class="bg-white/5 rounded-lg p-3 text-center text-xs"><i class="fas fa-credit-card text-rose-400 text-xl mb-1"></i><div>Credit Card<br><span class="text-gray-400">Visa / Mastercard / JCB</span></div></div>
            </div>
            <p class="text-xs text-gray-500"><i class="fas fa-info-circle"></i> Pembayaran ditangani 100% di environment Duitku — SparkMind tidak menyimpan data kartu / OTP / PIN apapun (PCI-DSS scope reduction).</p>
          </div>
        </div>
      </article>

      <!-- STEP 5 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">5</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">Callback Duitku → SparkMind (Server-to-Server)</h3>
            <p class="text-gray-400 text-sm mb-3">Setelah pembayaran berhasil, Duitku mengirim notifikasi async ke <code>callbackUrl</code> kami. Endpoint ini di-<b>harden</b> dengan 3 lapis keamanan:</p>
            <div class="grid md:grid-cols-3 gap-3 mb-4">
              <div class="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 text-xs">
                <div class="font-bold text-emerald-400 mb-1"><i class="fas fa-shield-alt"></i> Layer 1 — IP Whitelist</div>
                <p class="text-gray-300">Hanya 9 IP production Duitku (182.23.85.x & 103.177.101.x) yang diizinkan via <code>CF-Connecting-IP</code>.</p>
              </div>
              <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-xs">
                <div class="font-bold text-blue-400 mb-1"><i class="fas fa-fingerprint"></i> Layer 2 — MD5 Signature</div>
                <p class="text-gray-300">Verifikasi <code>MD5(merchantCode + amount + merchantOrderId + apiKey)</code> sesuai docs Duitku.</p>
              </div>
              <div class="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-xs">
                <div class="font-bold text-purple-400 mb-1"><i class="fas fa-redo"></i> Layer 3 — Idempotent</div>
                <p class="text-gray-300">In-memory cache mencegah double-processing kalau Duitku retry karena timeout.</p>
              </div>
            </div>
            <div class="mockup p-4 text-gray-300">
              <div class="text-emerald-400 mb-1">// Callback yang diterima SparkMind</div>
              POST https://sparkmind-v2.pages.dev/api/payment/callback<br>
              Content-Type: application/x-www-form-urlencoded<br><br>
              merchantCode=D22457&amp;amount=49000&amp;merchantOrderId=SM-...<br>
              &amp;reference=DXXXXXX&amp;resultCode=00&amp;signature=&lt;md5&gt;
            </div>
          </div>
        </div>
      </article>

      <!-- STEP 6 -->
      <article class="step-card p-6 mb-5">
        <div class="flex items-start gap-4">
          <div class="step-num w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0">6</div>
          <div class="flex-1">
            <h3 class="text-xl font-bold mb-1">User Diarahkan ke Halaman Konfirmasi</h3>
            <p class="text-gray-400 text-sm mb-3">Setelah Duitku selesai memproses, user di-redirect ke <code>/payment/return</code> dengan parameter <code>resultCode</code>.</p>
            <ul class="text-sm text-gray-300 space-y-1 mb-3 list-disc pl-5">
              <li><b>resultCode=00</b> → halaman <span class="badge-ok px-2 py-0.5 rounded text-xs">SUKSES</span> (akun di-upgrade ke Pro/Team/Lifetime).</li>
              <li><b>resultCode=01</b> → halaman <span class="badge-warn px-2 py-0.5 rounded text-xs">PENDING / GAGAL</span> dengan tombol coba lagi.</li>
              <li>Email konfirmasi otomatis dikirim ke user (subject: "Pembayaran SparkMind berhasil").</li>
            </ul>
            <p class="text-xs text-gray-500"><i class="fas fa-clock"></i> Polling tambahan ke <code>/api/payment/status/:merchantOrderId</code> dipakai sebagai safety-net jika callback delay.</p>
          </div>
        </div>
      </article>
    </section>

    <!-- SCREENSHOT GRID -->
    <section id="screenshots" class="mb-12 scroll-mt-24">
      <h2 class="text-2xl font-bold mb-2 flex items-center gap-2"><i class="fas fa-images text-indigo-400"></i> §3 · Screenshot User Journey</h2>
      <p class="text-gray-400 text-sm mb-5">Mockup tiap tahap (bisa diklik untuk akses langsung halaman live).</p>
      <div class="grid md:grid-cols-3 gap-4">
        <a href="/pricing" target="_blank" class="step-card p-4 hover:border-indigo-500 transition">
          <div class="aspect-video bg-gradient-to-br from-indigo-900/40 to-purple-900/30 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-tags text-4xl text-indigo-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 1</div>
          <div class="font-bold">Halaman Pricing</div>
          <div class="text-xs text-indigo-300 mt-1">/pricing →</div>
        </a>
        <div class="step-card p-4">
          <div class="aspect-video bg-gradient-to-br from-emerald-900/30 to-teal-900/20 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-receipt text-4xl text-emerald-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 2-3</div>
          <div class="font-bold">Invoice Generated</div>
          <div class="text-xs text-emerald-300 mt-1">SparkMind ↔ Duitku API</div>
        </div>
        <div class="step-card p-4">
          <div class="aspect-video bg-gradient-to-br from-amber-900/30 to-orange-900/20 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-mobile-alt text-4xl text-amber-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 4</div>
          <div class="font-bold">Duitku Pop Payment</div>
          <div class="text-xs text-amber-300 mt-1">VA / QRIS / E-wallet / CC</div>
        </div>
        <div class="step-card p-4">
          <div class="aspect-video bg-gradient-to-br from-blue-900/30 to-cyan-900/20 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-bell text-4xl text-blue-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 5</div>
          <div class="font-bold">Callback Diterima</div>
          <div class="text-xs text-blue-300 mt-1">/api/payment/callback</div>
        </div>
        <a href="/payment/return?resultCode=00&merchantOrderId=DEMO" target="_blank" class="step-card p-4 hover:border-emerald-500 transition">
          <div class="aspect-video bg-gradient-to-br from-emerald-900/40 to-green-900/30 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-check-circle text-4xl text-emerald-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 6 (Sukses)</div>
          <div class="font-bold">Konfirmasi SUKSES</div>
          <div class="text-xs text-emerald-300 mt-1">/payment/return →</div>
        </a>
        <a href="/payment/return?resultCode=01&merchantOrderId=DEMO" target="_blank" class="step-card p-4 hover:border-rose-500 transition">
          <div class="aspect-video bg-gradient-to-br from-rose-900/40 to-red-900/30 rounded-lg flex items-center justify-center mb-3"><i class="fas fa-times-circle text-4xl text-rose-400"></i></div>
          <div class="text-xs text-gray-400 mb-1">Step 6 (Gagal)</div>
          <div class="font-bold">Konfirmasi GAGAL</div>
          <div class="text-xs text-rose-300 mt-1">/payment/return →</div>
        </a>
      </div>
    </section>

    <!-- COMPLIANCE & TECH STACK -->
    <section id="security" class="mb-12 grid md:grid-cols-2 gap-5 scroll-mt-24">
      <h2 class="text-2xl font-bold mb-0 flex items-center gap-2 md:col-span-2"><i class="fas fa-shield-halved text-indigo-400"></i> §4 · Keamanan &amp; Tech Stack</h2>
      <div class="step-card p-6">
        <h3 class="text-lg font-bold mb-3"><i class="fas fa-shield-alt text-emerald-400"></i> Keamanan & Compliance</h3>
        <ul class="text-sm text-gray-300 space-y-2 list-disc pl-5">
          <li>HTTPS-only (TLS 1.3) di seluruh endpoint via Cloudflare.</li>
          <li>Tidak ada data kartu kredit / PIN / OTP yang disimpan di server SparkMind (PCI-DSS scope reduction — Duitku adalah PCI-DSS Level 1 Service Provider).</li>
          <li>Server-side pricing catalog (tidak bisa di-tamper dari browser).</li>
          <li>Callback hardening: IP whitelist + MD5 signature + idempotent processing.</li>
          <li>API key disimpan sebagai Cloudflare Secret (<code>wrangler pages secret put</code>) — tidak ada di repo.</li>
          <li>Domain canonical lock untuk callback / return URL — mencegah hijack via preview deployment.</li>
        </ul>
      </div>
      <div class="step-card p-6">
        <h3 class="text-lg font-bold mb-3"><i class="fas fa-cogs text-indigo-400"></i> Tech Stack</h3>
        <ul class="text-sm text-gray-300 space-y-2 list-disc pl-5">
          <li><b>Frontend:</b> HTML5 + Tailwind CSS (CDN) + Vanilla JS</li>
          <li><b>Backend:</b> Hono framework di Cloudflare Workers (edge, global)</li>
          <li><b>Hosting:</b> Cloudflare Pages — <code>https://sparkmind-v2.pages.dev</code></li>
          <li><b>Payment Gateway:</b> Duitku (Bank Indonesia licensed) — Merchant <b>D22457</b></li>
          <li><b>Auth Signing:</b> Web Crypto API (SHA256) untuk request, MD5 untuk callback verify</li>
          <li><b>Storage:</b> Cloudflare KV (planned, untuk subscription state durable)</li>
        </ul>
      </div>
    </section>

    <!-- ENDPOINT REFERENCE TABLE -->
    <section id="endpoints" class="mb-12 scroll-mt-24">
      <h2 class="text-2xl font-bold mb-4 flex items-center gap-2"><i class="fas fa-network-wired text-indigo-400"></i> §5 · Endpoint Reference</h2>
      <div class="step-card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-white/5">
            <tr class="text-left">
              <th class="p-3 font-semibold">Method</th>
              <th class="p-3 font-semibold">Path</th>
              <th class="p-3 font-semibold">Tujuan</th>
              <th class="p-3 font-semibold">Auth</th>
            </tr>
          </thead>
          <tbody class="text-gray-300">
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-info px-2 py-0.5 rounded text-xs">GET</span></td><td class="p-3 font-mono text-xs">/pricing</td><td class="p-3">Halaman pilihan plan</td><td class="p-3 text-gray-500">Public</td></tr>
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-info px-2 py-0.5 rounded text-xs">GET</span></td><td class="p-3 font-mono text-xs">/api/payment/plans</td><td class="p-3">Katalog plan (JSON)</td><td class="p-3 text-gray-500">Public</td></tr>
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-warn px-2 py-0.5 rounded text-xs">POST</span></td><td class="p-3 font-mono text-xs">/api/payment/create-invoice</td><td class="p-3">Membuat invoice + sign request ke Duitku</td><td class="p-3 text-gray-500">Public (rate-limited)</td></tr>
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-warn px-2 py-0.5 rounded text-xs">POST</span></td><td class="p-3 font-mono text-xs">/api/payment/callback</td><td class="p-3">Notifikasi async dari Duitku</td><td class="p-3"><span class="badge-ok px-2 py-0.5 rounded text-xs">IP+MD5+Idempotent</span></td></tr>
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-info px-2 py-0.5 rounded text-xs">GET</span></td><td class="p-3 font-mono text-xs">/api/payment/status/:id</td><td class="p-3">Polling status order (safety-net)</td><td class="p-3 text-gray-500">Public</td></tr>
            <tr class="border-t border-white/5"><td class="p-3"><span class="badge-info px-2 py-0.5 rounded text-xs">GET</span></td><td class="p-3 font-mono text-xs">/payment/return</td><td class="p-3">Halaman konfirmasi pasca-bayar</td><td class="p-3 text-gray-500">Public</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- CONTACT FOOTER -->
    <section id="merchant" class="step-card p-6 mb-10 scroll-mt-24">
      <h3 class="text-lg font-bold mb-3"><i class="fas fa-building text-indigo-400"></i> §6 · Informasi Merchant</h3>
      <div class="grid md:grid-cols-2 gap-3 text-sm text-gray-300">
        <div><b class="text-white">Nama:</b> PT Cakrawarti Waskita Digital</div>
        <div><b class="text-white">Project Code:</b> D22457</div>
        <div><b class="text-white">Website:</b> <a class="text-indigo-300 underline" href="https://sparkmind-v2.pages.dev/">https://sparkmind-v2.pages.dev/</a></div>
        <div><b class="text-white">Payment Gateway:</b> Duitku (Bank Indonesia licensed)</div>
        <div><b class="text-white">Mode:</b> <span class="badge-ok px-2 py-0.5 rounded text-xs">PRODUCTION (LIVE)</span></div>
        <div><b class="text-white">Dokumen ini:</b> <code>/flow</code> (alias: <code>/payment-flow</code>)</div>
      </div>
      <p class="text-xs text-gray-500 mt-4 leading-relaxed">
        Dokumen ini disusun untuk memenuhi persyaratan onboarding Duitku poin #10 — "Alur/flow pembayaran pada website yang didaftarkan".
        Halaman ini bersifat publik &amp; dapat dicetak (<i class="fas fa-print"></i> Print / PDF di kanan atas) untuk dilampirkan sebagai PDF dalam balasan email kepada Tim Onboarding Duitku.
      </p>
    </section>

    <!-- NEXT STEP CTA — Email Draft -->
    <section class="mb-10 step-card p-6 border-2 border-amber-500/30 bg-gradient-to-br from-amber-900/10 to-orange-900/5 no-print">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-envelope text-white text-xl"></i>
        </div>
        <div class="flex-1">
          <div class="text-xs text-amber-300 font-bold uppercase tracking-wider mb-1">Next Step</div>
          <h3 class="text-xl font-bold mb-2">Balas Email Tim Onboarding Duitku</h3>
          <p class="text-sm text-gray-300 mb-4 leading-relaxed">
            Setelah PDF dokumen ini di-save, lanjut ke halaman <b class="text-white">Email Draft</b> — sudah disiapkan template balasan profesional untuk Tim Onboarding Duitku, lengkap dengan checklist 10 dokumen legalitas (KTP, NIB, NPWP, Akta, Foto Lokasi, Rekening, Flow Pembayaran, dst.) yang tinggal di-copy &amp; isi placeholder.
          </p>
          <div class="flex flex-wrap gap-2">
            <a href="/email-duitku" class="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-semibold transition shadow-lg shadow-amber-500/20"><i class="fas fa-arrow-right mr-1.5"></i>Buka Email Draft</a>
            <a href="/pricing" class="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition"><i class="fas fa-tags mr-1.5"></i>Test Live Pricing</a>
          </div>
        </div>
      </div>
    </section>

  </main>

  <footer class="border-t border-indigo-900/40 py-6 text-center text-xs text-gray-500 no-print">
    © <span id="yr"></span> PT Cakrawarti Waskita Digital · SparkMind × Duitku · Project D22457
  </footer>

  <script>
    document.getElementById('yr').textContent = new Date().getFullYear();
    document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString('id-ID',{year:'numeric',month:'long',day:'numeric'});
  </script>
</body>
</html>`

// ============================================
// EMAIL DUITKU PAGE — Draft email balasan ke Tim Onboarding Duitku
// + Checklist 10 dokumen legalitas (KTP, NIB, NPWP, Akta, Foto Lokasi, dst.)
// + Anti-phishing red-flag check
// Route: /email-duitku  (alias: /duitku-email)
// ============================================
const EMAIL_DUITKU_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email Draft — Tim Onboarding Duitku (Project D22457)</title>
  <meta name="description" content="Draft email balasan profesional ke Tim Onboarding Duitku + checklist 10 dokumen legalitas PT Cakrawarti Waskita Digital. Copy-paste ready.">
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23f59e0b'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3E%E2%9C%89%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body{background:#0a0a1a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .card{background:linear-gradient(135deg,rgba(245,158,11,.06),rgba(168,85,247,.04));border:1px solid rgba(245,158,11,.2);border-radius:16px}
    .email-box{background:#0f0f23;border:1px solid rgba(245,158,11,.3);border-radius:12px;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;color:#e5e7eb;white-space:pre-wrap;word-break:break-word}
    .badge-ok{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
    .badge-warn{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    .badge-info{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)}
    .badge-rose{background:rgba(244,63,94,.15);color:#fb7185;border:1px solid rgba(244,63,94,.3)}
    @media print{body{background:#fff;color:#000} .no-print{display:none!important} .card{border-color:#ccc;background:#fafafa} .email-box{background:#f4f4f4;color:#000;border-color:#999}}
    .checklist-item:hover{background:rgba(255,255,255,.03)}
    .copied-flash{animation:flash 1s ease-out}
    @keyframes flash{0%{background:rgba(16,185,129,.4)} 100%{background:transparent}}
  </style>
</head>
<body class="min-h-screen">
  <header class="border-b border-amber-900/40 bg-[#0a0a1a]/95 backdrop-blur sticky top-0 z-30 no-print">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 font-bold">
        <span class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">S</span>
        <span>SparkMind</span>
      </a>
      <nav class="flex items-center gap-1 text-sm">
        <a href="/" class="hidden sm:inline-block px-3 py-1.5 rounded-lg hover:bg-white/5">Home</a>
        <a href="/flow" class="px-3 py-1.5 rounded-lg hover:bg-white/5 text-emerald-300"><i class="fas fa-route mr-1"></i>Flow</a>
        <a href="/email-duitku" class="px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-300"><i class="fas fa-envelope mr-1"></i>Email Draft</a>
        <a href="/pricing" class="hidden sm:inline-block px-3 py-1.5 rounded-lg hover:bg-white/5">Pricing</a>
        <button onclick="window.print()" class="ml-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs"><i class="fas fa-print mr-1"></i>Print / PDF</button>
      </nav>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-10">

    <!-- TITLE -->
    <section class="mb-8">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full badge-warn text-xs font-semibold mb-4">
        <i class="fas fa-paper-plane"></i> EMAIL DRAFT — KOPI &amp; KIRIM
      </div>
      <h1 class="text-3xl md:text-4xl font-bold mb-3 leading-tight">
        Balasan Email <span class="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Tim Onboarding Duitku</span>
      </h1>
      <p class="text-gray-300 text-base max-w-3xl">
        Template profesional balasan untuk verifikasi <b class="text-white">Project Code D22457</b> — atas nama
        <b class="text-white">PT Cakrawarti Waskita Digital</b>. Tinggal isi placeholder <code class="text-amber-300">[…]</code>, copy ke Gmail/Outlook, attach 10 dokumen, kirim.
      </p>
    </section>

    <!-- ANTI-PHISHING WARNING -->
    <section class="mb-8 card p-5 border-rose-500/40 bg-gradient-to-br from-rose-900/15 to-amber-900/5">
      <h2 class="text-base font-bold mb-2 flex items-center gap-2 text-rose-300"><i class="fas fa-triangle-exclamation"></i> Cek Keaslian Email Dulu (5 menit)</h2>
      <ul class="text-sm text-gray-300 space-y-1.5 list-disc pl-5">
        <li>Pastikan domain pengirim adalah <b class="text-white">@duitku.com</b> — bukan <code class="badge-rose px-1.5 rounded">duitku-support.com</code> / <code class="badge-rose px-1.5 rounded">duitku.co</code> / Gmail.</li>
        <li>Login ke <a class="text-amber-300 underline" href="https://passport.duitku.com" target="_blank">passport.duitku.com</a> &amp; cek apakah notifikasi verifikasi <b>D22457</b> juga muncul di dashboard.</li>
        <li>Konfirmasi via CS resmi Duitku: <code class="badge-info px-1.5 rounded">0838-9961-4121</code> atau live chat di <a class="text-amber-300 underline" href="https://www.duitku.com" target="_blank">duitku.com</a>.</li>
        <li>Jangan klik link mencurigakan di email — buka langsung dari browser ke <code class="badge-info px-1.5 rounded">duitku.com</code>.</li>
      </ul>
    </section>

    <!-- EMAIL DRAFT BOX -->
    <section class="mb-10">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xl font-bold flex items-center gap-2"><i class="fas fa-envelope-open-text text-amber-400"></i> Email Draft Profesional</h2>
        <button id="copyEmailBtn" class="px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-medium transition no-print">
          <i class="fas fa-copy mr-1.5"></i><span id="copyLabel">Copy Email</span>
        </button>
      </div>
      <div id="emailContent" class="email-box p-5">To: [email Onboarding Duitku — biasanya: onboarding@duitku.com]
Cc: [email co-founder / internal kalau ada]
Subject: Re: Verifikasi Project Code D22457 — Kelengkapan Dokumen Legalitas PT Cakrawarti Waskita Digital

Dear Tim Onboarding Duitku,

Terima kasih atas email verifikasi terkait Project Code D22457.

Menanggapi permintaan upgrade akun perusahaan untuk website
https://sparkmind-v2.pages.dev/ atas nama PT Cakrawarti Waskita Digital,
kami akan segera melengkapi seluruh dokumen legalitas yang diminta.

Sebagai referensi awal, alur/flow pembayaran pada website kami sudah
didokumentasikan secara resmi (publik &amp; dapat diakses langsung) di:
👉 https://sparkmind-v2.pages.dev/flow

Halaman tersebut memuat:
- High-level diagram 6 tahap (User → SparkMind → Duitku API → Duitku POP → Callback → Konfirmasi)
- Detail teknis setiap tahap (endpoint, signature, request/response sample)
- Screenshot &amp; mockup user journey (dengan link langsung ke /pricing &amp; /payment/return)
- Tech stack &amp; security/compliance (TLS 1.3, IP whitelist 9 IP Duitku production,
  MD5 signature verify, idempotent processing, PCI-DSS scope reduction)
- Tabel referensi semua endpoint payment (GET/POST + path + tujuan + auth)

Berikut status persiapan 10 dokumen yang diminta dari sisi kami:

1.  KTP Penanggung Jawab — [SIAP / DALAM PROSES]
2.  NIB RBA / SIUP + NIB — [SIAP / DALAM PROSES]
3.  Surat Keterangan Domisili / Surat Ijin Lokasi — [SIAP / DALAM PROSES]
4.  NPWP atas nama PT Cakrawarti Waskita Digital — [SIAP / DALAM PROSES]
5.  Akta Pendirian + SK Kemenkumham Pendirian — [SIAP / DALAM PROSES]
6.  Akta Perubahan Terakhir + SK Kemenkumham Perubahan
    — [SIAP / TIDAK ADA PERUBAHAN]
7.  Surat Sewa Lokasi — [SIAP / TIDAK BERLAKU karena lokasi milik sendiri]
8.  Foto Lokasi (tampak luar depan &amp; dalam ruangan, bukan dari Google Maps)
    — [SIAP / DALAM PROSES]
9.  Foto Nomor Rekening Perusahaan (Kop E-statement / Buku Tabungan /
    Rekening Koran / Screenshot I-Banking / M-Banking) — [SIAP / DALAM PROSES]
10. Alur/flow pembayaran pada website yang didaftarkan
    — SIAP (live di https://sparkmind-v2.pages.dev/flow, PDF terlampir)

Estimasi pengiriman seluruh kelengkapan dokumen: paling lambat
[TANGGAL — misal 3-5 hari kerja dari sekarang].

Apabila ada format khusus, ukuran file maksimal, atau template tertentu
yang harus kami ikuti (terutama untuk poin 8 — Foto Lokasi, dan poin 10 —
Alur Flow Pembayaran), mohon berkenan menginformasikan agar dokumen yang
kami kirim langsung sesuai standar Duitku dan tidak perlu revisi berulang.

Pertanyaan tambahan dari kami:
- Untuk poin 10 (Alur/flow pembayaran), apakah dokumentasi live di
  /flow + PDF lampiran sudah cukup, atau perlu format formal tambahan
  seperti BRD/PRD?
- Apakah seluruh dokumen dikirim via reply email ini, atau ada portal
  upload khusus dari Duitku?

Mohon konfirmasinya, dan terima kasih atas asistensinya selama proses
verifikasi ini.

Best regards,

[NAMA LO]
[JABATAN — misal: Direktur Utama / Founder]
PT Cakrawarti Waskita Digital
[No. HP / WhatsApp]
[Email]
https://sparkmind-v2.pages.dev/
</div>
      <p class="text-xs text-gray-500 mt-3"><i class="fas fa-info-circle mr-1"></i> Ganti placeholder <code class="text-amber-300">[...]</code> sesuai kondisi. Status apa adanya lebih dihargai daripada di-paksa "SIAP" semua.</p>
    </section>

    <!-- 10-DOC CHECKLIST -->
    <section class="mb-10">
      <h2 class="text-xl font-bold mb-2 flex items-center gap-2"><i class="fas fa-clipboard-check text-emerald-400"></i> Checklist 10 Dokumen Legalitas</h2>
      <p class="text-sm text-gray-400 mb-5">Klik checkbox untuk track progress. State disimpan di browser (localStorage).</p>
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-white/5">
            <tr class="text-left text-xs uppercase tracking-wider text-gray-400">
              <th class="p-3 w-10">✓</th>
              <th class="p-3">Dokumen</th>
              <th class="p-3 hidden md:table-cell">Di Mana Dapetinnya</th>
              <th class="p-3 hidden lg:table-cell">Tips</th>
            </tr>
          </thead>
          <tbody id="checklistBody" class="text-gray-300"></tbody>
        </table>
      </div>
      <div class="mt-3 flex items-center justify-between text-xs text-gray-500 no-print">
        <span><i class="fas fa-database mr-1"></i> Progress disimpan otomatis di browser ini</span>
        <button id="resetChecklist" class="text-rose-400 hover:text-rose-300"><i class="fas fa-rotate-left mr-1"></i>Reset Progress</button>
      </div>
    </section>

    <!-- FILE NAMING CONVENTION -->
    <section class="mb-10 card p-6">
      <h3 class="text-lg font-bold mb-3 flex items-center gap-2"><i class="fas fa-folder-open text-indigo-400"></i> Konvensi Penamaan File (Wajib)</h3>
      <p class="text-sm text-gray-300 mb-3">Gunakan format ini untuk semua 10 file PDF biar Tim Duitku mudah identifikasi:</p>
      <div class="email-box p-4 mb-3"><code>[NoUrutan]_[NamaDokumen]_PT-CakrawartiWaskitaDigital.pdf</code></div>
      <p class="text-xs text-gray-400 mb-2">Contoh:</p>
      <ul class="text-xs text-gray-400 space-y-1 list-disc pl-5 font-mono">
        <li>01_KTP-Penanggung-Jawab_PT-CakrawartiWaskitaDigital.pdf</li>
        <li>02_NIB-RBA_PT-CakrawartiWaskitaDigital.pdf</li>
        <li>04_NPWP-Perusahaan_PT-CakrawartiWaskitaDigital.pdf</li>
        <li>10_Alur-Flow-Pembayaran_PT-CakrawartiWaskitaDigital.pdf</li>
      </ul>
      <p class="text-xs text-amber-300 mt-3"><i class="fas fa-lightbulb mr-1"></i> <b>Pro tip:</b> Bundle semua 10 PDF jadi 1 file ZIP: <code>D22457_PT-CakrawartiWaskitaDigital_Onboarding-Documents.zip</code> — biar inbox Tim Duitku rapi.</p>
    </section>

    <!-- ACTION PLAN -->
    <section class="mb-10 card p-6 bg-gradient-to-br from-emerald-900/15 to-indigo-900/10 border-emerald-500/30">
      <h3 class="text-lg font-bold mb-3 flex items-center gap-2"><i class="fas fa-bullseye text-emerald-400"></i> Action Plan Hari Ini</h3>
      <ol class="text-sm text-gray-300 space-y-2 list-decimal pl-6">
        <li><b>Verifikasi keaslian email</b> (5 menit) — login dashboard Duitku, cek notif Project D22457.</li>
        <li><b>Kumpulin dokumen yang udah ada</b> — KTP, NPWP, Akta, NIB (biasanya sudah di folder PT).</li>
        <li><b>Save PDF flow:</b> buka <a href="/flow" class="text-amber-300 underline">/flow</a> → klik tombol <span class="badge-warn px-2 py-0.5 rounded text-xs">Print / PDF</span> di kanan atas → save dengan nama <code>10_Alur-Flow-Pembayaran_PT-CakrawartiWaskitaDigital.pdf</code>.</li>
        <li><b>Foto lokasi</b> (luar + dalam) — pakai HP, resolusi tinggi, pencahayaan cukup. Hindari Google Maps.</li>
        <li><b>Screenshot mBanking</b> — sensor saldo kalau perlu, pastikan nama PT &amp; nomor rekening jelas.</li>
        <li><b>Copy email draft di atas</b> → paste ke Gmail/Outlook → isi placeholder → attach 10 PDF (atau ZIP) → kirim.</li>
        <li><b>Track progress</b> di checklist halaman ini sampai semua ✓.</li>
      </ol>
    </section>

    <!-- LINKS BACK -->
    <section class="mb-10 grid sm:grid-cols-2 gap-4 no-print">
      <a href="/flow" class="card p-5 hover:border-emerald-400 transition group">
        <div class="text-xs text-gray-400 mb-1">📄 Dokumen poin #10</div>
        <div class="font-bold text-base group-hover:text-emerald-300">Alur / Flow Pembayaran →</div>
        <p class="text-xs text-gray-400 mt-1">Buka, klik Print/PDF, attach ke email.</p>
      </a>
      <a href="/pricing" class="card p-5 hover:border-indigo-400 transition group">
        <div class="text-xs text-gray-400 mb-1">💳 Test live payment</div>
        <div class="font-bold text-base group-hover:text-indigo-300">Halaman Pricing →</div>
        <p class="text-xs text-gray-400 mt-1">Tunjukkan ke Tim Duitku kalau payment flow sudah live.</p>
      </a>
    </section>

  </main>

  <footer class="border-t border-amber-900/40 py-6 text-center text-xs text-gray-500 no-print">
    © <span id="yr"></span> PT Cakrawarti Waskita Digital · SparkMind × Duitku · Project D22457 · Internal Document
  </footer>

  <script>
    // Year + last updated
    document.getElementById('yr').textContent = new Date().getFullYear();

    // ====== 10-DOC CHECKLIST ======
    const DOCS = [
      { n:1,  name:'KTP Penanggung Jawab',                   where:'KTP fisik direktur/penanggung jawab PT', tip:'Scan/foto berwarna, NIK & masa berlaku jelas. Nama harus persis sama dengan akta.' },
      { n:2,  name:'NIB RBA / SIUP + NIB',                   where:'OSS RBA (oss.go.id) — login akun perusahaan', tip:'Download PDF resmi dari OSS, jangan screenshot. KBLI 62xxx untuk software/AI.' },
      { n:3,  name:'Surat Keterangan Domisili / Ijin Lokasi',where:'Kelurahan setempat ATAU virtual office provider', tip:'Kalau pakai VO, minta Surat Domisili + Perjanjian Sewa dari provider.' },
      { n:4,  name:'NPWP Perusahaan',                        where:'DJP / Coretax atas nama PT Cakrawarti Waskita Digital', tip:'BUKAN NPWP pribadi. Nama PT identik dengan akta.' },
      { n:5,  name:'Akta Pendirian + SK Kemenkumham',         where:'Notaris yang dulu bikin PT', tip:'Minta softcopy PDF kedua dokumen. SK Kemenkumham format AHU-xxx.' },
      { n:6,  name:'Akta Perubahan Terakhir + SK',            where:'Notaris (kalau pernah ada perubahan)', tip:'Kalau belum pernah perubahan, jelasin di email. Jangan dipaksa bikin.' },
      { n:7,  name:'Surat Sewa Lokasi',                      where:'Pemilik tempat usaha / virtual office', tip:'Hanya wajib kalau sewa atau VO. Milik sendiri/rumah pribadi → "tidak berlaku".' },
      { n:8,  name:'Foto Lokasi (luar + dalam)',             where:'Foto langsung pakai HP, BUKAN Google Maps', tip:'Min. 2 foto: (a) tampak depan (plang/alamat), (b) interior ruangan kerja.' },
      { n:9,  name:'Foto Nomor Rekening Perusahaan',         where:'Kop e-statement / Buku Tabungan / Rekening Koran / iBanking / mBanking', tip:'Nama PT (BUKAN pribadi) + nomor rekening + nama bank harus jelas. Saldo boleh disensor.' },
      { n:10, name:'Alur/Flow Pembayaran di Website',         where:'Live di /flow → Print/PDF', tip:'PDF sudah ready. Sertakan link live https://sparkmind-v2.pages.dev/flow di email.' },
    ];
    const STORAGE_KEY = 'duitku_d22457_checklist_v1';
    function loadProgress(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }catch{return{};} }
    function saveProgress(s){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch{} }
    function renderChecklist(){
      const state = loadProgress();
      const tbody = document.getElementById('checklistBody');
      tbody.innerHTML = DOCS.map(d => {
        const checked = state['d'+d.n] ? 'checked' : '';
        const opacity = state['d'+d.n] ? 'opacity-50 line-through' : '';
        return '<tr class="checklist-item border-t border-white/5 transition">' +
          '<td class="p-3 align-top"><input type="checkbox" data-id="d'+d.n+'" class="w-4 h-4 accent-emerald-500" '+checked+'></td>' +
          '<td class="p-3 align-top '+opacity+'"><div class="font-semibold text-white">'+d.n+'. '+d.name+'</div><div class="md:hidden text-xs text-gray-500 mt-1">'+d.where+'</div></td>' +
          '<td class="p-3 align-top text-xs text-gray-400 hidden md:table-cell '+opacity+'">'+d.where+'</td>' +
          '<td class="p-3 align-top text-xs text-gray-500 hidden lg:table-cell '+opacity+'">'+d.tip+'</td>' +
        '</tr>';
      }).join('');
      tbody.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const s = loadProgress();
          s[cb.dataset.id] = cb.checked;
          saveProgress(s);
          renderChecklist();
        });
      });
    }
    renderChecklist();
    document.getElementById('resetChecklist').addEventListener('click', () => {
      if(confirm('Reset semua progress checklist?')){ saveProgress({}); renderChecklist(); }
    });

    // ====== COPY EMAIL ======
    document.getElementById('copyEmailBtn').addEventListener('click', async () => {
      const txt = document.getElementById('emailContent').innerText;
      try {
        await navigator.clipboard.writeText(txt);
        const lbl = document.getElementById('copyLabel');
        const orig = lbl.textContent;
        lbl.textContent = '✓ Copied!';
        document.getElementById('emailContent').classList.add('copied-flash');
        setTimeout(() => {
          lbl.textContent = orig;
          document.getElementById('emailContent').classList.remove('copied-flash');
        }, 1500);
      } catch(e) {
        alert('Gagal copy. Manual select & copy aja: select all teks email box.');
      }
    });
  </script>
</body>
</html>`

// ============================================
// CLARITY PAGE — UI for Painkiller Module
// ============================================
const CLARITY_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a0a1a">
  <title>AI Clarity & Recovery Coach — SparkMind V7.3</title>
  <meta name="description" content="Painkiller AI untuk hubungan & emosi: Situation Decoder, Draft Review, Boundary Checker, Recovery Plan. Privacy-first, etis, tidak manipulatif.">
  <meta name="keywords" content="ai clarity coach, recovery, breakup, ghosting, blokir, overthinking, indonesia">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta property="og:title" content="AI Clarity & Recovery Coach — SparkMind V7.3">
  <meta property="og:description" content="Dari overthinking jadi strategi. Bukan bantu mengejar orang — bantu kamu mengambil keputusan yang elegan.">
  <meta property="og:type" content="website">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%237c3aed'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle' fill='white' font-family='system-ui' font-weight='bold'%3EC%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif}
    body{background:#0a0a1a;color:#e5e7eb}
    .gradient-text{background:linear-gradient(135deg,#a78bfa,#ec4899,#fb7185);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .grid-bg{background-image:linear-gradient(rgba(167,139,250,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(167,139,250,.06) 1px,transparent 1px);background-size:50px 50px}
    .btn-primary{background:linear-gradient(135deg,#7c3aed,#ec4899);transition:all .25s}
    .btn-primary:hover{transform:translateY(-1px);box-shadow:0 10px 30px rgba(124,58,237,.4)}
    .btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .tab-btn{transition:all .2s}
    .tab-btn.active{background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;box-shadow:0 6px 20px rgba(124,58,237,.4)}
    textarea,input{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#fff}
    textarea:focus,input:focus{outline:none;border-color:#a78bfa;background:rgba(255,255,255,.08)}
  </style>
</head>
<body class="min-h-screen relative">
  <div class="fixed inset-0 grid-bg opacity-40 pointer-events-none"></div>
  <div class="fixed top-0 left-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none"></div>
  <div class="fixed top-32 right-1/4 w-96 h-96 bg-pink-600/15 rounded-full blur-3xl pointer-events-none"></div>

  <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-white/5">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center font-bold text-white shadow-lg">C</div>
        <div class="leading-tight">
          <span class="block text-base font-bold tracking-tight">Clarity Coach <span class="text-[10px] text-violet-400 font-mono ml-0.5">V7.3</span></span>
          <span class="block text-[10px] text-gray-500">Painkiller AI · Privacy-first</span>
        </div>
      </a>
      <div class="flex items-center gap-2">
        <a href="/flow" class="hidden md:inline-block text-sm text-emerald-300 hover:text-white px-3 py-1.5 transition" title="Alur Pembayaran"><i class="fas fa-route mr-1"></i>Flow</a>
        <a href="/app" class="hidden sm:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5">App</a>
        <a href="/pricing" class="px-4 py-2 btn-primary text-white text-sm font-semibold rounded-lg">Upgrade</a>
      </div>
    </div>
  </nav>

  <header class="relative pt-28 pb-8 px-4 sm:px-6 max-w-5xl mx-auto">
    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-xs text-violet-300 mb-5">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      V7.3 PRODUCTION HARDENED · Etis · Boundary-first · No Manipulation · Callback Lockdown
    </div>
    <h1 class="text-3xl sm:text-5xl font-black mb-3 leading-tight tracking-tight">
      Dari overthinking <br>jadi <span class="gradient-text">strategi.</span>
    </h1>
    <p class="text-base text-gray-400 max-w-2xl leading-relaxed">
      Bukan bantu mengejar orang. <b class="text-white">Bantu kamu mengambil keputusan yang elegan.</b> Painkiller AI untuk situasi hubungan yang kacau — situation decoder, draft review, boundary checker, recovery plan.
    </p>
  </header>

  <main class="max-w-5xl mx-auto px-4 sm:px-6 pb-24 relative">
    <div class="flex flex-wrap gap-2 mb-5 sticky top-16 z-30 backdrop-blur-md bg-slate-950/60 -mx-2 px-2 py-2 rounded-xl">
      <button class="tab-btn active px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10" data-tab="decode"><i class="fas fa-search mr-1.5"></i>Situation Decoder</button>
      <button class="tab-btn px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10 bg-white/5" data-tab="draft"><i class="fas fa-pen-fancy mr-1.5"></i>Draft Review</button>
      <button class="tab-btn px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10 bg-white/5" data-tab="boundary"><i class="fas fa-shield-halved mr-1.5"></i>Boundary</button>
      <button class="tab-btn px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10 bg-white/5" data-tab="recovery"><i class="fas fa-heart-pulse mr-1.5"></i>Recovery Plan</button>
      <button class="tab-btn px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10 bg-white/5" data-tab="decision"><i class="fas fa-route mr-1.5"></i>Decision</button>
      <button class="tab-btn px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold border border-white/10 bg-white/5" data-tab="swot"><i class="fas fa-chart-pie mr-1.5"></i>SWOT</button>
    </div>

    <section class="panel" data-panel="decode">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-violet-300 font-bold uppercase tracking-wider mb-2">🔍 Situation Decoder</p>
        <p class="text-sm text-gray-400 mb-3">Cerita singkat situasi kamu. AI baca dalam <b>probabilitas</b> (bukan kepastian) + kasih action plan etis.</p>
        <textarea id="decode-input" rows="4" maxlength="2000" class="w-full p-3 rounded-xl text-sm" placeholder='Contoh: "Dia berubah dingin 3 hari ini" / "Aku bingung lanjut atau berhenti"'></textarea>
        <div class="flex justify-between items-center mt-3">
          <span class="text-[10px] text-gray-500" id="decode-count">0/2000</span>
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="decode"><i class="fas fa-bolt mr-1.5"></i>Decode</button>
        </div>
      </div>
      <div id="decode-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <section class="panel hidden" data-panel="draft">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-cyan-300 font-bold uppercase tracking-wider mb-2">✍️ Chat & WA Draft Review</p>
        <p class="text-sm text-gray-400 mb-3">Paste draft chat — AI scan tone (needy / emotional / pressure). Verdict: KIRIM / REVISI / JANGAN KIRIM.</p>
        <textarea id="draft-input" rows="6" maxlength="2000" class="w-full p-3 rounded-xl text-sm" placeholder="Paste draft chat kamu di sini sebelum kirim..."></textarea>
        <div class="flex justify-between items-center mt-3">
          <span class="text-[10px] text-gray-500" id="draft-count">0/2000</span>
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="draft"><i class="fas fa-magnifying-glass mr-1.5"></i>Review</button>
        </div>
      </div>
      <div id="draft-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <section class="panel hidden" data-panel="boundary">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-red-300 font-bold uppercase tracking-wider mb-2">🚧 Boundary Checker</p>
        <p class="text-sm text-gray-400 mb-3">Sistem deteksi block / mute / ghosting → auto lock no-contact mode.</p>
        <textarea id="boundary-input" rows="4" maxlength="2000" class="w-full p-3 rounded-xl text-sm" placeholder='Contoh: "Aku diblokir dia 2 hari lalu"'></textarea>
        <div class="flex justify-between items-center mt-3">
          <span class="text-[10px] text-gray-500" id="boundary-count">0/2000</span>
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="boundary"><i class="fas fa-shield-halved mr-1.5"></i>Check</button>
        </div>
      </div>
      <div id="boundary-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <section class="panel hidden" data-panel="recovery">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-emerald-300 font-bold uppercase tracking-wider mb-2">💚 Recovery Plan</p>
        <p class="text-sm text-gray-400 mb-3">Plan harian terintegrasi: Habit + Journal Prompt + Mini Goal per fase.</p>
        <div class="flex gap-3 mb-3 flex-wrap">
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="rp-days" value="7"> <span class="text-sm">7 hari</span></label>
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="rp-days" value="21"> <span class="text-sm">21 hari</span></label>
          <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="rp-days" value="30" checked> <span class="text-sm">30 hari</span></label>
        </div>
        <input id="recovery-input" maxlength="500" class="w-full p-3 rounded-xl text-sm" placeholder="Konteks singkat (opsional): habis diblokir / putus / overthinking, dll.">
        <div class="flex justify-end mt-3">
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="recovery"><i class="fas fa-heart-pulse mr-1.5"></i>Generate Plan</button>
        </div>
      </div>
      <div id="recovery-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <section class="panel hidden" data-panel="decision">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-amber-300 font-bold uppercase tracking-wider mb-2">🧭 Decision Mode</p>
        <p class="text-sm text-gray-400 mb-3">AI bantu pilih: lanjut pelan / 1 pesan terakhir / pause / move on / fokus diri 30 hari.</p>
        <textarea id="decision-input" rows="4" maxlength="2000" class="w-full p-3 rounded-xl text-sm" placeholder="Cerita situasinya — AI bantu lihat 5 opsi sehat..."></textarea>
        <div class="flex justify-between items-center mt-3">
          <span class="text-[10px] text-gray-500" id="decision-count">0/2000</span>
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="decision"><i class="fas fa-route mr-1.5"></i>Decide</button>
        </div>
      </div>
      <div id="decision-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <section class="panel hidden" data-panel="swot">
      <div class="glass rounded-2xl p-5 mb-4">
        <p class="text-xs text-pink-300 font-bold uppercase tracking-wider mb-2">📊 Relationship SWOT</p>
        <p class="text-sm text-gray-400 mb-3">Analisis hubungan dalam 4 dimensi: Strength, Weakness, Opportunity, Threat.</p>
        <input id="swot-input" maxlength="500" class="w-full p-3 rounded-xl text-sm" placeholder="Konteks hubungan (mis: pacar 2 tahun, sering konflik chat)">
        <div class="flex justify-end mt-3">
          <button class="btn-primary px-5 py-2 rounded-xl font-semibold text-sm text-white" data-act="swot"><i class="fas fa-chart-pie mr-1.5"></i>Analyze</button>
        </div>
      </div>
      <div id="swot-out" class="glass rounded-2xl p-5 hidden"></div>
    </section>

    <aside class="mt-8 glass rounded-2xl p-5">
      <p class="text-xs text-amber-300 font-bold uppercase tracking-wider mb-2">⚠️ Disclaimer Etika</p>
      <p class="text-sm text-gray-300 leading-relaxed">Tool ini <b>bukan untuk memanipulasi, menembus block, atau mengontrol orang</b>. Tool ini bantu kamu refleksi & membuat keputusan etis. Bukan pengganti terapis profesional. Untuk masalah berat (depresi, kecemasan parah, ide bunuh diri), segera kontak <b>Into the Light Indonesia (119 ext 8)</b>.</p>
    </aside>
  </main>

  <footer class="py-8 px-4 text-center border-t border-white/5">
    <p class="text-xs text-gray-500">© 2026 SparkMind V7.3 PRODUCTION HARDENED — Painkiller AI Coach 🇮🇩</p>
  </footer>

  <script>
  (function(){
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.tab-btn').forEach(b => { b.classList.remove('active'); b.classList.add('bg-white/5'); });
        btn.classList.add('active'); btn.classList.remove('bg-white/5');
        $$('.panel').forEach(p => p.classList.add('hidden'));
        document.querySelector('.panel[data-panel="'+tab+'"]').classList.remove('hidden');
      });
    });
    [['decode-input','decode-count'],['draft-input','draft-count'],['boundary-input','boundary-count'],['decision-input','decision-count']].forEach(([i,c]) => {
      const inp = $('#'+i), cnt = $('#'+c);
      if (!inp || !cnt) return;
      inp.addEventListener('input', () => { cnt.textContent = inp.value.length + '/' + (inp.maxLength||2000); });
    });
    async function call(path, body, outId, btn) {
      const out = $('#'+outId);
      out.classList.remove('hidden');
      out.innerHTML = '<div class="flex items-center gap-2 text-sm text-gray-400"><i class="fas fa-spinner fa-spin"></i> Sedang menganalisis dengan etika & probabilitas...</div>';
      btn.disabled = true;
      try {
        const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok || d.error) {
          out.innerHTML = '<div class="text-sm text-rose-300"><i class="fas fa-triangle-exclamation mr-1.5"></i>' + (d.error || 'Server error') + '</div>';
        } else {
          out.innerHTML = d.html || '<div class="text-sm text-gray-400">No response</div>';
        }
      } catch (e) {
        out.innerHTML = '<div class="text-sm text-rose-300"><i class="fas fa-triangle-exclamation mr-1.5"></i>Network error: ' + (e.message||'unknown') + '</div>';
      } finally {
        btn.disabled = false;
      }
    }
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'decode')   { const v = $('#decode-input').value.trim();   if(!v){alert('Cerita dulu situasinya 🙏');return;} call('/api/clarity/decode',         { story: v }, 'decode-out', btn); }
      if (act === 'draft')    { const v = $('#draft-input').value.trim();    if(!v){alert('Paste draft chat dulu');return;}     call('/api/clarity/draft-review',   { draft: v }, 'draft-out', btn); }
      if (act === 'boundary') { const v = $('#boundary-input').value.trim(); if(!v){alert('Cerita situasinya dulu');return;}    call('/api/clarity/boundary',       { story: v }, 'boundary-out', btn); }
      if (act === 'recovery') { const days = +(document.querySelector('input[name=rp-days]:checked')?.value||30); const ctx = $('#recovery-input').value.trim(); call('/api/clarity/recovery-plan', { days, context: ctx }, 'recovery-out', btn); }
      if (act === 'decision') { const v = $('#decision-input').value.trim(); if(!v){alert('Cerita situasinya dulu');return;}    call('/api/clarity/decision',       { story: v }, 'decision-out', btn); }
      if (act === 'swot')     { const v = $('#swot-input').value.trim();     if(!v){alert('Konteks hubungan dulu');return;}     call('/api/clarity/relationship-swot', { context: v }, 'swot-out', btn); }
    });
  })();
  </script>
</body>
</html>`

// ============================================
// LEGAL & COMPLIANCE PAGE
// Enterprise-grade legal pack for Duitku verification:
// - Terms of Service (Syarat & Ketentuan)
// - Privacy Policy (Kebijakan Privasi · UU PDP 27/2022)
// - Refund Policy (7-day money-back)
// - Acceptable Use Policy
// - Legal Entity disclosure (PT. Waskita Cakrawarti Digital)
// - Contact / DPO information
// ============================================
const LEGAL_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Legal & Compliance — SparkMind V7.3 (PT. Waskita Cakrawarti Digital)</title>
  <meta name="description" content="Halaman legal & compliance SparkMind: Syarat & Ketentuan, Privacy Policy (UU PDP 27/2022), Refund Policy, Acceptable Use, dan informasi badan hukum PT. Waskita Cakrawarti Digital." />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="https://sparkmind-v2.pages.dev/legal" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <style>
    body { background:#0a0a0f; color:#e5e7eb; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif; }
    .glass { background: rgba(255,255,255,.03); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.08); }
    .gradient-text { background: linear-gradient(90deg,#a78bfa,#60a5fa,#34d399); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .section-anchor { scroll-margin-top: 84px; }
    h2.legal-h { font-size: 1.5rem; font-weight: 800; color:#fff; margin-bottom:.75rem; }
    h3.legal-sub { font-size: 1rem; font-weight: 700; color:#fde68a; margin-top:1.25rem; margin-bottom:.5rem; }
    .legal-body p { color:#cbd5e1; line-height:1.7; margin-bottom:.75rem; font-size: 14.5px; }
    .legal-body ul { list-style: disc; padding-left: 1.25rem; color:#cbd5e1; margin-bottom:.75rem; }
    .legal-body li { margin-bottom:.4rem; line-height:1.65; font-size: 14px; }
    .legal-body code { background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 4px; font-size: 12px; color:#fbbf24; }
    .toc a { color:#c4b5fd; }
    .toc a:hover { color:#fff; }
    .pill { display:inline-flex; align-items:center; gap:.4rem; font-size:11px; font-weight:700; padding:.25rem .6rem; border-radius:9999px; }
    @media print { .no-print { display:none !important; } body { background:#fff; color:#000; } .glass { background:#fff; border-color:#ddd; } .legal-body p, .legal-body li { color:#222; } h2.legal-h, h3.legal-sub { color:#000; } }
  </style>
</head>
<body class="min-h-screen">
  <!-- NAV -->
  <nav class="sticky top-0 z-40 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5 no-print">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5 group">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">S</div>
        <span class="text-base font-bold tracking-tight">SparkMind <span class="text-[10px] text-violet-400 font-mono ml-0.5">V7.3</span></span>
      </a>
      <div class="flex items-center gap-2">
        <a href="/pricing" class="hidden sm:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition">Pricing</a>
        <a href="/flow" class="hidden sm:inline-block text-sm text-emerald-300 hover:text-white px-3 py-1.5 transition"><i class="fas fa-route mr-1"></i>Flow</a>
        <button onclick="window.print()" class="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition" title="Print / Save as PDF"><i class="fas fa-print mr-1"></i>Print</button>
        <a href="/app" class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold rounded-lg">Buka App <i class="fas fa-arrow-right ml-1 text-xs"></i></a>
      </div>
    </div>
  </nav>

  <main class="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
    <!-- HEADER -->
    <header class="text-center mb-10">
      <span class="pill bg-violet-500/10 text-violet-300 border border-violet-500/20"><i class="fas fa-gavel"></i> Legal & Compliance Pack</span>
      <h1 class="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-white">Legal · <span class="gradient-text">Compliance · Trust</span></h1>
      <p class="mt-3 text-sm sm:text-base text-gray-400 max-w-2xl mx-auto">
        Halaman ini berisi seluruh dokumen legal SparkMind — disusun selaras <b class="text-white">UU PDP 27/2022</b>, <b class="text-white">UU ITE 19/2016</b>, dan persyaratan onboarding <b class="text-white">Duitku (Bank Indonesia licensed)</b>.
      </p>
      <p class="mt-2 text-xs text-gray-500">Terakhir diperbarui: <span id="last-updated">7 Mei 2026</span> · Versi 2.0 (Enterprise)</p>
    </header>

    <!-- LEGAL ENTITY DISCLOSURE -->
    <section id="entity" class="section-anchor mb-10 glass rounded-2xl p-6 border-emerald-500/20">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-300 text-xl shrink-0"><i class="fas fa-building-shield"></i></div>
        <div class="flex-1">
          <p class="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Legal Entity Disclosure</p>
          <h2 class="text-2xl font-bold text-white mt-1">PT. Waskita Cakrawarti Digital</h2>
          <div class="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <p class="text-[11px] uppercase text-gray-500 font-bold mb-1">Bidang Usaha (KBLI)</p>
              <p class="text-gray-200">63122 — AI Service · Portal Web Dan/Atau Platform Digital Dengan Tujuan Komersial</p>
              <p class="text-xs text-gray-400 mt-1">Tingkat Risiko: <b class="text-emerald-300">Rendah</b> · Skala: <b class="text-emerald-300">Mikro</b></p>
            </div>
            <div>
              <p class="text-[11px] uppercase text-gray-500 font-bold mb-1">Perizinan & Compliance</p>
              <ul class="space-y-1 text-gray-300 text-xs">
                <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i>NIB terdaftar OSS RBA (beranda.oss.go.id)</li>
                <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i>NPWP Perusahaan aktif</li>
                <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i>Payment Gateway: Duitku (BI-licensed) <code>D22457</code></li>
                <li><i class="fas fa-check-circle text-emerald-400 mr-1.5"></i>Patuh UU PDP 27/2022 & UU ITE 19/2016</li>
              </ul>
            </div>
          </div>
          <div class="mt-4 pt-4 border-t border-white/5 grid sm:grid-cols-3 gap-3 text-xs">
            <div><p class="text-gray-500 uppercase text-[10px] font-bold">Alamat</p><address class="not-italic text-gray-200 mt-1">Sokaraja, Kab. Banyumas,<br>Purwokerto, Jawa Tengah 53181</address></div>
            <div><p class="text-gray-500 uppercase text-[10px] font-bold">Email Resmi</p><a href="mailto:sparkmind.support@gmail.com" class="text-indigo-300 hover:text-white block mt-1">sparkmind.support@gmail.com</a></div>
            <div><p class="text-gray-500 uppercase text-[10px] font-bold">Hotline / WA</p><a href="tel:+6285643383832" class="text-emerald-300 hover:text-white block mt-1">+62 856-4338-3832</a></div>
          </div>
        </div>
      </div>
    </section>

    <!-- TABLE OF CONTENTS -->
    <section class="mb-10 glass rounded-2xl p-5 toc no-print">
      <p class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3"><i class="fas fa-list mr-1"></i>Daftar Isi</p>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <a href="#tos" class="hover:underline">1. Syarat & Ketentuan</a>
        <a href="#privacy" class="hover:underline">2. Privacy Policy (UU PDP)</a>
        <a href="#refund" class="hover:underline">3. Refund Policy</a>
        <a href="#aup" class="hover:underline">4. Acceptable Use Policy</a>
        <a href="#dpa" class="hover:underline">5. Data Processing & Security</a>
        <a href="#contact" class="hover:underline">6. Kontak / DPO</a>
      </div>
    </section>

    <!-- 1. TERMS OF SERVICE -->
    <section id="tos" class="section-anchor mb-10 glass rounded-2xl p-6">
      <h2 class="legal-h"><i class="fas fa-file-contract text-violet-400 mr-2"></i>1. Syarat & Ketentuan (Terms of Service)</h2>
      <div class="legal-body">
        <p>Dengan mengakses atau menggunakan SparkMind ("Layanan"), Anda menyetujui Syarat & Ketentuan ini secara penuh. Layanan disediakan oleh <b>PT. Waskita Cakrawarti Digital</b> ("Kami").</p>

        <h3 class="legal-sub">1.1 Definisi</h3>
        <ul>
          <li><b>Layanan</b>: platform AI strategic guide & clarity coach SparkMind di <code>sparkmind-v2.pages.dev</code> dan domain afiliasi.</li>
          <li><b>Pengguna</b>: pihak yang membuka, mendaftar, atau membayar paket Layanan.</li>
          <li><b>Konten Pengguna</b>: data input (jurnal, prompt, profil) yang Anda submit.</li>
          <li><b>Paket Berbayar</b>: Pro, Team, Lifetime, dan Painkiller pack.</li>
        </ul>

        <h3 class="legal-sub">1.2 Akun & Eligibility</h3>
        <ul>
          <li>Pengguna minimal berusia <b>17 tahun</b> atau memiliki izin wali yang sah.</li>
          <li>Anda wajib memberikan data yang akurat (email, nama, no. HP) saat checkout.</li>
          <li>Anda bertanggung jawab atas keamanan akun & device Anda.</li>
        </ul>

        <h3 class="legal-sub">1.3 Lisensi Penggunaan</h3>
        <p>Kami memberikan lisensi <b>non-eksklusif, non-transferable, terbatas</b> untuk menggunakan Layanan sesuai paket yang dibeli. Lisensi tidak mencakup re-sell, white-label, atau scraping massal output AI.</p>

        <h3 class="legal-sub">1.4 Pembayaran & Billing</h3>
        <ul>
          <li>Semua transaksi diproses oleh <b>Duitku (PT Duta Industan Berdikari)</b> — payment gateway berlisensi Bank Indonesia. Merchant code: <code>D22457</code>.</li>
          <li>Mata uang: <b>IDR</b>. Pajak (PPN) sudah termasuk dalam harga tertera kecuali dinyatakan lain.</li>
          <li>Paket bulanan/tahunan tidak auto-renew otomatis kecuali Anda mengaktifkannya secara eksplisit.</li>
          <li>Lifetime Deal berlaku selama Layanan masih beroperasi (commercially reasonable lifetime, minimum 5 tahun sejak pembelian).</li>
        </ul>

        <h3 class="legal-sub">1.5 Hak Kekayaan Intelektual</h3>
        <p>Brand "SparkMind", logo, kode sumber, dan UI adalah milik Kami. Konten Pengguna tetap milik Anda — Kami hanya memproses untuk menjalankan Layanan.</p>

        <h3 class="legal-sub">1.6 Disclaimer Coaching</h3>
        <p>SparkMind <b>BUKAN pengganti psikolog, psikiater, atau profesional medis</b>. Untuk darurat psikologis hubungi <b>Into the Light Indonesia (119 ext 8)</b> atau RSJ terdekat.</p>

        <h3 class="legal-sub">1.7 Pemutusan</h3>
        <p>Kami berhak menangguhkan atau menghentikan akun yang melanggar Acceptable Use Policy (lihat §4). Refund tetap mengikuti kebijakan §3 jika berlaku.</p>

        <h3 class="legal-sub">1.8 Hukum yang Berlaku</h3>
        <p>Tunduk pada hukum Republik Indonesia. Penyelesaian sengketa dilakukan secara musyawarah; bila gagal, melalui Pengadilan Negeri Banyumas atau BANI sesuai kesepakatan.</p>
      </div>
    </section>

    <!-- 2. PRIVACY POLICY -->
    <section id="privacy" class="section-anchor mb-10 glass rounded-2xl p-6">
      <h2 class="legal-h"><i class="fas fa-user-shield text-emerald-400 mr-2"></i>2. Kebijakan Privasi (UU PDP 27/2022)</h2>
      <div class="legal-body">
        <p>Kami berkomitmen melindungi data pribadi Anda sesuai <b>UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)</b>.</p>

        <h3 class="legal-sub">2.1 Data yang Kami Kumpulkan</h3>
        <ul>
          <li><b>Identifikasi</b>: nama, email, nomor telepon (saat checkout).</li>
          <li><b>Transaksi</b>: invoice ID, plan, jumlah, status pembayaran (via Duitku).</li>
          <li><b>Konten Pengguna</b>: input AI prompts, jurnal, goal — disimpan di local storage browser secara default.</li>
          <li><b>Teknis</b>: IP address (untuk verifikasi callback Duitku), user-agent, timestamp.</li>
        </ul>

        <h3 class="legal-sub">2.2 Dasar Hukum Pemrosesan</h3>
        <ul>
          <li><b>Persetujuan</b> (Pasal 20 UU PDP) — saat Anda klik "Lanjut Bayar" / "Saya Setuju".</li>
          <li><b>Pelaksanaan kontrak</b> — untuk memberikan Layanan yang Anda beli.</li>
          <li><b>Kewajiban hukum</b> — pelaporan pajak & audit Duitku.</li>
        </ul>

        <h3 class="legal-sub">2.3 Hak Subjek Data (Pasal 5–13 UU PDP)</h3>
        <ul>
          <li>Hak akses, koreksi, hapus, & portabilitas data.</li>
          <li>Hak menarik persetujuan kapan saja.</li>
          <li>Hak komplain ke <b>Lembaga PDP</b> (jika dibentuk) atau Kemenkominfo.</li>
          <li>Untuk eksekusi: kirim email ke <a href="mailto:sparkmind.support@gmail.com" class="text-indigo-300">sparkmind.support@gmail.com</a> subjek "PDP Request".</li>
        </ul>

        <h3 class="legal-sub">2.4 Retensi Data</h3>
        <ul>
          <li>Data transaksi: <b>10 tahun</b> (kewajiban pembukuan & audit Duitku).</li>
          <li>Data akun aktif: selama akun aktif + 12 bulan grace.</li>
          <li>Konten Pengguna lokal: di-control sepenuhnya oleh Anda (browser local storage).</li>
        </ul>

        <h3 class="legal-sub">2.5 Pihak Ketiga (Sub-Processor)</h3>
        <ul>
          <li><b>Duitku</b> — payment processing (BI-licensed).</li>
          <li><b>Cloudflare</b> — hosting & CDN (data residency: edge global, encrypted in transit & at rest).</li>
          <li><b>OpenAI / Anthropic</b> — LLM inference (paket Pro). Prompt diproses ephemeral & tidak digunakan untuk training (zero-retention API).</li>
        </ul>

        <h3 class="legal-sub">2.6 Transfer Lintas Batas</h3>
        <p>Beberapa sub-processor (OpenAI, Cloudflare) memproses data di luar Indonesia. Transfer dilindungi <b>Standard Contractual Clauses</b> & enkripsi TLS 1.3+.</p>

        <h3 class="legal-sub">2.7 Keamanan</h3>
        <ul>
          <li>HTTPS / TLS 1.3 untuk seluruh trafik.</li>
          <li>Whitelist IP callback Duitku (9 IP terdaftar).</li>
          <li>MD5 signature verification untuk callback payment.</li>
          <li>No password storage di server (passwordless / OTP-based).</li>
        </ul>

        <h3 class="legal-sub">2.8 Anak di Bawah Umur</h3>
        <p>Layanan tidak ditujukan untuk pengguna di bawah 17 tahun tanpa izin wali. Data anak akan dihapus jika terdeteksi.</p>
      </div>
    </section>

    <!-- 3. REFUND POLICY -->
    <section id="refund" class="section-anchor mb-10 glass rounded-2xl p-6">
      <h2 class="legal-h"><i class="fas fa-rotate-left text-amber-400 mr-2"></i>3. Refund Policy</h2>
      <div class="legal-body">
        <h3 class="legal-sub">3.1 Money-Back Guarantee 7 Hari</h3>
        <p>Untuk paket <b>Pro Monthly, Pro Yearly, Team, Lifetime</b> — Anda berhak refund <b>100%</b> dalam <b>7 hari kalender</b> sejak tanggal pembayaran berhasil.</p>

        <h3 class="legal-sub">3.2 Pengecualian</h3>
        <ul>
          <li>Painkiller pack one-shot (Rp 29.000 – Rp 59.000) bersifat <b>non-refundable</b> setelah output AI terkirim.</li>
          <li>Pelanggaran berat AUP (lihat §4) — tidak ada refund.</li>
          <li>Refund tidak berlaku untuk biaya admin/payment gateway (~ Rp 5.000) jika sudah ditarik Duitku.</li>
        </ul>

        <h3 class="legal-sub">3.3 Cara Klaim Refund</h3>
        <ul>
          <li>Kirim email ke <a href="mailto:sparkmind.support@gmail.com" class="text-indigo-300">sparkmind.support@gmail.com</a> subjek <code>[REFUND] {merchantOrderId}</code>.</li>
          <li>Sertakan: email pembayaran, no. HP, alasan singkat (untuk perbaikan product).</li>
          <li>Atau WA <a href="https://wa.me/6285643383832" class="text-emerald-300">+62 856-4338-3832</a>.</li>
        </ul>

        <h3 class="legal-sub">3.4 SLA Refund</h3>
        <ul>
          <li>Konfirmasi: ≤ 1×24 jam kerja.</li>
          <li>Pengembalian dana: <b>3–14 hari kerja</b> tergantung bank tujuan (sesuai SLA Duitku).</li>
        </ul>
      </div>
    </section>

    <!-- 4. ACCEPTABLE USE POLICY -->
    <section id="aup" class="section-anchor mb-10 glass rounded-2xl p-6">
      <h2 class="legal-h"><i class="fas fa-ban text-rose-400 mr-2"></i>4. Acceptable Use Policy (AUP)</h2>
      <div class="legal-body">
        <p>Anda <b>DILARANG</b> menggunakan Layanan untuk:</p>
        <ul>
          <li>Aktivitas ilegal (penipuan, money laundering, narkoba, terorisme).</li>
          <li>Manipulasi, stalking, harassment, atau menembus block/privacy orang lain.</li>
          <li>Generate konten kekerasan eksplisit, CSAM, atau hate speech yang melanggar UU ITE.</li>
          <li>Reverse engineering, scraping massal, atau abuse rate limit.</li>
          <li>Resell akses Layanan tanpa kontrak partner resmi.</li>
        </ul>
        <p class="mt-3">Pelanggaran berakibat <b>suspend instan tanpa refund</b> dan, bila perlu, pelaporan ke Polri / BSSN.</p>
      </div>
    </section>

    <!-- 5. DPA -->
    <section id="dpa" class="section-anchor mb-10 glass rounded-2xl p-6">
      <h2 class="legal-h"><i class="fas fa-shield-halved text-cyan-400 mr-2"></i>5. Data Processing & Security</h2>
      <div class="legal-body">
        <ul>
          <li><b>Encryption in transit</b>: TLS 1.3, HSTS preload-ready.</li>
          <li><b>Encryption at rest</b>: AES-256 (Cloudflare R2/D1 default).</li>
          <li><b>Backup</b>: incremental harian (Cloudflare automatic) + weekly snapshot.</li>
          <li><b>Incident Response</b>: notifikasi ke Anda &lt; 72 jam jika terjadi data breach (sesuai Pasal 46 UU PDP).</li>
          <li><b>Audit log</b>: seluruh callback Duitku & admin action ter-log dengan timestamp + IP.</li>
        </ul>
      </div>
    </section>

    <!-- 6. CONTACT -->
    <section id="contact" class="section-anchor mb-10 glass rounded-2xl p-6 border-indigo-500/20">
      <h2 class="legal-h"><i class="fas fa-headset text-indigo-400 mr-2"></i>6. Kontak Legal & Data Protection Officer (DPO)</h2>
      <div class="grid sm:grid-cols-3 gap-4 text-sm">
        <div class="glass rounded-xl p-4">
          <p class="text-[10px] uppercase text-emerald-300 font-bold">Hotline / WA</p>
          <a href="tel:+6285643383832" class="block mt-1 font-bold text-white">+62 856-4338-3832</a>
          <p class="text-xs text-gray-400 mt-1">Sen–Sab · 08.00–21.00 WIB</p>
        </div>
        <div class="glass rounded-xl p-4">
          <p class="text-[10px] uppercase text-indigo-300 font-bold">Email Legal & DPO</p>
          <a href="mailto:sparkmind.support@gmail.com" class="block mt-1 font-bold text-white break-all">sparkmind.support@gmail.com</a>
          <p class="text-xs text-gray-400 mt-1">Subjek: [LEGAL] / [PDP] / [REFUND]</p>
        </div>
        <div class="glass rounded-xl p-4">
          <p class="text-[10px] uppercase text-amber-300 font-bold">Alamat Surat Resmi</p>
          <address class="not-italic mt-1 font-bold text-white text-sm leading-relaxed">PT. Waskita Cakrawarti Digital<br>Sokaraja, Kab. Banyumas,<br>Purwokerto, Jawa Tengah 53181</address>
        </div>
      </div>
      <div class="mt-5 pt-5 border-t border-white/5 text-xs text-gray-500">
        <p>Eskalasi sengketa konsumen: <b>BPSK Banyumas</b>, <b>Kemenkominfo</b>, atau <b>Lembaga PDP</b> setelah resmi dibentuk. Pengaduan transaksi pembayaran juga dapat diteruskan ke <b>Duitku Customer Service</b> (cs@duitku.com).</p>
      </div>
    </section>

    <!-- BACK TO TOP -->
    <div class="text-center mt-12 no-print">
      <a href="/pricing" class="inline-block px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-300 font-semibold mr-2"><i class="fas fa-arrow-left mr-1"></i>Kembali ke Pricing</a>
      <a href="#entity" class="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30"><i class="fas fa-arrow-up mr-1"></i>Kembali ke Atas</a>
    </div>
  </main>

  <footer class="border-t border-white/5 py-8 text-center text-xs text-gray-500 no-print">
    <p>© <span id="yr"></span> PT. Waskita Cakrawarti Digital · SparkMind V7.3 · Merchant Duitku <code>D22457</code></p>
    <p class="mt-2">📧 sparkmind.support@gmail.com · 📞 +62 856-4338-3832 · 🇮🇩 Sokaraja, Banyumas, Jawa Tengah</p>
  </footer>

  <script>
    document.getElementById('yr').textContent = new Date().getFullYear();
    // Smooth scroll for anchors
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', e=>{
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); history.replaceState(null,'','#'+id); }
      });
    });
  </script>
</body>
</html>`

export default app
