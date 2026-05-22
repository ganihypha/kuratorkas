═══════════════════════════════════════════════════════════════════════════════

# ⚖️ COMPLIANCE & RISK MATRIX v2.0

## BI · OJK · UU PDP · PSE Kominfo — SparkMind / Oasis BI Pro

**Codename**: `COMPLIANCE-RISK-MATRIX v2.0`
**Doctrine Date**: 2026-05-21
**Owner**: Haidar — Sovereign AI Dev (acting DPO)
**Status**: 🔒 CANONICAL · EXECUTE-READY
**Supersedes**: `COMPLIANCE-RISK-MATRIX-v1.0.md`
**Companion of**: `MASTER-ARCHITECT-PROMPT v7.0` · `DR-OBP-HYBRID v2.0`

═══════════════════════════════════════════════════════════════════════════════

## §00 · EXECUTIVE SUMMARY

| Domain | Status (Now) | Target D60 | Owner |
|--------|:------------:|:----------:|-------|
| BI (PBI 10/2025 alignment) | 🟡 Aware, not yet impacted | 🟢 Documented attestation | Haidar |
| OJK | 🟢 Not in scope (merchant, not PJP/IKD) | 🟢 Quarterly re-assess | Haidar |
| UU PDP + DPO | 🔴 No DPO appointed | 🟢 DPO appointed + DPIA done | Haidar |
| PSE Kominfo | 🔴 Not registered | 🟢 Umbrella under OBP registered | Haidar |
| PJP Merchant Agreements | 🟡 Duitku live; Xendit pending | 🟢 Both signed + attested | Haidar |
| Tax (PPN/PPh) | 🟡 Not PKP yet | 🟡 Monitor revenue, register PKP saat threshold | Haidar |
| Consumer Protection (POJK 22/2023) | 🟡 ToS draft | 🟢 ToS + complaint channel published | Haidar |

═══════════════════════════════════════════════════════════════════════════════

## §01 · BANK INDONESIA (BI) MATRIX

### 1.1 PBI No. 10/2025 — Sistem Pembayaran (effective 31 Maret 2026)

| Requirement | Applicable to OBP/SparkMind? | Action |
|-------------|:---------------------------:|--------|
| PJP categorization (PJSP-A/B/C) | ❌ Tidak (we are merchant, not PJP) | Document position in `compliance/BI-merchant-position.md` |
| RBSP submission (Risk-Based Supervision Plan) | ❌ Tidak (PJP-only) | Monitor PJP (Duitku/Xendit) requests on merchant due-diligence |
| TIKMI assessment | ❌ Tidak (PJP-only) | N/A |
| Capital requirement | ❌ Tidak | N/A |
| Reporting to BI | ❌ Tidak langsung | Via Duitku/Xendit aggregated |
| Compliance with BI consumer protection rules | ✅ Indirect (via PJP) | Mirror in our own ToS + Privacy Policy |

### 1.2 BI Risk Triggers (re-assess if)
- SparkMind/OBP transaction volume > IDR 1B/month
- Number of sub-brands > 10
- We start storing PAN/CVV (forbidden in current doctrine)
- We start cross-border settlement
- We apply for PJSP-C licence

═══════════════════════════════════════════════════════════════════════════════

## §02 · OJK MATRIX

| Regulation | Scope | Applicable? | Action |
|-----------|-------|:-----------:|--------|
| POJK 10/2022 — Fintech P2P | Lending platforms | ❌ | Not in scope |
| POJK 13/2018 — IKD | Innovation Digital Finance sandbox | ⚠️ Watchlist | Re-assess saat scale |
| POJK 22/2023 — Konsumen Sektor JK | Consumer protection | 🟡 Best practice | Implement complaint channel + ToS |
| POJK 57/2020 — Securities Crowdfunding | Equity/debt crowdfunding | ❌ | Not in scope |
| POJK 11/2024 — AI in Financial Services | AI use in finance | 🟡 Watchlist | Monitor; our AI use is doctrine-aided, not customer-facing decisioning |

═══════════════════════════════════════════════════════════════════════════════

## §03 · UU PDP MATRIX (UU 27/2022 + MK 151/PUU-XXII/2024)

### 3.1 Core Obligations

| Obligation | Article | Status | Action D60 |
|-----------|---------|:------:|------------|
| Lawful basis for processing | UU PDP Art. 20 | 🟡 Need explicit consent flow | Add consent checkbox at signup |
| Data Subject Rights (access, rectify, erase) | Art. 5-15 | 🔴 No process | Build self-service portal |
| Data Protection Impact Assessment (DPIA) | Art. 39 | 🔴 Not done | Create DPIA per sub-brand |
| Breach notification (≤ 72h to authority + subjects) | Art. 46 | 🔴 No procedure | Create runbook |
| DPO appointment | Art. 53-55 + MK 151 | 🔴 Not appointed | **D1**: Haidar self-appoint |
| Cross-border transfer compliance | Art. 56 | 🟡 Cloudflare data residency | Document data flow map |
| Records of processing activities | Art. 22 | 🔴 Not maintained | Create `compliance/ROPA.md` |
| Privacy Notice (Privacy Policy) | Art. 21 | 🟡 Draft only | Publish per subdomain |

### 3.2 DPO Specific (MK 151/PUU-XXII/2024 expansion)

**Putusan MK 30 Juli 2025** memperluas mandate DPO — sekarang likely applicable untuk operasi fintech-scale, tanpa quantitative threshold formal.

**Action mandatory (D1-D7)**:
1. ✅ Letter of Appointment internal: "Haidar appointed as DPO of Oasis BI Pro and SparkMind ecosystem"
2. ✅ Setup `dpo@oasis-bi-pro.web.id` (forward ke owner inbox)
3. ✅ Publish DPO contact di:
   - Footer semua subdomain
   - Privacy Policy section "Contact our DPO"
   - About page Oasis BI Pro
4. ✅ Internal log: setiap incident dicatat dengan DPO sign-off (kasus single-operator = sign-off ke diri sendiri, tetap dokumentasikan)
5. ✅ Annual DPO statement: ringkasan aktivitas tahunan untuk audit trail

═══════════════════════════════════════════════════════════════════════════════

## §04 · PSE KOMINFO MATRIX (Permenkominfo 5/2020)

### 4.1 Strategi Umbrella

| Item | Decision |
|------|----------|
| Registrant | **Oasis BI Pro** sebagai single PSE umbrella |
| Tipe PSE | Lingkup Privat (bukan Publik) |
| Kategori | E-commerce + Financial Service (sub-category: payment intermediary) |
| Subdomain wajib dilisting | Semua 10 subdomain dari §04.1 di brand-arch doc |
| Renewal cycle | Annual |

### 4.2 PSE Compliance Stack
- Filter konten (UU ITE) — meskipun B2B, minimum: report channel di setiap subdomain
- Akses lawful interception — siap diberikan ke aparat berwenang dengan court order
- Lokasi data center — Cloudflare global; document Singapore region sebagai primary
- Sistem pemantauan & pencatatan trafik — Cloudflare logs (≥ 90 hari)

### 4.3 PSE Risk
- Pendaftaran ditolak karena nama brand "Oasis BI" dianggap menyerupai entitas BI → siap rename plan B `oasis-pro.web.id`
- Subdomain SparkMind di-flag karena tidak di-list → solution: D14 update PSE listing setiap tambah subdomain

═══════════════════════════════════════════════════════════════════════════════

## §05 · TAX MATRIX (PPN, PPh, PKP)

| Aspect | Status | Action |
|--------|:------:|--------|
| NPWP OBP | ✅ Have | Sync di `compliance/NPWP-OBP.pdf` |
| PKP registration (PPN) | 🔴 Not yet (revenue < IDR 4.8M/year) | Monitor monthly; register saat 3 bulan berturut > IDR 400K |
| PPh 21 (employee) | ❌ N/A (no employee) | N/A |
| PPh 23 (service to vendor) | 🟡 PJP fee → PPh 23 berlaku? | Cek dengan konsultan pajak D30 |
| e-Faktur (saat PKP) | ⏳ Future | Setup Coretax integration |
| Withholding tax cross-border (Cloudflare USD invoice) | 🟡 PPh 26 jika applicable | Document monthly |

═══════════════════════════════════════════════════════════════════════════════

## §06 · MASTER RISK REGISTER (TOP 20)

| # | Risk | L | I | Score | Mitigation | Owner | Due |
|---|------|:-:|:-:|:-----:|------------|-------|-----|
| 1 | Duitku/Xendit re-verify OBP multi-brand routing | M | H | 9 | Disclosure pack + B2B agreement | Haidar | D7 |
| 2 | Customer dispute landed at SparkMind not OBP | M | M | 6 | Clear footer + ToS disclosure | Haidar | D5 |
| 3 | PSE Kominfo flag unregistered subdomain | H | M | 9 | Register umbrella D14 | Haidar | D14 |
| 4 | UU PDP audit, no DPO appointed | M | H | 9 | Self-appoint DPO D1 | Haidar | D1 |
| 5 | MK 151 broader DPO mandate enforcement | M | H | 9 | Comply proactively | Haidar | D7 |
| 6 | OBP name confused with Bank Indonesia | L | H | 6 | Disclaimer "Not affiliated with BI" | Haidar | D7 |
| 7 | Tax PKP not registered, revenue threshold crossed silently | M | M | 6 | Monthly revenue dashboard | Haidar | Ongoing |
| 8 | Chargeback dispute internal between sub-brand & OBP | M | M | 6 | Internal B2B: 5% refund pool | Haidar | D14 |
| 9 | SparkMind brand TM conflict | M | L | 3 | DJKI search + ® filing | Haidar | D30 |
| 10 | Cloudflare ToS update affects payment routing | L | M | 3 | Quarterly ToS review | Haidar | Q-cycle |
| 11 | PBI 10/2025 amendment redefines merchant as PJP-C | L | H | 6 | Quarterly BI review + PT-ready plan | Haidar | Q-cycle |
| 12 | Webhook secret leak → fraudulent entitlement | L | H | 6 | Secret rotation + replay protection | Haidar | D5 |
| 13 | Settlement drift undetected for > 7 days | L | H | 6 | Daily recon + alert > IDR 50K | Haidar | D7 |
| 14 | API key compromise → bulk fake invoices | L | M | 3 | Rate limit + idempotency | Haidar | D5 |
| 15 | Sub-brand frontend XSS leak customer PII | L | H | 6 | CSP headers + automated scan | Haidar | D14 |
| 16 | Data breach → 72h notification window missed | L | H | 6 | Runbook + alert chain | Haidar | D7 |
| 17 | PJP outage during peak event | M | M | 6 | Auto-failover Duitku ↔ Xendit | Haidar | D10 |
| 18 | OBP single bank account frozen | L | H | 6 | Backup bank account + weekly drawdown | Haidar | D30 |
| 19 | Single-operator burnout (Haidar) | M | H | 9 | Sprint cadence + automation-first doctrine | Haidar | Ongoing |
| 20 | Doctrine drift across sessions (AI context loss) | M | M | 6 | Quick-start paste + handoff template | Haidar | Ongoing |

**Score legend**: Likelihood × Impact (L=1, M=2, H=3) — score ≥ 6 = active mitigation required.

═══════════════════════════════════════════════════════════════════════════════

## §07 · COMPLIANCE QUARTERLY REVIEW TEMPLATE

```markdown
# Compliance Quarterly Review — {YYYY-Qn}

## 1. Regulatory Changes Since Last Review
- BI: [changes]
- OJK: [changes]
- UU PDP / Kominfo: [changes]
- Tax DJP: [changes]

## 2. Risk Register Movements
- New risks added: [#]
- Risks closed: [#]
- Risks elevated: [#]

## 3. Incidents This Quarter
- Total: [#]
- P1 (data breach / payment outage): [#]
- All notified to DPO + logged: ✅ / ❌

## 4. DPO Statement
- [Haidar self-statement of DPO activities]

## 5. Actions Next Quarter
- [list]

Signed: Haidar (Owner + DPO)
Date: YYYY-MM-DD
```

═══════════════════════════════════════════════════════════════════════════════

**END OF COMPLIANCE-RISK-MATRIX v2.0**

*Doctrine date: 2026-05-21 · Owner: Haidar (acting DPO) · Status: CANONICAL · Execute-Ready*
