import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeIssue, generateInsight, computePriority } from '../lib/gemini'
import {
  verifyPassword,
  createSession,
  destroySession,
  getSessionUser,
  sessionCookie,
  clearCookie,
  SESSION_COOKIE,
} from '../lib/auth'

type Bindings = {
  DB: D1Database
  GEMINI_API_KEY?: string
}

const api = new Hono<{ Bindings: Bindings }>()
api.use('/*', cors())

// Demo "current citizen" — citizen-facing endpoints still use a fixed demo user.
const CURRENT_USER_ID = 1

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
  if (mine === 'true') { where.push('i.reporter_id = ?'); binds.push(CURRENT_USER_ID) }
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

  const sql = `SELECT i.*, u.name AS reporter_name, a.name AS assignee_name, a.department AS assignee_department
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
    anonymous = false,
    imageBase64,
    mimeType,
    ai, // optionally pass pre-computed analysis from /analyze
  } = body

  const analysis = ai && ai.category
    ? ai
    : await analyzeIssue(c.env.GEMINI_API_KEY, { description, category, imageBase64, mimeType })

  const res = await c.env.DB.prepare(
    `INSERT INTO issues
      (title, description, category, severity, status, department, priority_score,
       address, lat, lng, photo_data, ai_summary, ai_source, anonymous, reporter_id)
     VALUES (?, ?, ?, ?, 'Reported', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    analysis.summary,
    analysis.source,
    anonymous ? 1 : 0,
    CURRENT_USER_ID
  ).run()

  const issueId = res.meta.last_row_id

  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Reported', ?, 'System')`
  ).bind(issueId, 'Issue reported and analyzed by AI.').run()

  // reward the reporter
  await c.env.DB.prepare(`UPDATE users SET score = score + 10 WHERE id = ?`).bind(CURRENT_USER_ID).run()

  return c.json({ id: issueId, ...analysis }, 201)
})

// ---------------------------------------------------------------
// VERIFICATION (community)
// ---------------------------------------------------------------
api.post('/issues/:id/verify', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const vote = body.vote === 'reject' ? 'reject' : 'confirm'

  try {
    await c.env.DB.prepare(
      `INSERT INTO verifications (issue_id, user_id, vote) VALUES (?, ?, ?)`
    ).bind(id, CURRENT_USER_ID, vote).run()
  } catch (e) {
    return c.json({ error: 'Already verified by you' }, 409)
  }

  // recount confirms
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM verifications WHERE issue_id = ? AND vote = 'confirm'`
  ).bind(id).first<{ cnt: number }>()
  const confirms = row?.cnt || 0

  const issue = await c.env.DB.prepare(`SELECT severity, status FROM issues i WHERE id = ?`).bind(id).first<any>()
  const newPriority = computePriority(issue?.severity || 3, confirms)

  // auto-promote to Verified after 3 community confirmations
  let newStatus = issue?.status
  if (confirms >= 3 && issue?.status === 'Reported') {
    newStatus = 'Verified'
    await c.env.DB.prepare(
      `INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Verified', ?, 'System')`
    ).bind(id, `Confirmed by ${confirms} community members.`).run()
  }

  await c.env.DB.prepare(
    `UPDATE issues SET verify_count = ?, priority_score = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(confirms, newPriority, newStatus, id).run()

  // reward verifier
  await c.env.DB.prepare(`UPDATE users SET score = score + 5 WHERE id = ?`).bind(CURRENT_USER_ID).run()

  return c.json({ verify_count: confirms, status: newStatus, priority_score: newPriority })
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
// STATS / DASHBOARD
// ---------------------------------------------------------------
api.get('/stats', async (c) => {
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues`).first<{ n: number }>()
  const resolved = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status = 'Resolved'`).first<{ n: number }>()
  const open = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status != 'Resolved'`).first<{ n: number }>()
  const critical = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE severity >= 5 AND status != 'Resolved'`).first<{ n: number }>()
  const pending = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE status IN ('Reported','Verified')`).first<{ n: number }>()
  const mine = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE reporter_id = ?`).bind(CURRENT_USER_ID).first<{ n: number }>()
  const user = await c.env.DB.prepare(`SELECT score FROM users WHERE id = ?`).bind(CURRENT_USER_ID).first<{ score: number }>()

  const { results: byCategory } = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM issues GROUP BY category ORDER BY n DESC`
  ).all()
  const { results: byStatus } = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM issues GROUP BY status`
  ).all()

  return c.json({
    total: total?.n || 0,
    resolved: resolved?.n || 0,
    open: open?.n || 0,
    critical: critical?.n || 0,
    pending: pending?.n || 0,
    mine: mine?.n || 0,
    score: user?.score || 0,
    byCategory: byCategory || [],
    byStatus: byStatus || [],
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
  const user = await c.env.DB.prepare(`SELECT id, name, email, role, score FROM users WHERE id = ?`)
    .bind(CURRENT_USER_ID).first()
  const reports = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM issues WHERE reporter_id = ?`)
    .bind(CURRENT_USER_ID).first<{ n: number }>()
  return c.json({ ...user, reports: reports?.n || 0 })
})

export default api
