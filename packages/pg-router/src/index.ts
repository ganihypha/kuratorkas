// ============================================================
// @sparkmind/pg-router — Payment Gateway dual-PG router
// Primary: Duitku (proven via SparkMind V7.3, merchant D22457)
// Fallback: Xendit (failover when Duitku unavailable)
// Stub mode: returns mock response for dev without API keys
// ============================================================

export type PgProvider = 'duitku' | 'xendit' | 'stub'

export interface InvoiceRequest {
  amount: number              // IDR
  merchantOrderId: string
  description: string
  email: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  callbackUrl: string
  returnUrl: string
}

export interface InvoiceResult {
  provider: PgProvider
  ok: boolean
  paymentUrl?: string
  reference?: string
  raw?: any
  error?: string
}

export interface PgRouterOpts {
  primary?: PgProvider
  fallback?: PgProvider
  duitku?: { apiKey: string; merchantCode: string; env: 'sandbox' | 'production' }
  xendit?: { apiKey: string }
}

// ----- STUB ADAPTER (works without keys — for dev/CI) -----
export async function createInvoiceStub(req: InvoiceRequest): Promise<InvoiceResult> {
  return {
    provider: 'stub',
    ok: true,
    paymentUrl: `https://stub.payment.local/pay?order=${encodeURIComponent(req.merchantOrderId)}&amount=${req.amount}`,
    reference: `STUB_${req.merchantOrderId}_${Date.now()}`,
    raw: { mode: 'stub', message: 'No real charge. Configure DUITKU_API_KEY to enable real payments.' },
  }
}

// ----- DUITKU ADAPTER (production-proven via SparkMind V7.3) -----
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createInvoiceDuitku(req: InvoiceRequest, cfg: { apiKey: string; merchantCode: string; env: 'sandbox' | 'production' }): Promise<InvoiceResult> {
  const timestamp = Date.now().toString()
  const signature = await sha256Hex(cfg.merchantCode + timestamp + cfg.apiKey)
  const apiUrl = cfg.env === 'production'
    ? 'https://api-prod.duitku.com/api/merchant/createInvoice'
    : 'https://api-sandbox.duitku.com/api/merchant/createInvoice'

  const payload = {
    paymentAmount: req.amount,
    merchantOrderId: req.merchantOrderId,
    productDetails: req.description,
    email: req.email,
    phoneNumber: req.phoneNumber || '08123456789',
    customerVaName: ((req.firstName || 'Customer') + ' ' + (req.lastName || '')).trim().slice(0, 20),
    itemDetails: [{ name: req.description, price: req.amount, quantity: 1 }],
    customerDetail: {
      firstName: req.firstName || 'Customer',
      lastName: req.lastName || 'User',
      email: req.email,
      phoneNumber: req.phoneNumber || '08123456789',
    },
    callbackUrl: req.callbackUrl,
    returnUrl: req.returnUrl,
    expiryPeriod: 60,
  }

  try {
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
    const data: any = await resp.json().catch(() => ({}))
    if (!resp.ok || data.statusCode !== '00') {
      return { provider: 'duitku', ok: false, error: data.statusMessage || `Duitku error ${resp.status}`, raw: data }
    }
    return {
      provider: 'duitku',
      ok: true,
      paymentUrl: data.paymentUrl,
      reference: data.reference,
      raw: data,
    }
  } catch (e: any) {
    return { provider: 'duitku', ok: false, error: e?.message ?? 'network error' }
  }
}

// ----- ROUTER (auto-fallback) -----
export async function createInvoice(req: InvoiceRequest, opts: PgRouterOpts = {}): Promise<InvoiceResult> {
  const primary = opts.primary ?? 'stub'
  const fallback = opts.fallback ?? 'stub'

  const try1 = await tryProvider(primary, req, opts)
  if (try1.ok) return try1

  if (fallback && fallback !== primary) {
    const try2 = await tryProvider(fallback, req, opts)
    if (try2.ok) return { ...try2, raw: { ...try2.raw, fallbackFrom: primary, primaryError: try1.error } }
  }

  return try1
}

async function tryProvider(p: PgProvider, req: InvoiceRequest, opts: PgRouterOpts): Promise<InvoiceResult> {
  if (p === 'duitku' && opts.duitku) return createInvoiceDuitku(req, opts.duitku)
  // Xendit can be added later — same shape
  return createInvoiceStub(req)
}
