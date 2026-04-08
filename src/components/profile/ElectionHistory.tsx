// src/components/profile/ElectionHistory.tsx
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { type Politician } from '@/lib/supabase'
import { SectionHeader } from './SectionHeader'

type ElectionEntry = {
  year:         number
  constituency: string
  state:        string
  party:        string
  votes:        number
  total_votes:  number
  vote_pct:     number
  rank:         number
  won:          boolean
  margin:       number | null
}

function fmtVotes(v: number): string {
  if (!v || v <= 0) return '—'
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)   return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ElectionEntry
  const hasVotes = d.votes > 0
  return (
    <div className="rounded-xl border border-white/15 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-lg min-w-[130px]">
      <p className="mb-1 font-mono text-xs font-bold text-white">{d.year}</p>
      {hasVotes
        ? <p className={`font-mono text-lg font-black ${d.won ? 'text-emerald-400' : 'text-red-400'}`}>{d.vote_pct}%</p>
        : <p className="font-mono text-xs text-zinc-500">Votes data pending</p>
      }
      {hasVotes && <p className="font-mono text-xs text-zinc-400">{fmtVotes(d.votes)} votes</p>}
      <p className={`mt-1 font-mono text-[10px] font-bold uppercase tracking-widest ${d.won ? 'text-emerald-500' : 'text-red-500'}`}>
        {d.won ? '✓ Won' : `✗ Lost · Rank #${d.rank}`}
      </p>
      {d.won && d.margin != null && d.margin > 0 && (
        <p className="font-mono text-[10px] text-zinc-500">Margin: {fmtVotes(d.margin)}</p>
      )}
    </div>
  )
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props
  const color    = payload.won ? '#22c55e' : '#ef4444'
  const hasVotes = payload.votes > 0
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.12} />
      {hasVotes
        ? <circle cx={cx} cy={cy} r={4} fill={color} />
        : <circle cx={cx} cy={cy} r={4} fill="none" stroke={color} strokeWidth={2} strokeDasharray="2 2" />
      }
    </g>
  )
}

function TimelineCard({ entry, index }: { entry: ElectionEntry; index: number }) {
  const isWin       = entry.won
  const hasVotes    = entry.votes > 0
  const isCurrent   = entry.year === 2024 && !hasVotes

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.3 }}
      className="relative flex gap-4 pb-6 last:pb-0"
    >
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black ${
          isWin
            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400'
            : 'border-red-500/60 bg-red-500/15 text-red-400'
        }`}>
          {isWin ? '✓' : '✗'}
        </div>
        <div className="mt-1 w-px flex-1 bg-white/8" />
      </div>

      {/* Content */}
      <div className="flex-1 pt-1.5 pb-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-black text-white">{entry.year}</span>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
            isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isWin ? 'Won' : `Lost · #${entry.rank}`}
          </span>
          <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
            {entry.party}
          </span>
          {isCurrent && (
            <span className="rounded-full border border-blue-500/20 bg-blue-500/8 px-2 py-0.5 font-mono text-[10px] text-blue-400">
              Current term
            </span>
          )}
        </div>

        <p className="mb-3 font-mono text-xs text-zinc-500">
          {entry.constituency}{entry.state ? ` · ${entry.state}` : ''}
        </p>

        {hasVotes && (
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Vote share"
              value={`${entry.vote_pct}%`}
              color={isWin ? 'text-emerald-400' : 'text-zinc-200'}
            />
            <Stat label="Votes" value={fmtVotes(entry.votes)} />
            <Stat
              label="Margin"
              value={isWin && entry.margin ? fmtVotes(entry.margin) : '—'}
              color={isWin && entry.margin ? 'text-blue-300' : 'text-zinc-500'}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function Stat({ label, value, color = 'text-zinc-200' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-2 text-center">
      <p className={`font-mono text-base font-black ${color}`}>{value}</p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  )
}

export function ElectionHistory({ mp }: { mp: Politician }) {
  const history = mp.election_history as ElectionEntry[] | null
  if (!history || history.length === 0) return null

  const sorted = useMemo(
    () => [...history].sort((a, b) => a.year - b.year),
    [history]
  )

  const wins        = sorted.filter(e => e.won).length
  const losses      = sorted.filter(e => !e.won).length
  const isFirstTimer = sorted.length === 1 && sorted[0].year === 2024

  // Chart only for entries with real vote data
  const chartData = sorted.filter(e => e.votes > 0)
  const hasChart  = chartData.length >= 2

  const yMin = hasChart ? Math.max(0,   Math.min(...chartData.map(e => e.vote_pct)) - 8) : 0
  const yMax = hasChart ? Math.min(100, Math.max(...chartData.map(e => e.vote_pct)) + 8) : 100

  return (
    <section className="mb-10">
      <SectionHeader>Election History</SectionHeader>

      {/* First-timer callout */}
      {isFirstTimer && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/8 p-4"
        >
          <span className="text-2xl">🆕</span>
          <div>
            <p className="font-semibold text-blue-300">First-term MP</p>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">
              Won the 2024 Lok Sabha election for the first time.
            </p>
          </div>
        </motion.div>
      )}

      {/* Summary badges */}
      {!isFirstTimer && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/4 p-4 text-center">
            <p className="font-mono text-2xl font-black text-white">{sorted.length}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400">Elections</p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-4 text-center">
            <p className="font-mono text-2xl font-black text-emerald-400">{wins}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-emerald-600">Wins</p>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-center">
            <p className="font-mono text-2xl font-black text-red-400">{losses}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-red-600">Losses</p>
          </div>
        </div>
      )}

      {/* Vote % trend chart */}
      {hasChart && (
        <div className="mb-8">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Vote share trend (%) · {chartData.map(d => d.year).join(', ')}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
              <XAxis
                dataKey="year"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="vote_pct"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={<CustomDot />}
                activeDot={{ r: 6, fill: '#60a5fa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Timeline */}
      <div>
        {sorted.map((entry, i) => (
          <TimelineCard
            key={`${entry.year}-${entry.constituency}`}
            entry={entry}
            index={i}
          />
        ))}
      </div>

      <p className="mt-2 font-mono text-xs text-zinc-600">
        Source: ECI · datameet (2004–2014). 2019 data not yet available.
      </p>
    </section>
  )
}