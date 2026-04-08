const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const existing = JSON.parse(fs.readFileSync('scripts/myneta-clean.json', 'utf-8'));
  const existingIds = new Set(existing.winners.map(w => String(w.myneta_id)));
  console.log('Existing IDs:', existingIds.size);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(
    'https://www.myneta.info/LokSabha2024/index.php?action=show_winners&sort=candidate',
    { waitUntil: 'networkidle2', timeout: 60000 }
  );

  const rows = await page.evaluate(() => {
    const results = [];
    for (const tr of document.querySelectorAll('tr')) {
      const links = tr.querySelectorAll('a[href*="candidate_id"]');
      if (links.length === 0) continue;
      const href = links[0].href;
      const m = href.match(/candidate_id=(\d+)/);
      if (!m) continue;
      const id = m[1];
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      results.push({ id, tds });
    }
    return results;
  });

  console.log('Total rows from page:', rows.length);

  const missing = rows.filter(r => !existingIds.has(r.id));
  console.log('Missing MPs:', missing.length);
  missing.forEach(r => console.log(r.id, '|', r.tds.slice(0, 5).join(' | ')));

  // Also save missing IDs to a file for the scraper
  const missingIds = missing.map(r => ({
    myneta_id: parseInt(r.id),
    name: r.tds[1] || '',
    constituency: r.tds[2] || '',
    party: r.tds[3] || '',
  }));
  fs.writeFileSync('scripts/missing-mps.json', JSON.stringify(missingIds, null, 2));
  console.log('\nSaved to scripts/missing-mps.json');

  await browser.close();
})();