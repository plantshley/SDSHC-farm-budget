/**
 * Theme Lab — a hidden palette editor. Author tool, not a producer feature.
 *
 * Opens on a secret gesture (see OPENING below) and shows one control per
 * colour token in styles.css, so a palette can be tried on the real app rather
 * than in a swatch grid. Nothing here is linked to from any screen.
 *
 * Four things it deliberately does:
 *
 * 1. IT WRITES INLINE CUSTOM PROPERTIES on <html>, never a stylesheet. An
 *    inline declaration beats both `:root` and `[data-theme="dark"]` without
 *    caring which of them supplied the value, so one mechanism covers both
 *    themes and removing the property restores the shipped colour exactly.
 *
 * 2. IT KEEPS A SET PER THEME. --bg is two different colours and editing under
 *    one theme must not follow you into the other. A MutationObserver on
 *    data-theme re-applies the right set, so the app's own toggle works
 *    normally while the panel is open.
 *
 * 3. ITS OWN CHROME IS HARDCODED. The panel edits --text and --card; if it
 *    used them it could be made unreadable by the very edit you are trying to
 *    undo. Every colour in PANEL_CSS is a literal, and its type sizes are too.
 *
 * 4. IT DOES NOT PERSIST INTO THE BUDGET. Overrides live under one
 *    localStorage key of their own and are not preferences, not scenario
 *    state, and not carried by an export.
 *
 * Caveat worth knowing before you read a result: four tokens ship as
 * `var()` aliases (--info -> --sky, --brand-ink -> --brown, --on-olive ->
 * --brown, and --save/--green share a value). The pickers below start from
 * the RESOLVED colour, and overriding one of them breaks the alias for as
 * long as the override is set. Change --sky and --info follows it only while
 * --info is untouched; the row shows a dot when it is holding its own value.
 */

/* ── OPENING ──────────────────────────────────────────────────────────────
   Desktop: Ctrl+Alt+T, or type the word "theme" with no field focused.
   Mobile:  five taps on the SDSHC logo inside two seconds.
   Either way, Escape closes it. Ctrl+Alt+T rather than a lone key so it
   cannot fire mid-typing, and not Ctrl+Shift+K or Ctrl+Shift+P, which are a
   browser console and a private window.
   ────────────────────────────────────────────────────────────────────── */

const STORE_KEY = 'sdshc-fb-themelab'
const SECRET_WORD = 'theme'
const TAP_COUNT = 5
const TAP_WINDOW_MS = 2000

/* Kinds:
     color — a plain hex, edited with a native swatch
     alpha — a colour carrying transparency, so a swatch plus a 0-100 slider
     text  — not a colour at all (a shadow), so the raw declaration only */
const GROUPS = [
  {
    name: 'Page',
    tokens: [
      ['--bg', 'color', 'page background'],
      ['--card', 'color', 'card / panel surface'],
      ['--text', 'color', 'body text'],
      ['--muted', 'color', 'labels, captions, affixes'],
      ['--border', 'color', 'every hairline and input edge'],
      ['--overlay', 'alpha', 'behind an open modal'],
      ['--shadow', 'text', 'card shadow (whole declaration)'],
    ],
  },
  {
    name: 'Money',
    tokens: [
      ['--green', 'color', 'a positive dollar figure'],
      ['--green-dark', 'color', 'its pressed / hover state'],
      ['--save', 'color', 'saved-state tick and text'],
      ['--save-bg', 'color', 'saved-state wash'],
      ['--cost', 'color', 'a negative dollar figure'],
      ['--cost-bg', 'color', 'loss / warning wash'],
    ],
  },
  {
    name: 'Brand',
    tokens: [
      ['--brown', 'color', 'headings, structural lines'],
      ['--sky', 'color', 'buttons, ?, KPI edge'],
      ['--olive', 'color', 'sub-title rules'],
      ['--clay', 'color', 'overhead, notes, secondary'],
    ],
  },
  {
    name: 'Chrome derived from brand',
    tokens: [
      ['--brand-ink', 'color', 'heading ink (aliases --brown)'],
      ['--info', 'color', 'info marks (aliases --sky)'],
      ['--info-bg', 'color', 'info wash'],
      ['--on-sky', 'color', 'text ON a filled sky button'],
      ['--olive-bg', 'color', 'olive wash'],
      ['--olive-soft', 'alpha', 'selected mode-pill segment'],
      ['--on-olive', 'color', 'text ON that segment'],
      ['--clay-bg', 'color', 'clay wash'],
    ],
  },
  {
    name: 'Folder swatches',
    folded: true,
    // The twelve inks ship the SAME in both themes on purpose, and only the
    // washes flip. This panel stores every edit per theme, so an ink changed
    // here changes it under ONE theme and quietly breaks that rule. Say so,
    // rather than letting it be discovered by toggling the theme later.
    note: 'The inks are meant to be identical in both themes. Change an ink here and set it under the other theme too.',
    tokens: folderTokens(),
  },
  {
    name: 'Shape',
    folded: true,
    tokens: [
      ['--radius', 'text', 'corner radius'],
      ['--maxw', 'text', 'page max width'],
    ],
  },
]

function folderTokens() {
  const keys = [
    'pink', 'magenta', 'violet', 'indigo', 'blue', 'teal',
    'green', 'lime', 'yellow', 'orange', 'slate', 'grey',
  ]
  const out = []
  for (const k of keys) {
    out.push([`--fld-${k}`, 'color', `${k} ink`])
    out.push([`--fld-${k}-bg`, 'color', `${k} wash`])
  }
  return out
}

const ALL_TOKENS = GROUPS.flatMap((g) => g.tokens.map((t) => t[0]))

/* ── store ─────────────────────────────────────────────────────────────── */

/** Shape: { light: { '--bg': '#fff' }, dark: { … } }. */
function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return {
      light: raw && typeof raw.light === 'object' && raw.light ? raw.light : {},
      dark: raw && typeof raw.dark === 'object' && raw.dark ? raw.dark : {},
    }
  } catch {
    return { light: {}, dark: {} }
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* a lost experiment is not fatal */
  }
}

let store = readStore()

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function overrides() {
  return store[currentTheme()]
}

/* ── colour helpers ────────────────────────────────────────────────────── */

/**
 * Parse anything CSS accepts as a colour into { r, g, b, a }, using the
 * browser's own parser rather than a regex — it resolves `#abc`, named
 * colours, `rgb()`, `hsl()` and everything else in one line. Returns null for
 * a value that is not a colour, which is how a `text` token is detected as
 * un-swatchable rather than declared so twice.
 */
function parseColor(value) {
  const probe = document.createElement('span')
  probe.style.color = ''
  probe.style.color = String(value || '').trim()
  const parsed = probe.style.color
  if (!parsed) return null
  const m = parsed.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null
  const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1
  return { r: parts[0], g: parts[1], b: parts[2], a }
}

function toHex(value) {
  const c = parseColor(value)
  if (!c) return null
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

function alphaOf(value) {
  const c = parseColor(value)
  return c ? c.a : 1
}

function rgbaFrom(hex, alpha) {
  const c = parseColor(hex) || { r: 0, g: 0, b: 0 }
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`
}

/* ── reading the shipped value ─────────────────────────────────────────── */

const baseCache = { light: {}, dark: {} }

/**
 * The value the stylesheet supplies, with any override lifted out of the way.
 *
 * Read by removing the inline property, forcing a computed-style read, then
 * putting it back — all in one task, so nothing paints in between. The
 * alternative is a hardcoded copy of the palette in this file, which would go
 * stale the first time a token moved in styles.css and lie about what "reset"
 * restores.
 */
function baseValue(name) {
  const theme = currentTheme()
  const cached = baseCache[theme][name]
  if (cached !== undefined) return cached

  const root = document.documentElement
  const inline = root.style.getPropertyValue(name)
  if (inline) root.style.removeProperty(name)
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  if (inline) root.style.setProperty(name, inline)

  baseCache[theme][name] = value
  return value
}

function effectiveValue(name) {
  const set = overrides()
  return name in set ? set[name] : baseValue(name)
}

/* ── applying ──────────────────────────────────────────────────────────── */

function applyAll() {
  const root = document.documentElement
  const set = overrides()
  for (const name of ALL_TOKENS) {
    if (name in set) root.style.setProperty(name, set[name])
    else root.style.removeProperty(name)
  }
}

function setToken(name, value) {
  overrides()[name] = value
  document.documentElement.style.setProperty(name, value)
  writeStore(store)
}

function clearToken(name) {
  delete overrides()[name]
  document.documentElement.style.removeProperty(name)
  writeStore(store)
}

function clearTheme() {
  store[currentTheme()] = {}
  applyAll()
  writeStore(store)
}

/* ── the panel ─────────────────────────────────────────────────────────── */

const PANEL_CSS = `
.tl-panel {
  position: fixed;
  z-index: 99999;
  inset: auto 12px 12px auto;
  width: 360px;
  max-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  background: #171b1d;
  color: #e8edeb;
  border: 1px solid #39423f;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: dark;
  overscroll-behavior: contain;
}
.tl-panel[data-dock="left"] { inset: auto auto 12px 12px; }
.tl-panel[hidden] { display: none; }
.tl-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid #39423f;
  flex: 0 0 auto;
}
.tl-title { font-weight: 700; font-size: 13px; margin-right: auto; letter-spacing: 0.01em; }
.tl-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
  background: #253034;
  color: #9fd8ea;
}
.tl-btn {
  font: inherit;
  font-size: 12px;
  color: #e8edeb;
  background: #232a2d;
  border: 1px solid #414b48;
  border-radius: 7px;
  padding: 5px 9px;
  min-height: 30px;
  cursor: pointer;
}
.tl-btn:hover { background: #2c3538; }
.tl-btn.tl-danger { border-color: #6d3a34; color: #f0a79d; }
.tl-x { min-width: 30px; padding: 5px 8px; }
.tl-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #39423f;
  flex: 0 0 auto;
}
.tl-body { overflow: auto; padding: 4px 10px 10px; flex: 1 1 auto; }
.tl-group { margin-top: 10px; }
.tl-group > summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9fb0aa;
  padding: 4px 0;
  list-style: none;
}
.tl-group > summary::-webkit-details-marker { display: none; }
.tl-group > summary::before { content: "\\25B8  "; display: inline-block; width: 1em; }
.tl-group[open] > summary::before { content: "\\25BE  "; }
.tl-group-note {
  margin: 2px 0 6px;
  font-size: 11px;
  line-height: 1.35;
  color: #e0c07a;
}
.tl-row {
  display: grid;
  grid-template-columns: 34px 1fr 30px;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
}
.tl-row.tl-changed .tl-name::after {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: #ffd24a;
  vertical-align: middle;
}
.tl-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid #4a5451;
  border-radius: 7px;
  background: none;
  cursor: pointer;
}
.tl-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
.tl-swatch::-webkit-color-swatch { border: none; border-radius: 5px; }
.tl-name {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  color: #cfe0da;
  display: block;
}
.tl-note { font-size: 10.5px; color: #8b9a95; display: block; }
.tl-val {
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  width: 100%;
  min-height: 26px;
  margin-top: 2px;
  padding: 3px 6px;
  color: #e8edeb;
  background: #101314;
  border: 1px solid #414b48;
  border-radius: 6px;
}
.tl-alpha { width: 100%; margin: 2px 0 0; accent-color: #4fc9ef; }
.tl-reset {
  font: inherit;
  font-size: 14px;
  line-height: 1;
  color: #9fb0aa;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  min-height: 30px;
  cursor: pointer;
}
.tl-reset:hover { color: #e8edeb; border-color: #414b48; }
.tl-out {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  width: 100%;
  height: 150px;
  margin-top: 8px;
  padding: 6px;
  color: #e8edeb;
  background: #101314;
  border: 1px solid #414b48;
  border-radius: 8px;
  white-space: pre;
}
.tl-out[hidden] { display: none; }
.tl-hint { font-size: 11px; color: #8b9a95; padding: 6px 10px 0; }
@media (max-width: 620px) {
  .tl-panel,
  .tl-panel[data-dock="left"] {
    inset: auto 0 0 0;
    width: auto;
    max-height: 72vh;
    border-radius: 14px 14px 0 0;
  }
  .tl-row { grid-template-columns: 40px 1fr 40px; }
  .tl-swatch { width: 40px; height: 40px; }
  .tl-btn { min-height: 36px; }
  .tl-reset { min-height: 40px; }
}
@media print { .tl-panel { display: none !important; } }
`

let panel = null
let bodyEl = null
let outEl = null

function ensurePanel() {
  if (panel) return panel

  const style = document.createElement('style')
  style.textContent = PANEL_CSS
  document.head.appendChild(style)

  panel = document.createElement('div')
  panel.className = 'tl-panel'
  panel.setAttribute('data-theme-lab', '')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Theme lab')
  panel.dataset.dock = 'right'
  panel.hidden = true
  panel.innerHTML = `
    <div class="tl-head">
      <span class="tl-title">Theme lab</span>
      <span class="tl-badge" data-tl-theme></span>
      <button type="button" class="tl-btn" data-tl-flip title="Switch the app between light and dark">&#9788;/&#9789;</button>
      <button type="button" class="tl-btn tl-x" data-tl-dock title="Move to the other side">&#8646;</button>
      <button type="button" class="tl-btn tl-x" data-tl-close title="Close (Esc)">&#10005;</button>
    </div>
    <div class="tl-bar">
      <button type="button" class="tl-btn" data-tl-copy="changes">Copy changes</button>
      <button type="button" class="tl-btn" data-tl-copy="full">Copy full palette</button>
      <button type="button" class="tl-btn tl-danger" data-tl-reset-theme>Reset this theme</button>
      <button type="button" class="tl-btn tl-danger" data-tl-reset-all>Reset both</button>
    </div>
    <p class="tl-hint">Edits apply live and are saved per theme in this browser only. A dot marks a token holding a value of its own.</p>
    <div class="tl-body"></div>
  `
  bodyEl = panel.querySelector('.tl-body')
  document.body.appendChild(panel)

  buildRows()

  outEl = document.createElement('textarea')
  outEl.className = 'tl-out'
  outEl.readOnly = true
  outEl.hidden = true
  bodyEl.appendChild(outEl)

  panel.addEventListener('click', onPanelClick)
  return panel
}

function buildRows() {
  for (const group of GROUPS) {
    const details = document.createElement('details')
    details.className = 'tl-group'
    if (!group.folded) details.open = true
    const summary = document.createElement('summary')
    summary.textContent = group.name
    details.appendChild(summary)

    if (group.note) {
      const note = document.createElement('p')
      note.className = 'tl-group-note'
      note.textContent = group.note
      details.appendChild(note)
    }

    for (const [name, kind, note] of group.tokens) {
      details.appendChild(row(name, kind, note))
    }
    bodyEl.appendChild(details)
  }
}

function row(name, kind, note) {
  const el = document.createElement('div')
  el.className = 'tl-row'
  el.dataset.tlToken = name
  el.dataset.tlKind = kind

  const swatch = document.createElement('input')
  swatch.type = 'color'
  swatch.className = 'tl-swatch'
  swatch.setAttribute('aria-label', `${name} colour`)
  if (kind === 'text') swatch.style.visibility = 'hidden'

  const mid = document.createElement('div')
  const label = document.createElement('span')
  label.className = 'tl-name'
  label.textContent = name
  const desc = document.createElement('span')
  desc.className = 'tl-note'
  desc.textContent = note
  const val = document.createElement('input')
  val.type = 'text'
  val.className = 'tl-val'
  val.spellcheck = false
  val.setAttribute('aria-label', `${name} value`)
  mid.append(label, desc)

  let alpha = null
  if (kind === 'alpha') {
    alpha = document.createElement('input')
    alpha.type = 'range'
    alpha.className = 'tl-alpha'
    alpha.min = '0'
    alpha.max = '1'
    alpha.step = '0.01'
    alpha.setAttribute('aria-label', `${name} opacity`)
    mid.appendChild(alpha)
  }
  mid.appendChild(val)

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'tl-reset'
  reset.dataset.tlResetToken = name
  reset.title = `Reset ${name}`
  reset.textContent = '↺'

  el.append(swatch, mid, reset)

  // The swatch and the slider are convenience over the text box, which is the
  // authoritative field: it is the only one that can hold `rgba()`, a shadow,
  // or a length, and it is what "copy" reads back.
  const pushFromParts = () => {
    const value = kind === 'alpha' ? rgbaFrom(swatch.value, Number(alpha.value)) : swatch.value
    val.value = value
    setToken(name, value)
    markChanged(el, name)
  }
  swatch.addEventListener('input', pushFromParts)
  if (alpha) alpha.addEventListener('input', pushFromParts)

  val.addEventListener('input', () => {
    const raw = val.value.trim()
    if (!raw) return
    setToken(name, raw)
    syncParts(el, name, raw)
    markChanged(el, name)
  })

  syncRow(el, name)
  return el
}

function syncParts(el, name, value) {
  const swatch = el.querySelector('.tl-swatch')
  const alpha = el.querySelector('.tl-alpha')
  const hex = toHex(value)
  if (hex) swatch.value = hex
  if (alpha) alpha.value = String(alphaOf(value))
}

function syncRow(el, name) {
  const val = el.querySelector('.tl-val')
  const value = effectiveValue(name)
  if (document.activeElement !== val) val.value = value
  syncParts(el, name, value)
  markChanged(el, name)
}

function markChanged(el, name) {
  el.classList.toggle('tl-changed', name in overrides())
}

function syncAll() {
  if (!panel) return
  panel.querySelector('[data-tl-theme]').textContent = currentTheme()
  for (const el of panel.querySelectorAll('[data-tl-token]')) {
    syncRow(el, el.dataset.tlToken)
  }
}

/* ── panel actions ─────────────────────────────────────────────────────── */

function onPanelClick(e) {
  const t = e.target

  const resetToken = t.closest('[data-tl-reset-token]')
  if (resetToken) {
    const name = resetToken.dataset.tlResetToken
    clearToken(name)
    syncRow(resetToken.closest('[data-tl-token]'), name)
    return
  }
  if (t.closest('[data-tl-close]')) return close()
  if (t.closest('[data-tl-dock]')) {
    panel.dataset.dock = panel.dataset.dock === 'right' ? 'left' : 'right'
    return
  }
  if (t.closest('[data-tl-flip]')) {
    // Clicking the app's own toggle rather than setting the attribute, so the
    // preference is written and the toggle's icon and aria stay true. The
    // observer below re-applies this theme's overrides afterwards.
    const toggle = document.getElementById('themeToggle')
    if (toggle) toggle.click()
    else document.documentElement.setAttribute('data-theme', currentTheme() === 'dark' ? 'light' : 'dark')
    return
  }
  if (t.closest('[data-tl-reset-theme]')) {
    clearTheme()
    syncAll()
    return
  }
  if (t.closest('[data-tl-reset-all]')) {
    store = { light: {}, dark: {} }
    applyAll()
    writeStore(store)
    syncAll()
    return
  }
  const copy = t.closest('[data-tl-copy]')
  if (copy) showCSS(copy.dataset.tlCopy === 'full')
}

/**
 * "Changes" prints only the tokens holding a value, which is what you paste
 * over styles.css. "Full palette" prints every token at its effective value in
 * both themes, which is what you keep as a record of a theme you liked.
 *
 * The full form needs the other theme's computed values, so it flips
 * data-theme, reads, and flips back inside one task. getComputedStyle forces
 * the recalc synchronously and nothing paints between the two writes.
 */
function showCSS(full) {
  const here = currentTheme()
  const blocks = []

  for (const theme of ['light', 'dark']) {
    const selector = theme === 'dark' ? '[data-theme="dark"]' : ':root'
    let lines = []
    if (full) {
      if (theme !== here) document.documentElement.setAttribute('data-theme', theme)
      lines = ALL_TOKENS.map((name) => `  ${name}: ${effectiveValue(name)};`)
      if (theme !== here) document.documentElement.setAttribute('data-theme', here)
    } else {
      lines = Object.entries(store[theme]).map(([name, value]) => `  ${name}: ${value};`)
    }
    if (lines.length) blocks.push(`${selector} {\n${lines.join('\n')}\n}`)
  }

  const text = blocks.join('\n\n') || '/* nothing changed yet */'
  // The clipboard first, then the scroll. scrollIntoView is missing on some
  // engines and the whole point of the button is the copy, so the optional
  // convenience must not be able to take the copy down with it.
  outEl.hidden = false
  outEl.value = text
  outEl.select()
  navigator.clipboard?.writeText(text).catch(() => {
    /* left selected in the box to copy by hand */
  })
  outEl.scrollIntoView?.({ block: 'nearest' })
}

/* ── open / close ──────────────────────────────────────────────────────── */

function open() {
  ensurePanel()
  panel.hidden = false
  syncAll()
}

function close() {
  if (panel) panel.hidden = true
}

function toggle() {
  if (panel && !panel.hidden) close()
  else open()
}

/* ── the secret ────────────────────────────────────────────────────────── */

function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

let typed = ''

function onKeydown(e) {
  if (e.key === 'Escape' && panel && !panel.hidden) {
    close()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault()
    toggle()
    return
  }
  // The word only counts outside a field, or typing "theme" into a budget name
  // would open it. The panel's own boxes are fields, so it cannot fire there
  // either.
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
  if (e.key.length !== 1) return
  typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length)
  if (typed === SECRET_WORD) {
    typed = ''
    toggle()
  }
}

let taps = 0
let firstTap = 0

function onLogoTap() {
  const now = Date.now()
  if (now - firstTap > TAP_WINDOW_MS) {
    firstTap = now
    taps = 0
  }
  taps += 1
  if (taps >= TAP_COUNT) {
    taps = 0
    toggle()
  }
}

/* ── boot ──────────────────────────────────────────────────────────────── */

export function initThemeLab() {
  applyAll()

  document.addEventListener('keydown', onKeydown)
  for (const logo of document.querySelectorAll('.toplogo')) {
    logo.addEventListener('click', onLogoTap)
    logo.addEventListener('dblclick', (e) => e.preventDefault())
  }

  // prefs.js sets data-theme after this module runs, and the producer can flip
  // it at any time. Re-applying on the attribute is what keeps the two sets
  // apart without this file knowing anything about prefs.js.
  new MutationObserver(() => {
    applyAll()
    syncAll()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

if (typeof document !== 'undefined') initThemeLab()
