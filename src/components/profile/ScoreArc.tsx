// src/components/profile/ScoreArc.tsx
'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { gcfg } from '@/lib/gradeConfig'

type Props = { score: number; grade: string }

export function ScoreArc({ score, grade }: Props) {
  const cfg = gcfg(grade)
  const nmo = useReducedMotion()
  const S = 260, cx = S / 2, cy = S * 0.54, R = S * 0.37
  const START = 200, SWEEP = 220

  const pt = (deg: number, r: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  })
  const arc = (a1: number, a2: number, r: number) => {
    const s = pt(a1, r), e = pt(a2, r)
    return `M${s.x},${s.y} A${r},${r} 0 ${a2 - a1 > 180 ? 1 : 0},1 ${e.x},${e.y}`
  }
  const fillEnd = START + (score / 100) * SWEEP

  return (
    <svg
      width={S}
      height={S * 0.72}
      viewBox={`0 0 ${S} ${S * 0.72}`}
      aria-label={`Score ${score} out of 100`}
    >
      <defs>
        <filter id={`glow-${grade}`}>
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Track */}
      <path
        d={arc(START, START + SWEEP, R)}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map((v) => {
        const a = START + (v / 100) * SWEEP
        const i = pt(a, R - 9), o = pt(a, R + 9), l = pt(a, R + 21)
        return (
          <g key={v}>
            <line x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
            <text x={l.x} y={l.y + 4} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="monospace">
              {v}
            </text>
          </g>
        )
      })}

      {/* Filled arc — animated */}
      <motion.path
        d={arc(START, fillEnd, R)}
        fill="none"
        stroke={cfg.glow}
        strokeWidth="14"
        strokeLinecap="round"
        filter={`url(#glow-${grade})`}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: nmo ? 0 : 1.4, ease: [0.34, 1.06, 0.64, 1], delay: 0.3 }}
      />

      {/* Tip dot */}
      {score > 3 &&
        (() => {
          const e = pt(fillEnd, R)
          return (
            <motion.circle
              cx={e.x} cy={e.y} r="6"
              fill={cfg.glow}
              filter={`url(#glow-${grade})`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.6 }}
            />
          )
        })()}

      {/* Score number */}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={S * 0.21} fontWeight="800" fill="white" fontFamily="serif" letterSpacing="-3">
        {score}
      </text>
      <text x={cx} y={cy + S * 0.09} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="monospace" letterSpacing="4">
        / 100
      </text>
    </svg>
  )
}
