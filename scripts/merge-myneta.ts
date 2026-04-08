/**
 * TruthTrack — MyNeta Merge Script v2
 * scripts/merge-myneta.ts
 *
 * Reads myneta-clean.json (544 MPs) and upserts to Supabase:
 *   criminal_cases, criminal_details, assets_2024, liabilities
 *
 * MATCHING STRATEGY:
 *   1. Exact myneta_id match (if politicians table has myneta_id column)
 *   2. Constituency-based override (for 9 known name-format mismatches)
 *   3. Name + constituency fuzzy match (normalised)
 *   4. Name-only fuzzy match (fallback)
 *
 * USAGE:
 *   npx ts-node --esm scripts/merge-myneta.ts
 *   DRY_RUN=1 npx ts-node --esm scripts/merge-myneta.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
const db     = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } })
const DRY_RUN = !!process.env.DRY_RUN

// ─── Types ────────────────────────────────────────────────────────────────────

type MP = {
  id: string
  name: string
  constituency: string
  state: string
  party: string
  myneta_id?: number | null
}

type ScrapedMP = {
  myneta_id: number
  name: string
  constituency: string
  party: string
  criminal_cases: number
  criminal_details: { section: string; description: string }[]
  assets_2024: number | null
  liabilities: number | null
}

// ─── Constituency overrides for 9 known name-format mismatches ────────────────
// MyNeta uses dots/prefixes/reordered names that fuzzy matching can't resolve.
// Key: myneta_id → DB constituency name (case-insensitive exact match)
const CONSTITUENCY_OVERRIDES: Record<number, string> = {
  476:  'Sikar',          // "Amraram"           → "Amra Ram"
  4005: 'Shimoga',        // "B.Y.Raghavendra"   → "B Y Raghavendra"
  5268: 'Anakapalle',     // "C.M.Ramesh"        → "C M Ramesh"
  39:   'Nagina',         // "Chandrashekhar"    → "Chandra Shekhar"
  1881: 'Chikkballapur',  // "Dr.K.Sudhakar"     → "K Sudhakar"
  2268: 'Alathur',        // "K.Radhakrishnan"   → "K Radhakrishnan"
  2557: 'Jalore',         // "Lumbaram"          → "Lumba Ram"
  554:  'Cuddalore',      // "M.K. Vishnuprasad" → "M K Vishnu Prasad"
  221:  'Viluppuram',     // "Ravikumar. D"      → "D Ravi Kumar"
}

// ─── Name matching ────────────────────────────────────────────────────────────

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|shri|smt|sh|km|adv|prof|col|capt|lt)\b\.?/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSimilarity(a: string, b: string): number {
  const na = normalise(a).split(' ').filter(w => w.length > 2)
  const nb = normalise(b).split(' ').filter(w => w.length > 2)
  if (!na.length || !nb.length) return 0
  const matches = na.filter(w => nb.includes(w)).length
  return matches / Math.max(na.length, nb.length)
}

function constituencyMatch(scraped: string, db: string): boolean {
  const s = normalise(scraped).replace(/\s*\(sc\)|\s*\(st\)/g, '').trim()
  const d = normalise(db).replace(/\s*\(sc\)|\s*\(st\)/g, '').trim()
  return s.includes(d.split(' ')[0]) || d.includes(s.split(' ')[0])
}

function findBestMatch(
  candidate: ScrapedMP,
  mps: MP[],
  byConstituency: Map<string, MP>
): { mp: MP | null; score: number; method: string } {

  // Method 1: myneta_id exact match (fastest, most reliable)
  if (candidate.myneta_id) {
    const exact = mps.find(m => m.myneta_id === candidate.myneta_id)
    if (exact) return { mp: exact, score: 1.0, method: 'myneta_id' }
  }

  // Method 2: constituency override for known problem MPs
  const overrideConstituency = CONSTITUENCY_OVERRIDES[candidate.myneta_id]
  if (overrideConstituency) {
    const overrideMatch = byConstituency.get(overrideConstituency.toLowerCase())
    if (overrideMatch) return { mp: overrideMatch, score: 1.0, method: 'constituency_override' }
  }

  // Method 3: name + constituency fuzzy match
  let bestMatch: MP | null = null
  let bestScore = 0
  let bestMethod = ''

  for (const mp of mps) {
    const nameScore  = nameSimilarity(candidate.name, mp.name)
    const constBoost = constituencyMatch(candidate.constituency, mp.constituency) ? 0.3 : 0
    const partyBoost = candidate.party.toLowerCase().includes(mp.party?.toLowerCase().slice(0, 4) || '') ? 0.1 : 0
    const score      = nameScore + constBoost + partyBoost

    if (score > bestScore) {
      bestScore  = score
      bestMatch  = mp
      bestMethod = nameScore >= 0.8 ? 'name+const' : 'fuzzy'
    }
  }

  return { mp: bestMatch, score: bestScore, method: bestMethod }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function merge() {
  // Load scraped data — look in project root first, then scripts/ folder
  const rootPath    = path.join(__dirname, '../myneta-clean.json')
  const scriptsPath = path.join(__dirname, 'myneta-clean.json')
  const cleanPath   = fs.existsSync(rootPath) ? rootPath : scriptsPath

  if (!fs.existsSync(cleanPath)) {
    console.error('❌ myneta-clean.json not found in project root or scripts/ folder.')
    process.exit(1)
  }

  const raw      = JSON.parse(fs.readFileSync(cleanPath, 'utf-8'))
  const scraped: ScrapedMP[] = raw.winners
  console.log(`\n📂 myneta-clean.json: ${scraped.length} MPs`)
  if (DRY_RUN) console.log('   🔍 DRY RUN — no DB writes\n')

  // Fetch all MPs from Supabase
  const { data: mps, error } = await db
    .from('politicians')
    .select('id, name, constituency, state, party, myneta_id')
  if (error) { console.error('❌ DB error:', error.message); process.exit(1) }
  console.log(`📋 Supabase: ${mps!.length} politicians\n`)

  // Build constituency lookup map (lowercase → MP)
  const byConstituency = new Map<string, MP>()
  for (const mp of mps as MP[]) {
    byConstituency.set(mp.constituency.toLowerCase(), mp)
  }

  // ── Match and prepare updates ───────────────────────────────────────────────
  let matched   = 0
  let unmatched = 0
  let updated   = 0

  const updates:  { id: string; payload: object }[] = []
  const unmatchedList: string[] = []

  for (const candidate of scraped) {
    const { mp, score, method } = findBestMatch(candidate, mps as MP[], byConstituency)

    if (!mp || score < 0.55) {
      unmatched++
      unmatchedList.push(`${candidate.name} (${candidate.constituency}) — score ${score.toFixed(2)}`)
      continue
    }

    matched++
    updates.push({
      id: mp.id,
      payload: {
        criminal_cases:   candidate.criminal_cases,
        criminal_details: candidate.criminal_details.length > 0 ? candidate.criminal_details : null,
        assets_2024:      candidate.assets_2024,
        liabilities:      candidate.liabilities,
        myneta_id:        candidate.myneta_id,
      }
    })

    // Show low-confidence matches for review
    if (score < 0.75 && method !== 'myneta_id' && method !== 'constituency_override') {
      console.log(`  ⚡ Low confidence [${score.toFixed(2)}]: "${candidate.name}" → "${mp.name}"`)
    }
  }

  console.log(`✅ Matched: ${matched} / ${scraped.length}`)
  console.log(`⚠️  Unmatched: ${unmatched}\n`)

  if (unmatchedList.length > 0 && unmatchedList.length <= 20) {
    console.log('Unmatched candidates:')
    unmatchedList.forEach(u => console.log('  •', u))
    console.log()
  }

  if (DRY_RUN) {
    console.log(`🔍 DRY RUN: would update ${updates.length} MPs`)
    console.log('   Sample updates:')
    updates.slice(0, 3).forEach(u => console.log(`   id=${u.id}`, JSON.stringify(u.payload).slice(0, 100)))
    process.exit(0)
  }

  // ── Batch update Supabase ───────────────────────────────────────────────────
  console.log(`⬆️  Updating ${updates.length} MPs in Supabase...`)

  const BATCH = 20
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    await Promise.all(batch.map(async u => {
      const { error: e } = await db
        .from('politicians')
        .update(u.payload)
        .eq('id', u.id)
      if (e) console.error(`❌ Update failed id=${u.id}:`, e.message)
      else updated++
    }))

    if ((i + BATCH) % 100 === 0) {
      console.log(`   ⬆️  ${Math.min(i + BATCH, updates.length)} / ${updates.length}`)
    }
  }

  console.log(`\n✅ Updated ${updated} / ${updates.length} MPs in Supabase`)

  // ── Summary ─────────────────────────────────────────────────────────────────
  const { data: topCriminals } = await db
    .from('politicians')
    .select('name, party, criminal_cases')
    .gt('criminal_cases', 0)
    .order('criminal_cases', { ascending: false })
    .limit(10)

  if (topCriminals?.length) {
    console.log('\n🚨 Top 10 MPs by criminal cases (in DB):')
    topCriminals.forEach(mp =>
      console.log(`   ${String(mp.criminal_cases).padStart(3)}  ${mp.name} (${mp.party})`)
    )
  }

  const { data: richest } = await db
    .from('politicians')
    .select('name, party, assets_2024')
    .not('assets_2024', 'is', null)
    .order('assets_2024', { ascending: false })
    .limit(5)

  if (richest?.length) {
    console.log('\n💎 Top 5 richest MPs (in DB):')
    richest.forEach(mp =>
      console.log(`   ₹${(mp.assets_2024 / 1e7).toFixed(0)}Cr  ${mp.name} (${mp.party})`)
    )
  }

  const { count: assetsCount } = await db
    .from('politicians')
    .select('*', { count: 'exact', head: true })
    .not('assets_2024', 'is', null)

  const { count: crimCount } = await db
    .from('politicians')
    .select('*', { count: 'exact', head: true })
    .gt('criminal_cases', 0)

  console.log(`\n📊 DB coverage: ${assetsCount} MPs with assets | ${crimCount} MPs with criminal cases`)
  console.log('\n✅ Merge complete!')
}

merge().catch(e => { console.error('💥', e.message); process.exit(1) })