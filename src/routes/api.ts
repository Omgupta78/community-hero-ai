import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeIssue, generateInsight, generateResolutionPlan, chatReply, predictTrends, computePriority } from '../lib/gemini'
import { runTriageAgent } from '../lib/agent'
import {
  verifyPassword,
  createSession,
  destroySession,
  getSessionUser,
  sessionCookie,
  clearCookie,
  SESSION_COOKIE,
} from '../lib/auth'
import { getFirebaseUser, getOrCreateCitizen } from '../lib/firebase'
import { tierFor } from '../lib/reputation'

type Bindings = {
  DB: D1Database
  GEMINI_API_KEY?: string
  FIREBASE_PROJECT_ID?: string
}

const api = new Hono<{ Bindings: Bindings }>()
api.use('/*', cors())

// Fallback "current citizen" used only when a request arrives without a valid
// Firebase token (e.g. anonymous browsing). Real signed-in citizens are
// resolved from their Firebase ID token.
const DEMO_USER_ID = 1

// Resolves the numeric users.id for the request's citizen.
//  - If a valid Firebase ID token is present, finds/creates that citizen.
//  - Otherwise falls back to the seeded demo citizen (id=1) so the app still
//    works for anonymous visitors.
async function currentCitizenId(c: any): Promise<number> {
  const fb = await getFirebaseUser(c)
  if (fb) {
    const citizen = await getOrCreateCitizen(c.env.DB, fb)
    return citizen.id
  }
  return DEMO_USER_ID
}

// Like above but returns null (not the demo user) when not signed in — for
// endpoints that should require a real Firebase login.
async function requireCitizen(c: any): Promise<number | null> {
  const fb = await getFirebaseUser(c)
  if (!fb) return null
  const citizen = await getOrCreateCitizen(c.env.DB, fb)
  return citizen.id
}

// ---------------------------------------------------------------
// AUTH (staff: admin + authorities)
// ---------------------------------------------------------------
api.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}))
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const user = await c.env.DB.prepare(
    `SELECT id, name, email, role, department, password_hash FROM users WHERE email = ?`
  ).bind(String(email).trim().toLowerCase()).first<any>()

  // Only staff accounts (with a password) can log in here.
  if (!user || !user.password_hash || (user.role !== 'admin' && user.role !== 'authority')) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await createSession(c.env.DB, user.id)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
  })
})

api.post('/auth/logout', async (c) => {
  const cookie = c.req.header('Cookie') || ''
  const m = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (m) await destroySession(c.env.DB, m[1])
  c.header('Set-Cookie', clearCookie())
  return c.json({ ok: true })
})

// Current logged-in staff member (used by admin/authority dashboards).
api.get('/auth/me', async (c) => {
  const user = await getSessionUser(c)
  if (!user) return c.json({ authenticated: false }, 401)
  return c.json({ authenticated: true, user })
})

// Guard middleware factory: requires a logged-in staff member with one of the roles.
const requireRole = (...roles: string[]) =>
  async (c: any, next: any) => {
    const user = await getSessionUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    if (roles.length && !roles.includes(user.role)) return c.json({ error: 'Forbidden' }, 403)
    c.set('staff', user)
    return next()
  }

// List of authorities (for the admin assignment dropdown).
api.get('/authorities', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, email, department FROM users WHERE role = 'authority' ORDER BY department`
  ).all()
  return c.json({ authorities: results || [] })
})

// ---------------------------------------------------------------
// AI ANALYSIS (real Gemini)
// ---------------------------------------------------------------
api.post('/analyze', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { description, category, imageBase64, mimeType } = body
  const result = await analyzeIssue(c.env.GEMINI_API_KEY, {
    description,
    category,
    imageBase64,
    mimeType,
  })
  return c.json(result)
})

// ---------------------------------------------------------------
// ISSUES
// ---------------------------------------------------------------

// List issues with optional filters
api.get('/issues', async (c) => {
  const { status, category, mine, verify, limit, assigned, unassigned } = c.req.query()
  const where: string[] = []
  const binds: any[] = []

  if (status) { where.push('i.status = ?'); binds.push(status) }
  if (category) { where.push('i.category = ?'); binds.push(category) }
  if (mine === 'true') { where.push('i.reporter_id = ?'); binds.push(await currentCitizenId(c)) }
  if (verify === 'true') { where.push("i.status IN ('Reported','Verified')") }

  // `assigned` scoping is only honoured for a logged-in authority and shows
  // ONLY the issues assigned to that authority (or their department).
  if (assigned === 'me') {
    const staff = await getSessionUser(c)
    if (!staff || staff.role !== 'authority') return c.json({ error: 'Unauthorized' }, 401)
    where.push('(i.assigned_to = ? OR (i.assigned_to IS NULL AND i.department = ?))')
    binds.push(staff.id, staff.department)
  }
  if (unassigned === 'true') { where.push('i.assigned_to IS NULL') }

  // Note: video_data (large base64) is intentionally excluded from list results
  // for performance — it is only returned by the single-issue detail endpoint.
  const sql = `SELECT i.id, i.title, i.description, i.category, i.severity, i.status, i.department,
                      i.priority_score, i.address, i.lat, i.lng, i.photo_data, i.media_type,
                      i.ai_summary, i.ai_source, i.anonymous, i.verify_count, i.reporter_id,
                      i.created_at, i.updated_at, i.assigned_to, i.duplicate_of, i.agent_processed,
                      u.name AS reporter_name, a.name AS assignee_name, a.department AS assignee_department
               FROM issues i
               LEFT JOIN users u ON i.reporter_id = u.id
               LEFT JOIN users a ON i.assigned_to = a.id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY i.priority_score DESC, i.created_at DESC
               LIMIT ?`
  binds.push(Number(limit) || 100)

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ issues: results || [] })
})

// Single issue with its timeline
api.get('/issues/:id', async (c) => {
  const id = c.req.param('id')
  const issue = await c.env.DB.prepare(
    `SELECT i.*, u.name AS reporter_name, a.name AS assignee_name, a.department AS assignee_department
     FROM issues i
     LEFT JOIN users u ON i.reporter_id = u.id
     LEFT JOIN users a ON i.assigned_to = a.id
     WHERE i.id = ?`
  ).bind(id).first()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  const { results: updates } = await c.env.DB.prepare(
    `SELECT * FROM issue_updates WHERE issue_id = ? ORDER BY created_at ASC`
  ).bind(id).all()

  // Trust breakdown for community verification.
  const trust = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(on_site),0) AS on_site_count,
            COALESCE(SUM(CASE WHEN vote='confirm' THEN 1 ELSE 0 END),0) AS confirms,
            COALESCE(SUM(CASE WHEN on_site=1 THEN 2 ELSE 1 END),0) AS trust_weight
     FROM verifications WHERE issue_id = ? AND vote='confirm'`
  ).bind(id).first<any>()
  if (issue && trust) {
    ;(issue as any).on_site_count = trust.on_site_count || 0
    ;(issue as any).remote_count = (trust.confirms || 0) - (trust.on_site_count || 0)
    ;(issue as any).trust_weight = trust.trust_weight || 0
  }

  return c.json({ issue, updates: updates || [] })
})

// Create a new issue (runs real AI analysis if not pre-analyzed)
api.post('/issues', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const {
    description = '',
    category,
    address = '',
    lat = null,
    lng = null,
    photo_data = null,
    media_type = 'image',
    video_data = null,
    anonymous = false,
    imageBase64,
    mimeType,
    ai, // optionally pass pre-computed analysis from /analyze
  } = body

  const reporterId = await currentCitizenId(c)

  const analysis = ai && ai.category
    ? ai
    : await analyzeIssue(c.env.GEMINI_API_KEY, { description, category, imageBase64, mimeType })

  const res = await c.env.DB.prepare(
    `INSERT INTO issues
      (title, description, category, severity, status, department, priority_score,
       address, lat, lng, photo_data, media_type, video_data, ai_summary, ai_source, anonymous, reporter_id)
     VALUES (?, ?, ?, ?, 'Reported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    analysis.title,
    description,
    analysis.category,
    analysis.severity,
    analysis.department,
    analysis.priority_score,
    address,
    lat,
    lng,
    photo_data,
    media_type === 'video' ? 'video' : 'image',
    media_type === 'video' ? video_data : null,
    analysis.summary,
    analysis.source,
    anonymous ? 1 : 0,
    reporterId
  ).run()

  const issueId = res.meta.last_row_id

  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Reported', ?, 'System')`
  ).bind(issueId, 'Issue reported and analyzed by AI.').run()

  // Autonomous triage agent processes the new report immediately:
  // de-duplicates, prioritizes, auto-routes to a department, and drafts a plan.
  let agent: { ok: boolean; steps: number; conclusion: string; duplicate_of: number | null } | null = null
  try {
    agent = await runTriageAgent(c.env, issueId as number)
  } catch (e) {
    console.error('Triage agent error:', (e as Error).message)
  }

  // Integrity-gated reward: a genuine new report earns +10; a report the agent
  // flagged as a duplicate earns only +2 (still thanked, but can't farm points).
  const isDuplicate = !!(agent && agent.duplicate_of)
  const pointsAwarded = isDuplicate ? 2 : 10
  await c.env.DB.prepare(`UPDATE users SET score = score + ? WHERE id = ?`).bind(pointsAwarded, reporterId).run()

  return c.json({ id: issueId, ...analysis, agent, points_awarded: pointsAwarded, duplicate_of: agent?.duplicate_of ?? null }, 201)
})

// ---------------------------------------------------------------
// VERIFICATION (community) — proof-of-presence, trust-weighted
// ---------------------------------------------------------------
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const ON_SITE_RADIUS_M = 1000 // within 1km counts as an on-site (trusted) verification
const PROMOTE_WEIGHT = 4 // weighted confirmations needed to auto-promote to "Verified"

api.post('/issues/:id/verify', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const vote = body.vote === 'reject' ? 'reject' : 'confirm'
  const voterId = await currentCitizenId(c)

  const issue = await c.env.DB.prepare(
    `SELECT severity, status, lat, lng, reporter_id FROM issues WHERE id = ?`
  ).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  // Can't verify your own report (removes the obvious self-farming exploit).
  if (issue.reporter_id != null && Number(issue.reporter_id) === Number(voterId)) {
    return c.json({ error: "You can't verify your own report" }, 403)
  }

  // Proof-of-presence: how close was the verifier to the issue?
  const vLat = typeof body.lat === 'number' ? body.lat : null
  const vLng = typeof body.lng === 'number' ? body.lng : null
  let distance: number | null = null
  if (vLat != null && vLng != null && issue.lat != null && issue.lng != null) {
    distance = haversineMeters(issue.lat, issue.lng, vLat, vLng)
  }
  const onSite = distance != null && distance <= ON_SITE_RADIUS_M

  try {
    await c.env.DB.prepare(
      `INSERT INTO verifications (issue_id, user_id, vote, on_site, distance_m) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, voterId, vote, onSite ? 1 : 0, distance).run()
  } catch (e) {
    return c.json({ error: 'Already verified by you' }, 409)
  }

  // Recount confirmations and compute a TRUST WEIGHT (on-site = 2, remote = 1).
  const agg = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS confirms,
       COALESCE(SUM(on_site), 0) AS on_site_count,
       COALESCE(SUM(CASE WHEN on_site = 1 THEN 2 ELSE 1 END), 0) AS weight
     FROM verifications WHERE issue_id = ? AND vote = 'confirm'`
  ).bind(id).first<{ confirms: number; on_site_count: number; weight: number }>()
  const confirms = agg?.confirms || 0
  const onSiteCount = agg?.on_site_count || 0
  const remoteCount = confirms - onSiteCount
  const weight = agg?.weight || 0

  const newPriority = computePriority(issue.severity || 3, weight)

  // Auto-promote to Verified only when TRUST WEIGHT is high enough — so a few
  // random remote clicks can't validate a bogus report.
  let newStatus = issue.status
  if (weight >= PROMOTE_WEIGHT && issue.status === 'Reported') {
    newStatus = 'Verified'
    await c.env.DB.prepare(
      `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Verified', ?, 'System')`
    ).bind(id, `Community-verified (trust weight ${weight}: ${onSiteCount} on-site, ${remoteCount} remote).`).run()
  }

  await c.env.DB.prepare(
    `UPDATE issues SET verify_count = ?, priority_score = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(confirms, newPriority, newStatus, id).run()

  // Reward by trust: on-site verification (real presence) earns more than a
  // remote review. This makes meaningless random clicks nearly worthless.
  const points = onSite ? 5 : 1
  await c.env.DB.prepare(`UPDATE users SET score = score + ? WHERE id = ?`).bind(points, voterId).run()

  return c.json({
    verify_count: confirms,
    on_site_count: onSiteCount,
    remote_count: remoteCount,
    trust_weight: weight,
    on_site: onSite,
    distance_m: distance != null ? Math.round(distance) : null,
    points_awarded: points,
    status: newStatus,
    priority_score: newPriority,
  })
})

// ---------------------------------------------------------------
// STAFF: status updates (admin = any issue, authority = own assigned issues)
// ---------------------------------------------------------------
api.patch('/issues/:id/status', requireRole('admin', 'authority'), async (c) => {
  const staff = c.get('staff')
  const id = Number(c.req.param('id'))
  const { status, department, message } = await c.req.json().catch(() => ({}))
  if (!status) return c.json({ error: 'status required' }, 400)

  const issue = await c.env.DB.prepare(`SELECT assigned_to, department FROM issues WHERE id = ?`)
    .bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  // Authorities may only update issues assigned to them (or to their dept).
  if (staff.role === 'authority') {
    const ownsIt = issue.assigned_to === staff.id || (issue.assigned_to == null && issue.department === staff.department)
    if (!ownsIt) return c.json({ error: 'This issue is not assigned to you' }, 403)
  }

  await c.env.DB.prepare(
    `UPDATE issues SET status = ?, department = COALESCE(?, department), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(status, department || null, id).run()

  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, department, message, author) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, status, department || issue.department || null, message || `Status changed to ${status}.`, staff.name).run()

  return c.json({ ok: true, status })
})

// ---------------------------------------------------------------
// ADMIN: assign an issue to an authority (department)
// ---------------------------------------------------------------
api.patch('/issues/:id/assign', requireRole('admin'), async (c) => {
  const staff = c.get('staff')
  const id = Number(c.req.param('id'))
  const { authority_id, message } = await c.req.json().catch(() => ({}))
  if (!authority_id) return c.json({ error: 'authority_id required' }, 400)

  const authority = await c.env.DB.prepare(
    `SELECT id, name, department FROM users WHERE id = ? AND role = 'authority'`
  ).bind(Number(authority_id)).first<any>()
  if (!authority) return c.json({ error: 'Authority not found' }, 404)

  const issue = await c.env.DB.prepare(`SELECT status FROM issues WHERE id = ?`).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  // Move to "Assigned" unless already further along in the workflow.
  const newStatus = ['In Progress', 'Resolved'].includes(issue.status) ? issue.status : 'Assigned'

  await c.env.DB.prepare(
    `UPDATE issues SET assigned_to = ?, department = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(authority.id, authority.department, newStatus, id).run()

  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, department, message, author) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    newStatus,
    authority.department,
    message || `Assigned to ${authority.name} (${authority.department}).`,
    staff.name
  ).run()

  return c.json({ ok: true, assigned_to: authority.id, department: authority.department, status: newStatus })
})

// AI-generated resolution action plan for a single issue (real-time Gemini).
// Public so citizens see transparency on how their issue will be fixed.
api.get('/issues/:id/plan', async (c) => {
  const id = c.req.param('id')
  const issue = await c.env.DB.prepare(
    `SELECT title, description, category, severity, address, department FROM issues WHERE id = ?`
  ).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  const plan = await generateResolutionPlan(c.env.GEMINI_API_KEY, issue)
  return c.json(plan)
})

// Autonomous triage agent — reasoning + action trace for an issue (public, read-only).
api.get('/issues/:id/agent', async (c) => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    `SELECT step, tool, thought, action, result, created_at FROM agent_actions WHERE issue_id = ? ORDER BY step ASC`
  ).bind(id).all()
  return c.json({ actions: results || [] })
})

// Manually (re-)run the autonomous triage agent on an issue (admin only).
api.post('/issues/:id/agent/run', requireRole('admin'), async (c) => {
  const id = Number(c.req.param('id'))
  const result = await runTriageAgent(c.env, id)
  return c.json(result)
})

// Live feed of the autonomous agent's recent decisions across all issues (admin).
api.get('/agent/activity', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.issue_id, a.tool, a.thought, a.action, a.created_at, i.title, i.category
     FROM agent_actions a JOIN issues i ON i.id = a.issue_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 14`
  ).all()
  const processed = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM issues WHERE agent_processed = 1`
  ).first<{ n: number }>()
  return c.json({ activity: results || [], processed: processed?.n || 0 })
})

// Predictive insights — Gemini forecasts emerging hotspots & rising categories.
api.get('/predict', async (c) => {
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues`).first<{ n: number }>()
  const resolved = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status = 'Resolved'`).first<{ n: number }>()
  const { results: byCategory } = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM issues GROUP BY category ORDER BY n DESC`
  ).all()
  const hotspot = await c.env.DB.prepare(
    `SELECT address, COUNT(*) AS n FROM issues WHERE address != '' GROUP BY address ORDER BY n DESC LIMIT 1`
  ).first<{ address: string }>()
  const { results: recent } = await c.env.DB.prepare(
    `SELECT category, address FROM issues ORDER BY created_at DESC LIMIT 12`
  ).all()

  const prediction = await predictTrends(c.env.GEMINI_API_KEY, {
    byCategory: (byCategory as any[]) || [],
    hotspot: hotspot?.address || 'city-wide',
    total: total?.n || 0,
    resolved: resolved?.n || 0,
    recent: (recent as any[]) || [],
  })
  return c.json(prediction)
})

// ---------------------------------------------------------------
// AI CHATBOT — "Hero Assistant" (real-time Gemini, grounded with live stats)
// ---------------------------------------------------------------
api.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) return c.json({ error: 'messages required' }, 400)

  // Basic sanitation + bound the payload.
  const clean = messages
    .filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 1000),
    }))
  if (!clean.length) return c.json({ error: 'messages required' }, 400)

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues`).first<{ n: number }>()
  const resolved = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status = 'Resolved'`).first<{ n: number }>()
  const ctx = {
    total: total?.n || 0,
    resolved: resolved?.n || 0,
    open: (total?.n || 0) - (resolved?.n || 0),
  }

  const result = await chatReply(c.env.GEMINI_API_KEY, clean, ctx)
  return c.json(result)
})

// ---------------------------------------------------------------
// NOTIFICATIONS — status updates on the citizen's own reports
// ---------------------------------------------------------------
api.get('/notifications', async (c) => {
  const citizenId = await currentCitizenId(c)
  const { results } = await c.env.DB.prepare(
    `SELECT up.id AS update_id, up.issue_id, up.status, up.message, up.author, up.created_at, i.title
     FROM issue_updates up JOIN issues i ON i.id = up.issue_id
     WHERE i.reporter_id = ?
     ORDER BY up.created_at DESC, up.id DESC
     LIMIT 25`
  ).bind(citizenId).all()
  return c.json({ notifications: results || [] })
})

// ---------------------------------------------------------------
// STATS / DASHBOARD
// ---------------------------------------------------------------
api.get('/stats', async (c) => {
  const citizenId = await currentCitizenId(c)
  // One aggregate query for all counts, run in parallel with the breakdowns and
  // the per-citizen lookups (was 9 sequential round-trips → 1 + 1 parallel batch).
  const [agg, catRes, statusRes, mine, user] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN severity >= 5 AND status != 'Resolved' THEN 1 ELSE 0 END) AS critical,
              SUM(CASE WHEN status IN ('Reported','Verified') THEN 1 ELSE 0 END) AS pending
       FROM issues`
    ).first<any>(),
    c.env.DB.prepare(`SELECT category, COUNT(*) AS n FROM issues GROUP BY category ORDER BY n DESC`).all(),
    c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM issues GROUP BY status`).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE reporter_id = ?`).bind(citizenId).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT score FROM users WHERE id = ?`).bind(citizenId).first<{ score: number }>(),
  ])

  return c.json({
    total: agg?.total || 0,
    resolved: agg?.resolved || 0,
    open: agg?.open || 0,
    critical: agg?.critical || 0,
    pending: agg?.pending || 0,
    mine: mine?.n || 0,
    score: user?.score || 0,
    byCategory: catRes.results || [],
    byStatus: statusRes.results || [],
  })
})

// AI-generated weekly insight
api.get('/insight', async (c) => {
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues`).first<{ n: number }>()
  const resolved = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status = 'Resolved'`).first<{ n: number }>()
  const topCat = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM issues GROUP BY category ORDER BY n DESC LIMIT 1`
  ).first<{ category: string }>()
  const hotspot = await c.env.DB.prepare(
    `SELECT address, COUNT(*) AS n FROM issues WHERE address != '' GROUP BY address ORDER BY n DESC LIMIT 1`
  ).first<{ address: string }>()
  const { results: cats } = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM issues GROUP BY category`
  ).all()

  const categories: Record<string, number> = {}
  for (const r of (cats as any[]) || []) categories[r.category] = r.n

  const stats = {
    total: total?.n || 0,
    resolved: resolved?.n || 0,
    topCategory: topCat?.category || 'N/A',
    hotspot: hotspot?.address || 'city-wide',
    categories,
  }

  const insight = await generateInsight(c.env.GEMINI_API_KEY, stats)
  const rate = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0
  return c.json({ ...insight, most: stats.topCategory, hotspot: stats.hotspot, rate })
})

// ---------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------
api.get('/me', async (c) => {
  const fb = await getFirebaseUser(c)
  const authenticated = !!fb
  const citizenId = await currentCitizenId(c)

  const user = await c.env.DB.prepare(`SELECT id, name, email, role, score, photo_url FROM users WHERE id = ?`)
    .bind(citizenId).first<any>()
  const reports = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE reporter_id = ?`)
    .bind(citizenId).first<{ n: number }>()

  // Community rank + reputation tier.
  const rankRow = await c.env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank FROM users WHERE role = 'citizen' AND score > ?`
  ).bind(user?.score || 0).first<{ rank: number }>()
  const tier = tierFor(user?.score || 0)

  return c.json({ ...user, reports: reports?.n || 0, authenticated, tier, rank: rankRow?.rank || null })
})

// ---------------------------------------------------------------
// LEADERBOARD — top community heroes (gamification)
// ---------------------------------------------------------------
api.get('/leaderboard', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.score, u.photo_url,
            (SELECT COUNT(*) FROM issues i WHERE i.reporter_id = u.id) AS reports
     FROM users u
     WHERE u.role = 'citizen'
     ORDER BY u.score DESC, reports DESC
     LIMIT 20`
  ).all()
  const leaders = ((results as any[]) || []).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    score: r.score,
    photo_url: r.photo_url,
    reports: r.reports,
    tier: tierFor(r.score),
  }))
  return c.json({ leaders })
})

export default api
