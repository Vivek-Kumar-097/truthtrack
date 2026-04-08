// src/components/shared/ExemptCard.tsx
'use client'

import { motion } from 'framer-motion'

type Props = { reason: string | null }

const CONFIG: Record<string, { emoji: string; description: string }> = {
  'Cabinet Minister': {
    emoji: '🏛️',
    description:
      'Cabinet Ministers represent the government and are exempt from standard participation metrics by parliamentary convention.',
  },
  'Leader of Opposition': {
    emoji: '⚔️',
    description:
      'The LoP leads the opposition and does not sign the attendance register by parliamentary convention.',
  },
  Speaker: {
    emoji: '🔨',
    description:
      'The Speaker presides over the house and is not graded on participation metrics.',
  },
  'Pro-tem Speaker': {
    emoji: '🔨',
    description:
      'The Pro-tem Speaker presides over the house during the transition period.',
  },
}

export function ExemptCard({ reason }: Props) {
  const key    = reason ?? 'Cabinet Minister'
  const config = CONFIG[key] ?? CONFIG['Cabinet Minister']

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-6 rounded-2xl border border-white/8 bg-white/3 p-6 text-center"
    >
      <div className="mb-3 text-3xl">{config.emoji}</div>
      <p className="mb-2 text-base font-semibold text-white">{key}</p>
      <p className="text-sm leading-relaxed text-zinc-400">{config.description}</p>
    </motion.div>
  )
}