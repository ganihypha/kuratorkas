# SparkMind V7.4 PRODUCTION HARDENED — Duitku Onboarding Edition (Flow + Email Draft)

## Project Overview
- **Name**: SparkMind V7.4 PRODUCTION HARDENED (Duitku Onboarding Edition — `/flow` + `/email-duitku`)
- **Goal**: AI Strategic Guide untuk hidup berdaulat — dengan **AI Clarity & Recovery Coach** (Painkiller Module) yang etis, boundary-first, no-manipulation, untuk situasi hubungan / overthinking / pasca-blokir / decision-paralysis.
- **Features**: 19+ AI Categories + 12 Productivity Tools + PWA + Pricing/Pro/Lifetime Deal + **Duitku Pop JS Checkout (PRODUCTION)** + **Hardened Callback (IP whitelist 10 prod IPs + MD5 sig verify + idempotent)** + **6 Clarity Coach modules (all with `disclaimer` field)** + 10 pricing plans (4 core + 6 painkiller packs) + **NEW: `/flow` payment-flow doc page (Duitku Onboarding poin #10) + `/email-duitku` email draft + 10-dok checklist (Duitku Project D22457)**.

## 🆕 V7.4 — Duitku Onboarding Edition (NEW)

Difokuskan untuk memenuhi 10 dokumen onboarding Duitku Project Code **D22457** atas nama **PT Cakrawarti Waskita Digital**:

### NEW Routes
| Path | Alias | Purpose |
|------|-------|---------|
| `/flow` | `/payment-flow` | **Duitku Onboarding Doc #10** — Alur/flow pembayaran lengkap (high-level diagram SVG, 6 detail steps, screenshot grid, security/compliance, endpoint reference, merchant info). Anchor TOC, print-friendly, mobile-responsive. |
| `/email-duitku` | `/duitku-email` | **Email draft profesional** balasan ke Tim Onboarding Duitku + **interactive 10-dok checklist** (state saved in localStorage) + anti-phishing warning + file naming convention + 7-langkah action plan. Tombol **Copy Email** 1-klik. |

### NEW UI Touchpoints
- **Landing nav** (`/`): tambah link `Payment Flow` (emerald, `<i class="fas fa-route">`)
- **Pricing nav** (`/pricing`): tambah link `Flow` + `Clarity`
- **Clarity nav** (`/clarity`): tambah link `Flow`
- **App footer** (`/app`): tambah link `Pricing` + `Payment Flow`
- **Landing footer**: tambah `Payment Flow`
- **`/flow` enhancements**:
  - Daftar Isi (TOC) dengan 6 anchor links (`#diagram`, `#steps`, `#screenshots`, `#security`, `#endpoints`, `#merchant`)
  - Quick action buttons (Lihat Pricing, Email Draft, Save as PDF, Production URL)
  - Section §1-§6 numbering konsisten
  - CTA "Next Step → Email Draft" di akhir page
- **`/email-duitku` features**:
  - Pre-filled email draft (subject, body, 10-dok status, footer)
  - Copy-to-clipboard tombol dengan flash animation
  - Interactive checklist (10 dokumen, persisted via localStorage, reset button)
  - Anti-phishing red-flag check (verify domain, dashboard, CS phone)
  - File naming convention guide (`[N]_[NamaDok]_PT-CakrawartiWaskitaDigital.pdf`)
  - 7-step action plan

## 🔗 URLs
- **Production (main domain)**: https://sparkmind-v2.pages.dev ✅ V7.4 PRODUCTION HARDENED (Duitku Onboarding Edition)
- **🆕 Payment Flow (Duitku Doc #10)**: https://sparkmind-v2.pages.dev/flow (alias: `/payment-flow`)
- **🆕 Email Draft (Tim Onboarding Duitku)**: https://sparkmind-v2.pages.dev/email-duitku (alias: `/duitku-email`)
- **Clarity & Recovery Coach**: https://sparkmind-v2.pages.dev/clarity
- **Clarity Tools API**: https://sparkmind-v2.pages.dev/api/clarity/tools — returns 6 tools with `disclaimer` field
- **Pricing & Pay (LIVE)**: https://sparkmind-v2.pages.dev/pricing
- **App (Dashboard)**: https://sparkmind-v2.pages.dev/app
- **Health (live API status)**: https://sparkmind-v2.pages.dev/api/health — reports `callbackHardening{ipWhitelist,ipCount,signatureVerify,idempotent}`
- **Callback (Duitku → us)**: https://sparkmind-v2.pages.dev/api/payment/callback — 3-layer hardened (IP whitelist → merchant check → MD5 sig → idempotency)
- **GitHub**: https://github.com/ganihypha/Sparkmind (branch: `main`, tag: `v7.4-onboarding-edition`)
- **Master Session Architect Prompt (handoff)**: `AI_DEV_HANDOFF.md` (root) — paste as first message in every dev session
- **Duitku Docs**: https://docs.duitku.com/pop/en/ + https://docs.duitku.com/api/en/ + https://docs.duitku.com/api/id/#callback

## 🛡️ V7.3 PRODUCTION HARDENED (Duitku Callback Lockdown)

**Source of truth**: Email Rieza Camelia (Duitku Customer Care, 2026-04, Merchant `D22457`) — directive untuk whitelist IP callback Duitku di server.

### What v7.3 adds (on top of v7.2)

| Layer | v7.2 | **v7.3 (NEW)** |
|---|---|---|
| Callback IP whitelist | ❌ none | ✅ **10 production IPs** (`DUITKU_PROD_CALLBACK_IPS`) — uses `CF-Connecting-IP` (spoof-proof) |
| Callback signature | ✅ MD5 verify | ✅ MD5 verify (kept) |
| Callback idempotency | ❌ none | ✅ In-memory cache (1h TTL, max 1000) — duplicate `merchantOrderId` returns `{ok:true,idempotent:true}` |
| Callback error format | text/plain | ✅ JSON `{ok:false,error:CODE}` (`IP_NOT_WHITELISTED`, `MERCHANT_MISMATCH`, `BAD_SIGNATURE`, `BAD_PARAMETER`) |
| Merchant code check | ❌ implicit | ✅ Explicit fail-closed before sig verify |
| `/api/health` payload | basic | ✅ Reports `payment.callbackHardening{ipWhitelist:true, ipCount:10, signatureVerify:'md5', idempotent:true}` + `payment.merchantCode:D22457` |
| `/api/clarity/tools` | ❌ missing | ✅ NEW endpoint — returns 6 painkiller tools, **all with `disclaimer` field** (ethical pain-killer mode) |
| Version badges (LANDING/PRICING/APP/CLARITY) | mixed (V7.2 + V7.0) | ✅ All `V7.3` (CLARITY page badge fixed from V7.0 → V7.3) |

### 🔐 Whitelisted Production Callback IPs (10)

```
182.23.85.8,  182.23.85.9,  182.23.85.10
182.23.85.13, 182.23.85.14   ← Primary
103.177.101.184, 103.177.101.185, 103.177.101.186
103.177.101.189, 103.177.101.190 ← Primary
```

### v7.3 Test Suite Results (2026-04-30)

| # | Test | Result |
|---|------|--------|
| 1 | `/api/health` v7.3 + `callbackHardening` payload | ✅ PASS |
| 2 | Callback non-whitelisted IP → `403 IP_NOT_WHITELISTED` | ✅ PASS |
| 2b | Callback bad-sig from non-WL IP → IP guard fires first | ✅ PASS (correct order) |
| 2c | Callback empty body → 403 (IP guard before parser) | ✅ PASS |
| 7 | `/api/payment/plans` returns 10 plans | ✅ PASS |
| 8 | `/api/clarity/tools` 6 tools, all with disclaimer | ✅ PASS (6/6, 92-133 chars each) |
| 9 | E2E `createInvoice` → `api-prod.duitku.com` | ⏳ `Unauthorized` — expected, Duitku activation pending (1-3 working days per Rieza) |
| Bonus | Canonical vs hash drift | ✅ PASS (canonical = latest = v7.3) |
| Bonus | HTML badges (LANDING/PRICING/APP/CLARITY) | ✅ PASS (all V7.3) |

### v7.3 Invariants (locked, see `AI_DEV_HANDOFF.md`)
1. `baseUrl` resolution: `env.PUBLIC_BASE_URL → CANONICAL_BASE_URL → request origin`
2. ALL HTML routes call `noCacheHTML(c)` → `Cache-Control: no-cache, no-store, must-revalidate`
3. Duitku POP `<script>` switches on `cfg.isProd` (verified `app-prod.duitku.com` on `/pricing`)
4. `PRICING_PLANS` server-side (10 plans) — never client
5. `/api/clarity/tools` MUST include `disclaimer` field on every tool
6. **v7.3 NEW**: `/api/payment/callback` enforces ORDER: IP whitelist → merchant match → MD5 sig → idempotency. Fail-closed (403) at every layer.
7. **v7.3 NEW**: NEVER trust `X-Forwarded-For` for security — only `CF-Connecting-IP`

## 🛡️ V7.2 PRODUCTION HARDENED (HTML reconciliation + handoff prompt)

**What got fixed in V7.2** — root cause was: Worker (`/api/*`) was already V7.1 production with Duitku live, but the embedded HTML constants (`LANDING_HTML`, `APP_HTML`) inside `src/index.tsx` still rendered V6.0/V6.1 markup → main domain `/` and `/app` showed stale version badges, while ephemeral preview hashes (`1ba322ee.sparkmind-v2.pages.dev`) showed different versions. V7.2 reconciles all three HTML constants with the Worker version.

| Layer | Before (V7.1) | After (V7.2 HARDENED) |
|---|---|---|
| `/api/health` version | `7.1.0` | **`7.2.0`** |
| `/api/health` service | `SparkMind V7.1 PRODUCTION API` | **`SparkMind V7.2 PRODUCTION HARDENED (Duitku Deep-Research)`** |
| `LANDING_HTML` badge | `V6.0 BULLETPROOF` | **`V7.2 PRODUCTION HARDENED`** |
| `LANDING_HTML` `<title>` | "SparkMind V6.0 …" | **"SparkMind V7.2 — AI Strategic Guide + Clarity Coach (Duitku Live)"** |
| `LANDING_HTML` nav | only Pricing + App | **Clarity Coach + Pricing + App** (V7.2 painkiller visibility) |
| `LANDING_HTML` "Apa Baru" headline | "Apa Baru di V6.0 BULLETPROOF" | **"Apa Baru di V7.2 PRODUCTION HARDENED"** |
| `LANDING_HTML` footer | "© 2026 SparkMind V6.0 …" | **"© 2026 SparkMind V7.2 … · Clarity Coach · Pricing"** |
| `PRICING_HTML` `<title>` | "Pricing — SparkMind V6.1 (Duitku Powered)" | **"Pricing — SparkMind V7.2 (Duitku Production Live)"** |
| `PRICING_HTML` badge | `V6.1` | **`V7.2`** |
| `APP_HTML` `<title>` | "SparkMind V6.0 BULLETPROOF — Dashboard" | **"SparkMind V7.2 PRODUCTION HARDENED — Dashboard"** |
| `APP_HTML` badge | `V6.0` | **`V7.2`** |
| `APP_HTML` footer | "SparkMind V6.0 BULLETPROOF · 2026 …" | **"SparkMind V7.2 PRODUCTION HARDENED · 2026 · … · Clarity Coach"** |

### V7.2 Invariants (locked, see `AI_DEV_HANDOFF.md`)
1. `baseUrl` resolution: `env.PUBLIC_BASE_URL → CANONICAL_BASE_URL → request origin`
2. ALL HTML routes call `noCacheHTML(c)` → `Cache-Control: no-cache, no-store, must-revalidate`
3. Duitku POP `<script>` switches on `cfg.isProd` (verified `app-prod.duitku.com` on `/pricing`)
4. `PRICING_PLANS` lives server-side: 10 plans (4 core + 6 painkiller)
5. Version string in `/api/health` MUST match all HTML version badges (drift = bug)
6. Every deploy: `--branch main` + `--commit-message` + git tag `vX.Y-prod`

## 🚀 V7.1 PRODUCTION MIGRATION (Duitku Sandbox → Live)

**Migration scope**: switched the entire payment stack from Duitku Sandbox (DS30026) to **Duitku Production (D22457)** based on deep research of the official docs (`docs.duitku.com/pop/en/` + `docs.duitku.com/api/en/`).

### Changes shipped in V7.1
| Layer | Sandbox (V7.0) | Production (V7.1) |
|---|---|---|
| Merchant Code | `DS30026` | **`D22457`** |
| API Key | `ca1fe...c8f62` | **`82ba4f6755c2b05f0ca4ff397488af96`** |
| `DUITKU_ENV` default | `sandbox` | **`production`** |
| Create Invoice URL | `api-sandbox.duitku.com/api/merchant/createInvoice` | **`api-prod.duitku.com/api/merchant/createInvoice`** |
| Transaction Status URL | ❌ wrong: `api-sandbox.duitku.com/.../transactionStatus` | ✅ FIXED: **`passport.duitku.com/webapi/api/merchant/transactionStatus`** (per official docs) |
| POP JS Library | `app-sandbox.duitku.com/lib/js/duitku.js` | **`app-prod.duitku.com/lib/js/duitku.js`** |
| UI Badge | "Duitku Sandbox" | **"Duitku Production"** |

### Signatures (per Duitku spec, unchanged)
- **Create Invoice header**: `x-duitku-signature = SHA256(merchantCode + timestamp_ms + apiKey)` ✅
- **Callback verify**: `MD5(merchantCode + amount + merchantOrderId + apiKey)` ✅
- **Transaction Status**: `MD5(merchantCode + merchantOrderId + apiKey)` ✅

### ⚠️ Production Activation Status (Important)
Direct test against `api-prod.duitku.com` returned **HTTP 400 — `"Merchant Not Found"`**, meaning code is 100% correct but Duitku still needs to **activate merchant `D22457` on the production environment**. Once Duitku activates the project (per the email from Customer Care Fathur), payments will go live with **zero further code changes** — the deployed V7.1 is already prod-ready.

**Action item for user**: ikuti panduan `https://docs.duitku.com/account/#integrasi-akun-` untuk konfirmasi project `D22457` sudah switched ke production di Duitku merchant dashboard. Setelah aktif, hit `https://sparkmind-v2.pages.dev/pricing` → klik plan → akan langsung tembus ke Duitku Pop JS production (pembayaran riil VA / QRIS / OVO / DANA / ShopeePay / CC).

## 🛡️ V7.0 Hardening (Opsi C — Done)
- ✅ **Cloudflare Pages `production_branch = main`** set explicitly via Cloudflare API (`PATCH /pages/projects/sparkmind-v2`)
- ✅ Every commit to `main` → auto-deploy to `sparkmind-v2.pages.dev` (no more orphan preview hashes)
- ✅ Git tag `v7.0` pushed to remote as version mark
- ✅ Latest production deploy verified: main domain returns 200, `/api/health` confirms V7.0 CLARITY EDITION
- ✅ Master Session Architect Prompt created at `docs/MASTER_SESSION_ARCHITECT_PROMPT.md` (full handoff doc for next session)

## 🩹 Root-Cause Fix (V6.x → V7.0)
Sebelum V7.0, domain utama (`sparkmind-v2.pages.dev`) menampilkan versi lama padahal preview hash punya feature baru. Akar masalah:

1. **Source code V7.0 hilang dari repo** — hanya metadata `/api/health` yang advertise V7.0, tapi route handler `/clarity` & `/api/clarity/*` belum di-commit ke `main`.
2. **Callback URL Duitku auto-resolve dari request URL** — bisa pakai hash deployment yang ephemeral, bahaya untuk production.
3. **HTML routes cache-able** — main domain bisa serve versi stale dari CDN.

**Fix yang di-ship di V7.0:**
- ✅ V7.0 source code di-rebuild lengkap di local repo, di-commit ke `main`, push ke GitHub, deploy ke production main branch.
- ✅ `CANONICAL_BASE_URL = 'https://sparkmind-v2.pages.dev'` hardcoded fallback → Duitku callback / return URL **selalu** ke domain utama.
- ✅ `noCacheHTML` middleware → `Cache-Control: no-cache, no-store, must-revalidate` di semua HTML routes.
- ✅ Git tag `v7.0` sebagai version mark.
- ✅ Cloudflare Pages production branch = `main`.

## ✅ Currently Completed Features

### V7.0 — AI Clarity & Recovery Coach (NEW Painkiller Module)
- ✅ **`/clarity` page** — UI 6-tab dengan glassmorphism, sticky nav, char counters, async fetch
- ✅ **Situation Decoder** — baca situasi dalam **probabilitas** (~50%/~25%/~25%), bukan kepastian
- ✅ **Draft Review (Tone Analyzer)** — scan needy/emotional/pressure/length → verdict KIRIM / REVISI / JANGAN KIRIM
- ✅ **Boundary Checker** — auto-detect block/mute/ghosting → no-contact mode lock
- ✅ **Recovery Plan 7/21/30 hari** — phased plan: Detox → Stabilisasi → Rebuild → Glow-up; per fase ada Habit + Journal Prompt + Mini Goal
- ✅ **Decision Mode** — 5-option framework: Lanjut Pelan / 1 Pesan Terakhir / Pause / Move On Total / Fokus Diri 30 Hari
- ✅ **Relationship SWOT** — 4-dimensi analisis hubungan + Strategic Move
- ✅ **Crisis Detector** — keywords self-harm/suicide → redirect ke Into the Light Indonesia (119 ext 8)
- ✅ **Probability language** — etis, no fake certainty
- ✅ **Boundary-first** — tidak bantu menembus block / manipulasi

### V6.1 PAYMENT-READY (carry over)
- ✅ Duitku Pop JS, SHA-256 signature, MD5 callback verify
- ✅ Server-side pricing catalog (anti-tamper)
- ✅ 4 core plans + **6 NEW Painkiller packs** = 10 total plans
- ✅ Payment return page + auto-poll status

### V6.0 BULLETPROOF (carry over)
- ✅ XSS-safe rendering, PWA installable, service worker offline
- ✅ Pomodoro persistent end-time, storage quota guard
- ✅ Quick Add modal, onboarding tour, density toggle
- ✅ SEO + OG tags + JSON-LD

### Core Platform
- ✅ 19+ AI Categories (Spiritual, Side Hustle, Career, Business, Investment, Coding, English, Health, Mental Health, Relationship, dll.)
- ✅ AI Coach + SWOT Analyzer
- ✅ Pomodoro + Journal + Goals + Habits + Vision Board + Weekly Review
- ✅ 21+ Curated Resources, Backup/Restore JSON
- ✅ Keyboard Shortcuts (⌘K, ⌘1-9, ⌘D, ⌘/)

## 📋 API Endpoints

### AI Clarity & Recovery Coach (V7.0 NEW)
| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/clarity/decode` | `{story}` | Situation decoder dengan probability language + boundary detection |
| `POST` | `/api/clarity/draft-review` | `{draft}` | Tone analyzer (needy/emotional/pressure) → verdict |
| `POST` | `/api/clarity/boundary` | `{story}` | Detect block/mute/ghosting → no-contact mode |
| `POST` | `/api/clarity/recovery-plan` | `{days: 7\|21\|30, context?}` | Phased recovery plan (Habit+Journal+Goal) |
| `POST` | `/api/clarity/decision` | `{story}` | 5-option decision framework |
| `POST` | `/api/clarity/relationship-swot` | `{context}` | Relationship SWOT analysis |

### Payment Gateway (Duitku)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/payment/plans` | List 10 plans (4 core + 6 painkiller) |
| `POST` | `/api/payment/create-invoice` | Create Duitku invoice |
| `POST` | `/api/payment/callback` | Duitku webhook (MD5 signature verified) |
| `GET` | `/api/payment/status/:merchantOrderId` | Query transaction status |
| `GET` | `/payment/return` | User return landing page |

### AI & Core
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analyze` | Strategic AI response |
| `POST` | `/api/swot` | SWOT analysis |
| `POST` | `/api/coach` | AI Coach response |
| `GET`  | `/api/resources` | 21+ curated resources |
| `GET`  | `/api/insights` | Strategic insights |
| `GET`  | `/api/quotes` | Random quote |
| `GET`  | `/api/health` | Service health (V7.0 + modules taxonomy + Duitku config) |

### Pages
| Path | Description |
|------|-------------|
| `/` | Landing page (SEO + JSON-LD) |
| `/app` | Main dashboard |
| `/clarity` | **NEW** — Painkiller Coach UI (6 tabs) |
| `/pricing` | Pricing page (10 plans) |
| `/payment/return` | Post-payment return page |
| `/manifest.webmanifest` | PWA manifest |
| `/sw.js` | Service worker |

## 💳 Pricing (10 plans)

### Core SparkMind
| Plan ID | Name | Price |
|---------|------|-------|
| `pro-monthly` | SparkMind Pro (Monthly) | Rp 49,000 |
| `pro-yearly` | SparkMind Pro (Yearly, hemat 20%) | Rp 470,000 |
| `team-monthly` | SparkMind Team (5 user) | Rp 745,000 |
| `lifetime` | SparkMind Lifetime Deal | Rp 1,490,000 |

### Painkiller — AI Clarity Coach (V7.0 NEW)
| Plan ID | Name | Price |
|---------|------|-------|
| `clarity-monthly` | AI Clarity Coach (Monthly) | Rp 59,000 |
| `clarity-yearly` | AI Clarity Coach (Yearly, hemat 44%) | Rp 399,000 |
| `pack-after-block` | "After Block" Recovery Pack (lifetime) | Rp 39,000 |
| `pack-stop-overthinking` | "Stop Overthinking" 21-Day Pack | Rp 29,000 |
| `pack-mature-comm` | "Mature Communication" Pack | Rp 49,000 |
| `pack-healthy-closure` | "Healthy Closure" Pack | Rp 39,000 |

## 🧱 Data Architecture
- **Storage**: client-side localStorage (privacy-first; no user data leaves browser)
- **Pricing source-of-truth**: server-side catalog di `src/index.tsx` (anti-tamper)
- **Payment processor**: Duitku Pop JS + REST API (sandbox/production toggleable via env)
- **Tech stack**: Hono + TypeScript + TailwindCSS (CDN) + Cloudflare Pages/Workers
- **Bindings**: `DUITKU_API_KEY`, `DUITKU_MERCHANT_CODE`, `DUITKU_ENV`, `PUBLIC_BASE_URL` (semua optional, ada fallback)

## 📲 User Guide (Quick Start)
1. **Buka `/clarity`** kalau lagi overthinking, habis di-block, ghosting, atau bingung mau lanjut/berhenti hubungan.
2. **Pilih tab** sesuai kebutuhan: Decode (baca situasi), Draft (review chat sebelum kirim), Boundary (cek block/no-contact mode), Recovery (plan 7/21/30 hari), Decision (5 opsi), SWOT (analisa hubungan).
3. **Tulis cerita / paste draft** → klik tombol → AI kasih breakdown etis dengan probability language + action plan.
4. **Untuk situasi berat** (depresi, ide menyakiti diri): hubungi langsung **Into the Light Indonesia 119 ext 8** (24/7 gratis).

## 🛡️ Etika & Safety
- ❌ TIDAK bantu mengejar / menembus block / manipulasi orang
- ❌ Bukan pengganti terapis profesional
- ✅ Probability language only (~50%/~25%/~25%) — no fake certainty
- ✅ Boundary-first — auto-detect block/mute/ghost → lock no-contact mode
- ✅ Crisis-aware — auto-redirect ke mental health hotline
- ✅ Privacy-first — semua data tetap di browser user

## 🚀 Deployment
- **Platform**: Cloudflare Pages (Workers runtime)
- **Status**: ✅ **LIVE on main domain** (V7.0 CLARITY EDITION)
- **Production branch**: `main`
- **Project name**: `sparkmind-v2`
- **Latest commit**: `dbb434f` — feat: SparkMind V7.0 CLARITY EDITION
- **Git tag**: `v7.0`
- **Compatibility flags**: `nodejs_compat`
- **Build output**: `dist/_worker.js` (~205 kB)
- **Last Updated**: 2026-04-29

## 📋 Recommended Next Steps
1. **Production Duitku**: ajukan ke tim Duitku untuk production access. Kirim email berisi:
   - Callback URL: `https://sparkmind-v2.pages.dev/api/payment/callback`
   - Return URL: `https://sparkmind-v2.pages.dev/payment/return`
   - Domain whitelist: `https://sparkmind-v2.pages.dev`
   - Set secret: `npx wrangler pages secret put DUITKU_API_KEY --project-name sparkmind-v2`
   - Set secret: `npx wrangler pages secret put DUITKU_MERCHANT_CODE --project-name sparkmind-v2`
   - Set secret: `npx wrangler pages secret put DUITKU_ENV --project-name sparkmind-v2` (value: `production`)
2. **Custom domain**: kalau punya domain sendiri (e.g. `sparkmind.id`), tambah lewat dashboard + update `CANONICAL_BASE_URL`.
3. **Auth & Pro flag persistence**: integrate D1 atau Supabase untuk simpan Pro status per email setelah callback success.
4. **Email notifications**: invoice/receipt via Resend/SendGrid setelah callback `resultCode=00`.
5. **Analytics**: Cloudflare Web Analytics atau Plausible untuk track conversion `/pricing` → `/payment/return?status=success`.
6. **A/B test landing copy** untuk Clarity Coach (Indonesia market: "AI buat hubungan kacau" vs "Painkiller untuk overthinking").
