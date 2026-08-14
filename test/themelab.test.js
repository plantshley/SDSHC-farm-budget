/**
 * The theme lab: an author tool, tested for the two things that can be wrong
 * about it without looking wrong.
 *
 * It is not a producer feature and most of it does not need a test — a swatch
 * that writes the wrong colour is visible the instant you press it. Two parts
 * are not:
 *
 * THE MIRROR is arithmetic in a colour space nobody can check by eye. Its
 * correctness property is that leaving a light colour where it shipped
 * reproduces the exact dark hex in styles.css, and that property is asserted
 * here against the real stylesheet rather than against a copy of it, so a token
 * moving in styles.css moves what these tests expect. Both of its shipped bugs
 * were near-greys: a cream page background that mirrored to a saturated brown,
 * and a purple heading ink that came back clay brown, and both read as a plain
 * colour on screen with nothing to say they were junk.
 *
 * THE SHELF holds named work. Everything in it is one localStorage key that can
 * be cleared by a button, so the rules about what must survive what are worth
 * pinning down.
 *
 * This file boots themelab.js on the real index.html with the real styles.css
 * inlined, because primeBases() reads the shipped palette through
 * getComputedStyle and there is nothing to test without it.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/%BASE_URL%/g, '/')
  // jsdom fetches no stylesheet, and the whole module reads its bases off one.
  .replace('<link rel="stylesheet" href="/src/styles.css" />', `<style>${CSS}</style>`)

const STORE_KEY = 'sdshc-fb-themelab'

let dom
let win
let doc
let panel

async function boot(seed) {
  dom?.window?.close()
  dom = new JSDOM(HTML, { url: 'https://example.org/SDSHC-farm-budget/', pretendToBeVisual: true })
  win = dom.window
  doc = win.document

  globalThis.window = win
  globalThis.document = doc
  globalThis.localStorage = win.localStorage
  globalThis.MutationObserver = win.MutationObserver
  globalThis.getComputedStyle = win.getComputedStyle
  // themelab.js writes to the clipboard through navigator, which is not
  // assignable on globalThis the ordinary way.
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true })

  win.localStorage.clear()
  seed?.(win.localStorage)

  await import(`../src/themelab.js?bust=${Math.random()}`)
  doc.dispatchEvent(
    new win.KeyboardEvent('keydown', { bubbles: true, key: 't', ctrlKey: true, altKey: true })
  )
  panel = doc.querySelector('[data-theme-lab]')
}

/* ── reading the shipped palette out of styles.css ─────────────────────────
   Parsed rather than copied. A hardcoded table would pass this file for as long
   as it took somebody to change a colour, and would then assert that the
   mirror reproduces a value the app no longer ships. */

function declarations(block) {
  const out = {}
  for (const m of block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim()
  return out
}

const DARK_AT = CSS.indexOf('[data-theme="dark"] {')
const SHIPPED_LIGHT = declarations(CSS.slice(0, DARK_AT))
const SHIPPED_DARK = declarations(CSS.slice(DARK_AT, CSS.indexOf('[data-font="classic"]')))

const isColour = (v) => typeof v === 'string' && /^(#|rgba?\()/.test(v)
const tidy = (v) => String(v).replace(/\s+/g, '').toLowerCase()

/* ── driving the panel ─────────────────────────────────────────────────── */

const store = () => JSON.parse(win.localStorage.getItem(STORE_KEY))
const rowFor = (token) => panel.querySelector(`.tl-row[data-tl-token="${token}"]:not(.tl-master)`)
const masterFor = (token) =>
  [...panel.querySelectorAll('.tl-master')].find((m) => m.dataset.tlMaster.split(' ').includes(token))

function typeInto(el, value) {
  el.value = value
  el.dispatchEvent(new win.Event('input', { bubbles: true }))
}

function setToken(token, value) {
  const row = rowFor(token)
  assert.ok(row, `no row for ${token}`)
  typeInto(row.querySelector('.tl-val'), value)
}

const resetBoth = () => panel.querySelector('[data-tl-reset-all]').click()
const tab = (which) => panel.querySelector(`[data-tl-tab="${which}"]`).click()
const cards = () => [...panel.querySelectorAll('[data-tl-saved]')]
const cardNamed = (name) => cards().find((c) => c.querySelector('.tl-theme-name').value === name)
const actionIn = (card, action) => card.querySelector(`[data-tl-theme-action="${action}"]`)

function saveAs(name) {
  tab('themes')
  typeInto(panel.querySelector('[data-tl-save-name]'), name)
  panel.querySelector('[data-tl-save]').click()
}

/* ── the mirror ────────────────────────────────────────────────────────── */

describe('the mirror carries a light edit into dark', () => {
  beforeEach(async () => {
    await boot()
    resetBoth()
  })

  test('a token set back to its own shipped value lands on the shipped dark hex', () => {
    // The property the whole model rests on, across every colour token the app
    // ships rather than a sample of them. Both models the mirror blends are
    // exact here, so any weight between them is exact too — which is what makes
    // the blend safe to tune.
    let checked = 0
    for (const [token, light] of Object.entries(SHIPPED_LIGHT)) {
      const row = rowFor(token)
      if (!row || row.dataset.tlKind === 'text') continue
      const dark = SHIPPED_DARK[token] ?? light
      if (!isColour(light) || !isColour(dark)) continue

      setToken(token, light)
      assert.equal(
        tidy(store().dark[token]),
        tidy(dark),
        `${token} mirrored to ${store().dark[token]}, styles.css ships ${dark}`
      )
      checked += 1
    }
    assert.ok(checked > 40, `only ${checked} tokens were actually checked`)
  })

  test('a near-grey base does not rotate the hue it is handed', () => {
    // The reported bug. --brand-ink is #4e413a against #dfe6e2: two browns close
    // enough to grey that the 111 degrees of hue sitting between them mean
    // nothing at all. Its light chroma is 0.021, a thousandth over what used to
    // be a hard threshold, so it took the model meant for real colours and
    // turned a purple heading ink into clay brown.
    //
    // Asserted as "the hue that comes out is the hue that went in", because the
    // exact output is a function of a blend weight that is allowed to be tuned.
    for (const token of ['--brown', '--brand-ink', '--on-olive', '--muted', '--text']) {
      resetBoth()
      setToken(token, '#c799ff')
      const [, r, g, b] = /^#(..)(..)(..)$/.exec(store().dark[token]) || []
      assert.ok(r, `${token} produced ${store().dark[token]}, which is not a hex`)
      assert.ok(
        parseInt(b, 16) > parseInt(g, 16) && parseInt(r, 16) > parseInt(g, 16),
        `${token} took a purple to ${store().dark[token]}, which is not purple`
      )
    }
  })

  test('a cream page background stays a near-grey', () => {
    // The first of the two: a ratio between two chromas that are both nearly
    // zero is noise amplified, and it sent #faf4e8 to a saturated brown.
    resetBoth()
    setToken('--bg', '#faf4e8')
    const [, r, , b] = /^#(..)(..)(..)$/.exec(store().dark['--bg'])
    assert.ok(
      Math.abs(parseInt(r, 16) - parseInt(b, 16)) < 24,
      `--bg went to ${store().dark['--bg']}, which is a colour rather than a warm grey`
    )
  })

  test('a colour pushed outside sRGB loses chroma, not its hue', () => {
    // toSrgb() clamps each channel on its own, and clamping a channel is a hue
    // change: this used to come back #ffccff, a pale pink, with red and blue
    // both pinned at 255. fitChroma() gives up saturation instead.
    //
    // Asserted on the ORDER of the channels rather than on their values. The
    // answer sits near white, where blue legitimately reaches 255, so "no
    // channel is pinned" is not the property. What went wrong before was that
    // red was pinned TOO, which is what made it magenta: a purple has blue over
    // red over green, and #ffccff has red level with blue.
    resetBoth()
    setToken('--green', '#c799ff')
    const out = store().dark['--green']
    const [, r, g, b] = /^#(..)(..)(..)$/.exec(out).map((h, i) => (i ? parseInt(h, 16) : h))
    assert.ok(b > r && r > g, `--green came back ${out}, which is no longer a purple`)
  })

  test('a cluster master leaves a transparent member its alpha', () => {
    // --olive-soft shares --olive's colour and carries 0.35 of it. Writing the
    // master's opaque hex over it would make the selected mode-pill segment a
    // solid block, which is the one thing that token exists to avoid.
    resetBoth()
    typeInto(masterFor('--olive-soft').querySelector('.tl-val'), '#993399')
    assert.match(store().light['--olive-soft'], /^rgba\(153, 51, 153, 0\.35\)$/)
    assert.match(store().dark['--olive-soft'], /0\.18\)$/, 'and the shipped alpha ratio still applies')
    assert.equal(store().light['--olive'], '#993399', 'while the opaque member takes the hex')
  })

  test('a dark edit pins, and a later light edit leaves it alone', async () => {
    setToken('--clay', '#7a4a2a')
    const auto = store().dark['--clay']

    doc.documentElement.setAttribute('data-theme', 'dark')
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(rowFor('--clay').querySelector('.tl-flag').textContent, 'auto')

    setToken('--clay', '#ff00ff')
    assert.deepEqual(store().pinned, ['--clay'])
    assert.equal(rowFor('--clay').querySelector('.tl-flag').textContent, 'pinned')

    doc.documentElement.setAttribute('data-theme', 'light')
    await new Promise((r) => setTimeout(r, 5))
    setToken('--clay', '#3a2a1a')
    assert.equal(store().dark['--clay'], '#ff00ff', 'the hand-typed dark value survived')
    assert.notEqual(store().dark['--clay'], auto)
  })
})

/* ── the placeholder token ─────────────────────────────────────────────── */

describe('an empty box has a colour the theme can reach', () => {
  test('styles.css declares one and the lab offers it', async () => {
    // With no author rule the browser draws the placeholder in a grey of its
    // own, and it was the one piece of text on the page that stayed put while
    // every other colour moved.
    assert.match(CSS, /::placeholder\s*\{[^}]*color:\s*var\(--placeholder\)/)
    // Firefox dims a placeholder on top of whatever colour it is given, which
    // would take this one below the contrast it was chosen for.
    assert.match(CSS, /::placeholder\s*\{[^}]*opacity:\s*1/)
    assert.ok(SHIPPED_LIGHT['--placeholder'], 'declared in :root')
    assert.ok(SHIPPED_DARK['--placeholder'], 'and overridden in dark')

    await boot()
    assert.ok(rowFor('--placeholder'), 'and it has a row in the lab')
  })

  test('it is its own token, not --muted', () => {
    // --muted labels a figure that IS there; this stands in for one that is
    // not. At --muted's weight an empty box reads as filled in.
    assert.notEqual(SHIPPED_LIGHT['--placeholder'], SHIPPED_LIGHT['--muted'])
    assert.notEqual(SHIPPED_DARK['--placeholder'], SHIPPED_DARK['--muted'])
  })
})

/* ── the shelf ─────────────────────────────────────────────────────────── */

describe('saved themes', () => {
  beforeEach(async () => {
    await boot()
    resetBoth()
  })

  test('saving, switching, and updating in place', () => {
    setToken('--sky', '#e07b39')
    saveAs('Orange evening')
    assert.equal(store().themes.length, 1)
    assert.equal(store().activeId, store().themes[0].id)

    tab('colors')
    resetBoth()
    setToken('--sky', '#7a2f8f')
    saveAs('Purple morning')
    assert.equal(store().themes.length, 2)

    actionIn(cardNamed('Orange evening'), 'apply').click()
    assert.equal(store().light['--sky'], '#e07b39')
    assert.equal(doc.documentElement.style.getPropertyValue('--sky'), '#e07b39')

    // Applying copies the whole palette over, never merges: Purple morning's
    // --sky is gone rather than sitting underneath.
    assert.equal(Object.keys(store().light).length, 1)

    // And the name box follows what was applied. Left holding the last theme's
    // name, the next press of Save writes this palette over that theme.
    assert.equal(panel.querySelector('[data-tl-save-name]').value, 'Orange evening')
    assert.match(panel.querySelector('[data-tl-save]').textContent, /Update/)

    tab('colors')
    setToken('--sky', '#00aa77')
    saveAs('Orange evening')
    assert.equal(store().themes.length, 2, 'the same name updates rather than duplicating')
    assert.equal(cardNamed('Orange evening') && store().themes.find((t) => t.name === 'Orange evening').light['--sky'], '#00aa77')
  })

  test('applying over unsaved edits takes two presses', () => {
    setToken('--sky', '#e07b39')
    saveAs('Kept')
    tab('colors')
    setToken('--cost', '#111111')
    tab('themes')

    const apply = actionIn(cardNamed('Kept'), 'apply')
    apply.click()
    assert.match(apply.textContent, /Discard/)
    assert.equal(store().light['--cost'], '#111111', 'nothing happened on the first press')

    actionIn(cardNamed('Kept'), 'apply').click()
    assert.ok(!('--cost' in store().light), 'and the second one applied')
  })

  test('deleting takes two presses, and a stray click stands the button down', () => {
    setToken('--sky', '#e07b39')
    saveAs('Doomed')

    const del = actionIn(cardNamed('Doomed'), 'delete')
    del.click()
    assert.match(del.textContent, /\?$/)
    assert.equal(store().themes.length, 1)

    actionIn(cardNamed('Doomed'), 'copy').click()
    assert.equal(actionIn(cardNamed('Doomed'), 'delete').textContent, 'Delete')
    assert.equal(store().themes.length, 1, 'and it is still there')

    actionIn(cardNamed('Doomed'), 'delete').click()
    actionIn(cardNamed('Doomed'), 'delete').click()
    assert.equal(store().themes.length, 0)
  })

  test('deleting a theme does not change the palette it named', () => {
    setToken('--sky', '#e07b39')
    saveAs('Notes')
    actionIn(cardNamed('Notes'), 'delete').click()
    actionIn(cardNamed('Notes'), 'delete').click()
    assert.equal(store().light['--sky'], '#e07b39')
    assert.equal(store().activeId, '')
  })

  test('reset both clears the page and keeps the shelf', () => {
    // The one irreversible thing this tool could do. "Reset both" is pressed
    // several times an evening to see the shipped colours again; if it also
    // emptied a shelf of named work there would be no way back.
    setToken('--sky', '#e07b39')
    saveAs('Survivor')
    tab('colors')
    resetBoth()
    assert.equal(Object.keys(store().light).length, 0)
    assert.equal(store().themes.length, 1)
    assert.equal(store().themes[0].light['--sky'], '#e07b39')
  })

  test('renaming in place does not take the caret out of the box', () => {
    setToken('--sky', '#e07b39')
    saveAs('Before')
    const box = cardNamed('Before').querySelector('.tl-theme-name')
    typeInto(box, 'After')
    assert.equal(store().themes[0].name, 'After')
    assert.ok(box.isConnected, 'the element being typed into is still on the page')
  })

  test('one corrupt entry costs that entry and not the shelf', async () => {
    await boot((ls) =>
      ls.setItem(
        STORE_KEY,
        JSON.stringify({
          light: { '--sky': '#e07b39' },
          themes: [
            null,
            { nothing: true },
            { id: 5, name: 'a number for an id' },
            { id: 'ok1', name: 'Good', light: { '--sky': '#e07b39' }, dark: {}, savedAt: 1000 },
            { id: 'ok2', name: 'Half a record' },
          ],
        })
      )
    )
    tab('themes')
    // Newest first, and a record with no timestamp reads as the oldest there is.
    assert.deepEqual(
      cards().map((c) => c.querySelector('.tl-theme-name').value),
      ['Good', 'Half a record']
    )
    // The thin record is filled in rather than dropped, so it can be saved over.
    const half = cardNamed('Half a record')
    assert.equal(half.querySelectorAll('.tl-chip').length, 7)
  })

  test('an older store with no shelf reads as an empty one', async () => {
    await boot((ls) =>
      ls.setItem(STORE_KEY, JSON.stringify({ light: { '--sky': '#e07b39' }, dark: {}, pinned: [] }))
    )
    assert.equal(doc.documentElement.style.getPropertyValue('--sky'), '#e07b39')
    tab('themes')
    assert.equal(cards().length, 0)
    assert.match(panel.querySelector('.tl-shelf').textContent, /Nothing saved yet/)
  })
})

/* ── the round trip between two browsers ───────────────────────────────── */

describe('pasting CSS in', () => {
  const paste = (text) => {
    tab('themes')
    typeInto(panel.querySelector('[data-tl-paste]'), text)
    panel.querySelector('[data-tl-import]').click()
    return panel.querySelector('[data-tl-import-msg]').textContent
  }
  const out = () => panel.querySelector('.tl-out').value

  beforeEach(async () => {
    await boot()
    resetBoth()
  })

  test('a theme copied out of one browser arrives in another under its own name', () => {
    // The whole point. The name rides across in a CSS comment, so the block
    // still pastes into styles.css unedited and still knows what it is called.
    setToken('--sky', '#e07b39')
    setToken('--olive', '#c799ff')
    saveAs('Orange evening')
    actionIn(cardNamed('Orange evening'), 'copy').click()
    const copied = out()
    assert.match(copied, /sdshc-theme: Orange evening/)

    // A different browser: same app, empty store.
    return boot().then(() => {
      resetBoth()
      const msg = paste(copied)
      assert.match(msg, /Orange evening/)
      const arrived = store().themes[0]
      assert.equal(arrived.name, 'Orange evening')
      assert.equal(arrived.light['--sky'], '#e07b39')
      assert.equal(arrived.light['--olive'], '#c799ff')
      assert.equal(arrived.dark['--sky'], store().themes[0].dark['--sky'])
      assert.ok(arrived.dark['--olive'], 'and the mirrored dark half came with it')

      // An imported dark value was decided in the other browser. It is pinned,
      // exactly like a dark row typed by hand, or the first light edit after
      // this is applied re-derives the lot.
      assert.deepEqual(arrived.pinned.sort(), Object.keys(arrived.dark).sort())

      actionIn(cardNamed('Orange evening'), 'apply').click()
      assert.equal(doc.documentElement.style.getPropertyValue('--sky'), '#e07b39')
    })
  })

  test('it lands on the shelf and not on the page', () => {
    setToken('--cost', '#111111')
    const msg = paste(':root { --sky: #e07b39; }')
    assert.match(msg, /Press Apply/)
    assert.equal(store().light['--cost'], '#111111', 'the working palette is untouched')
    assert.ok(!('--sky' in store().light))
    assert.equal(store().themes.length, 1)
  })

  test('bare declarations with no block read as light', () => {
    // What you get copying two lines out of the middle of a :root block. A dark
    // override copied on its own would have come with its selector.
    paste('--sky: #e07b39;\n--olive: #c799ff;')
    assert.deepEqual(store().themes[0].light, { '--sky': '#e07b39', '--olive': '#c799ff' })
    assert.deepEqual(store().themes[0].dark, {})
  })

  test('both blocks are kept apart', () => {
    paste(':root{--sky:#111111;}\n[data-theme="dark"]{--sky:#eeeeee;--olive:#ababab}')
    const t = store().themes[0]
    assert.equal(t.light['--sky'], '#111111')
    assert.equal(t.dark['--sky'], '#eeeeee')
    assert.equal(t.dark['--olive'], '#ababab', 'and a last declaration needs no semicolon')
  })

  test('a whole stylesheet works, and the rules that are not the palette are passed over', () => {
    // Somebody will paste the entire styles.css, and the two selectors it wants
    // are in there. Nesting is what makes this delicate: @media blocks and
    // ordinary rules must not be mistaken for either one.
    const msg = paste(CSS)
    assert.match(msg, /^Saved/)
    const t = store().themes[0]
    assert.equal(t.light['--sky'], SHIPPED_LIGHT['--sky'])
    assert.equal(t.dark['--sky'], SHIPPED_DARK['--sky'])
    assert.ok(!('--font' in t.light), 'and nothing from the font blocks came with it')
  })

  test('a name this app does not use is dropped and counted, never stored', () => {
    // Keeping it would put a declaration in the store that no swatch reaches,
    // that applyAll() never writes, and that Copy CSS hands to the next browser.
    const msg = paste(':root { --sky: #e07b39; --not-a-token: #fff; --also-not: red; }')
    assert.match(msg, /2 ignored \(2 unknown, 0 not a colour\)/)
    assert.deepEqual(Object.keys(store().themes[0].light), ['--sky'])
  })

  test('a value that is not a colour is dropped, and var() is not one of them', () => {
    const msg = paste(':root { --sky: #gg0011; --olive: var(--sky); --radius: 10px; }')
    assert.match(msg, /1 unknown|0 unknown/)
    assert.match(msg, /1 not a colour/)
    const t = store().themes[0]
    assert.ok(!('--sky' in t.light), 'the malformed hex went')
    assert.equal(t.light['--olive'], 'var(--sky)', 'an alias is a real declaration and resolves')
    assert.equal(t.light['--radius'], '10px', 'and a non-colour token takes a non-colour')
  })

  test('an empty or unusable paste explains itself and keeps the text', () => {
    let msg = paste('hello')
    assert.match(msg, /Nothing found/)
    assert.equal(store().themes.length, 0)
    assert.equal(panel.querySelector('[data-tl-paste]').value, 'hello', 'left there to look at')

    msg = paste(':root { --nope: #fff; }')
    assert.match(msg, /Nothing usable/)
    assert.equal(store().themes.length, 0)
  })

  test('a name already in use gets a number rather than overwriting', () => {
    // Save overwrites on a name match because you can see what you are saving.
    // A paste is the one case where you cannot.
    setToken('--sky', '#e07b39')
    saveAs('Mine')
    paste('/* sdshc-theme: Mine */\n:root { --sky: #111111; }')
    assert.deepEqual(store().themes.map((t) => t.name).sort(), ['Mine', 'Mine 2'])
    assert.equal(store().themes.find((t) => t.name === 'Mine').light['--sky'], '#e07b39')
  })

  test('a successful import clears the box so a second press cannot duplicate it', () => {
    paste(':root { --sky: #e07b39; }')
    assert.equal(panel.querySelector('[data-tl-paste]').value, '')
    panel.querySelector('[data-tl-import]').click()
    assert.equal(store().themes.length, 1)
  })
})

/* ── the panel cannot be made unreadable by the palette it edits ───────── */

describe('the panel is sealed off from the palette', () => {
  test('no token it can write is a colour it is drawn in', async () => {
    await boot()
    const src = readFileSync(new URL('../src/themelab.js', import.meta.url), 'utf8')
    const own = new Set([...src.matchAll(/--tl-[\w-]+/g)].map((m) => m[0]))
    const editable = [...panel.querySelectorAll('.tl-row:not(.tl-master)')].map(
      (r) => r.dataset.tlToken
    )
    assert.ok(editable.length > 40)
    assert.ok(own.size > 10)
    assert.deepEqual(editable.filter((t) => own.has(t)), [])
  })

  test('it declares both schemes itself and switches on the app’s own attribute', () => {
    const src = readFileSync(new URL('../src/themelab.js', import.meta.url), 'utf8')
    const css = src.slice(src.indexOf('const PANEL_CSS = `'), src.indexOf('`\n\nlet panel'))
    assert.match(css, /\.tl-panel \{[^}]*--tl-surface:/)
    assert.match(css, /:root\[data-theme="dark"\] \.tl-panel \{[^}]*--tl-surface:/)
    assert.match(css, /color-scheme: light/)
    assert.match(css, /color-scheme: dark/)
  })
})
