// Autonomous Triage Agent — orchestrates a multi-step plan over a reported issue
// and records every reasoning step + action it takes (a visible agent trace).
//
// Steps the agent performs autonomously:
//   1. PERCEIVE   — load the issue and gather context (nearby open issues, dept load)
//   2. REASON     — one structured Gemini pass: duplicate? priority? department?
//   3. DEDUPE     — if duplicate, link it and stop the pipeline
//   4. PRIORITIZE — apply the agent's computed priority score
//   5. ROUTE      — pick the matching authority and auto-assign the issue
//   6. PLAN       — generate a resolution action plan
// Each step is written to `agent_actions` so the UI can show the agent's "mind".

import { agentReason, generateResolutionPlan, type AgentCandidate } from './gemini'
import { budgetedKey } from './cache'

type Env = { DB: D1Database; GEMINI_API_KEY?: string; GEMINI_DAILY_CAP?: string }

async function log(
  db: D1Database,
  issueId: number,
  step: number,
  tool: string,
  thought: string,
  action: string,
  result: string
) {
  await db
    .prepare(`INSERT INTO agent_actions (issue_id, step, tool, thought, action, result) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(issueId, step, tool, thought, action, result)
    .run()
}

export async function runTriageAgent(env: Env, issueId: number): Promise<{ ok: boolean; steps: number; conclusion: string; duplicate_of: number | null }> {
  const db = env.DB

  // 1. PERCEIVE
  const issue = await db
    .prepare(`SELECT id, title, description, category, severity, address, department, status FROM issues WHERE id = ?`)
    .bind(issueId)
    .first<any>()
  if (!issue) return { ok: false, steps: 0, conclusion: 'Issue not found', duplicate_of: null }

  // Clear any prior trace (re-runnable)
  await db.prepare(`DELETE FROM agent_actions WHERE issue_id = ?`).bind(issueId).run()

  const { results: cands } = await db
    .prepare(
      `SELECT id, title, category, address, status FROM issues
       WHERE id != ? AND category = ? AND status != 'Resolved' AND (duplicate_of IS NULL)
       ORDER BY created_at DESC LIMIT 8`
    )
    .bind(issueId, issue.category)
    .all()
  const candidates = (cands || []) as AgentCandidate[]

  const loadRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM issues WHERE department = ? AND status != 'Resolved'`)
    .bind(issue.department || '')
    .first<{ n: number }>()
  const deptLoad = loadRow?.n || 0

  await log(
    db,
    issueId,
    1,
    'perceive',
    `Gathering context for issue #${issueId}.`,
    `Found ${candidates.length} open same-category issues; department workload is ${deptLoad}.`,
    'Context ready.'
  )

  // 2. REASON
  const decision = await agentReason(await budgetedKey(env), issue, candidates, deptLoad)
  await log(
    db,
    issueId,
    2,
    'reason',
    decision.conclusion,
    `duplicate_of=${decision.duplicate_of ?? 'none'}, priority=${decision.priority_score}, dept=${decision.department}`,
    `Reasoning by ${decision.source === 'gemini' ? 'Gemini' : 'rule engine'}.`
  )

  let step = 3

  // 3. DEDUPE — if duplicate, link and short-circuit
  if (decision.duplicate_of) {
    await db
      .prepare(`UPDATE issues SET duplicate_of = ?, status = 'Reported', agent_processed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(decision.duplicate_of, issueId)
      .run()
    await log(db, issueId, step++, 'dedupe', decision.duplicate_reason, `Linked to #${decision.duplicate_of} as duplicate.`, 'Merged — no new dispatch needed.')
    // bump the original's verify weight (community signal)
    await db
      .prepare(`UPDATE issues SET priority_score = MIN(100, priority_score + 5), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(decision.duplicate_of)
      .run()
    await db
      .prepare(`INSERT INTO issue_updates (issue_id, status, message, author) VALUES (?, 'Reported', ?, 'Triage Agent')`)
      .bind(issueId, `AI agent flagged this as a duplicate of #${decision.duplicate_of}.`)
      .run()
    return { ok: true, steps: step - 1, conclusion: `Flagged as duplicate of #${decision.duplicate_of}.`, duplicate_of: decision.duplicate_of }
  }

  // 4. PRIORITIZE
  await db
    .prepare(`UPDATE issues SET priority_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(decision.priority_score, issueId)
    .run()
  await log(db, issueId, step++, 'prioritize', decision.priority_reason, `Set priority score to ${decision.priority_score}/100.`, 'Priority updated.')

  // 5. ROUTE — find an authority in the chosen department and auto-assign
  const authority = await db
    .prepare(`SELECT id, name, department FROM users WHERE role = 'authority' AND department = ? LIMIT 1`)
    .bind(decision.department)
    .first<any>()

  if (authority) {
    const keepStatus = ['In Progress', 'Resolved'].includes(issue.status) ? issue.status : 'Assigned'
    await db
      .prepare(`UPDATE issues SET assigned_to = ?, department = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(authority.id, decision.department, keepStatus, issueId)
      .run()
    await db
      .prepare(`INSERT INTO issue_updates (issue_id, status, department, message, author) VALUES (?, ?, ?, ?, 'Triage Agent')`)
      .bind(issueId, keepStatus, decision.department, `Auto-routed to ${authority.name} (${decision.department}). ${decision.route_reason}`)
      .run()
    await log(db, issueId, step++, 'route', decision.route_reason, `Assigned to ${authority.name} (${decision.department}); status → ${keepStatus}.`, 'Dispatched to department.')
  } else {
    await db
      .prepare(`UPDATE issues SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(decision.department, issueId)
      .run()
    await log(db, issueId, step++, 'route', decision.route_reason, `No authority seat for ${decision.department}; left in queue for admin.`, 'Pending manual assignment.')
  }

  // 6. PLAN — use the deterministic heuristic here (no Gemini). The richer
  // Gemini plan is generated on-demand by GET /issues/:id/plan and cached,
  // so we don't spend a token per report during triage.
  const plan = await generateResolutionPlan(undefined, {
    title: issue.title,
    description: issue.description,
    category: issue.category,
    severity: issue.severity,
    address: issue.address,
    department: decision.department,
  })
  await log(
    db,
    issueId,
    step++,
    'plan',
    `Drafting a field action plan (${plan.source}).`,
    `${plan.steps.length} steps · crew: ${plan.crew} · est ${plan.est_time}, ${plan.est_cost}.`,
    plan.steps.slice(0, 4).join(' → ')
  )

  await db.prepare(`UPDATE issues SET agent_processed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(issueId).run()

  return { ok: true, steps: step - 1, conclusion: decision.conclusion, duplicate_of: null }
}
