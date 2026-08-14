/**
 * Theme Lab — a hidden palette editor. Author tool, not a producer feature.
 *
 * Opens on a secret gesture (see OPENING below) and shows one control per
 * colour token in styles.css, so a palette can be tried on the real app rather
 * than in a swatch grid. Nothing here is linked to from any screen.
 *
 * Five things it deliberately does:
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
 * 3. IT MIRRORS A LIGHT EDIT INTO DARK, by copying the RELATIONSHIP the
 *    shipped pair already has rather than by inverting anything. See MIRRORING.
 *
 * 4. IT GROUPS TOKENS THAT SHARE A COLOUR. --green and --save are one green;
 *    editing them separately is how they drift apart. See CLUSTERS.
 *
 * 5. IT FOLLOWS THE THEME TOGGLE WITHOUT READING THE THEME'S TOKENS. The panel
 *    has a light scheme and a dark one of its own, both hardcoded, switched by
 *    the same [data-theme] the app switches on. So it sits the right way round
 *    beside the page — but it cannot be made unreadable by the edit you are
 *    trying to undo. Wiring it to --card and --text would read as tidier and
 *    would mean that setting --text near --card leaves you unable to see the
 *    control that puts it back. Its own colours are --tl-* names, declared on
 *    .tl-panel rather than on :root, and no --tl-* name is in ALL_TOKENS.
 *
 * 6. IT KEEPS A SHELF OF NAMED PALETTES, on a second tab. Saving copies the
 *    working palette onto the shelf and applying copies one back over it;
 *    neither merges, and resetting the page never empties the shelf. See
 *    THE SHELF. A theme's Copy CSS and the paste box on the same tab are the
 *    round trip between one browser and another; see IMPORTING A PASTE.
 *
 * It does not persist into the budget. Overrides live under one localStorage
 * key of their own and are not preferences, not scenario state, and not
 * carried by an export.
 *
 * Caveat worth knowing before you read a result: four tokens ship as `var()`
 * aliases (--info -> --sky, --brand-ink and --on-olive -> --brown). The
 * pickers below start from the RESOLVED colour, and overriding one of them
 * breaks the alias for as long as the override is set. In practice the
 * clustering hides this, since an alias lands in the same cluster as what it
 * aliases and both move together.
 */

/* ── OPENING ──────────────────────────────────────────────────────────────
   Desktop: Ctrl+Alt+T.
   Mobile:  five taps on the SDSHC logo inside two seconds.
   Either way, Escape closes it.

   A modifier chord rather than a lone key or a typed word, so it cannot fire
   mid-typing — and not Ctrl+Shift+K or Ctrl+Shift+P, which are a browser
   console and a private window.
   ────────────────────────────────────────────────────────────────────── */

const STORE_KEY = 'sdshc-fb-themelab'
const TAP_COUNT = 5
const TAP_WINDOW_MS = 2000

/* Kinds:
     color — a plain hex, edited with a native swatch
     alpha — a colour carrying transparency, so a swatch plus a 0-100 slider
     text  — not a colour at all (a shadow, a length), so the declaration only

   Only `color` and `alpha` cluster and mirror. `text` does neither: there is
   nothing to read a lightness off. */
const GROUPS = [
  {
    name: 'Page',
    tokens: [
      ['--bg', 'color', 'page background'],
      ['--card', 'color', 'card / panel surface'],
      ['--text', 'color', 'body text'],
      ['--muted', 'color', 'labels, captions, affixes'],
      ['--placeholder', 'color', 'the words in an empty box'],
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
    // washes flip. Mirroring is therefore a no-op on an ink pair (no lightness
    // difference to copy) and it will hold — but say so anyway, because it is
    // the one place in the palette where "adapt it for dark" is wrong.
    note:
      'The twelve inks are meant to be identical in both themes; only the washes flip. ' +
      'Mirroring preserves that, since an ink pair has no difference to copy.',
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
const KIND = new Map(GROUPS.flatMap((g) => g.tokens.map((t) => [t[0], t[1]])))

/* ── store ─────────────────────────────────────────────────────────────── */

/**
 * Shape: { light: {…}, dark: {…}, pinned: […], mirror: true, themes: […],
 *          activeId: '' }
 *
 * `light` / `dark` / `pinned` / `mirror` are the WORKING palette — what is on
 * the page right now. `themes` is the shelf: each entry is a frozen copy of
 * those four under a name. Editing never touches the shelf and applying never
 * merges, so there is exactly one place a colour can be coming from.
 *
 * `pinned` is the list of tokens whose DARK value was typed by hand. A pinned
 * token is never overwritten by mirroring — otherwise the next light edit
 * would silently throw away a dark colour that was chosen on purpose, which is
 * the one thing an automatic feature must not be able to do.
 *
 * An older store has no `themes` key and reads back as an empty shelf, which is
 * the correct state for one: nothing was ever saved to it.
 */
function readStore() {
  const empty = { light: {}, dark: {}, pinned: new Set(), mirror: true, themes: [], activeId: '' }
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    if (!raw || typeof raw !== 'object') return empty
    return {
      light: raw.light && typeof raw.light === 'object' ? raw.light : {},
      dark: raw.dark && typeof raw.dark === 'object' ? raw.dark : {},
      pinned: new Set(Array.isArray(raw.pinned) ? raw.pinned : []),
      mirror: raw.mirror !== false,
      themes: Array.isArray(raw.themes) ? raw.themes.filter(validTheme).map(readTheme) : [],
      activeId: typeof raw.activeId === 'string' ? raw.activeId : '',
    }
  } catch {
    return empty
  }
}

/**
 * One bad entry costs that entry, never the shelf.
 *
 * The same rule storage.js follows for a corrupt scenario, and for the same
 * reason: a saved theme is work, and a list that refuses to load because one
 * row in it is wrong has thrown away every row that was not.
 */
function validTheme(t) {
  return Boolean(t) && typeof t === 'object' && typeof t.name === 'string' && typeof t.id === 'string'
}

function readTheme(t) {
  return {
    id: t.id,
    name: t.name,
    savedAt: Number.isFinite(t.savedAt) ? t.savedAt : 0,
    light: t.light && typeof t.light === 'object' ? t.light : {},
    dark: t.dark && typeof t.dark === 'object' ? t.dark : {},
    pinned: Array.isArray(t.pinned) ? t.pinned : [],
    mirror: t.mirror !== false,
  }
}

function writeStore() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        light: store.light,
        dark: store.dark,
        pinned: [...store.pinned],
        mirror: store.mirror,
        themes: store.themes,
        activeId: store.activeId,
      })
    )
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

/* ── colour maths ──────────────────────────────────────────────────────── */

/**
 * Parse anything CSS accepts as a colour into { r, g, b, a }, using the
 * browser's own parser rather than a regex — it resolves `#abc`, named
 * colours, `rgb()`, `hsl()`, `oklch()` and everything else in one line.
 * Returns null for a value that is not a colour, which is how a `text` token
 * is detected as un-swatchable rather than declared so twice.
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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function toHex(value) {
  const c = parseColor(value)
  if (!c) return null
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

function alphaOf(value) {
  const c = parseColor(value)
  return c ? c.a : 1
}

function formatColor({ r, g, b, a }) {
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  if (a >= 0.999) return `#${h(r)}${h(g)}${h(b)}`
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 100) / 100})`
}

function rgbaFrom(hex, alpha) {
  const c = parseColor(hex) || { r: 0, g: 0, b: 0 }
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${
    Math.round(clamp(alpha, 0, 1) * 100) / 100
  })`
}

/* OKLab rather than HSL. HSL's "lightness" is not lightness — #ffff00 and
   #0000ff both sit at 50% in it — so mirroring through HSL makes a yellow and
   a blue behave differently for no reason a person can see. OKLab's L is
   perceptual, which is the whole property the mirror depends on. ~30 lines and
   no dependency. */

function toLinear(c) {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function toSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return clamp(c, 0, 1) * 255
}

function toOklch({ r, g, b, a }) {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, A, B, C: Math.hypot(A, B), h: Math.atan2(B, A), a }
}

/** Linear-light sRGB, unclamped, so fitChroma() can see how far outside it is. */
function oklchToLinear({ L, C, h }) {
  const A = Math.cos(h) * C
  const B = Math.sin(h) * C
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function fromOklch({ L, C, h, a }) {
  const [r, g, b] = oklchToLinear({ L, C, h })
  return { r: toSrgb(r), g: toSrgb(g), b: toSrgb(b), a }
}

/**
 * Bring an OKLCH colour inside sRGB by dropping CHROMA, holding L and h.
 *
 * The mirror can multiply a chroma past what sRGB holds at that lightness, and
 * the only thing standing between that and a hex was toSrgb() clamping each
 * channel on its own. Clamping a channel is a HUE change: a saturated purple
 * mirrored past the edge had its red and blue pinned at 255 and came back as a
 * pale pink, which is not the colour anybody asked for and gives no clue that
 * anything was out of range. Reducing chroma keeps the hue exactly and reads as
 * "as saturated as this screen can be", which is the honest answer.
 *
 * A no-op on anything already in gamut, which includes every shipped pair, so
 * the identity property is untouched. Binary search rather than a formula
 * because the sRGB boundary in OKLCH has no closed form.
 */
const GAMUT_EPS = 0.001

function inGamut(linear) {
  return linear.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS)
}

function fitChroma(c) {
  if (inGamut(oklchToLinear(c))) return c
  let lo = 0
  let hi = c.C
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinear({ ...c, C: mid }))) lo = mid
    else hi = mid
  }
  return { ...c, C: lo }
}

/* ── MIRRORING ────────────────────────────────────────────────────────────
   A light edit is carried into dark by copying the RELATIONSHIP the shipped
   pair already has, not by inverting anything. Two models, chosen per token by
   how far apart the shipped pair sits:

     FLIP (|dL| >= 0.25)   L' = Ld + Ll - Ln
       The pair is a surface/ink that swaps ends — --bg #f7f9f7 -> #14181a,
       --text #222 -> #e7ecea. Darkening the light one lightens the dark one,
       which is what a theme flip means.

     SHIFT (|dL| < 0.25)   L' = Ln + (Ld - Ll)
       The pair is an accent that only nudges — --sky #0fb2e2 -> #4fc9ef, and
       every folder ink, which does not move at all. A flip model here would
       send a mid-tone accent to white.

   Colour is carried two ways at once and the two are BLENDED, by how much
   chroma the light end has to be trusted for:

     POLAR      chroma takes the shipped RATIO, hue the shipped ROTATION.
       --sky loses a little saturation going dark and that should hold whatever
       hue you move it to. Right for a colour that is actually a colour.

     CARTESIAN  the shipped a/b OFFSET is added instead.
       --bg, --card and --text are greys, and both a ratio and a rotation
       between two near-zero chromas are noise amplified. An offset of nearly
       nothing is nearly nothing, which is the right answer for a grey.

   The weight is a smoothstep between CHROMA_LO and CHROMA_HI, and it is a
   RAMP rather than the threshold this started as. The threshold shipped a bug:
   --brand-ink is #4e413a against #dfe6e2, two browns so close to grey that
   their hues are meaningless, but its light chroma is 0.021 — a thousandth over
   the old floor. So it took the polar branch and applied the 111 degrees of
   rotation sitting between two greys as though it meant something, and a purple
   heading colour came back as clay brown. Nothing about the input said the
   answer was junk; 0.021 and 0.019 are the same colour and were treated as
   different kinds of thing.

   Both models are exact at the base point on their own, so any blend of them
   is exact too: leave the light colour where it shipped and the dark one lands
   on the exact hex in styles.css, at every weight. That is asserted, not
   assumed. Alpha carries the shipped ratio throughout, which is what takes
   --overlay from 0.45 to 0.6 and --olive-soft from 0.35 to 0.18.

   This is a good guess, not a designer. A mirrored dark theme wants looking at
   before it is believed; every mirrored row is editable, and editing one pins
   it so no later light edit overwrites it.
   ────────────────────────────────────────────────────────────────────── */

const FLIP_THRESHOLD = 0.25
const CHROMA_LO = 0.02
const CHROMA_HI = 0.1

function smoothstep(lo, hi, x) {
  const t = clamp((x - lo) / (hi - lo), 0, 1)
  return t * t * (3 - 2 * t)
}

/** The shorter way round, so a rotation across the +/-180 seam stays small. */
function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

function mirrorValue(name, lightValue) {
  if (KIND.get(name) === 'text') return null

  const baseL = parseColor(baseValue(name, 'light'))
  const baseD = parseColor(baseValue(name, 'dark'))
  const next = parseColor(lightValue)
  if (!baseL || !baseD || !next) return null

  const l = toOklch(baseL)
  const d = toOklch(baseD)
  const n = toOklch(next)

  const dL = d.L - l.L
  const L = Math.abs(dL) >= FLIP_THRESHOLD ? d.L + l.L - n.L : n.L + dL

  // Polar, written out in a/b so it can be averaged with the other one.
  const k = l.C >= 1e-6 ? clamp(d.C / l.C, 0.2, 5) : 1
  const rot = angleDiff(d.h, l.h)
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const pA = k * (n.A * cos - n.B * sin)
  const pB = k * (n.A * sin + n.B * cos)

  // Cartesian.
  const cA = n.A + (d.A - l.A)
  const cB = n.B + (d.B - l.B)

  const w = smoothstep(CHROMA_LO, CHROMA_HI, l.C)
  const A = w * pA + (1 - w) * cA
  const B = w * pB + (1 - w) * cB

  const a = baseL.a > 0.001 ? clamp(next.a * (baseD.a / baseL.a), 0, 1) : next.a
  return formatColor(
    fromOklch(
      fitChroma({
        L: clamp(L, 0.02, 0.99),
        C: clamp(Math.hypot(A, B), 0, 0.45),
        h: Math.atan2(B, A),
        a,
      })
    )
  )
}

/* ── reading the shipped value ─────────────────────────────────────────── */

const baseCache = { light: {}, dark: {} }
let primed = false
let suspendObserver = false

/**
 * Read every token's shipped value under BOTH themes, once.
 *
 * Done by lifting the inline overrides out of the way and flipping data-theme,
 * all inside one task so nothing paints in between. The alternative is a
 * hardcoded copy of the palette in this file, which would go stale the first
 * time a token moved in styles.css and would then lie about what "reset"
 * restores AND about what the mirror is copying.
 */
function primeBases() {
  const root = document.documentElement
  const here = currentTheme()
  suspendObserver = true

  const saved = {}
  for (const name of ALL_TOKENS) {
    const inline = root.style.getPropertyValue(name)
    if (inline) {
      saved[name] = inline
      root.style.removeProperty(name)
    }
  }

  for (const theme of ['light', 'dark']) {
    root.setAttribute('data-theme', theme)
    const cs = getComputedStyle(root)
    for (const name of ALL_TOKENS) {
      baseCache[theme][name] = cs.getPropertyValue(name).trim()
    }
    resolveAliases(baseCache[theme])
  }

  root.setAttribute('data-theme', here)
  for (const [name, value] of Object.entries(saved)) root.style.setProperty(name, value)
  suspendObserver = false
  primed = true
}

/**
 * Follow a token that ships as `--info: var(--sky)` to the colour behind it.
 *
 * A browser substitutes those at computed-value time and this loop finds
 * nothing to do. jsdom does not, and hands back the literal text `var(--sky)`
 * — which would leave four tokens un-clusterable and un-mirrorable in every
 * test that could otherwise check them. Cheap in the browser, and the
 * difference between a testable mirror and one taken on trust.
 *
 * Bounded rather than recursive: a hand-edited stylesheet can point two tokens
 * at each other, and an alias that will not settle is left as it is.
 */
function resolveAliases(map) {
  for (let pass = 0; pass < 5; pass += 1) {
    let moved = false
    for (const [name, value] of Object.entries(map)) {
      const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
      if (m && map[m[1]] && map[m[1]] !== value) {
        map[name] = map[m[1]]
        moved = true
      }
    }
    if (!moved) return
  }
}

function baseValue(name, theme = currentTheme()) {
  if (!primed) primeBases()
  return baseCache[theme][name] ?? ''
}

function effectiveValue(name, theme = currentTheme()) {
  const set = store[theme]
  return name in set ? set[name] : baseValue(name, theme)
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

/** True when this dark value was written by the mirror rather than by hand. */
function isMirrored(name) {
  return store.mirror && !store.pinned.has(name) && name in store.light && name in store.dark
}

function setToken(name, value) {
  const theme = currentTheme()
  store[theme][name] = value
  document.documentElement.style.setProperty(name, value)

  if (theme === 'light') {
    if (store.mirror && !store.pinned.has(name)) {
      const derived = mirrorValue(name, value)
      if (derived) store.dark[name] = derived
      else delete store.dark[name]
    }
  } else {
    // A dark value typed by hand is a decision. Pin it, or the next light edit
    // throws it away and the panel has quietly overruled its author.
    store.pinned.add(name)
  }
  writeStore()
}

function clearToken(name) {
  const theme = currentTheme()
  delete store[theme][name]
  document.documentElement.style.removeProperty(name)

  if (theme === 'light') {
    if (!store.pinned.has(name)) delete store.dark[name]
  } else {
    // Reverting a dark row un-pins it, so it rejoins the mirror. Reverting is
    // how you say "I did not mean to take this one over".
    store.pinned.delete(name)
    const light = store.light[name]
    if (store.mirror && light !== undefined) {
      const derived = mirrorValue(name, light)
      if (derived) {
        store.dark[name] = derived
        document.documentElement.style.setProperty(name, derived)
      }
    }
  }
  writeStore()
}

/** Re-derive every unpinned dark value from its light one. */
function remirrorAll({ unpin = false } = {}) {
  if (unpin) store.pinned.clear()
  for (const name of ALL_TOKENS) {
    if (store.pinned.has(name)) continue
    const light = store.light[name]
    if (light === undefined) {
      delete store.dark[name]
      continue
    }
    const derived = mirrorValue(name, light)
    if (derived) store.dark[name] = derived
    else delete store.dark[name]
  }
  applyAll()
  writeStore()
}

/* ── THE SHELF ────────────────────────────────────────────────────────────
   A saved theme is a frozen copy of the working palette under a name. Saving
   copies out of the working set, applying copies back over it, and neither
   merges: a half-applied theme showing three of its colours and four of the
   last one's is a palette nobody chose and cannot be reasoned about.

   Two consequences worth knowing:

   RESET NEVER TOUCHES THE SHELF. "Reset both" clears what is on the page. It is
   the button you press to see the shipped colours again, several times an
   evening, and if it also emptied a shelf of named work that would be the one
   irreversible action in a tool whose whole point is that everything is
   reversible.

   APPLYING OVER UNSAVED EDITS ASKS FIRST. Applying is how you switch between
   themes and has to be one press; it is only the unsaved case that needs a
   second one, so the button asks only when there is actually something to lose.
   ────────────────────────────────────────────────────────────────────── */

function newId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function snapshot() {
  return {
    light: { ...store.light },
    dark: { ...store.dark },
    pinned: [...store.pinned],
    mirror: store.mirror,
  }
}

function themeById(id) {
  return store.themes.find((t) => t.id === id) || null
}

function sameAsStored(theme) {
  const a = snapshot()
  const key = (l, d, p) => JSON.stringify([sorted(l), sorted(d), [...p].sort()])
  return key(a.light, a.dark, a.pinned) === key(theme.light, theme.dark, theme.pinned)
}

function sorted(map) {
  return Object.keys(map)
    .sort()
    .map((k) => [k, map[k]])
}

/**
 * Is there anything on the page that no saved theme is holding?
 *
 * `mirror` is deliberately not part of this. It is a mode, not a colour: turning
 * it off to work on dark by hand is not an edit to the palette and must not make
 * every theme in the list ask a question before it will load.
 */
function paletteIsDirty() {
  const active = themeById(store.activeId)
  if (active) return !sameAsStored(active)
  return Object.keys(store.light).length > 0 || Object.keys(store.dark).length > 0
}

function saveTheme(rawName) {
  const name = rawName.trim()
  if (!name) return null
  const existing = store.themes.find((t) => t.name.toLowerCase() === name.toLowerCase())
  const theme = existing || { id: newId(), name }
  Object.assign(theme, snapshot(), { name, savedAt: Date.now() })
  if (!existing) store.themes.push(theme)
  store.activeId = theme.id
  writeStore()
  return theme
}

function applyTheme(id) {
  const t = themeById(id)
  if (!t) return
  store.light = { ...t.light }
  store.dark = { ...t.dark }
  store.pinned = new Set(t.pinned)
  store.mirror = t.mirror !== false
  store.activeId = t.id
  // The name box follows what was applied. Left holding the last theme's name,
  // the next press of Save would write THIS palette over THAT theme — the one
  // mistake on this tab that destroys work, and it would look like a save.
  const input = panel && panel.querySelector('[data-tl-save-name]')
  if (input) input.value = t.name
  applyAll()
  writeStore()
}

/* ── IMPORTING A PASTE ────────────────────────────────────────────────────
   The shelf is one localStorage key in one browser. Copy CSS gets a theme out
   of it and this gets one back in, which is the only way a palette built on a
   laptop reaches a phone.

   What it accepts is deliberately wider than what it emits: a `:root` block, a
   `[data-theme="dark"]` block, both, a bare list of declarations with no block
   around them, or a whole styles.css with a hundred other rules in it. Every
   one of those is something somebody will actually paste, and a paste that is
   ALMOST right failing with "invalid" teaches nothing.

   What it refuses is narrower than that and says so every time:

   A NAME THIS APP DOES NOT USE is dropped and counted. Keeping it would put a
   dead declaration in the store that no swatch can reach, that applyAll() never
   writes, and that Copy CSS would then hand to the next browser along.

   A VALUE THAT IS NOT A COLOUR is dropped and counted, on a token that holds
   one. `var(--sky)` is allowed through because it is a real declaration that
   resolves; `#gg0011` is not.

   IT LANDS ON THE SHELF, NOT ON THE PAGE. A paste is a blob nobody can see
   until it renders, and applying it straight over the working palette would
   throw away whatever was being worked on to make room for it. Press Apply.

   A NAME ALREADY IN USE GETS A NUMBER rather than overwriting. Save overwrites
   on a name match because you can see what you are saving; a paste is exactly
   the case where you cannot.
   ────────────────────────────────────────────────────────────────────── */

const NAME_MARKER = /\/\*\s*sdshc-theme:\s*([^*]+?)\s*\*\//

function acceptableValue(name, value) {
  if (!value) return false
  if (KIND.get(name) === 'text') return true
  return Boolean(parseColor(value)) || /^var\(\s*--[\w-]+\s*\)$/.test(value)
}

/**
 * Pull the palette out of whatever was pasted.
 *
 * Blocks are matched with no nesting allowed inside them, so a whole stylesheet
 * comes apart into its innermost rules and everything that is not one of the two
 * palette selectors is passed over without comment. That is what lets a paste of
 * the entire styles.css work.
 */
function harvestCSS(text) {
  const raw = String(text || '')
  const named = NAME_MARKER.exec(raw)
  const clean = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = { light: {}, dark: {}, kept: 0, unknown: 0, rejected: 0, name: named ? named[1] : '' }

  const blocks = [...clean.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }))
  // No braces anywhere means the declarations were copied out of the middle of a
  // block, which reads as the light one: it is the block :root holds, and a dark
  // override pasted on its own would have been copied WITH its selector.
  if (!blocks.length) blocks.push({ selector: ':root', body: clean })

  for (const { selector, body } of blocks) {
    const dark = /data-theme\s*[~^|$*]?=\s*['"]?dark/.test(selector)
    const light = /:root|^html\b|^\*$/.test(selector)
    if (!dark && !light) continue

    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      const name = d[1]
      const value = d[2].trim()
      if (!KIND.has(name)) {
        out.unknown += 1
        continue
      }
      if (!acceptableValue(name, value)) {
        out.rejected += 1
        continue
      }
      out[dark ? 'dark' : 'light'][name] = value
      out.kept += 1
    }
  }
  return out
}

function uniqueName(wanted) {
  const taken = new Set(store.themes.map((t) => t.name.toLowerCase()))
  if (!taken.has(wanted.toLowerCase())) return wanted
  for (let n = 2; ; n += 1) {
    const tried = `${wanted} ${n}`
    if (!taken.has(tried.toLowerCase())) return tried
  }
}

function importCSS(text) {
  const found = harvestCSS(text)
  if (!found.kept) {
    return {
      ok: false,
      message: found.unknown || found.rejected
        ? `Nothing usable: ${found.unknown} name${found.unknown === 1 ? '' : 's'} this app does not use, ${found.rejected} value${found.rejected === 1 ? '' : 's'} that is not a colour.`
        : 'Nothing found. This wants declarations like --sky: #0fb2e2, inside a :root or [data-theme="dark"] block or on their own.',
    }
  }

  const theme = {
    id: newId(),
    name: uniqueName(found.name || `Imported ${new Date().toLocaleDateString()}`),
    savedAt: Date.now(),
    light: found.light,
    dark: found.dark,
    // Every dark value in a paste was decided somewhere else, which makes it the
    // same kind of thing as a dark row typed by hand. Pin them, or the first
    // light edit after this theme is applied re-derives them all and the paste
    // has been quietly overruled.
    pinned: Object.keys(found.dark),
    mirror: true,
  }
  store.themes.push(theme)
  writeStore()

  const lit = Object.keys(found.light).length
  const drk = Object.keys(found.dark).length
  const dropped = found.unknown + found.rejected
  return {
    ok: true,
    theme,
    message:
      `Saved “${theme.name}”: ${lit} light, ${drk} dark.` +
      (dropped ? ` ${dropped} ignored (${found.unknown} unknown, ${found.rejected} not a colour).` : '') +
      ' Press Apply to put it on the page.',
  }
}

function deleteTheme(id) {
  store.themes = store.themes.filter((t) => t.id !== id)
  // The palette stays exactly where it is. Deleting the note you wrote a colour
  // down on is not a decision to change the colour.
  if (store.activeId === id) store.activeId = ''
  writeStore()
}

/* ── CLUSTERS ─────────────────────────────────────────────────────────────
   --green and --save are one green. --brown, --brand-ink and --on-olive are
   one brown. Editing them one at a time is exactly how a palette drifts apart,
   so tokens sharing a shipped colour get ONE control, with the members behind
   an expander for when you do want them apart.

   Grouped on the LIGHT base value and kept that way under both themes: --card
   and --on-sky are both #ffffff in light and two different colours in dark, so
   clustering per-theme would make the panel rearrange itself under the theme
   toggle.

   That white cluster is the one to watch — it is a card surface and a button
   LABEL sharing a value by coincidence rather than by intent. Expand it and
   set them apart if you are moving it.

   Clustering is across groups, not within them, or --sky and --info would not
   meet. The cluster is rendered where its first member sits.
   ────────────────────────────────────────────────────────────────────── */

function buildClusters() {
  const byValue = new Map()
  const assigned = new Set()
  const clusters = []

  for (const name of ALL_TOKENS) {
    if (KIND.get(name) === 'text') continue
    const key = toHex(baseValue(name, 'light'))
    if (!key) continue
    if (!byValue.has(key)) byValue.set(key, [])
    byValue.get(key).push(name)
  }

  for (const group of GROUPS) {
    for (const [name] of group.tokens) {
      if (assigned.has(name)) continue
      const key = KIND.get(name) === 'text' ? null : toHex(baseValue(name, 'light'))
      const members = (key && byValue.get(key)) || [name]
      for (const m of members) assigned.add(m)
      clusters.push({ group: group.name, key, tokens: members })
    }
  }
  return clusters
}

/* ── the panel ─────────────────────────────────────────────────────────── */

/* The panel's own two schemes.

   Declared on .tl-panel, not on :root, and every name carries a --tl- prefix.
   Both halves of that matter: nothing here can be reached by applyAll(), which
   only ever writes the names in ALL_TOKENS, and nothing here inherits from the
   palette being edited. The panel turns over with the app's toggle and is
   otherwise sealed off from it.

   Light is the default and dark is the override, the same way round as
   styles.css, so the two files read alike. */
const PANEL_CSS = `
.tl-panel {
  --tl-surface: #ffffff;
  --tl-raised: #f4f7f6;
  --tl-sunken: #f8faf9;
  --tl-line: #d5dbd8;
  --tl-line-soft: #e6eae8;
  --tl-ink: #1b2220;
  --tl-ink-soft: #55605c;
  --tl-ink-faint: #6a7571;
  --tl-accent-bg: #ddeef6;
  --tl-accent-line: #6aa8bd;
  --tl-accent-ink: #10556b;
  --tl-danger-line: #dcb0a8;
  --tl-danger-ink: #a5382a;
  --tl-warn-ink: #7a5b18;
  --tl-warn-bg: #fbf1dc;
  --tl-warn-line: #e0cb95;
  --tl-dot: #c98a06;
  --tl-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  --tl-range: #0f7fa0;
  color-scheme: light;

  position: fixed;
  z-index: 99999;
  inset: auto 12px 12px auto;
  width: 380px;
  max-height: min(80vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--tl-surface);
  color: var(--tl-ink);
  border: 1px solid var(--tl-line);
  border-radius: 12px;
  box-shadow: var(--tl-shadow);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overscroll-behavior: contain;
}
:root[data-theme="dark"] .tl-panel {
  --tl-surface: #171b1d;
  --tl-raised: #232a2d;
  --tl-sunken: #101314;
  --tl-line: #39423f;
  --tl-line-soft: #2b3335;
  --tl-ink: #e8edeb;
  --tl-ink-soft: #b3c0bc;
  --tl-ink-faint: #8b9a95;
  --tl-accent-bg: #1d3a44;
  --tl-accent-line: #3f7d92;
  --tl-accent-ink: #b9e7f5;
  --tl-danger-line: #6d3a34;
  --tl-danger-ink: #f0a79d;
  --tl-warn-ink: #e0c07a;
  --tl-warn-bg: #2c2517;
  --tl-warn-line: #5c4a2a;
  --tl-dot: #ffd24a;
  --tl-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  --tl-range: #4fc9ef;
  color-scheme: dark;
}
.tl-panel[data-dock="left"] { inset: auto auto 12px 12px; }
.tl-panel[hidden] { display: none; }
.tl-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--tl-line);
  flex: 0 0 auto;
}
.tl-title { font-weight: 700; font-size: 13px; margin-right: auto; letter-spacing: 0.01em; }
.tl-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--tl-accent-bg);
  color: var(--tl-accent-ink);
}
.tl-btn {
  font: inherit;
  font-size: 12px;
  color: var(--tl-ink);
  background: var(--tl-raised);
  border: 1px solid var(--tl-line);
  border-radius: 7px;
  padding: 5px 9px;
  min-height: 30px;
  cursor: pointer;
}
.tl-btn:hover { border-color: var(--tl-ink-faint); }
.tl-btn[aria-pressed="true"] {
  background: var(--tl-accent-bg);
  border-color: var(--tl-accent-line);
  color: var(--tl-accent-ink);
}
.tl-btn.tl-danger { border-color: var(--tl-danger-line); color: var(--tl-danger-ink); }
.tl-x { min-width: 30px; padding: 5px 8px; }
.tl-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tl-line);
  flex: 0 0 auto;
}
.tl-tabs {
  display: flex;
  gap: 4px;
  padding: 6px 10px 0;
  border-bottom: 1px solid var(--tl-line);
  flex: 0 0 auto;
}
.tl-tab {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--tl-ink-soft);
  background: none;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 7px 7px 0 0;
  padding: 6px 10px;
  min-height: 30px;
  margin-bottom: -1px;
  cursor: pointer;
}
.tl-tab[aria-selected="true"] {
  color: var(--tl-accent-ink);
  background: var(--tl-accent-bg);
  border-color: var(--tl-accent-line);
}
/* Both panes are flex columns whose middle child scrolls, so the panel's own
   height is the only scroller either of them gets. min-height: 0 is what lets a
   flex child be shorter than its content and therefore scroll at all. */
.tl-pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.tl-pane[hidden] { display: none; }
.tl-body { overflow: auto; padding: 4px 10px 10px; flex: 1 1 auto; min-height: 0; }
.tl-save {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tl-line);
  flex: 0 0 auto;
}
.tl-save-input {
  font: inherit;
  font-size: 12px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 30px;
  padding: 4px 8px;
  color: var(--tl-ink);
  background: var(--tl-sunken);
  border: 1px solid var(--tl-line);
  border-radius: 7px;
}
/* Outside .tl-shelf on purpose: renderShelf() replaces that subtree, and a
   textarea somebody has pasted three hundred lines into must not be inside
   anything that gets rebuilt. Folded by default, since the shelf is what this
   tab is for and this is the once-a-week errand. */
.tl-import {
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--tl-line);
  flex: 0 0 auto;
}
.tl-import > summary {
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--tl-ink-soft);
  padding: 4px 0;
  list-style: none;
  min-height: 24px;
}
.tl-import > summary::-webkit-details-marker { display: none; }
.tl-import > summary::before { content: "\\25B8  "; display: inline-block; width: 1em; }
.tl-import[open] > summary::before { content: "\\25BE  "; }
.tl-paste {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  width: 100%;
  height: 92px;
  margin: 2px 0 6px;
  padding: 6px;
  color: var(--tl-ink);
  background: var(--tl-sunken);
  border: 1px solid var(--tl-line);
  border-radius: 8px;
  white-space: pre;
}
.tl-import-row { display: flex; gap: 6px; }
.tl-import-msg {
  font-size: 11px;
  line-height: 1.4;
  color: var(--tl-ink-faint);
  margin: 6px 0 0;
}
.tl-import-msg:empty { display: none; }
.tl-import-msg[data-tl-bad] { color: var(--tl-danger-ink); }
.tl-shelf { overflow: auto; padding: 8px 10px 10px; flex: 1 1 auto; min-height: 0; }
.tl-empty { font-size: 11.5px; color: var(--tl-ink-faint); margin: 4px 0; line-height: 1.4; }
.tl-theme {
  border: 1px solid var(--tl-line);
  border-radius: 9px;
  padding: 7px 8px;
  margin-bottom: 7px;
  background: var(--tl-raised);
}
.tl-theme[data-tl-active] { border-color: var(--tl-accent-line); background: var(--tl-accent-bg); }
.tl-theme-top { display: flex; align-items: center; gap: 6px; }
.tl-theme-name {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 28px;
  padding: 3px 6px;
  color: var(--tl-ink);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
}
.tl-theme-name:hover, .tl-theme-name:focus { background: var(--tl-surface); border-color: var(--tl-line); }
.tl-when { font-size: 10px; color: var(--tl-ink-faint); white-space: nowrap; }
.tl-chips { display: flex; gap: 3px; margin: 6px 0; }
.tl-chip {
  width: 100%;
  height: 14px;
  border: 1px solid var(--tl-line);
  border-radius: 3px;
}
.tl-theme-btns { display: flex; flex-wrap: wrap; gap: 5px; }
.tl-theme-btns .tl-btn { font-size: 11px; padding: 4px 7px; min-height: 28px; }
.tl-btn[data-tl-confirm] {
  background: var(--tl-warn-bg);
  border-color: var(--tl-warn-line);
  color: var(--tl-warn-ink);
}
.tl-group { margin-top: 10px; }
.tl-group > summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--tl-ink-soft);
  padding: 4px 0;
  list-style: none;
}
.tl-group > summary::-webkit-details-marker { display: none; }
.tl-group > summary::before { content: "\\25B8  "; display: inline-block; width: 1em; }
.tl-group[open] > summary::before { content: "\\25BE  "; }
.tl-group-note {
  margin: 2px 0 6px;
  padding: 5px 7px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--tl-warn-ink);
  background: var(--tl-warn-bg);
  border: 1px solid var(--tl-warn-line);
  border-radius: 7px;
}
.tl-cluster { border-left: 2px solid var(--tl-line-soft); padding-left: 6px; margin: 2px 0 6px; }
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
  background: var(--tl-dot);
  vertical-align: middle;
}
.tl-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--tl-line);
  border-radius: 7px;
  background: none;
  cursor: pointer;
}
.tl-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
.tl-swatch::-webkit-color-swatch { border: none; border-radius: 5px; }
.tl-name {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  color: var(--tl-ink);
  display: block;
}
.tl-note { font-size: 10.5px; color: var(--tl-ink-faint); display: block; }
.tl-flag {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 4px;
  margin-left: 5px;
  border-radius: 4px;
  vertical-align: 1px;
}
.tl-flag-auto {
  background: var(--tl-accent-bg);
  color: var(--tl-accent-ink);
  border: 1px solid var(--tl-accent-line);
}
.tl-flag-pin {
  background: var(--tl-warn-bg);
  color: var(--tl-warn-ink);
  border: 1px solid var(--tl-warn-line);
}
.tl-val {
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  width: 100%;
  min-height: 26px;
  margin-top: 2px;
  padding: 3px 6px;
  color: var(--tl-ink);
  background: var(--tl-sunken);
  border: 1px solid var(--tl-line);
  border-radius: 6px;
}
.tl-val::placeholder { color: var(--tl-ink-faint); font-style: italic; }
.tl-alpha { width: 100%; margin: 2px 0 0; accent-color: var(--tl-range); }
.tl-reset {
  font: inherit;
  font-size: 14px;
  line-height: 1;
  color: var(--tl-ink-soft);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  min-height: 30px;
  cursor: pointer;
}
.tl-reset:hover { color: var(--tl-ink); border-color: var(--tl-line); }
.tl-expand {
  font: inherit;
  font-size: 10.5px;
  color: var(--tl-ink-faint);
  background: none;
  border: none;
  padding: 2px 0 4px 40px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  min-height: 24px;
}
.tl-expand:hover { color: var(--tl-ink); }
.tl-members { padding-left: 12px; border-left: 1px dashed var(--tl-line); margin-left: 16px; }
.tl-members[hidden] { display: none; }
/* Pinned at the foot of the panel rather than at the end of one pane's scroll,
   because both tabs write to it and the tab you are on must not decide whether
   the thing you just pressed Copy on is on screen. */
.tl-out {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  flex: 0 0 auto;
  width: auto;
  height: 150px;
  margin: 0 10px 10px;
  padding: 6px;
  color: var(--tl-ink);
  background: var(--tl-sunken);
  border: 1px solid var(--tl-line);
  border-radius: 8px;
  white-space: pre;
}
.tl-out[hidden] { display: none; }
.tl-hint { font-size: 11px; color: var(--tl-ink-faint); padding: 6px 10px 0; margin: 0; }
@media (max-width: 620px) {
  .tl-panel,
  .tl-panel[data-dock="left"] {
    inset: auto 0 0 0;
    width: auto;
    max-height: 74vh;
    border-radius: 14px 14px 0 0;
  }
  .tl-row { grid-template-columns: 40px 1fr 40px; }
  .tl-swatch { width: 40px; height: 40px; }
  .tl-btn { min-height: 36px; }
  .tl-reset { min-height: 40px; }
  .tl-expand { min-height: 34px; padding-left: 46px; }
}
@media print { .tl-panel { display: none !important; } }
`

let panel = null
let bodyEl = null
let shelfEl = null
let outEl = null

function ensurePanel() {
  if (panel) return panel
  if (!primed) primeBases()

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
    <div class="tl-tabs" role="tablist">
      <button type="button" class="tl-tab" role="tab" data-tl-tab="colors" aria-selected="true">Colours</button>
      <button type="button" class="tl-tab" role="tab" data-tl-tab="themes" aria-selected="false">Saved themes</button>
    </div>
    <div class="tl-pane" data-tl-pane="colors">
      <div class="tl-bar">
        <button type="button" class="tl-btn" data-tl-mirror aria-pressed="false">Mirror to dark</button>
        <button type="button" class="tl-btn" data-tl-remirror title="Re-derive every dark colour, including ones set by hand">Re-mirror all</button>
        <button type="button" class="tl-btn" data-tl-copy="changes">Copy changes</button>
        <button type="button" class="tl-btn" data-tl-copy="full">Copy full palette</button>
        <button type="button" class="tl-btn tl-danger" data-tl-reset-theme>Reset this theme</button>
        <button type="button" class="tl-btn tl-danger" data-tl-reset-all>Reset both</button>
      </div>
      <p class="tl-hint" data-tl-hint></p>
      <div class="tl-body"></div>
    </div>
    <div class="tl-pane" data-tl-pane="themes" hidden>
      <div class="tl-save">
        <input class="tl-save-input" type="text" data-tl-save-name spellcheck="false"
               placeholder="Name this palette" aria-label="Theme name" />
        <button type="button" class="tl-btn" data-tl-save>Save</button>
      </div>
      <details class="tl-import">
        <summary>Paste CSS from another browser</summary>
        <textarea class="tl-paste" data-tl-paste spellcheck="false"
                  aria-label="CSS to import"
                  placeholder=":root { --sky: #0fb2e2; }"></textarea>
        <div class="tl-import-row">
          <button type="button" class="tl-btn" data-tl-import>Import as a saved theme</button>
        </div>
        <p class="tl-import-msg" data-tl-import-msg></p>
      </details>
      <p class="tl-hint" data-tl-shelf-hint></p>
      <div class="tl-shelf"></div>
    </div>
  `
  bodyEl = panel.querySelector('.tl-body')
  shelfEl = panel.querySelector('.tl-shelf')
  document.body.appendChild(panel)

  buildRows()

  outEl = document.createElement('textarea')
  outEl.className = 'tl-out'
  outEl.readOnly = true
  outEl.hidden = true
  panel.appendChild(outEl)

  panel.addEventListener('click', onPanelClick)
  panel.addEventListener('input', onPanelInput)
  return panel
}

function buildRows() {
  const clusters = buildClusters()
  const notes = new Map(GROUPS.flatMap((g) => g.tokens.map((t) => [t[0], t[2]])))

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

    for (const cluster of clusters.filter((c) => c.group === group.name)) {
      if (cluster.tokens.length === 1) {
        const name = cluster.tokens[0]
        details.appendChild(row(name, KIND.get(name), notes.get(name)))
      } else {
        details.appendChild(clusterBlock(cluster, notes))
      }
    }
    bodyEl.appendChild(details)
  }
}

/**
 * A cluster is a master row, an expander, and the member rows.
 *
 * Not a <details>: the master row holds inputs, and an input inside a <summary>
 * toggles the disclosure when you click it. A button plus a [hidden] div does
 * the same job without fighting the control it contains.
 */
function clusterBlock(cluster, notes) {
  const wrap = document.createElement('div')
  wrap.className = 'tl-cluster'
  wrap.dataset.tlCluster = cluster.tokens.join(' ')

  const master = row(cluster.tokens[0], 'color', `${cluster.tokens.length} variables share this colour`, {
    master: cluster.tokens,
    label: `${cluster.tokens[0]} +${cluster.tokens.length - 1}`,
  })
  wrap.appendChild(master)

  const members = document.createElement('div')
  members.className = 'tl-members'
  members.hidden = true
  for (const name of cluster.tokens) {
    members.appendChild(row(name, KIND.get(name), notes.get(name)))
  }

  const expand = document.createElement('button')
  expand.type = 'button'
  expand.className = 'tl-expand'
  expand.setAttribute('aria-expanded', 'false')
  expand.dataset.tlExpand = ''
  expand.textContent = `▸ ${cluster.tokens.join(', ')}`

  wrap.append(expand, members)
  return wrap
}

/**
 * One control. `o.master` makes it write to a whole cluster instead of to the
 * token it is named after; everything else about it is the same, which is why
 * the master and its members are one function rather than two that drift.
 */
function row(name, kind, note, o = {}) {
  const targets = o.master || [name]
  const el = document.createElement('div')
  el.className = 'tl-row'
  el.dataset.tlToken = name
  el.dataset.tlKind = kind
  if (o.master) {
    el.dataset.tlMaster = targets.join(' ')
    el.classList.add('tl-master')
  }

  const swatch = document.createElement('input')
  swatch.type = 'color'
  swatch.className = 'tl-swatch'
  swatch.setAttribute('aria-label', `${o.label || name} colour`)
  if (kind === 'text') swatch.style.visibility = 'hidden'

  const mid = document.createElement('div')
  const label = document.createElement('span')
  label.className = 'tl-name'
  label.dataset.tlLabel = ''
  label.textContent = o.label || name
  const desc = document.createElement('span')
  desc.className = 'tl-note'
  desc.textContent = note || ''
  const val = document.createElement('input')
  val.type = 'text'
  val.className = 'tl-val'
  val.spellcheck = false
  val.setAttribute('aria-label', `${o.label || name} value`)
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
  reset.dataset.tlResetToken = ''
  reset.title = `Reset ${o.label || name}`
  reset.textContent = '↺'

  el.append(swatch, mid, reset)

  // The swatch and the slider are convenience over the text box, which is the
  // authoritative field: it is the only one that can hold `rgba()`, a shadow,
  // or a length, and it is what "copy" reads back.
  // A cluster master hands one colour to every member, and --olive-soft is in
  // --olive's cluster carrying 0.35 alpha. Writing the master's opaque hex
  // straight onto it would turn the selected mode-pill segment into a solid
  // olive block — the exact thing the token exists to avoid. So a member that
  // holds transparency keeps its own, and only the colour underneath moves.
  const push = (value) => {
    for (const t of targets) {
      const keepAlpha = Boolean(o.master) && KIND.get(t) === 'alpha'
      setToken(t, keepAlpha ? rgbaFrom(value, alphaOf(effectiveValue(t))) : value)
    }
    syncAll()
  }
  const pushFromParts = () => {
    push(kind === 'alpha' ? rgbaFrom(swatch.value, Number(alpha.value)) : swatch.value)
  }
  swatch.addEventListener('input', pushFromParts)
  if (alpha) alpha.addEventListener('input', pushFromParts)
  val.addEventListener('input', () => {
    const raw = val.value.trim()
    if (raw) push(raw)
  })

  syncRow(el)
  return el
}

function rowTargets(el) {
  return el.dataset.tlMaster ? el.dataset.tlMaster.split(' ') : [el.dataset.tlToken]
}

function syncRow(el) {
  const targets = rowTargets(el)
  const values = targets.map((t) => effectiveValue(t))
  const mixed = values.some((v) => v !== values[0])
  const value = mixed ? '' : values[0]

  const val = el.querySelector('.tl-val')
  if (document.activeElement !== val) {
    val.value = value
    val.placeholder = mixed ? 'mixed — expand to see each' : ''
  }

  const hex = toHex(mixed ? values[0] : value)
  if (hex) el.querySelector('.tl-swatch').value = hex
  const alpha = el.querySelector('.tl-alpha')
  if (alpha) alpha.value = String(alphaOf(value || values[0]))

  el.classList.toggle('tl-changed', targets.some((t) => t in overrides()))
  flagRow(el, targets)
}

/**
 * AUTO on a dark row means the mirror wrote it and a light edit will move it
 * again. PINNED means it was typed here and the mirror will leave it alone.
 * Without the two labels an automatic value is indistinguishable from a
 * decision, which is the failure mode of every feature that writes on your
 * behalf.
 */
function flagRow(el, targets) {
  const label = el.querySelector('[data-tl-label]')
  const old = label.querySelector('.tl-flag')
  if (old) old.remove()
  if (currentTheme() !== 'dark') return

  const auto = targets.every((t) => isMirrored(t))
  const pinned = targets.every((t) => store.pinned.has(t))
  if (!auto && !pinned) return

  const flag = document.createElement('span')
  flag.className = `tl-flag ${auto ? 'tl-flag-auto' : 'tl-flag-pin'}`
  flag.textContent = auto ? 'auto' : 'pinned'
  label.appendChild(flag)
}

function syncAll() {
  if (!panel) return
  panel.querySelector('[data-tl-theme]').textContent = currentTheme()
  panel.querySelector('[data-tl-mirror]').setAttribute('aria-pressed', String(store.mirror))
  panel.querySelector('[data-tl-hint]').textContent = store.mirror
    ? 'Edits apply live and are saved in this browser only. A light edit is mirrored into dark by copying the shipped pair’s own relationship; edit a dark row and it pins, and the mirror leaves it alone.'
    : 'Mirroring is off. Light and dark are edited separately.'
  for (const el of panel.querySelectorAll('[data-tl-token]')) syncRow(el)
  renderShelf()
}

/* ── the shelf, on screen ──────────────────────────────────────────────── */

/* Seven tokens, in the order the page shows them off: the two surfaces, the
   body ink, then the four brand colours. Enough of a strip to tell two saved
   palettes apart at a glance, which is the only job it has. */
const CHIP_TOKENS = ['--bg', '--card', '--text', '--brown', '--sky', '--olive', '--clay']

function themeSwatch(theme, name) {
  const value = name in theme.light ? theme.light[name] : baseValue(name, 'light')
  return toHex(value) || '#888888'
}

function renderShelf() {
  // syncAll() runs on every keystroke in a colour box, and this rebuilds a DOM
  // subtree. Nothing on the shelf can be looked at from the other tab, so the
  // cheapest correct answer is not to build it; switchTab() calls this on the
  // way in.
  if (!shelfEl || panel.querySelector('[data-tl-pane="themes"]').hidden) return
  const input = panel.querySelector('[data-tl-save-name]')
  const typed = input.value.trim()
  const active = themeById(store.activeId)

  // The name box follows the active theme while nobody is typing in it, so
  // pressing Save on a theme you loaded updates that theme rather than quietly
  // starting a second one under the same name.
  if (document.activeElement !== input && active && !typed) input.value = active.name

  const match = store.themes.find((t) => t.name.toLowerCase() === input.value.trim().toLowerCase())
  const save = panel.querySelector('[data-tl-save]')
  save.textContent = match ? `Update “${match.name}”` : 'Save as new'
  save.disabled = !input.value.trim()

  const dirty = paletteIsDirty()
  panel.querySelector('[data-tl-shelf-hint]').textContent = active
    ? `On “${active.name}”${dirty ? ', with unsaved edits' : ''}. Saved in this browser only.`
    : dirty
      ? 'Unsaved edits, on no saved theme. Saved themes live in this browser only.'
      : 'No theme applied — this is the shipped palette. Saved themes live in this browser only.'

  shelfEl.textContent = ''
  if (!store.themes.length) {
    const empty = document.createElement('p')
    empty.className = 'tl-empty'
    empty.textContent =
      'Nothing saved yet. Change some colours on the Colours tab, then name the palette above and save it. A saved theme holds both light and dark, including anything you pinned.'
    shelfEl.appendChild(empty)
    return
  }

  for (const theme of [...store.themes].sort((a, b) => b.savedAt - a.savedAt)) {
    shelfEl.appendChild(themeCard(theme))
  }
}

function themeCard(theme) {
  const card = document.createElement('div')
  card.className = 'tl-theme'
  // data-tl-SAVED, not data-tl-theme: the badge in the header already carries
  // that name for the light/dark word, and a selector matching both a card here
  // and one span up there would work by accident of document order.
  card.dataset.tlSaved = theme.id
  const isActive = theme.id === store.activeId
  if (isActive) card.dataset.tlActive = ''

  const top = document.createElement('div')
  top.className = 'tl-theme-top'
  const name = document.createElement('input')
  name.type = 'text'
  name.className = 'tl-theme-name'
  name.value = theme.name
  name.spellcheck = false
  name.dataset.tlThemeName = ''
  name.setAttribute('aria-label', `Name of ${theme.name}`)
  const when = document.createElement('span')
  when.className = 'tl-when'
  when.textContent = theme.savedAt ? new Date(theme.savedAt).toLocaleDateString() : ''
  top.append(name, when)

  const chips = document.createElement('div')
  chips.className = 'tl-chips'
  for (const token of CHIP_TOKENS) {
    const chip = document.createElement('span')
    chip.className = 'tl-chip'
    chip.style.background = themeSwatch(theme, token)
    chip.title = token
    chips.appendChild(chip)
  }

  const btns = document.createElement('div')
  btns.className = 'tl-theme-btns'
  // Delete always asks. Apply asks only when the page is holding something the
  // shelf is not, which onThemeClick() works out at press time rather than
  // here — the palette can be edited between a render and a click, and a stale
  // "no need to ask" would throw the edits away without a word.
  //
  // The already-applied theme still offers Apply: it is how you throw away
  // edits you did not mean to make and get back to the saved colours.
  btns.append(
    themeButton('apply', isActive ? 'Reapply' : 'Apply'),
    themeButton('copy', 'Copy CSS'),
    themeButton('delete', 'Delete', true, 'tl-danger')
  )

  card.append(top, chips, btns)
  return card
}

/**
 * `needsConfirm` makes the button a two-step: the first press relabels it and
 * the second one acts. A confirm() dialog would do the same job, but this panel
 * is opened on a phone with five taps on a logo and a modal there covers the
 * thing you are looking at. Any other click in the panel stands the button back
 * down, so a stray press cannot leave one armed.
 */
function themeButton(action, label, needsConfirm = false, extra = '') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `tl-btn ${extra}`.trim()
  b.dataset.tlThemeAction = action
  b.dataset.tlLabel = label
  b.textContent = label
  if (needsConfirm) b.dataset.tlNeedsConfirm = ''
  return b
}

/** Stand every armed two-step button back down. */
function disarm(except) {
  if (!panel) return
  for (const b of panel.querySelectorAll('[data-tl-confirm]')) {
    if (b === except) continue
    delete b.dataset.tlConfirm
    b.textContent = b.dataset.tlLabel
  }
}

/* ── panel actions ─────────────────────────────────────────────────────── */

function switchTab(which) {
  for (const tab of panel.querySelectorAll('[data-tl-tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tlTab === which))
  }
  for (const pane of panel.querySelectorAll('[data-tl-pane]')) {
    pane.hidden = pane.dataset.tlPane !== which
  }
  renderShelf()
}

function onPanelInput(e) {
  const t = e.target

  const nameBox = t.closest('[data-tl-theme-name]')
  if (nameBox) {
    // Written straight onto the record and NOT re-rendered. The box being typed
    // into is inside the subtree renderShelf() replaces, so refreshing here
    // would take the caret out of it on the first character.
    const theme = themeById(nameBox.closest('[data-tl-saved]').dataset.tlSaved)
    if (theme) {
      theme.name = nameBox.value
      writeStore()
    }
    return
  }

  if (t.closest('[data-tl-save-name]')) {
    const match = store.themes.find((x) => x.name.toLowerCase() === t.value.trim().toLowerCase())
    const save = panel.querySelector('[data-tl-save]')
    save.textContent = match ? `Update “${match.name}”` : 'Save as new'
    save.disabled = !t.value.trim()
  }
}

function onThemeClick(t) {
  const btn = t.closest('[data-tl-theme-action]')
  if (!btn) return false
  const theme = themeById(btn.closest('[data-tl-saved]').dataset.tlSaved)
  if (!theme) return true

  const action = btn.dataset.tlThemeAction
  const armed = 'tlConfirm' in btn.dataset
  const needs = 'tlNeedsConfirm' in btn.dataset || (action === 'apply' && paletteIsDirty())
  if (needs && !armed) {
    btn.dataset.tlConfirm = ''
    btn.textContent = action === 'delete' ? 'Delete?' : 'Discard edits?'
    return true
  }

  if (action === 'copy') {
    // No syncAll(): rebuilding the shelf here would be a re-render nobody asked
    // for, and this button changes nothing about the palette or the shelf.
    showThemeCSS(theme)
    return true
  }
  if (action === 'apply') applyTheme(theme.id)
  if (action === 'delete') deleteTheme(theme.id)
  syncAll()
  return true
}

/**
 * The same output the Colours tab writes, for a theme that is not applied, with
 * the theme's name on the front of it.
 *
 * The name is a CSS comment, so the block still pastes into styles.css without
 * editing, and harvestCSS() reads it back — which is what makes the round trip
 * to another browser arrive called what it was called here rather than
 * "Imported 13/08/2026". It is stripped before anything is parsed, so a theme
 * named with a brace or a semicolon in it cannot affect the parse.
 */
function showThemeCSS(theme) {
  const blocks = [`/* sdshc-theme: ${theme.name.replace(/\*\//g, '')} */`]
  for (const key of ['light', 'dark']) {
    const selector = key === 'dark' ? '[data-theme="dark"]' : ':root'
    const lines = Object.entries(theme[key]).map(([name, value]) => `  ${name}: ${value};`)
    if (lines.length) blocks.push(`${selector} {\n${lines.join('\n')}\n}`)
  }
  if (blocks.length === 1) blocks.push('/* this theme changes nothing */')
  writeOut(blocks.join('\n\n'))
}

function onPanelClick(e) {
  const t = e.target
  disarm(t.closest('[data-tl-theme-action]'))

  const tab = t.closest('[data-tl-tab]')
  if (tab) return switchTab(tab.dataset.tlTab)

  if (t.closest('[data-tl-save]')) {
    const input = panel.querySelector('[data-tl-save-name]')
    if (saveTheme(input.value)) syncAll()
    return
  }

  if (t.closest('[data-tl-import]')) {
    const box = panel.querySelector('[data-tl-paste]')
    const msg = panel.querySelector('[data-tl-import-msg]')
    const result = importCSS(box.value)
    msg.textContent = result.message
    if (result.ok) delete msg.dataset.tlBad
    else msg.dataset.tlBad = ''
    // Cleared only on success, so a paste that found nothing is still there to
    // look at against the message saying why.
    if (result.ok) box.value = ''
    syncAll()
    return
  }

  if (onThemeClick(t)) return

  const reset = t.closest('[data-tl-reset-token]')
  if (reset) {
    for (const name of rowTargets(reset.closest('[data-tl-token]'))) clearToken(name)
    syncAll()
    return
  }

  const expand = t.closest('[data-tl-expand]')
  if (expand) {
    const members = expand.parentElement.querySelector('.tl-members')
    const open = members.hidden
    members.hidden = !open
    expand.setAttribute('aria-expanded', String(open))
    expand.textContent = `${open ? '▾' : '▸'} ${expand.textContent.slice(2)}`
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
  if (t.closest('[data-tl-mirror]')) {
    store.mirror = !store.mirror
    if (store.mirror) remirrorAll()
    writeStore()
    syncAll()
    return
  }
  if (t.closest('[data-tl-remirror]')) {
    remirrorAll({ unpin: true })
    syncAll()
    return
  }
  if (t.closest('[data-tl-reset-theme]')) {
    const theme = currentTheme()
    store[theme] = {}
    if (theme === 'dark') store.pinned.clear()
    else remirrorAll()
    applyAll()
    writeStore()
    syncAll()
    return
  }
  if (t.closest('[data-tl-reset-all]')) {
    // The shelf and what is applied off it are carried across deliberately.
    // This button clears the page, not the saved work; see THE SHELF.
    store = {
      light: {},
      dark: {},
      pinned: new Set(),
      mirror: store.mirror,
      themes: store.themes,
      activeId: store.activeId,
    }
    applyAll()
    writeStore()
    syncAll()
    return
  }
  const copy = t.closest('[data-tl-copy]')
  if (copy) showCSS(copy.dataset.tlCopy === 'full')
}

/**
 * "Changes" prints only the tokens holding a value, which is what you paste
 * over styles.css — mirrored dark values included, since those are real
 * declarations you would be shipping.
 *
 * "Full palette" prints every token at its effective value in both themes,
 * which is what you keep as a record of a theme you liked.
 */
function showCSS(full) {
  const blocks = []

  for (const theme of ['light', 'dark']) {
    const selector = theme === 'dark' ? '[data-theme="dark"]' : ':root'
    const lines = full
      ? ALL_TOKENS.map((name) => `  ${name}: ${effectiveValue(name, theme)};`)
      : Object.entries(store[theme]).map(([name, value]) => `  ${name}: ${value};`)
    if (lines.length) blocks.push(`${selector} {\n${lines.join('\n')}\n}`)
  }

  writeOut(blocks.join('\n\n') || '/* nothing changed yet */')
}

function writeOut(text) {
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

function onKeydown(e) {
  if (e.key === 'Escape' && panel && !panel.hidden) {
    close()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault()
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
  // apart without this file knowing anything about prefs.js. primeBases()
  // flips it too, and suspends this for the duration.
  new MutationObserver(() => {
    if (suspendObserver) return
    applyAll()
    syncAll()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

if (typeof document !== 'undefined') initThemeLab()
