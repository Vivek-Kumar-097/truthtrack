/**
 * TruthTrack — Scrape Missing 60 MPs
 * Reads scripts/missing-mps.json, fetches criminal details + assets
 * via Puppeteer, appends to scripts/myneta-clean.json
 *
 * USAGE: node scripts/scrape-missing-mps.js
 */

const puppeteer = require('puppeteer')
const fs        = require('fs')

const CLEAN   = 'scripts/myneta-clean.json'
const MISSING = 'scripts/missing-mps.json'
const BASE    = 'https://www.myneta.info/LokSabha2024'
const DELAY   = 1500

const sleep = ms => new Promise(r => setTimeout(r, ms))

function parseRupees(s) {
  if (!s) return null
  const m = s.match(/Rs\.?\s*([\d,]+)/)
  if (m) return parseInt(m[1].replace(/,/g, ''), 10)
  const m2 = s.match(/^[\d,]+/)
  if (m2) return parseInt(m2[0].replace(/,/g, ''), 10)
  return null
}

function lastNonNilCell(row) {
  const cells = Array.from(row.querySelectorAll('td'))
    .map(td => (td.innerText || '').replace(/\u00a0/g, ' ').trim())
    .filter(t => t && t !== 'Nil' && t !== '-')
  return cells[cells.length - 1] || ''
}

async function extractAssets(page) {
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('Movable Assets'),
      { timeout: 8000 }
    )
  } catch {}
  await sleep(1000)

  return await page.evaluate(() => {
    function parseRupeesDOM(s) {
      if (!s) return null
      const m = s.match(/Rs\.?\s*([\d,]+)/)
      if (m) return parseInt(m[1].replace(/,/g, ''), 10)
      const m2 = s.match(/^[\d,]+/)
      if (m2) return parseInt(m2[0].replace(/,/g, ''), 10)
      return null
    }
    function lastNonNil(row) {
      const cells = Array.from(row.querySelectorAll('td'))
        .map(td => (td.innerText||'').replace(/\u00a0/g,' ').trim())
        .filter(t => t && t !== 'Nil' && t !== '-')
      return cells[cells.length - 1] || ''
    }

    let movable = null, immovable = null, liabilities = null

    // Strategy 1: table ids
    const movTable  = document.querySelector('[id^="movab"]')
    const immTable  = document.querySelector('[id="immovable_assets"]')
    const liabTable = document.querySelector('[id="liabilities"]')

    if (movTable) {
      for (const row of movTable.querySelectorAll('tr')) {
        const t = (row.innerText||'').toLowerCase()
        if (/totals\s*\(calculated/.test(t) || /gross total value/.test(t)) {
          movable = parseRupeesDOM(lastNonNil(row)); if (movable !== null) break
        }
      }
    }
    if (immTable) {
      for (const row of immTable.querySelectorAll('tr')) {
        const t = (row.innerText||'').toLowerCase()
        if (/total current market value/.test(t) || /totals calculated/.test(t)) {
          immovable = parseRupeesDOM(lastNonNil(row)); if (immovable !== null) break
        }
      }
    }
    if (liabTable) {
      for (const row of liabTable.querySelectorAll('tr')) {
        const t = (row.innerText||'').toLowerCase()
        if (/grand total of liabilit/.test(t) || /totals calculated/.test(t)) {
          liabilities = parseRupeesDOM(lastNonNil(row)); if (liabilities !== null) break
        }
      }
    }

    // Strategy 2: section scan fallback
    if (movable === null && immovable === null) {
      let section = 'none'
      for (const row of document.querySelectorAll('tr')) {
        const t = (row.innerText||'').replace(/\u00a0/g,' ').toLowerCase().trim()
        if (/details of movable assets/.test(t))   { section = 'movable';   continue }
        if (/details of immovable assets/.test(t)) { section = 'immovable'; continue }
        if (/details of liabilit/.test(t))         { section = 'liability'; continue }
        if (section === 'movable' && movable === null) {
          if (/totals\s*\(calculated/.test(t) || /gross total value/.test(t))
            movable = parseRupeesDOM(lastNonNil(row))
        }
        if (section === 'immovable' && immovable === null) {
          if (/total current market value/.test(t) || /totals calculated/.test(t))
            immovable = parseRupeesDOM(lastNonNil(row))
        }
        if (section === 'liability' && liabilities === null) {
          if (/grand total of liabilit/.test(t) || /totals calculated/.test(t))
            liabilities = parseRupeesDOM(lastNonNil(row))
        }
      }
    }

    const assets_2024 = (movable !== null || immovable !== null)
      ? (movable || 0) + (immovable || 0) : null

    return { assets_2024, liabilities }
  })
}

async function extractCriminal(page) {
  await sleep(500)
  return await page.evaluate(() => {
    const details = []
    let inCriminal = false
    for (const row of document.querySelectorAll('tr')) {
      const t = (row.innerText||'').toLowerCase()
      if (/cases filed.*candidate/.test(t) || /criminal antecedents/.test(t)) {
        inCriminal = true; continue
      }
      if (!inCriminal) continue
      const tds = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim())
      if (tds.length >= 2 && tds[0] && !/^sr/i.test(tds[0]) && /ipc|section|act/i.test(tds[0])) {
        details.push({ section: tds[0], description: tds[1] || '' })
      }
    }
    return details
  })
}

;(async () => {
  if (!fs.existsSync(MISSING)) {
    console.error('missing-mps.json not found. Run find-missing-mps.js first.')
    process.exit(1)
  }

  const missing = JSON.parse(fs.readFileSync(MISSING, 'utf-8'))
  const data    = JSON.parse(fs.readFileSync(CLEAN,   'utf-8'))
  const winners = data.winners

  console.log(`\n🔍 Scraping ${missing.length} missing MPs...\n`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  let page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')

  let success = 0, failed = 0

  for (let i = 0; i < missing.length; i++) {
    const mp  = missing[i]
    const url = `${BASE}/candidate.php?candidate_id=${mp.myneta_id}`
    const pct = `[${String(i+1).padStart(2)}/${missing.length}]`

    try {
      // Recreate page if detached
      try { await page.evaluate(() => document.title) } catch {
        try { await page.close() } catch {}
        page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
      }

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

      const { assets_2024, liabilities } = await extractAssets(page)
      const criminal_details = await extractCriminal(page)

      const record = {
        myneta_id:       mp.myneta_id,
        name:            mp.name,
        constituency:    mp.constituency,
        party:           mp.party,
        criminal_cases:  mp.criminal_cases || 0,
        criminal_details,
        assets_2024,
        liabilities,
        scraped_at:      new Date().toISOString(),
      }

      winners.push(record)

      const cr = assets_2024 ? `₹${(assets_2024/1e7).toFixed(2)} Cr` : 'no assets'
      process.stdout.write(`✅ ${pct} ${mp.name.padEnd(40)} ${cr}\n`)
      success++

    } catch (e) {
      process.stdout.write(`❌ ${pct} ${mp.name.padEnd(40)} ERROR: ${e.message}\n`)
      failed++
    }

    // Save every 10
    if ((i + 1) % 10 === 0) {
      // Sort winners alphabetically
      winners.sort((a, b) => a.name.localeCompare(b.name))
      fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))
      console.log(`   💾 Saved (${i+1}/${missing.length})`)
    }

    await sleep(DELAY)
  }

  // Final save, sorted
  winners.sort((a, b) => a.name.localeCompare(b.name))
  fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))

  console.log('\n─────────────────────────────────────────────')
  console.log(`✅ Success: ${success}`)
  console.log(`❌ Failed:  ${failed}`)
  console.log(`📊 Total MPs now: ${winners.length}`)
  console.log('\n✅ Done! Now run: npx ts-node --esm scripts/merge-myneta.ts')

  await browser.close()
})()