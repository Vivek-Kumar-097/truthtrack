/**
 * TruthTrack — Seed Script v4 (Day 3)
 *
 * NEW IN DAY 3:
 * - questions_by_ministry: { "Health": 6, "Railways": 4, ... }
 * - debates_by_type: { "Government Bills": 1, "Special Mention": 3, ... }
 * - gender, terms_served, term_start from CSV
 * - exempt_reason: "Cabinet Minister" | "Leader of Opposition" | "Speaker"
 * - overall_score_percentile: where does this MP rank vs all others?
 *
 * STILL NULL (Day 4 — MyNeta):
 * - criminal_cases, criminal_details, assets_2019, assets_2024, liabilities
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(__dirname, '../.env.local')
  if (!fs.existsSync(p)) { console.error('❌ .env.local not found'); process.exit(1) }
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    let val = t.slice(eq + 1).trim()
    if (/^["']/.test(val) && val[0] === val.at(-1)) val = val.slice(1, -1)
    process.env[t.slice(0, eq).trim()] = val
  }
}
loadEnv()

const DB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const DB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!DB_URL?.startsWith('http')) { console.error('❌ Bad SUPABASE_URL'); process.exit(1) }
if (!DB_KEY || DB_KEY.length < 100) { console.error('❌ Bad SERVICE_ROLE_KEY'); process.exit(1) }

const db = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } })

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toSlug  = (n: string) => n.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')
const toGrade = (s: number) => s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : s >= 20 ? 'D' : 'F'
const num     = (v: string)  => parseFloat(v || '0') || 0

function calcScore(att: number, q: number, d: number, b: number): number {
  return Math.max(0, Math.round(
    (att / 100) * 40 +
    (Math.min(q, 300) / 300) * 30 +
    (Math.min(d, 100) / 100) * 20 +
    (Math.min(b, 5)   / 5)   * 10
  ))
}

function parseLine(line: string): string[] {
  const cols: string[] = []; let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === ';' && !inQ) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim()); return cols
}

// ─── Exempt reason detection ──────────────────────────────────────────────────
function getExemptReason(ministerCol: string, comment: string): string | null {
  if (ministerCol.toLowerCase() === 'yes')           return 'Cabinet Minister'
  if (comment.includes('Leader of Opposition'))      return 'Leader of Opposition'
  if (comment.includes('Speaker'))                   return 'Speaker'
  if (comment.includes('Pro-tem'))                   return 'Pro-tem Speaker'
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const csvPath = path.join(__dirname, '18th_lok_sabha.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV missing at', csvPath)
    process.exit(1)
  }

  const lines   = fs.readFileSync(csvPath, 'utf-8').trim().split('\n')
  const headers = parseLine(lines[0])
  const col     = (name: string) => headers.findIndex(h => h === name)
  const colPart = (part: string) => headers.findIndex(h => h.toLowerCase().includes(part.toLowerCase()))

  // Core columns
  const C = {
    name:         col('Name'),
    constituency: col('Constituency'),
    minister:     col('Minister'),
    attendance:   col('Attendance'),
    debates:      col('Debates'),
    questions:    col('Questions'),
    bills:        col('Private Member Bills'),
    state:        col('State'),
    party:        col('Party'),
    age:          col('Age'),
    education:    col('Education'),
    gender:       col('Gender'),
    comment:      col('Comment'),
    terms:        col('No. of Term'),
    termStart:    col('Start of Term'),
  }

  // Ministry question columns (col 18–83)
  const ministryCols: { name: string; idx: number }[] = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith('Questions ('))
    .map(({ h, i }) => ({
      name: h.replace('Questions (', '').replace(')', '').trim(),
      idx:  i,
    }))

  // Debate type columns
  const debateCols: { name: string; idx: number }[] = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith('Debates ('))
    .map(({ h, i }) => ({
      name: h.replace('Debates (', '').replace(')', '').trim(),
      idx:  i,
    }))

  console.log(`\n📋 ${lines.length - 1} rows · ${headers.length} cols`)
  console.log(`   Ministry question cols: ${ministryCols.length}`)
  console.log(`   Debate type cols:       ${debateCols.length}\n`)

  // ── Parse all MPs ────────────────────────────────────────────────────────────
  const politicians = lines.slice(1).flatMap(line => {
    const r    = parseLine(line)
    const name = r[C.name]?.trim()
    if (!name) return []

    const comment      = r[C.comment]?.trim() ?? ''
    const exemptReason = getExemptReason(r[C.minister] ?? '', comment)
    const isExempt     = exemptReason !== null

    // Exempt MPs: all metrics null
    const att = isExempt ? null : (parseFloat(r[C.attendance]?.replace('%', '') || '0') || 0)
    const q   = isExempt ? null : num(r[C.questions])
    const d   = isExempt ? null : num(r[C.debates])
    const b   = isExempt ? null : num(r[C.bills])

    // Ministry-wise questions (only for non-exempt)
    let questionsByMinistry: Record<string, number> | null = null
    if (!isExempt) {
      const byMin: Record<string, number> = {}
      for (const { name: mName, idx } of ministryCols) {
        const v = num(r[idx])
        if (v > 0) byMin[mName] = v
      }
      if (Object.keys(byMin).length > 0) questionsByMinistry = byMin
    }

    // Debate breakdown (only for non-exempt)
    let debatesByType: Record<string, number> | null = null
    if (!isExempt) {
      const byType: Record<string, number> = {}
      for (const { name: dName, idx } of debateCols) {
        const v = num(r[idx])
        if (v > 0) byType[dName] = v
      }
      if (Object.keys(byType).length > 0) debatesByType = byType
    }

    const score = isExempt ? null : calcScore(att!, q!, d!, b!)

    return [{
      name,
      slug:              toSlug(name),
      party:             r[C.party]?.trim()        || 'Independent',
      state:             r[C.state]?.trim()        || '',
      constituency:      r[C.constituency]?.trim() || '',
      house:             'Lok Sabha',
      lok_sabha_number:  18,

      is_minister:       isExempt,
      exempt_reason:     exemptReason,

      attendance_pct:    att,
      questions_asked:   q   !== null ? Math.round(q) : null,
      debates_count:     d   !== null ? Math.round(d) : null,
      bills_introduced:  b   !== null ? Math.round(b) : null,

      questions_by_ministry: questionsByMinistry,
      debates_by_type:       debatesByType,

      overall_score:     score,
      performance_grade: isExempt ? null : toGrade(score!),

      age:          parseInt(r[C.age])  || null,
      gender:       r[C.gender]?.trim() || null,
      education:    r[C.education]?.trim() || null,
      terms_served: r[C.terms]?.trim()    || null,
      term_start:   r[C.termStart]?.trim() || null,

      // Day 4 — MyNeta
      criminal_cases:    null,
      criminal_details:  null,
      assets_2019:       null,
      assets_2024:       null,
      liabilities:       null,

      is_active:    true,
      search_count: 0,
    }]
  })

  const exempt    = politicians.filter(p => p.is_minister)
  const nonExempt = politicians.filter(p => !p.is_minister)
  const scores    = nonExempt.map(p => p.overall_score!).sort((a, b) => a - b)

  // Compute percentile rank for each non-exempt MP
  const withPercentile = politicians.map(p => {
    if (p.is_minister || p.overall_score === null) return { ...p, overall_score_percentile: null }
    const rank    = scores.filter(s => s <= p.overall_score!).length
    const pct     = Math.round((rank / scores.length) * 100)
    return { ...p, overall_score_percentile: pct }
  })

  console.log(`✅ ${politicians.length} MPs parsed`)
  console.log(`   Exempt (ungraded): ${exempt.length}`)
  console.log(`   ├─ Cabinet Ministers: ${exempt.filter(p => p.exempt_reason === 'Cabinet Minister').length}`)
  console.log(`   ├─ Leader of Opposition: ${exempt.filter(p => p.exempt_reason === 'Leader of Opposition').length}`)
  console.log(`   └─ Speaker: ${exempt.filter(p => p.exempt_reason?.includes('Speaker')).length}`)
  console.log(`   Graded MPs: ${nonExempt.length}`)

  const grades = ['A','B','C','D','F'].reduce((a: any, g) => {
    a[g] = nonExempt.filter(p => p.performance_grade === g).length; return a
  }, {})
  console.log(`   Grades: A=${grades.A} B=${grades.B} C=${grades.C} D=${grades.D} F=${grades.F}\n`)

  // ── Upsert ────────────────────────────────────────────────────────────────────
  const { error: ce } = await db.from('politicians').select('id').limit(1)
  if (ce) { console.error('❌ DB connection failed:', ce.message); process.exit(1) }
  console.log('✅ Supabase connected\n')

  let done = 0
  for (let i = 0; i < withPercentile.length; i += 50) {
    const { error } = await db
      .from('politicians')
      .upsert(withPercentile.slice(i, i + 50) as any[], { onConflict: 'slug' })
    if (error) console.error(`❌ Batch ${i}:`, error.message)
    else { done += Math.min(50, withPercentile.length - i); process.stdout.write(`\r⏳ ${done}/${withPercentile.length}`) }
  }

  const { count } = await db.from('politicians').select('*', { count: 'exact', head: true })
  console.log(`\n\n🎉 ${count} MPs in Supabase`)

  // Sample check
  const { data: rahul } = await db.from('politicians')
    .select('name, exempt_reason, questions_by_ministry, debates_by_type, overall_score')
    .eq('slug', 'rahul-gandhi').single()
  if (rahul) {
    console.log(`\n📊 Rahul Gandhi check:`)
    console.log(`   exempt_reason: ${rahul.exempt_reason}`)
    console.log(`   overall_score: ${rahul.overall_score}`)
  }

  const { data: tharoor } = await db.from('politicians')
    .select('name, overall_score, overall_score_percentile, questions_by_ministry')
    .eq('slug', 'shashi-tharoor').single()
  if (tharoor) {
    console.log(`\n📊 Shashi Tharoor check:`)
    console.log(`   score: ${tharoor.overall_score} (top ${100 - (tharoor.overall_score_percentile ?? 0)}% of MPs)`)
    const top3 = Object.entries(tharoor.questions_by_ministry ?? {}).sort(([,a],[,b]) => b-a).slice(0,3)
    console.log(`   top 3 ministries: ${top3.map(([m,v]) => `${m}(${v})`).join(', ')}`)
  }

  console.log('\n✅ Day 3 seed complete!')
  console.log('ℹ️  criminal_cases, assets = null → Day 4 (MyNeta scraper)')
}

seed().catch(e => { console.error('💥', e.message); process.exit(1) })