/**
 * clean-myneta.ts
 * 
 * Cleans criminal_details in myneta-raw.json by:
 * 1. Removing junk/header/ad-tracker entries
 * 2. Reconstructing broken "IPC Section" + "123)" pairs
 * 3. Outputting cleaned file as myneta-clean.json
 * 
 * Run: npx ts-node scripts/clean-myneta.ts
 */

import * as fs from "fs";
import * as path from "path";

interface CriminalDetail {
  section: string;
  description: string;
}

interface Winner {
  myneta_id: number;
  name: string;
  constituency: string;
  party: string;
  criminal_cases: number;
  assets_2024: number | null;
  liabilities: number | null;
  criminal_details: CriminalDetail[];
  scraped_at: string;
}

// ─── Junk Detection ───────────────────────────────────────────────────────────

const JUNK_SECTION_PREFIXES = [
  "pcampaign",       // pcampaignid=pcampaignidMKT
  "pco ",            // pco Ind. Ltd. Q. 500 Rate...
  "pck ",            // pck 2009
  "pcil ",           // PCIL Loan (asset data leaked in)
  "pc ltd",          // PC Ltd, 713 Shares
  "pcs ltd",         // PCS Ltd, 100 Shares
  "pc act)",         // PC Act) (CBI), RADC... — fragment
  "pc is ",          // PC is submitted before the Honble High Court...
  "pcl ",            // PCL Electricity Company
  "pcr no",          // PCR No.31/2013 — case reference number, not a section
  "pcr ",            // PCR 424/2022CC3891/2022 (Hitnal), PCR Investments Ltd (Konda) — case refs + asset data
  "pc jewellers",    // PC Jewellers Ltd, 3600 Shares — asset data leaked in
  "crpc filed",      // CrPC Filed Before Honble High Court... — court reference
  "pcd0",            // PCD04000241, 2015 — internal case ID (Afzal Ansari)
  "pc no of shares", // PC No of Shares (Captain Viriato Fernandes) — asset data
  "pc/",             // PC/2023 (Gaikwad) — internal case reference
  "pc,",             // PC, A Court referred case... (Chamala Kiran) — fragment
  "ipcot,",          // IPCOT, R (Dm Kathir Anand) — garbled/truncated junk
  "pch/",            // PCH/4637/2021, PCH/5143/2021 — Punjab internal case ref IDs (Gurmeet Singh Hayer)
  "pc)",             // PC)P Ltd — asset/company fragment (K Navaskani)
  "pc210",           // PC210, 31/08/2020 — internal case ID (K. Rajashekar Hitnal)
  "pc bengaluru",    // PC Bengaluru, Towards Interest... — asset/financial fragment (M.K. Vishnuprasad)
  "pcon ",           // pcon Infra — company name fragment (Rajesh Verma, KHAGARIA)
];

const JUNK_SECTION_CONTAINS = [
  "click here",           // PcZqPZL3ZeWG'>Click here for more details
  "'>",                   // any lingering HTML anchor artifacts
  "navi mumbai",          // "Section 11, Netrul East, Navi Mumbai" — address leaked into section field (Narayan Tatu Rane)
  "criminal appeal no.",  // "Section 353, 149 IPC Criminal Appeal No. 343/2016 has been filed in" — case reference (Bhumare Sandipanrao Asaram)
];

const JUNK_SECTION_EXACT = new Set([
  "IPC / BNS",
  "IPC Sections Applicable",
  "Sections Applicable",
  "PC Act",           // bare fragment with no real section info
  "PC Act. CBI",      // "PC Act. CBI", desc: "09 (MPs/MLAs Cases), RADC" — junk (Karti Chidambaram)
  "PC Act, 1988",     // "PC Act, 1988" — bare junk fragment (Misha Bharti)
]);

// Matches bare "section N" with just a number — too vague to keep
const JUNK_SECTION_BARE_REGEX = /^section\s+\d+$/i;

const JUNK_DESCRIPTION_EXACT = new Set([
  "Other global all co prtnr py PartBa",
]);

const JUNK_DESCRIPTION_CONTAINS = [
  "was chelle",       // "...Act, 1961 was chelle" — truncated/garbled court note
];

function isJunk(detail: CriminalDetail): boolean {
  const sec = detail.section.trim();
  const desc = detail.description.trim();

  if (JUNK_SECTION_EXACT.has(sec)) return true;
  if (JUNK_DESCRIPTION_EXACT.has(desc)) return true;
  if (JUNK_DESCRIPTION_CONTAINS.some(p => desc.toLowerCase().includes(p))) return true;
  if (JUNK_SECTION_BARE_REGEX.test(sec) && desc === "See EC affidavit") return true;

  const secLower = sec.toLowerCase();
  if (JUNK_SECTION_PREFIXES.some(p => secLower.startsWith(p))) return true;
  if (JUNK_SECTION_CONTAINS.some(p => secLower.includes(p))) return true;

  return false;
}

// ─── Section Reconstruction ───────────────────────────────────────────────────

/**
 * Detects broken entries like:
 *   { section: "IPC Section", description: "188)" }
 *   { section: "IPC Section", description: "505(2))" }
 * and reconstructs them as:
 *   { section: "IPC Section 188", description: "" }
 */
function reconstructBrokenIpcSection(detail: CriminalDetail): CriminalDetail | null {
  const sec = detail.section.trim();
  const desc = detail.description.trim();

  // Pattern 1: section is exactly "IPC Section", description is like "123)" or "123A)"
  if (sec === "IPC Section") {
    const match = desc.match(/^(\d+[A-Za-z0-9()]*)\)$/);
    if (match) {
      const num = desc.replace(/\)$/, "");
      return { section: `IPC Section ${num}`, description: "" };
    }
    // Also catch things like "505(2))" or "505(1)(b))"
    const match2 = desc.match(/^([\d()A-Za-z]+)\)$/);
    if (match2) {
      const num = desc.replace(/\)$/, "");
      return { section: `IPC Section ${num}`, description: "" };
    }
  }

  // Pattern 2: section is "section 121 (IPC Section" or "Sections 125 and 126 (IPC Section"
  // Reconstruct as "IPC Section 121 / 121A"
  const splitMatch = sec.match(/^sections?\s+([\w()\s]+?)\s+\(IPC Section$/i);
  if (splitMatch) {
    const first = splitMatch[1];
    const second = desc.replace(/\)$/, "");
    return { section: `IPC Section ${first} / ${second}`, description: "" };
  }

  // Pattern 3: section is "Section 153A(2)  (IPC Section", desc is "153A(2))"
  // Already has full section name before the (IPC Section part — use that
  const fullSplitMatch = sec.match(/^(Section\s+[\w()A-Za-z]+)\s+\(IPC Section$/i);
  if (fullSplitMatch) {
    return { section: fullSplitMatch[1], description: "" };
  }

  // Pattern 4: section is "Section", description has the actual content
  // e.g. { section: "Section", description: "7 Criminal Law Amendment Act, 1932..." }
  if (sec === "Section" && desc.length > 0) {
    return { section: `Section ${desc}`, description: "" };
  }

  return null; // not a broken pattern
}

// ─── Main Cleaner ─────────────────────────────────────────────────────────────

function cleanDetails(details: CriminalDetail[]): CriminalDetail[] {
  const cleaned: CriminalDetail[] = [];

  for (const detail of details) {
    // Skip junk
    if (isJunk(detail)) continue;

    // Try to reconstruct broken patterns
    const reconstructed = reconstructBrokenIpcSection(detail);
    if (reconstructed) {
      // Skip empty reconstructions (shouldn't happen but guard)
      if (reconstructed.section.trim()) {
        cleaned.push(reconstructed);
      }
      continue;
    }

    // Keep as-is (legitimate entries like "Section 13 UAPA...", "Section 127A RP Act", etc.)
    cleaned.push(detail);
  }

  // Deduplicate by section name (some sections appear in both broken + full form)
  const seen = new Set<string>();
  return cleaned.filter(d => {
    const key = d.section.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const RAW_PATH   = path.join(__dirname, "myneta-raw.json")
const CLEAN_PATH = path.join(__dirname, "myneta-clean.json")

if (!fs.existsSync(RAW_PATH)) {
  console.error(`❌ File not found: ${RAW_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf-8")) as { winners: Winner[] };

let totalBefore = 0;
let totalAfter = 0;
let reconstructed = 0;

const cleaned = raw.winners.map(mp => {
  const before = mp.criminal_details.length;
  const cleanedDetails = cleanDetails(mp.criminal_details);
  const after = cleanedDetails.length;

  totalBefore += before;
  totalAfter += after;

  // Count reconstructed entries (those that changed)
  const changedCount = mp.criminal_details.filter(d => {
    const rec = reconstructBrokenIpcSection(d);
    return rec !== null && !isJunk(d);
  }).length;
  reconstructed += changedCount;

  return { ...mp, criminal_details: cleanedDetails };
});

fs.writeFileSync(CLEAN_PATH, JSON.stringify({ winners: cleaned }, null, 2));

const removed = totalBefore - totalAfter + reconstructed;
console.log(`✅ Cleaned ${cleaned.length} MPs`);
console.log(`   Before: ${totalBefore} total detail entries`);
console.log(`   After:  ${totalAfter} total detail entries`);
console.log(`   Removed: ~${totalBefore - totalAfter} junk entries`);
console.log(`   Reconstructed: ~${reconstructed} broken section entries`);
console.log(`\n📄 Output: ${CLEAN_PATH}`);