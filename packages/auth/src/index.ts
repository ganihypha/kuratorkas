// ============================================================
// @sparkmind/auth — JWT issue/verify + Hono middleware
// Uses Web Crypto API (HMAC-SHA256) — Cloudflare Workers compatible
// ============================================================
import type { Context, Next } from 'hono'

const TE = new TextEncoder()
const TD = new TextDecoder()

function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof data === 'string') bytes = TE.encode(data)
  else if (data instanceof Uint8Array) bytes = data
  else bytes = new Uint8Array(data)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, TE.encode(data))
  return b64urlEncode(sig)
}

async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, data)
  // constant-time-ish compare
  if (expected.length !== signature.length) return false
  let r = 0
  for (let i = 0; i < expected.length; i++) r |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return r === 0
}

export interface JwtPayload {
  sub: string         // user id
  email?: string
  tier?: string       // subscription tier
  iat: number         // issued at (sec)
  exp: number         // expires at (sec)
  [k: string]: any
}

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string, expiresInSec = 60 * 60 * 24 * 7): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const full: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec }
  const header = { alg: 'HS256', typ: 'JWT' }
  const h = b64urlEncode(JSON.stringify(header))
  const p = b64urlEncode(JSON.stringify(full))
  const sig = await hmacSign(secret, `${h}.${p}`)
  return `${h}.${p}.${sig}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const ok = await hmacVerify(secret, `${h}.${p}`, s)
    if (!ok) return null
    const payload = JSON.parse(TD.decode(b64urlDecode(p))) as JwtPayload
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// ----- Hono middleware -----
export function authMiddleware(opts: { secret?: string; required?: boolean } = {}) {
  return async (c: Context, next: Next) => {
    const required = opts.required !== false
    const secret = opts.secret || (c.env as any)?.JWT_SECRET || 'dev-secret-CHANGE-ME-in-prod'
    const auth = c.req.header('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (c.req.header('X-Auth-Token') || '')
    if (!token) {
      if (required) return c.json({ error: 'unauthorized', detail: 'missing token' }, 401)
      c.set('user', null)
      return next()
    }
    const payload = await verifyJwt(token, secret)
    if (!payload) {
      if (required) return c.json({ error: 'unauthorized', detail: 'invalid or expired token' }, 401)
      c.set('user', null)
      return next()
    }
    c.set('user', payload)
    return next()
  }
}

// ----- Password hashing (PBKDF2 — works in Workers) -----
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || b64urlEncode(crypto.getRandomValues(new Uint8Array(16)))
  const key = await crypto.subtle.importKey('raw', TE.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: TE.encode(s), iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return { hash: b64urlEncode(bits), salt: s }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt)
  if (computed.length !== hash.length) return false
  let r = 0
  for (let i = 0; i < computed.length; i++) r |= computed.charCodeAt(i) ^ hash.charCodeAt(i)
  return r === 0
}
