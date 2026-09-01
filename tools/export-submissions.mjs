/**
 * Download every shared budget and write it out as an Excel workbook.
 *
 *   npm run export-submissions
 *
 * The bulk and archival path. The hidden panel in the app (Ctrl+Alt+E) does the
 * same job without a laptop or a key and is what the Coalition uses day to day;
 * this exists because it goes through the Admin SDK, which bypasses
 * firestore.rules entirely — so it still works if Auth is misconfigured, if the
 * admin password is lost, or if the export needs to run on a schedule.
 *
 * BOTH EXITS CALL THE SAME buildWorkbook() in src/export-workbook.js, so the
 * seven sheets are identical whichever way they were produced. Two exporters
 * flattening the data independently would drift, and the first anybody would
 * know of it is two spreadsheets that disagree about a farm.
 *
 * SETUP: docs/DATA-EXPORT.md. In short, you need
 * tools/service-account.json from the Firebase console (Project settings →
 * Service accounts → Generate new private key). That file is a credential that
 * bypasses every rule, it is gitignored, and it must not be emailed or pasted
 * anywhere.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildWorkbook, headersFor, exportStem, SHEETS } from '../src/export-workbook.js'

const here = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(here, 'service-account.json')
const COLLECTION = 'budget-submissions'

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (!existsSync(KEY_PATH)) {
  fail(
    `No service-account key at tools/service-account.json.\n\n` +
      `Firebase console → Project settings → Service accounts → Generate new private key,\n` +
      `save it there, and check it is gitignored before you commit anything.\n` +
      `Full steps: docs/DATA-EXPORT.md.`
  )
}

let admin
let XLSX
try {
  admin = await import('firebase-admin/app')
} catch {
  fail('firebase-admin is not installed. Run: npm install')
}
try {
  XLSX = (await import('xlsx')).default ?? (await import('xlsx'))
} catch {
  fail('xlsx is not installed. Run: npm install')
}

const { getFirestore } = await import('firebase-admin/firestore')
const credentials = JSON.parse(readFileSync(KEY_PATH, 'utf8'))

admin.initializeApp({ credential: admin.cert(credentials) })
const db = getFirestore()

console.log(`Reading ${COLLECTION} from ${credentials.project_id}…`)
const snap = await db.collection(COLLECTION).get()
const docs = snap.docs.map((d) => d.data())
console.log(`  ${docs.length} shared budget${docs.length === 1 ? '' : 's'}.`)

if (!docs.length) {
  console.log('Nothing to export.')
  process.exit(0)
}

const { sheets, skipped, count } = buildWorkbook(docs)

// A malformed record is reported and skipped rather than aborting the run. One
// bad document must not cost the export of the other nineteen — the same rule
// listScenarios() follows for a corrupt local budget.
if (skipped.length) {
  console.warn(`\n  ${skipped.length} record(s) could not be read and are NOT in the workbook:`)
  for (const s of skipped) console.warn(`    ${s.shareId}: ${s.reason}`)
}

const wb = XLSX.utils.book_new()
for (const name of SHEETS) {
  const rows = sheets[name]
  // The header is the UNION of every row's keys, not the first row's.
  // json_to_sheet takes its columns from the first object it is given, so a
  // first row from a budget with no equipment would silently truncate the sheet
  // for every row after it.
  const ws = XLSX.utils.json_to_sheet(rows, { header: headersFor(rows) })
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  console.log(`  ${name.padEnd(24)} ${String(rows.length).padStart(5)} rows`)
}

const out = `${exportStem()}.xlsx`
XLSX.writeFile(wb, out)

// A companion CSV of the widest sheet, because a 300-column xlsx is awkward to
// diff or to feed to anything that is not Excel.
writeFileSync(
  `${exportStem()}-all-data.csv`,
  (await import('../src/export-workbook.js')).toCSV(sheets['All data'])
)

console.log(`\nWrote ${out} (${count} budgets, ${SHEETS.length} sheets)`)
console.log(`Wrote ${exportStem()}-all-data.csv`)
