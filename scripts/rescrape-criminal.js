/**
 * TruthTrack — Criminal Details Re-Scraper (Puppeteer)
 * scripts/rescrape-criminal.js
 *
 * Re-scrapes criminal_cases + criminal_details for ALL MPs
 * from individual MyNeta candidate pages via Puppeteer.
 * NO cap on sections — gets everything from the structured tables.
 *
 * USAGE:
 *   node scripts/rescrape-criminal.js           # only MPs missing/incomplete
 *   RESCRAPE=1 node scripts/rescrape-criminal.js # all MPs with cases
 */

const puppeteer = require('puppeteer')
const fs        = require('fs')

const CLEAN = 'scripts/myneta-clean.json'
const BASE  = 'https://www.myneta.info/LokSabha2024'
const DELAY = 1200

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Junk filters ─────────────────────────────────────────────────────────────
const JUNK_PREFIXES = [
  'pcampaign','pco ','pck ','pcil ','pc ltd','pcs ltd','pc act)','pc is ',
  'pcl ','pcr no','pcr ','pc jewellers','crpc filed','pcd0','pc no of shares',
  'pc/','pc,','ipcot,','pch/','pc)','pc210','pc bengaluru','pcon ',
]
const JUNK_EXACT = new Set(['IPC / BNS','IPC Sections Applicable','Sections Applicable','PC Act','PC Act. CBI','PC Act, 1988'])
const JUNK_CONTAINS = ["click here","'>","navi mumbai","criminal appeal no."]
const BARE_REGEX = /^section\s+\d+$/i

function isJunk(section, description) {
  const s = section.trim(), sL = s.toLowerCase()
  if (JUNK_EXACT.has(s)) return true
  if (JUNK_PREFIXES.some(p => sL.startsWith(p))) return true
  if (JUNK_CONTAINS.some(p => sL.includes(p))) return true
  if (BARE_REGEX.test(s) && description === 'See EC affidavit') return true
  return false
}

// ─── Extract criminal data ────────────────────────────────────────────────────
async function extractCriminal(page) {
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('Criminal Cases') ||
            document.body.innerText.includes('Crime-O-Meter'),
      { timeout: 8000 }
    )
  } catch {}
  await sleep(800)

  return await page.evaluate(() => {
    let criminal_cases = 0
    const body = document.body.innerText
    const countMatch = body.match(/Number of Criminal Cases[:\s]+(\d+)/i)
    if (countMatch) criminal_cases = parseInt(countMatch[1])

    const details = []
    const seen = new Set()

    function addSection(section, description) {
      const s = section.trim()
      if (!s || s.length < 3) return
      const key = s.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      details.push({ section: s, description: (description || '').trim() })
    }

    // Method 1: structured "Cases where Pending/Convicted" tables
    for (const table of document.querySelectorAll('table')) {
      const headerRow = table.querySelector('tr')
      if (!headerRow) continue
      const headers = Array.from(headerRow.querySelectorAll('th,td'))
        .map(c => (c.innerText||'').toLowerCase().trim())

      const ipcCol   = headers.findIndex(h => /ipc sections applicable/i.test(h))
      const otherCol = headers.findIndex(h => /other.*acts.*sections/i.test(h))
      if (ipcCol === -1) continue

      for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) {
        const cells = Array.from(row.querySelectorAll('td')).map(c => (c.innerText||'').trim())
        if (!cells.length) continue

        if (ipcCol >= 0 && cells[ipcCol]) {
          const ipcText = cells[ipcCol]
          const parts = ipcText.split(/[,\s]+/).map(s => s.trim()).filter(s => /^\d/.test(s))
          for (const part of parts) addSection('IPC Section ' + part, '')
          if (!parts.length && /section/i.test(ipcText)) addSection(ipcText, '')
        }

        if (otherCol >= 0 && cells[otherCol] && cells[otherCol] !== '-' && cells[otherCol] !== 'Nil') {
          const otherText = cells[otherCol]
          const parts = otherText.split(/[,\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 3 && /section|act|uapa|pmla|ndps|crpc/i.test(s))
          for (const part of parts) addSection(part, 'See EC affidavit')
          if (!parts.length && otherText.length < 200) addSection(otherText, 'See EC affidavit')
        }
      }
    }

    // Method 2: bullet list "(IPC Section-NNN)"
    for (const li of document.querySelectorAll('li')) {
      const t = li.innerText.trim()
      const m = t.match(/\(IPC Section[- ](\d+[A-Za-z()]*)\)/)
      if (m) addSection('IPC Section ' + m[1], '')
    }

    // Method 3: fallback text scan
    if (details.length === 0) {
      for (const m of body.matchAll(/IPC\s+Section\s+(\d+[A-Za-z()]*)/g)) {
        addSection('IPC Section ' + m[1], '')
      }
    }

    return { criminal_cases, criminal_details: details }
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  const data    = JSON.parse(fs.readFileSync(CLEAN, 'utf-8'))
  const winners = data.winners
  const RESCRAPE = !!process.env.RESCRAPE

  const todo = RESCRAPE
    ? winners.filter(w => w.criminal_cases > 0)
    : winners.filter(w =>
        w.criminal_cases > 0 && (
          !w.criminal_details ||
          w.criminal_details.length === 0 ||
          w.criminal_details.length === 19
        )
      )

  console.log('\n⚖️  TruthTrack — Criminal Re-Scraper' + (RESCRAPE ? ' [RESCRAPE ALL]' : ' [TARGETED]'))
  console.log('   MPs with cases: ' + winners.filter(w => w.criminal_cases > 0).length)
  console.log('   To scrape: ' + todo.length + '\n')

  if (!todo.length) { console.log('Nothing to fix!'); process.exit(0) }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  })

  let page = await browser.newPage()
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')

  let success = 0, failed = 0, improved = 0

  for (let i = 0; i < todo.length; i++) {
    const mp  = todo[i]
    const url = BASE + '/candidate.php?candidate_id=' + mp.myneta_id
    const pct = '[' + String(i+1).padStart(3) + '/' + todo.length + ']'

    try {
      try { await page.evaluate(() => document.title) } catch {
        try { await page.close() } catch {}
        page = await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
      }

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      let { criminal_cases, criminal_details } = await extractCriminal(page)

      // Junk filter + deduplicate
      criminal_details = criminal_details.filter(d => !isJunk(d.section, d.description))
      const seen2 = new Set()
      criminal_details = criminal_details.filter(d => {
        const k = d.section.trim().toLowerCase()
        if (seen2.has(k)) return false
        seen2.add(k); return true
      })

      const idx = winners.findIndex(w => w.myneta_id === mp.myneta_id)
      const oldCount = winners[idx].criminal_details?.length || 0
      winners[idx].criminal_cases   = criminal_cases
      winners[idx].criminal_details = criminal_details

      const delta = criminal_details.length - oldCount
      const ds = delta > 0 ? '+' + delta : delta < 0 ? String(delta) : '='
      process.stdout.write('✅ ' + pct + ' ' + mp.name.padEnd(42) + ' cases:' + criminal_cases + ' sections:' + criminal_details.length + ' (' + ds + ')\n')
      if (delta !== 0) improved++
      success++

    } catch (e) {
      process.stdout.write('❌ ' + pct + ' ' + mp.name.padEnd(42) + ' ERROR: ' + e.message + '\n')
      failed++
    }

    if ((i + 1) % 20 === 0) {
      fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))
      console.log('   💾 Saved (' + (i+1) + '/' + todo.length + ')')
    }

    await sleep(DELAY)
  }

  fs.writeFileSync(CLEAN, JSON.stringify({ winners }, null, 2))

  console.log('\n─────────────────────────────────────────────')
  console.log('✅ Scraped:   ' + success)
  console.log('📈 Improved:  ' + improved)
  console.log('❌ Errors:    ' + failed)

  const withCases2 = winners.filter(w => w.criminal_cases > 0)
  const noDetails2 = withCases2.filter(w => !w.criminal_details || w.criminal_details.length === 0)
  console.log('\n📊 Final: ' + withCases2.length + ' MPs with cases, ' + noDetails2.length + ' still missing details')
  noDetails2.forEach(w => console.log('   MISSING:', w.name, w.criminal_cases, 'cases'))
  console.log('\n✅ Done! Run: npx ts-node --esm scripts/merge-myneta.ts')

  await browser.close()
})()