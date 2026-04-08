/**
 * Fetch missing 2019 assets from MyNeta candidate pages
 * Usage: node fetch-missing-assets.js
 * Output: missing-assets-2019.json
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

const CANDIDATES = [
  [9386,  "AHMEDABAD EAST",           "Patel Hasmukhbhai Somabhai"],
  [9617,  "AJMER",                    "Bhagirath Chaudhary"],
  [13474, "ALLAHABAD",                "Rita Bahuguna Joshi"],
  [5028,  "AMALAPURAM",               "Chinta Anuradha"],
  [13124, "AMRITSAR",                 "Gurjeet Singh Aujla"],
  [7686,  "ANAND",                    "Miteshbhai Patel"],
  [5843,  "ARAKKONAM",                "S. Jagathrakshakan"],
  [5848,  "ARANI",                    "Vishnuprasad. M.K"],
  [5171,  "ASKA",                     "Pramila Bisoyi"],
  [10085, "BAHARAMPUR",               "Adhir Ranjan Chowdhury"],
  [9918,  "BALASORE",                 "Pratap Chandra Sarangi"],
  [7343,  "BANGALORE NORTH",          "D.V. Sadananda Gowda"],
  [11548, "BANGAON",                  "Shantanu Thakur"],
  [11045, "BARABANKI",                "Upendra Singh Rawat"],
  [13953, "BARASAT",                  "Dr. Kakoli Ghoshdastidar"],
  [9604,  "BARMER",                   "Kailash Choudhary"],
  [12751, "BASIRHAT",                 "Nusrat Jahan Ruhi"],
  [7022,  "BELGAUM",                  "Angadi Suresh"],
  [11576, "BETUL",                    "Durga Das (D.D.) Uikey"],
  [8508,  "BHARUCH",                  "Mansukhbhai Vasava"],
  [12227, "BHIND",                    "Sandhya Ray"],
  [7037,  "BIDAR",                    "Bhagwanth Khuba"],
  [11692, "BIKANER",                  "Arjun Ram Meghwal"],
  [7104,  "BULANDSHAHR",              "Bhola Singh"],
  [9136,  "CHALAKUDY",                "Benny Behanan"],
  [10250, "CHATRA",                   "Sunil Kumar Singh"],
  [5212,  "CHENNAI SOUTH",            "Sumathy Alias Thamizhachi Thangapandian"],
  [10428, "CHIKKODI",                 "Annasaheb Shankar Jolle"],
  [9569,  "CHITTORGARH",              "Chandra Prakash"],
  [8244,  "DADRA AND NAGAR HAVELI",   "Delkar Mohanbhai Sanjibhai"],
  [7417,  "DAMAN AND DIU",            "Patel Lalubhai Babubhai"],
  [12959, "DEORIA",                   "Ramapati Ram Tripathi"],
  [13106, "DHAR",                     "Chhatar Singh Darbar"],
  [9807,  "DHULE",                    "Subhash Ramrao Bhamre"],
  [5298,  "DINDIGUL",                 "Velusamy P"],
  [12721, "EAST DELHI",               "Gautam Gambhir"],
  [6503,  "ERODE",                    "Ganeshamurthi A"],
  [9660,  "FARRUKHABAD",              "Mukesh Rajput"],
  [7144,  "FATEHPUR SIKRI",           "Rajkumar Chahar"],
  [4909,  "GARHWAL",                  "Tirath Singh Rawat"],
  [5607,  "GAYA",                     "Vijay Kumar"],
  [12998, "GODDA",                    "Nishikant Dubey"],
  [12940, "GORAKHPUR",                "Ravindra Shyamnarayan Shukla Alias Ravi Kishan"],
  [12240, "GWALIOR",                  "Vivek Narayan Shejwalkar"],
  [10394, "HAVERI",                   "Udasi. S.C."],
  [6559,  "HINGOLI",                  "Patil Hemant Shriram"],
  [4589,  "HYDERABAD",                "Asaduddin Owaisi"],
  [5671,  "INNER MANIPUR",            "Dr Rajkumar Ranjan Singh"],
  [11288, "JAIPUR RURAL",             "Col. Rajyavardhan Rathore"],
  [9690,  "JALAUN",                   "Bhanu Pratap Singh"],
  [8019,  "JAMNAGAR",                 "Poonamben Hematbhai Maadam"],
  [7854,  "JANGIPUR",                 "Khalilur Rahaman"],
  [11266, "JHANSI",                   "Anurag Sharma"],
  [9607,  "JODHPUR",                  "Gajendra Singh Shekhawat"],
  [11448, "KAISERGANJ",               "Brij Bhushan Sharan Singh"],
  [4926,  "KALIABOR",                 "Gaurav Gogoi"],
  [7173,  "KANKER",                   "Mohan Mandavi"],
  [9167,  "KANNUR",                   "K Sudhakaran"],
  [6274,  "KARIMNAGAR",               "Bandi Sanjay Kumar"],
  [8824,  "KASARAGOD",                "Rajmohan Unnithan"],
  [8152,  "KHAGARIA",                 "Choudhary Mahbub Ali Kaisar"],
  [13117, "KHANDWA",                  "Nandkumar Singh Chouhan (Nandu Bhaiya)"],
  [11368, "KODARMA",                  "Annapurna Devi"],
  [7767,  "KOLHAPUR",                 "Sanjay Sadashivrao Mandlik"],
  [7479,  "KORBA",                    "Jyotsna Mahant"],
  [9217,  "KOZHIKODE",                "M.K.Raghavan"],
  [11352, "LADAKH",                   "Tsering Namgyal"],
  [12388, "LALGANJ",                  "Sangeeta Azad"],
  [4794,  "MACHILIPATNAM",            "Balashowry Vallabhaneni"],
  [11084, "MADHUBANI",                "Ashok Kumar Yadav"],
  [4850,  "MAHBUBNAGAR",              "Manne Srinivas Reddy"],
  [9230,  "MALAPPURAM",               "Kunhalikutty"],
  [13095, "MANDSOUR",                 "Sudheer Gupta"],
  [5485,  "MATHURA",                  "Hema Malini Dharmendra Deol"],
  [5079,  "MEDAK",                    "Kotha Prabhakar Reddy"],
  [12928, "MIRZAPUR",                 "Anupriya Singh Patel"],
  [9870,  "MUMBAI NORTH",             "Gopal Chinnaya Shetty"],
  [9895,  "MUMBAI NORTH WEST",        "Gajanan Chandrakant Kirtikar"],
  [11089, "MUZAFFARPUR",              "Ajay Nishad"],
  [4902,  "NAGALAND",                 "Tokheho Yepthomi"],
  [5832,  "NAINITAL-UDHAMSINGH NAGAR","Ajay Bhatt"],
  [5275,  "NAMAKKAL",                 "Chinraj A.K.P"],
  [9825,  "NASHIK",                   "Hemant Tukaram Godse"],
  [5934,  "NAWGONG",                  "Pradyut Bordoloi"],
  [9055,  "NORTH GOA",                "Shripad Yesso Naik"],
  [5193,  "OSMANABAD",                "Omprakash Bhupalsinh Alias Pavan Rajenimbalkar"],
  [8505,  "PANCHMAHAL",               "Ratansinh Rathod"],
  [13057, "PATALIPUTRA",              "Ram Kripal Yadav"],
  [5860,  "PERAMBALUR",               "Paarivendhar T R"],
  [4752,  "POLLACHI",                 "K Shanmugasundaram"],
  [8390,  "PURI",                     "Pinaki Misra"],
  [12089, "PURVI CHAMPARAN",          "Radha Mohan Singh"],
  [7502,  "RAIPUR",                   "Sunil Kumar Soni"],
  [12253, "RAJGARH",                  "Rodmal Nagar"],
  [7914,  "RAMPUR",                   "Mohammad Azam Khan"],
  [11383, "RANCHI",                   "Sanjay Seth"],
  [12513, "ROHTAK",                   "Arvind Kumar Sharma"],
  [6076,  "SAHARANPUR",               "Haji Fazlur Rehman"],
  [7778,  "SANGLI",                   "Sanjaykaka Patil"],
  [11338, "SARAN",                    "Rajiv Pratap Rudy"],
  [9707,  "SHAHJAHANPUR",             "Arun Kumar Sagar"],
  [13030, "SHIMLA",                   "Suresh Kumar Kashyap"],
  [11572, "SIKAR",                    "Sumedhanand Saraswati"],
  [12225, "SINGHBHUM",                "Geeta Kora"],
  [5498,  "SOLAPUR",                  "Shri. Sha. Bra. Dr. Jay Siddeshwar Shivachrya Mahaswamiji"],
  [9064,  "SOUTH GOA",                "Cosme Francisco Caitano Sardinha"],
  [5886,  "SUNDARGARH",               "Jual Oram"],
  [8491,  "SURENDRANAGAR",            "Mahendrabhai Munjpara"],
  [9859,  "THANE",                    "Rajan Baburao Vichare"],
  [9269,  "THIRUVANANTHAPURAM",       "Shashi Tharoor"],
  [5060,  "TIRUPATI",                 "Balli Durgaprasad Rao"],
  [5248,  "TIRUVANNAMALAI",           "Annadurai C N"],
  [9583,  "UDAIPUR",                  "Arjunlal Meena"],
  [10202, "UJIARPUR",                 "Nityanand Rai"],
  [8506,  "VADODARA",                 "Ranjanben Bhatt"],
  [8579,  "VALSAD",                   "Dr.K.C.Patel"],
  [8048,  "VIRUDHUNAGAR",             "Manickam Tagore, B."],
  [5094,  "WARANGAL",                 "Dayakar Pasnori"],
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function fetchPage(candidateId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.myneta.info/LokSabha2019/candidate.php?candidate_id=${candidateId}`
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function extractAssets2019(html) {
  // Pattern: <td><b>Lok Sabha 2019</b></td><td><b>Rs15,88,77,063</b>
  const m = html.match(/Lok Sabha 2019<\/b><\/td><td><b>Rs([\d,]+)<\/b>/)
  if (m) return parseInt(m[1].replace(/,/g, ''))
  return null
}

async function main() {
  const results = {}
  let found = 0, missing = 0

  for (const [id, constituency, name] of CANDIDATES) {
    try {
      const html = await fetchPage(id)
      const assets = extractAssets2019(html)
      results[constituency] = assets
      if (assets !== null) {
        found++
        console.log(`  ✅ ${constituency.padEnd(35)} ₹${(assets/1e7).toFixed(2)}Cr  (${name})`)
      } else {
        missing++
        console.log(`  ❌ ${constituency.padEnd(35)} no 2019 data`)
      }
    } catch (e) {
      results[constituency] = null
      missing++
      console.log(`  💥 ${constituency.padEnd(35)} error: ${e.message}`)
    }
    await sleep(250)
  }

  const outPath = path.join(process.cwd(), 'missing-assets-2019.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))

  console.log(`\n✅ Found: ${found}`)
  console.log(`❌ Missing: ${missing}`)
  console.log(`📁 Saved to: ${outPath}`)
}

main().catch(console.error)