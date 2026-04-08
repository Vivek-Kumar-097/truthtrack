// src/components/profile/CriminalRecord.tsx

import { type Politician, type CriminalCase } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'
import { PendingData }   from '@/components/shared/PendingData'

type Props = { mp: Politician }

export function CriminalRecord({ mp }: Props) {
  return (
    <section className="mb-10">
      <SectionHeader>Criminal Record</SectionHeader>

      {mp.criminal_cases === null ? (
        <PendingData day={4} />
      ) : mp.criminal_cases === 0 ? (
        <CleanRecord />
      ) : (
        <CasesFound count={mp.criminal_cases} details={mp.criminal_details} />
      )}
    </section>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CleanRecord() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-5">
      <span className="text-3xl">✅</span>
      <div>
        <p className="font-semibold text-emerald-400">No criminal cases</p>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">
          Source: Election Commission affidavit
        </p>
      </div>
    </div>
  )
}

function CasesFound({
  count,
  details,
}: {
  count: number
  details: CriminalCase[] | null
}) {
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-5">
      {/* Header row */}
      <div className="mb-4 flex items-center gap-4">
        <span className="text-3xl">⚠️</span>
        <div>
          <p className="font-semibold text-red-400">
            {count} pending case{count > 1 ? 's' : ''}
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">
            Source: Election Commission affidavit
          </p>
        </div>
      </div>

      {/* IPC sections — multiple sections can belong to the same FIR */}
      {details && details.length > 0 && (
        <>
          <p className="mb-3 font-mono text-xs text-zinc-600">
            {details.length} IPC section{details.length > 1 ? 's' : ''} across {count} FIR{count > 1 ? 's' : ''}
          </p>
          <div className="space-y-2 border-t border-red-500/15 pt-4">
            {details.map((c, i) => (
              <CaseRow key={i} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CaseRow({ c }: { c: CriminalCase }) {
  const section = c.section?.trim()
  const desc    = c.description?.trim()
  const isSeeCourt = !desc || desc.toLowerCase().startsWith('see ec')

  // Pure court note (no section) — render as italic status line
  if (!section && desc) {
    return (
      <div className="rounded-lg bg-red-500/5 px-3 py-2">
        <p className="font-mono text-xs italic text-zinc-500">{desc}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-red-500/5 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-2">
        <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs font-bold text-red-400">
          {section}
        </span>
        {!isSeeCourt && (
          <p className="text-xs leading-relaxed text-zinc-400">{desc}</p>
        )}
      </div>
      {/* Long court status notes shown below the badge */}
      {!isSeeCourt && desc && desc.length > 60 && (
        <p className="mt-1 font-mono text-xs italic text-zinc-600">{desc}</p>
      )}
    </div>
  )
}