// Pre-demo AI health check. Run:  npm run check:ai
// Reads GEMINI_API_KEY from the environment or .dev.vars, then probes the model
// fallback chain and prints a clear OK/FAIL so you never discover at demo time
// that the app silently dropped to its heuristic fallback.
import { readFileSync } from 'node:fs'

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  try {
    const vars = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    const m = vars.match(/GEMINI_API_KEY\s*=\s*(.+)/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
  return ''
}

const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']
const key = loadKey()

if (!key) {
  console.error('\n❌ AI CHECK FAILED — GEMINI_API_KEY not found (env or .dev.vars).')
  console.error('   Add it to .dev.vars:  GEMINI_API_KEY=your_key_here\n')
  process.exit(1)
}
console.log(`\n🔑 Key loaded (prefix ${key.slice(0, 5)}…, length ${key.length}). Probing models…`)

let working = null
for (const model of MODELS) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
      }
    )
    if (res.ok) { console.log(`   ✅ ${model} — HTTP 200 OK`); if (!working) working = model }
    else {
      let why = ''
      try { const j = await res.json(); why = j?.error?.status || '' } catch {}
      console.log(`   ⚠️  ${model} — HTTP ${res.status} ${why}`)
    }
  } catch (e) {
    console.log(`   ⚠️  ${model} — network error: ${e.message}`)
  }
}

if (working) {
  console.log(`\n✅ AI IS LIVE — serving real Gemini via "${working}".\n`)
  process.exit(0)
} else {
  console.error('\n❌ AI CHECK FAILED — no model responded. The app will run on its heuristic fallback.')
  console.error('   Check the key is valid and the project has quota.\n')
  process.exit(1)
}
