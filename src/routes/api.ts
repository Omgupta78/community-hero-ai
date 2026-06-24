import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { analyzeIssue, generateInsight, computePriority } from '../lib/gemini'

type Bindings = {
  DB: D1Database
  GEMINI_API_KEY?: string
}

const api = new Hono<{ Bindings: Bindings }>()
api.use('/*', cors())

// Demo "current user" — in production this comes from auth.
const CURRENT_USER_ID = 1

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
  const { status, category, mine, verify, limit } = c.req.query()
  const where: string[] = []
  const binds: any[] = []

  if (status) { where.push('status = ?'); binds.push(status) }
  if (category) { where.push('category = ?'); binds.push(category) }
  if (mine === 'true') { where.push('reporter_id = ?'); binds.push(CURRENT_USER_ID) }
  if (verify === 'true') { where.push("status IN ('Reported','Verified')") }

  const sql = `SELECT i.*, u.name AS reporter_name
               FROM issues i LEFT JOIN users u ON i.reporter_id = u.id
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
    `SELECT i.*, u.name AS reporter_name FROM issues i
     LEFT JOIN users u ON i.reporter_id = u.id WHERE i.id = ?`
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
// ADMIN: status updates
// ---------------------------------------------------------------
api.patch('/issues/:id/status', async (c) => {
  const id = Number(c.req.param('id'))
  const { status, department, message } = await c.req.json().catch(() => ({}))
  if (!status) return c.json({ error: 'status required' }, 400)

  await c.env.DB.prepare(
    `UPDATE issues SET status = ?, department = COALESCE(?, department), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(status, department || null, id).run()

  await c.env.DB.prepare(
    `INSERT INTO issue_updates (issue_id, status, department, message, author) VALUES (?, ?, ?, ?, 'City Operations')`
  ).bind(id, status, department || null, message || `Status changed to ${status}.`).run()

  return c.json({ ok: true, status })
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
