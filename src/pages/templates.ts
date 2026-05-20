// ============================================================
// KuratorKas HTML Templates — Landing + App Shell
// Dark Sovereign theme (gold + indigo accent)
// ============================================================

export const LANDING_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0A0A0F">
  <title>KuratorKas — AI Stylist + POS untuk UMKM Fashion Indonesia</title>
  <meta name="description" content="KuratorKas × Curator.OS — Platform AI-native untuk UMKM fashion. POS digital + AI Stylist + Content Generator + Trend Detection + Pricing AI + Multi-Marketplace Sync.">
  <meta property="og:title" content="KuratorKas — AI Stylist + POS untuk UMKM Fashion">
  <meta property="og:description" content="Setiap UMKM fashion di Indonesia berhak punya AI Stylist pribadi. Mulai dari Rp 0.">
  <meta property="og:type" content="website">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4AF37'/%3E%3Ctext x='50' y='70' font-size='62' text-anchor='middle' fill='%230a0a0f' font-family='system-ui' font-weight='900'%3EK%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif}
    body{background:#0A0A0F;color:#E5E7EB;overflow-x:hidden}
    .gradient-text{background:linear-gradient(135deg,#a78bfa 0%,#60a5fa 50%,#d4af37 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .gold-text{background:linear-gradient(135deg,#d4af37,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .glass:hover{background:rgba(255,255,255,.07);border-color:rgba(212,175,55,.3)}
    .grid-bg{background-image:linear-gradient(rgba(212,175,55,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px);background-size:60px 60px}
    .btn-primary{background:linear-gradient(135deg,#4f46e5,#7c3aed);transition:all .3s;color:#fff}
    .btn-primary:hover{background:linear-gradient(135deg,#4338ca,#6d28d9);transform:translateY(-2px);box-shadow:0 12px 32px rgba(99,102,241,.4)}
    .btn-gold{background:linear-gradient(135deg,#d4af37,#f59e0b);color:#0A0A0F;font-weight:700;transition:all .3s}
    .btn-gold:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(245,158,11,.5)}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    .float{animation:float 5s ease-in-out infinite}
    .fade-up{opacity:0;transform:translateY(24px);transition:all .7s cubic-bezier(.4,0,.2,1)}
    .fade-up.visible{opacity:1;transform:none}
    @media (prefers-reduced-motion: reduce){.float{animation:none}.fade-up{opacity:1;transform:none;transition:none}}
  </style>
</head>
<body class="min-h-screen relative">
  <div class="fixed inset-0 grid-bg opacity-50 pointer-events-none"></div>
  <div class="fixed top-0 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
  <div class="fixed top-40 right-1/4 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-3xl pointer-events-none"></div>

  <!-- Nav -->
  <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5 group">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center font-black text-slate-900 text-lg shadow-lg shadow-amber-500/30">K</div>
        <div>
          <span class="text-base font-bold tracking-tight block leading-none">KuratorKas</span>
          <span class="text-[10px] text-amber-400/80 font-mono">Curator.OS v0.1</span>
        </div>
      </a>
      <div class="flex items-center gap-2">
        <a href="#features" class="hidden sm:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition">Features</a>
        <a href="#curator-os" class="hidden sm:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition">Curator.OS</a>
        <a href="#pricing" class="hidden md:inline-block text-sm text-gray-400 hover:text-white px-3 py-1.5 transition">Pricing</a>
        <a href="/app" class="px-4 py-2 btn-gold rounded-lg text-sm">Buka Dashboard <i class="fas fa-arrow-right ml-1 text-xs"></i></a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="relative pt-32 pb-20 px-4 sm:px-6 max-w-5xl mx-auto text-center">
    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 mb-6 fade-up">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      KuratorKas v0.1 · Curator.OS Multi-Agent · Cloudflare-Native · Sovereign Ecosystem
    </div>
    <h1 class="text-4xl sm:text-6xl md:text-7xl font-black mb-6 leading-[1.05] tracking-tight fade-up">
      AI Stylist + Kasir Digital<br>
      Untuk <span class="gradient-text">UMKM Fashion</span><br>
      <span class="gold-text">Indonesia</span>
    </h1>
    <p class="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed fade-up">
      <b class="text-white">Setiap UMKM fashion di Indonesia berhak punya AI Stylist pribadi</b> yang memahami katalog produkmu, mengikuti tren terkini, dan menghasilkan konten yang menjual — semua dalam satu platform.
    </p>
    <div class="flex flex-wrap justify-center gap-3 mb-12 fade-up">
      <a href="/app" class="px-7 py-3.5 btn-gold rounded-xl shadow-2xl shadow-amber-500/40 inline-flex items-center gap-2">
        <i class="fas fa-sparkles"></i> Mulai Gratis
      </a>
      <a href="#curator-os" class="px-7 py-3.5 glass text-white font-bold rounded-xl inline-flex items-center gap-2">
        <i class="fas fa-robot text-violet-400"></i> Lihat 5 Curator AI
      </a>
    </div>

    <div class="grid grid-cols-3 gap-4 max-w-2xl mx-auto fade-up">
      ${stat('5', 'AI Curator Modules')}
      ${stat('300+', 'Edge Locations')}
      ${stat('100%', 'Cloudflare Native')}
    </div>
  </section>

  <!-- Curator.OS Section -->
  <section id="curator-os" class="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
    <div class="text-center mb-12 fade-up">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-xs text-violet-300 mb-3">
        <i class="fas fa-brain"></i> CURATOR.OS — MULTI-AGENT AI
      </div>
      <h2 class="text-3xl sm:text-4xl font-bold mb-3">5 AI Curator <span class="gradient-text">Bekerja Untukmu</span></h2>
      <p class="text-gray-400 text-sm max-w-2xl mx-auto">Sistem multi-agent yang menggabungkan AI Stylist, Content Generator, Trend Detector, Pricing Optimizer, dan Marketplace Sync — semua di edge Cloudflare.</p>
    </div>

    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${curatorCard('👗', 'AI Stylist Curator', 'Generate outfit combinations dari katalog produkmu berdasarkan occasion (casual/formal/party/office) dan style (korean/streetwear/minimalist).', 'live', 'amber')}
      ${curatorCard('📸', 'Content Curator', 'Auto-generate caption + hashtag + video hooks untuk IG/TikTok dengan tone yang bisa disesuaikan (casual/professional/playful).', 'live', 'indigo')}
      ${curatorCard('🔥', 'Trend Curator', 'Scrape TikTok/IG untuk detect fashion trending. Forecast micro-trends 7-30 hari. Alert produk yang harus distok.', 'scaffold', 'rose')}
      ${curatorCard('💰', 'Pricing Curator', 'Dynamic pricing AI berdasarkan competitor scan + demand elasticity + margin protection. Auto-optimize flash sale.', 'scaffold', 'emerald')}
      ${curatorCard('🔄', 'Marketplace Curator', 'Real-time sync inventory + order ke Shopee, Tokopedia, TikTok Shop. Unified order inbox. Review aggregation.', 'scaffold', 'cyan')}
      ${curatorCard('🧠', 'Orchestrator', 'Task routing, agent coordination, memory management, fallback handling. Backed by Cloudflare AI Gateway.', 'live', 'violet')}
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
    <div class="text-center mb-12 fade-up">
      <h2 class="text-3xl sm:text-4xl font-bold mb-3">Built for <span class="gold-text">UMKM Indonesia</span></h2>
      <p class="text-gray-400 text-sm">Dari Sari di Bandung sampai Budi di Surabaya — KuratorKas didesain untuk realita UMKM lokal.</p>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      ${featureCard('fa-cash-register', 'POS Digital Lengkap', 'Transaction processing (cash/card/QRIS), inventory management, multi-outlet, receipt printing, customer database — semua dalam 1 dashboard.', 'amber')}
      ${featureCard('fa-globe', 'Localized untuk Indonesia', 'Bahasa Indonesia default, dukung BCA/Mandiri/QRIS/OVO/DANA, formatting Rupiah, occasion lokal (kondangan, kuliah, kerja, hangout).', 'indigo')}
      ${featureCard('fa-bolt', 'Edge Performance Global', '300+ Cloudflare edge locations. API latency &lt;500ms p95. Page load &lt;2s. Auto-scale tanpa cold start.', 'violet')}
      ${featureCard('fa-shield-alt', 'Privacy-First & Secure', 'Zero Trust architecture, RBAC, AES-256 encryption at rest, TLS 1.3. SOC 2 ready (post-MVP).', 'emerald')}
    </div>
  </section>

  <!-- Pricing -->
  <section id="pricing" class="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
    <div class="text-center mb-12 fade-up">
      <h2 class="text-3xl sm:text-4xl font-bold mb-3">Pricing <span class="gradient-text">Sederhana</span></h2>
      <p class="text-gray-400 text-sm">Mulai gratis. Upgrade kapan saja. Cancel kapan saja.</p>
    </div>
    <div class="grid md:grid-cols-4 gap-4 max-w-5xl mx-auto">
      ${priceCard('Free', 'Rp 0', '/selamanya', ['100 produk', '1 outlet', 'Basic POS', 'Manual sync'], '/app', 'Mulai')}
      ${priceCard('Starter', 'Rp 149.000', '/bulan', ['500 produk', '1 outlet', '1 marketplace sync', 'Basic AI Stylist'], '/app', 'Pilih Starter')}
      ${priceCard('Pro Curator', 'Rp 299.000', '/bulan', ['Unlimited produk', '3 outlet', '3 marketplace sync', '5 Curator modules'], '/app', 'Pilih Pro', true)}
      ${priceCard('Enterprise', 'Custom', '/quote', ['Unlimited everything', 'Custom AI training', 'SLA', 'Dedicated support'], 'mailto:enterprise@kuratorkas.id', 'Hubungi')}
    </div>
  </section>

  <!-- CTA -->
  <section class="py-20 px-4 sm:px-6 max-w-3xl mx-auto text-center">
    <div class="glass rounded-3xl p-10 fade-up">
      <div class="text-5xl mb-4">✨</div>
      <h2 class="text-2xl sm:text-3xl font-bold mb-3">Mulai <span class="gold-text">Hari Ini</span></h2>
      <p class="text-gray-400 text-sm mb-7">Tidak perlu kartu kredit. Buka, register, mulai jualan dengan AI di sisimu.</p>
      <a href="/app" class="inline-block px-8 py-4 btn-gold rounded-xl shadow-2xl shadow-amber-500/40">
        Buka Dashboard <i class="fas fa-arrow-right ml-2"></i>
      </a>
      <p class="text-xs text-gray-500 mt-5">Cloudflare-Native · Privacy-First · UMKM-First 🇮🇩</p>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-10 px-4 text-center border-t border-white/5">
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-center gap-2 mb-4">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-900">K</div>
        <span class="font-bold">KuratorKas</span>
        <span class="text-xs text-gray-500">·</span>
        <span class="text-xs text-amber-400/70 font-mono">Curator.OS v0.1</span>
      </div>
      <p class="text-xs text-gray-500 mb-2">Bagian dari <b class="text-amber-400/80">SparkMind Sovereign Ecosystem</b> · Owner: Reza Estes / Haidar</p>
      <p class="text-[10px] text-gray-600">© 2026 KuratorKas — Master-Architect v5.0 CANONICAL · Sokaraja, Banyumas, Jawa Tengah 🇮🇩</p>
    </div>
  </footer>

  <script>
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('visible')), { threshold: 0.12 });
    document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
    setTimeout(() => document.querySelectorAll('.fade-up').forEach(el => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight) el.classList.add('visible'); }), 80);
  </script>
</body>
</html>`

// ----- Reusable card builders (string-based for embed in template literal) -----
function stat(value: string, label: string): string {
  return `<div class="glass rounded-xl p-4 text-center">
    <p class="text-2xl sm:text-3xl font-black gradient-text">${value}</p>
    <p class="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider mt-1">${label}</p>
  </div>`
}

function curatorCard(emoji: string, title: string, desc: string, status: 'live' | 'scaffold', color: string): string {
  const statusBadge = status === 'live'
    ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"><i class="fas fa-check-circle mr-1"></i>LIVE</span>`
    : `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"><i class="fas fa-hammer mr-1"></i>SCAFFOLD</span>`
  return `<div class="glass rounded-2xl p-5 fade-up">
    <div class="flex items-start justify-between mb-3">
      <div class="text-4xl">${emoji}</div>
      ${statusBadge}
    </div>
    <h3 class="font-bold text-white text-base mb-2">${title}</h3>
    <p class="text-xs text-gray-400 leading-relaxed">${desc}</p>
  </div>`
}

function featureCard(icon: string, title: string, desc: string, color: string): string {
  return `<div class="glass rounded-2xl p-6 fade-up">
    <div class="w-12 h-12 rounded-xl bg-${color}-500/15 flex items-center justify-center text-${color}-300 text-xl mb-4"><i class="fas ${icon}"></i></div>
    <h3 class="font-bold text-white text-base mb-2">${title}</h3>
    <p class="text-sm text-gray-400 leading-relaxed">${desc}</p>
  </div>`
}

function priceCard(name: string, price: string, period: string, features: string[], cta: string, ctaLabel: string, featured: boolean = false): string {
  return `<div class="glass rounded-2xl p-5 fade-up ${featured ? 'ring-2 ring-amber-500/40 shadow-xl shadow-amber-500/20' : ''}">
    ${featured ? '<div class="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">⭐ Paling Popular</div>' : ''}
    <p class="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">${name}</p>
    <p class="text-3xl font-black text-white mb-1">${price}<span class="text-sm text-gray-500 font-normal">${period}</span></p>
    <a href="${cta}" class="block w-full text-center py-2.5 mt-4 mb-4 ${featured ? 'btn-gold' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'} rounded-lg text-sm font-semibold transition">${ctaLabel}</a>
    <ul class="space-y-2 text-sm text-gray-300">
      ${features.map(f => `<li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1 text-xs"></i> ${f}</li>`).join('')}
    </ul>
  </div>`
}

// ============================================================
// APP SHELL (dashboard SPA — vanilla JS, calls /api/*)
// ============================================================
export const APP_SHELL_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0A0A0F">
  <title>KuratorKas Dashboard — Curator.OS</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4AF37'/%3E%3Ctext x='50' y='70' font-size='62' text-anchor='middle' fill='%230a0a0f' font-family='system-ui' font-weight='900'%3EK%3C/text%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/app.css" rel="stylesheet">
</head>
<body class="min-h-screen bg-slate-950 text-gray-200">
  <div id="root">
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-900 text-2xl mx-auto mb-4 shadow-2xl shadow-amber-500/30">K</div>
        <p class="text-amber-300 font-mono text-sm">Loading KuratorKas dashboard…</p>
      </div>
    </div>
  </div>
  <div id="toast-root" class="fixed top-4 right-4 z-50 space-y-2"></div>
  <script src="/static/app.js"></script>
</body>
</html>`
