/**
 * TruthTrack — MyNeta 2019 Merge Script
 * scripts/merge-myneta-2019.ts
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

const db      = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const DRY_RUN = !!process.env.DRY_RUN

type Winner2019 = {
  candidate_id: number | null
  name: string
  constituency: string
  party: string
  criminal_cases_2019: number
  assets_2019: number | null
  liabilities_2019: number | null
}

function normalise(c: string): string {
  return c.toLowerCase()
    .replace(/-/g, ' ')                      // hyphen → space (fixes all hyphenated constituency names)
    .replace(/\s*\(sc\)|\s*\(st\)/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 2024 DB constituency name -> 2019 MyNeta constituency name
// Only needed where names genuinely differ between elections
// Note: hyphenated names (e.g. "Bardhaman-Durgapur") are handled automatically
// by normalise() above — no RENAME entry needed for those.
const RENAME: Record<string, string> = {
  // Spelling differences
  'ananthapur':          'anantapur',
  'arambagh':            'arambag',
  'baharaich':           'bahraich',
  'davangere':           'davanagere',
  'narsaraopet':         'narasaraopet',
  'patliputra':          'pataliputra',
  'srerampur':           'sreerampur',
  'thirupati':           'tirupati',
  'kurnoolu':            'kurnool',
  // Renamed / reorganised constituencies
  'tehri garhwal':       'garhwal',
  'nagaon':              'nawgong',
  'darang udalguri':     'mangaldoi',
  'diphu':               'autonomous district',
  'kaziranga':           'kaliabor',
  'sonitpur':            'tezpur',
  'guwahati':            'gauhati',
  'coochbehar':          'cooch behar',
  'gadchiroli chimur':   'gadchiroli chimur',  // hyphen fix makes this work directly
}

// Constituencies confirmed absent from 2019 JSON (data not available):
//   Kachchh, Alathur, Jalore, Karakat, Samastipur, Arunachal East
//   Anantnag-Rajouri  ← new 2024 seat (J&K delimitation), no 2019 equivalent
// These will correctly remain null in the DB.

async function merge() {
  const jsonPath = path.join(__dirname, 'myneta-2019.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ myneta-2019.json not found.')
    process.exit(1)
  }
  const raw2019: { winners: Winner2019[] } = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  console.log(`\n📂 myneta-2019.json: ${raw2019.winners.length} winners`)
  if (DRY_RUN) console.log('   🔍 DRY RUN — no DB writes')

  // Build lookup by normalised constituency name
  const map2019 = new Map<string, Winner2019>()
  for (const w of raw2019.winners) {
    map2019.set(normalise(w.constituency), w)
  }

  // Fetch all 2024 MPs
  const { data: mps, error } = await db
    .from('politicians')
    .select('id, name, constituency, assets_2019')
  if (error) { console.error('❌ DB error:', error.message); process.exit(1) }
  console.log(`📋 Supabase: ${mps!.length} politicians\n`)

  let matched = 0, skipped = 0
  const updates: { id: string; assets_2019: number }[] = []
  const notFound: string[] = []

  for (const mp of mps!) {
    let key = normalise(mp.constituency)
    // Apply rename map if needed
    if (RENAME[key]) key = RENAME[key]

    const w2019 = map2019.get(key)

    if (!w2019 || w2019.assets_2019 === null) {
      skipped++
      if (!w2019) notFound.push(mp.constituency)
      continue
    }

    matched++
    updates.push({ id: mp.id, assets_2019: w2019.assets_2019 })
  }

  console.log(`✅ Matched with 2019 asset data: ${matched}`)
  console.log(`⏭️  No 2019 data (new seats / null assets): ${skipped}`)

  if (notFound.length) {
    console.log(`\n⚠️  Constituencies not found in 2019 JSON (${notFound.length}):`)
    notFound.forEach(c => console.log(`   - ${c}`))
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN: would update ${updates.length} MPs`)
    updates.slice(0, 10).forEach(u =>
      console.log(`   id=${u.id}  assets_2019=₹${(u.assets_2019/1e7).toFixed(2)}Cr`)
    )
    process.exit(0)
  }

  // Batch update
  console.log(`\n⬆️  Updating ${updates.length} MPs in Supabase...`)
  let updated = 0
  const BATCH = 20
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.all(updates.slice(i, i + BATCH).map(async u => {
      const { error: e } = await db
        .from('politicians')
        .update({ assets_2019: u.assets_2019 })
        .eq('id', u.id)
      if (e) console.error(`❌ Failed id=${u.id}:`, e.message)
      else updated++
    }))
    if ((i + BATCH) % 100 === 0) {
      console.log(`   ⬆️  ${Math.min(i + BATCH, updates.length)} / ${updates.length}`)
    }
  }

  console.log(`\n✅ Updated ${updated} / ${updates.length} MPs with 2019 assets`)

  // Top growth leaderboard
  const { data: topGrowth } = await db
    .from('politicians')
    .select('name, party, assets_2019, assets_2024')
    .not('assets_2019', 'is', null)
    .not('assets_2024', 'is', null)
    .gt('assets_2019', 0)
    .order('assets_2024', { ascending: false })
    .limit(20)

  if (topGrowth?.length) {
    console.log('\n🚀 Top 10 asset growth %:')
    topGrowth
      .map(mp => ({ ...mp, pct: Math.round(((mp.assets_2024 - mp.assets_2019) / mp.assets_2019) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10)
      .forEach(mp => console.log(`   ${String(mp.pct + '%').padStart(7)}  ${mp.name} (${mp.party})`))
  }

  const { count: bothCount } = await db
    .from('politicians')
    .select('*', { count: 'exact', head: true })
    .not('assets_2019', 'is', null)
    .not('assets_2024', 'is', null)

  console.log(`\n📊 MPs with BOTH years data: ${bothCount}`)
  console.log('\n✅ 2019 merge complete!')
}

merge().catch(e => { console.error('💥', e.message); process.exit(1) })