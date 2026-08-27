/**
 * GA4, and the four rules that keep it out of everything else's way.
 *
 *   1. **Nothing a producer typed ever leaves the device.** Only structure goes
 *      out: which screen, which entry mode, which typical value, which
 *      definition. Every dollar figure, every crop name, every budget name and
 *      every saved scenario stays here. That is what the `privacy` definition and
 *      `.footer-privacy` promise, so a new call to `track()` carrying a number
 *      somebody entered breaks a written promise and not merely a convention.
 *
 *      Enterprise budgets are commercially sensitive in a way a grazing
 *      worksheet is not. A crop name plus an acreage plus a price is close to an
 *      identifiable operation in a state this size, so the line is drawn tighter
 *      here: counts and mode names only, never a name and never an amount.
 *   2. **It never throws and never blocks.** Every entry point is wrapped, and a
 *      failure is swallowed. Analytics that can break the calculator is worse
 *      than no analytics.
 *   3. **Production on the real host only.** `npm run dev` and a local preview
 *      send nothing, so the reports are not half your own testing.
 *   4. **`calc.js` never learns this file exists.** The model stays pure. Every
 *      call is made from `main.js`, `prefs.js`, or a `ui/` module.
 *
 * Offline: `gtag.js` is cross-origin and is deliberately NOT precached, so an
 * offline session records nothing at all. That is expected, not a bug, and it
 * matters more here than anywhere: this is used at the Soil Health School and in
 * the field, potentially with no signal, so a workshop room with poor reception
 * can register as almost no traffic. Do not read a quiet week as nobody using
 * it. See the reference guide.
 */

/** The Farm Plan Budget stream. The grazing calculator has its own; do not paste it here. */
const MEASUREMENT_ID = 'G-H3X4G4WPYH'

/** Where the deployed copy lives. Anywhere else is somebody's fork or a preview. */
const LIVE_HOST = 'plantshley.github.io'

/**
 * The author's own opt-out, in localStorage rather than a GA IP filter.
 *
 * A residential IP is dynamic and does not cover a phone on cell data, so an IP
 * filter goes stale silently. This does not: visit the live site once with
 * `?noga=1` and that browser stops reporting for good. `?noga=0` turns it back
 * on. At twenty real users a month, fifteen deploy checks would otherwise be
 * nearly half the data.
 */
const OPT_OUT_KEY = 'sdshc-fb-noga'

let live = false

/** Events that must fire once per calculation, keyed by `${id}:${what}`. */
const fired = new Set()

/* ───────────────────────────────── boot ───────────────────────────────── */

/**
 * Read `?noga`, remember the answer, and say whether this browser has opted out.
 *
 * The flag is read on every load rather than only when present, so turning it
 * back off is possible from the same place it was turned on.
 */
function optedOut() {
  try {
    const flag = new URLSearchParams(location.search).get('noga')
    if (flag === '1') localStorage.setItem(OPT_OUT_KEY, '1')
    if (flag === '0') localStorage.removeItem(OPT_OUT_KEY)
    return localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch {
    // No storage at all (private mode with everything blocked). Report as normal
    // rather than opting a real user out by accident.
    return false
  }
}

/**
 * Inject gtag.js and send the first page_view.
 *
 * `userProps` are the display preferences as they stand RIGHT NOW, not when they
 * were last changed. Somebody who chose mono six months ago and has been happy
 * since fires no change event, so reading the change events as "font usage"
 * would show mono as near-dead however popular it is. User-scoped dimensions are
 * what make the proportion true; `theme_change` and `font_change` answer the
 * different question of whether anyone goes looking for the setting.
 */
export function initAnalytics(userProps = {}) {
  try {
    if (!import.meta.env?.PROD) {
      // Still useful locally: this is how you check a call site is wired without
      // putting a test event into the reports.
      window.__gaDebug = true
      return
    }
    if (location.hostname !== LIVE_HOST) return
    if (optedOut()) return

    window.dataLayer = window.dataLayer || []
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', MEASUREMENT_ID, {
      // Single-page, and nothing here touches the History API, so GA's
      // automatic page_view fires once per load and nothing else. Every move
      // inside the app is an explicit event instead.
      send_page_view: true,
      user_properties: {
        ...userProps,
        display_mode: displayMode(),
      },
    })

    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
    document.head.appendChild(s)
    live = true

    // Installing is a strong signal and there is no other way to see it.
    window.addEventListener('appinstalled', () => track('pwa_installed'))
  } catch {
    /* never let this break the page */
  }
}

/** Running in the installed app, or in a browser tab. */
function displayMode() {
  try {
    return window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone
      ? 'standalone'
      : 'browser'
  } catch {
    return 'browser'
  }
}

/* ──────────────────────────────── sending ──────────────────────────────── */

/**
 * One event.
 *
 * Undefined parameters are dropped rather than sent, because GA renders a missing
 * dimension as "(not set)" and a column of those reads as a bug in the tag.
 * Values are trimmed to GA's 100-character ceiling.
 */
export function track(name, params = {}) {
  try {
    const clean = {}
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      clean[k] = typeof v === 'string' ? v.slice(0, 100) : v
    }
    if (window.__gaDebug) console.debug('[ga]', name, clean)
    if (!live) return
    window.gtag?.('event', name, clean)
  } catch {
    /* never let this break the page */
  }
}

/**
 * An event that must not repeat for the same calculation.
 *
 * `budget_complete` would otherwise fire on every keystroke once the budget first
 * balances, and `warning_shown` on every keystroke the warning survives. Keyed by
 * the scenario's id, so starting a new one arms them again.
 */
export function trackOnce(id, name, params = {}) {
  const key = `${id}:${name}:${params.warning_id ?? ''}`
  if (fired.has(key)) return
  fired.add(key)
  track(name, params)
}

/** A new budget re-arms everything `trackOnce()` has already sent for it. */
export function resetOnce(id) {
  for (const key of [...fired]) if (key.startsWith(`${id}:`)) fired.delete(key)
}

/** Current display preferences, as user-scoped dimensions. */
export function setUserProps(props) {
  try {
    if (window.__gaDebug) console.debug('[ga] user_properties', props)
    if (!live) return
    window.gtag?.('set', 'user_properties', props)
  } catch {
    /* never let this break the page */
  }
}
