/**
 * Display preferences: colour theme and font stack.
 *
 * Both are stored as attributes on <html> and driven entirely by CSS custom
 * properties (--font, and the [data-theme] token block). No JS reads them back
 * to compute layout, so there is exactly one source of truth per preference.
 */

import { track, setUserProps } from './analytics.js'

const KEY_THEME = 'sdshc-fb-theme'
const KEY_FONT = 'sdshc-fb-font'
const KEY_DISMISSED = 'sdshc-fb-dismissed'

/** localStorage throws in Safari private mode; a lost preference is not fatal. */
function read(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preference simply won't persist */
  }
}

/* ─────────────────────── dismissed explanations ────────────────────────── */

/**
 * Notes the producer has read and put away, by id.
 *
 * This is a PREFERENCE, not scenario state, which is why it lives here beside
 * the theme rather than in the budget: whether somebody has read the sentence
 * explaining what a baseline is says nothing about their farm, and carrying it
 * into an exported budget file would hide the note on whatever device the file
 * was opened on next.
 *
 * It persists, unlike the fold state in main.js. A note explaining a feature is
 * read once; showing it again every session is the behaviour a dismiss button
 * exists to stop, and dismissing it per-session would mean doing that.
 *
 * One key holding a comma-separated list rather than a key each, so a second
 * dismissible note costs nothing.
 */
function dismissedSet() {
  return new Set(read(KEY_DISMISSED, '').split(',').filter(Boolean))
}

export function isDismissed(id) {
  return dismissedSet().has(id)
}

export function dismiss(id) {
  const set = dismissedSet()
  set.add(id)
  write(KEY_DISMISSED, [...set].join(','))
}

/* ────────────────────────── sharing with SDSHC ─────────────────────────── */

/**
 * Whether this device sends saved budgets to the Coalition, and whether it has
 * been asked yet.
 *
 * Here rather than in the scenario for the same reason the theme is: it is a
 * fact about this browser, not about a farm. Putting it in the budget would
 * mark it dirty on every toggle and ride into an exported file, so a budget
 * handed to a neighbour would carry the sender's answer and start sharing on
 * their device without anybody being asked.
 *
 * TWO KEYS, NOT ONE, and the second is not redundant. "Off" and "never asked"
 * are different states that must stay different: the consent modal fires on the
 * absence of an ANSWER, so a single key defaulting to off would re-ask forever
 * anyone who said no. Storing the answer is what makes "no" stick.
 *
 * NO FIREBASE IMPORT IN THIS FILE. main.js needs isSharingOn() to draw the
 * toggle on every render, and main.js is imported directly by the Node smoke
 * tests. Pulling the SDK in here would drag it into jsdom, which has no
 * IndexedDB. Everything that talks to Firestore lives behind the dynamic
 * import of share.js.
 */
const KEY_SHARE = 'sdshc-fb-share'
const KEY_SHARE_ASKED = 'sdshc-fb-share-asked'

/** Off unless explicitly turned on. An unreadable value is not consent. */
export function isSharingOn() {
  return read(KEY_SHARE, '') === 'on'
}

/**
 * TURNING IT ON ANSWERS THE QUESTION. TURNING IT OFF RE-OPENS IT.
 *
 * The asked flag exists to stop the consent dialog following every save around,
 * and this used to mark it in both directions on the reasoning that operating
 * the switch is an answer either way. It is not, and the asymmetry is the same
 * one the switch itself has. Turning sharing ON is consent, and somebody who
 * has just given it does not need the dialog on their next save asking them to
 * turn on what they turned on. Turning it OFF is a decision about the setting,
 * not a decision never to be asked again — and it is often somebody trying it
 * out, or clearing what they had sent, rather than declining for good.
 *
 * So only the dialog's own "Not now" ends the question, which is the button
 * that means "stop asking me". It is called after this, so it wins.
 *
 * The cost is one dialog on the first save after a switch-off, and that is the
 * right price: the alternative silently made the switch a way of never being
 * asked again, which is not what a control labelled with one word can say.
 */
export function setSharing(on) {
  write(KEY_SHARE, on ? 'on' : 'off')
  if (on) markAskedToShare()
  else clearAskedToShare()
}

export function hasBeenAskedToShare() {
  return read(KEY_SHARE_ASKED, '') === '1'
}

export function markAskedToShare() {
  write(KEY_SHARE_ASKED, '1')
}

/** Put the question back. See setSharing(). */
export function clearAskedToShare() {
  write(KEY_SHARE_ASKED, '')
}

export function initPrefs() {
  const root = document.documentElement

  // ── Theme ──────────────────────────────────────────────────────────────
  const savedTheme = read(KEY_THEME, null)
  const theme =
    savedTheme ||
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  applyTheme(theme)

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    write(KEY_THEME, next)
    // The event says somebody went looking for the control. The user property,
    // set from initAnalytics() with the value returned below, says what everyone
    // is actually reading in — including the majority who never touch either.
    track('theme_change', { choice: next })
    setUserProps({ theme: next })
  })

  // ── Font ───────────────────────────────────────────────────────────────
  const font = read(KEY_FONT, 'browser')
  applyFont(font)

  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-font-choice')
      applyFont(choice)
      write(KEY_FONT, choice)
      track('font_change', { choice })
      setUserProps({ font: choice })
    })
  }

  // Handed back so main.js can pass the RESOLVED pair to initAnalytics(). An
  // unset theme follows the system rather than being stored, so reading the key
  // back would report a blank for exactly the users who never chose one.
  return { theme, font }
}

/**
 * Sun and moon, matching the toggle in SDSHC-tracker so the two tools behave
 * identically. Inline SVG rather than an emoji: emoji render at wildly
 * different sizes and colours across platforms, and on Windows the moon comes
 * out as a flat monochrome glyph that reads as a smudge next to the font
 * control.
 */
const SUN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="5" />
  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
</svg>`

const MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
</svg>`

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const btn = document.getElementById('themeToggle')
  if (!btn) return
  const dark = theme === 'dark'
  // The icon shows what tapping will GIVE you, which is how the tracker's
  // toggle reads: a sun while dark, a moon while light.
  btn.innerHTML = `<span class="theme-toggle-icon">${dark ? SUN : MOON}</span>`
  btn.setAttribute('aria-pressed', String(dark))
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
  btn.setAttribute('title', dark ? 'Light mode' : 'Dark mode')
}

/**
 * The choices that exist, named rather than inferred.
 *
 * An unrecognised one falls back to 'browser' — a stored preference from a
 * future build, or a hand-edited key, must not leave the page with no --font at
 * all. Same rule as perYearFactor() returning 1 for a basis it does not know.
 */
const FONTS = new Set(['browser', 'classic', 'mono'])

/**
 * Announce a font change to anything that MEASURED text in the old one.
 *
 * Two widths in main.js are laid out in a mirror span and written as px — the
 * budget-name boxes and the enterprise name column. Swapping the typeface
 * changes every glyph advance underneath them, and neither is recomputed by
 * anything else, because choosing a typeface does not re-render the app.
 *
 * Its own event and NOT `fb:rerender`, which notifies state as it goes and would
 * mark the budget unsaved. Picking a font is not an edit to a farm.
 *
 * The constructor comes off `document.defaultView` rather than the global: an
 * Event built from another realm's class is rejected by dispatchEvent, which is
 * exactly the situation the smoke tests boot into.
 */
function announceFontChange() {
  const view = document.defaultView
  if (!view?.Event) return
  document.dispatchEvent(new view.Event('fb:fontchange'))
}

function applyFont(choice) {
  const font = FONTS.has(choice) ? choice : 'browser'
  document.documentElement.setAttribute('data-font', font)
  announceFontChange()
  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.setAttribute(
      'aria-pressed',
      String(btn.getAttribute('data-font-choice') === font)
    )
  }
}
