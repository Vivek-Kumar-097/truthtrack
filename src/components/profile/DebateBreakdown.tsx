// src/components/profile/DebateBreakdown.tsx

import { type Politician } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'

const DEBATE_LABELS: [string, string][] = [
  ['Ls - Matters Under (Rule-377',             'Rule 377 Matters'  ],
  ['Government Bills',                          'Govt Bills'        ],
  ['Budget (General',                           'Budget Discussion' ],
  ['Special Mention',                           'Special Mention'   ],
  ['Ls - Short Duration Discussions (Rule-193', 'Short Duration'    ],
  ["Motion Of Thanks On The President",         'Presidential Addr.'],
  ['Submissions By Members',                    'Member Submissions'],
  ["Private Members' Resolutions",              'Pvt Resolutions'   ],
  ['Ls - Calling Attention (Rule-197',          'Calling Attention' ],
  ["Private Members' Bills",                    'Pvt Bills'         ],
  ['Ls - Starred Questions',                    'Starred Questions' ],
  ['Ls - Unstarred Questions',                  'Unstarred Qs'      ],
  ['Discussion Under Rule',                     'Rule Discussion'   ],
  ['No Confidence Motion',                      'No Confidence'     ],
  ['Adjournment Motion',                        'Adjournment Motion'],
]

function getLabel(raw: string): string {
  const upper = raw.trim()
  for (const [prefix, label] of DEBATE_LABELS) {
    if (upper.toLowerCase().startsWith(prefix.toLowerCase())) return label
  }
  return upper.replace(/\s*\(.*$/, '').trim()
}

type Props = { mp: Politician }

export function DebateBreakdown({ mp }: Props) {
  if (!mp.debates_by_type) return null

  const items = Object.entries(mp.debates_by_type)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: getLabel(k), count: v }))
    .sort((a, b) => b.count - a.count)

  if (items.length === 0) return null

  return (
    <section className="mb-10">
      <SectionHeader>Debate Participation — Types</SectionHeader>
      <p className="mb-6 text-sm font-medium leading-relaxed text-zinc-300">
        Breakdown of {mp.debates_count} debate contributions by parliamentary procedure type.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ label, count }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/4 p-4">
            <p className="font-mono text-2xl font-black text-violet-300">{count}</p>
            <p className="mt-1 font-mono text-xs font-semibold text-zinc-300">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
