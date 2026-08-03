/**
 * Display preferences: colour theme and font stack.
 *
 * Both are stored as attributes on <html> and driven entirely by CSS custom
 * properties (--font, and the [data-theme] token block). No JS reads them back
 * to compute layout, so there is exactly one source of truth per preference.
 */

const KEY_THEME = 'sdshc-fb-theme'
const KEY_FONT = 'sdshc-fb-font'

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

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const btn = document.getElementById('themeToggle')
  if (!btn) return
  const dark = theme === 'dark'
  btn.textContent = dark ? '☀ Light' : '🌙 Dark'
  btn.setAttribute('aria-pressed', String(dark))
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
