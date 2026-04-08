/**
 * TruthTrack — MyNeta 2019 Asset Scraper (v7)
 * scripts/scrape-myneta-2019.ts
 *
 * TWO-PHASE strategy:
 *   Phase 1: all-winners page  → ~480 rows
 *   Phase 2: state-wise candidate pages for each state that has
 *            missing constituencies → extract winner rows (FFFF99 background)
 *
 * Uses Node built-in `https` module (works Node 14+, no fetch needed).
 *
 * USAGE:
 *   npx ts-node --esm scripts/scrape-myneta-2019.ts
 */

import * as fs    from 'fs'
import * as path  from 'path'
import * as https from 'https'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE      = 'https://www.myneta.info/LokSabha2019'
const DELAY_MS  = 500

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── HTTP GET ─────────────────────────────────────────────────────────────────
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; TruthTrack/1.0)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject)
      }
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks: Buffer[] = []
      res.on('data',  (c: Buffer) => chunks.push(c))
      res.on('end',   () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout: ${url}`)))
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRs(raw: string): number | null {
  if (!raw.toLowerCase().includes('rs')) return null
  const digits = raw.split('~')[0].replace(/[^0-9]/g, '')
  if (!digits || digits.length < 2) return null
  const v = parseInt(digits, 10)
  return isNaN(v) ? null : v
}

interface Winner {
  candidate_id:        number | null
  name:                string
  constituency:        string
  party:               string
  criminal_cases_2019: number
  assets_2019:         number | null
  liabilities_2019:    number | null
}

// ─── Parse all-winners page ───────────────────────────────────────────────────
// Columns: Sno | Candidate | Constituency | Party | Criminal | Education | Assets | Liabilities
function parseAllWinnersHtml(html: string): Winner[] {
  const out: Winner[] = []
  const start = html.indexOf('Constituency')
  if (start === -1) return out

  for (const rawRow of html.slice(start).split(/<tr[\s>]/i)) {
    const parts = rawRow.split(/<\/td>/i)
    if (parts.length < 7) continue
    const c = parts.map(p => p.replace(/^[\s\S]*?<td[^>]*>/i, ''))

    const sno = strip(c[0]).replace(/\D/g, '')
    if (!sno || sno.length > 4) continue

    const idM = c[1].match(/candidate_id=(\d+)/i)
    const name = strip(c[1])
    if (!name || name.length < 2) continue

    const constituency = strip(c[2])
    if (!constituency || constituency.length < 2) continue
    if (/BYE.?ELECTION/i.test(constituency)) continue

    const criminal = parseInt(strip(c[4]).replace(/\D/g, '') || '0') || 0

    out.push({
      candidate_id:        idM ? parseInt(idM[1]) : null,
      name,
      constituency,
      party:               strip(c[3]),
      criminal_cases_2019: criminal,
      assets_2019:         parseRs(c[6]),
      liabilities_2019:    c[7] ? parseRs(c[7]) : null,
    })
  }
  return out
}

// ─── Parse a state candidates page ───────────────────────────────────────────
// Columns: Sno | Candidate | Party | Criminal | Education | Age | Assets | Liabilities
// Winner rows have background-color:#FFFF99 or similar yellow
// Each row also shows constituency name in the header above the candidate group,
// BUT the flat table doesn't repeat constituency — we get it from the section header.
//
// Actually the show_constituencies page groups by constituency with a header row.
// Header rows look like: <tr><td colspan="8"><b>CONSTITUENCY NAME</b></td></tr>
// Then candidate rows follow until the next header.
function parseStateCandidatesHtml(html: string, wantedConsts: Set<string>): Winner[] {
  const out: Winner[] = []
  let currentConst = ''

  const rows = html.split(/<tr[\s>]/i)

  for (const rawRow of rows) {
    // Check if this is a constituency header row
    if (/colspan/i.test(rawRow)) {
      const hText = strip(rawRow).toUpperCase()
      // Find if any wanted constituency matches
      for (const wc of wantedConsts) {
        // Normalise for matching
        const norm = (s: string) => s.replace(/[^A-Z]/g, '')
        if (norm(hText).includes(norm(wc))) {
          currentConst = wc
          break
        }
      }
      // Check if it's any constituency at all (reset if not wanted)
      // Heuristic: header rows have short bold text
      if (!wantedConsts.has(currentConst)) {
        // Could be a different constituency we don't need
        // Keep currentConst as-is so we only collect wanted ones
      }
      continue
    }

    if (!currentConst) continue

    // Check if winner row (yellow background)
    if (!/FFFF99|ffff99/i.test(rawRow)) continue

    const parts = rawRow.split(/<\/td>/i)
    if (parts.length < 6) continue
    const c = parts.map(p => p.replace(/^[\s\S]*?<td[^>]*>/i, ''))

    // Find candidate cell (has candidate_id link)
    let name = '', candidateId = null as number | null
    for (const cell of c) {
      const m = cell.match(/candidate_id=(\d+)/i)
      if (m) { candidateId = parseInt(m[1]); name = strip(cell); break }
    }
    if (!name) continue

    // Assets and liabilities are in the last two meaningful cells
    // Scan from right for cells containing "Rs"
    let assets = null as number | null
    let liab   = null as number | null
    for (let i = c.length - 1; i >= 0 && (assets === null || liab === null); i--) {
      if (c[i].toLowerCase().includes('rs')) {
        if (liab === null)   liab   = parseRs(c[i])
        else if (assets === null) assets = parseRs(c[i])
      }
    }

    // Party: usually cell index 2
    const party    = c.length > 2 ? strip(c[2]) : ''
    const criminal = parseInt(strip(c[3] ?? '').replace(/\D/g,'') || '0') || 0

    out.push({
      candidate_id: candidateId,
      name,
      constituency: currentConst,
      party,
      criminal_cases_2019: criminal,
      assets_2019:         assets,
      liabilities_2019:    liab,
    })

    // Got winner for this constituency — stop looking
    wantedConsts.delete(currentConst)
    currentConst = ''
  }

  return out
}

// ─── State ID → missing constituencies map ────────────────────────────────────
// state_id values confirmed from myneta URL structure
const STATE_MISSING: Record<number, string[]> = {
  2:  ['ARUNACHAL EAST'],
  3:  ['DARANG UDALGURI', 'DIPHU', 'GUWAHATI', 'KAZIRANGA', 'NAGAON', 'SONITPUR'],
  4:  ['BHAGALPUR', 'MUNGER', 'PALAMAU', 'PATLIPUTRA', 'SAMASTIPUR'],
  7:  ['BANASKANTHA', 'BARDOLI', 'CHHOTA UDAIPUR', 'KACHCHH'],
  11: ['DAVANGERE', 'HASSAN'],
  12: ['ALATHUR', 'KOLLAM', 'MAVELIKKARA'],
  13: ['HOSHANGABAD', 'RAJNANDGAON', 'SATNA', 'TIKAMGARH', 'VIDISHA'],
  14: ['GADCHIROLI-CHIMUR', 'RAIGAD', 'RAVER', 'SHIRUR'],
  19: ['JAGATSINGHPUR', 'KENDRAPARA'],
  20: ['BATHINDA', 'PATIALA'],
  21: ['JALORE', 'NAGAUR'],
  23: ['KANCHEEPURAM', 'NILGIRIS'],
  24: ['BHONGIR', 'MALKAJGIRI'],
  25: ['TRIPURA WEST'],
  26: ['AKBARPUR', 'AMETHI', 'BADAUN', 'BANSGAON', 'DHAURAHRA',
       'FAIZABAD', 'GHAZIPUR', 'KARAKAT', 'KHERI', 'LUCKNOW',
       'MOHANLALGANJ', 'PRATAPGARH', 'SITAPUR', 'UNNAO'],
  27: ['TEHRI GARHWAL'],
  28: ['BARDHAMAN-DURGAPUR', 'BISHNUPUR', 'COOCHBEHAR', 'DARJEELING',
       'DUM DUM', 'JOYNAGAR', 'SRERAMPUR'],
  30: ['CHANDIGARH'],
  32: ['WEST DELHI'],
  33: ['SRINAGAR'],
  34: ['GUNTUR', 'KURNOOLU', 'NANDYAL', 'NARSARAOPET'],
}

// ─── Normalise constituency name for matching ─────────────────────────────────
function normConst(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '')
}

// ─── Phase 1 ──────────────────────────────────────────────────────────────────
async function phase1(): Promise<Winner[]> {
  console.log('📄 Phase 1: all-winners page...')
  const html = await httpGet(`${BASE}/index.php?action=show_winners&sort=default`)
  console.log(`   → ${(html.length/1024).toFixed(0)} KB`)
  const parsed = parseAllWinnersHtml(html)
  console.log(`   → ${parsed.length} rows parsed`)

  const seen = new Set<string>()
  const uniq = parsed.filter(w => {
    const k = normConst(w.constituency)
    if (seen.has(k)) return false
    seen.add(k); return true
  })
  console.log(`   → ${uniq.length} unique constituencies`)
  return uniq
}

// ─── Phase 2 ──────────────────────────────────────────────────────────────────
async function phase2(have: Set<string>): Promise<Winner[]> {
  const out: Winner[] = []

  // Only scrape states where we're actually missing something
  const statesToScrape: Record<number, string[]> = {}
  for (const [sid, consts] of Object.entries(STATE_MISSING)) {
    const needed = consts.filter(c => !have.has(normConst(c)))
    if (needed.length) statesToScrape[+sid] = needed
  }

  const stateCount = Object.keys(statesToScrape).length
  const constCount = Object.values(statesToScrape).flat().length
  console.log(`\n📄 Phase 2: ${constCount} constituencies across ${stateCount} states...`)

  let stateNum = 0
  for (const [sidStr, needed] of Object.entries(statesToScrape)) {
    const sid     = +sidStr
    stateNum++
    const wantSet = new Set(needed)
    process.stdout.write(`   [${stateNum}/${stateCount}] state_id=${sid} (${needed.length} needed)... `)

    try {
      // State candidates page — try page=1 first (some states paginate)
      const url  = `${BASE}/index.php?action=show_constituencies&state_id=${sid}&page=1`
      const html = await httpGet(url)
      process.stdout.write(`${(html.length/1024).toFixed(0)}KB `)

      const winners = parseStateCandidatesHtml(html, new Set(needed))
      process.stdout.write(`→ ${winners.length}/${needed.length} found\n`)

      // If paginated state, fetch more pages until all found or no more pages
      let page      = 2
      let remaining = new Set(needed.filter(c => !winners.some(w => normConst(w.constituency) === normConst(c))))

      while (remaining.size > 0) {
        // Check if page link exists in html
        if (!html.includes(`page=${page}`)) break

        await sleep(DELAY_MS)
        const url2 = `${BASE}/index.php?action=show_constituencies&state_id=${sid}&page=${page}`
        try {
          const html2 = await httpGet(url2)
          const more  = parseStateCandidatesHtml(html2, new Set([...remaining]))
          if (more.length === 0) break
          winners.push(...more)
          more.forEach(w => remaining.delete(w.constituency))
          page++
        } catch { break }
      }

      if (remaining.size > 0 && winners.length < needed.length) {
        // Report what we still couldn't get
        const stillMissing = needed.filter(c => !winners.some(w => normConst(w.constituency) === normConst(c)))
        if (stillMissing.length > 0) {
          console.log(`      ⚠️  Still missing: ${stillMissing.join(', ')}`)
        }
      }

      out.push(...winners)
    } catch (e: unknown) {
      console.log(`FAILED (${e instanceof Error ? e.message : String(e)})`)
    }

    await sleep(DELAY_MS)
  }

  return out
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function scrape() {
  console.log('\n🕸️  TruthTrack MyNeta 2019 Scraper (v7)\n')

  const p1    = await phase1()
  const haveN = new Set(p1.map(w => normConst(w.constituency)))

  const p2    = await phase2(haveN)

  // Merge — phase1 takes precedence, phase2 fills gaps
  const allByConst = new Map<string, Winner>()
  for (const w of p1) allByConst.set(normConst(w.constituency), w)
  for (const w of p2) {
    const k = normConst(w.constituency)
    if (!allByConst.has(k)) allByConst.set(k, w)
  }

  const final = [...allByConst.values()]
  console.log(`\n✅ Total unique constituencies: ${final.length} / 543`)

  // ── Validation ─────────────────────────────────────────────────────────────
  const checks = [
    { s: 'rahul gandhi',  cr: 15.9, label: 'Rahul Gandhi'  },
    { s: 'narendra modi', cr: 2.5,  label: 'Narendra Modi' },
    { s: 'amit shah',     cr: 40.0, label: 'Amit Shah'     },
    { s: 'rajnath singh', cr: 10.0, label: 'Rajnath Singh' },
    { s: 'shivraj',       cr: 3.0,  label: 'Shivraj Singh' },
  ]
  console.log('\n🔍 Validation:')
  for (const { s, cr, label } of checks) {
    const m = final.find(w => w.name.toLowerCase().includes(s))
    if (!m) { console.log(`   ❌ ${label} — NOT FOUND`); continue }
    const got = (m.assets_2019 ?? 0) / 1e7
    const ok  = Math.abs(got - cr) / cr < 0.20
    console.log(`   ${ok ? '✅' : '⚠️ '} ${label}: ₹${got.toFixed(2)}Cr (expected ~₹${cr}Cr)`)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const withA = final.filter(w => w.assets_2019 !== null)
  console.log(`\n📊 With asset data: ${withA.length} / ${final.length}`)
  const top5  = [...withA].sort((a,b) => (b.assets_2019??0)-(a.assets_2019??0)).slice(0,5)
  console.log('💎 Top 5:')
  top5.forEach(w => console.log(`   ₹${((w.assets_2019??0)/1e7).toFixed(0)}Cr  ${w.name} (${w.constituency})`))

  // ── Save ──────────────────────────────────────────────────────────────────
  const out = path.join(__dirname, 'myneta-2019.json')
  fs.writeFileSync(out, JSON.stringify({ winners: final, scraped_at: new Date().toISOString(), total: final.length }, null, 2))
  console.log(`\n💾 Saved → ${out}`)
  console.log('✅ Done!')
}

scrape().catch(e => {
  console.error('\n💥 Fatal:', e instanceof Error ? e.message : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})