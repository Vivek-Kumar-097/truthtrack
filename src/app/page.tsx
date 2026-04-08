'use client'

import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Politician } from '@/lib/supabase'

type SearchResult = Pick<Politician,
  'id' | 'name' | 'slug' | 'party' | 'state' | 'constituency' |
  'overall_score' | 'performance_grade' | 'is_minister'
>
type State = { query: string; results: SearchResult[]; loading: boolean; totalMPs: number }
type Action =
  | { type: 'QUERY';   payload: string }
  | { type: 'RESULTS'; payload: SearchResult[] }
  | { type: 'TOTAL';   payload: number }
  | { type: 'CLEAR' }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'QUERY':   return { ...s, query: a.payload, loading: a.payload.length >= 2 }
    case 'RESULTS': return { ...s, results: a.payload, loading: false }
    case 'TOTAL':   return { ...s, totalMPs: a.payload }
    case 'CLEAR':   return { ...s, results: [], loading: false }
    default:        return s
  }
}

const QUICK = [
  { name: 'Rahul Gandhi',   slug: 'rahul-gandhi'    },
  { name: 'Shashi Tharoor', slug: 'shashi-tharoor'  },
  { name: 'A. Owaisi',      slug: 'asaduddin-owaisi' },
  { name: 'Supriya Sule',   slug: 'supriya-sule'     },
  { name: 'Dimple Yadav',   slug: 'dimple-yadav'     },
  { name: 'Kangana Ranaut', slug: 'kangana-ranaut'   },
]

const GRADE_TEXT: Record<string, string> = {
  A: 'text-emerald-400', B: 'text-blue-400',
  C: 'text-yellow-400',  D: 'text-orange-400', F: 'text-red-400',
}

const GRADE_BG: Record<string, string> = {
  A: 'bg-emerald-400/10 border-emerald-400/30',
  B: 'bg-blue-400/10 border-blue-400/30',
  C: 'bg-yellow-400/10 border-yellow-400/30',
  D: 'bg-orange-400/10 border-orange-400/30',
  F: 'bg-red-400/10 border-red-400/30',
}

export default function HomePage() {
  const [state, dispatch] = useReducer(reducer, { query: '', results: [], loading: false, totalMPs: 0 })
  const router      = useRouter()
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('politicians').select('*', { count: 'exact', head: true })
      .then(({ count }) => dispatch({ type: 'TOTAL', payload: count ?? 0 }))
  }, [])

  const handleSearch = useCallback((value: string) => {
    dispatch({ type: 'QUERY', payload: value })
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.length < 2) { dispatch({ type: 'CLEAR' }); return }
    timerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('politicians')
        .select('id,name,slug,party,state,constituency,overall_score,performance_grade,is_minister')
        .ilike('name', `%${value}%`)
        .order('search_count', { ascending: false })
        .limit(8)
      dispatch({ type: 'RESULTS', payload: data ?? [] })
    }, 300)
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const { query, results, loading, totalMPs } = state

  return (
    <main className="relative min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Multi-layer ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(234,179,8,0.12),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_80%_80%,rgba(99,102,241,0.06),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_20%_90%,rgba(234,179,8,0.04),transparent_60%)]" />
      </div>

      {/* Subtle grid pattern */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px'}} />

      <div className="relative z-10 mx-auto max-w-xl px-5 pb-24 pt-16">

        {/* Hero */}
        <div className="mb-12 text-center">
          {/* Icon with glow */}
          <div className="mb-6 relative inline-block">
            <div className="absolute inset-0 blur-2xl bg-yellow-400/20 rounded-full scale-150" />
            <div className="relative text-6xl">🏛️</div>
          </div>

          <h1 className="mb-3 text-5xl font-bold tracking-tight text-white">
            Truth<span className="text-yellow-400">Track</span>
          </h1>
          <p className="mb-2 text-base text-zinc-300 font-medium">
            India's MP accountability dashboard
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"/>
            </span>
            <span className="font-mono text-xs text-zinc-300 uppercase tracking-widest">
              {totalMPs || '—'} MPs · Live Data · No Spin
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-yellow-400/20 via-yellow-400/5 to-yellow-400/20 blur-sm" />
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search any MP by name…"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-zinc-600 bg-zinc-900/90 px-5 py-4 text-base text-white placeholder-zinc-400 outline-none transition focus:border-yellow-400/50 focus:bg-zinc-900 focus:shadow-[0_0_0_3px_rgba(234,179,8,0.1)]"
            />
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              {loading
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-yellow-400" />
                : <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
              }
            </div>
          </div>

          {/* Dropdown */}
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-zinc-600 bg-zinc-900/95 shadow-2xl backdrop-blur-xl">
              {results.map(mp => (
                <button
                  key={mp.id}
                  onClick={() => router.push(`/mp/${mp.slug}`)}
                  className="flex w-full items-center gap-4 border-b border-zinc-800 px-5 py-3.5 text-left transition last:border-0 hover:bg-zinc-800/80"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-700 text-sm font-bold text-zinc-200">
                    {mp.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{mp.name}</p>
                    <p className="truncate font-mono text-xs text-zinc-400">
                      {mp.party} · {mp.constituency}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {mp.is_minister
                      ? <span className="rounded-md border border-zinc-600 bg-zinc-700/80 px-2 py-0.5 font-mono text-xs text-zinc-300">MINISTER</span>
                      : <div className={`rounded-lg border px-2.5 py-1 text-center ${GRADE_BG[mp.performance_grade ?? 'F']}`}>
                          <p className={`font-mono text-lg font-bold leading-none ${GRADE_TEXT[mp.performance_grade ?? 'F']}`}>
                            {mp.performance_grade}
                          </p>
                          <p className={`font-mono text-xs ${GRADE_TEXT[mp.performance_grade ?? 'F']} opacity-70`}>{mp.overall_score}/100</p>
                        </div>
                    }
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick chips */}
        <div className="mb-12 flex flex-wrap justify-center gap-2">
          <p className="w-full text-center font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">Quick Search</p>
          {QUICK.map(({ name, slug }) => (
            <button
              key={slug}
              onClick={() => router.push(`/mp/${slug}`)}
              className="rounded-full border border-zinc-600 bg-zinc-800/80 px-4 py-1.5 text-sm text-zinc-300 transition hover:border-yellow-400/50 hover:text-yellow-400 hover:bg-zinc-800"
            >
              {name}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'MPs tracked', value: String(totalMPs || '—'), icon: '👥', color: 'text-yellow-400' },
            { label: 'Data source',  value: 'PRS India',             icon: '📊', color: 'text-blue-400'   },
            { label: 'Parliament',   value: '18th LS',               icon: '🏛️', color: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 p-4 text-center backdrop-blur-sm hover:border-zinc-600 transition">
              <p className="mb-1 text-xl">{s.icon}</p>
              <p className={`font-mono text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-1 font-mono text-xs uppercase tracking-wider text-zinc-400">{s.label}</p>
            </div>
          ))}
        </div>

        <button
  onClick={() => router.push('/map')}
  className="group mb-8 w-full rounded-2xl border border-yellow-400/25 bg-yellow-400/5 px-5 py-4 text-left transition hover:border-yellow-400/50 hover:bg-yellow-400/10"
>
  <div className="flex items-center justify-between">
    <div>
      {/* <p className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-yellow-400/70">
        <span>🗺️</span> New — Day 5
      </p> */}
      <p className="text-base font-bold text-white">India Constituency Map</p>
      <p className="mt-0.5 text-sm text-zinc-400">
        Click any of India's 543 seats → see your MP's report card
      </p>
    </div>
    <svg
      className="h-5 w-5 shrink-0 text-yellow-400 transition group-hover:translate-x-1"
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
    >
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  </div>
</button>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {['📋 Attendance', '❓ Questions Asked', '🗣️ Debate Activity', '💰 Asset Growth', '⚖️ Criminal Record'].map(f => (
            <span key={f} className="rounded-full border border-zinc-700 bg-zinc-900/50 px-3 py-1 font-mono text-xs text-zinc-400">
              {f}
            </span>
          ))}
        </div>

        <p className="text-center font-mono text-xs leading-relaxed text-zinc-500">
          Cabinet Ministers ungraded by parliamentary convention.<br />
          Criminal records sourced from MyNeta / Election Commission.
        </p>
      </div>
    </main>
  )
}