/**
 * Sending a shared budget to the Coalition. The only file that touches Firebase.
 *
 * Replaces the old submit.js stub, which sketched this shape and never ran. The
 * decisions its header comment asked for have now been made: producers are
 * asked on their first save, nothing identifying is collected, and the answer
 * is a device preference they can reverse.
 *
 * FOUR RULES, all of them load-bearing.
 *
 * 1. NOTHING HERE IS IMPORTED STATICALLY BY main.js. index.html loads main.js
 *    as a plain module so the Node smoke tests can import it, and the Firebase
 *    SDK dragged into jsdom finds no IndexedDB. main.js reaches this file
 *    through a dynamic import inside the save path, which also lets Rollup
 *    split it into its own chunk, so a producer who never shares never
 *    downloads it.
 *
 * 2. ONE DOCUMENT PER BUDGET, KEYED ON shareId, WRITTEN WITH setDoc. Saving the
 *    same budget again updates that document rather than adding another. This
 *    is what makes an unfinished budget harmless: it corrects itself when the
 *    producer finishes it, which is why nothing has to interrupt a save to ask
 *    whether the work is done.
 *
 * 3. A FAILED SEND MUST NEVER BREAK A SAVE. The budget is already safely in
 *    localStorage by the time anything here runs, and the network is the part
 *    that can be missing. Every entry point swallows its own failures, the same
 *    rule analytics.js follows for the same reason.
 *
 * 4. TIMESTAMPS ARE Date.now() MILLIS, NOT serverTimestamp(). A queued offline
 *    write resolves serverTimestamp to null, which sorts as the epoch and reads
 *    as a corrupt record. That matters here more than most places: this is used
 *    at the Soil Health School, where there may be no signal at all, so the
 *    offline path is the normal path rather than the edge case.
 */

import { calcScenario } from './calc.js'
import { ensureShareId } from './state.js'
import { clearAllShareIds, firstSentAt } from './storage.js'
import { firebaseConfig, SUBMISSIONS, SHARING_AVAILABLE } from './firebase-config.js'

/* ──────────────────────────── lazy connection ──────────────────────────── */

let dbPromise = null

/**
 * Whether this environment can hold a Firestore connection at all.
 *
 * Checked before the SDK is even imported, because loading it is the expensive
 * and hanging part rather than a cheap thing to try and catch.
 *
 * IndexedDB is the requirement, and not an incidental one: `persistentLocalCache`
 * below is the entire offline story, so a place without IndexedDB is a place
 * where a shared budget could not be queued even if the connection succeeded.
 * Three real cases, and the first is the one that found this:
 *
 *   - **jsdom**, where the smoke tests boot the whole app. Before this guard, a
 *     configured build hung the suite: `initializeFirestore()` sat waiting on a
 *     database that will never open, inside a promise nothing was awaiting.
 *   - **Safari private mode and Firefox with site data blocked**, where
 *     `indexedDB` exists but opening throws. Same shape of failure on a real
 *     producer's phone.
 *   - **A service worker or any other window-less context**, which has no
 *     business sending a budget.
 *
 * Returning false is not an error state. Sharing simply does not happen, the
 * budget is still saved locally, and nothing on screen claims otherwise.
 */
function canConnect() {
  try {
    if (isNodeRuntime()) return false
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && window.indexedDB !== null
  } catch {
    return false
  }
}

/**
 * Whether this is Node rather than a browser, whatever the DOM around it says.
 *
 * A SECOND AND DELIBERATELY INDEPENDENT GUARD, and it is here because the first
 * one already failed once in production. The smoke tests boot the whole app in
 * jsdom and drive it through roughly sixty saves, every one of them on a
 * `newScenario()` named "My Budget Scenario" with nothing filled in. For the
 * length of one hung test run those went to the live collection, and what
 * arrived was ten identical empty budgets carrying a producer-facing default
 * name. Nobody entered them and nothing on screen could ever have produced
 * them.
 *
 * The IndexedDB check above would have stopped it and does stop it now. But it
 * tests a CAPABILITY, and a capability can arrive: jsdom is a moving target,
 * and the day it ships IndexedDB the app starts writing test fixtures into the
 * Coalition's records again, silently, with no failure anywhere to notice. This
 * tests IDENTITY instead, which cannot change underneath us — a browser never
 * has `process.versions.node`, and Node always does. Two reasons for the same
 * refusal, sharing no assumption.
 *
 * `appVersion` is what made the ten rows readable after the fact: vite's
 * `define` stamps the real version in dev and in a build alike, so 'dev' means
 * `node --test` and nothing else. Left in place for the same reason.
 */
function isNodeRuntime() {
  try {
    return typeof process !== 'undefined' && typeof process.versions?.node === 'string'
  } catch {
    return false
  }
}

/**
 * Connect on first use, never at import time.
 *
 * Offline persistence is on, which is the whole offline story: Firestore queues
 * writes in IndexedDB and flushes them when the connection returns. The old
 * stub hand-rolled a localStorage queue to do this; the SDK does it properly,
 * including across a page reload, so the queue is gone.
 *
 * Single-tab persistence rather than multi-tab. Two tabs of a budget calculator
 * is already an odd state, the conflict machinery in storage.js exists for it,
 * and the multi-tab manager costs a leader election on every open.
 */
async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ initializeApp, getApps }, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ])
      // The DEFAULT app by name, never getApps()[0]. The exporter panel runs a
      // second, named app beside this one, and index.html loads it first — so
      // position in that array is whichever module happened to connect first,
      // which is a coin toss decided by whether somebody opened the panel.
      const app =
        getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig)
      const db = startFirestore(app, firestore)
      bindNetworkToOnlineState(db, firestore)
      return { db, firestore }
    })().catch((err) => {
      // Let the next call try again rather than caching a rejected promise
      // forever, which would make one flaky boot permanent for the session.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/**
 * Start Firestore with offline persistence, or take what is already running.
 *
 * `initializeFirestore()` can only be called once per app, and THROWS if it is
 * called a second time with different options. That is not a hypothetical: it
 * shipped. `getFirestore()` starts the default instance if none exists, so
 * anything that called it first left this one to throw
 * "initializeFirestore() has already been called with different options" — and
 * because a failed send is swallowed by design (rule 3 above), the result was
 * sharing that silently stopped working for the rest of the page load, with a
 * budget on screen still saying Shared.
 *
 * The exporter now runs its own named app, so nothing in this repo should reach
 * the fallback. It stays anyway, because the cost of being wrong about that is
 * a producer whose budgets quietly stop sending, and the cost of the fallback
 * is one try/catch. Losing persistence is a real loss and not one to pretend
 * away — the offline queue is the whole offline story — so it says so out loud
 * rather than degrading in silence.
 */
function startFirestore(app, firestore) {
  try {
    return firestore.initializeFirestore(app, {
      localCache: firestore.persistentLocalCache({
        tabManager: firestore.persistentSingleTabManager(),
      }),
    })
  } catch {
    console.warn('[share] Firestore was already started by something else: no offline queue')
    return firestore.getFirestore(app)
  }
}

/**
 * Tell Firestore what the browser already knows.
 *
 * Left alone, a write made while offline waits on its own timeout before
 * falling back to the cache, which is seconds of nothing happening on a device
 * that could have said so immediately.
 */
function bindNetworkToOnlineState(db, firestore) {
  try {
    if (typeof window === 'undefined') return
    window.addEventListener('offline', () => firestore.disableNetwork(db).catch(() => {}))
    window.addEventListener('online', () => firestore.enableNetwork(db).catch(() => {}))
    if (navigator?.onLine === false) firestore.disableNetwork(db).catch(() => {})
  } catch {
    /* never let this break a save */
  }
}

/**
 * Do not wait on a write that cannot land yet.
 *
 * A Firestore write promise stays pending until the server acknowledges it, so
 * offline it never settles at all. The write is already durable in IndexedDB by
 * the time this returns, so resolving early is honest about what has happened:
 * the budget is queued and will go. Borrowed from the games-hub data layer,
 * where the same thing was learned at a kiosk with bad wifi.
 */
function settleWrite(promise) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    promise.catch(() => {})
    return Promise.resolve({ ok: true, queued: true })
  }
  return promise.then(() => ({ ok: true })).catch((error) => ({ ok: false, error }))
}

/* ─────────────────────────────── the document ──────────────────────────── */

/** Build number, stamped by vite.config.js. Absent under node --test. */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/**
 * What gets sent.
 *
 * The whole scenario goes in verbatim under `scenario`, rather than a
 * hand-picked subset. Two reasons: the producer consented to "every figure you
 * entered", so a subset would be less than they were told; and the flattening
 * into spreadsheet columns happens in export-workbook.js at export time, so a
 * question nobody thought of today can be answered from records already
 * collected instead of needing a second round of collection.
 *
 * `id`, `folderId`, and `sortIndex` are dropped. All three describe this
 * device's own list — what the budget's local key is, which folder it is in,
 * where it sits — and none of them mean anything to a reader of the collection.
 * `id` in particular is NOT unique across devices (see the SCHEMA_VERSION note
 * in calc.js), so keeping it would look like an identifier and behave like a
 * collision waiting to happen.
 *
 * Results are recomputed rather than read off a stored `results`, the same rule
 * the screen, the CSV, and the PNG all follow.
 */
export function buildSubmission(scenario) {
  const { id, folderId, sortIndex, shareId, ...rest } = scenario
  const r = calcScenario(scenario)
  const now = Date.now()
  return {
    shareId: scenario.shareId,
    schemaVersion: scenario.schemaVersion,
    appVersion: APP_VERSION,
    // The producer's own label and the year the plan is FOR. Both are sent
    // because both were named in the consent text, and the name is capped at
    // the length firestore.rules enforces so a long one is trimmed here rather
    // than rejected there.
    name: String(scenario.name ?? '').slice(0, 120),
    scenarioYear: String(scenario.scenarioYear ?? ''),
    createdAt: String(scenario.createdAt ?? ''),
    // Read from this device rather than stamped, because `merge: true` leaves
    // alone only the fields a payload OMITS. Stamped here it overwrote itself
    // on every send and was `updatedAt` under another name. See KEY_SHARE_FIRST
    // in storage.js, and why the document cannot simply be read instead.
    firstSentAt: firstSentAt(scenario.shareId, now),
    updatedAt: now,
    scenario: rest,
    results: {
      totalAcres: r.totalAcres,
      totalRevenue: r.totals.totalRevenue,
      totalVariable: r.totals.totalVariable,
      totalGrossMargin: r.totals.totalGrossMargin,
      totalFixed: r.totals.totalFixed,
      totalProfit: r.totals.totalProfit,
      profitPerAcre: r.totals.profitPerAcre,
    },
  }
}

/* ──────────────────────────────── sending ──────────────────────────────── */

/**
 * Send or update one budget's record.
 *
 * ensureShareId() runs here as a backstop only. EVERY CALLER MUST HAVE SAVED
 * FIRST — the key has to be on disk before the record it names exists, because
 * reads are denied and a record whose key was never written down can never be
 * updated or deleted. All three call sites do (`save-scenario`, `shareNow()`,
 * `shareOnOpen()`), and this call cannot enforce it: it stamps in memory and
 * persists nothing. A new caller that skips the save creates an unreachable
 * document, and nothing here will catch it.
 *
 * THE MERGE DOES NOT KEEP THE FIRST SEND DATE HONEST, and a comment here used
 * to say it did. `merge: true` leaves untouched only the fields a payload
 * omits; a field present on every write is overwritten on every write. So
 * `firstSentAt` stamped at send time was `updatedAt` spelled differently, and
 * the exporter reported last activity as first contact. It now comes from this
 * device's own record of it — see `firstSentAt()` in storage.js — because reads
 * are denied and the document cannot be consulted.
 */
export async function shareBudget(scenario) {
  if (!SHARING_AVAILABLE || !scenario) return { ok: false, error: 'Unavailable' }
  if (!canConnect()) return { ok: false, error: 'NoStorage' }
  try {
    ensureShareId(scenario)
    const { db, firestore } = await getDb()
    const payload = buildSubmission(scenario)
    const ref = firestore.doc(db, SUBMISSIONS, scenario.shareId)
    // A SEND UNMARKS. A budget can come back after its record was marked
    // deleted: a backup made before the delete, restored afterwards, brings it
    // back with its key intact. Merge keeps every field a payload omits, so
    // without this the record would stay marked deleted forever while the
    // producer was actively editing the budget — and the workbook would report
    // a live farm as gone. deleteField() removes the key rather than writing a
    // null, so firestore.rules' hasOnly() sees a document that simply does not
    // have it, and a record that was never marked is unaffected.
    return await settleWrite(
      firestore.setDoc(
        ref,
        { ...payload, deletedAt: firestore.deleteField() },
        { merge: true }
      )
    )
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Withdraw everything this device has sent.
 *
 * Local first, remote second, and the order is deliberate — see
 * clearAllShareIds(). If the local write fails, nothing is deleted remotely and
 * the budgets still hold their keys, so the producer can try again. The other
 * order can strand a budget pointing at a document that no longer exists, which
 * its next save would recreate.
 *
 * Deletes are settled together and individually tolerant: one document that
 * will not go must not strand the other nineteen.
 */
/**
 * Mark the record named by `shareId` as deleted, and keep the figures.
 *
 * THIS IS NOT A WITHDRAWAL, and the difference is the whole reason it exists.
 * A producer clearing last year's plans out of their saved list is tidying
 * their own device, not asking the Coalition to forget what they contributed —
 * and last year's costs are exactly the data this collection is being gathered
 * for. Withdrawing is the Share switch, which still deletes everything, marked
 * records included.
 *
 * `deletedAt` RATHER THAN A RENAME. The obvious alternative is to prefix the
 * budget name, and it is worse in a way that only shows up later: `name` is the
 * producer's own text, so rewriting it makes every export ambiguous about what
 * they actually typed, and a reader filtering the workbook would be pattern
 * matching on a label instead of reading a column. It is a separate optional
 * field in firestore.rules for the same reason.
 *
 * A MERGE THAT WRITES TWO FIELDS AND TOUCHES NOTHING ELSE. Merge leaves alone
 * only the fields a payload omits, which is the trap `firstSentAt` fell into —
 * here it is what makes this safe, since every figure is omitted and therefore
 * kept exactly as last sent.
 *
 * If no record was ever created, the rules reject this: a merge onto a missing
 * document would leave one with no `name`, no `scenario`, and no `results`, and
 * all three are required. That is the right failure, and it is reported rather
 * than thrown.
 */
export async function markBudgetDeleted(shareId) {
  if (!SHARING_AVAILABLE) return { ok: false, error: 'Unavailable' }
  if (typeof shareId !== 'string' || !shareId) return { ok: false, error: 'NoKey' }
  if (!canConnect()) return { ok: false, error: 'NoStorage' }
  try {
    const { db, firestore } = await getDb()
    const now = Date.now()
    return await settleWrite(
      firestore.setDoc(
        firestore.doc(db, SUBMISSIONS, shareId),
        { deletedAt: now, updatedAt: now },
        { merge: true }
      )
    )
  } catch (error) {
    return { ok: false, error }
  }
}

export async function unshareEverything() {
  // The local half runs FIRST and runs even where the remote half cannot, which
  // is the right way round: an environment that could not connect never sent
  // anything, so there is nothing out there to strand, and the producer's
  // instruction to stop is honoured either way.
  //
  // THE SHARING_AVAILABLE CHECK IS BELOW THIS, NOT ABOVE IT, and it used to be
  // above. Keys are stamped whenever SHARING_ENABLED, so an unconfigured build
  // hands out keys and sent nothing — and returning early left every one of
  // them on the budgets, along with the tombstones, after a producer had asked
  // the app to stop. Nothing was at risk, but the device then disagreed with
  // itself about what it had shared, which is the state every other path here
  // works to avoid.
  const cleared = clearAllShareIds()
  if (!cleared.ok) return cleared
  if (!cleared.ids.length) return { ok: true, deleted: 0 }
  if (!SHARING_AVAILABLE) return { ok: true, deleted: 0, localCleared: cleared.ids.length }
  if (!canConnect()) return { ok: true, deleted: 0, localCleared: cleared.ids.length }
  try {
    const { db, firestore } = await getDb()
    // THROUGH settleWrite(), for the same reason every other write here is: a
    // Firestore promise stays pending until the server acknowledges it, so
    // offline these never settle at all. Deletes were awaited directly, and
    // offline — the normal path at the Soil Health School — this hung forever.
    //
    // The caller in main.js clears the working budget's own key in the `.then()`
    // of this promise, so hanging here left that budget holding a key its
    // stored copy had already lost, and the producer's next save wrote it
    // straight back. Turning sharing off appeared to work and then quietly
    // undid itself.
    const results = await Promise.all(
      cleared.ids.map((id) => settleWrite(firestore.deleteDoc(firestore.doc(db, SUBMISSIONS, id))))
    )
    return { ok: true, deleted: results.filter((r) => r.ok).length }
  } catch (error) {
    // The local half succeeded, so this device has already stopped sharing and
    // stopped naming those records. Report rather than throw.
    return { ok: false, error, localCleared: cleared.ids.length }
  }
}
