// Deterministic contractor-recommendation (RADAR ranking) + quotation value scoring.
// Pure functions: testable, work with no API key. Gemini only adds optional narration.

import { haversineMeters } from './geo'

export interface ContractorRow {
  user_id: number
  name: string
  company?: string | null
  rating: number // 0.0 - 5.0
  active_tasks: number
  jobs_completed?: number
  availability: 'available' | 'busy' | 'offline'
  skills: string[]
  lat: number | null
  lng: number | null
  photo_url?: string | null
}

export interface RankedContractor extends ContractorRow {
  distance_km: number | null
  match_score: number // 0..100, deterministic
}

/**
 * Rank contractors for an issue. Higher match_score is better.
 * Postconditions: sorted by match_score desc; offline contractors excluded;
 *                 distance_km is null iff either endpoint lacks coordinates.
 */
export function rankContractors(
  issue: { category: string; lat: number | null; lng: number | null },
  contractors: ContractorRow[]
): RankedContractor[] {
  const MAX_DIST_KM = 25
  return contractors
    .filter((c) => c.availability !== 'offline')
    .map((c) => {
      const distM =
        issue.lat != null && issue.lng != null && c.lat != null && c.lng != null
          ? haversineMeters(issue.lat, issue.lng, c.lat, c.lng)
          : null
      const distKm = distM == null ? null : distM / 1000

      const skill = c.skills.map((s) => s.toLowerCase()).includes((issue.category || '').toLowerCase()) ? 1 : 0.3
      const prox = distKm == null ? 0.6 : Math.max(0, 1 - distKm / MAX_DIST_KM)
      const quality = Math.min(1, c.rating / 5)
      const load = c.availability === 'available' ? Math.max(0, 1 - c.active_tasks / 8) : 0.2

      // Weights: skill 0.35, proximity 0.25, quality 0.25, availability/load 0.15
      const match = 100 * (0.35 * skill + 0.25 * prox + 0.25 * quality + 0.15 * load)
      return {
        ...c,
        distance_km: distKm == null ? null : Math.round(distKm * 10) / 10,
        match_score: Math.round(match * 10) / 10,
      }
    })
    .sort((a, b) => b.match_score - a.match_score)
}

export interface Quote {
  contractor_id: number
  name: string
  est_cost: number
  est_days: number
  past_rating: number
}

export interface ScoredQuote extends Quote {
  ai_value_score: number // 0..100
  recommended: boolean
}

/**
 * Value = quality per unit cost per unit time, normalized across the set to 0..100.
 * Postconditions: exactly one quote recommended (max score; ties → lowest cost);
 *                 every score in [0,100].
 */
export function scoreQuotations(quotes: Quote[]): { scored: ScoredQuote[]; bestId: number } {
  if (!quotes.length) return { scored: [], bestId: -1 }

  const raw = quotes.map((q) => {
    const quality = Math.max(0, Math.min(5, q.past_rating)) / 5
    const costTerm = 1 / Math.log10(Math.max(1, q.est_cost) + 10)
    const timeTerm = 1 / Math.log10(Math.max(0.1, q.est_days) * 10 + 10)
    return quality * (0.6 * costTerm + 0.4 * timeTerm)
  })
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  const norm = (v: number) => (max === min ? 100 : Math.round(((v - min) / (max - min)) * 100 * 10) / 10)

  const scored: ScoredQuote[] = quotes.map((q, i) => ({ ...q, ai_value_score: norm(raw[i]), recommended: false }))
  let best = 0
  for (let i = 1; i < scored.length; i++) {
    if (
      scored[i].ai_value_score > scored[best].ai_value_score ||
      (scored[i].ai_value_score === scored[best].ai_value_score && scored[i].est_cost < scored[best].est_cost)
    )
      best = i
  }
  scored[best].recommended = true
  return { scored, bestId: scored[best].contractor_id }
}

/** Parse a CSV skills string into an array. */
export function parseSkills(s?: string | null): string[] {
  if (!s) return []
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}
