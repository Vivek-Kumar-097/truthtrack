/**
 * TruthTrack — MyNeta Assets Scraper (Puppeteer fallback)
 * scripts/scrape-myneta-assets-puppeteer.ts
 *
 * Handles MPs whose pages use JavaScript obfuscation to render asset numbers.
 * Uses Puppeteer to execute JS and read the fully-rendered DOM.
 *
 * INSTALL:  npm install puppeteer
 * USAGE:    npx ts-node --esm scripts/scrape-myneta-assets-puppeteer.ts
 * DEBUG:    DEBUG_ID=8745 npx ts-node --esm scripts/scrape-myneta-assets-puppeteer.ts
 */

import * as fs   from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLEAN     = path.join(__dirname, 'myneta-clean.json')
const BASE      = 'https://myneta.info/LokSabha2024'
const DELAY_MS  = 1500

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseRupees(s: string): number | null {
  if (!s) return null
  const m = s.match(/Rs\.?\s*([\d,]+)/)
  if (m) return parseInt(m[1].replace(/,/g, ''), 10)
  const m2 = s.match(/^[\d,]+/)
  if (m2) return parseInt(m2[0].replace(/,/g, ''), 10)
  return null
}

/**
 * Wait for asset tables to appear then extract values.
 * MyNeta JS-obfuscated pages inject tables dynamically after load.
 * We wait for the movable_assets table id OR a known header text.
 */
async function extractAssets(page: any, debug = false): Promise<{
  assets_2024: number | null
  liabilities: number | null
  _debug?: any
}> {
  // Wait up to 10s for asset tables to be injected by JS
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('Movable Assets') &&
            document.body.innerText.includes('Immovable'),
      { timeout: 10000 }
    )
  } catch {
    // Timeout — page might genuinely have no asset data
  }

  // Extra wait for all deferred scripts to finish
  await sleep(1500)

  return await page.evaluate((isDebug: boolean) => {
    function parseRupeesDOM(s: string): number | null {
      if (!s) return null
      const m = s.match(/Rs\.?\s*([\d,]+)/)
      if (m) return parseInt(m[1].replace(/,/g, ''), 10)
      const m2 = s.match(/^[\d,]+/)
      if (m2) return parseInt(m2[0].replace(/,/g, ''), 10)
      return null
    }

    function lastNonNilCell(row: Element): string {
      const cells = Array.from(row.querySelectorAll('td'))
        .map((td: any) => (td.innerText || '').replace(/\u00a0/g, ' ').trim())
        .filter(t => t && t !== 'Nil' && t !== '-' && !/^\s*$/.test(t))
      return cells[cells.length - 1] ?? ''
    }

    // Strategy 1: table id anchors (pages that have them)
    function tryByTableId(): { movable: number|null, immovable: number|null, liabilities: number|null } {
      let movable: number|null = null
      let immovable: number|null = null
      let liabilities: number|null = null

      const movTable = document.querySelector('[id^="movab"]') ||
                       document.querySelector('[id="movable_assets"]')
      const immTable = document.querySelector('[id="immovable_assets"]')
      const liabTable = document.querySelector('[id="liabilities"]')

      if (movTable) {
        for (const row of Array.from(movTable.querySelectorAll('tr'))) {
          const t = (row as any).innerText.replace(/\u00a0/g, ' ').toLowerCase()
          if (/totals\s*\(calculated/.test(t) || /gross total value/.test(t)) {
            movable = parseRupeesDOM(lastNonNilCell(row))
            if (movable !== null) break
          }
        }
      }
      if (immTable) {
        for (const row of Array.from(immTable.querySelectorAll('tr'))) {
          const t = (row as any).innerText.replace(/\u00a0/g, ' ').toLowerCase()
          if (/total current market value/.test(t) || /totals calculated/.test(t)) {
            immovable = parseRupeesDOM(lastNonNilCell(row))
            if (immovable !== null) break
          }
        }
      }
      if (liabTable) {
        for (const row of Array.from(liabTable.querySelectorAll('tr'))) {
          const t = (row as any).innerText.replace(/\u00a0/g, ' ').toLowerCase()
          if (/grand total of liabilit/.test(t) || /totals calculated/.test(t) || /total liabilit/.test(t)) {
            liabilities = parseRupeesDOM(lastNonNilCell(row))
            if (liabilities !== null) break
          }
        }
      }

      return { movable, immovable, liabilities }
    }

    // Strategy 2: scan ALL rows by section header text (pages without table ids)
    function tryBySectionScan(): { movable: number|null, immovable: number|null, liabilities: number|null } {
      let movable: number|null = null
      let immovable: number|null = null
      let liabilities: number|null = null
      let section: string = 'none'

      const allRows = Array.from(document.querySelectorAll('tr'))

      for (const row of allRows) {
        const t = (row as any).innerText.replace(/\u00a0/g, ' ').toLowerCase().trim()
        if (!t) continue

        if (/details of movable assets/.test(t))   { section = 'movable';   continue }
        if (/details of immovable assets/.test(t)) { section = 'immovable'; continue }
        if (/details of liabilit/.test(t))         { section = 'liability'; continue }

        if (section === 'movable' && movable === null) {
          if (/totals\s*\(calculated/.test(t) || /gross total value/.test(t)) {
            movable = parseRupeesDOM(lastNonNilCell(row))
          }
        }
        if (section === 'immovable' && immovable === null) {
          if (/total current market value/.test(t) || /totals calculated/.test(t)) {
            immovable = parseRupeesDOM(lastNonNilCell(row))
          }
        }
        if (section === 'liability' && liabilities === null) {
          if (/grand total of liabilit/.test(t) || /totals calculated/.test(t) || /total liabilit/.test(t)) {
            liabilities = parseRupeesDOM(lastNonNilCell(row))
          }
        }
      }

      return { movable, immovable, liabilities }
    }

    // Strategy 3: scan all <h3> headers and find adjacent tables
    function tryByH3Headers(): { movable: number|null, immovable: number|null, liabilities: number|null } {
      let movable: number|null = null
      let immovable: number|null = null
      let liabilities: number|null = null

      const headers = Array.from(document.querySelectorAll('h3, h2, b, strong'))
      for (const h of headers) {
        const t = (h as any).innerText.replace(/\u00a0/g, ' ').toLowerCase().trim()
        let targetField: 'movable' | 'immovable' | 'liability' | null = null

        if (/movable assets/.test(t) && !/immovable/.test(t)) targetField = 'movable'
        else if (/immovable assets/.test(t))                  targetField = 'immovable'
        else if (/details of liabilit/.test(t))               targetField = 'liability'

        if (!targetField) continue

        // Walk forward in DOM to find the next table
        let el: Element | null = h.parentElement
        let attempts = 0
        while (el && attempts < 10) {
          const table = el.querySelector('table') || el.nextElementSibling?.querySelector('table')
          if (table) {
            const rows = Array.from(table.querySelectorAll('tr'))
            for (const row of rows) {
              const rt = (row as any).innerText.replace(/\u00a0/g, ' ').toLowerCase()
              if (targetField === 'movable' && (/totals\s*\(calculated/.test(rt) || /gross total value/.test(rt))) {
                movable = parseRupeesDOM(lastNonNilCell(row))
              }
              if (targetField === 'immovable' && (/total current market value/.test(rt) || /totals calculated/.test(rt))) {
                immovable = parseRupeesDOM(lastNonNilCell(row))
              }
              if (targetField === 'liability' && (/grand total of liabilit/.test(rt) || /totals calculated/.test(rt))) {
                liabilities = parseRupeesDOM(lastNonNilCell(row))
              }
            }
            break
          }
          el = el.parentElement
          attempts++
        }
      }
      return { movable, immovable, liabilities }
    }

    // Try all three strategies, use first that gives a result
    const s1 = tryByTableId()
    const s2 = tryBySectionScan()
    const s3 = tryByH3Headers()

    const movable    = s1.movable    ?? s2.movable    ?? s3.movable
    const immovable  = s1.immovable  ?? s2.immovable  ?? s3.immovable
    const liabilities = s1.liabilities ?? s2.liabilities ?? s3.liabilities

    const assets_2024 = (movable !== null || immovable !== null)
      ? (movable ?? 0) + (immovable ?? 0)
      : null

    const result: any = { assets_2024, liabilities }
    if (isDebug) {
      result._debug = {
        s1, s2, s3,
        bodySnippet: document.body.innerText.slice(60000, 60500)
      }
    }
    return result
  }, debug)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CLEAN)) {
    console.error('❌ myneta-clean.json not found.')
    process.exit(1)
  }

  const data    = JSON.parse(fs.readFileSync(CLEAN, 'utf-8'))
  const winners: any[] = data.winners
  const DEBUG_ID = process.env.DEBUG_ID ? parseInt(process.env.DEBUG_ID) : null

  console.log('\n🤖 TruthTrack — MyNeta Assets Scraper (Puppeteer)')

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')

    // ── Debug mode ─────────────────────────────────────────────────────────
    if (DEBUG_ID) {
      console.log(`\n🔍 DEBUG mode — candidate_id=${DEBUG_ID}`)
      await page.goto(`${BASE}/candidate.php?candidate_id=${DEBUG_ID}`, { waitUntil: 'networkidle2', timeout: 30000 })
      const result = await extractAssets(page, true) as any
      console.log('Parsed:   ', { assets_2024: result.assets_2024, liabilities: result.liabilities })
      console.log('Strategy 1 (table id):', result._debug?.s1)
      console.log('Strategy 2 (section scan):', result._debug?.s2)
      console.log('Strategy 3 (h3 headers):', result._debug?.s3)
      console.log('Body snippet (60000-60500):')
      console.log(result._debug?.bodySnippet)
      await browser.close()
      process.exit(0)
    }

    // ── Full scrape ─────────────────────────────────────────────────────────
    const RESCRAPE = !!process.env.RESCRAPE
    const todo = RESCRAPE
      ? winners
      : winners.filter(w => w.assets_2024 === null || w.assets_2024 === undefined)

    console.log(`   Total MPs:    ${winners.length}`)
    console.log(`   Already done: ${winners.length - todo.length}`)
    console.log(`   To scrape:    ${todo.length}\n`)

    if (todo.length === 0) {
      console.log('✅ All MPs have asset data!')
      await browser.close()
      process.exit(0)
    }

    let success = 0, failed = 0, nulls = 0

    for (let i = 0; i < todo.length; i++) {
      const mp  = todo[i]
      const url = `${BASE}/candidate.php?candidate_id=${mp.myneta_id}`
      const pct = `[${String(i + 1).padStart(3)}/${todo.length}]`

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
        const result = await extractAssets(page) as any
        const { assets_2024, liabilities } = result

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

      if ((i + 1) % 10 === 0) {
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

    console.log('\n💎 Top 10 richest MPs:')
    for (const mp of richest) {
      console.log(`   ${mp.name.padEnd(38)} ₹${(mp.assets_2024/1e7).toFixed(2)} Cr  (${mp.party})`)
    }

    console.log('\n✅ Done! Now run: npx ts-node --esm scripts/merge-myneta.ts')

  } finally {
    await browser.close()
  }
}

main().catch(e => { console.error('💥', e.message); process.exit(1) })