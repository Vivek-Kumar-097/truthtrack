/**
 * Day 4 — fetch-election-history.ts (v5 — maximum match rate)
 *
 * Key improvements over v4:
 *  1. Aggressive constituency aliases (handles ECI vs common name differences)
 *  2. Better name matching for initials (A. Raja → A RAJA)
 *  3. State-scoped fallback matching (if constituency fails, try state+name)
 *  4. Debug report shows WHY each MP failed to match
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/fetch-election-history.ts
 */

import * as fs   from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────────────────────

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

type RawCandidate = ElectionEntry & {
  _normName:  string
  _normConst: string
  _normState: string
}

// ─── Constituency alias map ────────────────────────────────────────────────────
// Maps common/DB name → ECI CSV name variations
// Add more as you find mismatches in the debug output

const CONST_ALIASES: Record<string, string[]> = {
  'BARAMULLA':          ['BARAMULA'],
  'RAMPUR':             ['RAMPUR'],
  'MUZAFFARNAGAR':      ['MUZAFFAR NAGAR'],
  'FARRUKHABAD':        ['FARRUKHABAD'],
  'SHAHJHANPUR':        ['SHAHJAHANPUR'],
  'SHAHJAHANPUR':       ['SHAHJHANPUR'],
  'PILIBHIT':           ['PILIBHIT'],
  'DHAURAHRA':          ['DHAURAHARA'],
  'SITAPUR':            ['SITAPUR'],
  'HARDOI':             ['HARDOI'],
  'MISRIKH':            ['MISRIKH'],
  'UNNAO':              ['UNNAO'],
  'LUCKNOW':            ['LUCKNOW'],
  'MOHANLALGANJ':       ['MOHAN LAL GANJ', 'MOHANLAL GANJ'],
  'RAE BARELI':         ['RAE BARELI', 'RAEBARELI'],
  'RAEBARELI':          ['RAE BARELI', 'RAEBARELI'],
  'AMETHI':             ['AMETHI', 'AMETHI'],
  'SULTANPUR':          ['SULTANPUR'],
  'BANDA':              ['BANDA'],
  'FATEHPUR':           ['FATEHPUR'],
  'KAUSHAMBI':          ['KAUSHAMBI'],
  'PHULPUR':            ['PHULPUR'],
  'ALLAHABAD':          ['ALLAHABAD', 'PRAYAGRAJ'],
  'PRAYAGRAJ':          ['ALLAHABAD', 'PRAYAGRAJ'],
  'PRATAPGARH':         ['PRATAPGARH'],
  'AMBEDKAR NAGAR':     ['AMBEDKAR NAGAR'],
  'BAHRAICH':           ['BAHRAICH'],
  'SHRAVASTI':          ['SHRAWASTI'],
  'GONDA':              ['GONDA'],
  'FAIZABAD':           ['FAIZABAD', 'AYODHYA'],
  'AYODHYA':            ['FAIZABAD', 'AYODHYA'],
  'AMROHA':             ['AMROHA', 'JP NAGAR'],
  'MEERUT':             ['MEERUT'],
  'BAGHPAT':            ['BAGHPAT'],
  'GHAZIABAD':          ['GHAZIABAD'],
  'GAUTAM BUDDHA NAGAR':['GAUTAM BUDDHA NAGAR', 'NOIDA'],
  'BULANDSHAHR':        ['BULANDSHAHR'],
  'ALIGARH':            ['ALIGARH'],
  'HATHRAS':            ['HATHRAS'],
  'MATHURA':            ['MATHURA'],
  'AGRA':               ['AGRA'],
  'FIROZABAD':          ['FIROZABAD'],
  'MAINPURI':           ['MAINPURI'],
  'ETAH':               ['ETAH'],
  'BAREILLY':           ['BAREILLY'],
  'AONLA':              ['AONLA'],
  'BIJNOR':             ['BIJNOR'],
  'NAGINA':             ['NAGINA'],
  'MORADABAD':          ['MORADABAD'],
  'SAMBHAL':            ['SAMBHAL', 'BHIM NAGAR'],
  'ETAWAH':             ['ETAWAH'],
  'KANNAUJ':            ['KANNAUJ'],
  'KANPUR':             ['KANPUR'],
  'AKBARPUR':           ['AKBARPUR'],
  'JHANSI':             ['JHANSI'],
  'HAMIRPUR':           ['HAMIRPUR'],
  'JALAUN':             ['JALAUN'],
  'AZAMGARH':           ['AZAMGARH'],
  'LALGANJ':            ['LAL GANJ'],
  'LAL GANJ':           ['LALGANJ'],
  'VARANASI':           ['VARANASI'],
  'BHADOHI':            ['BHADOHI', 'SANT RAVIDAS NAGAR'],
  'MIRZAPUR':           ['MIRZAPUR'],
  'ROBERTSGANJ':        ['ROBERTSGANJ', 'SONBHADRA'],
  'GORAKHPUR':          ['GORAKHPUR'],
  'KUSHI NAGAR':        ['KUSHINAGAR', 'KUSHI NAGAR'],
  'KUSHINAGAR':         ['KUSHI NAGAR', 'KUSHINAGAR'],
  'DEORIA':             ['DEORIA'],
  'BANSGAON':           ['BANSGAON'],
  'BALLIA':             ['BALLIA'],
  'BALIA':              ['BALLIA'],
  'GHOSI':              ['GHOSI'],
  'SALEMPUR':           ['SALEMPUR'],
  'BALLIPUR':           ['BALLIPUR'],
  'MAHA RAJA GANJ':     ['MAHARAJGANJ'],
  'MAHARAJGANJ':        ['MAHA RAJA GANJ', 'MAHARAJGANJ'],
  'SANT KABIR NAGAR':   ['SANT KABIR NAGAR'],
  'BASTI':              ['BASTI'],
  'KHALILABAD':         ['KHALILABAD', 'SANT KABIR NAGAR'],
  'SHRAWASTI':          ['SHRAVASTI'],
  'DOMARIYAGANJ':       ['DOMARIYAGANJ'],
  'GHAZIPUR':           ['GHAZIPUR'],
  'CHANDAULI':          ['CHANDAULI'],
  'JAUNPUR':            ['JAUNPUR'],
  'MACHHLISHAHR':       ['MACHHALI SHAHAR', 'MACHHLISHAHR'],
  'SITAMARHI':          ['SITAMARHI', 'SHEOHAR'],
  // States
  'NORTH EAST DELHI':   ['NORTH EAST DELHI', 'NORTHEAST DELHI'],
  'NORTH WEST DELHI':   ['NORTH WEST DELHI', 'NORTHWEST DELHI'],
  'OUTER DELHI':        ['OUTER DELHI'],
  'CHANDNI CHOWK':      ['CHANDNI CHOWK'],
  'EAST DELHI':         ['EAST DELHI'],
  'NEW DELHI':          ['NEW DELHI'],
  'WEST DELHI':         ['WEST DELHI'],
  'SOUTH DELHI':        ['SOUTH DELHI'],
  // Renamed constituencies
  'UDHAM SINGH NAGAR':  ['UDHAM SINGH NAGAR', 'KASHIPUR'],
  'ALMORA':             ['ALMORA'],
  'NAINITAL':           ['NAINITAL UDHAMSINGH NAGAR', 'NAINITAL'],
  'TEHRI GARHWAL':      ['TEHRI GARHWAL'],
  'PAURI GARHWAL':      ['GARHWAL', 'PAURI GARHWAL'],
  'HARIDWAR':           ['HARIDWAR'],
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normName(n: string): string {
  return n
    .toUpperCase()
    .replace(/\b(DR|MR|MRS|MS|SHRI|SHRIMATI|SMT|KM|ADV|PROF|LT|COL|CAPT|GEN|BRIG|MAJ|SH|SRI|SRIMATI|KUMARI|KU|KHAN|BEGUM)\b\.?\s*/g, '')
    .replace(/\./g, ' ')   // A. Raja → A  Raja
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normConst(c: string): string {
  return c
    .toUpperCase()
    .replace(/\s*\(\s*(SC|ST|GEN|OBC)\s*\)\s*/g, '')
    .replace(/^\d+[\-\s]+/, '')   // remove leading "10- " or "10 "
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normState(s: string): string {
  return s.toUpperCase().replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim()
}

// ─── Similarity ───────────────────────────────────────────────────────────────

function words(s: string): string[] {
  return s.split(' ').filter(w => w.length > 1)
}

function jaccard(a: string, b: string): number {
  const aW = new Set(words(a))
  const bW = new Set(words(b))
  if (!aW.size || !bW.size) return 0
  const inter = [...aW].filter(w => bW.has(w)).length
  return inter / new Set([...aW, ...bW]).size
}

function nameSimilar(db: string, csv: string): boolean {
  if (db === csv) return true
  if (jaccard(db, csv) >= 0.5) return true
  // Word subset — all words of shorter in longer
  const aW = words(db), bW = words(csv)
  const [shorter, longer] = aW.length <= bW.length ? [aW, bW] : [bW, aW]
  if (shorter.length >= 2) {
    const m = shorter.filter(w => longer.includes(w)).length
    if (m === shorter.length) return true
    if (m / shorter.length >= 0.8) return true
  }
  // Single-initial match: "A RAJA" matches "A RAJA" (already handled) or "ARUNACHALAM RAJA"
  // If db has a single-letter word, check it matches first letter of a csv word
  const singleLetters = aW.filter(w => w.length === 1)
  if (singleLetters.length > 0 && aW.length >= 2) {
    const lastWords = aW.filter(w => w.length > 1)
    const csvLastMatch = lastWords.filter(w => bW.includes(w)).length
    if (csvLastMatch >= lastWords.length * 0.8) return true
  }
  return false
}

function constMatch(dbConst: string, csvConst: string): boolean {
  if (dbConst === csvConst) return true
  if (jaccard(dbConst, csvConst) >= 0.65) return true
  // Check aliases
  const aliases = CONST_ALIASES[dbConst] ?? []
  if (aliases.some(a => normConst(a) === csvConst)) return true
  // Word subset
  const dW = words(dbConst).filter(w => w.length > 2)
  const cW = words(csvConst).filter(w => w.length > 2)
  if (dW.length === 0 || cW.length === 0) return false
  const m = dW.filter(w => cW.includes(w)).length
  return m / Math.max(dW.length, cW.length) >= 0.75
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const sep  = lines[0].includes('\t') ? '\t' : ','
  const hdrs = splitLine(lines[0], sep).map(h =>
    h.trim().toLowerCase().replace(/"/g, '').replace(/-/g, '_')
  )
  return lines.slice(1).map(line => {
    const vals = splitLine(line, sep)
    const obj: Record<string, string> = {}
    hdrs.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim().replace(/^"|"$/g, '') })
    return obj
  })
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === sep && !inQ) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}

// ─── Build ranked candidates ──────────────────────────────────────────────────

function buildCandidates(
  rows: Record<string, string>[],
  year: number,
  getName:  (r: Record<string, string>) => string,
  getConst: (r: Record<string, string>) => string,
  getState: (r: Record<string, string>) => string,
  getParty: (r: Record<string, string>) => string,
  getVotes: (r: Record<string, string>) => number,
): RawCandidate[] {
  const groups = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    const key = `${normState(getState(r))}||${normConst(getConst(r))}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  const result: RawCandidate[] = []
  for (const cands of groups.values()) {
    const sorted = [...cands].sort((a, b) => getVotes(b) - getVotes(a))
    const total  = sorted.reduce((s, c) => s + getVotes(c), 0)
    if (total === 0) continue
    const margin = sorted.length > 1 ? getVotes(sorted[0]) - getVotes(sorted[1]) : null

    sorted.forEach((cand, idx) => {
      const v = getVotes(cand), c = getConst(cand), st = getState(cand)
      result.push({
        year, constituency: c, state: st, party: getParty(cand),
        votes: v, total_votes: total,
        vote_pct: Math.round((v / total) * 10000) / 100,
        rank: idx + 1, won: idx === 0,
        margin: idx === 0 ? margin : null,
        _normName:  normName(getName(cand)),
        _normConst: normConst(c),
        _normState: normState(st),
      })
    })
  }
  return result
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  console.log(`  GET ${url.slice(0, 100)}`)
  const r = await fetch(url, { headers: { 'User-Agent': 'TruthTrack/1.0' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

async function fetchParliamentYear(year: number): Promise<RawCandidate[]> {
  const text = await fetchText(
    'https://raw.githubusercontent.com/datameet/india-election-data/master/parliament-elections/parliament.csv'
  )
  const rows = parseCSV(text).filter(r => r.year === String(year))
  console.log(`  ${year} rows: ${rows.length}`)
  return buildCandidates(rows, year,
    r => r.name ?? '',
    r => r.pc   ?? '',
    r => r.state ?? '',
    r => r.party ?? '',
    r => parseInt((r.votes ?? '0').replace(/,/g, '')) || 0,
  )
}

async function fetch2014(): Promise<RawCandidate[]> {
  const text = await fetchText(
    'https://raw.githubusercontent.com/datameet/india-election-data/master/parliament-elections/election2014/eci-candidate-wise.csv'
  )
  const rows = parseCSV(text)
  return buildCandidates(rows, 2014,
    r => r.candidate ?? '',
    r => r.constituency ?? '',
    r => r.state ?? '',
    r => r.party ?? '',
    r => parseInt((r.votes ?? '0').replace(/,/g, '')) || 0,
  )
}

// ─── Match ────────────────────────────────────────────────────────────────────

function matchMP(
  dbName: string,
  dbConst: string,
  dbState: string,
  all: RawCandidate[],
): { entries: ElectionEntry[]; method: string } {
  const normN  = normName(dbName)
  const normC  = normConst(dbConst)
  const normSt = normState(dbState)

  // ── Pass 1: strict constituency ──────────────────────────────────────────
  let byConst = all.filter(c => c._normConst === normC)

  // ── Pass 2: fuzzy constituency ───────────────────────────────────────────
  if (byConst.length === 0) {
    byConst = all.filter(c => constMatch(normC, c._normConst))
  }

  // ── Pass 3: state-scoped only (constituency completely different) ─────────
  // Use if still no match — broader but better than nothing
  let method = 'constituency'
  if (byConst.length === 0) {
    byConst = all.filter(c => c._normState === normSt)
    method  = 'state-only'
  }

  if (byConst.length === 0) return { entries: [], method: 'no-match' }

  // Name match
  const nameMatches = byConst.filter(c => nameSimilar(normN, c._normName))
  if (nameMatches.length === 0) return { entries: [], method: `${method}+name-fail` }

  // Dedupe by year
  const byYear = new Map<number, RawCandidate>()
  for (const c of nameMatches) {
    const ex = byYear.get(c.year)
    if (!ex || jaccard(normN, c._normName) > jaccard(normN, ex._normName)) {
      byYear.set(c.year, c)
    }
  }

  // For state-only matches, verify the result makes sense (name match ≥ 0.5)
  const entries = [...byYear.values()]
    .filter(c => method !== 'state-only' || jaccard(normN, c._normName) >= 0.5)
    .sort((a, b) => a.year - b.year)
    .map(({ _normName, _normConst, _normState, ...e }) => e)

  return { entries, method }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📊 TruthTrack — Day 4: Fetch Election History (v5)\n')

  const all: RawCandidate[] = []

  for (const year of [2004, 2009]) {
    console.log(`── ${year} (parliament.csv) ──`)
    try {
      const r = await fetchParliamentYear(year)
      console.log(`  ✓ ${r.length} candidates`)
      all.push(...r)
    } catch (e: any) { console.warn('  ✗', e.message) }
    console.log()
  }

  console.log('── 2014 (eci-candidate-wise.csv) ──')
  try {
    const r = await fetch2014()
    console.log(`  ✓ ${r.length} candidates`)
    all.push(...r)
  } catch (e: any) { console.warn('  ✗', e.message) }
  console.log()

  console.log(`Total candidates: ${all.length} | Years: ${[...new Set(all.map(c => c.year))].join(', ')}\n`)

  // Load MPs
  console.log('Loading MPs from Supabase…')
  const { data: mps, error } = await supabase
    .from('politicians')
    .select('id, name, constituency, state, party')
    .eq('house', 'Lok Sabha')
  if (error || !mps) { console.error(error); process.exit(1) }
  console.log(`${mps.length} MPs loaded\n`)

  // Match
  const output:    { id: string; name: string; history: ElectionEntry[] }[] = []
  const debugFail: { name: string; constituency: string; state: string; reason: string }[] = []
  const methodStats: Record<string, number> = {}

  for (const mp of mps) {
    const { entries, method } = matchMP(mp.name, mp.constituency, mp.state ?? '', all)
    methodStats[method] = (methodStats[method] ?? 0) + 1

    // 2024 synthetic win — all sitting MPs won 2024
    const entry2024: ElectionEntry = {
      year: 2024, constituency: mp.constituency, state: mp.state ?? '',
      party: mp.party, votes: 0, total_votes: 0, vote_pct: 0,
      rank: 1, won: true, margin: null,
    }

    output.push({ id: mp.id, name: mp.name, history: [...entries, entry2024] })

    if (entries.length === 0) {
      debugFail.push({
        name: mp.name,
        constituency: mp.constituency,
        state: mp.state ?? '',
        reason: method,
      })
    }
  }

  const withPrior = output.filter(o => o.history.length > 1).length
  console.log(`\n✅ With prior history : ${withPrior} / ${mps.length}`)
  console.log(`✅ With 2024 entry    : ${mps.length} / ${mps.length}`)
  console.log('\nMatch method breakdown:')
  Object.entries(methodStats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(25)} ${v}`)
  })

  // Save
  fs.writeFileSync(path.join(process.cwd(), 'scripts', 'election-history.json'),
    JSON.stringify(output, null, 2))

  // Save debug report — sorted by reason
  const byReason = debugFail.sort((a, b) => a.reason.localeCompare(b.reason))
  fs.writeFileSync(path.join(process.cwd(), 'scripts', 'election-debug.json'),
    JSON.stringify(byReason, null, 2))

  console.log(`\nFiles written:`)
  console.log(`  election-history.json  ← ${output.length} MPs`)
  console.log(`  election-debug.json    ← ${debugFail.length} failures with reasons\n`)

  // Print constituency name samples to help fix aliases
  console.log('Sample failures (constituency mismatch):')
  byReason.filter(f => f.reason.includes('name-fail') || f.reason === 'no-match')
    .slice(0, 20)
    .forEach(f => {
      const normC = f.constituency.toUpperCase().replace(/\s*\(\s*(SC|ST|GEN|OBC)\s*\)\s*/g, '').replace(/[^A-Z\s]/g, '').trim()
      console.log(`  "${f.name}" | "${f.constituency}" → "${normC}" [${f.state}] (${f.reason})`)
    })
}

main().catch(console.error)