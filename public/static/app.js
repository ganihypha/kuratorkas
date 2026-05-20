// ============================================================
// KuratorKas Dashboard SPA — vanilla JS
// Calls /api/* backend (Hono on Cloudflare Pages)
// Doctrine: Master-Architect v5.0 CANONICAL
// ============================================================

(function () {
  'use strict'

  // ---------- State ----------
  const State = {
    token: localStorage.getItem('kk_token') || null,
    user: JSON.parse(localStorage.getItem('kk_user') || 'null'),
    route: 'dashboard',
    cache: {},
  }

  // ---------- API client ----------
  const API = {
    base: '',
    async req(path, opts = {}) {
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
      if (State.token) headers['Authorization'] = 'Bearer ' + State.token
      const res = await fetch(this.base + path, Object.assign({}, opts, { headers }))
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw Object.assign(new Error(json.error || 'Request failed'), { status: res.status, body: json })
      return json
    },
    get(p) { return this.req(p) },
    post(p, body) { return this.req(p, { method: 'POST', body: JSON.stringify(body || {}) }) },
    put(p, body) { return this.req(p, { method: 'PUT', body: JSON.stringify(body || {}) }) },
    del(p) { return this.req(p, { method: 'DELETE' }) },
  }

  // ---------- Utilities ----------
  const $ = (sel, root) => (root || document).querySelector(sel)
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel))
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const idr = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
  const ago = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso); const s = Math.floor((Date.now() - d.getTime()) / 1000)
    if (s < 60) return s + 's lalu'
    if (s < 3600) return Math.floor(s / 60) + 'm lalu'
    if (s < 86400) return Math.floor(s / 3600) + 'j lalu'
    return Math.floor(s / 86400) + 'h lalu'
  }

  function toast(msg, kind = 'success', ms = 3000) {
    const root = $('#toast-root') || document.body
    const el = document.createElement('div')
    el.className = 'kk-toast ' + kind
    const icon = kind === 'error' ? '⚠️' : kind === 'warn' ? '🟡' : kind === 'info' ? 'ℹ️' : '✅'
    el.innerHTML = `<span style="margin-right:8px">${icon}</span>${esc(msg)}`
    root.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, ms)
  }

  function setAuth(token, user) {
    State.token = token; State.user = user
    if (token) { localStorage.setItem('kk_token', token); localStorage.setItem('kk_user', JSON.stringify(user)) }
    else { localStorage.removeItem('kk_token'); localStorage.removeItem('kk_user') }
  }

  // ---------- AUTH SCREEN ----------
  function renderAuthScreen() {
    const root = $('#root')
    root.innerHTML = `
      <div class="min-h-screen bg-grid flex items-center justify-center p-4">
        <div class="glass rounded-3xl p-8 w-full max-w-md">
          <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl btn-gold font-black text-3xl mb-3" style="color:#0A0A0F">K</div>
            <h1 class="text-2xl font-bold mb-1">KuratorKas</h1>
            <p class="text-sm text-gray-400">AI Stylist + Kasir Digital · Curator.OS</p>
          </div>
          <div class="flex gap-2 mb-4" id="auth-tabs">
            <button class="flex-1 py-2 rounded-lg text-sm font-semibold" data-tab="login" id="tab-login">Masuk</button>
            <button class="flex-1 py-2 rounded-lg text-sm font-semibold" data-tab="register" id="tab-register">Daftar</button>
          </div>
          <form id="auth-form" class="space-y-3">
            <input type="hidden" id="auth-mode" value="login">
            <div id="name-field" style="display:none">
              <label class="text-xs text-gray-400 mb-1 block">Nama Lengkap</label>
              <input class="kk-input" id="name" placeholder="Nama Anda">
            </div>
            <div id="biz-field" style="display:none">
              <label class="text-xs text-gray-400 mb-1 block">Nama Usaha (opsional)</label>
              <input class="kk-input" id="business_name" placeholder="Brand Anda">
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Email</label>
              <input type="email" class="kk-input" id="email" placeholder="email@example.com" autocomplete="email">
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Password (min 6 karakter)</label>
              <input type="password" class="kk-input" id="password" placeholder="••••••••" autocomplete="current-password">
            </div>
            <button type="submit" class="w-full btn-gold py-3 rounded-lg font-bold mt-2" id="auth-submit">Masuk →</button>
            <p class="text-center text-xs text-gray-500 mt-3">
              <button type="button" class="text-amber-400 hover:underline" id="demo-login">⚡ Quick demo login (demo@kuratorkas.id / demo123)</button>
            </p>
          </form>
          <div class="mt-6 pt-4 border-t border-white/5 text-center">
            <a href="/" class="text-xs text-gray-500 hover:text-gray-300">← Kembali ke landing</a>
          </div>
        </div>
      </div>
    `

    // Tab logic
    const setTab = (mode) => {
      $('#auth-mode').value = mode
      $('#tab-login').className = 'flex-1 py-2 rounded-lg text-sm font-semibold ' + (mode === 'login' ? 'btn-primary' : 'btn-ghost')
      $('#tab-register').className = 'flex-1 py-2 rounded-lg text-sm font-semibold ' + (mode === 'register' ? 'btn-primary' : 'btn-ghost')
      $('#name-field').style.display = mode === 'register' ? '' : 'none'
      $('#biz-field').style.display = mode === 'register' ? '' : 'none'
      $('#auth-submit').textContent = mode === 'register' ? 'Daftar Sekarang →' : 'Masuk →'
    }
    setTab('login')
    $('#tab-login').addEventListener('click', () => setTab('login'))
    $('#tab-register').addEventListener('click', () => setTab('register'))

    $('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const mode = $('#auth-mode').value
      const email = $('#email').value.trim()
      const password = $('#password').value
      const name = $('#name').value.trim()
      const business_name = $('#business_name').value.trim()
      if (!email || !password) return toast('Email & password wajib', 'warn')
      try {
        const body = mode === 'register'
          ? { email, password, name, business_name, business_type: 'online' }
          : { email, password }
        const r = await API.post('/api/auth/' + mode, body)
        setAuth(r.token, r.user)
        toast('Selamat datang, ' + (r.user.name || r.user.email) + '!')
        navigate('dashboard')
      } catch (err) {
        toast(err.message || 'Auth gagal', 'error')
      }
    })

    $('#demo-login').addEventListener('click', async () => {
      $('#email').value = 'demo@kuratorkas.id'
      $('#password').value = 'demo123'
      // Try login first; if fails, register
      try {
        const r = await API.post('/api/auth/login', { email: 'demo@kuratorkas.id', password: 'demo123' })
        setAuth(r.token, r.user); toast('Demo login OK!'); navigate('dashboard')
      } catch {
        try {
          const r = await API.post('/api/auth/register', { email: 'demo@kuratorkas.id', password: 'demo123', name: 'Sari Demo', business_name: 'Sari Fashion Bandung', business_type: 'hybrid' })
          setAuth(r.token, r.user); toast('Demo account created!'); navigate('dashboard')
        } catch (err) { toast(err.message || 'Demo gagal', 'error') }
      }
    })
  }

  // ---------- APP SHELL (sidebar + content) ----------
  function renderAppShell() {
    const root = $('#root')
    const u = State.user || {}
    root.innerHTML = `
      <div class="min-h-screen flex">
        <!-- Sidebar -->
        <aside class="sidebar w-60 shrink-0 border-r border-white/5 bg-slate-950/80 backdrop-blur-xl flex flex-col" style="position:sticky; top:0; height:100vh">
          <div class="p-4 border-b border-white/5 flex items-center gap-2">
            <div class="w-10 h-10 rounded-xl btn-gold flex items-center justify-center font-black text-lg" style="color:#0A0A0F">K</div>
            <div>
              <div class="font-bold text-sm leading-none">KuratorKas</div>
              <div class="text-[10px] text-amber-400/80 font-mono mt-0.5">Curator.OS v1.0</div>
            </div>
          </div>
          <nav class="flex-1 p-3 space-y-1 overflow-y-auto" id="nav">
            <a class="nav-item" data-route="dashboard"><i class="fas fa-chart-line w-5"></i> Dashboard</a>
            <a class="nav-item" data-route="products"><i class="fas fa-tshirt w-5"></i> Produk</a>
            <a class="nav-item" data-route="pos"><i class="fas fa-cash-register w-5"></i> POS Kasir</a>
            <a class="nav-item" data-route="orders"><i class="fas fa-receipt w-5"></i> Orders</a>
            <div class="px-3 py-2 mt-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Curator.OS</div>
            <a class="nav-item" data-route="stylist"><i class="fas fa-wand-magic-sparkles w-5"></i> AI Stylist</a>
            <a class="nav-item" data-route="content"><i class="fas fa-share-nodes w-5"></i> Content</a>
            <a class="nav-item" data-route="trends"><i class="fas fa-chart-simple w-5"></i> Trends</a>
            <a class="nav-item" data-route="pricing"><i class="fas fa-tags w-5"></i> Pricing AI</a>
            <a class="nav-item" data-route="marketplace"><i class="fas fa-store w-5"></i> Marketplace</a>
            <div class="px-3 py-2 mt-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Akun</div>
            <a class="nav-item" data-route="billing"><i class="fas fa-credit-card w-5"></i> Subscription</a>
            <a class="nav-item" data-route="settings"><i class="fas fa-gear w-5"></i> Settings</a>
          </nav>
          <div class="p-3 border-t border-white/5">
            <div class="glass rounded-xl p-3 mb-2">
              <div class="text-xs text-gray-400 mb-1">${esc(u.business_name || u.name || 'User')}</div>
              <div class="text-[10px] text-amber-400 font-mono uppercase">${esc(u.subscription_tier || 'free')} tier</div>
            </div>
            <button class="w-full btn-ghost py-2 rounded-lg text-xs" id="logout-btn"><i class="fas fa-arrow-right-from-bracket mr-1"></i> Logout</button>
          </div>
        </aside>

        <!-- Main content -->
        <main class="main-content flex-1 min-w-0 bg-grid">
          <header class="sticky top-0 z-10 backdrop-blur-xl bg-slate-950/70 border-b border-white/5 px-6 py-3 flex items-center justify-between">
            <div>
              <h1 id="page-title" class="text-lg font-bold">Dashboard</h1>
              <p id="page-sub" class="text-xs text-gray-500">Live data dari Curator.OS</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge gold" id="tier-badge">${esc((u.subscription_tier || 'free').toUpperCase())}</span>
              <span class="badge success hide-mobile"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1"></span>LIVE</span>
            </div>
          </header>
          <section id="page-content" class="p-6 max-w-7xl mx-auto"></section>
        </main>
      </div>
    `

    // Bind nav
    $$('#nav .nav-item').forEach(a => a.addEventListener('click', (e) => {
      e.preventDefault()
      navigate(a.dataset.route)
    }))

    $('#logout-btn').addEventListener('click', () => {
      setAuth(null, null); toast('Logged out'); renderAuthScreen()
    })
  }

  // ---------- ROUTES / PAGES ----------
  const Pages = {
    async dashboard() {
      setPageMeta('Dashboard', 'Ringkasan toko & insight Curator.OS')
      const content = $('#page-content')
      content.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="stat-cards">' +
        [1, 2, 3, 4].map(() => '<div class="glass rounded-2xl p-5"><div class="skel h-4 w-24 mb-3"></div><div class="skel h-8 w-32"></div></div>').join('') +
        '</div>'

      try {
        const r = await API.get('/api/dashboard/summary')
        const stats = [
          { label: 'Produk Aktif', val: r.products, icon: 'fa-tshirt', color: 'indigo' },
          { label: 'Total Orders', val: r.orders, icon: 'fa-receipt', color: 'gold' },
          { label: 'Outfits AI', val: r.outfits, icon: 'fa-wand-magic-sparkles', color: 'success' },
          { label: 'Konten Generated', val: r.content, icon: 'fa-share-nodes', color: 'warn' },
        ]
        $('#stat-cards').innerHTML = stats.map(s => `
          <div class="glass rounded-2xl p-5">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-400 uppercase tracking-wider">${esc(s.label)}</span>
              <i class="fas ${s.icon} text-amber-400"></i>
            </div>
            <div class="text-3xl font-black">${esc(s.val ?? 0)}</div>
          </div>
        `).join('')

        content.insertAdjacentHTML('beforeend', `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div class="glass rounded-2xl p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Revenue Hari Ini</div>
              <div class="text-3xl font-black gold-text">${esc(idr(r.revenue_today))}</div>
              <div class="text-xs text-gray-500 mt-2">Hanya order PAID — sumber: D1</div>
            </div>
            <div class="glass rounded-2xl p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Revenue 30 Hari</div>
              <div class="text-3xl font-black grad-text">${esc(idr(r.revenue_30d))}</div>
              <div class="text-xs text-gray-500 mt-2">Rolling window</div>
            </div>
          </div>
        `)

        // Agent status grid
        const agents = await API.get('/api/agents').catch(() => ({ agents: [] }))
        content.insertAdjacentHTML('beforeend', `
          <h3 class="text-base font-bold mb-3 text-gray-300">🤖 Curator.OS Agents</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="agent-grid">
            ${(agents.agents || []).map(a => `
              <div class="glass rounded-xl p-4">
                <div class="flex items-start justify-between mb-2">
                  <div class="text-2xl">${a.emoji || '🤖'}</div>
                  <span class="badge ${a.status === 'live' ? 'success' : 'warn'}">${esc(a.status || 'stub').toUpperCase()}</span>
                </div>
                <div class="font-bold text-sm">${esc(a.name)}</div>
                <div class="text-xs text-gray-400 mt-1">${esc(a.description || '')}</div>
              </div>
            `).join('')}
          </div>
        `)

        if (r.note) toast(r.note, 'info', 5000)
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        content.innerHTML = `<div class="glass rounded-2xl p-6"><p class="text-red-400">❌ ${esc(err.message)}</p></div>`
      }
    },

    async products() {
      setPageMeta('Produk', 'Manajemen katalog fashion')
      const content = $('#page-content')
      content.innerHTML = `
        <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-4">
          <input class="kk-input max-w-sm" id="prod-search" placeholder="🔍 Cari produk...">
          <button class="btn-gold px-4 py-2 rounded-lg font-bold" id="add-prod"><i class="fas fa-plus mr-1"></i> Tambah Produk</button>
        </div>
        <div id="prod-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${Array.from({ length: 6 }).map(() => '<div class="glass rounded-2xl p-4"><div class="skel h-32 w-full mb-3"></div><div class="skel h-4 w-3/4 mb-2"></div><div class="skel h-3 w-1/2"></div></div>').join('')}
        </div>
      `

      $('#add-prod').addEventListener('click', () => openProductModal())
      $('#prod-search').addEventListener('input', debounce(loadProducts, 300))
      loadProducts()
    },

    async pos() {
      setPageMeta('POS Kasir', 'Kasir digital — checkout cepat')
      const content = $('#page-content')
      content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2 glass rounded-2xl p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold">Katalog</h3>
              <input class="kk-input max-w-xs" id="pos-search" placeholder="🔍 Cari produk...">
            </div>
            <div id="pos-products" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
              ${Array.from({ length: 6 }).map(() => '<div class="skel h-32"></div>').join('')}
            </div>
          </div>
          <div class="glass rounded-2xl p-4 flex flex-col" style="min-height:60vh">
            <h3 class="font-bold mb-2">🛒 Keranjang</h3>
            <div id="cart-items" class="flex-1 overflow-y-auto space-y-2 mb-3">
              <p class="text-sm text-gray-500 text-center py-8">Keranjang kosong</p>
            </div>
            <div class="border-t border-white/10 pt-3">
              <input class="kk-input mb-2" id="customer-name" placeholder="Nama pelanggan (opsional)">
              <input class="kk-input mb-3" id="customer-phone" placeholder="No HP (opsional)">
              <div class="flex justify-between mb-3">
                <span class="text-sm text-gray-400">Total</span>
                <span id="cart-total" class="font-bold gold-text text-xl">Rp 0</span>
              </div>
              <button class="w-full btn-gold py-3 rounded-lg font-bold" id="checkout-btn" disabled>Checkout</button>
            </div>
          </div>
        </div>
      `
      Pages._cart = []
      $('#pos-search').addEventListener('input', debounce(loadPosProducts, 300))
      $('#checkout-btn').addEventListener('click', checkout)
      loadPosProducts()
    },

    async orders() {
      setPageMeta('Orders', 'Riwayat transaksi POS')
      const content = $('#page-content')
      content.innerHTML = `<div class="glass rounded-2xl p-4 overflow-x-auto">
        <table class="kk-table" id="orders-table">
          <thead><tr><th>#</th><th>Pelanggan</th><th>Total</th><th>Status</th><th>Marketplace</th><th>Waktu</th></tr></thead>
          <tbody><tr><td colspan="6" class="text-center text-gray-500 py-8">Loading...</td></tr></tbody>
        </table>
      </div>`
      try {
        const r = await API.get('/api/orders?limit=100')
        const tbody = $('#orders-table tbody')
        if (!r.orders.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-8">Belum ada order. Mulai dari POS Kasir.</td></tr>'
          return
        }
        tbody.innerHTML = r.orders.map(o => `
          <tr>
            <td><span class="font-mono text-xs">${esc(o.order_number)}</span></td>
            <td>${esc(o.customer_name || 'Walk-in')}</td>
            <td class="gold-text font-bold">${esc(idr(o.total_amount))}</td>
            <td><span class="badge ${o.payment_status === 'paid' ? 'success' : 'warn'}">${esc(o.payment_status)}</span></td>
            <td><span class="badge indigo">${esc(o.marketplace || 'offline')}</span></td>
            <td class="text-xs text-gray-400">${esc(ago(o.created_at))}</td>
          </tr>
        `).join('')
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        $('#orders-table tbody').innerHTML = `<tr><td colspan="6" class="text-red-400 text-center py-6">${esc(err.message)}</td></tr>`
      }
    },

    async stylist() {
      setPageMeta('AI Stylist Curator', 'Outfit recommendation engine — Curator-OS Agent 1')
      const content = $('#page-content')
      content.innerHTML = `
        <div class="glass rounded-2xl p-5 mb-4">
          <h3 class="font-bold mb-3">🪄 Generate Outfit Combo</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Occasion</label>
              <select class="kk-input" id="st-occasion">
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="party">Party</option>
                <option value="office">Office</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Style (opsional)</label>
              <select class="kk-input" id="st-style">
                <option value="">- Auto -</option>
                <option value="korean">Korean</option>
                <option value="streetwear">Streetwear</option>
                <option value="minimalist">Minimalist</option>
                <option value="traditional">Traditional</option>
                <option value="modern">Modern</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Max Produk</label>
              <input type="number" class="kk-input" id="st-max" value="4" min="2" max="6">
            </div>
          </div>
          <button class="btn-gold px-5 py-2.5 rounded-lg font-bold" id="st-generate"><i class="fas fa-wand-magic-sparkles mr-1"></i> Generate Outfit</button>
          <p class="text-xs text-gray-500 mt-2">Curator-OS akan gunakan AI Workers (jika tersedia) atau heuristic mode fallback.</p>
        </div>
        <div id="st-result"></div>
        <h3 class="font-bold mb-3 mt-6 text-gray-300">📦 Outfit Tersimpan</h3>
        <div id="st-saved" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${Array.from({ length: 3 }).map(() => '<div class="glass rounded-2xl p-4"><div class="skel h-4 w-3/4 mb-2"></div><div class="skel h-3 w-1/2"></div></div>').join('')}
        </div>
      `
      $('#st-generate').addEventListener('click', generateOutfit)
      try {
        const r = await API.get('/api/stylist/outfits')
        $('#st-saved').innerHTML = (r.outfits || []).length ? r.outfits.map(renderOutfitCard).join('') : '<p class="text-sm text-gray-500 col-span-3">Belum ada outfit. Generate yang pertama!</p>'
      } catch (err) { if (err.status === 401) return logoutFlow() }
    },

    async content() {
      setPageMeta('Content Curator', 'Auto-generate caption + hashtag IG/TikTok — Curator-OS Agent 2')
      const content = $('#page-content')
      content.innerHTML = `
        <div class="glass rounded-2xl p-5 mb-4">
          <h3 class="font-bold mb-3">📝 Generate Konten Sosial Media</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Pilih Produk</label>
              <select class="kk-input" id="ct-product"><option value="">Loading...</option></select>
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Platform</label>
              <select class="kk-input" id="ct-platform">
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-400 mb-1 block">Tone</label>
              <select class="kk-input" id="ct-tone">
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="playful">Playful</option>
              </select>
            </div>
          </div>
          <button class="btn-primary px-5 py-2.5 rounded-lg font-bold" id="ct-generate"><i class="fas fa-share-nodes mr-1"></i> Generate Konten</button>
        </div>
        <div id="ct-result"></div>
        <h3 class="font-bold mb-3 mt-6 text-gray-300">📂 Konten Tersimpan</h3>
        <div id="ct-saved" class="space-y-3"></div>
      `

      // Populate product dropdown
      try {
        const pr = await API.get('/api/products?limit=100')
        const sel = $('#ct-product')
        sel.innerHTML = '<option value="">- Pilih produk -</option>' + (pr.products || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(idr(p.price))}</option>`).join('')
      } catch (err) { if (err.status === 401) return logoutFlow() }

      $('#ct-generate').addEventListener('click', generateContent)

      try {
        const r = await API.get('/api/content')
        $('#ct-saved').innerHTML = (r.content || []).length ? r.content.map(renderContentCard).join('') : '<p class="text-sm text-gray-500">Belum ada konten.</p>'
      } catch {}
    },

    async trends() {
      setPageMeta('Trend Curator', 'TikTok/IG trend detection — Curator-OS Agent 3')
      const content = $('#page-content')
      content.innerHTML = '<div class="glass rounded-2xl p-6"><div class="skel h-4 w-32 mb-3"></div><div class="skel h-3 w-full mb-2"></div><div class="skel h-3 w-3/4"></div></div>'
      try {
        const r = await API.get('/api/trend/forecast')
        const d = r.data || {}
        content.innerHTML = `
          <div class="glass rounded-2xl p-5 mb-4">
            <h3 class="font-bold mb-2">🔥 Trending Sekarang</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              ${(d.trending || []).map(t => `
                <div class="glass rounded-xl p-4">
                  <div class="text-xs text-amber-400 uppercase tracking-wider mb-1">${esc(t.category || 'trend')}</div>
                  <div class="font-bold mb-1">${esc(t.title)}</div>
                  <div class="text-xs text-gray-400">${esc(t.description || '')}</div>
                  ${t.score ? `<div class="mt-2"><span class="badge gold">Score ${esc(t.score)}/100</span></div>` : ''}
                </div>
              `).join('') || '<p class="text-sm text-gray-500">Belum ada data trend.</p>'}
            </div>
          </div>
          <div class="glass rounded-2xl p-5">
            <h3 class="font-bold mb-2">💡 Rekomendasi Aksi</h3>
            <ul class="space-y-2 text-sm">
              ${(d.recommendations || []).map(r => `<li class="flex gap-2"><i class="fas fa-check text-emerald-400 mt-1"></i> ${esc(r)}</li>`).join('') || '<li class="text-gray-500">-</li>'}
            </ul>
          </div>
          <p class="text-xs text-gray-500 mt-3">Mode: ${esc(r.meta?.model || 'heuristic')}</p>
        `
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        content.innerHTML = `<div class="glass rounded-2xl p-6"><p class="text-red-400">${esc(err.message)}</p></div>`
      }
    },

    async pricing() {
      setPageMeta('Pricing Curator', 'Dynamic pricing AI — Curator-OS Agent 4')
      const content = $('#page-content')
      content.innerHTML = '<div class="glass rounded-2xl p-6"><div class="skel h-4 w-32"></div></div>'
      try {
        const r = await API.get('/api/pricing/recommendations')
        const d = r.data || {}
        content.innerHTML = `
          <div class="glass rounded-2xl p-5 mb-4">
            <h3 class="font-bold mb-3">📊 Pricing Insights</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div class="glass rounded-xl p-3">
                <div class="text-xs text-gray-400">Avg Margin</div>
                <div class="text-xl font-bold gold-text">${esc((d.avg_margin_pct ?? 0) + '%')}</div>
              </div>
              <div class="glass rounded-xl p-3">
                <div class="text-xs text-gray-400">Underpriced Items</div>
                <div class="text-xl font-bold text-red-400">${esc(d.underpriced_count ?? 0)}</div>
              </div>
              <div class="glass rounded-xl p-3">
                <div class="text-xs text-gray-400">Overpriced Items</div>
                <div class="text-xl font-bold text-amber-400">${esc(d.overpriced_count ?? 0)}</div>
              </div>
            </div>
          </div>
          ${(d.suggestions || []).length ? `
          <div class="glass rounded-2xl p-5 overflow-x-auto">
            <h3 class="font-bold mb-3">💰 Rekomendasi Harga</h3>
            <table class="kk-table">
              <thead><tr><th>Produk</th><th>Harga Saat Ini</th><th>Rekomendasi</th><th>Δ</th><th>Alasan</th></tr></thead>
              <tbody>
                ${d.suggestions.map(s => `
                  <tr>
                    <td>${esc(s.name)}</td>
                    <td>${esc(idr(s.current_price))}</td>
                    <td class="gold-text font-bold">${esc(idr(s.suggested_price))}</td>
                    <td><span class="badge ${s.delta >= 0 ? 'success' : 'warn'}">${s.delta >= 0 ? '+' : ''}${esc(Math.round((s.delta / s.current_price) * 100))}%</span></td>
                    <td class="text-xs text-gray-400">${esc(s.reason)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : '<div class="glass rounded-2xl p-5"><p class="text-sm text-gray-500">Tambah produk dengan cost_price untuk rekomendasi harga.</p></div>'}
          <p class="text-xs text-gray-500 mt-3">Model: ${esc(r.meta?.model || 'heuristic')}</p>
        `
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        content.innerHTML = `<div class="glass rounded-2xl p-6"><p class="text-red-400">${esc(err.message)}</p></div>`
      }
    },

    async marketplace() {
      setPageMeta('Marketplace Curator', 'Shopee/Tokopedia/TikTok sync — Curator-OS Agent 5')
      const content = $('#page-content')
      content.innerHTML = '<div class="skel h-4 w-32"></div>'
      try {
        const r = await API.get('/api/marketplace/status')
        const d = r.data || {}
        content.innerHTML = `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${['shopee', 'tokopedia', 'tiktok'].map(mp => {
              const m = (d.marketplaces || {})[mp] || { connected: false }
              return `<div class="glass rounded-2xl p-5">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-lg font-bold capitalize">${esc(mp)}</span>
                  <span class="badge ${m.connected ? 'success' : 'warn'}">${m.connected ? 'CONNECTED' : 'NOT LINKED'}</span>
                </div>
                <div class="text-xs text-gray-400 space-y-1">
                  <div>Synced products: <span class="text-white font-bold">${esc(m.synced ?? 0)}</span></div>
                  <div>Last sync: <span class="text-white">${esc(m.last_sync || 'never')}</span></div>
                </div>
                <button class="w-full btn-ghost py-2 rounded-lg mt-3 text-sm" disabled><i class="fas fa-link mr-1"></i> Connect ${esc(mp)} (Soon)</button>
              </div>`
            }).join('')}
          </div>
          <div class="glass rounded-2xl p-5 mt-4">
            <p class="text-sm text-gray-300"><i class="fas fa-info-circle mr-2 text-amber-400"></i> Marketplace OAuth integration sedang dalam pengembangan (Sprint 6).</p>
          </div>
        `
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        content.innerHTML = `<div class="glass rounded-2xl p-6"><p class="text-red-400">${esc(err.message)}</p></div>`
      }
    },

    async billing() {
      setPageMeta('Subscription', 'Upgrade plan via Duitku payment gateway')
      const content = $('#page-content')
      const u = State.user || {}
      content.innerHTML = '<div class="skel h-4 w-32"></div>'
      try {
        const r = await API.get('/api/billing/plans')
        const plans = r.plans || []
        content.innerHTML = `
          <div class="glass rounded-2xl p-5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Current Plan</div>
              <div class="text-2xl font-bold gold-text">${esc((u.subscription_tier || 'free').toUpperCase())}</div>
            </div>
            <p class="text-xs text-gray-500 max-w-md">${esc(r.note || 'Upgrade untuk unlock Curator-OS unlimited + multi-marketplace sync')}</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            ${plans.map(p => `
              <div class="glass rounded-2xl p-5 ${p.featured ? 'ring-2 ring-amber-500/40' : ''}">
                ${p.featured ? '<div class="text-[10px] font-bold text-amber-400 uppercase mb-1">⭐ Popular</div>' : ''}
                <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">${esc(p.id)}</div>
                <div class="text-2xl font-black mb-1">${esc(p.name)}</div>
                <div class="text-3xl font-black ${p.featured ? 'gold-text' : ''} mb-3">${p.price === 0 ? 'Gratis' : esc(idr(p.price))}<span class="text-sm text-gray-500 font-normal">${esc(p.period || '/bulan')}</span></div>
                <ul class="text-sm text-gray-300 space-y-1 mb-4">
                  ${(p.features || []).map(f => `<li class="flex gap-2"><i class="fas fa-check text-emerald-400 text-xs mt-1"></i> ${esc(f)}</li>`).join('')}
                </ul>
                <button class="w-full py-2.5 rounded-lg font-bold ${p.featured ? 'btn-gold' : 'btn-ghost'}" data-plan="${esc(p.id)}" ${u.subscription_tier === p.id ? 'disabled' : ''}>
                  ${u.subscription_tier === p.id ? 'Plan Anda' : (p.price === 0 ? 'Downgrade' : 'Upgrade →')}
                </button>
              </div>
            `).join('')}
          </div>
          <p class="text-xs text-gray-500 mt-4">Payment via Duitku (D22457) — secured by SparkMind v7.3 callback hardening.</p>
        `
        $$('#page-content [data-plan]').forEach(b => b.addEventListener('click', () => upgradePlan(b.dataset.plan)))
      } catch (err) {
        if (err.status === 401) return logoutFlow()
        content.innerHTML = `<div class="glass rounded-2xl p-6"><p class="text-red-400">${esc(err.message)}</p></div>`
      }
    },

    async settings() {
      setPageMeta('Settings', 'Profil & konfigurasi')
      const u = State.user || {}
      $('#page-content').innerHTML = `
        <div class="glass rounded-2xl p-6 max-w-2xl">
          <h3 class="font-bold mb-4">👤 Profil</h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-400">Nama</span><span>${esc(u.name || '-')}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Email</span><span>${esc(u.email || '-')}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Bisnis</span><span>${esc(u.business_name || '-')}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Tier</span><span class="badge gold">${esc((u.subscription_tier || 'free').toUpperCase())}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">User ID</span><span class="font-mono text-xs">${esc(u.id || '-')}</span></div>
          </div>
          <hr class="border-white/5 my-4">
          <h3 class="font-bold mb-3">⚙️ API & Bindings</h3>
          <div id="api-status" class="text-sm space-y-1">Loading...</div>
        </div>
      `
      try {
        const r = await API.get('/api/health')
        $('#api-status').innerHTML = `
          <div class="flex justify-between"><span class="text-gray-400">Service</span><span>${esc(r.service)}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Version</span><span>${esc(r.version)}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Environment</span><span class="badge indigo">${esc(r.environment)}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">D1 Database</span><span class="badge ${r.bindings.d1 ? 'success' : 'error'}">${r.bindings.d1 ? 'BOUND' : 'NOT BOUND'}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">KV Storage</span><span class="badge ${r.bindings.kv ? 'success' : 'warn'}">${r.bindings.kv ? 'BOUND' : 'NOT BOUND'}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">R2 Bucket</span><span class="badge ${r.bindings.r2 ? 'success' : 'warn'}">${r.bindings.r2 ? 'BOUND' : 'NOT BOUND'}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Workers AI</span><span class="badge ${r.bindings.ai ? 'success' : 'warn'}">${r.bindings.ai ? 'BOUND' : 'NOT BOUND'}</span></div>
        `
      } catch {}
    },
  }

  // ---------- Helpers for Pages ----------
  function setPageMeta(title, sub) {
    $('#page-title').textContent = title
    $('#page-sub').textContent = sub
    $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === State.route))
  }

  async function loadProducts() {
    const q = ($('#prod-search')?.value || '').toLowerCase()
    try {
      const r = await API.get('/api/products?limit=200')
      const list = (r.products || []).filter(p => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
      const el = $('#prod-list')
      if (!el) return
      if (!list.length) {
        el.innerHTML = '<div class="col-span-full glass rounded-2xl p-8 text-center"><p class="text-gray-400 mb-3">Belum ada produk. Tambah produk pertama Anda!</p><button class="btn-gold px-4 py-2 rounded-lg font-bold" onclick="document.getElementById(\'add-prod\').click()">+ Tambah Produk</button></div>'
        return
      }
      el.innerHTML = list.map(renderProductCard).join('')
      $$('#prod-list [data-edit]').forEach(b => b.addEventListener('click', () => openProductModal(list.find(p => p.id === b.dataset.edit))))
      $$('#prod-list [data-del]').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.del)))
    } catch (err) {
      if (err.status === 401) return logoutFlow()
      toast(err.message, 'error')
    }
  }

  function renderProductCard(p) {
    const images = safeJSON(p.images, [])
    const img = images[0] || `https://placehold.co/400x500/12121A/D4AF37/svg?text=${encodeURIComponent(p.name.slice(0, 16))}`
    return `<div class="glass rounded-2xl overflow-hidden">
      <div class="aspect-square w-full overflow-hidden bg-slate-900" style="height:200px"><img src="${esc(img)}" alt="${esc(p.name)}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/400x500/12121A/D4AF37/svg?text=${encodeURIComponent(p.name.slice(0, 12))}'"></div>
      <div class="p-4">
        <div class="font-bold text-sm mb-1 line-clamp-1">${esc(p.name)}</div>
        <div class="gold-text font-bold mb-2">${esc(idr(p.price))}</div>
        <div class="flex items-center justify-between text-xs text-gray-400 mb-3">
          <span>${esc(p.category || '-')}</span>
          <span>Stock: <b class="${p.stock > 0 ? 'text-emerald-400' : 'text-red-400'}">${esc(p.stock || 0)}</b></span>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 btn-ghost py-1.5 rounded-lg text-xs" data-edit="${esc(p.id)}"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn-ghost py-1.5 px-3 rounded-lg text-xs text-red-400" data-del="${esc(p.id)}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`
  }

  function openProductModal(prod) {
    const isEdit = !!prod
    const p = prod || {}
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'
    modal.innerHTML = `
      <div class="glass rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">${isEdit ? '✏️ Edit Produk' : '+ Tambah Produk'}</h3>
          <button class="btn-ghost px-3 py-1 rounded-lg" id="close-modal">✕</button>
        </div>
        <form id="prod-form" class="space-y-3">
          <div><label class="text-xs text-gray-400">Nama *</label><input class="kk-input" id="f-name" required value="${esc(p.name || '')}"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs text-gray-400">Harga Jual (IDR) *</label><input type="number" class="kk-input" id="f-price" required value="${esc(p.price || '')}"></div>
            <div><label class="text-xs text-gray-400">Harga Modal (IDR)</label><input type="number" class="kk-input" id="f-cost" value="${esc(p.cost_price || '')}"></div>
          </div>
          <div><label class="text-xs text-gray-400">Deskripsi</label><textarea class="kk-input" id="f-desc" rows="2">${esc(p.description || '')}</textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs text-gray-400">Kategori</label><input class="kk-input" id="f-cat" value="${esc(p.category || '')}" placeholder="Atasan/Bawahan/dll"></div>
            <div><label class="text-xs text-gray-400">Sub-kategori</label><input class="kk-input" id="f-subcat" value="${esc(p.subcategory || '')}" placeholder="Kemeja/Celana/dll"></div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="text-xs text-gray-400">Size</label><input class="kk-input" id="f-size" value="${esc(p.size || '')}" placeholder="S/M/L"></div>
            <div><label class="text-xs text-gray-400">Warna</label><input class="kk-input" id="f-color" value="${esc(p.color || '')}"></div>
            <div><label class="text-xs text-gray-400">Stock</label><input type="number" class="kk-input" id="f-stock" value="${esc(p.stock || 0)}"></div>
          </div>
          <div><label class="text-xs text-gray-400">URL Gambar (1 per baris)</label><textarea class="kk-input" id="f-images" rows="2" placeholder="https://...jpg">${esc(safeJSON(p.images, []).join('\n'))}</textarea></div>
          <button type="submit" class="w-full btn-gold py-3 rounded-lg font-bold mt-2">${isEdit ? '💾 Update' : '+ Tambah'}</button>
        </form>
      </div>
    `
    document.body.appendChild(modal)
    const close = () => modal.remove()
    $('#close-modal', modal).addEventListener('click', close)
    modal.addEventListener('click', e => { if (e.target === modal) close() })

    $('#prod-form', modal).addEventListener('submit', async (e) => {
      e.preventDefault()
      const body = {
        name: $('#f-name', modal).value.trim(),
        price: parseInt($('#f-price', modal).value, 10),
        cost_price: parseInt($('#f-cost', modal).value, 10) || null,
        description: $('#f-desc', modal).value.trim(),
        category: $('#f-cat', modal).value.trim(),
        subcategory: $('#f-subcat', modal).value.trim(),
        size: $('#f-size', modal).value.trim(),
        color: $('#f-color', modal).value.trim(),
        stock: parseInt($('#f-stock', modal).value, 10) || 0,
        images: $('#f-images', modal).value.split('\n').map(s => s.trim()).filter(Boolean),
      }
      try {
        if (isEdit) {
          await API.put('/api/products/' + p.id, body); toast('Produk diupdate')
        } else {
          await API.post('/api/products', body); toast('Produk ditambahkan')
        }
        close(); loadProducts()
      } catch (err) { toast(err.message, 'error') }
    })
  }

  async function deleteProduct(id) {
    if (!confirm('Hapus produk ini?')) return
    try { await API.del('/api/products/' + id); toast('Produk dihapus'); loadProducts() }
    catch (err) { toast(err.message, 'error') }
  }

  async function loadPosProducts() {
    const q = ($('#pos-search')?.value || '').toLowerCase()
    try {
      const r = await API.get('/api/products?limit=200')
      const list = (r.products || []).filter(p => !q || p.name.toLowerCase().includes(q))
      const el = $('#pos-products')
      if (!el) return
      if (!list.length) { el.innerHTML = '<p class="col-span-full text-center text-gray-500 py-6">Belum ada produk.</p>'; return }
      el.innerHTML = list.map(p => {
        const images = safeJSON(p.images, [])
        const img = images[0] || `https://placehold.co/200x200/12121A/D4AF37/svg?text=${encodeURIComponent(p.name.slice(0, 12))}`
        return `<button class="glass rounded-xl overflow-hidden text-left hover:ring-2 hover:ring-amber-500/40 transition" data-add="${esc(p.id)}">
          <div class="aspect-square bg-slate-900 overflow-hidden" style="height:100px"><img src="${esc(img)}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/200x200/12121A/D4AF37/svg?text=K'"></div>
          <div class="p-2">
            <div class="font-bold text-xs line-clamp-1">${esc(p.name)}</div>
            <div class="gold-text text-xs font-bold mt-1">${esc(idr(p.price))}</div>
          </div>
        </button>`
      }).join('')
      $$('[data-add]', el).forEach(b => b.addEventListener('click', () => addToCart(list.find(p => p.id === b.dataset.add))))
    } catch (err) { if (err.status === 401) return logoutFlow() }
  }

  function addToCart(p) {
    const existing = Pages._cart.find(c => c.id === p.id)
    if (existing) existing.qty++
    else Pages._cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 })
    renderCart()
  }

  function renderCart() {
    const el = $('#cart-items')
    if (!el) return
    if (!Pages._cart.length) {
      el.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">Keranjang kosong</p>'
      $('#checkout-btn').disabled = true
      $('#cart-total').textContent = 'Rp 0'
      return
    }
    el.innerHTML = Pages._cart.map((c, i) => `
      <div class="flex items-center gap-2 glass rounded-lg p-2">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium line-clamp-1">${esc(c.name)}</div>
          <div class="text-xs gold-text">${esc(idr(c.price))} × ${c.qty}</div>
        </div>
        <div class="flex items-center gap-1">
          <button class="btn-ghost w-7 h-7 rounded text-xs" data-qty="${i}|-1">-</button>
          <span class="text-sm w-6 text-center">${c.qty}</span>
          <button class="btn-ghost w-7 h-7 rounded text-xs" data-qty="${i}|1">+</button>
          <button class="btn-ghost w-7 h-7 rounded text-xs text-red-400" data-qty="${i}|del">✕</button>
        </div>
      </div>
    `).join('')
    const total = Pages._cart.reduce((s, c) => s + c.price * c.qty, 0)
    $('#cart-total').textContent = idr(total)
    $('#checkout-btn').disabled = false
    $$('[data-qty]', el).forEach(b => b.addEventListener('click', () => {
      const [i, op] = b.dataset.qty.split('|'); const idx = parseInt(i, 10)
      if (op === 'del') Pages._cart.splice(idx, 1)
      else { Pages._cart[idx].qty += parseInt(op, 10); if (Pages._cart[idx].qty <= 0) Pages._cart.splice(idx, 1) }
      renderCart()
    }))
  }

  async function checkout() {
    if (!Pages._cart.length) return
    const items = Pages._cart.map(c => ({ product_id: c.id, quantity: c.qty, price: c.price }))
    const customer_name = $('#customer-name').value.trim()
    const customer_phone = $('#customer-phone').value.trim()
    try {
      const r = await API.post('/api/orders', { items, customer_name, customer_phone, marketplace: 'offline', payment_status: 'paid' })
      toast('✅ Order ' + r.order_number + ' · Total ' + idr(r.total))
      Pages._cart = []; renderCart()
      $('#customer-name').value = ''; $('#customer-phone').value = ''
    } catch (err) { toast(err.message, 'error') }
  }

  async function generateOutfit() {
    const occasion = $('#st-occasion').value
    const style = $('#st-style').value || undefined
    const max_products = parseInt($('#st-max').value, 10) || 4
    $('#st-generate').disabled = true; $('#st-generate').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'
    try {
      const r = await API.post('/api/stylist/generate', { occasion, style, max_products })
      if (!r.ok) throw new Error(r.error || 'Generation failed')
      $('#st-result').innerHTML = `
        <div class="glass rounded-2xl p-5 mb-4 border border-amber-500/30">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold gold-text">✨ Outfit Generated!</h4>
            <span class="badge gold">${esc(r.meta?.model || 'heuristic')}</span>
          </div>
          ${(r.data || []).map(renderOutfitDetail).join('')}
        </div>
      `
      // Reload saved
      const sr = await API.get('/api/stylist/outfits')
      $('#st-saved').innerHTML = (sr.outfits || []).map(renderOutfitCard).join('')
    } catch (err) { toast(err.message, 'error') }
    finally { $('#st-generate').disabled = false; $('#st-generate').innerHTML = '<i class="fas fa-wand-magic-sparkles mr-1"></i> Generate Outfit' }
  }

  function renderOutfitDetail(o) {
    return `<div class="mb-3">
      <h5 class="font-bold mb-2">${esc(o.outfit_name)}</h5>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        ${(o.products || []).map(p => `<div class="glass rounded-lg p-2">
          ${p.image_url ? `<div class="aspect-square bg-slate-900 rounded mb-1 overflow-hidden"><img src="${esc(p.image_url)}" class="w-full h-full object-cover" onerror="this.style.display='none'"></div>` : ''}
          <div class="text-xs font-medium line-clamp-1">${esc(p.name)}</div>
          <div class="text-xs gold-text">${esc(idr(p.price))}</div>
        </div>`).join('')}
      </div>
      <p class="text-sm text-gray-300 mb-2">${esc(o.description)}</p>
      <div class="text-xs text-gray-400">💡 ${(o.styling_tips || []).map(t => esc(t)).join(' · ')}</div>
      <div class="mt-2 text-sm"><b class="gold-text">${esc(idr(o.total_price))}</b> · ${o.discount_percentage ? `<span class="text-emerald-400">Hemat ${o.discount_percentage}%</span>` : ''}</div>
    </div>`
  }

  function renderOutfitCard(o) {
    const products = safeJSON(o.products, [])
    const tips = safeJSON(o.styling_tips, [])
    return `<div class="glass rounded-2xl p-4">
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-bold">${esc(o.name || 'Outfit')}</h4>
        <span class="badge indigo">${esc(o.occasion || '-')}</span>
      </div>
      <p class="text-xs text-gray-400 mb-2 line-clamp-2">${esc(o.description || '')}</p>
      <div class="text-sm gold-text font-bold">${esc(idr(o.total_price))}</div>
      <div class="text-[10px] text-gray-500 mt-1">${products.length} items · ${esc(o.style || 'auto')} · ${esc(ago(o.created_at))}</div>
    </div>`
  }

  async function generateContent() {
    const product_id = $('#ct-product').value
    if (!product_id) return toast('Pilih produk dulu', 'warn')
    const platform = $('#ct-platform').value
    const tone = $('#ct-tone').value
    $('#ct-generate').disabled = true; $('#ct-generate').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'
    try {
      const r = await API.post('/api/content/generate', { product_id, platform, tone })
      if (!r.ok) throw new Error(r.error || 'Generation failed')
      const d = r.data
      $('#ct-result').innerHTML = `
        <div class="glass rounded-2xl p-5 mb-4 border border-indigo-500/30">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold grad-text">📝 Konten Generated!</h4>
            <button class="btn-ghost px-3 py-1 rounded-lg text-xs" id="copy-cnt">📋 Copy All</button>
          </div>
          <div class="mb-3">
            <div class="text-xs text-gray-400 mb-1">CAPTION</div>
            <div class="glass rounded-lg p-3 text-sm whitespace-pre-wrap" id="ct-caption">${esc(d.caption)}</div>
          </div>
          <div class="mb-3">
            <div class="text-xs text-gray-400 mb-1">HASHTAGS</div>
            <div class="text-sm text-indigo-300">${(d.hashtags || []).map(h => esc(h)).join(' ')}</div>
          </div>
          <div class="mb-3">
            <div class="text-xs text-gray-400 mb-1">HOOKS (3-detik untuk video)</div>
            <ul class="text-sm space-y-1">${(d.hooks || []).map((h, i) => `<li>${i + 1}. ${esc(h)}</li>`).join('')}</ul>
          </div>
          <div>
            <div class="text-xs text-gray-400 mb-1">CTA</div>
            <div class="text-sm gold-text font-bold">${esc(d.cta)}</div>
          </div>
        </div>
      `
      $('#copy-cnt').addEventListener('click', async () => {
        const txt = `${d.caption}\n\n${(d.hashtags || []).join(' ')}\n\n${d.cta}`
        await navigator.clipboard.writeText(txt); toast('Disalin ke clipboard!')
      })
      // Reload saved
      const cr = await API.get('/api/content')
      $('#ct-saved').innerHTML = (cr.content || []).map(renderContentCard).join('')
    } catch (err) { toast(err.message, 'error') }
    finally { $('#ct-generate').disabled = false; $('#ct-generate').innerHTML = '<i class="fas fa-share-nodes mr-1"></i> Generate Konten' }
  }

  function renderContentCard(c) {
    const tags = safeJSON(c.hashtags, [])
    return `<div class="glass rounded-2xl p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="badge indigo">${esc(c.type || '-')}</span>
        <span class="text-[10px] text-gray-500">${esc(ago(c.created_at))}</span>
      </div>
      <p class="text-sm mb-2 line-clamp-3">${esc(c.caption || '')}</p>
      <div class="text-xs text-indigo-300 line-clamp-1">${tags.slice(0, 5).map(t => esc(t)).join(' ')}</div>
    </div>`
  }

  async function upgradePlan(planId) {
    if (planId === 'free') return toast('Free tier sudah aktif', 'info')
    try {
      const r = await API.post('/api/billing/checkout', { plan_id: planId })
      if (r.payment_url) {
        toast('Mengarahkan ke pembayaran Duitku...', 'info')
        setTimeout(() => window.location.href = r.payment_url, 800)
      } else if (r.ok) {
        toast('Plan diaktifkan!'); State.user.subscription_tier = planId
        localStorage.setItem('kk_user', JSON.stringify(State.user)); navigate('billing')
      }
    } catch (err) { toast(err.message, 'error') }
  }

  // ---------- Navigation ----------
  function navigate(route) {
    if (!State.token) return renderAuthScreen()
    State.route = route
    if (!Pages[route]) route = 'dashboard'
    location.hash = '#' + route
    if (!$('#nav')) renderAppShell()
    Pages[route]()
  }

  function logoutFlow() { setAuth(null, null); renderAuthScreen() }

  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) } }
  function safeJSON(s, fb) { try { return JSON.parse(s || 'null') ?? fb } catch { return fb } }

  // ---------- Bootstrap ----------
  async function boot() {
    if (!State.token) return renderAuthScreen()
    // Validate token
    try {
      const r = await API.get('/api/auth/me')
      State.user = r.user || State.user
      localStorage.setItem('kk_user', JSON.stringify(State.user))
      renderAppShell()
      const initRoute = (location.hash || '#dashboard').slice(1)
      navigate(Pages[initRoute] ? initRoute : 'dashboard')
    } catch (err) {
      if (err.status === 401) return logoutFlow()
      toast(err.message, 'error')
      renderAppShell(); navigate('dashboard')
    }
  }

  window.addEventListener('hashchange', () => {
    const r = (location.hash || '#dashboard').slice(1)
    if (Pages[r] && r !== State.route) navigate(r)
  })

  document.addEventListener('DOMContentLoaded', boot)
})()
