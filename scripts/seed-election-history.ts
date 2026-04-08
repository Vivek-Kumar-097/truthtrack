/**
 * Day 4 — seed-election-history.ts (v2 — uses UPDATE not UPSERT)
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/seed-election-history.ts
 */

import * as fs   from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  const filePath = path.join(process.cwd(), 'scripts', 'election-history.json')
  if (!fs.existsSync(filePath)) {
    console.error('❌ election-history.json not found. Run fetch-election-history.ts first.')
    process.exit(1)
  }

  const records: { id: string; name: string; history: unknown[] }[] =
    JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  console.log(`\n🌱 Seeding election_history for ${records.length} MPs…\n`)

  let ok = 0, failed = 0

  for (const record of records) {
    const { error } = await supabase
      .from('politicians')
      .update({ election_history: record.history.length > 0 ? record.history : null })
      .eq('id', record.id)

    if (error) {
      console.error(`  ✗ ${record.name}: ${error.message}`)
      failed++
    } else {
      ok++
      if (ok % 50 === 0) {
        process.stdout.write(`\r  ✅ ${ok}/${records.length} updated…`)
      }
    }
  }

  console.log(`\r  ✅ ${ok} updated, ❌ ${failed} failed          `)
  console.log('\nDone!')
  console.log(`  With history : ${records.filter(r => r.history.length > 0).length}`)
  console.log(`  No history   : ${records.filter(r => r.history.length === 0).length}`)
}

main().catch(console.error)