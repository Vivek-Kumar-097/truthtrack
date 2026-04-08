// src/components/profile/DataBar.tsx
'use client'

import { motion } from 'framer-motion'

type Props = {
  label:      string
  value:      string | number
  pct:        number
  colorClass: string
  delay?:     number
}

export function DataBar({ label, value, pct, colorClass, delay = 0 }: Props) {
  return (
    <div className="border-b border-white/8 py-4 last:border-0">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-300">
          {label}
        </span>
        <span className={`font-mono text-2xl font-bold ${colorClass}`}>{value}</span>
      </div>
      {/* Track */}
      <div className="h-1 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full ${colorClass.replace('text-', 'bg-')}`}
          style={{ originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 1, ease: 'easeOut', delay }}
        />
      </div>
      {/* Pct label */}
      <p className="mt-1.5 text-right font-mono text-[10px] text-zinc-500">{pct}%</p>
    </div>
  )
}
