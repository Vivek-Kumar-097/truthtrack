// src/components/profile/AssetGrowth.tsx
'use client'

import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { type Politician, formatRupees, assetGrowthPct } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'
import { PendingData }   from '@/components/shared/PendingData'

type Props = { mp: Politician }

export function AssetGrowth({ mp }: Props) {
  return (
    <section className="mb-10">
      <SectionHeader>Financial Disclosure</SectionHeader>
      {mp.assets_2024 === null ? (
        <PendingData day={4} />
      ) : (
        <AssetDetails mp={mp} />
      )}
    </section>
  )
}

function AssetDetails({ mp }: { mp: Politician }) {
  const has2019     = mp.assets_2019 !== null && mp.assets_2019 > 0
  const growth      = has2019 ? assetGrowthPct(mp) : null
  const isExplosive = (growth ?? 0) > 200

  const chartData = has2019
    ? [
        { year: '2019', value: mp.assets_2019 ?? 0 },
        { year: '2024', value: mp.assets_2024 ?? 0 },
      ]
    : null

  return (
    <div className="space-y-5">

      {growth !== null && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-4 rounded-xl border p-5 ${
            isExplosive
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-emerald-500/30 bg-emerald-500/10'
          }`}
        >
          <span className="text-3xl">{isExplosive ? '🚨' : '📈'}</span>
          <div>
            <p className={`text-2xl font-black ${isExplosive ? 'text-red-300' : 'text-emerald-300'}`}>
              {growth > 0 ? '+' : ''}{growth}%
            </p>
            <p className="text-sm font-medium text-zinc-300">
              Asset growth between 2019 and 2024 elections
            </p>
          </div>
        </motion.div>
      )}

      {chartData && (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis
              dataKey="year"
              tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                fontSize: 12,
                color: '#fff',
              }}
              formatter={(v: number) => [formatRupees(v), 'Total Assets']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <Cell fill="#3b82f6" />
              <Cell fill={isExplosive ? '#ef4444' : '#22c55e'} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className={`grid gap-3 ${has2019 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {has2019 && (
          <StatBox label="Assets 2019" value={formatRupees(mp.assets_2019)} color="text-blue-300" />
        )}
        <StatBox
          label="Assets 2024"
          value={formatRupees(mp.assets_2024)}
          color={isExplosive ? 'text-red-300' : 'text-emerald-300'}
        />
        <StatBox label="Liabilities" value={formatRupees(mp.liabilities)} color="text-zinc-200" />
      </div>

      <p className="font-mono text-xs font-medium text-zinc-500">
        Source: Election Commission affidavit via MyNeta.info
      </p>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-center">
      <p className={`font-mono text-lg font-black ${color}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
    </div>
  )
}
