/**
 * TruthTrack — MyNeta Scraper v2 (Day 4)
 * scripts/scrape-myneta.ts
 *
 * STRATEGY (much faster than v1):
 * - Step 1: Scrape the winners page (all 543 MPs in one table)
 *   URL: https://www.myneta.info/LokSabha2024/index.php?action=show_winners&sort=candidate
 *   Gets: candidate_id, name, constituency, party, criminal_cases, assets, liabilities
 *
 * - Step 2: For MPs with criminal cases > 0, fetch their individual page
 *   URL: https://www.myneta.info/LokSabha2024/candidate.php?candidate_id=XXX
 *   Gets: IPC section details
 *
 * RESULT: ~543 + ~251 requests total instead of 8000+
 *
 * USAGE:
 *   npx ts-node --esm scripts/scrape-myneta.ts
 *   npx ts-node --esm scripts/merge-myneta.ts
 */

import * as fs   from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT    = path.join(__dirname, 'myneta-raw.json')
const BASE      = 'https://www.myneta.info/LokSabha2024'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ScrapedMP = {
  myneta_id:        number
  name:             string
  constituency:     string
  party:            string
  criminal_cases:   number
  criminal_details: { section: string; description: string }[]
  assets_2024:      number | null   // rupees
  liabilities:      number | null   // rupees
  scraped_at:       string
}

type SaveState = { winners: ScrapedMP[]; criminal_done: number[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Parse "Rs 3,09,16,833 ~ 3 Crore+" → integer rupees */
function parseRupees(s: string): number | null {
  if (!s || s.trim() === '' || s.trim() === 'Nil') return null
  // Extract the raw number before the ~
  const m = s.match(/Rs\s*([\d,]+)/)
  if (!m) return null
  return parseInt(m[1].replace(/,/g, ''), 10)
}

/** Strip HTML tags */
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim()

async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml',
          'Referer':    'https://www.myneta.info/',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      if (i === retries - 1) throw e
      console.warn(`   ⚠️  Retry ${i + 1}/${retries}`)
      await sleep(2000 * (i + 1))
    }
  }
  throw new Error('All retries failed')
}

// ─── Step 1: Parse winners table ──────────────────────────────────────────────
function parseWinnersPage(html: string): Omit<ScrapedMP, 'criminal_details' | 'scraped_at'>[] {
  const results: Omit<ScrapedMP, 'criminal_details' | 'scraped_at'>[] = []

  // Find all table rows (skip header)
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null

  while ((m = rowRegex.exec(html)) !== null) {
    const row = m[0]

    // Extract candidate_id from link
    const idMatch = /candidate\.php\?candidate_id=(\d+)/.exec(row)
    if (!idMatch) continue

    // Extract all <td> cells
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => stripTags(c[1]))
      .filter((_, i) => i > 0)   // skip Sno column

    if (cells.length < 6) continue

    const [nameRaw, constituency, party, criminalRaw, , assetsRaw, liabRaw] = cells

    // Skip if name looks like a header
    if (!nameRaw || nameRaw === 'Candidate') continue

    const criminal = parseInt(criminalRaw ?? '0', 10) || 0

    results.push({
      myneta_id:      parseInt(idMatch[1], 10),
      name:           nameRaw,
      constituency,
      party,
      criminal_cases: criminal,
      assets_2024:    parseRupees(assetsRaw ?? ''),
      liabilities:    parseRupees(liabRaw  ?? ''),
    })
  }

  return results
}

// ─── Step 2: Parse individual candidate page for IPC details ─────────────────
function parseCriminalDetails(html: string): { section: string; description: string }[] {
  const details: { section: string; description: string }[] = []

  // Look for a table/section containing IPC sections
  // MyNeta format: "Section 420 IPC - Cheating" etc.
  const sectionMatches = html.matchAll(/(?:Section|IPC|CrPC|PC|NDPS)[^\n<"]{2,60}/gi)
  const seen = new Set<string>()

  for (const match of sectionMatches) {
    const raw = match[0].trim()
    if (seen.has(raw) || raw.length < 5) continue
    seen.add(raw)

    // Split into section code and description if possible
    // e.g. "Section 420 IPC - Cheating" → section="IPC 420" desc="Cheating"
    const parts = raw.split(/\s*[-–:]\s*/)
    const section     = parts[0]?.trim() ?? raw
    const description = parts.slice(1).join(' ').trim() || 'See EC affidavit'

    if (section && !section.includes('http') && !section.includes('function')) {
      details.push({ section, description })
    }
  }

  return details.slice(0, 20)  // cap at 20 sections
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🕷️  TruthTrack MyNeta Scraper v2 — Day 4\n')

  // Load progress
  let state: SaveState = { winners: [], criminal_done: [] }
  if (fs.existsSync(OUTPUT)) {
    state = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'))
    console.log(`📂 Resuming — ${state.winners.length} winners, ${state.criminal_done.length} criminal details done\n`)
  }

  // ── Step 1: Winners table ─────────────────────────────────────────────
  if (state.winners.length === 0) {
    console.log('📋 Fetching winners table (all 543 MPs)...')
    const url  = `${BASE}/index.php?action=show_winners&sort=candidate`
    const html = await fetchHtml(url)
    const raw  = parseWinnersPage(html)

    state.winners = raw.map(w => ({ ...w, criminal_details: [], scraped_at: new Date().toISOString() }))
    fs.writeFileSync(OUTPUT, JSON.stringify(state, null, 2))
    console.log(`✅ Parsed ${state.winners.length} winners\n`)
  } else {
    console.log(`⏭️  Winners already loaded (${state.winners.length})\n`)
  }

  // ── Step 2: Criminal details for MPs with cases ───────────────────────
  const needCriminal = state.winners.filter(
    w => w.criminal_cases > 0 && !state.criminal_done.includes(w.myneta_id)
  )

  if (needCriminal.length > 0) {
    console.log(`⚖️  Fetching criminal details for ${needCriminal.length} MPs...\n`)
    let done = 0

    for (const mp of needCriminal) {
      const url  = `${BASE}/candidate.php?candidate_id=${mp.myneta_id}`
      try {
        const html    = await fetchHtml(url)
        const details = parseCriminalDetails(html)

        // Update in-place
        const idx = state.winners.findIndex(w => w.myneta_id === mp.myneta_id)
        if (idx >= 0) state.winners[idx].criminal_details = details
        state.criminal_done.push(mp.myneta_id)
        done++

        process.stdout.write(
          `\r   ✅ ${done}/${needCriminal.length} · ${mp.name} (${mp.criminal_cases} cases)`
        )

        if (done % 20 === 0) fs.writeFileSync(OUTPUT, JSON.stringify(state, null, 2))
      } catch (e) {
        console.warn(`\n   ⚠️  Failed: ${mp.name} — ${(e as Error).message}`)
      }
      await sleep(1000)
    }
    console.log('\n')
  }

  // Final save
  fs.writeFileSync(OUTPUT, JSON.stringify(state, null, 2))

  // Summary
  const withCrime   = state.winners.filter(w => w.criminal_cases > 0)
  const withAssets  = state.winners.filter(w => w.assets_2024 !== null)
  const croreClub   = state.winners.filter(w => (w.assets_2024 ?? 0) >= 10_000_000)

  console.log('📊 Summary:')
  console.log(`   Total MPs scraped:     ${state.winners.length}`)
  console.log(`   With criminal cases:   ${withCrime.length}`)
  console.log(`   With asset data:       ${withAssets.length}`)
  console.log(`   ₹10Cr+ (crore club):   ${croreClub.length}`)

  console.log('\n🚨 Top 5 by criminal cases:')
  withCrime
    .sort((a, b) => b.criminal_cases - a.criminal_cases)
    .slice(0, 5)
    .forEach(m => console.log(`   ${m.name} (${m.party}): ${m.criminal_cases} cases`))

  console.log('\n✅ Scrape complete!')
  console.log('   Saved to: scripts/myneta-raw.json')
  console.log('\n▶  Next: npx ts-node --esm scripts/merge-myneta.ts')
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1) })