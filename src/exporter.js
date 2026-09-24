/**
 * Data exporter — a hidden panel that turns shared budgets into a spreadsheet.
 *
 * Author and Coalition tool, not a producer feature. Nothing on any screen
 * links to it. Modelled on themelab.js, which is the app's other hidden panel,
 * so the two behave the same way and there is one habit to learn.
 *
 * OPENING
 *   Desktop: Ctrl+Alt+E.
 *   Touch:   five taps on the "South Dakota Soil Health Coalition" line in the
 *            footer, within two seconds.
 *   Either way, Escape closes it.
 *
 *   A modifier chord rather than a lone key or a typed word, so it cannot fire
 *   mid-typing, and not Ctrl+Shift+E or Ctrl+Shift+K/P, which are a browser
 *   network panel, a console, and a private window. Themelab's reasoning at
 *   themelab.js:56 and the same conclusion.
 *
 *   A DIFFERENT TAP TARGET FROM THEMELAB'S, which owns five-taps-on-the-logo.
 *   Two counters watching one element would both advance, and a producer
 *   fidgeting with the logo would open a panel at random. The counter here is
 *   scoped to `[data-ex-tap]` through one delegated listener, which also
 *   survives the footer being re-rendered.
 *
 * THE GESTURE IS NOT THE SECURITY, AND THIS IS THE PART TO BE CAREFUL ABOUT.
 * The bundle is public on GitHub Pages, so anybody who reads the JavaScript
 * learns the chord. Themelab is safe on obfuscation alone because it edits CSS
 * variables on one device and touches no data. This reads everybody's budgets,
 * so the lock is real and it is not here:
 *
 *   - firestore.rules denies reads to everyone except a signed-in account
 *     listed in `admins`. That is enforced on Google's servers and cannot be
 *     edited from a browser, whatever this file does.
 *   - The panel opens to a password box and nothing else. Until a sign-in
 *     succeeds the server sends no documents, so an uninvited visitor who finds
 *     the chord sees an empty form.
 *
 * So opening this by accident costs nothing, which is what makes a discoverable
 * gesture an acceptable way in.
 *
 * SHEETJS IS LOADED FROM A CDN, ON DEMAND, and is deliberately not bundled.
 * This panel is online by definition — it is reading Firestore — while the app
 * around it is a PWA that precaches everything it ships. Bundling ~400 KB of
 * spreadsheet library would make every producer download it in order to never
 * use it. The CSV buttons need no library at all and work regardless.
 */

import { buildWorkbook, headersFor, toCSV, exportStem, SHEETS } from './export-workbook.js'
import { enterpriseLabel, scenarioLabel } from './calc.js'
import {
  firebaseConfig,
  EXPORT_EMAIL,
  SUBMISSIONS,
  SHARING_AVAILABLE,
} from './firebase-config.js'

const TAP_COUNT = 5
const TAP_WINDOW_MS = 2000
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'

let panel = null
let docs = []
// Which of `docs` go into the export, by index. All of them until somebody
// unticks one; reset with `docs`, so a new sign-in starts from the whole batch.
let chosen = new Set()
// The sheets built from the current choice. The download buttons read this at
// the moment they are pressed, never a copy taken when the panel was drawn.
let sheets = null

/* ──────────────────────────────── opening ──────────────────────────────── */

let taps = []

function armGestures() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault()
      toggle()
    }
    if (e.key === 'Escape' && panel) close()
  })

  // Delegated, so it keeps working across the re-renders that rebuild the
  // footer, and scoped to this element so themelab's logo counter is untouched.
  document.addEventListener('click', (e) => {
    if (!e.target?.closest?.('[data-ex-tap]')) return
    const now = Date.now()
    taps = taps.filter((t) => now - t < TAP_WINDOW_MS)
    taps.push(now)
    if (taps.length >= TAP_COUNT) {
      taps = []
      toggle()
    }
  })
}

function toggle() {
  if (panel) close()
  else open()
}

function close() {
  panel?.remove()
  panel = null
  docs = []
  chosen = new Set()
  sheets = null
}

/* ──────────────────────────────── the panel ────────────────────────────── */

function open() {
  panel = document.createElement('div')
  panel.className = 'ex-panel'
  panel.setAttribute('data-exporter', '')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Data exporter')
  panel.innerHTML = signInView()
  document.body.appendChild(panel)
  wireSignIn()
  panel.querySelector('[data-ex-password]')?.focus()
}

function signInView() {
  if (!SHARING_AVAILABLE) {
    return shell(`
      <p class="ex-note">Sharing is not configured in this build, so there is nothing to export.
      See <code>src/firebase-config.js</code> and <code>docs/DATA-EXPORT.md</code>.</p>`)
  }
  // No email field: the account is a constant (see EXPORT_EMAIL). One shared
  // password rather than an account per person.
  return shell(`
    <form data-ex-form>
      <label class="ex-label" for="exPassword">Password</label>
      <div class="ex-pass">
        <input id="exPassword" type="password" class="ex-input" data-ex-password
          autocomplete="current-password" />
        <button type="button" class="ex-eye" data-ex-eye aria-controls="exPassword"
          aria-label="Show password" aria-pressed="false">${eyeIcon(false)}</button>
      </div>
      <button type="submit" class="btn-main ex-go">Sign in</button>
      <p class="ex-err" data-ex-err hidden></p>
    </form>`)
}

/**
 * The eye on the password box. Open while the password is hidden, struck
 * through while it is showing, so the icon is the thing a press will do.
 *
 * The label stays "Show password" in both states and aria-pressed carries the
 * state, which is how a toggle button is announced.
 */
function eyeIcon(showing) {
  const eye =
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  const slash = showing ? '<path d="M4 4l16 16"/>' : ''
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${eye}${slash}</svg>`
}

function shell(inner) {
  return `
    <div class="ex-head">
      <b>Data exporter</b>
      <button type="button" class="ex-close" data-ex-close aria-label="Close">&times;</button>
    </div>
    <div class="ex-body">${inner}</div>`
}

function setBody(html) {
  const body = panel?.querySelector('.ex-body')
  if (body) body.innerHTML = html
}

function wireSignIn() {
  panel.querySelector('[data-ex-close]')?.addEventListener('click', close)
  const eye = panel.querySelector('[data-ex-eye]')
  // Keep focus in the box on a mouse press, so the caret stays where it was.
  eye?.addEventListener('mousedown', (e) => e.preventDefault())
  eye?.addEventListener('click', () => {
    const input = panel.querySelector('[data-ex-password]')
    if (!input) return
    const showing = input.type === 'password'
    input.type = showing ? 'text' : 'password'
    eye.setAttribute('aria-pressed', String(showing))
    eye.innerHTML = eyeIcon(showing)
  })
  panel.querySelector('[data-ex-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const password = panel.querySelector('[data-ex-password]')?.value ?? ''
    const err = panel.querySelector('[data-ex-err]')
    const btn = panel.querySelector('.ex-go')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Signing in…'
    }
    // The panel this sign-in belongs to. Closing and reopening makes a new
    // one, and a request still in flight for the old one must not draw its
    // batch over whatever the new one is showing.
    const mine = panel
    const result = await signInAndLoad(password)
    if (panel !== mine) return
    if (!result.ok) {
      if (err) {
        // The message names the setup step to go and fix and carries the raw
        // Firebase code — see signInMessage(). Only the password half stays
        // vague, and only because "no such user" and "wrong password" together
        // confirm an account exists at an address that is in the public bundle.
        err.textContent = result.message
        err.hidden = false
      }
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Sign in'
      }
      return
    }
    showBatch(result.docs)
  })
}

/* ───────────────────────────────── loading ─────────────────────────────── */

/** Name of this panel's own Firebase app, kept apart from the default one. */
const EXPORT_APP = 'exporter'

async function signInAndLoad(password) {
  try {
    const [{ initializeApp, getApps }, auth, firestore] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])
    // ITS OWN NAMED APP, SO IT CANNOT DISTURB THE ONE PRODUCERS USE. Sharing
    // needs `initializeFirestore()` with offline persistence, and that call
    // throws if anything has already started Firestore on the same app with
    // different options. `getFirestore()` below is exactly such a call, so on
    // the default app this panel broke sharing for the rest of the page load —
    // silently, because a failed send is swallowed by design.
    //
    // A second app is the standard way out and costs nothing: the config is the
    // same, the network is the same, and the two get separate Firestore and
    // Auth instances. It also means signing in here leaves no auth state on the
    // app the producer's budgets go through, which is the right way round for a
    // panel that is somebody else's laptop as often as not.
    const app =
      getApps().find((x) => x.name === EXPORT_APP) ?? initializeApp(firebaseConfig, EXPORT_APP)
    const a = auth.getAuth(app)
    // Session persistence, so closing the tab signs out. This is somebody
    // else's laptop as often as not.
    await auth.setPersistence(a, auth.browserSessionPersistence)
    await auth.signInWithEmailAndPassword(a, EXPORT_EMAIL, password)

    const db = firestore.getFirestore(app)
    const snap = await firestore.getDocs(firestore.collection(db, SUBMISSIONS))
    return { ok: true, docs: snap.docs.map((d) => d.data()) }
  } catch (error) {
    return { ok: false, message: signInMessage(error) }
  }
}

/**
 * Turn a Firebase error into a sentence that says what to go and fix.
 *
 * THIS PANEL IS FOR AN AUTHOR, NOT A PRODUCER, and that changes what a good
 * error message is. Everywhere else in this app a vague failure is the right
 * one. Here the person reading it is the person who has to repair the console
 * setup, and a setup step that was missed is by far the likeliest cause of any
 * failure at all. Three of the four setup steps that can be missed produce
 * DIFFERENT codes and used to produce the same sentence:
 *
 *   - Email/Password not enabled (step 4)  -> auth/operation-not-allowed
 *   - the account not added (step 6)       -> auth/invalid-credential
 *   - no admins/{uid} document (step 7)    -> permission-denied
 *   - the host not authorized (step 8)     -> auth/unauthorized-domain
 *
 * Only the third of those was ever named. The other three all landed on either
 * "That password was not accepted." or "Could not reach the database.", so a
 * missing checkbox in the console read as a typed password or a dead network,
 * and there was no way to tell from the panel which.
 *
 * THE RAW CODE IS APPENDED TO EVERY MESSAGE, including the ones this does
 * recognise. Nothing here is worth guessing at twice, and a code that is not in
 * the list above is exactly the case where the sentence is least likely to be
 * right.
 *
 * The one thing kept deliberately vague is the password itself: "no such user"
 * and "wrong password" are different sentences that together confirm an account
 * exists, and the address is a constant in the public bundle. Firebase folds
 * them into `auth/invalid-credential` for the same reason, so this does not
 * take them apart.
 */
function signInMessage(error) {
  const code = String(error?.code || error?.message || 'unknown')
  const say = (text) => `${text} (${code})`

  // NOT A FIREBASE ERROR AT ALL, and the one failure here that says nothing
  // about Firebase. index.html loads every module plainly, with no build step
  // in the markup, so this app runs perfectly well off any static server: VS
  // Code Live Server, python -m http.server, a file:// open. Every import in
  // src/ is relative and resolves. The ONLY specifiers that do not are the bare
  // ones, "firebase/app" and its two siblings, which need Vite to rewrite them
  // to a path.
  //
  // So the whole calculator works, looks right, saves, and exports, and the two
  // features that touch Firebase fail — sharing silently, this panel with a
  // browser resolver message that reads like a Firebase outage. Chrome and
  // Firefox word it differently, so both are matched.
  //
  // Worth stating plainly because the design that causes it is deliberate and
  // is not going to change: main.js is a plain module BECAUSE the Node smoke
  // tests import it.
  if (code.includes('bare specifier') || code.includes('resolve module specifier')) {
    return say(
      'This page was not served by the dev server, so "firebase/app" never resolved. ' +
        'Stop whatever is serving it, run "npm run dev", and open the URL it prints. ' +
        'Sharing is failing for the same reason.'
    )
  }
  if (code.includes('auth/operation-not-allowed')) {
    return say('Email/Password sign-in is turned off for this project. DATA-EXPORT.md step 4.')
  }
  if (code.includes('auth/unauthorized-domain')) {
    return say('This site is not an authorized domain for sign-in. DATA-EXPORT.md step 8.')
  }
  if (code.includes('auth/network-request-failed')) {
    return say('Could not reach Firebase to sign in. Check the connection, and check whether an ad blocker is blocking googleapis.com.')
  }
  if (code.includes('auth/')) {
    return say('That password was not accepted.')
  }
  if (code.includes('permission-denied')) {
    return say('Signed in, but this account is not listed in "admins". DATA-EXPORT.md step 7.')
  }
  if (code.includes('unavailable') || code.includes('failed-precondition')) {
    return say('Signed in, but could not read the database. Check the connection, and check that the rules are published. DATA-EXPORT.md step 10.')
  }
  return say('Sign-in failed.')
}

/* ──────────────────────────────── the exports ──────────────────────────── */

/**
 * Draw the ready view for a batch of documents.
 *
 * Exported so the tests can hand it a batch. Signing in needs the live project,
 * which the test suite must never reach (see app.test.js), and everything below
 * the sign-in is this function.
 */
export function showBatch(list) {
  if (!panel) return
  docs = list
  chosen = new Set(list.map((_, i) => i))
  const range = dateRange(docs)

  setBody(`
    <p class="ex-count"><span data-ex-count></span>${range ? `, ${range}` : ''}.</p>
    <p class="ex-err" data-ex-skipped hidden></p>
    ${docs.length > 1 ? pickerView() : ''}
    <button type="button" class="btn-main ex-go" data-ex-xlsx>Download Excel workbook</button>
    <p class="ex-note">Or one sheet at a time, as CSV:</p>
    <ul class="ex-csvs">
      ${SHEETS.map(
        (name) =>
          `<li><button type="button" class="tip" data-ex-csv="${esc(name)}">${esc(name)}</button>
             <span class="ex-dim" data-ex-rows="${esc(name)}"></span></li>`
      ).join('')}
    </ul>
    <p class="ex-err" data-ex-err hidden></p>`)

  wirePicker()
  refresh()

  panel.querySelector('[data-ex-xlsx]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    btn.disabled = true
    btn.textContent = 'Building…'
    try {
      await downloadXLSX(sheets, fileStem())
      btn.textContent = 'Download Excel workbook'
    } catch {
      const err = panel.querySelector('[data-ex-err]')
      if (err) {
        err.textContent = 'Could not load the spreadsheet library. The CSV buttons below still work.'
        err.hidden = false
      }
      btn.textContent = 'Download Excel workbook'
    }
    btn.disabled = chosen.size === 0
  })

  for (const btn of panel.querySelectorAll('[data-ex-csv]')) {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-ex-csv')
      download(`${fileStem()} ${name}.csv`, toCSV(sheets[name]), 'text/csv;charset=utf-8')
    })
  }
}

/* ──────────────────────────── choosing budgets ─────────────────────────── */

/**
 * The list of budgets to tick, shut by default so the common case (export
 * everything) is one button, as it was before the list existed. Not drawn for
 * a batch of one, where there is nothing to choose between.
 *
 * Newest first. A row says more than the name, because most budgets are still
 * called "My Budget Scenario": the date it was last sent and its enterprises
 * are what tell two of them apart.
 */
function pickerView() {
  const order = docs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (Number(b.d?.updatedAt) || 0) - (Number(a.d?.updatedAt) || 0))
  return `
    <details class="ex-pick" data-ex-pick>
      <summary>Choose budgets <span class="ex-dim" data-ex-pick-count></span></summary>
      <input type="search" class="ex-input ex-filter" data-ex-filter
        placeholder="Filter by name, enterprise, or crop" aria-label="Filter budgets" />
      <p class="ex-pick-btns">
        <button type="button" class="tip" data-ex-all>Select all</button>
        <button type="button" class="tip" data-ex-none>Clear</button>
      </p>
      <ul class="ex-list">
        ${order.map(({ d, i }) => pickRow(d, i)).join('')}
      </ul>
    </details>`
}

function pickRow(doc, i) {
  const ents = Array.isArray(doc?.scenario?.enterprises) ? doc.scenario.enterprises : []
  const acres = ents.reduce((a, e) => a + (Number(e?.acres) || 0), 0)
  const labels = ents.map((e, n) => enterpriseLabel(e, n))
  const when = Number.isFinite(Number(doc?.updatedAt))
    ? new Date(Number(doc.updatedAt)).toLocaleDateString()
    : ''
  const detail = [when && `Updated ${when}`, labels.join(', '), acres ? `${acres} ac` : '']
    .filter(Boolean)
    .join(' · ')
  return `
    <li data-ex-item="${i}" data-ex-search="${esc(searchText(doc))}">
      <label>
        <input type="checkbox" data-ex-pick-id="${i}" ${chosen.has(i) ? 'checked' : ''} />
        <span>
          <b>${esc(scenarioLabel(doc))}</b>${doc?.deletedAt ? ' <span class="ex-dim">(deleted)</span>' : ''}
          <span class="ex-dim ex-sub">${esc(detail)}</span>
        </span>
      </label>
    </li>`
}

/** What the filter matches: the budget name, enterprise names, crops, and year. */
function searchText(doc) {
  const ents = Array.isArray(doc?.scenario?.enterprises) ? doc.scenario.enterprises : []
  return [doc?.name, doc?.scenarioYear, ...ents.flatMap((e) => [e?.name, e?.crop])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function wirePicker() {
  const pick = panel.querySelector('[data-ex-pick]')
  if (!pick) return

  pick.addEventListener('change', (e) => {
    const id = e.target?.getAttribute?.('data-ex-pick-id')
    if (id === null || id === undefined) return
    if (e.target.checked) chosen.add(Number(id))
    else chosen.delete(Number(id))
    refresh()
  })

  // A comma splits the box into terms, and a row matching ANY of them stays:
  // the same rule as the filter on the Saved tab, so "corn, soybeans" is both.
  pick.querySelector('[data-ex-filter]')?.addEventListener('input', (e) => {
    const terms = e.target.value
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    for (const row of pick.querySelectorAll('[data-ex-item]')) {
      const text = row.getAttribute('data-ex-search') || ''
      row.hidden = terms.length > 0 && !terms.some((t) => text.includes(t))
    }
  })

  // Both act on the rows on screen, so a filter then Select all picks exactly
  // what the filter found. A tick on a row filtered out of sight is left alone.
  const setVisible = (on) => {
    for (const box of pick.querySelectorAll('[data-ex-pick-id]')) {
      if (box.closest('[data-ex-item]')?.hidden) continue
      box.checked = on
      const i = Number(box.getAttribute('data-ex-pick-id'))
      if (on) chosen.add(i)
      else chosen.delete(i)
    }
    refresh()
  }
  pick.querySelector('[data-ex-all]')?.addEventListener('click', () => setVisible(true))
  pick.querySelector('[data-ex-none]')?.addEventListener('click', () => setVisible(false))
}

/** Rebuild the sheets from the ticked budgets and rewrite every figure that says so. */
function refresh() {
  const picked = docs.filter((_, i) => chosen.has(i))
  const built = buildWorkbook(picked)
  sheets = built.sheets
  const total = docs.length
  const all = picked.length === total

  const count = panel.querySelector('[data-ex-count]')
  if (count) {
    count.innerHTML = all
      ? `<b>${total}</b> shared budget${total === 1 ? '' : 's'}`
      : `<b>${picked.length}</b> of ${total} shared budgets selected`
  }
  const pickCount = panel.querySelector('[data-ex-pick-count]')
  if (pickCount) pickCount.textContent = all ? '(all)' : `(${picked.length} of ${total})`

  const skipped = panel.querySelector('[data-ex-skipped]')
  if (skipped) {
    skipped.textContent = `${built.skipped.length} record(s) could not be read and are not in the export.`
    skipped.hidden = built.skipped.length === 0
  }

  for (const name of SHEETS) {
    const n = sheets[name].length
    const cell = panel.querySelector(`[data-ex-rows="${name}"]`)
    if (cell) cell.textContent = `${n} row${n === 1 ? '' : 's'}`
  }

  // Nothing ticked is not an export of nothing: a workbook of empty sheets
  // looks exactly like a broken one once it is on somebody's desktop.
  const none = picked.length === 0
  for (const btn of panel.querySelectorAll('[data-ex-xlsx], [data-ex-csv]')) btn.disabled = none
}

/**
 * The file name. A subset says so, because two files called
 * submissions-2026-09-24 holding different budgets is one of them being
 * mistaken for the other.
 */
function fileStem() {
  const total = docs.length
  return chosen.size === total ? exportStem() : `${exportStem()} (${chosen.size} of ${total})`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** First-sent to last-updated across the batch, for the count line. */
function dateRange(list) {
  const times = list.map((d) => Number(d?.firstSentAt)).filter(Number.isFinite)
  if (!times.length) return ''
  const fmt = (t) => new Date(t).toLocaleDateString()
  const lo = fmt(Math.min(...times))
  const hi = fmt(Math.max(...times))
  return lo === hi ? `sent ${lo}` : `${lo} to ${hi}`
}

async function downloadXLSX(sheets, stem) {
  const XLSX = await loadSheetJS()
  const wb = XLSX.utils.book_new()
  for (const name of SHEETS) {
    const rows = sheets[name]
    // The header is the UNION of every row's keys, not the first row's. A row
    // from a budget with no equipment carries fewer keys, and json_to_sheet
    // takes its columns from the first object it sees, so a first row that
    // happened to be the sparse one would silently truncate the sheet.
    const ws = XLSX.utils.json_to_sheet(rows, { header: headersFor(rows) })
    // Excel's own limit. Every name here is well inside it, but the sheet is
    // created with an invalid name rather than an error if one ever is not.
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${stem}.xlsx`)
}

let sheetJSPromise = null

function loadSheetJS() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX)
  if (!sheetJSPromise) {
    sheetJSPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SHEETJS_URL
      s.onload = () => (globalThis.XLSX ? resolve(globalThis.XLSX) : reject(new Error('no XLSX')))
      s.onerror = () => {
        sheetJSPromise = null
        reject(new Error('script failed'))
      }
      document.head.appendChild(s)
    })
  }
  return sheetJSPromise
}

function download(filename, text, type) {
  const blob = new Blob([text], { type })
  // Revoked through the same object that minted it, a second later.
  const urls = URL
  const url = urls.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => urls.revokeObjectURL(url), 1000)
}

/* ─────────────────────────────────── boot ──────────────────────────────── */

if (typeof document !== 'undefined') armGestures()
