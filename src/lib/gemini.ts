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

export { CATEGORIES, DEPARTMENTS, computePriority }
