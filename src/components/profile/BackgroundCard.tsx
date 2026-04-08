// src/components/profile/BackgroundCard.tsx

import { type Politician } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'

type Props = { mp: Politician }

export function BackgroundCard({ mp }: Props) {
  const fields = [
    mp.age          && { k: 'Age',         v: `${mp.age} yrs`   },
    mp.gender       && { k: 'Gender',       v: mp.gender         },
    mp.education    && { k: 'Education',    v: mp.education      },
    mp.terms_served && { k: 'Terms',        v: mp.terms_served   },
    mp.term_start   && { k: 'Took Office',  v: mp.term_start     },
    mp.is_minister  && { k: 'Party',        v: mp.party          },
                       { k: 'House',        v: mp.house          },
                       { k: 'Constituency', v: mp.constituency   },
                       { k: 'State',        v: mp.state          },
  ].filter(Boolean) as { k: string; v: string }[]

  return (
    <section className="mb-10">
      <SectionHeader>Background</SectionHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map((item) => (
          <div key={item.k} className="rounded-xl border border-white/10 bg-white/4 p-4">
            <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {item.k}
            </p>
            <p className="text-sm font-bold text-white">{item.v}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
