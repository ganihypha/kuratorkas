═══════════════════════════════════════════════════════════════════════════════

# 🔍 DEEP RESEARCH — OBP HYBRID STRATEGY v2.0

## SparkMind ⇄ Oasis BI Pro · Merchant-of-Record Hybrid · Indonesia Primary Jurisdiction

**Codename**: `DR-OBP-HYBRID v2.0`
**Doctrine Date**: 2026-05-21
**Owner**: Reza Estes / Haidar — Sovereign AI Dev (single-operator)
**Jurisdiction Primary**: 🇮🇩 Indonesia (BI · OJK · PSE Kominfo · UU PDP)
**Status**: 🔒 CANONICAL · EXECUTE-READY · PUBLIC-SAFE
**Supersedes**: `DR-OBP-HYBRID-v1.0.md` (2026-05-19)
**Companion of**: `MASTER-ARCHITECT-PROMPT v7.0`

═══════════════════════════════════════════════════════════════════════════════

## §00 · TL;DR — KENAPA OBP-HYBRID

SparkMind sebagai **mother brand publik** belum lulus verifikasi merchant Duitku/Xendit (kategori produk + nama brand + agregator-look-alike). Oasis BI Pro (`oasis-bi-pro.web.id`) **sudah lulus verifikasi** dan live menerima pembayaran. Daripada menunda peluncuran ekosistem SparkMind, doctrine v7.0 menetapkan **MoR (Merchant-of-Record) pattern**:

```
SparkMind (brand publik) ───► Oasis BI Pro (merchant legal) ───► Duitku/Xendit (PJP) ───► Bank Indonesia
       ↑ marketing/UX             ↑ MoR/settlement/invoice         ↑ payment processing        ↑ regulator
```

**Verdict legal (Indonesia 2026)**: ✅ Pattern ini **diperbolehkan** dengan disclosure + perjanjian kerjasama tertulis + pengakuan Oasis BI Pro sebagai entitas yang menerbitkan invoice dan menerima dana. Identik dengan model Stripe/Paddle MoR yang sudah diterima global, dan kompatibel dengan **PBI No. 10/2025** (kerangka baru sistem pembayaran BI, effective 31 Maret 2026).

═══════════════════════════════════════════════════════════════════════════════

## §01 · REGULATORY BACKBONE — INDONESIA 2026

### 1.1 Bank Indonesia (BI) — Sistem Pembayaran

| Regulasi | Tanggal Efektif | Relevansi OBP-Hybrid |
|---------|-----------------|----------------------|
| **PBI No. 10/2025** (Peraturan BI Sistem Pembayaran) | 31 Maret 2026 | Kerangka induk seluruh PJP. Oasis BI Pro = **merchant**, bukan PJP. Duitku/Xendit = PJP berlisensi. |
| **PADG No. 32/2025** (Peraturan Anggota Dewan Gubernur) | 31 Maret 2026 | Detail teknis: kategori PJP, RBSP, TIKMI. |
| **RBSP** (Risk-Based Supervision Plan) | Submit ≤ 30 April 2026 | Wajib untuk PJP. Untuk merchant: **tidak wajib langsung**, tapi PJP akan minta data merchant due-diligence. |
| **TIKMI** (Tingkat Kesehatan & Manajemen Inovasi) | Self-assessment ongoing | PJP report. Merchant patuhi requirement dari PJP. |
| **Kategori PJP** | Continuous | PJSP-A / PJSP-B / PJSP-C. SparkMind/OBP = merchant; tidak masuk kategori PJP selama menggunakan Duitku/Xendit. |

> **Tindakan**: monitor BI website + Duitku/Xendit changelog setiap kuartal untuk update merchant-side requirements.

### 1.2 OJK (Otoritas Jasa Keuangan)

| Area | Status SparkMind/OBP | Aksi |
|------|----------------------|------|
| **POJK Fintech P2P (10/2022)** | ❌ Tidak applicable | OBP-Hybrid bukan platform peminjaman |
| **POJK Layanan Pendanaan Securities Crowdfunding (57/2020)** | ❌ Tidak applicable | Tidak ada penerbitan efek |
| **POJK IKD Inovasi Keuangan Digital (13/2018)** | ⚠️ Watchlist — bila menjadi PJP/aggregator | Re-assess saat scale > 100K user atau revenue > IDR 5M/bulan |
| **POJK Perlindungan Konsumen Sektor Jasa Keuangan (22/2023)** | ✅ Best practice | Implement complaint channel + ToS publik |

### 1.3 UU PDP (UU 27/2022 Perlindungan Data Pribadi) + MK 151/PUU-XXII/2024

**Putusan MK 151/PUU-XXII/2024 (30 Juli 2025)** — memperluas mandat **Data Protection Officer (DPO)**:

| Item | Pre-MK 151 | Post-MK 151 (sekarang) |
|------|-----------|------------------------|
| Threshold DPO | "Skala besar" (subyektif) | Skala bisnis fintech-level → **likely wajib**, tanpa kuantitatif threshold |
| Penunjukan DPO | Opsional | **Wajib formal** untuk PSE Lingkup Privat yang memproses data finansial |
| Self-appointment | Ambigu | ✅ Diperbolehkan untuk single-operator (Haidar = DPO + Owner) |
| Publikasi kontak DPO | Best-practice | **Wajib** — footer + privacy-policy + dedicated email (`dpo@oasis-bi-pro.web.id`) |

**Aksi v7.0**:
1. Haidar appoint diri sebagai **DPO (Data Protection Officer)** secara formal — buat letter of appointment internal
2. Setup `dpo@oasis-bi-pro.web.id` (alias ke inbox owner)
3. Tambahkan DPO contact di Privacy Policy + footer semua subdomain
4. Buat **DPIA (Data Protection Impact Assessment)** sederhana untuk flow checkout

### 1.4 PSE Kominfo (Permenkominfo 5/2020)

**Pendaftaran PSE Lingkup Privat** WAJIB untuk semua sistem elektronik yang:
- Menyediakan, mengelola, atau mengoperasikan transaksi finansial
- Memproses data pribadi pengguna Indonesia
- Memiliki jumlah pengguna ≥ batas tertentu

**Strategi single-umbrella vs per-subdomain**:

| Pola | Pro | Con | Verdict |
|------|-----|-----|---------|
| **A. Single umbrella** — daftar 1 PSE atas nama Oasis BI Pro, list semua subdomain sebagai "domain operasional" | Cepat, biaya kecil, 1 contact point | Bila salah satu subdomain bermasalah, semua subdomain di-flag | ⭐ **Recommended** untuk D60 sprint |
| **B. Per-subdomain** — daftar tiap brand sebagai PSE terpisah | Isolasi risiko, brand-specific compliance | Beban admin 4×, biaya 4×, complexity 4× | Defer ke v8.0 saat skala > 50K MAU |

**Subdomain wajib dicantumkan**:
```
sparkmind.web.id (mother)
oasis-bi-pro.web.id (merchant)
pay.oasis-bi-pro.web.id (checkout)
barberkas.sparkmind.web.id
kuratorkas.sparkmind.web.id
pacelokal.sparkmind.web.id (RLO)
nurani.os.sparkmind.web.id
```

═══════════════════════════════════════════════════════════════════════════════

## §02 · MERCHANT-OF-RECORD (MoR) PATTERN — DEEP DIVE

### 2.1 Definisi MoR

**Merchant-of-Record** adalah entitas legal yang:
- Tercantum di **invoice** sebagai penjual
- Menerima **dana settlement** dari PJP
- Bertanggung jawab atas **pajak (PPN/PPh)** transaksi
- Menjadi **counterparty legal** untuk customer dispute
- Patuh pada **AML/KYC + chargeback policy** PJP

**Brand layer** (SparkMind) = marketing, UX, produk. **Tidak menerima dana langsung**, tidak masuk invoice utama, tidak menerbitkan pajak.

### 2.2 Pattern Comparison (Global)

| Provider Global | Model | Indonesia Equivalent |
|----------------|-------|----------------------|
| Stripe Atlas | MoR untuk startup global | Oasis BI Pro pattern |
| Paddle | Full MoR (tax + dispute + invoice) | OBP-Hybrid (subset, no tax-on-behalf yet) |
| Lemonsqueezy | MoR untuk creators | OBP pattern untuk SparkMind sub-brands |
| RevenueCat (subs) | NOT MoR, hanya routing | ❌ Tidak applicable |

### 2.3 Validasi Legal Indonesia (2026)

| Pertanyaan | Jawaban | Sumber |
|-----------|---------|--------|
| Boleh satu entitas (OBP) menerima dana untuk multi-brand (SparkMind sub-brands)? | ✅ Ya, dengan disclosure + perjanjian B2B internal | KUH Perdata pasal 1320 (perjanjian sah), UU PT |
| Wajib lapor ke BI bila OBP jadi MoR untuk 4 sub-brand? | ❌ Tidak, selama OBP tetap "merchant" di Duitku/Xendit | PBI 10/2025 §IV (definisi merchant vs PJP) |
| Wajib disclosure ke customer? | ✅ Ya, di checkout page + invoice + footer | UU 8/1999 Perlindungan Konsumen pasal 4 |
| Pajak PPN: ditanggung OBP atau sub-brand? | ✅ OBP (sebagai MoR penerbit invoice) | UU HPP 7/2021 |
| KYC merchant tetap di OBP atau ditambah per sub-brand? | OBP-level cukup; sub-brand cukup attestation | Duitku/Xendit policy + POJK 22/2023 |

═══════════════════════════════════════════════════════════════════════════════

## §03 · ALTERNATIF YANG DI-REJECT

| Opsi | Kenapa Di-Reject |
|------|------------------|
| **A. Tunggu SparkMind verified Duitku** | Estimasi 60-120 hari (kategori "ekosistem aggregator" sensitif). Membunuh momentum sprint D60. |
| **C. Bikin PT formal untuk SparkMind** | Cost IDR 5-15jt, 30-60 hari, butuh modal disetor, tidak fit single-operator stage. |
| **D. Pakai personal Bank account + manual invoice** | Melanggar best-practice ToS Duitku/Xendit (harus entitas yg di-KYC), risk freezing. |
| **E. Routing via 3rd-party MoR (Paddle/Lemonsqueezy)** | Forex fee + chargeback latency + tidak QRIS-native. Indonesia customer butuh QRIS/BCA VA. |

**Verdict**: Opsi **B (OBP-Hybrid)** adalah satu-satunya yang **fast + legal + Indonesia-native + sovereign**.

═══════════════════════════════════════════════════════════════════════════════

## §04 · RISK REGISTER (TOP 10)

| # | Risiko | Likelihood | Impact | Mitigasi |
|---|--------|-----------|--------|----------|
| 1 | Duitku/Xendit re-verify OBP & minta klarifikasi multi-brand routing | Medium | High | Siapkan disclosure pack + B2B agreement template, proaktif lapor saat onboarding |
| 2 | Customer dispute → tuntut ke SparkMind, bukan OBP | Medium | Medium | Footer disclosure jelas + ToS jelas (Section "Payment Processing by Oasis BI Pro") |
| 3 | PSE Kominfo flag subdomain belum terdaftar | High | Medium | D7-D14 sprint: daftar PSE umbrella |
| 4 | UU PDP audit → no DPO appointed | Medium | High | D1-D7: self-appoint DPO + publish kontak |
| 5 | OBP nama "Oasis BI Pro" disalahartikan sebagai endorsed BI | Low | High | Tambahkan disclaimer "Not affiliated with Bank Indonesia" di About page |
| 6 | Tax: PPN tidak dipungut karena belum PKP | High (saat scale) | Medium | Track revenue; saat > IDR 4.8M/tahun → daftar PKP |
| 7 | Chargeback dari sub-brand customer landed di OBP, dispute internal | Medium | Medium | Internal B2B agreement: tiap sub-brand commit refund pool 5% revenue |
| 8 | SparkMind brand confusion dengan competitor (SparkMind AI, dll) | Medium | Low | Trademark search + ®  filing di DJKI |
| 9 | Cloudflare ToS: routing payment via Workers | Low | Medium | Cek Cloudflare ToS — payment processing OK, hanya storage CC data dilarang |
| 10 | PBI 10/2025 future amendment: redefine "merchant" jadi PJP-C | Low (5-15%) | High | Quarterly review BI website + siap PT formal saat threshold tercapai |

═══════════════════════════════════════════════════════════════════════════════

## §05 · SOURCE & REFERENCE STACK

### 5.1 Regulator Resmi (Primary)
- Bank Indonesia — https://www.bi.go.id/
- OJK — https://www.ojk.go.id/
- Kominfo PSE — https://pse.kominfo.go.id/
- Kemenkominfo Privasi Data — https://privasidata.kominfo.go.id/

### 5.2 Regulasi Spesifik
- PBI No. 10/2025 — Peraturan BI Sistem Pembayaran (effective 31 Maret 2026)
- PADG No. 32/2025 — Detail teknis PJP
- UU No. 27/2022 — Perlindungan Data Pribadi (UU PDP)
- Putusan MK No. 151/PUU-XXII/2024 — DPO mandate expansion (30 Juli 2025)
- Permenkominfo No. 5/2020 — PSE Lingkup Privat
- POJK No. 22/2023 — Perlindungan Konsumen Sektor Jasa Keuangan

### 5.3 PJP Operasional
- Duitku — https://duitku.com/
- Xendit — https://www.xendit.co/id/

### 5.4 Analisis Legal Pihak Ketiga (cross-check)
- AHP Law Firm (BI Regulation 10/2025 analysis)
- Baker McKenzie (Indonesia Payment System update 2026)
- SSEK Indonesian Legal Consultants (Reform analysis)
- ABNR Counsellors at Law (UU PDP DPO guidance)

═══════════════════════════════════════════════════════════════════════════════

## §06 · APPLICABILITY MATRIX — Per Sub-Brand

| Sub-Brand | URL | Produk | MoR via OBP | Disclosure di Checkout |
|-----------|-----|--------|-------------|------------------------|
| **BarberKas** | barberkas.sparkmind.web.id | POS untuk barbershop | ✅ Yes | "Payments processed by Oasis BI Pro" |
| **KuratorKas** | kuratorkas.sparkmind.web.id | Curator/educator POS | ✅ Yes | Same disclosure |
| **PaceLokal (RLO)** | pacelokal.sparkmind.web.id | Race event registration | ✅ Yes | Same disclosure + race-specific T&C |
| **Nurani.OS** | nurani.os.sparkmind.web.id | Sovereign Spiritual OS membership | ✅ Yes | Same disclosure |
| **Oasis BI Pro** | oasis-bi-pro.web.id | Operator showcase (B2B leads) | Native (own merchant) | N/A |

═══════════════════════════════════════════════════════════════════════════════

## §07 · KEY DECISIONS — SUMMARY TABLE

| Decision | v1.0 | v2.0 (this doc) |
|----------|------|-----------------|
| MoR pattern | Confirmed ✅ | Re-validated dengan PBI 10/2025 |
| PSE strategy | TBD | **Single umbrella** under OBP |
| DPO appointment | Suggested | **MANDATORY** — Haidar self-appoint |
| Disclosure footer | Draft | **Locked template** (see §08.5 in v7.0 master) |
| Risk top-10 | 7 items | **10 items** (added PSE flag, brand confusion, BI amendment) |

═══════════════════════════════════════════════════════════════════════════════

**END OF DR-OBP-HYBRID v2.0**

*Doctrine date: 2026-05-21 · Owner: Haidar · Status: CANONICAL · Public-Safe · Execute-Ready*
*Supersedes: DR-OBP-HYBRID v1.0 · Companion of: MASTER-ARCHITECT-PROMPT v7.0*
