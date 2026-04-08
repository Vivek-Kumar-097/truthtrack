// src/components/profile/ParliamentaryActivity.tsx

import { type Politician } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'
import { DataBar }       from './DataBar'

const norm = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100))

type Props = { mp: Politician }

export function ParliamentaryActivity({ mp }: Props) {
  if (mp.is_minister) {
    const role =
      mp.exempt_reason === 'Leader of Opposition' ? 'the Leader of Opposition'
      : mp.exempt_reason?.includes('Speaker')     ? 'the Speaker'
      : 'Cabinet Ministers'
    return (
      <section className="mb-10">
        <SectionHeader>Parliamentary Activity</SectionHeader>
        <div className="rounded-xl border border-white/10 bg-white/3 px-6 py-10 text-center">
          <p className="text-sm leading-relaxed text-zinc-300">
            Parliamentary activity data is not recorded for {role} by parliamentary convention.
          </p>
        </div>
      </section>
    )
  }

  const att = mp.attendance_pct ?? 0

  return (
    <section className="mb-10">
      <SectionHeader>Parliamentary Activity</SectionHeader>
      <DataBar
        label="Attendance"
        value={`${att}%`}
        pct={att}
        colorClass={att >= 80 ? 'text-emerald-400' : att >= 60 ? 'text-yellow-400' : 'text-red-400'}
        delay={0.3}
      />
      <DataBar
        label="Questions Asked"
        value={mp.questions_asked ?? 0}
        pct={norm(mp.questions_asked ?? 0, 300)}
        colorClass="text-blue-400"
        delay={0.4}
      />
      <DataBar
        label="Debates Participated"
        value={mp.debates_count ?? 0}
        pct={norm(mp.debates_count ?? 0, 100)}
        colorClass="text-violet-400"
        delay={0.5}
      />
      <DataBar
        label="Private Member Bills"
        value={mp.bills_introduced ?? 0}
        pct={norm(mp.bills_introduced ?? 0, 5)}
        colorClass="text-amber-400"
        delay={0.6}
      />
    </section>
  )
}
