// src/lib/supabase.ts
// Day 4: added ElectionEntry + election_history to Politician

import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Ministry questions breakdown ─────────────────────────────────────────────
export type QuestionsByMinistry = Record<string, number>

// ─── Debate type breakdown ────────────────────────────────────────────────────
export type DebatesByType = Record<string, number>

// ─── Criminal case detail ─────────────────────────────────────────────────────
export type CriminalCase = {
  section:     string
  description: string
  year:        number | null
}

// ─── Election history (Day 4) ─────────────────────────────────────────────────
export type ElectionEntry = {
  year:         number
  constituency: string
  state:        string
  party:        string
  votes:        number
  total_votes:  number
  vote_pct:     number   // 0–100, 2dp
  rank:         number   // 1 = winner
  won:          boolean
  margin:       number | null
}

// ─── Main politician type ─────────────────────────────────────────────────────
export type Politician = {
  id:                   string
  name:                 string
  slug:                 string
  photo_url:            string | null
  party:                string
  state:                string
  constituency:         string
  house:                string
  lok_sabha_number:     number

  // Role flags
  is_minister:          boolean
  exempt_reason:        string | null

  // Parliamentary performance
  attendance_pct:       number | null
  questions_asked:      number | null
  debates_count:        number | null
  bills_introduced:     number | null

  // Breakdown data
  questions_by_ministry: QuestionsByMinistry | null
  debates_by_type:       DebatesByType | null

  // Scoring
  overall_score:        number | null
  performance_grade:    string | null

  // Background
  age:                  number | null
  gender:               string | null
  education:            string | null
  terms_served:         string | null
  term_start:           string | null

  // Criminal & financial (Day 3)
  criminal_cases:       number | null
  criminal_details:     CriminalCase[] | null
  assets_2019:          number | null
  assets_2024:          number | null
  liabilities:          number | null

  // Election history (Day 4) ← NEW
  election_history:     ElectionEntry[] | null

  // Meta
  overall_score_percentile: number | null
  search_count:         number
  is_active:            boolean
  created_at:           string
}

export type Search = {
  id:            string
  politician_id: string
  searched_at:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function assetGrowthPct(mp: Politician): number | null {
  if (!mp.assets_2019 || !mp.assets_2024 || mp.assets_2019 === 0) return null
  return Math.round(((mp.assets_2024 - mp.assets_2019) / mp.assets_2019) * 100)
}

export function formatRupees(amount: number | null): string {
  if (amount === null) return '—'
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)} Cr`
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(1)} L`
  return `₹${amount.toLocaleString('en-IN')}`
}

export function topMinistries(mp: Politician, n = 5): { ministry: string; count: number }[] {
  if (!mp.questions_by_ministry) return []
  return Object.entries(mp.questions_by_ministry)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([ministry, count]) => ({ ministry, count }))
}

// ─── Election history helpers (Day 4) ─────────────────────────────────────────

export function electionWins(mp: Politician): number {
  return mp.election_history?.filter(e => e.won).length ?? 0
}

export function electionLosses(mp: Politician): number {
  return mp.election_history?.filter(e => !e.won).length ?? 0
}

export function latestElection(mp: Politician): ElectionEntry | null {
  if (!mp.election_history?.length) return null
  return [...mp.election_history].sort((a, b) => b.year - a.year)[0]
}