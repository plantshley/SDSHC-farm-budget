/**
 * Display preferences: colour theme and font stack.
 *
 * Both are stored as attributes on <html> and driven entirely by CSS custom
 * properties (--font, and the [data-theme] token block). No JS reads them back
 * to compute layout, so there is exactly one source of truth per preference.
 */

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
  })

  // ── Font ───────────────────────────────────────────────────────────────
  applyFont(read(KEY_FONT, 'browser'))

  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-font-choice')
      applyFont(choice)
      write(KEY_FONT, choice)
    })
  }
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

function applyFont(choice) {
  const font = choice === 'classic' ? 'classic' : 'browser'
  document.documentElement.setAttribute('data-font', font)
  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.setAttribute(
      'aria-pressed',
      String(btn.getAttribute('data-font-choice') === font)
    )
  }
}
