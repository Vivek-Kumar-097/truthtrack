const https = require('https');

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
  });
}

async function main() {
  const html = await get('https://www.myneta.info/LokSabha2019/index.php?action=show_candidates&constituency_id=913');
  
  // Find "Winner" in the HTML and print 300 chars around it
  const idx = html.indexOf('Winner');
  if (idx === -1) { console.log('Winner not found at all!'); return; }
  
  console.log('=== 300 chars around "Winner" ===');
  console.log(JSON.stringify(html.slice(idx - 200, idx + 100)));
}

main().catch(console.error);