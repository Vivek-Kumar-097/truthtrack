/**
 * scrape-2019-final.js  v5
 * Run: node scrape-2019-final.js
 */

const https = require('https');
const fs = require('fs');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseRs(s) {
  if (!s) return null;
  const d = s.replace(/[^0-9]/g, '');
  return d.length > 0 ? parseInt(d, 10) : null;
}

// Get assets from the individual candidate page (more reliable)
async function getCandidateAssets(candidateId) {
  const url = `https://www.myneta.info/LokSabha2019/candidate.php?candidate_id=${candidateId}`;
  const html = await get(url);
  // "Assets: Rs X,XX,XX,XXX"
  const aM = html.match(/Assets:\s*<\/td>\s*<td[^>]*>.*?Rs\s*([\d,]+)/is);
  const lM = html.match(/Liabilities:\s*<\/td>\s*<td[^>]*>.*?Rs\s*([\d,]+)/is);
  return {
    assets: aM ? parseRs(aM[1]) : null,
    liab:   lM ? parseRs(lM[1]) : null,
  };
}

async function scrapeConstituency(name, cid) {
  const url = `https://www.myneta.info/LokSabha2019/index.php?action=show_candidates&constituency_id=${cid}`;
  const html = await get(url);

  // Winner is marked as: candidate_id=NNN">NAME</a><strong>Winner</strong>
  // or: candidate_id=NNN">NAME</a>**Winner**
  const winnerM = html.match(/candidate\.php\?candidate_id=(\d+)[^>]*>([^<]+)<\/a>(?:<[^>]+>)*\s*Winner/i);
  if (!winnerM) return null;

  const candidateId = parseInt(winnerM[1]);
  const candidateName = winnerM[2].trim();

  // Try to get assets from the list row first
  // Find the whole row containing this candidate_id
  const rowStart = html.indexOf(`candidate_id=${candidateId}`);
  if (rowStart === -1) return null;

  // Find the <tr> before this position
  const trStart = html.lastIndexOf('<tr', rowStart);
  const trEnd   = html.indexOf('</tr>', rowStart);
  const row = trStart >= 0 && trEnd >= 0 ? html.slice(trStart, trEnd) : '';

  const rsAll = [...row.matchAll(/Rs\s*([\d,]+)/g)];
  let assets = rsAll[0] ? parseRs(rsAll[0][1]) : null;
  let liab   = rsAll[1] ? parseRs(rsAll[1][1]) : null;

  // Criminal cases
  const crimM = row.match(/<td[^>]*>\s*(\d+)\s*<\/td>/g);
  let criminal = 0;
  if (crimM) {
    for (const c of crimM) {
      const n = parseInt(c.replace(/<[^>]+>/g, '').trim());
      if (!isNaN(n) && n < 100) { criminal = n; break; }
    }
  }

  return { candidateId, candidateName, assets, liab, criminal };
}

const MISSING = {
  'AKBARPUR':          857,
  'AMETHI':            915,
  'BADAUN':            899,
  'BANASKANTHA':       544,
  'BANSGAON':          868,
  'BARDOLI':           559,
  'BATHINDA':          555,
  'BHAGALPUR':         483,
  'BHONGIR':           657,
  'BISHNUPUR':         438,
  'CHANDIGARH':        519,
  'CHHOTA UDAIPUR':    548,
  'COOCH BEHAR':       412,
  'DARJEELING':        413,
  'DUM DUM':           422,
  'FAIZABAD':          863,
  'GADCHIROLI CHIMUR': 380,
  'GHAZIPUR':          910,
  'GUNTUR':            444,
  'HASSAN':            255,
  'HOSHANGABAD':       287,
  'JAGATSINGHPUR':     530,
  'JOYNAGAR':          445,
  'KANCHEEPURAM':      641,
  'KENDRAPARA':        531,
  'KHERI':             895,
  'KODAGU':            248,
  'KOLLAM':            316,
  'KURNOOL':           449,
  'LUCKNOW':           913,
  'MALKAJGIRI':        653,
  'MAVELIKKARA':       320,
  'MOHANLALGANJ':      914,
  'MUNGER':            494,
  'NAGAUR':            584,
  'NANDYAL':           448,
  'NILGIRIS':          629,
  'PALAMAU':           463,
  'PATIALA':           557,
  'PRATAPGARH':        876,
  'RAIGAD':            382,
  'RAJNANDGAON':       521,
  'RAVER':             374,
  'SATNA':             301,
  'SHIRUR':            392,
  'SITAPUR':           893,
  'SRINAGAR':           14,
  'TIKAMGARH':         286,
  'TRIPURA WEST':      554,
  'UNNAO':             882,
  'VIDISHA':           285,
  'VIJAYAWADA':        443,
  'WEST DELHI':        573,
};

async function main() {
  let existing = { winners: [] };
  if (fs.existsSync('myneta-2019.json')) {
    existing = JSON.parse(fs.readFileSync('myneta-2019.json', 'utf8'));
    console.log(`Loaded ${existing.winners.length} existing winners`);
  }
  const done = new Set(existing.winners.map(w => w.constituency));

  const entries = Object.entries(MISSING).filter(([name]) => !done.has(name));
  console.log(`Need to scrape: ${entries.length} constituencies\n`);

  let success = 0, failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const [name, cid] = entries[i];
    process.stdout.write(`[${i+1}/${entries.length}] ${name}... `);

    try {
      await sleep(400);
      const result = await scrapeConstituency(name, cid);

      if (!result) {
        console.log('⚠️  no winner found');
        failed++;
        continue;
      }

      let { candidateId, candidateName, assets, liab, criminal } = result;

      // If assets blank on list page, fetch candidate detail page
      if (!assets) {
        await sleep(300);
        const detail = await getCandidateAssets(candidateId);
        assets = detail.assets;
        liab   = detail.liab;
      }

      existing.winners.push({
        candidate_id: candidateId,
        name: candidateName,
        constituency: name,
        party: '',
        criminal_cases_2019: criminal,
        assets_2019: assets,
        liabilities_2019: liab,
      });
      done.add(name);
      success++;
      console.log(`✅ ${candidateName} — ${assets ? '₹'+(assets/1e7).toFixed(2)+'Cr' : 'null'}`);

    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }
  }

  existing.total = existing.winners.length;
  existing.scraped_at = new Date().toISOString();
  fs.writeFileSync('myneta-2019.json', JSON.stringify(existing, null, 2));

  console.log(`\n✅ Done! ${existing.winners.length} total winners.`);
  console.log(`   Added: ${success}, Failed: ${failed}`);

  const checks = ['LUCKNOW','AMETHI','GHAZIPUR','CHANDIGARH','BATHINDA','GUNTUR'];
  for (const c of checks) {
    const w = existing.winners.find(x => x.constituency === c);
    if (w) console.log(`  ${c}: ${w.name} ₹${w.assets_2019 ? (w.assets_2019/1e7).toFixed(2)+'Cr' : 'null'}`);
    else   console.log(`  ${c}: ❌ missing`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });