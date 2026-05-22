═══════════════════════════════════════════════════════════════════════════════

# 🏛️ BRAND ARCHITECTURE v2.0 — 4-LAYER SEPARATION DOCTRINE

## Brand · Merchant · Domain · Compliance — Locked Lanes

**Codename**: `BRAND-ARCH-4LAYER v2.0`
**Doctrine Date**: 2026-05-21
**Owner**: Haidar — Sovereign AI Dev
**Status**: 🔒 CANONICAL · EXECUTE-READY
**Supersedes**: `BRAND-ARCH-4LAYER-v1.0.md`
**Companion of**: `MASTER-ARCHITECT-PROMPT v7.0`

═══════════════════════════════════════════════════════════════════════════════

## §00 · DOCTRINE STATEMENT

> **"Empat layer terpisah. Tidak boleh dicampur. Tidak boleh disebut sebagai satu entitas. Setiap layer memiliki domain, kontrak, dan compliance-nya sendiri."**

### Mengapa 4-Layer?
1. **Brand Layer** ≠ **Merchant Layer** karena regulator membedakan "siapa yang menerima dana" vs "siapa yang memasarkan produk"
2. **Merchant Layer** ≠ **Compliance Layer** karena compliance harus auditable independen, tidak terikat product roadmap
3. **Domain Layer** ≠ **Brand Layer** karena satu brand bisa punya banyak subdomain, dan satu domain bisa di-redirect tanpa mengubah brand

═══════════════════════════════════════════════════════════════════════════════

## §01 · LAYER MAP

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 · BRAND (publik / naratif / marketing)                  │
│  ───────────────────────────────────────────────────────────────  │
│  SparkMind (mother)                                               │
│   ├── BarberKas (sub-brand)                                       │
│   ├── KuratorKas (sub-brand)                                      │
│   ├── PaceLokal / RLO (sub-brand)                                 │
│   └── Nurani.OS (sub-brand)                                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ (all checkout routes via)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 · MERCHANT (legal / payment / tax)                      │
│  ───────────────────────────────────────────────────────────────  │
│  Oasis BI Pro — single MoR for ALL 4 sub-brands                  │
│  • Invoice issuer · Tax (PPN) handler · Settlement recipient     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ (binds to)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 · DOMAIN (DNS / SSL / routing)                          │
│  ───────────────────────────────────────────────────────────────  │
│  sparkmind.web.id          → mother site                         │
│  *.sparkmind.web.id        → sub-brand sites                     │
│  oasis-bi-pro.web.id       → OBP operator site                   │
│  pay.oasis-bi-pro.web.id   → checkout orchestrator               │
│  api.sparkmind.web.id      → public API gateway                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ (audited under)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4 · COMPLIANCE (regulatory / DPO / PSE / audit)           │
│  ───────────────────────────────────────────────────────────────  │
│  • PSE Kominfo umbrella  (OBP)                                   │
│  • DPO appointment (Haidar self-appointed)                       │
│  • UU PDP DPIA registry                                          │
│  • PJP merchant agreement (Duitku, Xendit)                       │
│  • Quarterly compliance review                                   │
└─────────────────────────────────────────────────────────────────┘
```

═══════════════════════════════════════════════════════════════════════════════

## §02 · LAYER 1 — BRAND DOCTRINE

### 2.1 SparkMind — Mother Brand

| Attribute | Value |
|-----------|-------|
| Type | Mother brand publik (ecosystem narrative) |
| Domain | `sparkmind.web.id` |
| Voice | Sovereign · Spiritual · Tech-first · Bahasa Indonesia + technical English |
| Tagline | *"Sovereign AI Dev untuk Founder & Komunitas Indonesia"* |
| Tidak menerima dana | ❌ Tidak pernah jadi merchant |
| Visual ID | Logo SparkMind (sovereign sigil) · Color: deep indigo + gold accent |

### 2.2 Sub-Brand Doctrine — 4 LANES LOCK

| # | Sub-Brand | Domain | Produk Inti | Primary Audience |
|---|-----------|--------|-------------|------------------|
| 1 | **BarberKas** | `barberkas.sparkmind.web.id` | POS + kas digital untuk barbershop | Owner barbershop UMK |
| 2 | **KuratorKas** | `kuratorkas.sparkmind.web.id` | POS + revenue tracking untuk creator/educator | Curator workshop, dance studio, course creator |
| 3 | **PaceLokal (RLO)** | `pacelokal.sparkmind.web.id` | Race registration + tracker untuk solo runners & lomba lokal | Runner & race organizer |
| 4 | **Nurani.OS** | `nurani.os.sparkmind.web.id` | Sovereign Spiritual OS — membership & content platform | Spiritual practitioner sovereignty-seeker |

**Lock rule**: Tidak boleh tambah sub-brand ke-5 sebelum D60. Fokus eksekusi.

### 2.3 Brand Narrative — DO / DON'T

| ✅ DO | ❌ DON'T |
|-------|----------|
| Sebut SparkMind sebagai "ekosistem" | Sebut SparkMind sebagai "perusahaan" |
| Sub-brand punya identitas visual sendiri | Pakai SparkMind logo di sub-brand sebagai primary |
| Mention Oasis BI Pro hanya di checkout/invoice/footer | Mention OBP di marketing/landing page |
| Cross-link antar sub-brand sebagai "bagian dari SparkMind" | Cross-promote sub-brand di hero section default |

═══════════════════════════════════════════════════════════════════════════════

## §03 · LAYER 2 — MERCHANT DOCTRINE

### 3.1 Oasis BI Pro — Merchant-of-Record

| Attribute | Value |
|-----------|-------|
| Type | Merchant-of-Record (MoR) untuk SELURUH sub-brand SparkMind |
| Domain | `oasis-bi-pro.web.id` (operator site) + `pay.oasis-bi-pro.web.id` (checkout) |
| Verified at | Duitku ✅ · Xendit ⏳ (target D7) |
| Bank Account | BCA atas nama OBP/Haidar (single beneficial owner) |
| NPWP | <OBP NPWP> (lengkapi sebelum public launch) |
| Voice | Profesional · Backend-only · Tidak masuk marketing copy |

### 3.2 Merchant ↔ Brand Contract (Internal B2B)
- Setiap sub-brand sign **internal B2B agreement** dengan OBP (template di `/legal/templates/MoR-B2B.md`)
- Klausa wajib: revenue split, refund pool 5%, dispute escalation, termination notice
- Walaupun beneficial owner sama (Haidar), kontrak tertulis WAJIB untuk audit trail

### 3.3 Future MoR Migration Plan
- Saat scale > 100K MAU atau revenue > IDR 50M/bulan → reconsider:
  - Apply PT formal untuk SparkMind → SparkMind jadi own merchant
  - Atau apply PJSP-C licence → SparkMind = aggregator
- Defer to **v8.0 doctrine** roadmap

═══════════════════════════════════════════════════════════════════════════════

## §04 · LAYER 3 — DOMAIN DOCTRINE

### 4.1 Domain Inventory

| Domain | Type | Role | DNS Provider | SSL | Status |
|--------|------|------|--------------|-----|--------|
| `sparkmind.web.id` | Apex | Mother brand site | Cloudflare | Auto | Live |
| `www.sparkmind.web.id` | Subdomain | Redirect to apex | Cloudflare | Auto | Live |
| `barberkas.sparkmind.web.id` | Subdomain | BarberKas frontend | Cloudflare | Auto | Live |
| `kuratorkas.sparkmind.web.id` | Subdomain | KuratorKas frontend | Cloudflare | Auto | Live |
| `pacelokal.sparkmind.web.id` | Subdomain | PaceLokal (RLO) frontend | Cloudflare | Auto | ⏳ D7 |
| `nurani.os.sparkmind.web.id` | Subdomain | Nurani.OS frontend | Cloudflare | Auto | ⏳ D14 |
| `api.sparkmind.web.id` | Subdomain | Public API gateway | Cloudflare Workers | Auto | ⏳ D10 |
| `oasis-bi-pro.web.id` | Apex | OBP operator site | Cloudflare | Auto | Live |
| `pay.oasis-bi-pro.web.id` | Subdomain | Checkout orchestrator | Cloudflare Workers | Auto | ⏳ D5 |
| `admin.oasis-bi-pro.web.id` | Subdomain | OBP admin dashboard | Cloudflare Workers + Access | Auto | ⏳ D10 |

### 4.2 DNS Rule
- ALL domains on Cloudflare (100% Cloudflare-Native stack lock)
- DNSSEC enabled
- CAA records: `letsencrypt.org` + `pki.goog` only
- No wildcard cert (issue per subdomain via Cloudflare Universal SSL)

═══════════════════════════════════════════════════════════════════════════════

## §05 · LAYER 4 — COMPLIANCE DOCTRINE

### 5.1 Compliance Stack

| Area | Owner | Document | Review Cycle |
|------|-------|----------|--------------|
| PSE Kominfo registration | Haidar | `compliance/PSE-umbrella-OBP.pdf` | Annual |
| UU PDP DPO appointment | Haidar (self-DPO) | `compliance/DPO-appointment.md` | On change |
| DPIA per sub-brand | Haidar | `compliance/DPIA-{sub-brand}.md` | Per major feature |
| Privacy Policy | Haidar | `legal/privacy-policy.md` (synced per subdomain) | Quarterly |
| Terms of Service | Haidar | `legal/terms-of-service.md` | Quarterly |
| MoR B2B agreements | Haidar | `legal/MoR-B2B-{sub-brand}.md` | Annual |
| PJP merchant attestation | Haidar | `compliance/PJP-attestation.md` | When PJP requests |
| Quarterly compliance audit | Haidar | `compliance/audit-{YYYY-Qn}.md` | Quarterly |

### 5.2 Audit Cadence
- **Weekly**: webhook health, settlement drift
- **Monthly**: PJP statement reconciliation
- **Quarterly**: Compliance audit (DPO + PSE + tax)
- **Annually**: Full doctrine review + brand architecture re-confirmation

═══════════════════════════════════════════════════════════════════════════════

## §06 · LAYER ANTI-PATTERN (FORBIDDEN)

| ❌ Anti-Pattern | Why Forbidden |
|----------------|---------------|
| Customer mengira "SparkMind" yang menerima dana | Melanggar disclosure UU 8/1999 Perlindungan Konsumen |
| Receipt invoice atas nama "BarberKas" tanpa mention OBP | Tidak ada legal entity "BarberKas" — invalid invoice |
| Marketing page sebut "Powered by Oasis BI Pro" sebagai endorsement | Confusing brand layer ↔ merchant layer |
| OBP punya social media + content marketing sendiri | OBP = backend; tidak boleh kompetisi dengan SparkMind narrative |
| Sub-brand setup own bank account untuk terima dana langsung | Bypass MoR; ilegal dalam doctrine v7.0 |
| Pakai personal email Haidar di footer compliance | DPO contact harus `dpo@oasis-bi-pro.web.id` (entity-bound) |
| Sub-brand 5+ tanpa upgrade v8.0 doctrine | Violates 4-lane lock |

═══════════════════════════════════════════════════════════════════════════════

## §07 · BRAND ASSET INVENTORY (CHECKLIST)

| Asset | SparkMind | BarberKas | KuratorKas | PaceLokal | Nurani.OS | OBP |
|-------|:--------:|:---------:|:----------:|:---------:|:---------:|:---:|
| Logo (SVG + PNG) | ✅ | ✅ | ✅ | ⏳ | ⏳ | ✅ |
| Color palette | ✅ | ✅ | ⏳ | ⏳ | ⏳ | ✅ |
| Typography lock | ✅ | ✅ | ⏳ | ⏳ | ⏳ | ✅ |
| Voice guide | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ✅ |
| Favicon | ✅ | ✅ | ✅ | ⏳ | ⏳ | ✅ |
| Social meta image (OG) | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Email signature | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ✅ |
| Privacy policy localized | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

**Target D60**: 100% checklist green across all 6 entities.

═══════════════════════════════════════════════════════════════════════════════

**END OF BRAND-ARCH-4LAYER v2.0**

*Doctrine date: 2026-05-21 · Owner: Haidar · Status: CANONICAL · Execute-Ready*
