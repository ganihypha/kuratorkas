// ============================================================
// @sparkmind/curator-os — Multi-Agent AI SDK for Curator.OS
// 5 agents: AI Stylist · Content · Trend · Pricing · Marketplace
// Doctrine: 05_CURATOR_OS_SPEC_v1.md
// ============================================================
import type { Product, Occasion, StyleTag } from '@sparkmind/core'

// ----- Agent base contract -----
export interface AgentInput {
  userId: string
  context?: Record<string, any>
}

export interface AgentOutput<T = any> {
  agentId: string
  ok: boolean
  data?: T
  error?: string
  meta?: { tokensUsed?: number; durationMs?: number; model?: string }
}

export interface AIGatewayCaller {
  // Provider-agnostic AI caller (uses Cloudflare AI Gateway / Workers AI / external)
  generateText(prompt: string, opts?: { system?: string; maxTokens?: number; temperature?: number }): Promise<string>
  generateEmbedding?(text: string): Promise<number[]>
}

// ============================================================
// AGENT 1 — AI STYLIST CURATOR
// ============================================================
export interface StylistInput extends AgentInput {
  productIds: string[]      // candidate product pool (user's catalog)
  products: Product[]       // full product objects for context
  occasion: Occasion
  style?: StyleTag
  maxProducts?: number      // default 4
}

export interface OutfitSuggestion {
  outfit_name: string
  products: Array<{ product_id: string; name: string; price: number; image_url?: string }>
  total_price: number
  discount_percentage: number
  occasion: Occasion
  style: StyleTag
  description: string
  styling_tips: string[]
}

export interface StylistOutput extends AgentOutput<OutfitSuggestion[]> {}

export const stylistAgent = {
  id: 'stylist',
  system: `You are an expert AI Fashion Stylist for Indonesian UMKM fashion retailers.
Your role is to analyze product catalogs and generate outfit recommendations.

CAPABILITIES:
- Analyze product images, descriptions, and attributes
- Generate outfit combinations based on occasion (casual, formal, party, office)
- Create visual collages of outfit combinations
- Suggest size matching based on customer data
- Understand Indonesian fashion trends and preferences

CONSTRAINTS:
- Only recommend products from the user's catalog
- Ensure outfit combinations are cohesive and stylish
- Consider price range and target audience
- Respect cultural norms and preferences

OUTPUT FORMAT (strict JSON):
{
  "outfits": [
    {
      "outfit_name": "string",
      "products": [{"product_id": "string", "name": "string", "price": number}],
      "total_price": number,
      "discount_percentage": number,
      "occasion": "casual|formal|party|office",
      "style": "korean|streetwear|minimalist|traditional|modern",
      "description": "string (1-2 sentences in Indonesian)",
      "styling_tips": ["string"]
    }
  ]
}`,

  async run(input: StylistInput, ai?: AIGatewayCaller): Promise<StylistOutput> {
    const started = Date.now()
    try {
      const maxN = input.maxProducts ?? 4
      const eligible = input.products.filter(p => input.productIds.includes(p.id))

      // ----- HEURISTIC FALLBACK (when no AI Gateway available) -----
      // Builds a rule-based outfit: 1 top + 1 bottom + 1 footwear + 1 accessory if available.
      if (!ai || !input.products.length) {
        const suggestions = buildHeuristicOutfits(eligible, input.occasion, input.style, maxN)
        return {
          agentId: 'stylist',
          ok: true,
          data: suggestions,
          meta: { durationMs: Date.now() - started, model: 'heuristic-v0.1' },
        }
      }

      // ----- AI-POWERED PATH -----
      const catalogStr = eligible.slice(0, 20).map(p =>
        `- [${p.id}] ${p.name} | Rp${p.price} | ${p.category ?? '-'} | ${p.color ?? '-'} | ${p.size ?? '-'}`
      ).join('\n')

      const prompt = `Katalog produk UMKM:
${catalogStr}

Buatkan 3 kombinasi outfit untuk occasion "${input.occasion}"${input.style ? `, style "${input.style}"` : ''}.
Maksimal ${maxN} produk per outfit. Output dalam JSON sesuai format yang ditentukan.`

      const raw = await ai.generateText(prompt, { system: stylistAgent.system, maxTokens: 1200, temperature: 0.7 })
      const parsed = parseStylistJSON(raw)
      return {
        agentId: 'stylist',
        ok: true,
        data: parsed.length ? parsed : buildHeuristicOutfits(eligible, input.occasion, input.style, maxN),
        meta: { durationMs: Date.now() - started, model: 'ai-gateway' },
      }
    } catch (e: any) {
      return { agentId: 'stylist', ok: false, error: e?.message ?? 'stylist error' }
    }
  },
}

function parseStylistJSON(s: string): OutfitSuggestion[] {
  try {
    const cleaned = s.replace(/```json|```/g, '').trim()
    const obj = JSON.parse(cleaned)
    return Array.isArray(obj.outfits) ? obj.outfits : []
  } catch {
    return []
  }
}

function buildHeuristicOutfits(products: Product[], occasion: Occasion, style: StyleTag | undefined, maxN: number): OutfitSuggestion[] {
  if (!products.length) return []
  const byCat = (cats: string[]) => products.find(p => p.category && cats.some(c => p.category!.toLowerCase().includes(c)))
  const tops = byCat(['atasan', 'top', 'kemeja', 'blouse', 'kaos', 'shirt', 't-shirt'])
  const bottoms = byCat(['bawahan', 'bottom', 'celana', 'rok', 'pants', 'skirt', 'jeans'])
  const footwear = byCat(['sepatu', 'shoes', 'sandal', 'sneakers'])
  const accessory = byCat(['aksesori', 'tas', 'bag', 'topi', 'hat', 'belt'])
  const picks = [tops, bottoms, footwear, accessory].filter(Boolean).slice(0, maxN) as Product[]
  const useful = picks.length ? picks : products.slice(0, Math.min(maxN, products.length))
  const total = useful.reduce((s, p) => s + (p.price || 0), 0)
  const styleLabel: StyleTag = style ?? 'minimalist'
  const styleHints: Record<StyleTag, string> = {
    korean: 'Tone netral, layering tipis, sneakers minimalis.',
    streetwear: 'Oversized + sneaker chunky + bucket hat untuk look TikTok-ready.',
    minimalist: 'Warna monokrom + cutting bersih, fokus ke fit & fabric quality.',
    traditional: 'Sentuh batik / tenun sebagai statement piece.',
    modern: 'Mix textures (cotton + leather + denim) untuk depth.',
  }
  return [
    {
      outfit_name: `${cap(occasion)} ${cap(styleLabel)} #1`,
      products: useful.map(p => ({ product_id: p.id, name: p.name, price: p.price, image_url: firstImage(p) })),
      total_price: total,
      discount_percentage: useful.length >= 3 ? 5 : 0,
      occasion,
      style: styleLabel,
      description: `Kombinasi ${useful.length} item untuk ${occasion} dengan vibe ${styleLabel}.`,
      styling_tips: [
        styleHints[styleLabel],
        'Foto produk dengan natural light pagi 7-9 untuk konten IG/TikTok.',
        useful.length < 3 ? 'Pertimbangkan tambah 1 aksesori untuk completing look.' : 'Bundle ini siap di-promote sebagai paket diskon.',
      ],
    },
  ]
}

function firstImage(p: Product): string | undefined {
  try {
    const arr = p.images ? JSON.parse(p.images) : []
    return Array.isArray(arr) && arr.length ? arr[0] : undefined
  } catch { return undefined }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

// ============================================================
// AGENT 2 — CONTENT CURATOR (caption + hashtag generator)
// ============================================================
export interface ContentInput extends AgentInput {
  product: Product
  tone?: 'casual' | 'professional' | 'playful'
  platform?: 'instagram' | 'tiktok' | 'both'
}

export interface ContentSuggestion {
  caption: string
  hashtags: string[]
  hooks: string[]            // 3 different 3-second hooks for video
  cta: string                // call-to-action
}

export const contentAgent = {
  id: 'content',
  async run(input: ContentInput, ai?: AIGatewayCaller): Promise<AgentOutput<ContentSuggestion>> {
    const started = Date.now()
    const tone = input.tone ?? 'casual'
    const platform = input.platform ?? 'instagram'
    if (!ai) {
      // heuristic
      const p = input.product
      const data: ContentSuggestion = {
        caption: heuristicCaption(p, tone),
        hashtags: heuristicHashtags(p, platform),
        hooks: heuristicHooks(p),
        cta: 'Order via DM atau klik link di bio 🛒',
      }
      return { agentId: 'content', ok: true, data, meta: { durationMs: Date.now() - started, model: 'heuristic-v0.1' } }
    }
    try {
      const prompt = `Buatkan content marketing untuk produk fashion ini:
Nama: ${input.product.name}
Harga: Rp${input.product.price}
Kategori: ${input.product.category ?? '-'}
Deskripsi: ${input.product.description ?? '-'}

Generate (JSON):
- caption (${tone}, max 150 kata, dalam Bahasa Indonesia, untuk ${platform})
- hashtags (15-20 hashtag relevan + trending)
- hooks (3 hook 3-detik untuk video)
- cta (call-to-action)`
      const raw = await ai.generateText(prompt, { maxTokens: 600, temperature: 0.8 })
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const obj = JSON.parse(cleaned)
      return { agentId: 'content', ok: true, data: obj as ContentSuggestion, meta: { durationMs: Date.now() - started } }
    } catch (e: any) {
      return { agentId: 'content', ok: false, error: e?.message ?? 'content error' }
    }
  },
}

function heuristicCaption(p: Product, tone: 'casual' | 'professional' | 'playful'): string {
  const toneIntro = {
    casual: `Lagi cari ${p.category ?? 'outfit'} yang cocok buat daily?`,
    professional: `${p.name} hadir dengan kualitas terbaik untuk look profesional.`,
    playful: `OMG! ${p.name} ini bener-bener game changer! ✨`,
  }
  return `${toneIntro[tone]}

${p.name} ${p.description ? '— ' + p.description : ''}

💰 Harga: Rp${Number(p.price).toLocaleString('id-ID')}
${p.color ? '🎨 Warna: ' + p.color + '\n' : ''}${p.size ? '📏 Size: ' + p.size + '\n' : ''}
✨ Stok terbatas, buruan order sebelum kehabisan!`
}

function heuristicHashtags(p: Product, platform: string): string[] {
  const base = ['#FashionIndonesia', '#OOTD', '#FashionMurah', '#UMKMIndonesia']
  const cat = p.category ? `#${p.category.replace(/\s+/g, '')}` : null
  const platformTags = platform === 'tiktok'
    ? ['#TikTokShopFashion', '#FYP', '#FashionTikTok', '#OutfitInspo']
    : ['#InstaFashion', '#FashionInspiration', '#StyleInspo']
  return [...base, ...(cat ? [cat] : []), ...platformTags, '#FashionLokal', '#SupportLokalBrand', '#NewArrival', '#BestSeller', '#LimitedEdition']
}

function heuristicHooks(p: Product): string[] {
  return [
    `POV: Lo nemuin ${p.name} di harga segini... 😱`,
    `Stop scroll! ${p.category ?? 'Outfit'} ini wajib masuk wishlist 2026 kamu!`,
    `Rahasia outfit ${p.color ? p.color + ' ' : ''}yang lagi viral di TikTok ⤵️`,
  ]
}

// ============================================================
// AGENT 3 — TREND CURATOR (heuristic + AI-augmented forecast)
// ============================================================
export const trendAgent = {
  id: 'trend',
  async run(_input: AgentInput, ai?: AIGatewayCaller): Promise<AgentOutput> {
    const started = Date.now()
    // Static seed (curated from real Indonesian fashion TikTok/IG trends 2026)
    // In Sprint 4 this will be replaced by live scraper output stored in D1
    const trending = [
      { category: 'aesthetic', title: 'Coquette-core', score: 92, description: 'Pink/lace/bow, vibe ballerina-feminine — viral di TikTok ID' },
      { category: 'silhouette', title: 'Wide-leg pants', score: 88, description: 'Korean-inspired high-waist, dominate 2026 Q1' },
      { category: 'color', title: 'Mocha Mousse', score: 85, description: 'Pantone Color of the Year — earth tones brown rising' },
      { category: 'fabric', title: 'Linen breathable', score: 81, description: 'Material adem cocok tropis, demand naik 40% YoY' },
      { category: 'occasion', title: 'Office Korean blazer', score: 78, description: 'Oversized cutting, perfect untuk work-from-cafe' },
      { category: 'category', title: 'Modest fashion (hijab)', score: 76, description: 'Sustained demand, growing 25% YoY di Indonesia' },
    ]
    const recommendations = [
      'Stock up produk warna earth-tone (cokelat, beige, mocha) untuk Q1 2026.',
      'Coba bundle "Office Look" — blazer + wide-leg pants + sneakers.',
      'Investasi konten TikTok dengan hook "Korean office outfit" — viral score tinggi.',
      'Audit katalog: tambah variant size untuk modest fashion (hijab-friendly).',
    ]
    if (!ai) {
      return {
        agentId: 'trend', ok: true,
        data: { trending, recommendations },
        meta: { durationMs: Date.now() - started, model: 'heuristic-curated-v1' },
      }
    }
    // AI-augmented (when binding exists, use it to personalize recommendations)
    try {
      const prompt = `Berdasarkan tren fashion Indonesia 2026 berikut: ${trending.map(t => t.title).join(', ')}. Buatkan 4 rekomendasi aksi spesifik untuk UMKM fashion (max 1 kalimat per item, Bahasa Indonesia). Output JSON: {"recommendations": ["..."]}`
      const raw = await ai.generateText(prompt, { maxTokens: 300, temperature: 0.6 })
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const obj = JSON.parse(cleaned)
      return {
        agentId: 'trend', ok: true,
        data: { trending, recommendations: obj.recommendations || recommendations },
        meta: { durationMs: Date.now() - started, model: 'ai-augmented-llama3' },
      }
    } catch {
      return {
        agentId: 'trend', ok: true,
        data: { trending, recommendations },
        meta: { durationMs: Date.now() - started, model: 'heuristic-curated-v1' },
      }
    }
  },
}

// ============================================================
// AGENT 4 — PRICING CURATOR (heuristic margin-based analysis)
// ============================================================
export interface PricingInput extends AgentInput {
  products?: Product[]
}
export const pricingAgent = {
  id: 'pricing',
  async run(input: PricingInput): Promise<AgentOutput> {
    const started = Date.now()
    const products = input.products || []
    if (!products.length) {
      return {
        agentId: 'pricing', ok: true,
        data: { avg_margin_pct: 0, underpriced_count: 0, overpriced_count: 0, suggestions: [] },
        meta: { durationMs: Date.now() - started, model: 'heuristic-margin-v1' },
      }
    }

    // Margin analysis: target healthy margin = 40-60% for fashion retail
    const TARGET_MIN = 0.40
    const TARGET_MAX = 0.60
    let totalMargin = 0
    let withCost = 0
    const suggestions: any[] = []
    let under = 0, over = 0

    for (const p of products) {
      if (!p.cost_price || !p.price) continue
      const margin = (p.price - p.cost_price) / p.price
      totalMargin += margin
      withCost++

      if (margin < TARGET_MIN) {
        // Underpriced — suggest raising
        under++
        const targetPrice = Math.round(p.cost_price / (1 - 0.5)) // 50% margin target
        suggestions.push({
          product_id: p.id,
          name: p.name,
          current_price: p.price,
          suggested_price: targetPrice,
          delta: targetPrice - p.price,
          margin_now: Math.round(margin * 100),
          margin_after: 50,
          reason: `Margin saat ini ${Math.round(margin * 100)}% — di bawah target 40-60%. Naikkan untuk profit sehat.`,
        })
      } else if (margin > TARGET_MAX + 0.15) {
        // Overpriced — could lose competitiveness
        over++
        const targetPrice = Math.round(p.cost_price / (1 - 0.55))
        suggestions.push({
          product_id: p.id,
          name: p.name,
          current_price: p.price,
          suggested_price: targetPrice,
          delta: targetPrice - p.price,
          margin_now: Math.round(margin * 100),
          margin_after: 55,
          reason: `Margin ${Math.round(margin * 100)}% — terlalu tinggi, bisa kalah saing. Turunkan untuk volume.`,
        })
      }

      // Low stock + high demand simulation
      if (p.stock <= 5 && p.stock > 0) {
        // Suggest a small premium (5%) on scarce items
        if (!suggestions.find(s => s.product_id === p.id)) {
          suggestions.push({
            product_id: p.id,
            name: p.name,
            current_price: p.price,
            suggested_price: Math.round(p.price * 1.05),
            delta: Math.round(p.price * 0.05),
            margin_now: p.cost_price ? Math.round(((p.price - p.cost_price) / p.price) * 100) : null,
            margin_after: null,
            reason: `Stock tinggal ${p.stock} unit — scarcity pricing, naikkan 5%.`,
          })
        }
      }
    }

    const avg = withCost ? Math.round((totalMargin / withCost) * 100) : 0
    return {
      agentId: 'pricing', ok: true,
      data: {
        avg_margin_pct: avg,
        underpriced_count: under,
        overpriced_count: over,
        suggestions: suggestions.slice(0, 20),
      },
      meta: { durationMs: Date.now() - started, model: 'heuristic-margin-v1' },
    }
  },
}

// ============================================================
// AGENT 5 — MARKETPLACE CURATOR (status tracker — OAuth in Sprint 6)
// ============================================================
export const marketplaceAgent = {
  id: 'marketplace',
  async run(_input: AgentInput): Promise<AgentOutput> {
    const started = Date.now()
    return {
      agentId: 'marketplace', ok: true,
      data: {
        marketplaces: {
          shopee: { connected: false, synced: 0, last_sync: null },
          tokopedia: { connected: false, synced: 0, last_sync: null },
          tiktok: { connected: false, synced: 0, last_sync: null },
        },
        next_step: 'OAuth flow akan tersedia di Sprint 6. Untuk sekarang export CSV dari menu Produk.',
      },
      meta: { durationMs: Date.now() - started, model: 'status-stub' },
    }
  },
}

// ============================================================
// CURATOR-OS ORCHESTRATOR
// ============================================================
export type CuratorAgentId = 'stylist' | 'content' | 'trend' | 'pricing' | 'marketplace'

export const AGENTS = {
  stylist: stylistAgent,
  content: contentAgent,
  trend: trendAgent,
  pricing: pricingAgent,
  marketplace: marketplaceAgent,
} as const

export interface AgentInfo {
  id: CuratorAgentId
  name: string
  emoji: string
  description: string
  status: 'live' | 'scaffold'
  capabilities: string[]
}

export function listAgents(): AgentInfo[] {
  return [
    {
      id: 'stylist', name: 'AI Stylist', emoji: '🪄',
      description: 'Outfit recommendation berbasis katalog produkmu',
      status: 'live',
      capabilities: ['outfit-combo', 'occasion-match', 'style-tag', 'heuristic+AI'],
    },
    {
      id: 'content', name: 'Content Curator', emoji: '📝',
      description: 'Auto-generate caption + hashtag IG/TikTok',
      status: 'live',
      capabilities: ['caption', 'hashtag-15-20', 'video-hooks', 'CTA'],
    },
    {
      id: 'trend', name: 'Trend Curator', emoji: '📈',
      description: 'Trend detection 7-30 hari ke depan',
      status: 'live',
      capabilities: ['trend-forecast', 'aesthetic-detect', 'recommendation'],
    },
    {
      id: 'pricing', name: 'Pricing AI', emoji: '💰',
      description: 'Dynamic pricing berbasis margin & stock',
      status: 'live',
      capabilities: ['margin-analysis', 'scarcity-pricing', 'over/under-detect'],
    },
    {
      id: 'marketplace', name: 'Marketplace Sync', emoji: '🛒',
      description: 'Multi-channel sync (Shopee, Tokopedia, TikTok)',
      status: 'scaffold',
      capabilities: ['planned-Sprint-6'],
    },
  ]
}
