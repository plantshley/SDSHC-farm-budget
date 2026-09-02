/**
 * Delete every shared budget from the collection. Irreversible.
 *
 *   npm run clear-submissions -- --project sdshc-farm-budget --yes
 *
 * FOR CLEARING OUT TEST DATA, and nothing else. Producers withdraw by turning
 * the Share switch off in the app, which deletes what their own device sent and
 * leaves everybody else's records alone. This deletes EVERY record from EVERY
 * device, including budgets real people shared and cannot send again — reads
 * are denied, so nothing on their machine can tell that its record is gone, and
 * a budget already saved will not re-send until they next open or save it.
 *
 * THE GUARDS ARE THE POINT. This is the one script here that destroys data, so
 * it refuses to run on a bare invocation and asks for two things that cannot be
 * supplied by accident:
 *
 *   --project <id>   must match the project the key actually belongs to, so a
 *                    key swapped in from another Firebase project stops the run
 *                    instead of emptying the wrong collection
 *   --yes            says out loud that the count printed above is acceptable
 *
 * Without --yes it prints what it WOULD delete and exits without touching
 * anything, which is the useful way to run it first.
 *
 * There is deliberately no --force to skip the project check. Typing the
 * project id is the whole safety mechanism.
 *
 * SETUP: the same tools/service-account.json that export-submissions.mjs uses.
 * See docs/DATA-EXPORT.md. That file bypasses every rule in firestore.rules; it
 * is gitignored and must not be emailed or pasted anywhere.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(here, 'service-account.json')
const COLLECTION = 'budget-submissions'

// Firestore's own cap on a batched write. A collection larger than this is
// deleted in several passes rather than one that would be rejected whole.
const BATCH_LIMIT = 500

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const wanted = args.includes('--project') ? args[args.indexOf('--project') + 1] : null
const confirmed = args.includes('--yes')

if (!existsSync(KEY_PATH)) {
  fail(
    `No service-account key at tools/service-account.json.\n\n` +
      `Firebase console → Project settings → Service accounts → Generate new private key,\n` +
      `save it there, and check it is gitignored before you commit anything.\n` +
      `Full steps: docs/DATA-EXPORT.md.`
  )
}

let admin
try {
  admin = await import('firebase-admin/app')
} catch {
  fail('firebase-admin is not installed. Run: npm install')
}

const { getFirestore } = await import('firebase-admin/firestore')
const credentials = JSON.parse(readFileSync(KEY_PATH, 'utf8'))
const project = credentials.project_id

// CHECKED BEFORE THE CONNECTION, so a mismatch costs nothing and reads clearly.
// The key names the project it belongs to, so this compares what you meant
// against what you are actually holding.
if (!wanted) {
  fail(
    `Name the project you mean to empty:\n\n` +
      `  npm run clear-submissions -- --project ${project}\n\n` +
      `That key belongs to "${project}". Add --yes once you have seen the count.`
  )
}
if (wanted !== project) {
  fail(
    `That key is for "${project}", not "${wanted}".\n\n` +
      `Nothing was touched. Check which service-account.json is in tools/.`
  )
}

admin.initializeApp({ credential: admin.cert(credentials) })
const db = getFirestore()

console.log(`Reading ${COLLECTION} from ${project}…`)
// Ids only. The documents hold whole budgets and this never needs to look
// inside one, so there is no reason to pull them across or to have them sitting
// in a terminal's scrollback.
const snap = await db.collection(COLLECTION).select().get()
const ids = snap.docs.map((d) => d.id)

if (!ids.length) {
  console.log('The collection is already empty. Nothing to do.')
  process.exit(0)
}

console.log(`  ${ids.length} record${ids.length === 1 ? '' : 's'}.`)

if (!confirmed) {
  console.log(
    `\nDRY RUN — nothing was deleted.\n\n` +
      `This would permanently delete all ${ids.length} of them, from every device\n` +
      `that has shared, not just this one. To go ahead:\n\n` +
      `  npm run clear-submissions -- --project ${project} --yes\n`
  )
  process.exit(0)
}

console.log(`\nDeleting ${ids.length}…`)
let done = 0
for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
  const batch = db.batch()
  for (const id of ids.slice(i, i + BATCH_LIMIT)) {
    batch.delete(db.collection(COLLECTION).doc(id))
  }
  await batch.commit()
  done += Math.min(BATCH_LIMIT, ids.length - i)
  console.log(`  ${done}/${ids.length}`)
}

console.log(
  `\nDone. ${done} record${done === 1 ? '' : 's'} deleted.\n\n` +
    `Devices that shared still hold their keys, so those budgets will send again\n` +
    `the next time each one is opened or saved. To stop that on YOUR device, turn\n` +
    `the Share switch off, or clear these in the browser console:\n\n` +
    `  ['sdshc-fb-share','sdshc-fb-share-asked','sdshc-fb-share-first',\n` +
    `   'sdshc-fb-share-deleted'].forEach(k => localStorage.removeItem(k))\n`
)
