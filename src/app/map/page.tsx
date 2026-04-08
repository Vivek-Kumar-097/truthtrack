// src/app/map/page.tsx — Day 5: India MP Map
'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import * as d3 from 'd3'
import { supabase, type Politician } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type MP = Pick<Politician,
  'id'|'name'|'slug'|'party'|'state'|'constituency'|
  'overall_score'|'performance_grade'|'is_minister'>
type Tip = { x:number; y:number; mp:MP|null; seat:string }

// ── Color system — Okabe-Ito, colorblind-safe ─────────────────────────────────
const GRADE: Record<string,{fill:string; glow:string; label:string}> = {
  A: { fill:'#00C49A', glow:'#00C49A44', label:'Excellent'  },
  B: { fill:'#4CA3DD', glow:'#4CA3DD44', label:'Good'       },
  C: { fill:'#F0A500', glow:'#F0A50044', label:'Average'    },
  D: { fill:'#E05C00', glow:'#E05C0044', label:'Poor'       },
  F: { fill:'#C75BAD', glow:'#C75BAD44', label:'Failing'    },
}
const MINISTER_FILL = '#2563EB'
const EMPTY_FILL    = '#1e1e24'   // dark — unmatched constituencies
const BG            = '#0c0c10'   // near-black page background

const fill = (grade: string|null, min: boolean) =>
  min ? MINISTER_FILL : (GRADE[grade??'']?.fill ?? EMPTY_FILL)

const pcKey = (p: any) =>
  (p?.pc_name ?? p?.PC_NAME ?? p?.name ?? '')
    .toUpperCase().replace(/\s*\(.*?\)/g,'').replace(/\s+/g,' ').trim()

// ── Component ─────────────────────────────────────────────────────────────────
export default function MapPage() {
  const svgRef  = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const agRef   = useRef<string|null>(null)
  const router  = useRouter()

  const [mps,     setMps]     = useState<MP[]>([])
  const [loading, setLoading] = useState(true)
  const [ready,   setReady]   = useState(false)
  const [err,     setErr]     = useState<string|null>(null)
  const [tip,     setTip]     = useState<Tip|null>(null)
  const [svgW,    setSvgW]    = useState(900)
  const [q,       setQ]       = useState('')
  const [qOpen,   setQOpen]   = useState(false)
  const [ag,      setAg]      = useState<string|null>(null)

  // Force dark background on body — overrides globals.css
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = BG
    document.documentElement.style.background = BG
    return () => { document.body.style.background = prev }
  }, [])

  // Load MPs
  useEffect(() => {
    supabase.from('politicians')
      .select('id,name,slug,party,state,constituency,overall_score,performance_grade,is_minister')
      .eq('house', 'Lok Sabha')
      .then(({ data }) => { setMps(data ?? []); setLoading(false) })
  }, [])

  // Lookup: constituency name → MP
  const lookup = useMemo(() => {
    const m = new Map<string, MP>()
    for (const mp of mps) {
      const k = mp.constituency.toUpperCase()
        .replace(/\s*\(.*?\)/g,'').replace(/\s+/g,' ').trim()
      m.set(k, mp)
    }
    return m
  }, [mps])

  // Draw map — runs once MPs + DOM are ready
  useEffect(() => {
    if (loading || !svgRef.current || !wrapRef.current) return
    const wrap = wrapRef.current
    const W    = wrap.offsetWidth
    const H    = wrap.offsetHeight
    setSvgW(W)

    const svgEl = svgRef.current
    svgEl.setAttribute('width',  String(W))
    svgEl.setAttribute('height', String(H))

    const svg = d3.select(svgEl)
    
    svg.selectAll('*').remove()

    // Solid background rect — prevents any body color bleeding through
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', BG)

    fetch('https://raw.githubusercontent.com/datameet/maps/master/parliamentary-constituencies/india_pc_2019_simplified.geojson')
      .then(r => r.json())
      .then((geo: any) => {
        // Manual projection — fitSize() breaks on this GeoJSON's CRS header
        const base = d3.geoMercator().scale(1).translate([0,0])
        const [x0] = base([68.1, 37.1]) as number[]
        const [x1] = base([97.4,  8.1]) as number[]
        const [,y0] = base([68.1, 37.1]) as number[]
        const [,y1] = base([97.4,  8.1]) as number[]
        const PAD  = 32
        const sc   = Math.min((W-PAD*2)/Math.abs(x1-x0), (H-PAD*2)/Math.abs(y1-y0))
        const proj = d3.geoMercator().scale(sc)
          .translate([W/2 - sc*(x0+x1)/2, H/2 - sc*(y0+y1)/2])
        const path = d3.geoPath().projection(proj)

        // Zoom + pan
        const zoom = d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([1, 20])
          .on('zoom', ev => g.attr('transform', ev.transform.toString()))
        svg.call(zoom)
        svg.on('dblclick.zoom', null)
        svg.on('dblclick', () =>
          svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity))

        const g = svg.append('g')
        // Background inside zoom group covers any pan offset
        g.append('rect')
          .attr('x',-99999).attr('y',-99999)
          .attr('width',199999).attr('height',199999)
          .attr('fill', BG)

        // Ocean / outside-India fill — subtle dark blue
        g.append('rect')
          .attr('x',-99999).attr('y',-99999)
          .attr('width',199999).attr('height',199999)
          .attr('fill', '#0d1117')

        g.selectAll<SVGPathElement, any>('path')
          .data(geo.features)
          .join('path')
          .attr('class', 'pc')
          .attr('d', (d:any) => path(d) ?? '')
          .attr('fill', (d:any) => {
            const mp = lookup.get(pcKey(d.properties))
            return mp ? fill(mp.performance_grade, mp.is_minister) : EMPTY_FILL
          })
          .attr('fill-opacity', 0.85)
          .attr('stroke', '#000')
          .attr('stroke-width', 0.35)
          .style('cursor', 'pointer')
          .on('mouseenter', function(ev: MouseEvent, d: any) {
            d3.select(this)
              .attr('fill-opacity', 1)
              .attr('stroke', '#fff')
              .attr('stroke-width', 1.2)
            const seat = pcKey(d.properties)
            const mp   = lookup.get(seat) ?? null
            const rc   = wrap.getBoundingClientRect()
            setTip({ x: ev.clientX - rc.left, y: ev.clientY - rc.top, mp, seat })
          })
          .on('mousemove', function(ev: MouseEvent) {
            const rc = wrap.getBoundingClientRect()
            setTip(t => t ? { ...t, x: ev.clientX - rc.left, y: ev.clientY - rc.top } : null)
          })
          .on('mouseleave', function(_: MouseEvent, d: any) {
            const mp  = lookup.get(pcKey((d as any).properties))
            const cur = agRef.current
            const dim = cur && !(cur === 'MINISTER' ? mp?.is_minister : mp?.performance_grade === cur)
            d3.select(this)
              .attr('fill-opacity', dim ? 0.06 : 0.85)
              .attr('stroke', '#000').attr('stroke-width', 0.35)
            setTip(null)
          })
          .on('click', (_: MouseEvent, d: any) => {
            const mp = lookup.get(pcKey((d as any).properties))
            if (mp?.slug) router.push(`/mp/${mp.slug}`)
          })

        // ========== FIX: Hide tooltip when mouse is on background ==========
        const svgNode = svgRef.current
        const onSvgMouseMove = (ev: MouseEvent) => {
          const target = ev.target as Element
          if (!target.classList?.contains('pc')) {
            setTip(null)
          }
        }
        const onSvgMouseLeave = () => setTip(null)

        const cleanup = () => {
          svgNode?.removeEventListener('mousemove', onSvgMouseMove)
          svgNode?.removeEventListener('mouseleave', onSvgMouseLeave)
        }
        if (svgNode) {
          svgNode.addEventListener('mousemove', onSvgMouseMove)
          svgNode.addEventListener('mouseleave', onSvgMouseLeave)
        }

        setReady(true)

        // Return cleanup function (will be used by the outer useEffect)
        return cleanup
      })
      .catch(e => { setErr(String(e)); setReady(true) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lookup, router])

  // Grade filter
  useEffect(() => {
    agRef.current = ag
    if (!svgRef.current || !ready) return
    d3.select(svgRef.current).selectAll<SVGPathElement, any>('.pc')
      .transition().duration(220)
      .attr('fill-opacity', (d: any) => {
        if (!ag) return 0.85
        const mp = lookup.get(pcKey(d.properties))
        if (!mp) return 0.04
        return (ag === 'MINISTER' ? mp.is_minister : mp.performance_grade === ag) ? 1 : 0.04
      })
  }, [ag, ready, lookup])

  // ── Derived ────────────────────────────────────────────────────────────────
  const grades = useMemo(() =>
    Object.entries(GRADE).map(([g, { fill: c, label: l }]) => ({
      g, c, l, n: mps.filter(m => !m.is_minister && m.performance_grade === g).length
    })), [mps])
  const minN    = mps.filter(m => m.is_minister).length
  const results = useMemo(() => {
    if (q.length < 2) return []
    const lq = q.toLowerCase()
    return mps.filter(m =>
      m.name.toLowerCase().includes(lq) || m.constituency.toLowerCase().includes(lq)
    ).slice(0, 8)
  }, [q, mps])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden text-white"
      style={{ background: BG }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/6 px-5"
        style={{ background: BG }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')}
            className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Home
          </button>
          <span className="hidden font-mono text-sm sm:inline">
            <span className="font-bold text-white">TruthTrack</span>
            <span className="mx-2 text-zinc-700">·</span>
            <span className="font-medium text-yellow-400">India MP Map</span>
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${qOpen ? 'border-yellow-400/50' : 'border-zinc-700'}`}
            style={{ background: '#16161c' }}>
            <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={q}
              onChange={e => { setQ(e.target.value); setQOpen(true) }}
              onFocus={() => setQOpen(true)}
              onBlur={() => setTimeout(() => setQOpen(false), 150)}
              placeholder="Search MP or constituency…"
              className="w-40 bg-transparent font-mono text-xs text-white placeholder-zinc-500 outline-none sm:w-52"/>
            {q && (
              <button onClick={() => { setQ(''); setQOpen(false) }} className="text-zinc-500 hover:text-white">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          {qOpen && results.length > 0 && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl"
              style={{ background: '#16161c' }}>
              {results.map(mp => (
                <button key={mp.id} onMouseDown={() => router.push(`/mp/${mp.slug}`)}
                  className="flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left last:border-0 hover:bg-white/5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: fill(mp.performance_grade, mp.is_minister) }}/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{mp.name}</p>
                    <p className="truncate font-mono text-[10px] text-zinc-400">{mp.constituency} · {mp.state}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-black"
                    style={{ color: fill(mp.performance_grade, mp.is_minister) }}>
                    {mp.is_minister ? 'MIN' : (mp.performance_grade ?? '—')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/>
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"/>
          </span>
          <span className="font-mono text-xs text-zinc-400">{mps.length} MPs</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <aside className="hidden w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/5 p-4 lg:flex"
          style={{ background: BG }}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Filter by grade</p>
          <div className="space-y-0.5">
            {grades.map(({ g, c, l, n }) => (
              <button key={g} onClick={() => setAg(x => x === g ? null : g)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                style={{ background: ag === g ? c + '18' : undefined,
                         outline: ag === g ? `1px solid ${c}44` : undefined }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c }}/>
                <span className="flex-1 font-mono text-xs text-zinc-300">
                  <span className="font-bold" style={{ color: ag === g ? c : undefined }}>{g}</span>
                  <span className="ml-1.5 text-zinc-500 text-[10px]">{l}</span>
                </span>
                <span className="font-mono text-xs font-bold tabular-nums" style={{ color: c }}>{n}</span>
              </button>
            ))}
            <button onClick={() => setAg(x => x === 'MINISTER' ? null : 'MINISTER')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
              style={{ background: ag === 'MINISTER' ? '#2563EB18' : undefined,
                       outline: ag === 'MINISTER' ? '1px solid #2563EB44' : undefined }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: MINISTER_FILL }}/>
              <span className="flex-1 font-mono text-xs font-bold" style={{ color: MINISTER_FILL }}>Ministers</span>
              <span className="font-mono text-xs font-bold tabular-nums" style={{ color: MINISTER_FILL }}>{minN}</span>
            </button>
            <button onClick={() => setAg(x => x === 'NONE' ? null : 'NONE')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: EMPTY_FILL, border: '1px solid #444' }}/>
              <span className="flex-1 font-mono text-[10px] text-zinc-500">No data</span>
            </button>
          </div>

          {ag && (
            <button onClick={() => setAg(null)}
              className="rounded-xl border border-zinc-700 py-2 font-mono text-[10px] text-zinc-500 transition hover:border-zinc-500 hover:text-white">
              ✕ Clear filter
            </button>
          )}

          <div className="mt-auto space-y-2">
            <div className="rounded-xl border border-white/6 p-3" style={{ background: '#16161c' }}>
              <p className="font-mono text-[10px] text-zinc-500">Total tracked</p>
              <p className="font-mono text-2xl font-black text-white">{mps.length}</p>
              <p className="font-mono text-[10px] text-zinc-600">18th Lok Sabha</p>
            </div>
            <div className="rounded-xl border border-yellow-500/10 p-3" style={{ background: '#16130a' }}>
              <p className="font-mono text-[10px] leading-relaxed text-zinc-400">
                <span className="font-bold text-yellow-400">Controls</span><br/>
                Scroll to zoom · Drag to pan<br/>
                Double-click to reset<br/>
                Click any seat → profile
              </p>
            </div>
          </div>
        </aside>

        {/* ── Map ──────────────────────────────────────────────────────────── */}
        <div ref={wrapRef} className="relative flex-1" style={{ background: BG }}>

          {/* Loading */}
          {!ready && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3"
              style={{ background: BG }}>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-800 border-t-yellow-400"/>
              <p className="font-mono text-xs uppercase tracking-widest text-zinc-600">
                {loading ? 'Loading MPs…' : 'Rendering constituencies…'}
              </p>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-8 text-center"
              style={{ background: BG }}>
              <span className="text-5xl">🗺️</span>
              <p className="font-semibold text-white">Map failed to load</p>
              <p className="max-w-xs font-mono text-xs text-zinc-400">{err}</p>
              <button onClick={() => window.location.reload()}
                className="mt-2 rounded-full bg-yellow-400 px-5 py-2 text-sm font-bold text-black">
                Retry
              </button>
            </div>
          )}

          {/* SVG */}
          <svg ref={svgRef} style={{ display: 'block', background: BG }}
            className="absolute inset-0 h-full w-full"/>

          {/* Tooltip — clamped to map bounds */}
          {tip && ready && (() => {
            const mp    = tip.mp
            const cfg   = GRADE[mp?.performance_grade ?? '']
            const TW    = 256  // tooltip width
            const TH    = 160  // approx tooltip height
            const wH    = wrapRef.current?.offsetHeight ?? 700
            const left  = Math.min(Math.max(8, tip.x + 16), svgW - TW - 8)
            const top   = Math.min(Math.max(8, tip.y - 16), wH - TH - 8)
            return (
              <div className="pointer-events-none absolute z-50 w-64 rounded-2xl border border-white/10 p-4 shadow-2xl"
                style={{
                  background: '#16161c',
                  left,
                  top,
                }}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{tip.seat}</p>
                {mp ? (
                  <>
                    <p className="mb-0.5 text-sm font-bold leading-snug text-white">{mp.name}</p>
                    <p className="mb-3 font-mono text-xs text-zinc-400">{mp.party}</p>
                    {mp.is_minister ? (
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: MINISTER_FILL }}/>
                        <span className="font-mono text-xs" style={{ color: MINISTER_FILL }}>Cabinet Minister</span>
                      </div>
                    ) : cfg ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-xl font-black"
                          style={{ color: cfg.fill, background: cfg.glow }}>
                          {mp.performance_grade}
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold" style={{ color: cfg.fill }}>{cfg.label}</p>
                          <p className="font-mono text-xs text-zinc-500">{mp.overall_score}/100</p>
                        </div>
                      </div>
                    ) : null}
                    <p className="mt-3 font-mono text-[10px] text-zinc-600">Click to open profile →</p>
                  </>
                ) : (
                  <p className="font-mono text-xs text-zinc-500">No MP data</p>
                )}
              </div>
            )
          })()}

          {/* Mobile chips */}
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 lg:hidden">
            {grades.map(({ g, c }) => (
              <button key={g} onClick={() => setAg(x => x === g ? null : g)}
                className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-black text-white shadow-lg transition"
                style={{ background: c, opacity: ag && ag !== g ? 0.4 : 1 }}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}