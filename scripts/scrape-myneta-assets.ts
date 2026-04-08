/**
 * TruthTrack — MyNeta Assets Scraper
 * scripts/scrape-myneta-assets.ts
 *
 * WHAT IT DOES:
 * 1. Reads myneta-clean.json for the list of MPs + their myneta_id
 * 2. For each MP, fetches their individual affidavit page:
 *    https://myneta.info/LokSabha2024/candidate.php?candidate_id=XXXX
 * 3. Parses movable + immovable totals → assets_2024, plus liabilities
 * 4. Patches myneta-clean.json in-place (resume-safe)
 *
 * PAGE STRUCTURE (confirmed from id=7591 Abdul Rashid Sheikh):
 *   The page has a SUMMARY section near the top (pos ~8890) that mentions
 *   "Liabilities" — html.search() would hit this first and give wrong results.
 *   We anchor to unique table id attributes instead:
 *     id="movab..."          → movable assets table     (~pos 16004)
 *     id="immovable_assets"  → immovable assets table   (~pos 24330)
 *     id="liabilities"       → liabilities table        (~pos 30412)
 *
 *   Within each table, we find the totals row by label:
 *     Movable:   "Totals (Calculated as Sum of Values)" → last non-nil <td>
 *     Immovable: "Total Current Market Value..."        → last non-nil <td>
 *     Liability: "Totals Calculated"                   → last non-nil <td>
 *
 *   assets_2024 = movable + immovable
 *
 * USAGE:
 *   npx ts-node --esm scripts/scrape-myneta-assets.ts
 *   DEBUG_ID=7591 npx ts-node --esm scripts/scrape-myneta-assets.ts
 */

import * as fs   from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLEAN     = path.join(__dirname, 'myneta-clean.json')
const BASE      = 'https://myneta.info/LokSabha2024'
const DELAY_MS  = 800

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml',
          'Referer':    'https://myneta.info/',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e: any) {
      if (i === retries - 1) throw e
      console.warn(`   ⚠️  Retry ${i + 1}/${retries} — ${e.message}`)
      await sleep(2000 * (i + 1))
    }
  }
  throw new Error('All retries failed')
}

/** Parse "Rs 1,55,00,000 1 Crore+" → 15500000 */
function parseRupees(s: string): number | null {
  if (!s) return null
  const m = s.match(/Rs\.?\s*([\d,]+)/)
  if (m) return parseInt(m[1].replace(/,/g, ''), 10)
  // bare number with no Rs prefix (some cells)
  const m2 = s.match(/^[\d,]+/)
  if (m2) return parseInt(m2[0].replace(/,/g, ''), 10)
  return null
}

/** Get the last non-empty, non-Nil cell text from a <tr> HTML string */
function lastCell(rowHtml: string): string {
  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(c => stripTags(c[1]))
    .filter(c => c.length > 0 && c !== 'Nil')
  return cells[cells.length - 1] ?? ''
}

/**
 * Parse assets and liabilities from a MyNeta candidate affidavit page.
 * Anchors to table id attributes to skip the early summary section.
 */
function parseAssets(html: string): { assets_2024: number | null; liabilities: number | null } {
  // Anchor to table ids — unique, appear only in the detailed affidavit section
  const movableIdx   = html.search(/id=['"]?movab/i)
  const immovableIdx = html.search(/id=['"]?immovable_assets/i)
  const liabilityIdx = html.search(/id=['"]?liabilit[^y]/i)  // "liabilities" table id, not "Liability" row label

  let movable:     number | null = null
  let immovable:   number | null = null
  let liabilities: number | null = null

  // ── Movable section ───────────────────────────────────────────────────────
  if (movableIdx !== -1) {
    const end     = immovableIdx !== -1 ? immovableIdx : html.length
    const section = html.slice(movableIdx, end)
    for (const rm of section.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
      const label = stripTags(rm[0]).toLowerCase()
      if (/totals\s*\(calculated/.test(label) || /gross total value/.test(label)) {
        movable = parseRupees(lastCell(rm[0]))
        if (movable !== null) break
      }
    }
  }

  // ── Immovable section ─────────────────────────────────────────────────────
  if (immovableIdx !== -1) {
    const end     = liabilityIdx !== -1 ? liabilityIdx : html.length
    const section = html.slice(immovableIdx, end)
    for (const ri of section.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
      const label = stripTags(ri[0]).toLowerCase()
      if (/total current market value/.test(label) || /totals calculated/.test(label)) {
        immovable = parseRupees(lastCell(ri[0]))
        if (immovable !== null) break
      }
    }
  }

  // ── Liabilities section ───────────────────────────────────────────────────
  if (liabilityIdx !== -1) {
    const section = html.slice(liabilityIdx)
    for (const rl of section.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
      const label = stripTags(rl[0]).toLowerCase()
      if (/grand total of liabilit/.test(label) || /totals calculated/.test(label) || /total liabilit/.test(label)) {
        liabilities = parseRupees(lastCell(rl[0]))
        if (liabilities !== null) break
      }
    }
  }

  // Sum movable + immovable
  const assets_2024 = (movable !== null || immovable !== null)
    ? (movable ?? 0) + (immovable ?? 0)
    : null

  return { assets_2024, liabilities }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CLEAN)) {
    console.error('❌ myneta-clean.json not found. Run clean-myneta.ts first.')
    process.exit(1)
  }

  const data    = JSON.parse(fs.readFileSync(CLEAN, 'utf-8'))
  const winners: any[] = data.winners

  // ── Debug mode ─────────────────────────────────────────────────────────────
  const DEBUG_ID = process.env.DEBUG_ID ? parseInt(process.env.DEBUG_ID) : null
  if (DEBUG_ID) {
    console.log(`\n🔍 DEBUG mode — candidate_id=${DEBUG_ID}`)
    const url  = `${BASE}/candidate.php?candidate_id=${DEBUG_ID}`
    const html = await fetchHtml(url)

    const movableIdx   = html.search(/id=['"]?movab/i)
    const immovableIdx = html.search(/id=['"]?immovable_assets/i)
    const liabilityIdx = html.search(/id=['"]?liabilit[^y]/i)
    console.log('Table id anchors found at:', { movableIdx, immovableIdx, liabilityIdx })
    if (movableIdx   !== -1) console.log('MOVABLE ctx:  ', JSON.stringify(html.slice(movableIdx,   movableIdx   + 60)))
    if (immovableIdx !== -1) console.log('IMMOVABLE ctx:', JSON.stringify(html.slice(immovableIdx, immovableIdx + 60)))
    if (liabilityIdx !== -1) console.log('LIABILITY ctx:', JSON.stringify(html.slice(liabilityIdx, liabilityIdx + 60)))

    const result = parseAssets(html)
    console.log('\nParsed:  ', result)
    console.log('Expected:', { assets_2024: 15637424, liabilities: 1442558 })
    process.exit(0)
  }

  // ── Full scrape ────────────────────────────────────────────────────────────
  const todo = winners.filter(w => w.assets_2024 === null || w.assets_2024 === undefined)
  const done = winners.length - todo.length

  console.log(`\n💰 TruthTrack — MyNeta Assets Scraper`)
  console.log(`   Total MPs:    ${winners.length}`)
  console.log(`   Already done: ${done}`)
  console.log(`   To scrape:    ${todo.length}\n`)

  if (todo.length === 0) {
    console.log('✅ All assets already populated! Re-run with RESCRAPE=1 to force.')
    process.exit(0)
  }

  let success = 0
  let failed  = 0
  let nulls   = 0

  for (let i = 0; i < todo.length; i++) {
    const mp  = todo[i]
    const url = `${BASE}/candidate.php?candidate_id=${mp.myneta_id}`
    const pct = `[${String(i + 1).padStart(3)}/${todo.length}]`

    try {
      const html = await fetchHtml(url)
      const { assets_2024, liabilities } = parseAssets(html)

      const idx = winners.findIndex(w => w.myneta_id === mp.myneta_id)
      winners[idx].assets_2024 = assets_2024
      winners[idx].liabilities = liabilities

      if (assets_2024 !== null) {
        const cr = (assets_2024 / 1e7).toFixed(2)
        process.stdout.write(`✅ ${pct} ${mp.name.padEnd(38)} ₹${cr} Cr\n`)
        success++
      } else {
        process.stdout.write(`⬜ ${pct} ${mp.name.padEnd(38)} no assets found\n`)
        nulls++
      }
    } catch (e: any) {
      process.stdout.write(`❌ ${pct} ${mp.name.padEnd(38)} ERROR: ${e.message}\n`)
      failed++
    }

    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(CLEAN, JSON.stringify({ ...data, winners }, null, 2))
      console.log(`   💾 Progress saved (${i + 1}/${todo.length})`)
    }

    await sleep(DELAY_MS)
  }

  fs.writeFileSync(CLEAN, JSON.stringify({ ...data, winners }, null, 2))

  console.log('\n─────────────────────────────────────────────')
  console.log(`✅ Assets found:   ${success}`)
  console.log(`⬜ No data:        ${nulls}`)
  console.log(`❌ Errors:         ${failed}`)
  console.log(`💾 Saved to:       myneta-clean.json`)

  const richest = [...winners]
    .filter(w => w.assets_2024 !== null)
    .sort((a, b) => b.assets_2024 - a.assets_2024)
    .slice(0, 10)

  if (richest.length > 0) {
    console.log('\n💎 Top 10 richest MPs:')
    for (const mp of richest) {
      const cr = (mp.assets_2024 / 1e7).toFixed(2)
      console.log(`   ${mp.name.padEnd(38)} ₹${cr} Cr  (${mp.party})`)
    }
  }

  console.log('\n✅ Done! Now run: npx ts-node --esm scripts/merge-myneta.ts')
}

main().catch(e => { console.error('💥', e.message); process.exit(1) })