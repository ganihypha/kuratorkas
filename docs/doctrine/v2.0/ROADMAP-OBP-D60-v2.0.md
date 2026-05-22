═══════════════════════════════════════════════════════════════════════════════

# 🗓️ ROADMAP v2.0 — 60-DAY SPRINT WITH LANE OBP EMBEDDED

## Sprint Day Calendar · 5 LANES + LANE OBP · Daily/Weekly/Phase Checkpoints

**Codename**: `ROADMAP-OBP-D60 v2.0`
**Doctrine Date**: 2026-05-21
**Owner**: Haidar — Sovereign AI Dev
**Status**: 🔒 CANONICAL · EXECUTE-READY
**Supersedes**: `ROADMAP-OBP-D60-v1.0.md`
**Sprint Period**: 2026-05-21 → 2026-07-20 (60 hari)
**Today**: D1 / D60

═══════════════════════════════════════════════════════════════════════════════

## §00 · LANE OVERVIEW

| Lane | Theme | Weight |
|------|-------|:------:|
| **L1 · Brand Layer** | SparkMind + 4 sub-brand visual & narrative | 15% |
| **L2 · Product Layer** | BarberKas, KuratorKas, PaceLokal, Nurani.OS dev | 30% |
| **L3 · Infra & Platform** | Cloudflare stack, API gateway, monorepo | 15% |
| **L4 · Growth & Community** | Beta tester, content, founder vow | 10% |
| **L5 · Doctrine & Ops** | Documentation, handoff, governance | 10% |
| **L6 · LANE OBP** *(NEW v7.0)* | Merchant-of-Record setup + compliance | **20%** |

**LANE OBP weight increased 20%** karena unblocks semua revenue path.

═══════════════════════════════════════════════════════════════════════════════

## §01 · PHASE MAP (60-DAY)

### Phase 1 · Foundation (D1–D14)
**Goal**: OBP merchant-of-record fully operational + DPO appointed + PSE registered + first live transaction routed via OBP

### Phase 2 · Acceleration (D15–D35)
**Goal**: All 4 sub-brand checkout flows live via OBP; first 50 paying customers; weekly settlement clean

### Phase 3 · Compounding (D36–D50)
**Goal**: Content/beta loop drives organic signups; monthly recurring revenue stabilized; quarterly compliance audit done

### Phase 4 · Hand-Off Ready (D51–D60)
**Goal**: Full doctrine v8.0 candidates drafted; bundles archived; sprint retrospective; D90 plan locked

═══════════════════════════════════════════════════════════════════════════════

## §02 · WEEK-BY-WEEK PLAN

### WEEK 1 (D1–D7) · OBP FOUNDATION

| Day | LANE | Task | Deliverable |
|----:|:----:|------|-------------|
| D1 | OBP | Self-appoint DPO + draft Letter of Appointment | `compliance/DPO-appointment.md` |
| D1 | OBP | Setup `dpo@oasis-bi-pro.web.id` alias | Email live |
| D2 | OBP | Draft Privacy Policy + ToS templates (BI/EN) | `legal/privacy-policy.md` + `legal/tos.md` |
| D2 | L5 | Lock 4-Layer Brand Architecture v2.0 | `04-brand-architecture/BRAND-ARCH-4LAYER-v2.0.md` ✅ |
| D3 | OBP | Cloudflare Workers init: `pay.oasis-bi-pro.web.id` skeleton | Worker deployed (hello-world) |
| D3 | L3 | Monorepo: add `obp-checkout` package | Package scaffolded |
| D4 | OBP | Duitku merchant attestation update — declare multi-brand routing | Confirmation email |
| D4 | OBP | Disclosure footer locked template → deploy ke semua subdomain | Footer live |
| D5 | OBP | Invoice API contract finalized (`POST /v1/invoices`) | OpenAPI spec committed |
| D5 | OBP | Webhook HMAC verification implemented | Unit tests pass |
| D6 | OBP | Internal B2B agreement template signed (Haidar to Haidar, audit-trail) | `legal/MoR-B2B-{brand}.md` × 4 |
| D6 | L5 | Publish DPO contact + Privacy Policy di SparkMind + OBP | Live pages |
| D7 | OBP | First end-to-end test: dummy BarberKas → OBP → Duitku → settle → entitlement | E2E test pass |

**Week 1 exit**: ✅ DPO appointed · ✅ Disclosure live · ✅ OBP checkout skeleton · ✅ E2E test pass

### WEEK 2 (D8–D14) · INTEGRATION + PSE

| Day | LANE | Task | Deliverable |
|----:|:----:|------|-------------|
| D8 | OBP | PSE Kominfo submission — umbrella under OBP | Submission receipt |
| D8 | L2 | BarberKas: integrate OBP checkout SDK | Checkout flow live (staging) |
| D9 | L2 | KuratorKas: integrate OBP checkout SDK | Checkout flow live (staging) |
| D9 | L2 | PaceLokal (RLO): integrate OBP checkout SDK | Checkout flow live (staging) |
| D10 | L2 | Nurani.OS: integrate OBP checkout SDK | Checkout flow live (staging) |
| D10 | L3 | API gateway: rate limiting + idempotency middleware | Middleware deployed |
| D11 | OBP | Reconciliation job (daily 02:00 WIB) | Job scheduled |
| D11 | OBP | Settlement dashboard MVP (admin.oasis-bi-pro.web.id) | Dashboard live |
| D12 | OBP | DPIA per sub-brand drafted | 4 × DPIA docs |
| D12 | L4 | Beta tester longlist (50 names) | `Doc-P1-Beta-Tester-Longlist-v1.1.md` |
| D13 | OBP | Xendit secondary integration | Xendit live as failover |
| D13 | L2 | All 4 sub-brands checkout flow → production toggle | Production checkout enabled |
| D14 | OBP | **MILESTONE: First LIVE transaction across all 4 sub-brands** | 4 successful charges |
| D14 | L5 | Week 2 retrospective + doctrine drift check | Retrospective doc |

**Week 2 exit**: ✅ PSE submitted · ✅ All 4 sub-brand checkout live · ✅ First live transactions · ✅ Recon dashboard

### WEEK 3 (D15–D21) · ACCELERATION

| Day | LANE | Task |
|----:|:----:|------|
| D15-D17 | L4 | Open beta to longlist · onboarding emails · Founder Vow X thread |
| D15-D21 | L2 | Bug bash from beta; iterate UX |
| D18 | OBP | First settlement reconciliation report (real numbers) |
| D19 | L3 | Audit log + R2 archive of all `/invoices` writes |
| D20 | OBP | Refund flow + 2-step approval |
| D21 | L5 | **Phase 1 wrap retrospective** · Phase 2 kickoff |

### WEEK 4 (D22–D28) · GROWTH LOOP
- Content cadence: 3 posts/week per sub-brand (40% educational, 30% case study, 30% sovereign narrative)
- KuratorKas + BarberKas partnership push (5 pilot operators each)
- PaceLokal first race registration event (Q3 2026 5K)
- Nurani.OS membership early-bird pricing

### WEEK 5 (D29–D35) · STABILIZE
- Monthly settlement clean (target: 0 unmatched > 24h)
- 50 paying customers cumulative
- Quarterly compliance review #1 (mini, since only 1 month live)
- Beta NPS survey

### WEEK 6 (D36–D42) · CONTENT COMPOUND
- Sovereign Tracker (RLO Tech Spec) MVP demo
- 3 case studies published (1 per active sub-brand)
- First MRR milestone (target: IDR 5M/month)

### WEEK 7 (D43–D49) · EXPAND
- Plugin marketplace concept (Cloudflare Workers as runtime)
- Cross-brand customer journey (e.g., KuratorKas customer → Nurani.OS membership offer)
- DPO quarterly statement #1 published

### WEEK 8 (D50–D56) · OPTIMIZE
- Performance: p95 checkout latency < 1.5s
- Refund pool reconciliation: 0 drift
- Tax: assess PKP threshold; if crossed, start registration
- Doctrine v8.0 brainstorm (cross-border? PJSP-C? PT formal?)

### WEEK 9 (D57–D60) · HAND-OFF
- D57: Full doctrine review + DIFF v7.0 → v8.0 candidate
- D58: Sprint retrospective + KPI summary
- D59: Archive bundle v2.0 → `v2.0-frozen.zip`
- D60: D90 plan locked + new SESSION-HANDOFF v3.0 published

═══════════════════════════════════════════════════════════════════════════════

## §03 · KPI DASHBOARD

| Pillar | D0 (Today) | D14 | D30 | D60 |
|--------|:----------:|:---:|:---:|:---:|
| **OBP MoR Pillar** | 60/100 | 80/100 | 88/100 | **92/100 🟢** |
| **DPO + UU PDP** | 10/100 | 70/100 | 85/100 | **95/100 🟢** |
| **PSE Registration** | 0/100 | 50/100 (submitted) | 80/100 (approved) | **100/100 🟢** |
| **Disclosure Footer** | 30/100 | 100/100 | 100/100 | **100/100 🟢** |
| **Cross-Brand Routing** | 0/100 | 70/100 | 90/100 | **95/100 🟢** |
| **Settlement Recon** | 0/100 | 50/100 | 70/100 | **85/100 🟢** |
| **Brand Asset Inventory** | 40/100 | 60/100 | 80/100 | **95/100 🟢** |
| **Paying Customers** | 0 | 5 | 25 | **75+** |
| **MRR (IDR)** | 0 | 250K | 2.5M | **8M+** |

═══════════════════════════════════════════════════════════════════════════════

## §04 · DAILY OPERATING RHYTHM

| Time (WIB) | Activity |
|-----------:|----------|
| 06:00 | Inbox + dashboard scan (10 min) |
| 06:30 | Doctrine paste + sprint day load (5 min) |
| 07:00 | LANE primary block (3h focused) |
| 10:00 | LANE secondary block (2h) |
| 13:00 | Customer/community reply window (1h) |
| 14:00 | LANE tertiary / ad-hoc (2h) |
| 16:00 | OBP settlement check + recon (15 min) |
| 17:00 | Daily log + tomorrow's top-3 lock (15 min) |
| Evening | Optional research / content / community |

═══════════════════════════════════════════════════════════════════════════════

## §05 · CRITICAL PATH (BLOCKING)

If ANY of these slip → entire sprint at risk:

1. **D1 DPO appointment** — without this, every day under UU PDP audit risk
2. **D7 E2E payment test** — without this, can't go live with real customers
3. **D8 PSE submission** — without this, every transaction technical violation
4. **D14 Cross-brand checkout live** — without this, no revenue unblocked
5. **D30 First clean settlement** — without this, can't trust ledger
6. **D60 D90 plan locked** — without this, Phase 5 chaos

═══════════════════════════════════════════════════════════════════════════════

## §06 · ROLLBACK PLAN (IF OBP MOR FAILS)

If at D14 the OBP-MoR pattern is rejected by Duitku/Xendit:

1. **Plan B1**: Push direct verification of SparkMind itself (parallel filing) — accept 60-day delay
2. **Plan B2**: Pivot to international MoR (Paddle for international + manual local for IDR)
3. **Plan B3**: Form PT formal under "PT SparkMind Indonesia" — incur cost + delay, but clean future

**Decision tree** documented at `compliance/OBP-rollback-plan.md`.

═══════════════════════════════════════════════════════════════════════════════

**END OF ROADMAP-OBP-D60 v2.0**

*Doctrine date: 2026-05-21 · Owner: Haidar · Status: CANONICAL · Execute-Ready*
