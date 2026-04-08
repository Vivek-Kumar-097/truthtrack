/**
 * TruthTrack — Fix Criminal Data for 60 Missing MPs
 * Reads individual candidate pages via Puppeteer to get correct
 * criminal_cases count + IPC section details.
 *
 * USAGE: node scripts/fix-missing-criminal.js
 */

const puppeteer = require('puppeteer')
const fs        = require('fs')

const CLEAN = 'scripts/myneta-clean.json'
const BASE  = 'https://www.myneta.info/LokSabha2024'
const DELAY = 1200

// The 60 IDs we added from find-missing-mps.js
const MISSING_IDS = new Set([
  3490,20,5097,273,9380,16,5192,9427,9088,8022,4548,5268,8738,5122,7129,
  3589,5106,8110,3459,1881,2303,6416,5055,454,3093,5202,5079,7961,5252,
  3677,5128,3127,5294,5239,5174,9567,2240,6044,8542,1866,5183,3567,3493,
  2195,7124,2218,3797,8791,834,8561,1806,5057,4448,5317,2211,7090,4319,
  5211,3442,5111
])

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function extractCriminalFromPage(page) {
  return await page.evaluate(() => {
    // Get criminal cases count from the Crime-O-Meter or summary
    let criminal_cases = 0
    const body = document.body.innerText

    // Look for "Number of Criminal Cases: N"
    const countMatch = body.match(/Number of Criminal Cases[:\s]+(\d+)/i)
    if (countMatch) criminal_cases = parseInt(countMatch[1])

    // Also try the summary table
    if (!criminal_cases) {
      const rows = Array.from(document.querySelectorAll('tr'))
      for (const row of rows) {
        const t = row.innerText || ''
        const m = t.match(/criminal cases[:\s]+(\d+)/i)
        if (m) { criminal_cases = parseInt(m[1]); break }
      }
    }

    // Extract IPC sections from "Details of Criminal Cases" section
    const details = []
    const seen = new Set()

    // Method 1: bullet list items with "(IPC Section-NNN)"
    const bullets = Array.from(document.querySelectorAll('li'))
    for (const li of bullets) {
      const t = li.innerText.trim()
      const m = t.match(/\(IPC Section[- ](\d+[A-Za-z()]*)\)/)
      if (m) {
        const section = `IPC Section ${m[1]}`
        if (!seen.has(section)) {
          seen.add(section)
          details.push({ section, description: '' })
        }
      }
    }

    // Method 2: table rows in "Cases where Pending" table
    let inCriminalTable = false
    for (const row of Array.from(document.querySelectorAll('tr'))) {
      const t = row.innerText || ''
      if (/Cases where Pending|Cases where Convicted/i.test(t)) {
        inCriminalTable = true; continue
      }
      if (!inCriminalTable) continue

      // Look for IPC sections column
      const tds = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim())
      for (const td of tds) {
        // td might be "505(1)B, 153, 166" or "143, 147, 149, 186, 188, 332, 353"
        if (/^\d/.test(td) && /,|\d{3}/.test(td)) {
          const sections = td.split(/[,\s]+/).map(s => s.trim()).filter(s => /^\d/.test(s))
          for (const s of sections) {
            const section = `IPC Section ${s}`
            if (!seen.has(section)) {
              seen.add(section)
              details.push({ section, description: '' })
            }
          }
        }
        // Other acts column
        if (/section/i.test(td) && td.length < 100) {
          const section = td.trim()
          if (!seen.has(section)) {
            seen.add(section)
            details.push({ section, description: 'See EC affidavit' })
          }
        }
      }
    }

    return { criminal_cases, criminal_details: details }
  })
}

;(async () => {
  const data    = JSON.parse(fs.readFileSync(CLEAN, 'utf-8'))
  const winners = data.winners
  const targets = winners.filter(w => MISSING_IDS.has(w.myneta_id))

  console.log(`\n🔧 Fixing criminal data for ${targets.length} MPs...\n`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  let page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')

  let fixed = 0, clean = 0, failed = 0

  for (let i = 0; i < targets.length; i++) {
    const mp  = targets[i]
    const url = `${BASE}/candidate.php?candidate_id=${mp.myneta_id}`
    const pct = `[${String(i+1).padStart(2)}/${targets.length}]`

    try {
      // Recreate page if detached
      try { await page.evaluate(() => document.title) } catch {
        try { await page.close() } catch {}
        page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
      }

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      await sleep(500)

      const { criminal_cases, criminal_details } = await extractCriminalFromPage(page)

      // Update the record
      const idx = winners.findIndex(w => w.myneta_id === mp.myneta_id)
      winners[idx].criminal_cases   = criminal_cases
      winners[idx].criminal_details = criminal_details

      if (criminal_cases > 0) {
        process.stdout.write(`⚠️  ${pct} ${mp.name.padEnd(40)} ${criminal_cases} cases, ${criminal_details.length} sections\n`)
        fixed++
      } else {
        process.stdout.write(`✅ ${pct} ${mp.name.padEnd(40)} clean (0 cases)\n`)
        clean++
      }

    } catch (e) {
      process.stdout.write(`❌ ${pct} ${mp.name.padEnd(40)} ERROR: ${e.message}\n`)
      failed++
    }

    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))
      console.log(`   💾 Saved (${i+1}/${targets.length})`)
    }

    await sleep(DELAY)
  }

  fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))

  console.log('\n─────────────────────────────────────────────')
  console.log(`⚠️  Had criminal cases: ${fixed}`)
  console.log(`✅ Genuinely clean:     ${clean}`)
  console.log(`❌ Errors:              ${failed}`)
  console.log(`\n✅ Done! Now run: npx ts-node --esm scripts/merge-myneta.ts`)

  await browser.close()
})()