// Authentication helpers — Web Crypto (PBKDF2) password hashing + session tokens.
// Runs entirely on the Cloudflare Workers runtime (no Node APIs).

import type { Context } from 'hono'

export const SESSION_COOKIE = 'ch_session'
const PBKDF2_ITERATIONS = 100_000
const SESSION_TTL_HOURS = 12

export type StaffUser = {
  id: number
  name: string
  email: string
  role: string // 'admin' | 'authority'
  department: string | null
  score?: number
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function deriveKey(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return toHex(bits)
}

// Returns "saltHex:hashHex"
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveKey(password, salt)
  return `${toHex(salt.buffer)}:${hash}`
}

export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  const salt = fromHex(saltHex)
  const computed = await deriveKey(password, salt)
  // constant-time-ish comparison
  if (computed.length !== hashHex.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i)
  return diff === 0
}

export function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

// --- Session management (D1-backed) ---

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = newToken()
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString()
  await db
    .prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, userId, expires)
    .run()
  return token
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run()
}

// Reads the session cookie and returns the logged-in staff user (or null).
export async function getSessionUser(c: Context): Promise<StaffUser | null> {
  const cookie = c.req.header('Cookie') || ''
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!match) return null
  const token = match[1]
  const db = c.env.DB as D1Database

  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.score, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .bind(token)
    .first<any>()

  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(db, token)
    return null
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    score: row.score,
  }
}

export function sessionCookie(token: string): string {
  const maxAge = SESSION_TTL_HOURS * 3600
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
