═══════════════════════════════════════════════════════════════════════════════

# 💳 PAYMENT FLOW v2.0 — OBP MERCHANT-OF-RECORD ROUTING

## Checkout · Settlement · Reconciliation · Disclosure

**Codename**: `PAYMENT-FLOW-OBP v2.0`
**Doctrine Date**: 2026-05-21
**Owner**: Haidar — Sovereign AI Dev
**Status**: 🔒 CANONICAL · EXECUTE-READY
**Supersedes**: `PAYMENT-FLOW-OBP-v1.0.md`
**Companion of**: `MASTER-ARCHITECT-PROMPT v7.0` · `DR-OBP-HYBRID v2.0`

═══════════════════════════════════════════════════════════════════════════════

## §00 · FLOW OVERVIEW

```
┌──────────────────┐    1.click pay   ┌──────────────────────┐  2.create invoice
│ Customer         │ ───────────────► │ Sub-Brand Frontend   │ ─────────────────┐
│ (sparkmind.id)   │                  │ (e.g., BarberKas UI) │                  │
└──────────────────┘                  └──────────────────────┘                  ▼
        ▲                                       ▲                  ┌─────────────────────┐
        │ 6. entitlement                        │ 5. webhook       │ pay.oasis-bi-pro.   │
        │ activate                              └──────────────────│ web.id (OBP checkout│
        │                                                          │ orchestrator)        │
        └──────────────────────────────────────────────────────────└─────────────────────┘
                                                                          │ 3. forward
                                                                          ▼
                                                              ┌─────────────────────┐
                                                              │ Duitku / Xendit PJP │
                                                              └─────────────────────┘
                                                                          │ 4. settle
                                                                          ▼
                                                              ┌─────────────────────┐
                                                              │ OBP Bank Account    │
                                                              └─────────────────────┘
```

### Tujuh langkah inti
1. Customer click "Bayar" di sub-brand frontend (mis. BarberKas).
2. Frontend call OBP-Checkout API → OBP buat **invoice atas nama Oasis BI Pro** (bukan sub-brand) dengan metadata `sub_brand_id`.
3. OBP forward request ke Duitku/Xendit → terima `checkout_url`.
4. Customer bayar → Duitku/Xendit settle ke rekening OBP.
5. PJP fire webhook ke `pay.oasis-bi-pro.web.id/webhooks/{provider}` → OBP verify signature.
6. OBP fire internal event ke sub-brand backend (`event: payment.settled`) untuk activate entitlement (e.g., subscription, ticket, license).
7. Customer terima receipt (atas nama OBP) + entitlement activation.

═══════════════════════════════════════════════════════════════════════════════

## §01 · CHECKOUT ENDPOINTS (CONTRACT)

### 1.1 Create Invoice (sub-brand → OBP)

```http
POST https://pay.oasis-bi-pro.web.id/v1/invoices
Authorization: Bearer <SUB_BRAND_API_KEY>
Content-Type: application/json

{
  "sub_brand_id": "barberkas",
  "external_ref": "BK-INV-20260521-0001",
  "amount_idr": 49000,
  "description": "BarberKas Pro · Monthly Subscription",
  "customer": {
    "name": "Budi Santoso",
    "email": "budi@example.com",
    "phone": "+6281234567890"
  },
  "callback_url": "https://barberkas.sparkmind.web.id/payment/return",
  "metadata": {
    "plan": "pro_monthly",
    "user_id": "bk_user_12345"
  }
}
```

**Response 201**:
```json
{
  "invoice_id": "obp_inv_abc123",
  "checkout_url": "https://pay.oasis-bi-pro.web.id/checkout/obp_inv_abc123",
  "expires_at": "2026-05-21T12:00:00Z",
  "merchant_of_record": "Oasis BI Pro",
  "pjp_provider": "duitku",
  "amount_idr": 49000,
  "status": "pending"
}
```

### 1.2 Webhook (OBP → sub-brand)

```http
POST https://barberkas.sparkmind.web.id/webhooks/obp
X-OBP-Signature: <hmac_sha256>
Content-Type: application/json

{
  "event": "payment.settled",
  "invoice_id": "obp_inv_abc123",
  "external_ref": "BK-INV-20260521-0001",
  "amount_idr": 49000,
  "settled_at": "2026-05-21T10:32:14Z",
  "pjp": "duitku",
  "pjp_ref": "DTK-TXN-99887766",
  "metadata": { "plan": "pro_monthly", "user_id": "bk_user_12345" }
}
```

**Sub-brand MUST verify HMAC**:
```
expected = HMAC_SHA256(OBP_WEBHOOK_SECRET, raw_body)
if not constant_time_eq(expected, header_signature): reject 401
```

═══════════════════════════════════════════════════════════════════════════════

## §02 · PJP ROUTING TABLE

| Payment Method | PJP Primary | PJP Failover | Fee (Approx) | Settlement T+ |
|---------------|-------------|---------------|--------------|---------------|
| QRIS | Duitku | Xendit | 0.7% | T+1 |
| BCA VA | Duitku | Xendit | IDR 4,000 flat | T+1 |
| BNI/Mandiri/BRI VA | Duitku | Xendit | IDR 4,000 flat | T+1 |
| Credit Card (Visa/MC) | Xendit | Duitku | 2.9% + IDR 2,500 | T+2 |
| GoPay/OVO/Dana ShopeePay | Duitku | Xendit | 1.5-2.0% | T+1 |
| Alfamart/Indomaret | Duitku | — | IDR 5,000 flat | T+1 |

**Routing rule**:
- Default: Duitku (lower fee QRIS/VA)
- Credit Card: Xendit (better acceptance rate)
- Auto-failover: if PJP returns 5xx ≥ 3× in 60s → switch route

═══════════════════════════════════════════════════════════════════════════════

## §03 · SETTLEMENT & RECONCILIATION

### 3.1 Settlement Flow
1. PJP settle ke rekening **Oasis BI Pro** (BCA `xxx-xxx-xxxx`)
2. OBP daily-job (`02:00 WIB`) pull `settlement_report` dari Duitku + Xendit API
3. Match transactions: `pjp_ref` ↔ `obp_invoice_id` ↔ `sub_brand.external_ref`
4. Update tabel `obp.settlements` + `obp.brand_ledger`
5. Generate per-sub-brand **monthly statement** (PDF) untuk internal audit

### 3.2 Brand Ledger (Internal B2B)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `sub_brand_id` | enum | `barberkas` / `kuratorkas` / `pacelokal` / `nuranios` |
| `month` | YYYY-MM | Period |
| `gross_idr` | bigint | Sum of settled invoices |
| `pjp_fee_idr` | bigint | Aggregated PJP fees |
| `mor_fee_idr` | bigint | OBP overhead (default 1% gross, configurable) |
| `net_payable_idr` | bigint | `gross - pjp_fee - mor_fee` |
| `refund_pool_idr` | bigint | 5% gross held for 60d chargeback window |
| `payout_status` | enum | `pending` / `paid` / `held` |

### 3.3 Internal B2B Payout
- Monthly settlement OBP → sub-brand operating accounts (internal bookkeeping, same beneficial owner Haidar)
- Bookkeeping: every cross-account move logged in `obp.internal_transfers` with reason code

═══════════════════════════════════════════════════════════════════════════════

## §04 · IDEMPOTENCY & FAILURE HANDLING

### 4.1 Idempotency Keys
- All `POST /invoices` requests MUST include `Idempotency-Key: <uuid>` header
- OBP caches response 24h. Repeat request → returns cached response, not duplicate invoice.

### 4.2 Webhook Retry Policy
| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 30s |
| 3 | 2min |
| 4 | 10min |
| 5 | 1h |
| 6 | 6h |
| 7-10 | 24h exponential |

After 10 failures → mark `webhook_dead`, alert Haidar via Slack `#obp-payment-alerts`.

### 4.3 Reconciliation Drift
- Daily reconciliation job compares OBP ledger vs PJP report
- Drift > IDR 1,000 OR > 0.1% → flag for manual review
- Drift > IDR 50,000 OR > 1% → P1 incident, stop new checkouts

═══════════════════════════════════════════════════════════════════════════════

## §05 · DISCLOSURE & UX (WAJIB)

### 5.1 Checkout Page Footer (locked template)
```
Pembayaran diproses oleh Oasis BI Pro (oasis-bi-pro.web.id) sebagai
Merchant-of-Record untuk ekosistem SparkMind. Pemrosesan kartu/bank
melalui PJP Duitku/Xendit yang terdaftar di Bank Indonesia.
```

### 5.2 Invoice Header
```
Penerbit Invoice : Oasis BI Pro
NPWP             : <OBP NPWP>
Untuk Produk     : <Sub-Brand Name> (sub-brand ekosistem SparkMind)
```

### 5.3 Receipt Email
- From: `billing@oasis-bi-pro.web.id`
- Subject: `Bukti Pembayaran #<invoice_id> · <sub-brand>`
- Body mention BOTH OBP (as MoR) AND sub-brand (as product)

═══════════════════════════════════════════════════════════════════════════════

## §06 · SECURITY CHECKLIST

| # | Control | Implementation | Status |
|---|---------|----------------|--------|
| 1 | TLS 1.2+ everywhere | Cloudflare default | ✅ Default |
| 2 | Webhook HMAC signature verification | `OBP_WEBHOOK_SECRET` per sub-brand | ⏳ D5 |
| 3 | API key rotation policy | 90 days, manual | ⏳ D10 |
| 4 | No PAN/CVV storage in OBP | Tokenize via PJP only | ✅ Architecture rule |
| 5 | Audit log all `/invoices` writes | Cloudflare D1 + R2 archive | ⏳ D7 |
| 6 | Rate limit checkout endpoint | 60 req/min/IP via Cloudflare Rules | ⏳ D3 |
| 7 | Webhook replay protection | Nonce check + timestamp ±5min window | ⏳ D5 |
| 8 | Refund flow requires 2-step confirmation | UI + Slack approval | ⏳ D14 |

═══════════════════════════════════════════════════════════════════════════════

## §07 · TEST SCENARIOS (SMOKE)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| T1 | QRIS happy-path BarberKas IDR 49,000 | Invoice created → paid → webhook fired → entitlement active |
| T2 | BCA VA expired (timeout > 24h) | Invoice → `expired`, no settlement, no entitlement |
| T3 | Webhook delivery fails 3× | Retried at 30s, 2min, 10min; alert if dead |
| T4 | Duplicate `Idempotency-Key` | Returns cached invoice, no double-charge |
| T5 | Customer dispute → chargeback via Duitku | OBP receive chargeback notice → debit sub-brand refund pool |
| T6 | Daily reconciliation drift IDR 0 | Job pass, no alert |
| T7 | Refund partial IDR 20,000 from IDR 49,000 invoice | PJP refund → OBP ledger adjust → sub-brand notified |

═══════════════════════════════════════════════════════════════════════════════

**END OF PAYMENT-FLOW-OBP v2.0**

*Doctrine date: 2026-05-21 · Owner: Haidar · Status: CANONICAL · Execute-Ready*
