// Vercel serverless adapter for Community Hero AI.
//
// Reuses the same Hono app from ./index (which targets Cloudflare Pages/Workers)
// and injects the required bindings (DB + env vars) so `c.env.*` works on Vercel.
//
// Database: node:sqlite backed by /tmp/community-hero.db
//   • /tmp is writable on Vercel serverless functions
//   • Data is ephemeral per container instance (resets on cold starts)
//   • For persistent production data, set DB_PATH to a mounted volume or
//     swap SqliteD1 for a Turso/libSQL remote client.
import { Hono } from 'hono'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import app from './index'
import { SqliteD1 } from './db/sqlite'

// Resolve DB path — honour explicit override, default to /tmp for Vercel.
const DB_PATH = process.env.DB_PATH ?? '/tmp/community-hero.db'

// Ensure parent directory exists (relevant when DB_PATH points outside /tmp).
const dbDir = join(DB_PATH, '..')
if (dbDir !== '/tmp' && !existsSync(dbDir)) {
  try {
    mkdirSync(dbDir, { recursive: true })
  } catch {
    // ignore — read-only filesystem; /tmp fallback not needed here
  }
}

const d1 = new SqliteD1(DB_PATH)

function isInitialized(): boolean {
  const row = d1.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get()
  return !!row
}

// On cold start: run migrations + seed if the schema isn't there yet.
if (!isInitialized()) {
  const root = process.cwd()
  const migDir = join(root, 'migrations')
  if (existsSync(migDir)) {
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const f of files) {
      d1.exec(readFileSync(join(migDir, f), 'utf8'))
    }
  }
  const seedFile = join(root, 'seed.sql')
  if (existsSync(seedFile)) d1.exec(readFileSync(seedFile, 'utf8'))
  console.log(`✓ DB initialized at ${DB_PATH}`)
} else {
  console.log(`✓ DB ready at ${DB_PATH}`)
}

const bindings = {
  DB: d1,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_DAILY_CAP: process.env.GEMINI_DAILY_CAP,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
}

// Thin wrapper Hono app that injects bindings and delegates to the main app.
const vercelApp = new Hono()
vercelApp.all('*', (c) => app.fetch(c.req.raw, bindings as any))

export { vercelApp }
