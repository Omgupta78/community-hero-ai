// Node.js server entry for Google Cloud Run (and any Node host).
//
// Reuses the SAME Hono app from ./index (which targets Cloudflare Pages) and:
//   • injects bindings (DB adapter + env vars) so `c.env.*` works,
//   • serves the /static assets that Cloudflare Pages would serve automatically,
//   • initializes + seeds a local SQLite database on first run.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import app from './index'
import { SqliteD1 } from './db/sqlite'

const ROOT = process.cwd()
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'community-hero.db')

// Ensure the data dir exists for file-backed DBs (skip for :memory:).
if (DB_PATH !== ':memory:') {
  const dir = join(DB_PATH, '..')
  if (!existsSync(dir)) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
  }
}

const d1 = new SqliteD1(DB_PATH)

// First-run: apply migrations + seed if the schema isn't there yet.
function initialized(): boolean {
  const row = d1.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get()
  return !!row
}

if (!initialized()) {
  const migDir = join(ROOT, 'migrations')
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    d1.exec(readFileSync(join(migDir, f), 'utf8'))
  }
  const seed = join(ROOT, 'seed.sql')
  if (existsSync(seed)) d1.exec(readFileSync(seed, 'utf8'))
  console.log(`✓ Database initialized (${files.length} migrations + seed) at ${DB_PATH}`)
} else {
  console.log(`✓ Using existing database at ${DB_PATH}`)
}

// Bindings the Workers app expects on `c.env`.
const bindings = {
  DB: d1,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_DAILY_CAP: process.env.GEMINI_DAILY_CAP,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
}

// Wrapper: serve static files, then delegate everything else to the app with
// the bindings injected as the Workers `env`.
const root = new Hono()
root.use('/static/*', serveStatic({ root: './public' }))
root.all('*', (c) => app.fetch(c.req.raw, bindings as any))

const port = Number(process.env.PORT) || 8080
// Cloud Run requires binding to 0.0.0.0 (all interfaces), not localhost.
serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`🚀 Community Hero AI listening on 0.0.0.0:${info.port}`)
  if (!process.env.GEMINI_API_KEY) console.log('⚠ GEMINI_API_KEY not set — AI uses heuristic fallback.')
})
