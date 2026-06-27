// Real Gemini AI integration for Community Hero AI
// Uses the Google Generative Language REST API (works on Cloudflare Workers via fetch).

// This key/project has free quota on gemini-2.5-flash (gemini-2.0-flash shows
// limit 0 for AI Studio "AQ." keys). 2.5-flash-lite has even more headroom if needed.
const GEMINI_MODEL = 'gemini-2.5-flash'
// IMPORTANT: the API key is sent via the `x-goog-api-key` HEADER, not the
// `?key=` query param. Newer Google AI Studio keys (the `AQ.` format) are
// rejected as `?key=` ("ACCESS_TOKEN_TYPE_UNSUPPORTED") but work as a header.
const geminiHeaders = (key: string) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key })

// Model fallback chain: if the primary model returns a quota/availability error
// (429/403/404/5xx), transparently retry the request on the next model. This
// keeps real AI responses flowing even when one model's free quota is drained
// (e.g. gemini-2.0-flash shows limit 0 / 429 for AI Studio "AQ." keys).
const GEMINI_MODELS = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash-lite']

async function geminiFetch(apiKey: string, init: { body: string }): Promise<Response> {
  let last: Response | null = null
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: 'POST', headers: geminiHeaders(apiKey), body: init.body }
    )
    if (res.ok) return res
    last = res
    // 400 = malformed request (retrying other models won't help) → stop.
    if (![429, 403, 404, 500, 503].includes(res.status)) break
    try { console.error(`Gemini ${model} -> HTTP ${res.status}; trying fallback model`) } catch {}
  }
  return last as Response
}

// Live AI health probe: confirms the key is present and finds the first model
// in the fallback chain that responds. Powers /api/ai-health and `npm run check:ai`
// so a silent fallback-to-heuristic situation is caught immediately, not at demo time.
export async function geminiPing(
  apiKey: string | undefined
): Promise<{ key_present: boolean; ok: boolean; model: string | null; status: number | null; detail?: string }> {
  if (!apiKey) return { key_present: false, ok: false, model: null, status: null, detail: 'GEMINI_API_KEY not set' }
  let lastStatus: number | null = null
  let detail = ''
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: geminiHeaders(apiKey),
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
        }
      )
      lastStatus = res.status
      if (res.ok) return { key_present: true, ok: true, model, status: res.status }
      try { const j: any = await res.json(); detail = j?.error?.status || '' } catch {}
    } catch (e) {
      lastStatus = -1
      detail = (e as Error).message
    }
  }
  return { key_present: true, ok: false, model: null, status: lastStatus, detail }
}

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
  authenticity: 'genuine' | 'needs_evidence' | 'suspect'
  authenticity_reason: string
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
  const isVideo = !!mimeType && mimeType.startsWith('video/')
  const mediaPhrase = imageBase64 ? (isVideo ? ' and the attached video clip' : ' and the attached photo') : ''
  const instruction = `You are a municipal civic-issue triage assistant. Analyze the reported community issue${mediaPhrase} and respond ONLY with strict minified JSON, no markdown, matching:
{"category": one of ${JSON.stringify(CATEGORIES)},
"severity": integer 1-5 (5=critical danger to people),
"title": short headline under 60 chars,
"summary": 1-2 sentence triage note with recommended action,
"authenticity": one of ["genuine","needs_evidence","suspect"] (is this a real civic issue with clear enough evidence? "needs_evidence" if the media/description is unclear or insufficient; "suspect" if it looks fake, staged, irrelevant or spam),
"authenticity_reason": short reason for the authenticity judgement}
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

  const res = await geminiFetch(apiKey, {
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
  const authOptions = ['genuine', 'needs_evidence', 'suspect']
  const authenticity = authOptions.includes(parsed.authenticity) ? parsed.authenticity : 'genuine'

  return {
    category: cat,
    severity,
    department: DEPARTMENTS[cat] || 'General Services',
    title: (parsed.title || `${cat} reported`).toString().slice(0, 80),
    summary: (parsed.summary || 'Issue logged for review.').toString(),
    priority_score: computePriority(severity),
    authenticity: authenticity as AIAnalysis['authenticity'],
    authenticity_reason: (parsed.authenticity_reason || '').toString(),
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

  // Basic authenticity heuristic: enough signal = genuine; thin input = needs evidence.
  const wordCount = (description || '').trim().split(/\s+/).filter(Boolean).length
  const authenticity: AIAnalysis['authenticity'] = wordCount === 0 ? 'needs_evidence' : 'genuine'

  return {
    category: cat,
    severity: sev,
    department: DEPARTMENTS[cat] || 'General Services',
    title: `${cat} reported`,
    summary: `Auto-categorized as ${cat} (severity ${sev}/5). ${
      sev >= 4 ? 'High priority — recommend prompt dispatch.' : 'Queued for standard review.'
    }`,
    priority_score: computePriority(sev),
    authenticity,
    authenticity_reason:
      authenticity === 'genuine'
        ? 'Description provides enough context to action.'
        : 'Add a photo or more detail so the report can be verified.',
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
      const res = await geminiFetch(apiKey, {
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

      const res = await geminiFetch(apiKey, {
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
// CONTRACTOR PROOF-OF-FIX — Gemini before/after verification
// ---------------------------------------------------------------
export type FixVerdict = {
  resolved: boolean
  confidence: number // 0-100
  reason: string
  source: 'gemini' | 'heuristic'
}

/**
 * Compares the original report image ("before") with the contractor's proof
 * image ("after") and judges whether the civic issue appears genuinely fixed.
 */
export async function verifyFix(
  apiKey: string | undefined,
  issue: { title: string; category: string; description?: string },
  beforeBase64: string | undefined,
  afterBase64: string | undefined,
  afterMime?: string
): Promise<FixVerdict> {
  if (apiKey && afterBase64) {
    try {
      const parts: any[] = [
        {
          text: `You are a municipal QA inspector. A contractor claims they fixed this civic issue: "${issue.title}" (category ${issue.category}). ${
            issue.description ? `Citizen description: "${issue.description}". ` : ''
          }${beforeBase64 ? 'The FIRST image is BEFORE (the reported problem). The SECOND image is AFTER (the claimed fix). ' : 'The image is the AFTER (claimed fix). '}Judge whether the issue genuinely appears resolved. Respond ONLY with strict minified JSON: {"resolved": boolean, "confidence": integer 0-100, "reason": "one short sentence"}`,
        },
      ]
      if (beforeBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: beforeBase64 } })
      parts.push({ inline_data: { mime_type: afterMime || 'image/jpeg', data: afterBase64 } })

      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        const p = JSON.parse(text)
        return {
          resolved: !!p.resolved,
          confidence: Math.min(100, Math.max(0, Math.round(Number(p.confidence)) || 0)),
          reason: (p.reason || '').toString(),
          source: 'gemini',
        }
      }
    } catch (e) {
      console.error('Fix verification failed:', (e as Error).message)
    }
  }

  // Heuristic fallback: accept the proof if an after photo was provided.
  return {
    resolved: !!afterBase64,
    confidence: afterBase64 ? 70 : 0,
    reason: afterBase64
      ? 'Proof image submitted; manual spot-check recommended (AI vision unavailable).'
      : 'No proof image provided.',
    source: 'heuristic',
  }
}

// ---------------------------------------------------------------
// AI CITY HEALTH — Gemini insight on the city's civic health score
// ---------------------------------------------------------------
export async function generateCityHealthInsight(
  apiKey: string | undefined,
  data: {
    score: number
    systems: { name: string; health: number }[]
    worst: string
    hotspot: string
    topCategory: string
    department: string
    predLow: number
    predHigh: number
    rainProb: number | null
  }
): Promise<{ text: string; source: 'gemini' | 'heuristic' }> {
  const cat = (data.topCategory || 'issue').toLowerCase()
  const where = data.hotspot && data.hotspot !== 'city-wide' ? data.hotspot : 'the city'
  const rainPhrase = data.rainProb != null && data.rainProb >= 40
    ? `rainfall forecast (${data.rainProb}% chance)`
    : 'rainfall forecast'
  if (apiKey) {
    try {
      const prompt = `You are a predictive city operations AI. The civic Health Score is ${data.score}/100.
Most open reports are "${data.topCategory}", concentrated around ${where}; the responsible department is ${data.department}.
Weather signal: ${data.rainProb != null ? `${data.rainProb}% rain probability` : 'no live rain data'}. Recent volume + historical pattern point to roughly ${data.predLow}-${data.predHigh} more ${cat} reports there this week.
Write ONE forecasting sentence (max 32 words) that STARTS with "Predicted:", names the area, gives the expected number range of upcoming ${cat} reports this week, cites rainfall forecast + historical pattern, and ends by recommending the city pre-assign ${data.department} now. Plain text only.`
      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5 },
        }),
      })
      if (res.ok) {
        const d: any = await res.json()
        const text = d?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { text: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('City health insight failed:', (e as Error).message)
    }
  }
  return {
    text: `Predicted: ${where} likely to see ${data.predLow}\u2013${data.predHigh} more ${cat} reports this week based on ${rainPhrase} + historical pattern. Pre-assign ${data.department} now.`,
    source: 'heuristic',
  }
}

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

      const res = await geminiFetch(apiKey, {
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
  const stop = new Set(['street', 'st', 'rd', 'road', 'ave', 'avenue', 'blvd', 'lane', 'ln', 'dr', 'drive', 'springfield', 'chandigarh', 'sector', 'market', 'near'])
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
      const res = await geminiFetch(apiKey, {
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
  `You are "TrustLens Assistant" for TrustLens AI, a civic issue platform. Citizens photo-report problems (pothole, water leak, streetlight, illegal dumping, graffiti); Gemini triages them, the community verifies (3 confirms → "Verified"), staff resolve. Report=+10 pts, verify=+5. Pages: Report, Map, Verify, Profile, My Reports. Stats now: ${ctx.total} reports, ${ctx.resolved} resolved, ${ctx.open} open. Be concise (2-3 sentences), warm, on-topic (civic app only). Plain text, no markdown.`

export async function chatReply(
  apiKey: string | undefined,
  messages: ChatMessage[],
  ctx: { total: number; resolved: number; open: number }
): Promise<{ reply: string; source: 'gemini' | 'heuristic' }> {
  const last = messages.length ? messages[messages.length - 1].content : ''

  if (apiKey) {
    try {
      const contents = messages.slice(-5).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM(ctx) }] },
          contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 220 },
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

// ---------------------------------------------------------------
// COMMAND CENTER narration — contractor recommendation + quotation reasoning
// All have deterministic fallbacks so they always return a sentence.
// ---------------------------------------------------------------

/** One-line "Suggested by Gemini" rationale for the top-ranked contractor. */
export async function recommendContractorReason(
  apiKey: string | undefined,
  issue: { category: string; address?: string },
  top: { name: string; rating: number; distance_km: number | null; match_score: number; skills: string[] }
): Promise<{ reason: string; source: 'gemini' | 'heuristic' }> {
  const dist = top.distance_km == null ? 'nearby' : `${top.distance_km} km away`
  const fallback = `Suggested by Gemini: ${top.name} — ${dist}, ${top.rating}★, ${
    top.skills.map((s) => s.toLowerCase()).includes((issue.category || '').toLowerCase()) ? 'specialises in ' + issue.category : 'available crew'
  } (match ${Math.round(top.match_score)}/100).`
  if (apiKey) {
    try {
      const prompt = `You are a municipal dispatch assistant. In ONE concise sentence (max 28 words, plain text, start with "Suggested by Gemini:"), justify assigning contractor "${top.name}" (${top.rating}/5 rating, ${dist}, skills: ${top.skills.join(', ')}) to a "${issue.category}" issue${issue.address ? ' at ' + issue.address : ''}.`
      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 80 } }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { reason: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('recommendContractorReason failed:', (e as Error).message)
    }
  }
  return { reason: fallback, source: 'heuristic' }
}

/** One-line rationale for why a quotation is the best value pick. */
export async function quotationReason(
  apiKey: string | undefined,
  best: { name: string; est_cost: number; est_days: number; past_rating: number; ai_value_score: number }
): Promise<{ reason: string; source: 'gemini' | 'heuristic' }> {
  const fallback = `Best value: ₹${best.est_cost.toLocaleString('en-IN')} over ${best.est_days} day(s) at ${best.past_rating}★ gives the highest quality-per-cost (value ${Math.round(best.ai_value_score)}/100).`
  if (apiKey) {
    try {
      const prompt = `You are a municipal procurement assistant. In ONE concise sentence (max 28 words, plain text), explain why contractor "${best.name}"'s quote of ₹${best.est_cost} over ${best.est_days} days at ${best.past_rating}/5 rating is the best value pick.`
      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 80 } }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { reason: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('quotationReason failed:', (e as Error).message)
    }
  }
  return { reason: fallback, source: 'heuristic' }
}

/** Gemini-written weekly operations report for the Commissioner. */
export async function generateWeeklyReport(
  apiKey: string | undefined,
  data: { total: number; resolved: number; open: number; critical: number; topCategory: string; hotspot: string; avgHours: number; topDept: string }
): Promise<{ report: string; source: 'gemini' | 'heuristic' }> {
  const rate = data.total ? Math.round((data.resolved / data.total) * 100) : 0
  const fallback = `This week the city handled ${data.total} reports with a ${rate}% resolution rate (${data.resolved} resolved, ${data.open} open, ${data.critical} critical). "${data.topCategory}" was the most common category, concentrated around ${data.hotspot}. Average resolution time is ~${data.avgHours}h; ${data.topDept} carried the heaviest load. Recommend pre-positioning crews near the hotspot and prioritising the ${data.critical} critical items.`
  if (apiKey) {
    try {
      const prompt = `You are a municipal AI analyst. Write a concise 4-5 sentence weekly operations report for a City Commissioner from this data: total reports ${data.total}, resolved ${data.resolved} (${rate}%), open ${data.open}, critical ${data.critical}, top category "${data.topCategory}", hotspot "${data.hotspot}", avg resolution ~${data.avgHours}h, busiest department "${data.topDept}". Include one clear recommendation. Plain text, no markdown headings.`
      const res = await geminiFetch(apiKey, {
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 320 } }),
      })
      if (res.ok) {
        const dataR: any = await res.json()
        const text = dataR?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return { report: text.trim(), source: 'gemini' }
      }
    } catch (e) {
      console.error('generateWeeklyReport failed:', (e as Error).message)
    }
  }
  return { report: fallback, source: 'heuristic' }
}
