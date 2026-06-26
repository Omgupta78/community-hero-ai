// Citizen reputation tiers — gamification for community engagement.
// A citizen's "Community Score" maps to a Hero tier with a progress path,
// turning verified civic contribution into a visible, motivating journey.

export type Tier = {
  name: string
  level: number
  icon: string // Material Symbols name
  color: string // tailwind text color class
  floor: number
  next: number | null // score needed for the next tier (null = max)
  progress: number // 0..1 toward the next tier
}

const TIERS = [
  { name: 'Newcomer', level: 1, icon: 'eco', color: 'text-on-surface-variant', floor: 0 },
  { name: 'Bronze Hero', level: 2, icon: 'military_tech', color: 'text-tertiary-container', floor: 50 },
  { name: 'Silver Hero', level: 3, icon: 'military_tech', color: 'text-outline', floor: 150 },
  { name: 'Gold Hero', level: 4, icon: 'workspace_premium', color: 'text-tertiary', floor: 350 },
  { name: 'Platinum Hero', level: 5, icon: 'diamond', color: 'text-primary', floor: 750 },
]

export function tierFor(score: number): Tier {
  const s = Math.max(0, Math.floor(score || 0))
  let idx = 0
  for (let i = 0; i < TIERS.length; i++) if (s >= TIERS[i].floor) idx = i
  const cur = TIERS[idx]
  const nxt = TIERS[idx + 1] || null
  const next = nxt ? nxt.floor : null
  const span = nxt ? nxt.floor - cur.floor : 1
  const progress = nxt ? Math.min(1, (s - cur.floor) / span) : 1
  return { name: cur.name, level: cur.level, icon: cur.icon, color: cur.color, floor: cur.floor, next, progress }
}
