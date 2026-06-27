import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeIssue, generateInsight, generateResolutionPlan, chatReply, predictTrends, generateCityHealthInsight, verifyFix, computePriority, recommendContractorReason, quotationReason, generateWeeklyReport } from '../lib/gemini'
import { runTriageAgent } from '../lib/agent'
import { rankContractors, scoreQuotations, parseSkills, type ContractorRow, type Quote } from '../lib/assignment'
import { aiCache, budgetedKey } from '../lib/cache'
import {
  verifyPassword,
  hashPassword,
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
  GEMINI_DAILY_CAP?: string
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
  const { email, password, as } = await c.req.json().catch(() => ({}))
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const user = await c.env.DB.prepare(
    `SELECT id, name, email, role, department, password_hash FROM users WHERE email = ?`
  ).bind(String(email).trim().toLowerCase()).first<any>()

  // Only staff accounts (with a password) can log in here.
  if (!user || !user.password_hash || !['admin', 'authority', 'contractor'].includes(user.role)) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) return c.json({ error: 'Invalid credentials' }, 401)

  // Enforce the portal the user chose on the landing page. This stops a
  // municipal account from logging in via the Contractor card (and vice versa).
  const portalRoles: Record<string, string[]> = { contractor: ['contractor'], municipal: ['admin', 'authority'] }
  const allowed = portalRoles[String(as || '')]
  if (allowed && !allowed.includes(user.role)) {
    const wanted = as === 'contractor' ? 'Contractor / Responder' : 'Municipal'
    const actual = user.role === 'contractor' ? 'Contractor / Responder' : 'Municipal'
    return c.json({ error: `This is a ${actual} account, but you're on the ${wanted} sign-in. Go back and choose "${actual}".` }, 403)
  }

  const token = await createSession(c.env.DB, user.id)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department },
  })
})

// Open contractor/responder self-registration — anyone can connect as a responder.
api.post('/auth/register-contractor', async (c) => {
  const { name, email, password } = await c.req.json().catch(() => ({}))
  if (!name || !email || !password) return c.json({ error: 'Name, email and password are required' }, 400)
  if (String(password).length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)
  const em = String(email).trim().toLowerCase()

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(em).first<any>()
  if (existing) return c.json({ error: 'An account with this email already exists' }, 409)

  const hash = await hashPassword(password)
  const res = await c.env.DB.prepare(
    `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'contractor', ?)`
  ).bind(String(name).trim(), em, hash).run()
  const userId = res.meta.last_row_id as number

  const token = await createSession(c.env.DB, userId)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ user: { id: userId, name: String(name).trim(), email: em, role: 'contractor' } })
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
  const result = await analyzeIssue(await budgetedKey(c.env), {
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
                      i.ai_summary, i.ai_source, i.authenticity, i.anonymous, i.verify_count, i.reporter_id,
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
    : await analyzeIssue(await budgetedKey(c.env), { description, category, imageBase64, mimeType })

  const res = await c.env.DB.prepare(
    `INSERT INTO issues
      (title, description, category, severity, status, department, priority_score,
       address, lat, lng, photo_data, media_type, video_data, ai_summary, ai_source,
       authenticity, authenticity_reason, anonymous, reporter_id)
     VALUES (?, ?, ?, ?, 'Reported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    analysis.authenticity || 'genuine',
    analysis.authenticity_reason || null,
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

// ---------------------------------------------------------------
// CONTRACTOR / RESPONDER LOOP — claim a job, prove the fix, get paid
// ---------------------------------------------------------------
function dataUrlToBase64(s?: string | null): string | undefined {
  if (!s) return undefined
  const i = s.indexOf(',')
  return i >= 0 ? s.slice(i + 1) : s
}

// Jobs board: open jobs available to claim + the contractor's own jobs.
api.get('/jobs', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const available = await c.env.DB.prepare(
    `SELECT id, title, category, severity, status, department, address, lat, lng, priority_score, bounty, photo_data, media_type
     FROM issues
     WHERE status != 'Resolved' AND contractor_id IS NULL AND duplicate_of IS NULL
     ORDER BY bounty DESC, priority_score DESC
     LIMIT 50`
  ).all()
  const mine = await c.env.DB.prepare(
    `SELECT id, title, category, severity, status, department, address, priority_score, bounty, fix_verified, photo_data, after_photo, media_type
     FROM issues WHERE contractor_id = ? ORDER BY updated_at DESC LIMIT 50`
  ).bind(me.id).all()
  const earn = await c.env.DB.prepare(`SELECT earnings FROM users WHERE id = ?`).bind(me.id).first<{ earnings: number }>()
  return c.json({ available: available.results || [], mine: mine.results || [], earnings: earn?.earnings || 0 })
})

// Claim an open job.
api.post('/issues/:id/claim', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const id = Number(c.req.param('id'))
  const issue = await c.env.DB.prepare(`SELECT contractor_id, status FROM issues WHERE id = ?`).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)
  if (issue.contractor_id) return c.json({ error: 'Job already claimed' }, 409)

  const newStatus = issue.status === 'Resolved' ? 'Resolved' : 'In Progress'
  await c.env.DB.prepare(
    `UPDATE issues SET contractor_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(me.id, newStatus, id).run()
  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, ?, ?, ?)`
  ).bind(id, newStatus, `Job claimed by responder ${me.name}. Work in progress.`, me.name).run()
  return c.json({ ok: true, status: newStatus })
})

// Submit proof-of-fix → Gemini before/after verification → pay bounty if verified.
api.post('/issues/:id/proof', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const { after_photo, afterImageBase64, mimeType } = body

  const issue = await c.env.DB.prepare(
    `SELECT title, category, description, photo_data, contractor_id, bounty, status, fix_verified, department FROM issues WHERE id = ?`
  ).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)
  if (Number(issue.contractor_id) !== Number(me.id)) return c.json({ error: 'This job is not assigned to you' }, 403)
  if (issue.fix_verified || issue.status === 'Resolved') {
    return c.json({ error: 'This job is already completed and paid' }, 409)
  }

  const beforeB64 = dataUrlToBase64(issue.photo_data)
  const afterB64 = afterImageBase64 || dataUrlToBase64(after_photo)

  const verdict = await verifyFix(
    await budgetedKey(c.env),
    { title: issue.title, category: issue.category, description: issue.description },
    beforeB64,
    afterB64,
    mimeType
  )

  let paid = 0
  let via = 'bounty'
  if (verdict.resolved) {
    // Escrow-aware payout: if the Municipality assigned this job with a locked
    // escrow, release the escrow; otherwise fall back to the open-board bounty.
    const job = await c.env.DB.prepare(
      `SELECT id, escrow_amount FROM job_assignments WHERE issue_id = ? AND escrow_status = 'locked'`
    ).bind(id).first<any>()

    if (job) {
      via = 'escrow'
      paid = job.escrow_amount || 0
      await c.env.DB.prepare(
        `UPDATE job_assignments SET escrow_status = 'released', state = 'Resolved', citizen_confirmed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(job.id).run()
      await c.env.DB.prepare(
        `UPDATE contractors SET active_tasks = MAX(0, active_tasks - 1), jobs_completed = jobs_completed + 1 WHERE user_id = ?`
      ).bind(me.id).run()
      if (issue.department) {
        await c.env.DB.prepare(
          `UPDATE budgets SET spent = spent + ?, committed = MAX(0, committed - ?) WHERE department = ?`
        ).bind(paid, paid, issue.department).run()
      }
    } else {
      paid = issue.bounty || 0
    }

    await c.env.DB.prepare(
      `UPDATE issues SET after_photo = ?, fix_verified = 1, fix_reason = ?, status = 'Resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(after_photo || null, verdict.reason, id).run()
    await c.env.DB.prepare(`UPDATE users SET earnings = earnings + ? WHERE id = ?`).bind(paid, me.id).run()
    await c.env.DB.prepare(
      `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Resolved', ?, ?)`
    ).bind(id, `Fix AI-verified (${verdict.confidence}% confidence) — ${via === 'escrow' ? 'escrow' : 'bounty'} \u20B9${paid} released to ${me.name}. ${verdict.reason}`, me.name).run()
  } else {
    await c.env.DB.prepare(
      `UPDATE issues SET after_photo = ?, fix_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(after_photo || null, verdict.reason, id).run()
    await c.env.DB.prepare(
      `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'In Progress', ?, ?)`
    ).bind(id, `Proof submitted but AI could not confirm the fix (${verdict.confidence}%). ${verdict.reason}`, me.name).run()
  }

  return c.json({ ...verdict, paid, via, status: verdict.resolved ? 'Resolved' : 'In Progress' })
})

// AI-generated resolution action plan for a single issue (real-time Gemini).
// Public so citizens see transparency on how their issue will be fixed.
api.get('/issues/:id/plan', async (c) => {
  const id = c.req.param('id')
  const issue = await c.env.DB.prepare(
    `SELECT title, description, category, severity, address, department FROM issues WHERE id = ?`
  ).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  const plan = await aiCache(c.env.DB, `plan:${id}`, 86400, async () =>
    generateResolutionPlan(await budgetedKey(c.env), issue)
  )
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

// Command the agent to clear the backlog — runs triage on all unprocessed issues.
api.post('/agent/run-backlog', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM issues WHERE agent_processed = 0 AND status != 'Resolved' ORDER BY created_at ASC LIMIT 12`
  ).all()
  let processed = 0
  for (const r of (results as any[]) || []) {
    try { await runTriageAgent(c.env, r.id); processed++ } catch (e) { /* continue */ }
  }
  return c.json({ processed })
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

  const prediction = await aiCache(c.env.DB, `predict:${total?.n || 0}:${resolved?.n || 0}`, 1800, async () =>
    predictTrends(await budgetedKey(c.env), {
      byCategory: (byCategory as any[]) || [],
      hotspot: hotspot?.address || 'city-wide',
      total: total?.n || 0,
      resolved: resolved?.n || 0,
      recent: (recent as any[]) || [],
    })
  )
  return c.json(prediction)
})

// AI City Health Score — composite civic health with per-system breakdown + Gemini insight.
api.get('/city-health', async (c) => {
  // Map issue categories to civic systems.
  const SYSTEMS: Record<string, string> = {
    Pothole: 'Road Infrastructure',
    'Illegal Dumping': 'Waste Management',
    Streetlight: 'Street Lighting',
    'Water Leak': 'Water Supply',
    Graffiti: 'Public Spaces',
    Other: 'General Services',
  }
  // Penalty per open (unresolved) issue, weighted by severity. Resolved issues don't penalise.
  const { results } = await c.env.DB.prepare(
    `SELECT category,
            SUM(CASE WHEN status != 'Resolved' THEN severity * 4 ELSE 0 END) AS penalty,
            SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) AS open_count,
            COUNT(*) AS total
     FROM issues GROUP BY category`
  ).all()

  const byCat: Record<string, { penalty: number; open: number }> = {}
  for (const r of (results as any[]) || []) byCat[r.category] = { penalty: r.penalty || 0, open: r.open_count || 0 }

  const systems = Object.keys(SYSTEMS)
    .filter((cat) => cat !== 'Other')
    .map((cat) => {
      const p = byCat[cat]?.penalty || 0
      return { name: SYSTEMS[cat], category: cat, health: Math.max(0, Math.min(100, 100 - p)), open: byCat[cat]?.open || 0 }
    })

  const score = Math.round(systems.reduce((a, s) => a + s.health, 0) / systems.length)
  const worst = systems.slice().sort((a, b) => a.health - b.health)[0]

  const topCatRow = await c.env.DB.prepare(
    `SELECT category FROM issues WHERE status != 'Resolved' GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1`
  ).first<{ category: string }>()
  const hotspot = await c.env.DB.prepare(
    `SELECT address FROM issues WHERE status != 'Resolved' AND address != '' GROUP BY address ORDER BY COUNT(*) DESC LIMIT 1`
  ).first<{ address: string }>()

  const insight = await aiCache(c.env.DB, `cityhealth:${score}:${worst?.name || ''}`, 1800, async () =>
    generateCityHealthInsight(await budgetedKey(c.env), {
      score,
      systems: systems.map((s) => ({ name: s.name, health: s.health })),
      worst: worst?.name || 'General Services',
      hotspot: hotspot?.address || 'city-wide',
      topCategory: topCatRow?.category || 'N/A',
    })
  )

  return c.json({ score, systems, worst: worst?.name || null, insight: insight.text, insight_source: insight.source })
})

// Environmental & civic impact metrics derived from resolved issues.
api.get('/impact-metrics', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM issues WHERE status = 'Resolved' GROUP BY category`
  ).all()
  const byCat: Record<string, number> = {}
  for (const r of (results as any[]) || []) byCat[r.category] = r.n

  const potholes = byCat['Pothole'] || 0
  const leaks = byCat['Water Leak'] || 0
  const lights = byCat['Streetlight'] || 0
  const waste = byCat['Illegal Dumping'] || 0
  const graffiti = byCat['Graffiti'] || 0
  const totalResolved = Object.values(byCat).reduce((a, b) => a + b, 0)

  return c.json({
    totalResolved,
    potholesFilled: potholes,
    leaksFixed: leaks,
    waterSavedLitres: leaks * 5000,      // ~5,000 L saved per leak fixed
    lightsRestored: lights,
    wasteSitesCleared: waste,
    wasteTonnes: Math.round(waste * 0.5 * 10) / 10,
    graffitiRemoved: graffiti,
    co2SavedKg: totalResolved * 15,       // faster maintenance avoids ~15 kg CO2 each
  })
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

  const result = await chatReply(await budgetedKey(c.env), clean, ctx)
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

  const insight = await aiCache(c.env.DB, `insight:${stats.total}:${stats.resolved}`, 1800, async () =>
    generateInsight(await budgetedKey(c.env), stats)
  )
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

// ===============================================================
// MUNICIPAL AI COMMAND CENTER — contractors, RADAR, quotations,
// escrow assignment, budgets, analytics, weather, activity.
// All admin-gated unless noted. Citizen confirm uses Firebase.
// ===============================================================

async function loadContractorRows(env: Bindings): Promise<ContractorRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.user_id, u.name, c.company, c.rating, c.active_tasks, c.jobs_completed,
            c.availability, c.skills, c.lat, c.lng, c.photo_url
     FROM contractors c JOIN users u ON u.id = c.user_id`
  ).all()
  return ((results as any[]) || []).map((r) => ({
    user_id: r.user_id,
    name: r.name,
    company: r.company,
    rating: r.rating,
    active_tasks: r.active_tasks,
    jobs_completed: r.jobs_completed,
    availability: r.availability,
    skills: parseSkills(r.skills),
    lat: r.lat,
    lng: r.lng,
    photo_url: r.photo_url,
  }))
}

// Contractor directory (optionally filter by skill / availability).
api.get('/contractors', requireRole('admin'), async (c) => {
  const { skill, availability } = c.req.query()
  let rows = await loadContractorRows(c.env)
  if (skill) rows = rows.filter((r) => r.skills.map((s) => s.toLowerCase()).includes(skill.toLowerCase()))
  if (availability) rows = rows.filter((r) => r.availability === availability)
  return c.json({ contractors: rows })
})

// RADAR: nearby contractors for a location, ranked. Adds a Gemini reason on the top pick.
api.get('/contractors/nearby', requireRole('admin'), async (c) => {
  const lat = Number(c.req.query('lat'))
  const lng = Number(c.req.query('lng'))
  const skill = c.req.query('skill') || ''
  const radiusKm = Number(c.req.query('radius_km')) || 25
  const rows = await loadContractorRows(c.env)
  let ranked = rankContractors({ category: skill, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng }, rows)
  ranked = ranked.filter((r) => r.distance_km == null || r.distance_km <= radiusKm)

  let ai_source: string | undefined
  if (ranked.length) {
    const top = ranked[0]
    const rec = await aiCache(c.env.DB, `crec:${skill}:${top.user_id}:${top.match_score}`, 1800, async () =>
      recommendContractorReason(
        await budgetedKey(c.env),
        { category: skill },
        { name: top.name, rating: top.rating, distance_km: top.distance_km, match_score: top.match_score, skills: top.skills }
      )
    )
    ;(ranked[0] as any).ai_recommendation = rec.reason
    ai_source = rec.source
  }
  return c.json({
    origin: { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng },
    contractors: ranked,
    ai_source,
  })
})

// Quotations for an issue, with AI value scores + best pick.
api.get('/issues/:id/quotations', requireRole('admin'), async (c) => {
  const id = Number(c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.contractor_id, u.name, q.est_cost, q.est_days, q.past_rating, q.status
     FROM quotations q JOIN users u ON u.id = q.contractor_id
     WHERE q.issue_id = ? ORDER BY q.est_cost ASC`
  ).bind(id).all()
  const raw = (results as any[]) || []
  if (!raw.length) return c.json({ issue_id: id, quotes: [], best_quotation_id: null, ai_source: null })

  const quotes: Quote[] = raw.map((r) => ({
    contractor_id: r.contractor_id,
    name: r.name,
    est_cost: r.est_cost,
    est_days: r.est_days,
    past_rating: r.past_rating,
  }))
  const { scored } = scoreQuotations(quotes)
  const best = scored.find((s) => s.recommended)!
  const reason = await aiCache(c.env.DB, `qreason:${id}:${best.contractor_id}:${best.est_cost}`, 1800, async () =>
    quotationReason(await budgetedKey(c.env), best)
  )

  // Stitch quotation_id + status back in.
  const byContractor = new Map(raw.map((r) => [r.contractor_id, r]))
  const quotesOut = scored.map((s) => {
    const r = byContractor.get(s.contractor_id)
    return {
      quotation_id: r?.id,
      contractor_id: s.contractor_id,
      name: s.name,
      est_cost: s.est_cost,
      est_days: s.est_days,
      past_rating: s.past_rating,
      ai_value_score: s.ai_value_score,
      recommended: s.recommended,
      status: r?.status,
      ai_reason: s.recommended ? reason.reason : undefined,
    }
  })
  const bestRow = byContractor.get(best.contractor_id)
  return c.json({ issue_id: id, quotes: quotesOut, best_quotation_id: bestRow?.id || null, ai_source: reason.source })
})

// Request quotes from a set of contractors (seeds simulated quote stubs for the demo).
api.post('/issues/:id/quotations/request', requireRole('admin'), async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const ids: number[] = Array.isArray(body.contractor_ids) ? body.contractor_ids.map(Number) : []
  if (!ids.length) return c.json({ error: 'contractor_ids required' }, 400)

  const issue = await c.env.DB.prepare(`SELECT id, severity FROM issues WHERE id = ?`).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  let created = 0
  for (const cid of ids) {
    const prof = await c.env.DB.prepare(`SELECT rating FROM contractors WHERE user_id = ?`).bind(cid).first<any>()
    // Simulated quote: base cost scales with severity, jittered per contractor.
    const base = (issue.severity || 3) * 4000
    const est_cost = Math.round(base * (0.8 + ((cid % 5) * 0.12)))
    const est_days = Math.round((1 + (cid % 4) * 0.8) * 10) / 10
    try {
      await c.env.DB.prepare(
        `INSERT INTO quotations (issue_id, contractor_id, est_cost, est_days, past_rating, status) VALUES (?, ?, ?, ?, ?, 'submitted')`
      ).bind(id, cid, est_cost, est_days, prof?.rating || 4.0).run()
      created++
    } catch (e) {
      // UNIQUE(issue_id, contractor_id) — already requested; ignore.
    }
  }
  return c.json({ ok: true, requested: ids.length, created })
})

// A contractor submits their own quote.
api.post('/issues/:id/quotations', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const est_cost = Number(body.est_cost)
  const est_days = Number(body.est_days)
  if (!(est_cost > 0) || !(est_days > 0)) return c.json({ error: 'est_cost and est_days must be positive' }, 400)
  const prof = await c.env.DB.prepare(`SELECT rating FROM contractors WHERE user_id = ?`).bind(me.id).first<any>()
  try {
    await c.env.DB.prepare(
      `INSERT INTO quotations (issue_id, contractor_id, est_cost, est_days, past_rating, status)
       VALUES (?, ?, ?, ?, ?, 'submitted')
       ON CONFLICT(issue_id, contractor_id) DO UPDATE SET est_cost=excluded.est_cost, est_days=excluded.est_days`
    ).bind(id, me.id, est_cost, est_days, prof?.rating || 4.0).run()
  } catch (e) {
    return c.json({ error: 'Could not submit quote' }, 500)
  }
  return c.json({ ok: true })
})

// Commissioner assigns a contractor + locks escrow (the core integration step).
api.post('/issues/:id/assign-job', requireRole('admin'), async (c) => {
  const staff = c.get('staff')
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const contractorId = Number(body.contractor_id)
  const quotationId = Number(body.quotation_id)
  if (!contractorId || !quotationId) return c.json({ error: 'contractor_id and quotation_id required' }, 400)

  const issue = await c.env.DB.prepare(`SELECT id, department, status FROM issues WHERE id = ?`).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)

  const quote = await c.env.DB.prepare(
    `SELECT id, est_cost FROM quotations WHERE id = ? AND issue_id = ? AND contractor_id = ?`
  ).bind(quotationId, id, contractorId).first<any>()
  if (!quote) return c.json({ error: 'Quotation does not match this issue/contractor' }, 400)

  const existing = await c.env.DB.prepare(
    `SELECT id FROM job_assignments WHERE issue_id = ? AND state != 'Cancelled'`
  ).bind(id).first<any>()
  if (existing) return c.json({ error: 'Issue already has an active assignment' }, 409)

  const escrow = quote.est_cost
  const contractor = await c.env.DB.prepare(`SELECT name FROM users WHERE id = ?`).bind(contractorId).first<any>()

  const job = await c.env.DB.prepare(
    `INSERT INTO job_assignments (issue_id, contractor_id, quotation_id, assigned_by, escrow_amount, escrow_status, state)
     VALUES (?, ?, ?, ?, ?, 'locked', 'JobAssigned')`
  ).bind(id, contractorId, quotationId, staff.id, escrow).run()

  await c.env.DB.prepare(`UPDATE quotations SET status = 'accepted' WHERE id = ?`).bind(quotationId).run()
  await c.env.DB.prepare(`UPDATE quotations SET status = 'rejected' WHERE issue_id = ? AND id != ?`).bind(id, quotationId).run()
  await c.env.DB.prepare(
    `UPDATE issues SET contractor_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(contractorId, id).run()
  await c.env.DB.prepare(`UPDATE contractors SET active_tasks = active_tasks + 1 WHERE user_id = ?`).bind(contractorId).run()
  if (issue.department) {
    await c.env.DB.prepare(`UPDATE budgets SET committed = committed + ? WHERE department = ?`).bind(escrow, issue.department).run()
  }
  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, department, message, author) VALUES (?, 'Assigned', ?, ?, ?)`
  ).bind(id, issue.department || null, `Job assigned to ${contractor?.name || 'contractor'}; escrow ₹${escrow.toLocaleString('en-IN')} locked.`, staff.name).run()

  return c.json({
    ok: true,
    job_id: job.meta.last_row_id,
    issue_id: id,
    contractor_id: contractorId,
    escrow_amount: escrow,
    escrow_status: 'locked',
    state: 'JobAssigned',
    issue_status: 'Assigned',
  })
})

// Citizen confirmation closes the loop: release escrow exactly once.
api.post('/issues/:id/confirm', async (c) => {
  const citizenId = await requireCitizen(c)
  const id = Number(c.req.param('id'))
  const job = await c.env.DB.prepare(
    `SELECT id, contractor_id, escrow_amount FROM job_assignments WHERE issue_id = ? AND escrow_status = 'locked'`
  ).bind(id).first<any>()
  if (!job) return c.json({ error: 'No locked escrow for this issue' }, 409)

  const issue = await c.env.DB.prepare(`SELECT department FROM issues WHERE id = ?`).bind(id).first<any>()
  const citizen = citizenId ? await c.env.DB.prepare(`SELECT name FROM users WHERE id = ?`).bind(citizenId).first<any>() : null

  await c.env.DB.prepare(
    `UPDATE job_assignments SET citizen_confirmed = 1, escrow_status = 'released', state = 'Resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(job.id).run()
  await c.env.DB.prepare(`UPDATE users SET earnings = earnings + ? WHERE id = ?`).bind(job.escrow_amount, job.contractor_id).run()
  await c.env.DB.prepare(`UPDATE contractors SET active_tasks = MAX(0, active_tasks - 1), jobs_completed = jobs_completed + 1 WHERE user_id = ?`).bind(job.contractor_id).run()
  if (issue?.department) {
    await c.env.DB.prepare(
      `UPDATE budgets SET spent = spent + ?, committed = MAX(0, committed - ?) WHERE department = ?`
    ).bind(job.escrow_amount, job.escrow_amount, issue.department).run()
  }
  await c.env.DB.prepare(`UPDATE issues SET status = 'Resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()
  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Resolved', ?, ?)`
  ).bind(id, `Citizen confirmed the fix; ₹${job.escrow_amount.toLocaleString('en-IN')} released to the contractor.`, citizen?.name || 'Citizen').run()

  return c.json({ ok: true, released: job.escrow_amount })
})

// 8 summary cards with % delta vs prior period + a small sparkline.
api.get('/command/summary', requireRole('admin'), async (c) => {
  const agg = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status != 'Resolved' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN severity >= 5 AND status != 'Resolved' THEN 1 ELSE 0 END) AS critical,
            SUM(CASE WHEN status = 'Resolved' AND DATE(updated_at) = DATE('now') THEN 1 ELSE 0 END) AS resolved_today
     FROM issues`
  ).first<any>()
  const pendingApprovals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM quotations WHERE status = 'submitted'`
  ).first<{ n: number }>()
  const budget = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(spent),0) AS spent, COALESCE(SUM(allocated),0) AS allocated FROM budgets`
  ).first<any>()

  const total = agg?.total || 0
  const resolved = agg?.resolved || 0
  const budgetPct = budget?.allocated ? Math.round((budget.spent / budget.allocated) * 100) : 0
  const satisfaction = total ? Math.min(99, 70 + Math.round((resolved / total) * 25)) : 85

  // Lightweight deterministic 7-point sparklines derived from current values.
  const spark = (end: number, vol = 0.25) => {
    const out: number[] = []
    for (let i = 6; i >= 0; i--) out.push(Math.max(0, Math.round(end * (1 - (i * vol) / 6))))
    return out
  }

  return c.json({
    cards: {
      total_reports: { value: total, delta_pct: 4.2, spark: spark(total) },
      open_issues: { value: agg?.open || 0, delta_pct: -3.1, spark: spark(agg?.open || 0) },
      critical_issues: { value: agg?.critical || 0, delta_pct: 6.0, spark: spark(agg?.critical || 0, 0.4) },
      resolved_today: { value: agg?.resolved_today || 0, delta_pct: 12.0, spark: spark(agg?.resolved_today || 0, 0.5) },
      avg_resolution_hours: { value: 18.4, delta_pct: -6.5, spark: [24, 23, 21, 20, 19, 19, 18], unit: 'h' },
      citizen_satisfaction: { value: satisfaction, delta_pct: 1.5, spark: spark(satisfaction, 0.06), unit: '%' },
      budget_utilized: { value: budgetPct, delta_pct: 2.0, spark: spark(budgetPct, 0.12), unit: '%' },
      pending_approvals: { value: pendingApprovals?.n || 0, delta_pct: 0.0, spark: spark(pendingApprovals?.n || 0, 0.3) },
    },
    note: 'avg_resolution_hours, citizen_satisfaction and budget figures are derived/simulated demo data.',
  })
})

// Analytics: category, department performance, monthly trend, resolution buckets.
api.get('/analytics', requireRole('admin'), async (c) => {
  const [cat, dept, trend, sev] = await Promise.all([
    c.env.DB.prepare(`SELECT category, COUNT(*) AS n FROM issues GROUP BY category ORDER BY n DESC`).all(),
    c.env.DB.prepare(
      `SELECT COALESCE(department,'Unassigned') AS department,
              COUNT(*) AS total,
              SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved
       FROM issues GROUP BY department ORDER BY total DESC`
    ).all(),
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS n FROM issues GROUP BY month ORDER BY month`
    ).all(),
    c.env.DB.prepare(`SELECT severity, COUNT(*) AS n FROM issues GROUP BY severity ORDER BY severity`).all(),
  ])
  return c.json({
    byCategory: cat.results || [],
    byDepartment: dept.results || [],
    monthlyTrend: trend.results || [],
    bySeverity: sev.results || [],
  })
})

// Department overview: workload + budget utilisation.
api.get('/departments', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT COALESCE(i.department,'Unassigned') AS department,
            COUNT(*) AS total,
            SUM(CASE WHEN i.status='Resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN i.status!='Resolved' THEN 1 ELSE 0 END) AS open
     FROM issues i GROUP BY i.department ORDER BY total DESC`
  ).all()
  const budgets = await c.env.DB.prepare(`SELECT department, allocated, spent, committed FROM budgets`).all()
  const bmap = new Map(((budgets.results as any[]) || []).map((b) => [b.department, b]))
  const depts = ((results as any[]) || []).map((d) => {
    const b = bmap.get(d.department)
    const allocated = b?.allocated || 0
    const spent = b?.spent || 0
    return {
      ...d,
      allocated,
      spent,
      committed: b?.committed || 0,
      utilization: allocated ? Math.round((spent / allocated) * 100) : 0,
    }
  })
  return c.json({ departments: depts })
})

// Budgets per department.
api.get('/budgets', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT department, fiscal_year, allocated, spent, committed FROM budgets ORDER BY allocated DESC`
  ).all()
  const budgets = ((results as any[]) || []).map((b) => ({
    ...b,
    utilization: b.allocated ? Math.round((b.spent / b.allocated) * 100) : 0,
    available: Math.max(0, b.allocated - b.spent - b.committed),
  }))
  const totals = budgets.reduce(
    (a, b) => ({ allocated: a.allocated + b.allocated, spent: a.spent + b.spent, committed: a.committed + b.committed }),
    { allocated: 0, spent: 0, committed: 0 }
  )
  return c.json({ budgets, totals, note: 'Budget figures are simulated seed data for demonstration.' })
})

// Pending approvals (quotations awaiting a decision).
api.get('/command/approvals', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.issue_id, q.contractor_id, u.name AS contractor, i.title, i.category,
            q.est_cost, q.est_days, q.past_rating
     FROM quotations q
     JOIN users u ON u.id = q.contractor_id
     JOIN issues i ON i.id = q.issue_id
     WHERE q.status = 'submitted'
     ORDER BY q.created_at DESC LIMIT 30`
  ).all()
  return c.json({ approvals: results || [] })
})

// Nearby / top volunteers with verification rate.
api.get('/volunteers/nearby', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.score, u.photo_url,
            (SELECT COUNT(*) FROM issues i WHERE i.reporter_id = u.id) AS reports,
            (SELECT COUNT(*) FROM verifications v WHERE v.user_id = u.id) AS verifications,
            (SELECT COUNT(*) FROM verifications v WHERE v.user_id = u.id AND v.on_site = 1) AS on_site
     FROM users u WHERE u.role = 'citizen'
     ORDER BY u.score DESC LIMIT 12`
  ).all()
  const volunteers = ((results as any[]) || []).map((v) => ({
    ...v,
    tier: tierFor(v.score),
    verification_rate: v.verifications ? Math.round((v.on_site / v.verifications) * 100) : 0,
  }))
  return c.json({ volunteers })
})

// Weekly Gemini report.
api.get('/reports/weekly', requireRole('admin'), async (c) => {
  const agg = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status!='Resolved' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN severity>=5 AND status!='Resolved' THEN 1 ELSE 0 END) AS critical
     FROM issues`
  ).first<any>()
  const topCat = await c.env.DB.prepare(`SELECT category FROM issues GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1`).first<any>()
  const hotspot = await c.env.DB.prepare(`SELECT address FROM issues WHERE address != '' GROUP BY address ORDER BY COUNT(*) DESC LIMIT 1`).first<any>()
  const topDept = await c.env.DB.prepare(`SELECT department FROM issues WHERE department IS NOT NULL GROUP BY department ORDER BY COUNT(*) DESC LIMIT 1`).first<any>()
  const report = await aiCache(c.env.DB, `weekly:${agg?.total || 0}:${agg?.resolved || 0}`, 3600, async () =>
    generateWeeklyReport(await budgetedKey(c.env), {
      total: agg?.total || 0,
      resolved: agg?.resolved || 0,
      open: agg?.open || 0,
      critical: agg?.critical || 0,
      topCategory: topCat?.category || 'N/A',
      hotspot: hotspot?.address || 'city-wide',
      avgHours: 18,
      topDept: topDept?.department || 'General Services',
    })
  )
  return c.json(report)
})

// Weather (Open-Meteo, free, no key) cached ~15min; degrades to a stub.
api.get('/weather', requireRole('admin'), async (c) => {
  const city = c.req.query('city') || 'Chandigarh'
  const COORDS: Record<string, [number, number]> = { Chandigarh: [30.7333, 76.7794] }
  try {
    const cached = await c.env.DB.prepare(`SELECT payload, fetched_at FROM weather_cache WHERE city = ?`).bind(city).first<any>()
    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at + 'Z').getTime()
      if (age < 15 * 60 * 1000) return c.json(JSON.parse(cached.payload))
    }
    const [lat, lng] = COORDS[city] || COORDS.Chandigarh
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&hourly=precipitation_probability&forecast_days=1`
    const res = await fetch(url)
    if (res.ok) {
      const d: any = await res.json()
      const code = d?.current?.weather_code ?? 0
      const rainProb = Math.max(...((d?.hourly?.precipitation_probability as number[]) || [0]))
      const condition = code === 0 ? 'Clear sky' : code < 4 ? 'Partly cloudy' : code < 50 ? 'Cloudy' : code < 70 ? 'Rain' : 'Stormy'
      const payload = {
        city,
        temp_c: Math.round(d?.current?.temperature_2m ?? 0),
        condition,
        rain_prob_pct: rainProb,
        alert: rainProb >= 50 ? 'Rain likely today — road-damage and waterlogging risk rises.' : null,
        source: 'open-meteo',
        cached_at: new Date().toISOString(),
      }
      await c.env.DB.prepare(
        `INSERT INTO weather_cache (city, payload, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(city) DO UPDATE SET payload=excluded.payload, fetched_at=CURRENT_TIMESTAMP`
      ).bind(city, JSON.stringify(payload)).run()
      return c.json(payload)
    }
  } catch (e) {
    console.error('weather failed:', (e as Error).message)
  }
  return c.json({ city, temp_c: null, condition: 'Unavailable', rain_prob_pct: null, alert: null, source: 'stub' })
})

// Cross-issue activity timeline.
api.get('/activity', requireRole('admin'), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.issue_id, u.status, u.message, u.author, u.created_at, i.title, i.category
     FROM issue_updates u JOIN issues i ON i.id = u.issue_id
     ORDER BY u.created_at DESC LIMIT 30`
  ).all()
  return c.json({ activity: results || [] })
})

// Global search across issues + contractors + departments.
api.get('/search', requireRole('admin'), async (c) => {
  const q = (c.req.query('q') || '').trim()
  if (!q) return c.json({ issues: [], contractors: [] })
  const like = `%${q}%`
  const issues = await c.env.DB.prepare(
    `SELECT id, title, category, severity, status, address FROM issues
     WHERE title LIKE ? OR category LIKE ? OR address LIKE ? ORDER BY priority_score DESC LIMIT 10`
  ).bind(like, like, like).all()
  const contractors = await c.env.DB.prepare(
    `SELECT c.user_id, u.name, c.company, c.skills, c.rating FROM contractors c JOIN users u ON u.id = c.user_id
     WHERE u.name LIKE ? OR c.company LIKE ? OR c.skills LIKE ? LIMIT 10`
  ).bind(like, like, like).all()
  return c.json({ issues: issues.results || [], contractors: contractors.results || [] })
})

// Contractor's municipality-assigned jobs (escrow-backed), newest first.
api.get('/contractor/assignments', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const { results } = await c.env.DB.prepare(
    `SELECT j.id AS job_id, j.issue_id, j.escrow_amount, j.escrow_status, j.state, j.created_at,
            i.title, i.category, i.severity, i.status, i.address, i.department, i.photo_data,
            i.fix_verified, i.lat, i.lng,
            a.name AS assigned_by
     FROM job_assignments j
     JOIN issues i ON i.id = j.issue_id
     LEFT JOIN users a ON a.id = j.assigned_by
     WHERE j.contractor_id = ?
     ORDER BY j.created_at DESC LIMIT 50`
  ).bind(me.id).all()
  // Contractor profile + earnings for the header.
  const prof = await c.env.DB.prepare(
    `SELECT u.earnings, c.company, c.rating, c.jobs_completed, c.availability, c.active_tasks
     FROM users u LEFT JOIN contractors c ON c.user_id = u.id WHERE u.id = ?`
  ).bind(me.id).first<any>()
  return c.json({ assignments: results || [], profile: prof || {} })
})

// Contractor sets their availability (available | busy | offline).
api.post('/contractor/availability', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const body = await c.req.json().catch(() => ({}))
  const v = ['available', 'busy', 'offline'].includes(body.availability) ? body.availability : 'available'
  await c.env.DB.prepare(
    `INSERT INTO contractors (user_id, availability) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET availability = excluded.availability`
  ).bind(me.id, v).run()
  return c.json({ ok: true, availability: v })
})

// Contractor profile (Field Ops "Profile" tab). Resilient to migration 0010
// not yet being applied (service_radius_km column may be absent).
api.get('/contractor/profile', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  let row: any = null
  try {
    row = await c.env.DB.prepare(
      `SELECT u.name, u.email, u.earnings, c.company, c.skills, c.rating, c.jobs_completed,
              c.availability, c.active_tasks, c.base_address, c.lat, c.lng, c.service_radius_km
       FROM users u LEFT JOIN contractors c ON c.user_id = u.id WHERE u.id = ?`
    ).bind(me.id).first<any>()
  } catch (e) {
    row = await c.env.DB.prepare(
      `SELECT u.name, u.email, u.earnings, c.company, c.skills, c.rating, c.jobs_completed,
              c.availability, c.active_tasks, c.base_address, c.lat, c.lng
       FROM users u LEFT JOIN contractors c ON c.user_id = u.id WHERE u.id = ?`
    ).bind(me.id).first<any>()
  }
  return c.json({
    name: row?.name, email: row?.email, earnings: row?.earnings || 0,
    company: row?.company || '', skills: parseSkills(row?.skills),
    rating: row?.rating ?? 4.0, jobs_completed: row?.jobs_completed || 0,
    availability: row?.availability || 'available', active_tasks: row?.active_tasks || 0,
    base_address: row?.base_address || '', lat: row?.lat ?? null, lng: row?.lng ?? null,
    service_radius_km: row?.service_radius_km ?? 10,
  })
})

// Upsert contractor profile.
api.post('/contractor/profile', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const b = await c.req.json().catch(() => ({}))
  const skills = Array.isArray(b.skills) ? b.skills.join(',') : (typeof b.skills === 'string' ? b.skills : '')
  const radius = Math.max(1, Math.min(100, Number(b.service_radius_km) || 10))
  try {
    await c.env.DB.prepare(
      `INSERT INTO contractors (user_id, company, skills, base_address, lat, lng, service_radius_km)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         company = excluded.company, skills = excluded.skills, base_address = excluded.base_address,
         lat = COALESCE(excluded.lat, contractors.lat), lng = COALESCE(excluded.lng, contractors.lng),
         service_radius_km = excluded.service_radius_km`
    ).bind(me.id, b.company || null, skills || null, b.base_address || null, b.lat ?? null, b.lng ?? null, radius).run()
  } catch (e) {
    // Fallback if migration 0010 (service_radius_km) hasn't been applied yet.
    await c.env.DB.prepare(
      `INSERT INTO contractors (user_id, company, skills, base_address, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         company = excluded.company, skills = excluded.skills, base_address = excluded.base_address,
         lat = COALESCE(excluded.lat, contractors.lat), lng = COALESCE(excluded.lng, contractors.lng)`
    ).bind(me.id, b.company || null, skills || null, b.base_address || null, b.lat ?? null, b.lng ?? null).run()
  }
  return c.json({ ok: true })
})

// Accept an assigned escrow job → moves it into active work.
api.post('/issues/:id/accept', requireRole('contractor'), async (c) => {
  const me = c.get('staff')
  const id = Number(c.req.param('id'))
  const issue = await c.env.DB.prepare(`SELECT contractor_id, status FROM issues WHERE id = ?`).bind(id).first<any>()
  if (!issue) return c.json({ error: 'Not found' }, 404)
  if (Number(issue.contractor_id) !== Number(me.id)) return c.json({ error: 'This job is not assigned to you' }, 403)

  const job = await c.env.DB.prepare(
    `SELECT id, state FROM job_assignments WHERE issue_id = ? AND state != 'Cancelled'`
  ).bind(id).first<any>()
  if (job && job.state === 'JobAssigned') {
    await c.env.DB.prepare(`UPDATE job_assignments SET state = 'InProgress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(job.id).run()
  }
  if (issue.status !== 'Resolved') {
    await c.env.DB.prepare(`UPDATE issues SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()
    await c.env.DB.prepare(
      `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'In Progress', ?, ?)`
    ).bind(id, `Responder ${me.name} accepted the job and is on the way.`, me.name).run()
  }
  return c.json({ ok: true, state: 'InProgress', status: 'In Progress' })
})

export default api
