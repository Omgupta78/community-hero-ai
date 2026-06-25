// Community Hero AI — one-command launcher.
// Ensures deps, build, and the local D1 database are ready, then starts the dev
// server. Safe to run repeatedly: it only does the steps that are missing.
import { spawnSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const npm = isWin ? 'npm.cmd' : 'npm'

function run(args) {
  // On Windows, pass a single command string with shell to avoid the
  // child_process arg-escaping deprecation warning.
  const res = isWin
    ? spawnSync(`${npm} ${args.join(' ')}`, { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync(npm, args, { cwd: root, stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`\n✖ Step failed: npm ${args.join(' ')}`)
    process.exit(res.status || 1)
  }
}

function step(msg) { console.log(`\n\u001b[36m▶ ${msg}\u001b[0m`) }

// 1. Dependencies
if (!existsSync(join(root, 'node_modules'))) {
  step('Installing dependencies (first run)…')
  run(['install'])
} else {
  console.log('✓ Dependencies present')
}

// 2. Secrets reminder
if (!existsSync(join(root, '.dev.vars'))) {
  console.log('\n\u001b[33m⚠ No .dev.vars found — AI will use the heuristic fallback.\u001b[0m')
  console.log('  Copy .dev.vars.example to .dev.vars and add your GEMINI_API_KEY for real Gemini.\n')
}

// 3. Build
step('Building app…')
run(['run', 'build'])

// 4. Local database (migrate + seed) if it doesn't exist yet
if (!existsSync(join(root, '.wrangler', 'state', 'v3', 'd1'))) {
  step('Setting up local D1 database (migrations + seed)…')
  run(['run', 'db:migrate:local'])
  run(['run', 'db:seed'])
} else {
  console.log('✓ Local database already set up (run `npm run db:reset` to wipe & reseed)')
}

// 5. Start the dev server (long-running)
step('Starting Community Hero AI → http://localhost:5173')
console.log('  Press Ctrl+C to stop.\n')
const dev = isWin
  ? spawn(`${npm} run dev`, { cwd: root, stdio: 'inherit', shell: true })
  : spawn(npm, ['run', 'dev'], { cwd: root, stdio: 'inherit' })
dev.on('exit', (code) => process.exit(code ?? 0))
