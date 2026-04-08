// src/components/profile/PerformanceRadar.tsx
'use client'

import { useMemo } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { type Politician } from '@/lib/supabase'
import { gcfg } from '@/lib/gradeConfig'
import { SectionHeader } from './SectionHeader'

const norm = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100))

type Props = { mp: Politician }

export function PerformanceRadar({ mp }: Props) {
  if (mp.is_minister) return null

  const cfg = gcfg(mp.performance_grade)

  const data = useMemo(() => [
    { axis: 'Attendance', value: mp.attendance_pct ?? 0 },
    { axis: 'Questions',  value: norm(mp.questions_asked  ?? 0, 300) },
    { axis: 'Debates',    value: norm(mp.debates_count    ?? 0, 100) },
    { axis: 'Bills',      value: norm(mp.bills_introduced ?? 0, 5)   },
  ], [mp])

  return (
    <section className="mb-10">
      <SectionHeader>Performance Radar</SectionHeader>
      <p className="mb-4 text-sm text-zinc-300">
        Four axes normalised to 0–100. A balanced shape means well-rounded participation.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.12)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'monospace' }}
          />
          <Radar
            dataKey="value"
            stroke={cfg.glow}
            fill={cfg.glow}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: `1px solid ${cfg.glow}40`,
              borderRadius: 10,
              fontSize: 12,
              color: '#fff',
            }}
            formatter={(v: number) => [`${Math.round(v)}`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </section>
  )
}
