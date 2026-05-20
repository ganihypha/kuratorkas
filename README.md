# 👗 KuratorKas × Curator.OS

> **AI Stylist + POS untuk UMKM Fashion Indonesia**
> Owner: Reza Estes / Haidar — Sovereign AI Dev
> Doctrine: **Master-Architect v5.0 CANONICAL** · `2026-05-19`
> Status: **EXECUTE-READY · PUBLIC-SAFE · LIVE ON CLOUDFLARE**

---

## 1. Project Overview

- **Name**: KuratorKas × Curator.OS
- **Goal**: Setiap UMKM fashion di Indonesia berhak punya AI Stylist pribadi yang memahami katalog produk, mengikuti tren, dan menghasilkan konten yang menjual — semua dalam satu platform.
- **Tagline**: *“Sovereign AI Stylist + POS — dibangun di edge.”*
- **Tech Stack**: Hono 4 · TypeScript · Vite 6 · Cloudflare Pages (Workers) · D1 · KV · R2 · Workers AI · Tailwind CDN
- **Architecture**: Cloudflare-native edge, 5 Curator.OS multi-agent (stylist · content · trend · pricing · marketplace), monorepo `apps/*` + `packages/*`

---

## 2. 🔗 URLs (Live)

| Channel | URL |
|---|---|
| 🌎 **Production (Cloudflare Pages)** | <https://kuratorkas.pages.dev> |
| 🔧 **Branch deploy (main)** | <https://main.kuratorkas.pages.dev> |
| 🧪 **Sandbox dev (PM2, ephemeral)** | https://3000-ispnrffa25uas57hdsyna-2b54fc91.sandbox.novita.ai |
| 🐙 **GitHub repo** | <https://github.com/ganihypha/kuratorkas> |

---

## 3. ✅ Currently Completed Features

### 3.1 Landing & App Shell
- `/` — **Dark Sovereign** landing page (Indigo + Gold) — hero, 5 agent cards, pricing teaser, CTA
- `/app` — App shell (dashboard placeholder, ready to wire to live API)
- Custom **404** page (`/404`) — branded fallback
- `/static/*` served via `hono/cloudflare-workers` (edge-safe)

### 3.2 Curator.OS — 5 AI Agents (LIVE)
| Agent | Endpoint | Status | Capabilities |
|---|---|---|---|
| 🪄 **AI Stylist** | `POST /api/stylist/generate` | live | outfit-combo, occasion-match, style-tag, heuristic+AI |
| 📝 **Content Curator** | `POST /api/content/generate` | live | caption, hashtag (15–20), video-hooks, CTA |
| 📈 **Trend Curator** | `GET /api/trend/forecast` | live | weekly forecast, theme detection |
| 💰 **Pricing AI** | `GET /api/pricing/recommendations` | live | dynamic pricing, margin guard |
| 🛒 **Marketplace Sync** | `GET /api/marketplace/status` | scaffold | Shopee · Tokopedia · TikTok Shop |

### 3.3 Auth (JWT)
- `POST /api/auth/register` — email + password (PBKDF2-SHA256 hash, sovereign-grade)
- `POST /api/auth/login` — returns signed JWT (`JWT_SECRET` secret)
- `GET /api/auth/me` — authenticated profile

### 3.4 Commerce (POS)
- `GET /api/products`, `POST /api/products`, `GET/:id`, `PUT/:id`, `DELETE/:id`
- `GET /api/orders`, `POST /api/orders` — checkout (multi-item)
- `GET /api/dashboard/summary` — products / orders / outfits / content / revenue (today + 30d)

### 3.5 Billing (Duitku-ready)
- `GET /api/billing/plans` — 4 tiers (Free · Starter Rp 99k · Pro Rp 299k · Sovereign Rp 799k)
- `POST /api/billing/checkout` — Duitku invoice creation (when secrets set)
- `POST /api/billing/callback` — 3-layer hardening: IP whitelist → MD5 sig verify → idempotent
- `GET /api/billing/history` — payment log per user

### 3.6 Meta
- `GET /api/health` — service status, bindings probe, doctrine signature
- `GET /api/agents` — Curator.OS agent registry

---

## 4. 🗺️ Functional Entry URIs (Summary)

### Public (no auth)
```
GET  /                          → Landing (HTML)
GET  /app                       → App shell (HTML)
GET  /static/*                  → Assets (CSS/JS)
GET  /api/health                → Health probe
GET  /api/agents                → Curator.OS agent list
GET  /api/billing/plans         → Pricing tiers
POST /api/auth/register         → { email, password, name }
POST /api/auth/login            → { email, password }  → { token, user }
POST /api/billing/callback      → Duitku webhook (signed)
```

### Authenticated (`Authorization: Bearer <jwt>`)
```
GET    /api/auth/me
GET    /api/products            ?q=&category=&limit=&offset=
POST   /api/products            { name, sku, category, price, stock, ... }
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id
GET    /api/orders
POST   /api/orders              { items:[{ product_id, qty, price }], customer, payment_method }
POST   /api/stylist/generate    { occasion, season?, budget?, vibe? }
GET    /api/stylist/outfits
POST   /api/content/generate    { product_id, platform, tone }
GET    /api/content
GET    /api/trend/forecast      ?platform=tiktok|ig
GET    /api/pricing/recommendations
GET    /api/marketplace/status
POST   /api/billing/checkout    { plan_id }  → Duitku payment URL
GET    /api/billing/history
GET    /api/dashboard/summary
```

---

## 5. 📦 Data Architecture

### 5.1 Storage Services
| Binding | Service | Purpose |
|---|---|---|
| `DB` | Cloudflare **D1** (SQLite) | Users, products, orders, outfits, content, payment_logs |
| `KV` | Cloudflare **KV** | Session cache, rate-limit counters, trend cache |
| `R2` | Cloudflare **R2** | Product photos, generated images, exports |
| `AI` | Cloudflare **Workers AI** | `@cf/meta/llama-3.1-8b-instruct` for stylist + content |

### 5.2 Schema (D1) — see `migrations/0001_initial_schema.sql`
- `users` (id, email, password_hash, name, subscription_tier, created_at)
- `products` (id, user_id, name, sku, category, price, stock, image_url, tags, is_active)
- `orders` + `order_items` (multi-item POS)
- `outfits` (AI Stylist results) · `content` (Content Curator output)
- `payment_logs` (Duitku integration · `0002_payment_logs.sql`)

### 5.3 Monorepo Packages (`packages/*`)
| Package | Purpose |
|---|---|
| `@sparkmind/core` | Crypto helpers (newId, hash, escapeHtml, formatIDR, safeJSON) |
| `@sparkmind/auth` | JWT sign/verify, PBKDF2 password hashing, authMiddleware |
| `@sparkmind/curator-os` | 5 agents (stylist, content, trend, pricing, marketplace) + AIGatewayCaller |
| `@sparkmind/pg-router` | Payment gateway router (Duitku, extensible) |
| `@sparkmind/analytics` | Event logger (to D1/KV) |
| `@sparkmind/ui-kit` | Shared CSS tokens & components |

---

## 6. 🚀 Deployment

### 6.1 Cloudflare Pages
- **Project**: `kuratorkas` (dedicated, separate from other SparkMind brands)
- **Production branch**: `main`
- **Output dir**: `./dist`
- **Compatibility date**: `2026-04-17`
- **Compatibility flags**: `nodejs_compat`

### 6.2 GitHub
- **Repo**: `ganihypha/kuratorkas` (dedicated repo for this brand)
- **Default branch**: `main`

### 6.3 Deploy commands
```bash
# Build
npm run build

# Deploy to production (main)
npx wrangler pages deploy dist --project-name kuratorkas --branch main

# Push to GitHub
git push origin main
```

### 6.4 First-time setup (bindings)
```bash
# Create D1 (production)
npx wrangler d1 create kuratorkas-production
#   → copy database_id into wrangler.jsonc under d1_databases

# Create KV
npx wrangler kv namespace create kuratorkas-kv
#   → copy id into wrangler.jsonc under kv_namespaces

# Create R2
npx wrangler r2 bucket create kuratorkas-assets

# Apply schema (production)
npx wrangler d1 migrations apply kuratorkas-production

# Set secrets
npx wrangler pages secret put JWT_SECRET           --project-name kuratorkas
npx wrangler pages secret put OPENAI_API_KEY       --project-name kuratorkas
npx wrangler pages secret put ANTHROPIC_API_KEY    --project-name kuratorkas
npx wrangler pages secret put DUITKU_API_KEY       --project-name kuratorkas
npx wrangler pages secret put DUITKU_MERCHANT_CODE --project-name kuratorkas
# ... and SHOPEE_*, TOKOPEDIA_*, TIKTOK_SHOP_* as needed
```

---

## 7. 🛠️ Local Development (Sandbox)

```bash
# 1. Install
npm install

# 2. Build
npm run build

# 3. Start (PM2)
pm2 start ecosystem.config.cjs

# 4. Test
curl http://localhost:3000/api/health
pm2 logs kuratorkas --nostream
```

**Note**: D1 binding is **disabled by default** in `ecosystem.config.cjs` for clean cold-start. App degrades gracefully (`bindings.d1: false` in `/api/health`). To enable local D1:
```bash
npx wrangler d1 migrations apply kuratorkas-production --local
# then edit ecosystem.config.cjs: add `--d1=DB --local` to args
```

---

## 8. 📋 User Guide (Quick Start)

1. **Visit landing** → <https://kuratorkas.pages.dev>
2. **Register account** → `POST /api/auth/register` with `{ email, password, name }`
3. **Login** → `POST /api/auth/login` → save the returned `token`
4. **Add products** → `POST /api/products` (header: `Authorization: Bearer <token>`)
5. **Generate outfit** → `POST /api/stylist/generate { "occasion": "kondangan", "vibe": "elegant" }`
6. **Auto-caption** → `POST /api/content/generate { "product_id": "...", "platform": "tiktok" }`
7. **Upgrade plan** → `POST /api/billing/checkout { "plan_id": "starter" }` → Duitku URL

---

## 9. ⚠️ Features Not Yet Implemented

- ❌ Frontend SPA dashboard (current `/app` is shell only — wire to live API)
- ❌ Multi-marketplace live OAuth flow (Shopee/Tokopedia/TikTok Shop) — scaffold only
- ❌ R2 product image upload UI
- ❌ Bulk product import (CSV)
- ❌ Trend Curator scraping pipeline (currently mock data)
- ❌ Email notifications (need Resend / SendGrid binding)
- ❌ Admin panel
- ❌ Mobile PWA manifest

---

## 10. 🛣️ Recommended Next Steps

1. **Provision D1/KV/R2/AI bindings** (commands in §6.4) and apply migrations
2. **Set `JWT_SECRET`** + AI provider keys → enables real auth + Curator AI
3. **Wire `/app` dashboard** to call live endpoints (Axios already CDN-loaded)
4. **Implement R2 image upload** for product photos
5. **Connect Duitku** secrets → enables monetization end-to-end
6. **Build Marketplace OAuth flow** for Shopee/Tokopedia/TikTok Shop
7. **Set up GitHub Actions CI/CD** (`.github/workflows/` scaffolded)
8. **Add custom domain**: `npx wrangler pages domain add kuratorkas.com --project-name kuratorkas`

---

## 11. 🧭 Doctrine Alignment

This codebase implements the **MASTER-ARCHITECT-PROMPT v5.0** bundle (KuratorKas track) per:
- `01_KURATORKAS_PRD_v2.md` — Product Requirements
- `02_KURATORKAS_DESIGN_DOC_v2.md` — UX/UI + System Design (Dark Sovereign + Gold)
- `03_KURATORKAS_ARCHITECTURE_v2.md` — Cloudflare-native architecture
- `04_KURATORKAS_SM_TOD_v2.md` — Sprint Module Task Order (6 sprints)
- `05_CURATOR_OS_SPEC_v1.md` — Multi-agent specification
- `06_INTEGRATION_MAP_v2.md` — Cross-brand SparkMind ecosystem
- `07_EXECUTION_PLAN_v2.md` — 90-day roadmap

---

## 12. 📊 Status

| Property | Value |
|---|---|
| Platform | Cloudflare Pages |
| Status | ✅ **LIVE** |
| Tech | Hono · TypeScript · Vite · Tailwind CDN |
| Bundle size | 76.88 kB (`dist/_worker.js`) |
| Last deploy | 2026-05-20 |
| Doctrine | Master-Architect v5.0 CANONICAL |

---

**Built by Sovereign AI Dev · Path B Direct Bundle · 2026-05-20**
