// ============================================================
// @sparkmind/ui-kit — Dark Sovereign theme tokens + shared layouts
// Used across all SparkMind sub-brands
// ============================================================

export const tokens = {
  colors: {
    background: '#0A0A0F',       // Deep Void
    surface: '#12121A',           // Dark Surface
    surfaceElevated: '#1E1E2A',   // Elevated
    border: '#2A2A3A',            // Subtle Border
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0B0',
    textMuted: '#6A6A7A',
    accentGold: '#D4AF37',        // Sovereign Gold
    accentIndigo: '#6366F1',
    accentEmerald: '#10B981',
    accentRose: '#F43F5E',
    accentAmber: '#F59E0B',
  },
  fonts: {
    sans: `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`,
    mono: `'JetBrains Mono', 'Fira Code', monospace`,
  },
  radius: {
    sm: '6px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
}

// Tailwind classes preset (used inside JSX/HTML)
export const tw = {
  // Surfaces
  glass: 'bg-white/[0.04] backdrop-blur-xl border border-white/10',
  glassHover: 'hover:bg-white/[0.06] hover:border-white/20',
  card: 'bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl',

  // Buttons
  btnPrimary: 'bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-semibold px-4 py-2 rounded-lg transition shadow-lg shadow-indigo-500/30',
  btnSecondary: 'bg-white/5 hover:bg-white/10 text-white font-semibold px-4 py-2 rounded-lg border border-white/10 transition',
  btnDanger: 'bg-gradient-to-br from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-semibold px-4 py-2 rounded-lg transition',
  btnGold: 'bg-gradient-to-br from-amber-400 to-yellow-600 hover:from-amber-300 hover:to-yellow-500 text-slate-900 font-bold px-4 py-2 rounded-lg transition shadow-lg shadow-amber-500/30',

  // Text
  gradientText: 'bg-gradient-to-r from-indigo-400 via-violet-400 to-amber-400 bg-clip-text text-transparent',

  // Inputs
  input: 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition',

  // Layout
  page: 'min-h-screen bg-slate-950 text-white',
  container: 'max-w-6xl mx-auto px-4 sm:px-6 py-6',
}

// Reusable HTML chunks (return raw HTML strings — used inside c.html)
export function navbar(brand: string, version: string, links: Array<{ label: string; href: string; icon?: string }>): string {
  return `<nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2.5 group">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-600 to-amber-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">K</div>
        <span class="text-base font-bold tracking-tight">${brand} <span class="text-[10px] text-amber-400 font-mono ml-0.5">${version}</span></span>
      </a>
      <div class="flex items-center gap-1.5">
        ${links.map(l => `<a href="${l.href}" class="hidden sm:inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition">${l.icon ? `<i class="${l.icon}"></i>` : ''} ${l.label}</a>`).join('')}
      </div>
    </div>
  </nav>`
}

export function styleBlock(): string {
  return `<style>
    *{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif}
    body{background:#0A0A0F;color:#E5E7EB;overflow-x:hidden}
    .glass{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    .gradient-text{background:linear-gradient(135deg,#a78bfa,#60a5fa,#d4af37);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .grid-bg{background-image:linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px);background-size:50px 50px}
    .btn-primary{background:linear-gradient(135deg,#4f46e5,#6366f1,#8b5cf6);transition:all .3s}
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(99,102,241,.4)}
    .btn-gold{background:linear-gradient(135deg,#d4af37,#f59e0b);color:#0a0a0f;transition:all .3s}
    .btn-gold:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(245,158,11,.4)}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    .float{animation:float 5s ease-in-out infinite}
    @media (prefers-reduced-motion: reduce){.float{animation:none}}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(99,102,241,.3);border-radius:3px}
    ::-webkit-scrollbar-thumb:hover{background:rgba(99,102,241,.5)}
    input,select,textarea{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;padding:.625rem .875rem;border-radius:.5rem;width:100%;font-size:.875rem;outline:none;transition:border .2s}
    input:focus,select:focus,textarea:focus{border-color:#6366f1}
  </style>`
}
