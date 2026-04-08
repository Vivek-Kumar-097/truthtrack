// src/lib/gradeConfig.ts
// Shared grade colours/labels used by ScoreArc, profile page, search results

type GKey = 'A' | 'B' | 'C' | 'D' | 'F'

export type GradeConfig = {
  text:    string   // Tailwind text class
  border:  string   // Tailwind border class
  bg:      string   // Tailwind bg class
  glow:    string   // hex colour for SVG / box-shadow
  label:   string   // "Excellent", "Good", etc.
  verdict: string   // one-line verdict
  emoji:   string
}

const GRADES: Record<GKey, GradeConfig> = {
  A: {
    text:    'text-emerald-400',
    border:  'border-emerald-500/30',
    bg:      'bg-emerald-500/8',
    glow:    '#22c55e',
    label:   'Excellent',
    verdict: 'Among the top performers in the 18th Lok Sabha.',
    emoji:   '🏆',
  },
  B: {
    text:    'text-blue-400',
    border:  'border-blue-500/30',
    bg:      'bg-blue-500/8',
    glow:    '#3b82f6',
    label:   'Good',
    verdict: 'Above-average parliamentary participation.',
    emoji:   '✅',
  },
  C: {
    text:    'text-yellow-400',
    border:  'border-yellow-500/30',
    bg:      'bg-yellow-500/8',
    glow:    '#eab308',
    label:   'Average',
    verdict: 'Meets the median — room to improve.',
    emoji:   '📊',
  },
  D: {
    text:    'text-orange-400',
    border:  'border-orange-500/30',
    bg:      'bg-orange-500/8',
    glow:    '#f97316',
    label:   'Poor',
    verdict: 'Significantly below the parliamentary average.',
    emoji:   '📉',
  },
  F: {
    text:    'text-red-400',
    border:  'border-red-500/30',
    bg:      'bg-red-500/8',
    glow:    '#ef4444',
    label:   'Failing',
    verdict: 'Critical lack of parliamentary engagement.',
    emoji:   '🚨',
  },
}

export function gcfg(grade: string | null): GradeConfig {
  return GRADES[(grade ?? 'F') as GKey] ?? GRADES.F
}