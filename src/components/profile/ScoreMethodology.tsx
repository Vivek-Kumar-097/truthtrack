// src/components/profile/ScoreMethodology.tsx

import { SectionHeader } from './SectionHeader'

const WEIGHTS = [
  { label: 'Attendance', weight: 40, cls: 'text-emerald-300', bar: 'bg-emerald-400' },
  { label: 'Questions',  weight: 30, cls: 'text-blue-300',    bar: 'bg-blue-400'    },
  { label: 'Debates',    weight: 20, cls: 'text-violet-300',  bar: 'bg-violet-400'  },
  { label: 'Bills',      weight: 10, cls: 'text-amber-300',   bar: 'bg-amber-400'   },
]

export function ScoreMethodology() {
  return (
    <section>
      <SectionHeader>How This Score Is Calculated</SectionHeader>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {WEIGHTS.map((r) => (
          <div
            key={r.label}
            className="rounded-xl border border-white/10 bg-white/4 px-4 py-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-zinc-300">{r.label}</span>
              <span className={`font-mono text-lg font-black ${r.cls}`}>{r.weight}%</span>
            </div>
            {/* Mini bar */}
            <div className="h-0.5 rounded-full bg-white/8">
              <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${r.weight * 2.5}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono text-xs leading-relaxed text-zinc-400">
        Data: PRS India · 18th Lok Sabha · Jun–Dec 2024.{' '}
        Ministers / LoP / Speaker ungraded by parliamentary convention.{' '}
        Criminal &amp; financial data from MyNeta / EC (Day 4).
      </p>
    </section>
  )
}
