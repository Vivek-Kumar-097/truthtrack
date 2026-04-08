// src/components/profile/MinistryFocus.tsx
'use client'

import { motion } from 'framer-motion'
import { type Politician, topMinistries } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'

const COLORS = [
  '#3b82f6','#8b5cf6','#06b6d4','#10b981',
  '#f59e0b','#ef4444','#ec4899','#84cc16',
]

function shorten(name: string): string {
  return name
    .replace(' And Family Welfare', '')
    .replace(' And Highways', '')
    .replace(' And Farmers Welfare', '')
    .replace(' And Urban Affairs', '')
    .replace(' And Child Development', '')
    .replace('Petroleum And Natural Gas', 'Oil & Gas')
    .replace(' Affairs', '')
    .trim()
}

type Props = { mp: Politician }

export function MinistryFocus({ mp }: Props) {
  const top = topMinistries(mp, 8)
  if (!mp.questions_by_ministry || top.length === 0) return null

  const maxVal = Math.max(...top.map((t) => t.count))

  return (
    <section className="mb-10">
      <SectionHeader>Ministry Focus — Questions Asked</SectionHeader>
      <p className="mb-6 text-sm font-medium leading-relaxed text-zinc-300">
        Which ministries this MP holds most accountable.
        Top {top.length} out of 56 ministry departments.
      </p>

      <div className="w-full space-y-4">
        {top.map(({ ministry, count }, i) => (
          <div key={ministry}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="truncate pr-4 font-mono text-xs font-semibold text-zinc-200">
                {shorten(ministry)}
              </span>
              <span className="shrink-0 font-mono text-sm font-black text-white">
                {count}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full"
                style={{ background: COLORS[i % COLORS.length], originX: 0 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: count / maxVal }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.08 * i }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
