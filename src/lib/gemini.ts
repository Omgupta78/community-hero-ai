// Real Gemini AI integration for Community Hero AI
// Uses the Google Generative Language REST API (works on Cloudflare Workers via fetch).

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`

const CATEGORIES = ['Pothole', 'Illegal Dumping', 'Streetlight', 'Water Leak', 'Graffiti', 'Other']
const DEPARTMENTS: Record<string, string> = {
  Pothole: 'Road Maintenance',
  'Illegal Dumping': 'Sanitation',
  Streetlight: 'Electrical',
  'Water Leak': 'Water Works',
  Graffiti: 'Parks & Recreation',
  Other: 'General Services',
}

export type AIAnalysis = {
  category: string
  severity: number // 1-5
  department: string
  title: string
  summary: string
  priority_score: number
  source: 'gemini' | 'heuristic'
}

function clampSeverity(n: any): number {
  const v = Math.round(Number(n))
  if (isNaN(v)) return 3
  return Math.min(5, Math.max(1, v))
}

function computePriority(severity: number, verifyCount = 0): number {
  // weighted: severity dominates, community verification boosts
  return Math.min(100, Math.round(severity * 16 + verifyCount * 3))
}

/**
 * Analyze a civic issue using Gemini. Accepts optional base64 image data.
 * Falls back to a deterministic heuristic if no API key or the call fails.
 */
export async function analyzeIssue(
  apiKey: string | undefined,
  opts: { description?: string; category?: string; imageBase64?: string; mimeType?: string }
): Promise<AIAnalysis> {
  const { description = '', category, imageBase64, mimeType } = opts

  if (apiKey) {
    try {
      return await callGemini(apiKey, description, category, imageBase64, mimeType)
    } catch (e) {
      console.error('Gemini call failed, falling back to heuristic:', (e as Error).message)
    }
  }
  return heuristicAnalysis(description, category)
}

async function callGemini(
  apiKey: string,
  description: string,
  category: string | undefined,
  imageBase64?: string,
  mimeType?: string
): Promise<AIAnalysis> {
  const instruction = `You are a municipal civic-issue triage assistant. Analyze the reported community issue${
    imageBase64 ? ' and the attached photo' : ''
  } and respond ONLY with strict minified JSON, no markdown, matching:
{"category": one of ${JSON.stringify(CATEGORIES)},
"severity": integer 1-5 (5=critical danger to people),
"title": short headline under 60 chars,
"summary": 1-2 sentence triage note with recommended action}
Citizen description: "${description || '(none provided)'}"${
    category ? `\nCitizen-selected category hint: ${category}` : ''
  }`

  const parts: any[] = [{ text: instruction }]
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } })
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  }

  const res = await fetch(GEMINI_URL(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }

  const data: any = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const parsed = JSON.parse(text)

  const cat = CATEGORIES.includes(parsed.category) ? parsed.category : 'Other'
  const severity = clampSeverity(parsed.severity)

  return {
    category: cat,
    severity,
    department: DEPARTMENTS[cat] || 'General Services',
    title: (parsed.title || `${cat} reported`).toString().slice(0, 80),
    summary: (parsed.summary || 'Issue logged for review.').toString(),
    priority_score: computePriority(severity),
    source: 'gemini',
  }
}

/** Deterministic fallback so the app always works without an API key. */
function heuristicAnalysis(description: string, category?: string): AIAnalysis {
  const text = `${category || ''} ${description}`.toLowerCase()
  const rules: { cat: string; kws: string[]; sev: number }[] = [
    { cat: 'Pothole', kws: ['pothole', 'road', 'asphalt', 'crack', 'tire'], sev: 4 },
    { cat: 'Water Leak', kws: ['water', 'leak', 'flood', 'pipe', 'burst'], sev: 4 },
    { cat: 'Streetlight', kws: ['light', 'lamp', 'dark', 'bulb', 'streetlight'], sev: 3 },
    { cat: 'Illegal Dumping', kws: ['dump', 'trash', 'debris', 'garbage', 'waste'], sev: 4 },
    { cat: 'Graffiti', kws: ['graffiti', 'paint', 'spray', 'vandal', 'tag'], sev: 2 },
  ]
  let cat = category && CATEGORIES.includes(category) ? category : 'Other'
  let sev = 3
  for (const r of rules) {
    if (r.kws.some((k) => text.includes(k))) {
      cat = r.cat
      sev = r.sev
      break
    }
  }
  // urgency keywords bump severity
  if (/(danger|emergency|urgent|injur|fire|burst|exposed|child)/.test(text)) sev = Math.min(5, sev + 1)

  return {
    category: cat,
    severity: sev,
    department: DEPARTMENTS[cat] || 'General Services',
    title: `${cat} reported`,
    summary: `Auto-categorized as ${cat} (severity ${sev}/5). ${
      sev >= 4 ? 'High priority — recommend prompt dispatch.' : 'Queued for standard review.'
    }`,
    priority_score: computePriority(sev),
    source: 'heuristic',
  }
}

/** Generate a weekly community insight summary from aggregate stats. */
export async function generateInsight(
  apiKey: string | undefined,
  stats: { total: number; resolved: number; topCategory: string; hotspot: string; categories: Record<string, number> }
): Promise<{ text: string; source: 'gemini' | 'heuristic' }> {
  const rate = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0

  if (apiKey) {
    try {
      const prompt = `You are a city civic-analytics assistant. Write a concise, encouraging 2-3 sentence weekly summary for residents based on this data: total reports ${stats.total}, resolved ${stats.resolved} (${rate}% resolution rate), most reported category "${stats.topCategory}", hotspot area "${stats.hotspot}". Mention one actionable insight. Plain text only.`
      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6 },
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { text: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('Insight generation failed:', (e as Error).message)
    }
  }

  return {
    text: `This week the community filed ${stats.total} reports with a ${rate}% resolution rate. "${stats.topCategory}" is the most common issue, concentrated around ${stats.hotspot}. Verifying nearby reports helps teams prioritize the most urgent fixes faster.`,
    source: 'heuristic',
  }
}

export type ResolutionPlan = {
  steps: string[]
  equipment: string[]
  crew: string
  est_time: string
  est_cost: string
  safety: string
  source: 'gemini' | 'heuristic'
}

/**
 * Generate a concrete municipal action plan for resolving an issue.
 * Real-time Gemini call with a deterministic fallback so it always returns.
 */
export async function generateResolutionPlan(
  apiKey: string | undefined,
  issue: { title: string; description?: string; category: string; severity: number; address?: string; department?: string }
): Promise<ResolutionPlan> {
  if (apiKey) {
    try {
      const prompt = `You are a municipal operations planner. For the civic issue below, produce a concrete field action plan as STRICT minified JSON only (no markdown), matching:
{"steps":[3-5 short imperative action steps],
"equipment":[key tools/materials needed],
"crew":"recommended crew/role and headcount",
"est_time":"estimated time to resolve (e.g. '2-4 hours')",
"est_cost":"rough cost band (e.g. '$150-$400')",
"safety":"one key safety precaution"}
Issue: title="${issue.title}", category="${issue.category}", severity=${issue.severity}/5, department="${issue.department || 'General Services'}", location="${issue.address || 'unknown'}".
Citizen description: "${issue.description || '(none)'}"`

      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        const p = JSON.parse(text)
        return {
          steps: Array.isArray(p.steps) ? p.steps.slice(0, 6).map(String) : [],
          equipment: Array.isArray(p.equipment) ? p.equipment.slice(0, 8).map(String) : [],
          crew: (p.crew || '2-person municipal crew').toString(),
          est_time: (p.est_time || 'N/A').toString(),
          est_cost: (p.est_cost || 'N/A').toString(),
          safety: (p.safety || 'Cordon off the area and wear standard PPE.').toString(),
          source: 'gemini',
        }
      }
    } catch (e) {
      console.error('Resolution plan generation failed:', (e as Error).message)
    }
  }

  return heuristicPlan(issue)
}

function heuristicPlan(issue: { category: string; severity: number }): ResolutionPlan {
  const byCat: Record<string, Partial<ResolutionPlan>> = {
    Pothole: {
      steps: ['Inspect and measure the pothole', 'Cordon off the lane and place warning signs', 'Clean debris and apply cold/hot asphalt mix', 'Compact and seal the patch'],
      equipment: ['Asphalt mix', 'Compactor', 'Safety cones', 'Shovels'],
      crew: '2-3 person road crew',
      est_time: '2-4 hours',
      est_cost: '$150-$500',
    },
    'Water Leak': {
      steps: ['Locate and isolate the supply valve', 'Excavate to expose the pipe', 'Replace or seal the damaged section', 'Pressure-test and backfill'],
      equipment: ['Pipe fittings', 'Excavator', 'Sealant', 'Pump'],
      crew: '3-person water works crew',
      est_time: '4-8 hours',
      est_cost: '$400-$1,500',
    },
    Streetlight: {
      steps: ['De-energize the circuit', 'Inspect bulb, ballast and wiring', 'Replace faulty components', 'Test illumination'],
      equipment: ['Replacement bulb/ballast', 'Bucket truck', 'Insulated tools'],
      crew: '2-person electrical crew',
      est_time: '1-3 hours',
      est_cost: '$100-$400',
    },
    'Illegal Dumping': {
      steps: ['Document and photograph the site', 'Sort recyclable vs hazardous waste', 'Load and haul debris', 'Clean and disinfect the area'],
      equipment: ['Dump truck', 'Gloves', 'Bags', 'Loader'],
      crew: '3-person sanitation crew',
      est_time: '2-5 hours',
      est_cost: '$200-$800',
    },
    Graffiti: {
      steps: ['Assess surface type', 'Apply graffiti remover or repaint', 'Pressure-wash residue', 'Apply protective coating'],
      equipment: ['Solvent/paint', 'Pressure washer', 'Brushes'],
      crew: '1-2 person parks crew',
      est_time: '1-2 hours',
      est_cost: '$80-$300',
    },
  }
  const base = byCat[issue.category] || {
    steps: ['Dispatch an inspector to assess', 'Determine required materials and crew', 'Execute the repair', 'Verify and close the report'],
    equipment: ['Standard municipal toolkit'],
    crew: '2-person general services crew',
    est_time: '2-4 hours',
    est_cost: '$150-$500',
  }
  return {
    steps: base.steps!,
    equipment: base.equipment!,
    crew: base.crew!,
    est_time: base.est_time!,
    est_cost: base.est_cost!,
    safety: issue.severity >= 4 ? 'High severity — secure the area immediately and notify supervisor before work.' : 'Wear standard PPE and place warning signage.',
    source: 'heuristic',
  }
}

export { CATEGORIES, DEPARTMENTS, computePriority }

// ---------------------------------------------------------------
// AGENTIC TRIAGE — autonomous multi-step reasoning + action
// ---------------------------------------------------------------
export type AgentCandidate = { id: number; title: string; category: string; address?: string; status: string }
export type AgentDecision = {
  duplicate_of: number | null
  duplicate_reason: string
  priority_score: number
  priority_reason: string
  department: string
  route_reason: string
  conclusion: string
  source: 'gemini' | 'heuristic'
}

/**
 * The "brain" of the autonomous triage agent. Given a freshly reported issue,
 * the open issues nearby/same-category, and the current department workload, it
 * reasons (in one structured pass) about duplicates, priority and routing.
 */
export async function agentReason(
  apiKey: string | undefined,
  issue: { id: number; title: string; description?: string; category: string; severity: number; address?: string },
  candidates: AgentCandidate[],
  deptLoad: number
): Promise<AgentDecision> {
  const dept = DEPARTMENTS[issue.category] || 'General Services'

  if (apiKey) {
    try {
      const prompt = `You are an autonomous municipal triage AGENT. Reason step-by-step, then output STRICT minified JSON only.
New issue #${issue.id}: title="${issue.title}", category="${issue.category}", severity=${issue.severity}/5, location="${issue.address || 'unknown'}".
Description: "${issue.description || '(none)'}".
Existing OPEN issues that might be duplicates (same category/area):
${candidates.length ? candidates.map((c) => `  - #${c.id}: "${c.title}" @ ${c.address || '?'} [${c.status}]`).join('\n') : '  (none)'}
Current open workload for the "${dept}" department: ${deptLoad} issues.

Decide:
1) Is the new issue a DUPLICATE of one of the listed existing issues? (same problem, same place)
2) A priority score 0-100 (severity dominates; higher community/area load raises it).
3) Which department should own it.
Respond ONLY as: {"duplicate_of": <existing issue id or null>, "duplicate_reason": "...", "priority_score": <0-100>, "priority_reason": "...", "department": "<dept>", "route_reason": "...", "conclusion": "<one sentence>"}`

      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        const p = JSON.parse(text)
        const validDup = candidates.some((c) => c.id === p.duplicate_of)
        return {
          duplicate_of: validDup ? Number(p.duplicate_of) : null,
          duplicate_reason: (p.duplicate_reason || '').toString(),
          priority_score: Math.min(100, Math.max(0, Math.round(Number(p.priority_score)) || computePriority(issue.severity))),
          priority_reason: (p.priority_reason || '').toString(),
          department: typeof p.department === 'string' && p.department ? p.department : dept,
          route_reason: (p.route_reason || '').toString(),
          conclusion: (p.conclusion || 'Triage complete.').toString(),
          source: 'gemini',
        }
      }
    } catch (e) {
      console.error('Agent reasoning failed:', (e as Error).message)
    }
  }

  // Deterministic fallback agent.
  const dup = candidates.find(
    (c) => c.category === issue.category && similarTitle(c.title, issue.title) && sameArea(c.address, issue.address)
  )
  return {
    duplicate_of: dup ? dup.id : null,
    duplicate_reason: dup ? `Matches existing #${dup.id} in the same category and area.` : 'No close match among open issues.',
    priority_score: Math.min(100, computePriority(issue.severity) + Math.min(15, deptLoad * 2)),
    priority_reason: `Severity ${issue.severity}/5 with ${deptLoad} open ${dept} issues raising urgency.`,
    department: dept,
    route_reason: `Category "${issue.category}" maps to the ${dept} department.`,
    conclusion: dup ? `Likely duplicate of #${dup.id}; flagged for merge.` : `Routed to ${dept} at priority.`,
    source: 'heuristic',
  }
}

function similarTitle(a: string, b: string): boolean {
  // Ignore category names and filler so generic auto-titles ("Streetlight
  // reported") don't falsely match. Real duplicates share specific words.
  const filler = new Set([
    'reported', 'issue', 'near', 'broken', 'large', 'small', 'damaged',
    'pothole', 'streetlight', 'street', 'light', 'water', 'leak', 'graffiti',
    'illegal', 'dumping', 'dump', 'flooding', 'sidewalk', 'road',
  ])
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3 && !filler.has(w))
  const wa = new Set(norm(a))
  const wb = norm(b)
  if (!wb.length) return false
  const overlap = wb.filter((w) => wa.has(w)).length
  return overlap / wb.length >= 0.5
}

// Two addresses refer to the same area if they share a meaningful street/place
// token (e.g. both mention "Main"). Prevents merging issues on different streets.
function sameArea(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const stop = new Set(['street', 'st', 'rd', 'road', 'ave', 'avenue', 'blvd', 'lane', 'ln', 'dr', 'drive', 'springfield'])
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w) && isNaN(Number(w)))
  const wa = new Set(norm(a))
  const wb = norm(b)
  if (!wb.length) return false
  return wb.some((w) => wa.has(w))
}

// ---------------------------------------------------------------
// PREDICTIVE INSIGHTS — forecast emerging hotspots & rising categories
// ---------------------------------------------------------------
export type Prediction = {
  forecast: string
  emerging_hotspot: string
  rising_category: string
  recommendation: string
  source: 'gemini' | 'heuristic'
}

export async function predictTrends(
  apiKey: string | undefined,
  data: { byCategory: { category: string; n: number }[]; hotspot: string; total: number; resolved: number; recent: { category: string; address: string }[] }
): Promise<Prediction> {
  const top = data.byCategory[0]?.category || 'N/A'
  if (apiKey) {
    try {
      const prompt = `You are a municipal data analyst AI. Based on this civic-issue data, predict near-future trends.
Totals: ${data.total} reports, ${data.resolved} resolved.
By category: ${data.byCategory.map((c) => `${c.category}:${c.n}`).join(', ')}.
Current hotspot: ${data.hotspot}.
Recent reports: ${data.recent.map((r) => `${r.category}@${r.address}`).slice(0, 10).join('; ')}.
Output STRICT minified JSON only: {"forecast":"2-sentence prediction of what's likely to rise next week","emerging_hotspot":"area name likely to need attention","rising_category":"category likely to increase","recommendation":"one preventive action the city should take"}`
      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok) {
        const d: any = await res.json()
        const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        const p = JSON.parse(text)
        return {
          forecast: (p.forecast || '').toString(),
          emerging_hotspot: (p.emerging_hotspot || data.hotspot).toString(),
          rising_category: (p.rising_category || top).toString(),
          recommendation: (p.recommendation || '').toString(),
          source: 'gemini',
        }
      }
    } catch (e) {
      console.error('Prediction failed:', (e as Error).message)
    }
  }

  return {
    forecast: `Based on current trends, "${top}" reports are likely to keep rising, especially around ${data.hotspot}. Proactive inspection there could prevent escalation.`,
    emerging_hotspot: data.hotspot,
    rising_category: top,
    recommendation: `Schedule a preventive inspection sweep for ${top.toLowerCase()} issues around ${data.hotspot}.`,
    source: 'heuristic',
  }
}

// ---------------------------------------------------------------
// AI CHATBOT — "Hero Assistant" (real-time multi-turn Gemini)
// ---------------------------------------------------------------
export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const ASSISTANT_SYSTEM = (ctx: { total: number; resolved: number; open: number }) =>
  `You are "Hero Assistant", the friendly in-app guide for **Community Hero AI**, a civic issue
reporting platform where citizens report local problems (potholes, water leaks, broken
streetlights, illegal dumping, graffiti) with a photo. Google Gemini triages each report
(category, severity, department, priority) and the community verifies them; municipal staff
resolve them.

How the app works (use this to help users):
- Report: open the Report tab, take/upload a photo, add a description, tap "Analyze with AI",
  then Submit. Reporting earns +10 community points.
- Verify: confirm neighbors' reports on the Verify page or an issue page (+5 points). After 3
  confirmations a report is auto-promoted to "Verified" and rises in the AI priority queue.
- Track: the Map shows live markers; each issue page has an official status timeline and an
  on-demand "AI Resolution Plan".
- Sign in on Profile (Google or email) to keep your reports and score.
- Categories: Pothole, Illegal Dumping, Streetlight, Water Leak, Graffiti, Other.

Live community stats right now: ${ctx.total} total reports, ${ctx.resolved} resolved, ${ctx.open} open.

Rules: Be concise (2-4 sentences), warm and encouraging. Guide users to the right page/action.
Only discuss this app and civic reporting. If asked something unrelated, gently steer back.
Never invent issue data you weren't given. Plain text only, no markdown headings.`

export async function chatReply(
  apiKey: string | undefined,
  messages: ChatMessage[],
  ctx: { total: number; resolved: number; open: number }
): Promise<{ reply: string; source: 'gemini' | 'heuristic' }> {
  const last = messages.length ? messages[messages.length - 1].content : ''

  if (apiKey) {
    try {
      const contents = messages.slice(-12).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      const res = await fetch(GEMINI_URL(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM(ctx) }] },
          contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { reply: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('Chat reply failed:', (e as Error).message)
    }
  }

  return { reply: heuristicChat(last, ctx), source: 'heuristic' }
}

function heuristicChat(msg: string, ctx: { total: number; resolved: number; open: number }): string {
  const t = msg.toLowerCase()
  if (/report|submit|new issue|pothole|leak|streetlight|dump|graffiti/.test(t))
    return 'To report an issue, open the Report tab, snap or upload a photo, add a short description, then tap "Analyze with AI" and Submit. You earn +10 community points for each report.'
  if (/verify|confirm|vote/.test(t))
    return 'You can verify neighbors\' reports on the Verify page or any issue page. Each verification earns +5 points, and after 3 confirmations a report is promoted to "Verified" and prioritized.'
  if (/point|score|reward|gamif/.test(t))
    return 'You earn +10 points for reporting an issue and +5 for verifying one. Sign in on the Profile page so your points and reports are saved to your account.'
  if (/map|where|location|near/.test(t))
    return 'The Map tab shows live, severity-colored markers for reported issues in your area, with filters for all reports, your reports, and ones needing verification.'
  if (/status|track|progress|resolved/.test(t))
    return `Each issue page has an official status timeline (Reported → Verified → Assigned → In Progress → Resolved). Right now the community has ${ctx.resolved} resolved out of ${ctx.total} total reports.`
  if (/login|sign|account|admin|staff/.test(t))
    return 'Citizens sign in on the Profile page with Google or email. Municipal staff use the Staff Login to manage and assign issues.'
  if (/hello|hi|hey|help|what can you/.test(t))
    return 'Hi! I\'m Hero Assistant. I can help you report a civic issue, verify reports, understand your community score, or track an issue\'s status. What would you like to do?'
  return 'I can help you report an issue, verify reports, earn community points, or track issue status. Try asking "How do I report a pothole?"'
}