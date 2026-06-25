// Server-side Firebase ID token verification for Cloudflare Workers.
//
// The Node `firebase-admin` SDK doesn't run on the Workers runtime, so we
// verify the Firebase ID token (a Google-signed RS256 JWT) by hand using the
// Web Crypto API:
//   1. Fetch Google's public signing certs (cached per-isolate by `kid`).
//   2. Verify the RS256 signature.
//   3. Validate the standard claims (iss / aud / exp / iat / sub).
//
// This is the same verification firebase-admin performs, just portable to edge.

import type { Context } from 'hono'

// Your Firebase project id — must match the `aud`/`iss` of incoming tokens.
export const FIREBASE_PROJECT_ID = 'community-hero-64e49'

export type FirebaseUser = {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
  email_verified: boolean
}

// --- base64url helpers ---
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s))
}

// --- Google public-cert cache (per isolate) ---
type CertCache = { keys: Record<string, CryptoKey>; expires: number }
let certCache: CertCache | null = null

// Firebase publishes JWK-format keys; using JWKs avoids X.509 cert parsing
// (which the Workers WebCrypto can't do natively).
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

async function getKeys(): Promise<Record<string, CryptoKey>> {
  const now = Date.now()
  if (certCache && certCache.expires > now) return certCache.keys

  const res = await fetch(GOOGLE_JWKS_URL)
  if (!res.ok) throw new Error('Failed to fetch Google JWKs')
  const data = (await res.json()) as { keys: any[] }

  const keys: Record<string, CryptoKey> = {}
  for (const jwk of data.keys || []) {
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
      keys[jwk.kid] = key
    } catch (e) { /* skip bad key */ }
  }

  // Respect Cache-Control max-age if present, else cache 1h.
  let ttl = 3600
  const cc = res.headers.get('Cache-Control') || ''
  const m = cc.match(/max-age=(\d+)/)
  if (m) ttl = Math.max(60, parseInt(m[1], 10))
  certCache = { keys, expires: now + ttl * 1000 }
  return keys
}

// Verifies a Firebase ID token. Returns the user or null when invalid.
export async function verifyFirebaseToken(token: string): Promise<FirebaseUser | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts

    const header = JSON.parse(b64urlToString(headerB64))
    const payload = JSON.parse(b64urlToString(payloadB64))

    if (header.alg !== 'RS256' || !header.kid) return null

    // Claim checks
    const now = Math.floor(Date.now() / 1000)
    const skew = 60 // allow small clock skew
    if (payload.aud !== FIREBASE_PROJECT_ID) return null
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null
    if (typeof payload.exp !== 'number' || payload.exp < now - skew) return null
    if (typeof payload.iat !== 'number' || payload.iat > now + skew) return null
    if (!payload.sub) return null

    // Signature check
    const keys = await getKeys()
    const key = keys[header.kid]
    if (!key) return null

    const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const sig = b64urlToBytes(sigB64)
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed)
    if (!valid) return null

    return {
      uid: payload.sub,
      email: payload.email || null,
      name: payload.name || (payload.email ? String(payload.email).split('@')[0] : null),
      picture: payload.picture || null,
      email_verified: !!payload.email_verified,
    }
  } catch (e) {
    return null
  }
}

// Reads the Bearer token from the request and verifies it.
export async function getFirebaseUser(c: Context): Promise<FirebaseUser | null> {
  const auth = c.req.header('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  return verifyFirebaseToken(m[1])
}

// Finds (or creates) the citizen `users` row linked to this Firebase account,
// and returns its numeric id. Keeps name/email/photo in sync on each call.
export async function getOrCreateCitizen(
  db: D1Database,
  fb: FirebaseUser
): Promise<{ id: number; name: string; email: string | null; score: number; photo_url: string | null }> {
  // 1. Match by firebase_uid
  let row = await db
    .prepare(`SELECT id, name, email, score, photo_url FROM users WHERE firebase_uid = ?`)
    .bind(fb.uid)
    .first<any>()

  if (row) {
    // keep profile fresh
    await db
      .prepare(`UPDATE users SET name = ?, photo_url = ? WHERE id = ?`)
      .bind(fb.name || row.name, fb.picture || row.photo_url, row.id)
      .run()
    return { id: row.id, name: fb.name || row.name, email: row.email, score: row.score, photo_url: fb.picture || row.photo_url }
  }

  // 2. Link an existing email-matched row (e.g. seeded) if present.
  if (fb.email) {
    const byEmail = await db
      .prepare(`SELECT id, name, email, score, photo_url FROM users WHERE email = ?`)
      .bind(fb.email.toLowerCase())
      .first<any>()
    if (byEmail) {
      await db
        .prepare(`UPDATE users SET firebase_uid = ?, photo_url = COALESCE(?, photo_url) WHERE id = ?`)
        .bind(fb.uid, fb.picture, byEmail.id)
        .run()
      return { id: byEmail.id, name: byEmail.name, email: byEmail.email, score: byEmail.score, photo_url: fb.picture || byEmail.photo_url }
    }
  }

  // 3. Create a fresh citizen.
  const name = fb.name || (fb.email ? fb.email.split('@')[0] : 'Community Citizen')
  const res = await db
    .prepare(
      `INSERT INTO users (name, email, role, score, firebase_uid, photo_url)
       VALUES (?, ?, 'citizen', 0, ?, ?)`
    )
    .bind(name, fb.email ? fb.email.toLowerCase() : `${fb.uid}@firebase.local`, fb.uid, fb.picture)
    .run()

  return { id: res.meta.last_row_id as number, name, email: fb.email, score: 0, photo_url: fb.picture }
}
