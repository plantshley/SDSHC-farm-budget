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
      <input id="exPassword" type="password" class="ex-input" data-ex-password
        autocomplete="current-password" />
      <button type="submit" class="btn-main ex-go">Sign in</button>
      <p class="ex-err" data-ex-err hidden></p>
    </form>`)
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
  panel.querySelector('[data-ex-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const password = panel.querySelector('[data-ex-password]')?.value ?? ''
    const err = panel.querySelector('[data-ex-err]')
    const btn = panel.querySelector('.ex-go')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Signing in…'
    }
    const result = await signInAndLoad(password)
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
    renderReady()
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
    docs = snap.docs.map((d) => d.data())
    return { ok: true }
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

function renderReady() {
  const { sheets, count, skipped } = buildWorkbook(docs)
  const range = dateRange(docs)

  setBody(`
    <p class="ex-count"><b>${count}</b> shared budget${count === 1 ? '' : 's'}${
      range ? `, ${range}` : ''
    }.</p>
    ${skipped.length ? `<p class="ex-err">${skipped.length} record(s) could not be read and are not in the export.</p>` : ''}
    <button type="button" class="btn-main ex-go" data-ex-xlsx>Download Excel workbook</button>
    <p class="ex-note">Or one sheet at a time, as CSV:</p>
    <ul class="ex-csvs">
      ${SHEETS.map(
        (name) =>
          `<li><button type="button" class="tip" data-ex-csv="${name}">${name}</button>
             <span class="ex-dim">${sheets[name].length} row${sheets[name].length === 1 ? '' : 's'}</span></li>`
      ).join('')}
    </ul>
    <p class="ex-err" data-ex-err hidden></p>`)

  panel.querySelector('[data-ex-xlsx]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    btn.disabled = true
    btn.textContent = 'Building…'
    try {
      await downloadXLSX(sheets)
      btn.textContent = 'Download Excel workbook'
    } catch {
      const err = panel.querySelector('[data-ex-err]')
      if (err) {
        err.textContent = 'Could not load the spreadsheet library. The CSV buttons below still work.'
        err.hidden = false
      }
      btn.textContent = 'Download Excel workbook'
    }
    btn.disabled = false
  })

  for (const btn of panel.querySelectorAll('[data-ex-csv]')) {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-ex-csv')
      download(`${exportStem()} ${name}.csv`, toCSV(sheets[name]), 'text/csv;charset=utf-8')
    })
  }
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

async function downloadXLSX(sheets) {
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
  XLSX.writeFile(wb, `${exportStem()}.xlsx`)
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ─────────────────────────────────── boot ──────────────────────────────── */

if (typeof document !== 'undefined') armGestures()
