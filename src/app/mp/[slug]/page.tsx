'use client'

// src/app/mp/[slug]/page.tsx
// Intentionally thin — all UI lives in src/components/profile/

import { useReducer, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase, type Politician } from '@/lib/supabase'
import { gcfg } from '@/lib/gradeConfig'
import { ScoreArc }              from '@/components/profile/ScoreArc'
import { ParliamentaryActivity } from '@/components/profile/ParliamentaryActivity'
import { MinistryFocus }         from '@/components/profile/MinistryFocus'
import { DebateBreakdown }       from '@/components/profile/DebateBreakdown'
import { PerformanceRadar }      from '@/components/profile/PerformanceRadar'
import { CriminalRecord }        from '@/components/profile/CriminalRecord'
import { AssetGrowth }           from '@/components/profile/AssetGrowth'
import { BackgroundCard }        from '@/components/profile/BackgroundCard'
import { ScoreMethodology }      from '@/components/profile/ScoreMethodology'
import { ExemptCard }            from '@/components/shared/ExemptCard'
import { ElectionHistory } from '@/components/profile/ElectionHistory'


// ─── State ────────────────────────────────────────────────────────────────────
type State = { slug: string; mp: Politician | null; loading: boolean; error: string; views: number; copied: boolean }
type Action =
  | { type: 'SLUG';       payload: string }
  | { type: 'MP';         payload: Politician }
  | { type: 'ERROR';      payload: string }
  | { type: 'VIEWS';      payload: number }
  | { type: 'INC_VIEWS' }
  | { type: 'COPIED' }
  | { type: 'COPY_RESET' }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'SLUG':       return { ...s, slug: a.payload }
    case 'MP':         return { ...s, mp: a.payload, loading: false, error: '' }
    case 'ERROR':      return { ...s, error: a.payload, loading: false }
    case 'VIEWS':      return { ...s, views: a.payload }
    case 'INC_VIEWS':  return { ...s, views: s.views + 1 }
    case 'COPIED':     return { ...s, copied: true }
    case 'COPY_RESET': return { ...s, copied: false }
    default:           return s
  }
}

const inits = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-800 border-t-yellow-400" />
      <p className="font-mono text-xs uppercase tracking-widest text-zinc-600">Loading</p>
    </div>
  )
}

function NotFound({ msg, back }: { msg: string; back: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-8 text-center">
      <span className="text-5xl">🔍</span>
      <h2 className="text-2xl font-bold text-white">MP Not Found</h2>
      <p className="max-w-xs text-sm leading-relaxed text-zinc-400">{msg}</p>
      <button onClick={back} className="mt-2 rounded-full bg-yellow-400 px-6 py-2.5 text-sm font-bold text-black transition hover:bg-yellow-300">
        ← Search MPs
      </button>
    </div>
  )
}

export default function MPProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const [state, dispatch] = useReducer(reducer, { slug: '', mp: null, loading: true, error: '', views: 0, copied: false })
  const router = useRouter()
  const { slug, mp, loading, error, views, copied } = state

  useEffect(() => { params.then(p => dispatch({ type: 'SLUG', payload: p.slug })) }, [params])

  useEffect(() => {
    if (!slug) return
    supabase.from('politicians').select('*').eq('slug', slug).single()
      .then(({ data, error: e }) => {
        if (e || !data) dispatch({ type: 'ERROR', payload: e?.code === 'PGRST116' ? 'MP not found.' : 'Failed to load.' })
        else {
          dispatch({ type: 'MP', payload: data })
          supabase.from('politicians').update({ search_count: (data.search_count ?? 0) + 1 }).eq('id', data.id)
        }
      })
  }, [slug])

  useEffect(() => {
    if (!mp?.id) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    supabase.from('searches').select('*', { count: 'exact', head: true })
      .eq('politician_id', mp.id).gte('searched_at', today.toISOString())
      .then(({ count }) => dispatch({ type: 'VIEWS', payload: count ?? 0 }))
    const ch = supabase.channel(`views-${mp.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'searches', filter: `politician_id=eq.${mp.id}` },
        () => dispatch({ type: 'INC_VIEWS' }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [mp?.id])

  const share = useCallback(async () => {
    if (!mp) return
    const url = `${window.location.origin}/mp/${mp.slug}`
    if (navigator.share) await navigator.share({ title: `${mp.name} — TruthTrack`, url })
    else {
      await navigator.clipboard.writeText(url)
      dispatch({ type: 'COPIED' })
      setTimeout(() => dispatch({ type: 'COPY_RESET' }), 2000)
    }
  }, [mp])

  if (loading)      return <Loading />
  if (error || !mp) return <NotFound msg={error || 'Unknown error'} back={() => router.push('/')} />

  const cfg      = gcfg(mp.performance_grade)
  const isExempt = mp.is_minister

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse 50% 40% at 20% 0%, ${cfg.glow}0f, transparent 60%)` }}/>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/6 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-6">
          <button onClick={() => router.push('/')}
            className="flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-1.5 font-mono text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            All MPs
          </button>
          <p className="font-mono text-sm text-zinc-400">
            <span className="font-bold text-white">TruthTrack</span>
            <span className="mx-2 text-zinc-700">·</span>18th Lok Sabha
          </p>
          <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"/>
            </span>
            {views} today
          </div>
        </div>
      </header>

      {/* 2-col layout */}
      <div className="mx-auto max-w-screen-xl">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr]">

          {/* LEFT */}
          <motion.aside initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{duration:0.4}}
            className="relative z-10 px-8 pb-16 pt-10 lg:sticky lg:top-14 lg:h-[calc(100vh-56px)] lg:overflow-y-auto lg:border-r lg:border-white/5">

            <div className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-medium ${cfg.border} ${cfg.bg} ${cfg.text}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{background:cfg.glow}}/>
              {isExempt ? (mp.exempt_reason ?? 'Cabinet Minister') : mp.party}
            </div>

            <div className="mb-2 flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-base font-bold ${cfg.border} ${cfg.bg} ${cfg.text}`}>
                {inits(mp.name)}
              </div>
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">{mp.name}</h1>
            </div>
            <p className="mb-1 font-mono text-xs text-zinc-500">{mp.constituency} · {mp.state}</p>
            {isExempt && <p className="mb-6 font-mono text-xs text-zinc-600">{mp.party}</p>}

            {isExempt ? (
              <ExemptCard reason={mp.exempt_reason} />
            ) : (
              <>
                <div className="flex justify-center">
                  <ScoreArc score={mp.overall_score ?? 0} grade={mp.performance_grade ?? 'F'}/>
                </div>
                {mp.overall_score_percentile !== null && (
                  <p className="mb-3 text-center font-mono text-xs text-zinc-500">
                    Better than <span className="font-bold text-zinc-300">{mp.overall_score_percentile}%</span> of all MPs
                  </p>
                )}
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:1.2}}
                  className={`mb-5 rounded-xl border p-4 text-center ${cfg.border} ${cfg.bg}`}>
                  <p className={`mb-1 text-lg font-bold ${cfg.text}`}>{cfg.emoji} {cfg.label} · Grade {mp.performance_grade}</p>
                  <p className="text-sm text-zinc-400">{cfg.verdict}</p>
                </motion.div>
              </>
            )}

            <motion.button onClick={share}
              initial={{opacity:0}} animate={{opacity:1}} transition={{delay: isExempt ? 0.5 : 1.4}}
              whileTap={{scale:0.97}}
              className={`w-full rounded-xl py-4 text-sm font-bold tracking-wide transition ${
                copied ? 'bg-emerald-500 text-white' : isExempt ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'text-black hover:brightness-110'
              }`}
              style={!copied && !isExempt ? {background:cfg.glow, boxShadow:`0 4px 24px ${cfg.glow}35`} : {}}>
              {copied ? '✅ Copied!' : `📤 Share ${mp.name.split(' ')[0]}'s Report Card`}
            </motion.button>
          </motion.aside>

          {/* RIGHT — all sections are just components */}
          <motion.main initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.4,delay:0.1}}
            className="px-8 pb-24 pt-10">

            <ParliamentaryActivity mp={mp}/>
            <hr className="mb-10 border-white/6"/>

            {!isExempt && mp.questions_by_ministry && (<><MinistryFocus mp={mp}/><hr className="mb-10 border-white/6"/></>)}
            {!isExempt && mp.debates_by_type       && (<><DebateBreakdown mp={mp}/><hr className="mb-10 border-white/6"/></>)}
            {!isExempt                             && (<><PerformanceRadar mp={mp}/><hr className="mb-10 border-white/6"/></>)}
            <ElectionHistory mp={mp}/> 
            {mp.election_history?.length ? <hr className="mb-10 border-white/6"/> : null}
            <CriminalRecord mp={mp}/>
            <hr className="mb-10 border-white/6"/>

            <AssetGrowth mp={mp}/>
            <hr className="mb-10 border-white/6"/>

            <BackgroundCard mp={mp}/>

            {!isExempt && (<><hr className="mb-10 border-white/6"/><ScoreMethodology/></>)}
          </motion.main>
        </div>
      </div>
    </div>
  )
}