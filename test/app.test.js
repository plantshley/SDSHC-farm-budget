/**
 * Smoke tests: boot the real app in a DOM and drive it.
 *
 * The build passing proves the modules parse; it proves nothing about whether
 * the app runs. These tests catch the failures that would otherwise be found by
 * a producer at the Soil Health School with no developer in the room: a boot
 * error, a dead button, a `?` that changes a number it should not touch.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { TYPICAL_VALUES } from '../src/data/typical-values.js'

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

let dom
let win
let doc
let app

/**
 * Boot index.html with a working localStorage, then import main.js into it.
 *
 * @param {Function} [seed]  runs against the empty store just before main.js is
 *   imported. The only way to test a state the app cannot be driven into from
 *   its own boot — a folder created in a previous session, which is the one that
 *   starts SHUT. Anything created in-session is deliberately left open.
 */
async function boot(seed) {
  // Shut the previous one down. `pretendToBeVisual` gives each window a live
  // requestAnimationFrame, and the drag loop keeps one scheduled for as long as
  // a finger is down — so a test that throws mid-gesture would otherwise leave a
  // frame loop running on an orphaned window, keeping Node alive and hanging the
  // whole suite until the runner's timeout. This shipped as a five-minute run
  // once. It also frees twenty-odd abandoned DOMs.
  dom?.window?.close()

  dom = new JSDOM(HTML, {
    url: 'https://example.org/SDSHC-farm-budget/',
    pretendToBeVisual: true,
  })
  win = dom.window
  doc = win.document

  // Vite resolves the CSS import at build time; under Node it must be a no-op.
  // Everything else the app touches is real DOM.
  globalThis.window = win
  globalThis.document = doc
  globalThis.localStorage = win.localStorage
  globalThis.CSS = win.CSS
  globalThis.Blob = win.Blob
  globalThis.URL = win.URL
  globalThis.confirm = () => true
  globalThis.alert = () => {}
  win.confirm = globalThis.confirm
  win.alert = globalThis.alert

  win.localStorage.clear()
  seed?.(win.localStorage)

  // Fresh module graph each boot so state.js does not leak between tests.
  await import(`../src/main.js?bust=${Math.random()}`)
  app = doc.getElementById('app')
}

function click(selector) {
  const el = doc.querySelector(selector)
  assert.ok(el, `no element matched ${selector}`)
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  return el
}

function type(path, value) {
  const el = doc.querySelector(`[data-path="${path}"]`)
  assert.ok(el, `no input for path ${path}`)
  el.value = String(value)
  el.dispatchEvent(new win.Event('input', { bubbles: true }))
  return el
}

/** Let a deferred render run. See deferRender() in main.js. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Type a crop name AND leave the box, which is when the app acts on it.
 *
 * Naming a crop fills seeds-per-unit and can open the seeds/ac mode, which
 * changes which boxes exist. That is a structural render, so it waits for
 * `change` rather than running on every keystroke — otherwise the card is
 * rebuilt mid-word and "Corn silage" cannot be typed in one go. The render is
 * then deferred past the click that caused the blur, which is why this is
 * async: a synchronous one would detach the element the producer pressed and
 * the click would never land.
 */
async function typeCrop(path, value) {
  const el = type(path, value)
  el.dispatchEvent(new win.Event('change', { bubbles: true }))
  await flush()
  return el
}

function textOf(selector) {
  return doc.querySelector(selector)?.textContent?.trim() ?? null
}

/**
 * The settled save state, tick and all. Spelled out here rather than imported
 * from main.js, because main.js is imported fresh into a new DOM on every boot
 * and has no export to reach for — but written as a constant so the tick cannot
 * be dropped from the app without a test saying so.
 */
const SAVED_LABEL = '✓ Saved'

describe('the app boots', () => {
  beforeEach(async () => {
    await boot()
  })

  test('renders the budget screen with one enterprise', async () => {
    assert.ok(app.innerHTML.length > 500, 'app rendered something')
    assert.equal(doc.querySelectorAll('.ent').length, 1)
    assert.ok(doc.querySelector('.fixed-block'), 'fixed costs block present')
    assert.ok(doc.querySelector('.results'), 'results present')
    assert.ok(doc.querySelector('.sticky-bar'), 'sticky results bar present')
  })

  test('warns that acres are needed before anything can be per-acre', async () => {
    assert.match(textOf('.warnings'), /acres/i)
  })

  test('a warning sits inside the card it is about, and clears on a keystroke', async () => {
    // Almost every warning names a specific box on a specific card, and read
    // from anywhere else that box is a scroll away. The exception is the one
    // warning that names no box at all.
    const farmHolder = doc.querySelector('.results [data-warnings]')
    assert.ok(farmHolder, 'the whole-farm one is in the Results header')
    assert.match(farmHolder.textContent, /Enter acres/)
    assert.equal(farmHolder.getAttribute('data-warnings-for'), 'farm')

    // Every enterprise card has one of its own, inside its fold.
    const card = doc.querySelector('.ent')
    const own = card.querySelector('[data-warnings]')
    assert.ok(own, 'so does the enterprise card')
    assert.equal(own.getAttribute('data-warnings-for'), '0', 'and it says whose list it draws')
    assert.ok(own.closest('.ent-body'), 'it is inside the fold, under the card it is about')

    // And so does the fixed block, for land rent, labor, and the machinery rows.
    const fixedHolder = doc.querySelector('.fixed-block [data-warnings]')
    assert.ok(fixedHolder, 'and the fixed block')
    assert.equal(fixedHolder.textContent.trim(), '', 'with nothing wrong in it yet')
    type('fixed.landRentPerAcre', '-40')
    assert.match(fixedHolder.textContent, /Land rent/)

    // A card's own warning names that card and appears only there.
    type('enterprises.0.name', 'North quarter')
    type('enterprises.0.variable.seed.costPerUnit', '285')
    assert.match(own.textContent, /North quarter/)
    assert.match(own.textContent, /no units per acre/)
    assert.doesNotMatch(fixedHolder.textContent, /North quarter/)
    assert.doesNotMatch(farmHolder.textContent, /North quarter/)

    // And they are still live placeholders. Typing does not re-render, so
    // anything updateOutputs() cannot reach would stay on screen for good.
    type('enterprises.0.variable.seed.unitsPerAcre', '0.4')
    assert.equal(own.textContent.trim(), '', 'gone once both boxes are filled')
    type('enterprises.0.acres', 500)
    assert.equal(farmHolder.textContent.trim(), '', 'gone once there are acres')
    assert.ok(doc.querySelector('[data-warnings]'), 'the holders stay')
  })

  test('font control shows every option with Browser active', async () => {
    const seg = (name) => doc.querySelector(`[data-font-choice="${name}"]`)
    const browser = seg('browser')
    const classic = seg('classic')
    const mono = seg('mono')
    assert.equal(browser.getAttribute('aria-pressed'), 'true')
    assert.equal(classic.getAttribute('aria-pressed'), 'false')
    assert.ok(mono, 'a fixed-pitch choice exists for a page made of columns of figures')
    assert.equal(mono.getAttribute('aria-pressed'), 'false')
    assert.equal(doc.documentElement.getAttribute('data-font'), 'browser')

    classic.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.documentElement.getAttribute('data-font'), 'classic')
    assert.equal(classic.getAttribute('aria-pressed'), 'true')
    assert.equal(browser.getAttribute('aria-pressed'), 'false')

    // Exactly one is pressed at a time, on a three-way control the same way it
    // was on a two-way one.
    mono.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.documentElement.getAttribute('data-font'), 'mono')
    assert.equal(win.localStorage.getItem('sdshc-fb-font'), 'mono')
    assert.deepEqual(
      [...doc.querySelectorAll('[data-font-choice]')]
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.getAttribute('data-font-choice')),
      ['mono']
    )
  })

  test('every font choice actually declares a stack, and an unknown one falls back', async () => {
    // jsdom loads no CSS, so a button naming a [data-font] value the stylesheet
    // has never heard of would leave the page with whatever --font it had and
    // pass every DOM assertion above.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    for (const btn of doc.querySelectorAll('[data-font-choice]')) {
      const choice = btn.getAttribute('data-font-choice')
      if (choice === 'browser') continue // the :root default, by definition
      assert.match(
        css,
        new RegExp(`\\[data-font="${choice}"\\] \\{[^}]*--font:`),
        `${choice} has a font stack`
      )
    }
    assert.match(css, /\[data-font="mono"\] \{[^}]*monospace/, 'and mono ends in a generic')

    // A preference written by some later build, or by hand, must not leave the
    // page with no font at all. Same rule perYearFactor() follows for a basis.
    await boot((ls) => ls.setItem('sdshc-fb-font', 'not-a-font'))
    assert.equal(doc.documentElement.getAttribute('data-font'), 'browser')
  })

  test('dark mode toggles and persists', async () => {
    click('#themeToggle')
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark')
    assert.equal(win.localStorage.getItem('sdshc-fb-theme'), 'dark')
  })
})

describe('entering a budget', () => {
  beforeEach(async () => {
    await boot()
  })

  test('typing updates the results without re-rendering the field', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')

    // The input the producer is typing in must survive — a full re-render here
    // would move the caret and drop the mobile keyboard.
    assert.equal(doc.querySelector('[data-path="enterprises.0.acres"]').value, '500')

    assert.equal(textOf('[data-out="enterprises.0.grossRevPerAcre"]'), '$765.00')
    assert.equal(textOf('.ent-name'), 'Corn')
    assert.match(textOf('[data-out="enterprises.0.acres"]'), /500 acres/)
  })

  test('a variable expense line switches between $/unit and $/acre', async () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.variable.seed.costPerUnit', '320')
    type('enterprises.0.variable.seed.unitsPerAcre', '0.35')
    assert.equal(textOf('[data-out="enterprises.0.lines.seed"]'), '$112.00')

    // The mode control is a pill of segments now, each carrying the SAME
    // data-path and its own data-mode, so a click has to name the segment it
    // wants. A bare [data-path] selector finds the first segment, which is the
    // one the line is usually already in — a click that would do nothing.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="perAcre"]')
    // Per-acre mode is now showing, and the unit values are still stored.
    assert.ok(doc.querySelector('[data-path="enterprises.0.variable.seed.perAcre"]'))
    type('enterprises.0.variable.seed.perAcre', '99')
    assert.equal(textOf('[data-out="enterprises.0.lines.seed"]'), '$99.00')

    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="unit"]')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.costPerUnit"]').value,
      '320',
      'switching back did not lose the per-unit entry'
    )
  })

  test('the mode pill shows every option and marks exactly one', async () => {
    const segments = () => [
      ...doc.querySelectorAll('[data-path="enterprises.0.variable.seed.mode"]'),
    ]
    // Seed carries the third mode; most lines carry two.
    assert.deepEqual(
      segments().map((s) => s.getAttribute('data-mode')),
      ['unit', 'perAcre', 'population'],
      'every option is on screen, not just the current one'
    )
    assert.deepEqual(
      segments().map((s) => s.getAttribute('aria-pressed')),
      ['true', 'false', 'false']
    )

    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
    assert.deepEqual(
      segments().map((s) => s.getAttribute('aria-pressed')),
      ['false', 'false', 'true'],
      'exactly one segment is pressed after a switch'
    )

    assert.deepEqual(
      [...doc.querySelectorAll('[data-path="enterprises.0.variable.hauling.mode"]')].map((s) =>
        s.getAttribute('data-mode')
      ),
      ['unit', 'perAcre'],
      'a line with no third mode does not grow a third segment'
    )
  })

  test('switching to $/acre says so in the empty box, and again once filled', async () => {
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="perAcre"]')
    const box = doc.querySelector('[data-path="enterprises.0.variable.seed.perAcre"]')
    assert.equal(
      box.placeholder,
      '$/acre',
      'the placeholder names the unit, not just the shape of the answer'
    )

    // Once there is a number in it the placeholder is gone, and the unit would
    // go with it. The two halves are in the markup all along and CSS reveals
    // them off :placeholder-shown, so nothing has to run on a keystroke.
    const wrap = box.closest('.in-box')
    assert.equal(wrap.querySelector('.in-pre').textContent, '$')
    assert.equal(wrap.querySelector('.in-post').textContent, '/ac')
  })

  test('a box that is not money gets no dollar sign', async () => {
    // The rule is the unit, not the box. Units-per-acre and a planting
    // population are counts, and a $ in front of one is simply wrong.
    const units = doc
      .querySelector('[data-path="enterprises.0.variable.seed.unitsPerAcre"]')
      .closest('.in-box')
    assert.equal(units.querySelector('.in-pre'), null)
    assert.equal(units.querySelector('.in-post').textContent, '/ac')

    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
    const pop = doc
      .querySelector('[data-path="enterprises.0.variable.seed.population"]')
      .closest('.in-box')
    assert.equal(pop.querySelector('.in-pre'), null)
  })

  test('preharvest interest is calculated, and can be switched to manual', async () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.variable.seed.costPerUnit', '100')
    type('enterprises.0.variable.seed.unitsPerAcre', '1')
    // 100 × 10% × 8/12 = 6.67
    assert.equal(textOf('[data-out="enterprises.0.preharvestInterestPerAcre"]'), '$6.67')

    click('[data-path="enterprises.0.preharvest.auto"][data-mode="manual"]')
    type('enterprises.0.preharvest.manualPerAcre', '25.50')
    assert.equal(textOf('[data-out="enterprises.0.preharvestInterestPerAcre"]'), '$25.50')
  })

  test('enterprises can be added past the spreadsheet’s limit of four', async () => {
    for (let i = 0; i < 5; i += 1) click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelectorAll('.ent').length, 6)
  })

  test('equipment is entered once and yields both depreciation and interest', async () => {
    type('enterprises.0.acres', '800')
    click('[data-action="add-equipment"]')
    type('fixed.equipment.0.name', 'Tractor')
    type('fixed.equipment.0.initialCost', '285000')
    type('fixed.equipment.0.salvageValue', '95000')
    type('fixed.equipment.0.usefulLife', '12')
    type('fixed.equipment.0.interestRate', '7')

    assert.equal(textOf('[data-out="fixed.equipment.0.annualDep"]'), '$15,833')
    assert.equal(textOf('[data-out="fixed.equipment.0.annualInt"]'), '$13,300')
  })

  test('a typed equipment name sets a category but fills nothing', async () => {
    click('[data-action="add-equipment"]')
    type('fixed.equipment.0.name', 'John Deere 1770 planter')

    for (const f of ['initialCost', 'salvageValue', 'usefulLife', 'interestRate']) {
      assert.equal(
        doc.querySelector(`[data-path="fixed.equipment.0.${f}"]`).value,
        '',
        `${f} must stay empty — nothing auto-fills`
      )
    }
    const btn = doc.querySelector('[data-typical="usefulLifeEquipment"]')
    assert.equal(btn.getAttribute('data-category'), 'planting')
  })
})

describe('help affordances stay separate', () => {
  beforeEach(async () => {
    await boot()
  })

  test('a `?` opens a definition and changes no value', async () => {
    type('enterprises.0.acres', '500')
    const before = doc.querySelector('[data-path="enterprises.0.acres"]').value

    click('[data-info="salvageValue"], .help-btn[data-info]')
    const overlay = doc.querySelector('.overlay.open')
    assert.ok(overlay, 'a modal opened')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.acres"]').value,
      before,
      'tapping ? must never alter data'
    )
    assert.equal(overlay.querySelectorAll('.typ-option').length, 0, 'no actionable rows in an info modal')
  })

  test('"use typical value" writes exactly one field', async () => {
    click('[data-action="add-equipment"]')
    type('fixed.equipment.0.initialCost', '200000')

    const btn = doc.querySelector(
      '[data-typical="salvageValue"][data-target="fixed.equipment.0.salvageValue"]'
    )
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const options = doc.querySelectorAll('.overlay.open .typ-option')
    assert.ok(options.length > 0, 'the picker offers options')

    // "25% — common default"
    const target = [...options].find((o) => o.getAttribute('data-value') === '=0.25*initialCost')
    assert.ok(target, 'the 25% sentinel option is present')
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.equal(
      doc.querySelector('[data-path="fixed.equipment.0.salvageValue"]').value,
      '50000',
      'the sentinel resolved against the initial cost the producer entered'
    )
    assert.equal(
      doc.querySelector('[data-path="fixed.equipment.0.initialCost"]').value,
      '200000',
      'no other field changed'
    )
  })

  test('a sentinel with nothing to resolve against explains itself', async () => {
    click('[data-action="add-equipment"]')
    const btn = doc.querySelector(
      '[data-typical="salvageValue"][data-target="fixed.equipment.0.salvageValue"]'
    )
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const option = [...doc.querySelectorAll('.overlay.open .typ-option')].find(
      (o) => o.getAttribute('data-value') === '=0.25*initialCost'
    )
    option.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const err = doc.querySelector('.modal-err')
    assert.equal(err.hidden, false, 'the guard message is shown')
    assert.match(err.textContent, /initial cost/i)
    assert.equal(
      doc.querySelector('[data-path="fixed.equipment.0.salvageValue"]').value,
      '',
      'nothing was written'
    )
  })

  test('every "use typical value" link sits in its field label row', async () => {
    // Under the input it read as a caption belonging to the NEXT field down,
    // and added a row of height to every field carrying one. If a link ever
    // escapes the label row again, this is what catches it.
    //
    // The seed line is driven into population mode on purpose. It carries the
    // one link that is NOT in a label row, and without opening that mode the
    // link is not rendered and this test would pass by never having seen it.
    click('[data-action="add-equipment"]')
    click('[data-action="add-building"]')
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')

    const links = [...doc.querySelectorAll('.ent .tip[data-typical], .fixed-block .tip[data-typical]')]
    assert.ok(links.length >= 6, 'the typical-value links are on the page')
    for (const link of links) {
      // The phone copy of the seeds-per-unit offer is the one exception, and it
      // is checked on its own terms in the next test.
      if (link.classList.contains('seeds-link-row')) continue
      const row = link.closest('.field-label, .line-head')
      assert.ok(row, `"${link.textContent.trim()}" is not in a label row`)
      assert.ok(
        row.querySelector('label, .line-label'),
        'the row it is in actually carries the field label'
      )
    }
  })

  test('the seeds-per-unit offer is rendered twice, one copy per width', async () => {
    // Two positions with different parents, and no amount of `order` moves a
    // flex item between containers — so it is rendered in both and CSS hides
    // one. `display: none` takes the hidden copy out of the accessibility tree
    // as well, so exactly one offer is ever announced.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')

    const head = doc.querySelector('[data-line="seed"] .seeds-link-head')
    const row = doc.querySelector('[data-line="seed"] .seeds-link-row')
    assert.ok(head, 'the computer copy is on the page')
    assert.ok(row, 'and so is the phone copy')

    // The computer copy sits in the head row, after "use typical value" in the
    // source and right-aligned against the mode pill on screen. Both halves
    // matter: the DOM order is what a screen reader and the keyboard follow,
    // and the alignment is asserted against the stylesheet in the next test.
    assert.equal(head.previousElementSibling.dataset.typical, 'seed')
    assert.equal(head.nextElementSibling.className, 'mode-pill', 'and the pill follows it')
    assert.ok(head.closest('.line-head'), 'in the label row')

    // The phone copy is a child of the line itself, under the boxes, because
    // that head row is already a label, a link, and a three-segment pill.
    assert.equal(row.parentElement.dataset.line, 'seed')
    assert.equal(row.closest('.line-head'), null)

    for (const el of [head, row]) {
      assert.equal(el.getAttribute('data-typical'), 'seedsPerBag')
      assert.equal(
        el.getAttribute('data-target'),
        'enterprises.0.variable.seed.seedsPerBag',
        'and both write the same box'
      )
      assert.match(el.textContent, /seeds per unit/i, 'and both name that field')
    }

    // Only in population mode, so no other line grows either copy.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="unit"]')
    assert.equal(doc.querySelectorAll('.seeds-link-head, .seeds-link-row').length, 0)
  })

  test('the stylesheet shows exactly one of them at each width', async () => {
    // jsdom loads no CSS, so this is a stylesheet-source assertion. If both
    // copies were ever visible at once the offer would be on screen twice, and
    // if neither were it would be gone entirely.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    const mobile = css.slice(css.indexOf('@media (max-width: 899px)'))

    assert.match(css, /\n\.seeds-link-row \{[^}]*display: none/, 'the phone copy is off by default')
    assert.match(mobile, /\n {2}\.seeds-link-head \{[^}]*display: none/, 'and the other one off on a phone')
    assert.match(mobile, /\n {2}\.seeds-link-row \{[^}]*display: block/, 'which is when the phone copy comes back')

    // The head copy is right-aligned against the mode pill, and the auto margin
    // MOVED there rather than being added: two auto margins in one flex line
    // split the free space between them, which would leave the link stranded
    // halfway across the row. So the pill's own auto margin has to be zeroed
    // wherever this link precedes it, and kept everywhere it does not.
    assert.match(css, /\n\.seeds-link-head \{[^}]*margin-left: auto/, 'the head copy is pushed right')
    assert.match(
      css,
      /\n\.line-head \.seeds-link-head \+ \.mode-pill \{[^}]*margin-left: 0/,
      'and the pill gives up its own auto margin so the two sit together'
    )
    assert.match(
      css,
      /\n\.line-head \.mode-pill \{[^}]*margin-left: auto/,
      'the pill still carries it on the fourteen lines with no such link'
    )

    // And it takes the margin back on a phone, where the link is hidden. This
    // shipped broken once: `display: none` takes an element off the screen but
    // NOT out of the sibling chain, so the rule above went on matching and left
    // the pill parked against "use typical value" in the middle of the row.
    assert.match(
      mobile,
      /\n {2}\.line-head \.seeds-link-head \+ \.mode-pill \{[^}]*margin-left: auto/,
      'the pill is right-aligned again once the link it yielded to is hidden'
    )
  })

  test('an overhead rate is multiplied by the farm, and forced to a yearly period', async () => {
    // The published figure is $6.11 PER ACRE; the box holds a whole-farm total.
    // Two things have to happen at once or the budget is silently wrong: the
    // rate is multiplied by acres, and the period select is moved to yearly so
    // calcFixed() does not annualise an already-annual figure.
    type('enterprises.0.acres', '500')

    const btn = doc.querySelector('[data-typical="overheadUtilities"]')
    assert.ok(btn, 'the utilities line offers a typical value')
    assert.equal(btn.getAttribute('data-basis-path'), 'fixed.annualBasis.utilities')

    // Start it somewhere it must not be left.
    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'month'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))

    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const corn = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) =>
      /Corn farms/.test(o.textContent)
    )
    assert.ok(corn, 'the corn figure is offered')
    corn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '3055')
    assert.equal(doc.querySelector('[data-path="fixed.annualBasis.utilities"]').value, 'year')
  })

  test('the acres sentinel sums every enterprise, not just the first', async () => {
    type('enterprises.0.acres', '500')
    click('[data-action="add-enterprise"]')
    type('enterprises.1.acres', '300')

    doc
      .querySelector('[data-typical="overheadInsurance"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const corn = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) =>
      /Corn farms/.test(o.textContent)
    )
    corn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    // $12.49 × 800 acres
    assert.equal(doc.querySelector('[data-path="fixed.annual.farmInsurance"]').value, '9992')
  })

  test('an overhead rate with no acres to multiply refuses, and says why', async () => {
    doc
      .querySelector('[data-typical="overheadUtilities"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    // Said ONCE, and in answer to something the producer actually did. It used
    // to be rendered at the top of the body as well, so the same sentence was
    // on screen twice about the same tap.
    const open = doc.querySelector('.overlay.open')
    assert.equal(
      open.textContent.match(/Enter your acres/gi),
      null,
      'nothing is claimed before anything is chosen'
    )

    const corn = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) =>
      /Corn farms/.test(o.textContent)
    )
    corn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const err = doc.querySelector('.modal-err')
    assert.equal(err.hidden, false)
    assert.match(err.textContent, /acres/i)
    assert.ok(err.closest('.modal-head'), 'from the head, where it cannot scroll away')
    assert.equal(
      open.textContent.match(/Enter your acres/gi).length,
      1,
      'and exactly once on the whole panel'
    )
    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '')
  })

  test('the overhead picker shows the acreage it is about to multiply by', async () => {
    type('enterprises.0.acres', '640')
    doc
      .querySelector('[data-typical="overheadDues"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.match(doc.querySelector('.overlay.open').textContent, /640/)
  })

  test('a long picker can be searched, and a match inside a fold is revealed', async () => {
    const btn = doc.querySelector('[data-typical="landRent"]')
    assert.ok(btn, 'land rent offers a typical value')
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const box = doc.querySelector('.typ-search-input')
    assert.ok(box, 'the county list is searchable')

    box.value = 'brookings'
    box.dispatchEvent(new win.Event('input', { bubbles: true }))

    const visible = [...doc.querySelectorAll('.overlay.open .typ-option')].filter((o) => !o.hidden)
    // One county, but it appears once per land type it was published for, and
    // all of them stay on screen. Cropland and pasture rent are different
    // questions and choosing between them is the producer's, not the filter's.
    assert.ok(visible.length >= 2, 'the county is shown for each land type it has')
    for (const o of visible) assert.match(o.textContent, /Brookings County/)
    // The cropland group is a <details>; a match inside a closed one must open it.
    assert.equal(visible[0].closest('.typ-group').hidden, false)
    assert.notEqual(visible[0].closest('details')?.open, false, 'the fold holding the match is open')

    // Groups with nothing in them are hidden outright rather than left as
    // empty headings.
    const emptyGroups = [...doc.querySelectorAll('.overlay.open .typ-group')].filter(
      (g) => !g.hidden && ![...g.querySelectorAll('.typ-option')].some((o) => !o.hidden)
    )
    assert.equal(emptyGroups.length, 0)

    box.value = 'zzzz'
    box.dispatchEvent(new win.Event('input', { bubbles: true }))
    assert.equal(doc.querySelector('.typ-search-empty').hidden, false, 'no match says so')
  })

  test('searching then picking still writes the county rate', async () => {
    doc
      .querySelector('[data-typical="landRent"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const box = doc.querySelector('.typ-search-input')
    box.value = 'brookings'
    box.dispatchEvent(new win.Event('input', { bubbles: true }))

    const hit = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) => !o.hidden)
    hit.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.landRentPerAcre"]').value, '207')
  })

  test('the how-to guide covers saving and comparing scenarios', async () => {
    click('[data-action="how-to"]')
    const body = doc.querySelector('.overlay.open .modal-body').textContent
    assert.match(body, /Duplicate it/i)
    assert.match(body, /Compare/i)
    assert.match(body, /Silage/i)
    assert.match(body, /No-Till/i)
  })
})

describe('saving, duplicating and comparing', () => {
  beforeEach(async () => {
    await boot()
  })

  test('a budget saves and reappears in the saved list', async () => {
    type('name', 'Field corn, conventional')
    await typeCrop('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')

    assert.equal(textOf('#saveState'), SAVED_LABEL)
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelectorAll('.scn').length, 1)
    // The saved list renames in place, so the name is an input's value rather
    // than text content.
    assert.equal(doc.querySelector('.scn-name-input').value, 'Field corn, conventional')
  })

  test('duplicate then compare shows both budgets side by side', async () => {
    type('name', 'Conventional')
    await typeCrop('enterprises.0.crop', 'Soybeans')
    type('enterprises.0.acres', '300')
    type('enterprises.0.yieldPerAcre', '55')
    type('enterprises.0.pricePerUnit', '10.50')
    type('enterprises.0.variable.customHire.perAcre', '60')
    click('[data-action="save-scenario"]')

    click('[data-action="go-scenarios"]')
    click('[data-action="duplicate-scenario"]')

    // The copy is now open; change one thing and save it under a new name.
    type('name', 'No-till')
    type('enterprises.0.variable.customHire.perAcre', '30')
    click('[data-action="save-scenario"]')

    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelectorAll('.scn').length, 2)

    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click('[data-action="compare-selected"]')

    const table = doc.querySelector('.compare-tbl')
    assert.ok(table, 'compare table rendered')
    assert.match(table.textContent, /Conventional/)
    assert.match(table.textContent, /No-till/)
    // Custom hire drops $30/acre, and because it is a preharvest cost the
    // interest carried on it drops too ($30 × 10% × 8/12 = $2). So $32/acre
    // across 300 acres = $9,600 of gross margin.
    assert.match(table.textContent, /9,600/)
  })

  test('deleting a budget removes it', async () => {
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelectorAll('.scn').length, 1)
    click('[data-action="delete-scenario"]')
    assert.equal(doc.querySelectorAll('.scn').length, 0)
  })

  test('removing the last enterprise leaves a blank one, never zero', async () => {
    click('[data-action="remove-enterprise"]')
    assert.equal(doc.querySelectorAll('.ent').length, 1)
  })
})

describe('exports', () => {
  beforeEach(async () => {
    await boot()
  })

  test('CSV carries the figures and the divergence note', async () => {
    const { scenarioToCSV } = await import('../src/export.js')
    const { scenario } = await import('./fixture.js')
    const csv = scenarioToCSV(scenario)

    assert.match(csv, /SDSHC Farm Plan Budget/)
    assert.match(csv, /Total profit,-19140\.83/)
    assert.match(csv, /Corn/)
    assert.match(csv, /Soybeans/)
    assert.match(csv, /equipment interest is included/)
  })

  test('a name that looks like a formula is exported as text, not run', async () => {
    // These files get handed to an instructor, a lender, the rest of the class.
    // Excel, Sheets and LibreOffice all execute a cell starting with = + - or @.
    const { scenarioToCSV } = await import('../src/export.js')
    const csv = scenarioToCSV({
      name: '=HYPERLINK("http://evil","click")',
      enterprises: [{ name: '+SUM(A1:A9)', crop: '-2+3', acres: 100 }],
      fixed: { equipment: [{ name: '@ECHO', initialCost: 1000, usefulLife: 5 }] },
    })
    for (const dangerous of ['=HYPERLINK', '+SUM', '-2+3', '@ECHO']) {
      const cell = csv.split(/[\r\n,]/).find((c) => c.includes(dangerous.replace(/^./, '')))
      assert.ok(cell, `${dangerous} appears in the export`)
      assert.ok(
        cell.startsWith("'") || cell.startsWith('"\''),
        `${dangerous} must be forced to text, got ${cell}`
      )
    }
  })

  test('numbers are NOT quoted, so the export still sums in a spreadsheet', async () => {
    const { scenarioToCSV } = await import('../src/export.js')
    const { scenario } = await import('./fixture.js')
    const csv = scenarioToCSV(scenario)
    // A negative total starts with "-", but it is a number and must stay one —
    // the formula guard applies to text cells only.
    assert.match(csv, /Total profit,-19140\.83/)
    assert.ok(!csv.includes("'-19140"), 'a negative figure was not turned into text')
  })

  test('a budget name with a comma does not break the CSV', async () => {
    const { scenarioToCSV } = await import('../src/export.js')
    const csv = scenarioToCSV({
      name: 'Corn, silage vs "field"',
      enterprises: [],
      fixed: {},
    })
    assert.match(csv, /"Corn, silage vs ""field"""/)
  })
})

/**
 * The results section and the sticky bar are two views of one calculation. They
 * disagreed once — the sticky bar updated on every keystroke while the results
 * cards stayed frozen at the last structural render — and a producer reading
 * one number at the bottom of the screen and a contradictory one in the middle
 * has no way to know which to believe. These lock the two together.
 */
describe('every figure on screen agrees', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the KPI cards move with the sticky bar as revenue is typed', async () => {
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')

    const sticky = textOf('.sticky-bar [data-out="totals.totalProfit"]')
    const kpi = textOf('.kpi [data-out="totals.totalProfit"]')
    assert.equal(kpi, sticky)
    assert.match(kpi, /382,500/, '180 x $4.25 x 500 acres, no costs entered yet')
  })

  test('every whole-farm figure updates without a re-render', async () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.yieldPerAcre', '50')
    type('enterprises.0.pricePerUnit', '10')

    assert.match(textOf('[data-out="totals.totalRevenue"]'), /50,000/)
    assert.match(textOf('[data-out="totals.totalGrossMargin"]'), /50,000/)
    assert.match(textOf('[data-out="totals.revenuePerAcre"]'), /500\.00/)
    assert.equal(textOf('[data-out="totalAcres"]'), '100')
  })

  test('fixed costs reach the results table as they are typed', async () => {
    type('enterprises.0.acres', '200')
    type('fixed.landRentPerAcre', '150')

    assert.match(textOf('[data-out="fixed.landRentTotal"]'), /30,000/)
    assert.match(textOf('[data-out="totals.totalFixed"]'), /30,000/)
    assert.match(textOf('[data-out="totals.totalProfit"]'), /30,000/)
  })

  test('the acres warning clears once acres are entered', async () => {
    assert.match(textOf('.results [data-warnings]'), /Enter acres/)
    type('enterprises.0.acres', '80')
    assert.equal(textOf('.results [data-warnings]'), '')
  })
})

describe('naming an enterprise', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the name is separate from the crop and wins as the label', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(textOf('.ent-name'), 'Corn', 'crop is the fallback label')

    type('enterprises.0.name', 'No-till, east half')
    assert.equal(textOf('.ent-name'), 'No-till, east half')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.crop"]').value,
      'Corn',
      'renaming the column must not touch the crop'
    )
  })

  test('the results table follows the rename without a re-render', async () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.name', 'Silage')
    assert.equal(textOf('[data-ent-label="0"]'), 'Silage')
  })
})

describe('folding cards away', () => {
  beforeEach(async () => {
    await boot()
  })

  test('an enterprise collapses and stays collapsed through a re-render', async () => {
    const card = doc.querySelector('.ent')
    assert.equal(card.classList.contains('collapsed'), false)

    click('.ent [data-action="toggle-enterprise"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), true)

    // Adding a second enterprise re-renders everything; the first must not
    // silently spring open again.
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelectorAll('.ent')[0].classList.contains('collapsed'), true)
  })

  test('adding an enterprise while one is open hands the open card over', async () => {
    // A new budget starts with its single enterprise open.
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), false)

    click('[data-action="add-enterprise"]')
    const cards = doc.querySelectorAll('.ent')
    assert.equal(cards.length, 2)
    assert.equal(cards[0].classList.contains('collapsed'), true)
    assert.equal(cards[1].classList.contains('collapsed'), false)
  })

  test('every open card shuts, not just the last one', async () => {
    click('[data-action="add-enterprise"]')
    // Two open at once, which is the ordinary desktop arrangement.
    doc.querySelectorAll('.ent')[0].querySelector('[data-action="toggle-enterprise"]').click()
    let cards = doc.querySelectorAll('.ent')
    assert.equal(cards[0].classList.contains('collapsed'), false)
    assert.equal(cards[1].classList.contains('collapsed'), false)

    click('[data-action="add-enterprise"]')
    cards = doc.querySelectorAll('.ent')
    assert.equal(cards.length, 3)
    assert.equal(cards[0].classList.contains('collapsed'), true)
    assert.equal(cards[1].classList.contains('collapsed'), true)
    assert.equal(cards[2].classList.contains('collapsed'), false)
  })

  /**
   * Add an enterprise at a chosen width, recording every scrollIntoView.
   *
   * jsdom has no layout, so it implements neither matchMedia nor
   * scrollIntoView. Both are stubbed here and put back afterwards: leaking
   * either into the next test would change what `isNarrow()` answers for the
   * rest of the file.
   */
  function addEnterpriseAt(narrow) {
    const scrolled = []
    const realMatch = globalThis.matchMedia
    globalThis.matchMedia = () => ({ matches: narrow })
    win.Element.prototype.scrollIntoView = function (opts) {
      scrolled.push([this, opts])
    }
    try {
      click('[data-action="add-enterprise"]')
    } finally {
      globalThis.matchMedia = realMatch
      delete win.Element.prototype.scrollIntoView
    }
    return scrolled
  }

  test('on a phone the new card is scrolled to by its top edge', async () => {
    // Stacked cards put a new enterprise below everything already on the page,
    // so without this the press appears to have done nothing at all.
    const scrolled = addEnterpriseAt(true)
    assert.equal(scrolled.length, 1)
    assert.equal(scrolled[0][0], doc.querySelectorAll('.ent')[1], 'the card just added')
    assert.equal(scrolled[0][1].block, 'start', 'landing on its top edge, not its bottom')
  })

  test('a wide screen scrolls nowhere, because the card is a column beside the others', async () => {
    assert.deepEqual(addEnterpriseAt(false), [])
  })

  test('the new card opens even when every other one was already shut', async () => {
    click('.ent [data-action="toggle-enterprise"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), true)

    // Add is a request for a box to type in, so it is answered the same way
    // whatever the page looked like beforehand.
    click('[data-action="add-enterprise"]')
    const cards = doc.querySelectorAll('.ent')
    assert.equal(cards.length, 2)
    assert.equal(cards[0].classList.contains('collapsed'), true)
    assert.equal(cards[1].classList.contains('collapsed'), false)
  })

  test('the shared fixed costs block collapses', async () => {
    click('[data-action="toggle-fixed"]')
    assert.equal(doc.querySelector('.fixed-block').classList.contains('collapsed'), true)
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelector('.fixed-block').classList.contains('collapsed'), true)
  })

  test('folding is not part of the budget, so it never marks it unsaved', async () => {
    click('[data-action="save-scenario"]')
    assert.equal(textOf('#saveState'), SAVED_LABEL)
    click('.ent [data-action="toggle-enterprise"]')
    assert.equal(textOf('#saveState'), SAVED_LABEL)
  })
})

describe('only a real change marks a budget unsaved', () => {
  beforeEach(async () => {
    await boot()
  })

  // The unsaved flag is what makes the browser ask "are you sure you want to
  // leave?" on the way out. An input event that leaves the value where it was
  // is not an edit, and raising the flag over one means the producer is asked
  // to confirm losing work they never did.
  test('an input event that changes nothing leaves the budget saved', async () => {
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')
    assert.equal(textOf('#saveState'), SAVED_LABEL)

    // Same value again, as a focus or an arrow key on a number box produces.
    type('enterprises.0.acres', '500')
    assert.equal(textOf('#saveState'), SAVED_LABEL)
  })

  test('a different value still marks it unsaved', async () => {
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')
    type('enterprises.0.acres', '501')
    assert.equal(textOf('#saveState'), 'Unsaved changes')
  })

  test('the stored number and the box’s string are compared as text', async () => {
    // A typical value writes a real number into the scenario; the input then
    // reports it back as a string. Comparing them loosely is what keeps that
    // round trip from registering as an edit.
    click('[data-action="add-equipment"]')
    type('fixed.equipment.0.initialCost', '200000')
    doc
      .querySelector('[data-typical="salvageValue"][data-target="fixed.equipment.0.salvageValue"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const option = [...doc.querySelectorAll('.overlay.open .typ-option')].find(
      (o) => o.getAttribute('data-value') === '=0.25*initialCost'
    )
    option.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    click('[data-action="save-scenario"]')
    assert.equal(textOf('#saveState'), SAVED_LABEL)

    type('fixed.equipment.0.salvageValue', '50000')
    assert.equal(textOf('#saveState'), SAVED_LABEL)
  })
})

describe('labour and overhead periods', () => {
  beforeEach(async () => {
    await boot()
  })

  function setSelect(path, value) {
    const el = doc.querySelector(`select[data-path="${path}"]`)
    assert.ok(el, `no select for ${path}`)
    el.value = value
    el.dispatchEvent(new win.Event('change', { bubbles: true }))
  }

  test('hours a week become hours a year', async () => {
    type('enterprises.0.acres', '100')
    type('fixed.labor.ratePerHour', '20')
    type('fixed.labor.hours', '10')
    setSelect('fixed.labor.hoursBasis', 'week')

    assert.equal(textOf('[data-out="fixed.totalHoursPerYear"]'), '520')
    assert.match(textOf('[data-out="fixed.laborTotal"]'), /10,400/)
  })

  test('a monthly bill is annualised', async () => {
    type('enterprises.0.acres', '100')
    type('fixed.annual.utilities', '180')
    setSelect('fixed.annualBasis.utilities', 'month')
    assert.match(textOf('[data-out="fixed.annualTotal"]'), /2,160/)
  })

  test('the default period is yearly, so nothing changes until it is chosen', async () => {
    type('enterprises.0.acres', '100')
    type('fixed.annual.utilities', '1200')
    assert.match(textOf('[data-out="fixed.annualTotal"]'), /1,200/)
  })
})

describe('the saved list', () => {
  beforeEach(async () => {
    await boot()
  })

  test('renaming a row saves without opening that budget', async () => {
    type('name', 'Original')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')

    const input = doc.querySelector('.scn-name-input')
    input.value = 'Renamed in the list'
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
    input.dispatchEvent(new win.FocusEvent('blur', { bubbles: true }))

    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('.scn-name-input').value, 'Renamed in the list')
  })

  test('a row name is sized to its text, so the pencil and the tag follow it', async () => {
    // A full-width box put the pencil at the far right of the card and "open"
    // beyond it, so on a short name the three read as three unrelated things
    // scattered across the row instead of one title with its two marks.
    type('name', 'Corn')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')

    // jsdom has no layout, so the mirror measures 0 and every box lands on the
    // floor width. What this proves is that the row is sized AT ALL rather than
    // left to flex — the actual number is a browser's to work out.
    const input = doc.querySelector('.scn-name-input')
    assert.match(input.style.width, /^\d+px$/, 'the box is measured, not left to fill the row')

    // And that the measurement is redone as the name is typed into, so a longer
    // name gets a longer box instead of running off the end of the old one.
    input.style.width = ''
    input.value = 'Corn, conventional tillage, north quarter'
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
    assert.match(input.style.width, /^\d+px$/, 'resized on every keystroke')

    // The tag is the next thing after the name box, not the far side of a row.
    const row = doc.querySelector('.scn-name-row')
    assert.equal(row.children[0].classList.contains('name-edit'), true)
    assert.ok(row.querySelector('.name-edit .edit-icon'), 'the pencil is inside the box')
  })

  test('the budget name is not shown twice on the saved tab', async () => {
    click('[data-action="save-scenario"]')
    assert.ok(doc.querySelector('#scenarioName'), 'shown while building')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('#scenarioName'), null, 'each row carries its own')
  })

  test('the baseline rule is stated where budgets are picked', async () => {
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    // The RULE has to be on screen; the verb it is phrased with is free to
    // change with the rest of the copy.
    assert.match(textOf('.baseline-note').replace(/\s+/g, ' '), /first one you \w+ becomes the\s*baseline/i)
  })

  test('rows can be dragged, and the order survives leaving the tab', async () => {
    type('name', 'First')
    click('[data-action="save-scenario"]')
    for (const name of ['Second', 'Third']) {
      click('[data-action="go-scenarios"]')
      click('[data-action="new-scenario"]') // only exists on the saved tab
      type('name', name)
      click('[data-action="save-scenario"]')
    }
    click('[data-action="go-scenarios"]')

    const list = doc.querySelector('[data-scn-list]')
    const rows = [...list.querySelectorAll('.scn')]
    // Drag the last row to the front, the way the dragover handler would.
    rows[2].dispatchEvent(new win.Event('dragstart', { bubbles: true }))
    list.insertBefore(rows[2], rows[0])
    rows[2].dispatchEvent(new win.Event('dragend', { bubbles: true }))

    const expected = [...list.querySelectorAll('.scn')].map(
      (r) => r.querySelector('.scn-name-input').value
    )
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    const after = [...doc.querySelectorAll('.scn-name-input')].map((i) => i.value)
    assert.deepEqual(after, expected)
  })

  test('the arrows reorder without a mouse, and the ends are disabled', async () => {
    type('name', 'First')
    click('[data-action="save-scenario"]')
    for (const name of ['Second', 'Third']) {
      click('[data-action="go-scenarios"]')
      click('[data-action="new-scenario"]')
      type('name', name)
      click('[data-action="save-scenario"]')
    }
    click('[data-action="go-scenarios"]')

    const names = () => [...doc.querySelectorAll('.scn-name-input')].map((i) => i.value)
    assert.deepEqual(names(), ['Third', 'Second', 'First'], 'newest first to begin with')

    // Nothing above the top row or below the bottom one.
    const rows = doc.querySelectorAll('.scn')
    assert.equal(rows[0].querySelector('[data-action="move-scenario-up"]').disabled, true)
    assert.equal(rows[2].querySelector('[data-action="move-scenario-down"]').disabled, true)

    // :last-of-type, not :last-child — the list now also carries its own
    // empty-section hint, hidden while there are rows in it.
    click('div.scn:last-of-type [data-action="move-scenario-up"]')
    assert.deepEqual(names(), ['Third', 'First', 'Second'])

    // The order is persisted, not just shuffled on screen.
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.deepEqual(names(), ['Third', 'First', 'Second'])
  })

  test('dragging to the edge of the screen scrolls the list', async () => {
    // Without this a budget can only be moved as far as the screen already
    // shows. Getting one from the bottom of a list of thirty to the top would
    // mean drop, scroll, pick up, repeat — which is not a worse version of
    // dragging, it is a different and much worse operation.
    type('name', 'First')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')

    const grip = doc.querySelector('.scn-grip')
    const touch = (kind, props = {}) => {
      const e = new win.MouseEvent(kind, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'pointerType', { value: 'touch' })
      for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v })
      grip.dispatchEvent(e)
      return e
    }
    // The scroll happens in the drag's own frame loop, not in the event — a held
    // finger fires no events at all, and it still has to keep scrolling. So the
    // test waits for a frame exactly as the browser would.
    const frame = () => new Promise((resolve) => win.requestAnimationFrame(resolve))

    // jsdom does not scroll, so stand in for it and record what was asked for.
    const asked = []
    let scrollY = 400
    Object.defineProperty(win, 'scrollY', { get: () => scrollY, configurable: true })
    win.scrollBy = (_x, dy) => {
      asked.push(dy)
      scrollY += dy
    }
    doc.elementFromPoint = () => null

    const bottom = win.innerHeight - 10

    touch('pointerdown', { clientY: bottom })
    await frame()
    // Held at the bottom edge but never moved: a row picked up near the end of a
    // list must not start scrolling before the producer has moved at all.
    assert.deepEqual(asked, [], 'a grab alone does not scroll, however close to the edge')

    touch('pointermove', { clientY: bottom })
    await frame()
    assert.equal(asked.length, 1, 'moving at the bottom edge scrolls')
    assert.ok(asked[0] > 0, 'downwards')

    touch('pointermove', { clientY: 5 })
    await frame()
    assert.ok(asked[asked.length - 1] < 0, 'and at the top edge, upwards')

    // Well inside the page, nothing happens.
    const before = asked.length
    touch('pointermove', { clientY: Math.round(win.innerHeight / 2) })
    await frame()
    assert.equal(asked.length, before, 'the middle of the screen does not scroll')

    touch('pointerup')
  })

  test('the handle reorders by finger, not just by mouse', async () => {
    type('name', 'First')
    click('[data-action="save-scenario"]')
    for (const name of ['Second', 'Third']) {
      click('[data-action="go-scenarios"]')
      click('[data-action="new-scenario"]')
      type('name', name)
      click('[data-action="save-scenario"]')
    }
    click('[data-action="go-scenarios"]')

    const list = doc.querySelector('[data-scn-list]')
    const rows = [...list.querySelectorAll('.scn')]
    const grip = rows[2].querySelector('.scn-grip')
    assert.ok(grip, 'the handle exists at every width, not desktop only')

    const touch = (type, props = {}) => {
      const e = new win.MouseEvent(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'pointerType', { value: 'touch' })
      for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v })
      grip.dispatchEvent(e)
      return e
    }

    const down = touch('pointerdown')
    // The half that was actually broken: unless the gesture is claimed here, the
    // browser turns the first movement into a page scroll and never gives it
    // back. `touch-action: none` on the handle is the other half, in styles.css.
    assert.equal(down.defaultPrevented, true, 'the browser is not left to scroll the page')
    assert.equal(rows[2].classList.contains('dragging'), true, 'the row is picked up')

    // jsdom has no layout, so the row under the finger has to be supplied. A
    // real browser answers this from the coordinates — and crucially it answers
    // with whatever is ON TOP there, which since the lift was added is the
    // dragged row itself: it follows the finger at z-index 2, so it is the
    // topmost element at those coordinates every time. main.js takes it out of
    // the hit test with pointer-events for the duration of the call, and this
    // stub honours that, because a stub that always names some other row cannot
    // fail the way the browser did. Without the fix the row lands back where it
    // started and this test goes red.
    doc.elementFromPoint = () => (rows[2].style.pointerEvents === 'none' ? rows[0] : rows[2])
    touch('pointermove', { clientY: 0 })

    // The move is answered in the drag's own frame, not in the event: a phone
    // reports pointermove faster than it paints, and a held finger reports
    // nothing at all while the page auto-scrolls under it. So the work is
    // coalesced to one update per frame, and the test waits for that frame
    // exactly as the browser would.
    await new Promise((resolve) => win.requestAnimationFrame(resolve))

    assert.deepEqual(
      [...list.querySelectorAll('.scn')].map((r) => r.querySelector('.scn-name-input').value),
      ['First', 'Third', 'Second'],
      'the row follows the finger'
    )

    touch('pointerup')
    assert.equal(rows[2].classList.contains('dragging'), false, 'and is put back down')

    // Saved, not just shuffled on screen.
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.deepEqual(
      [...doc.querySelectorAll('.scn-name-input')].map((i) => i.value),
      ['First', 'Third', 'Second']
    )
  })

  test('opening a budget file explains what one is', async () => {
    click('[data-action="go-scenarios"]')
    const help = doc.querySelector('.open-file .help-btn')
    assert.ok(help, 'the ? sits beside the Open a budget file link')
    help.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.match(doc.querySelector('.modal-body').textContent, /\.json file/)
  })
})

describe('filtering the saved list', () => {
  let saved

  beforeEach(async () => {
    await boot()
    saved = 0
  })

  /** Save one budget per entry, then land on the Saved tab. */
  async function saveBudgets(entries) {
    for (const entry of entries) {
      // The app boots holding one blank budget; every one after that has to be
      // started, and "+ New budget" only exists on the Saved tab.
      if (saved > 0) {
        click('[data-action="go-scenarios"]')
        click('[data-action="new-scenario"]')
      }
      type('name', entry.name)
      if (entry.crop) await typeCrop('enterprises.0.crop', entry.crop)
      if (entry.year) type('scenarioYear', entry.year)
      click('[data-action="save-scenario"]')
      saved += 1
    }
    click('[data-action="go-scenarios"]')
  }

  /** Six budgets: enough for the filter box to appear at all. */
  async function sixBudgets() {
    await saveBudgets([
      { name: 'North quarter', crop: 'Corn' },
      { name: 'South quarter', crop: 'Soybeans' },
      { name: 'Home place', crop: 'Corn' },
      { name: 'Rented ground', crop: 'Spring wheat' },
      { name: 'Creek field', crop: 'Oats' },
      { name: 'Hill pasture', crop: 'Grass hay' },
    ])
  }

  function filterTo(value) {
    const box = doc.querySelector('[data-scn-filter]')
    assert.ok(box, 'there is a filter box')
    box.value = value
    box.dispatchEvent(new win.Event('input', { bubbles: true }))
    return box
  }

  const visible = () =>
    [...doc.querySelectorAll('.scn')]
      .filter((row) => !row.hidden)
      .map((row) => row.querySelector('.scn-name-input').value)

  test('the box is there from the first saved budget, but not before', async () => {
    // A control that materialises partway down a list is one a producer has to
    // notice arriving. Over nothing at all it has nothing to filter.
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('[data-scn-filter]'), null, 'nothing saved, nothing to filter')

    click('[data-action="go-build"]')
    await saveBudgets([{ name: 'One' }])
    assert.ok(doc.querySelector('[data-scn-filter]'), 'and from then on it is always there')
  })

  test('commas collect — a row matching any term stays', async () => {
    await saveBudgets([
      { name: 'North quarter', crop: 'Corn' },
      { name: 'South quarter', crop: 'Soybeans' },
      { name: 'Home place', crop: 'Spring wheat' },
    ])

    filterTo('corn')
    assert.deepEqual(visible(), ['North quarter'], 'one term, as before')

    // OR, not AND: the box assembles a working set. Two crops side by side is
    // the question this answers, and it cannot be asked any other way.
    filterTo('corn, soybeans')
    assert.deepEqual(visible(), ['South quarter', 'North quarter'])

    // Order is not part of it, and a term matching nothing costs nothing.
    filterTo('soybeans, corn')
    assert.deepEqual(visible(), ['South quarter', 'North quarter'])
    filterTo('corn, zzzz')
    assert.deepEqual(visible(), ['North quarter'], 'a dud term drops out quietly')

    // Spaces around a term are not part of it, and a field holding a space is
    // still ONE term — which is why the separator is a comma. Split on
    // whitespace, this would match every budget with "north" or "quarter" in it.
    filterTo('  north quarter ,home  ')
    assert.deepEqual(visible(), ['Home place', 'North quarter'])
  })

  test('an empty term is not a term', async () => {
    await saveBudgets([
      { name: 'North quarter', crop: 'Corn' },
      { name: 'Home place', crop: 'Soybeans' },
    ])

    // Under OR this matters more than it would under AND: '' is a substring of
    // every row, so one stray comma taken as a term shows the whole list back
    // while the box still reads as a filter.
    filterTo('corn,')
    assert.deepEqual(visible(), ['North quarter'])

    // And a box holding only punctuation is not a filter at all — it hides
    // nothing and leaves reordering on.
    filterTo(',,,')
    assert.deepEqual(visible(), ['Home place', 'North quarter'], 'nothing was filtered')
    assert.match(
      textOf('[data-scn-hint-text]'),
      /Reorder the list/,
      'and the list still says the arrows work'
    )

    // The Clear button follows what is IN the box, not what it resolved to.
    // Offering no way to empty a box full of commas would be its own trap.
    assert.equal(doc.querySelector('[data-action="clear-scn-filter"]').hidden, false)
  })

  test('an empty list says every term failed, not just the last one', async () => {
    await saveBudgets([
      { name: 'North quarter', crop: 'Corn' },
      { name: 'Home place', crop: 'Soybeans' },
    ])

    filterTo('zzz, qqq')
    assert.deepEqual(visible(), [])
    const empty = doc.querySelector('[data-scn-empty]')
    assert.equal(empty.hidden, false)
    assert.match(empty.textContent, /matches any of/)

    filterTo('zzz')
    assert.doesNotMatch(empty.textContent, /any of/, 'one term makes no such claim')
  })

  test('the way to add a term is offered while one is running, and then stops', async () => {
    await sixBudgets()

    filterTo('corn')
    assert.match(textOf('[data-scn-hint-text]'), /Separate terms with a comma to match any/)

    // Once they are using commas they have found it, and a standing instruction
    // is one people stop seeing.
    filterTo('corn, oats')
    assert.doesNotMatch(textOf('[data-scn-hint-text]'), /Separate terms/)
    assert.match(textOf('[data-scn-hint-text]'), /Showing 3 of 6/)
  })

  test('the scenario year and the year it was saved are two different filters', async () => {
    // A 2031 plan written today is not a 2026 budget, and a producer reaching
    // for either of those numbers should find it. Nothing derives one from the
    // other, which is the whole reason scenarioYear exists as a stored field.
    await saveBudgets([
      { name: 'North quarter', year: '2031' },
      { name: 'South quarter' },
    ])

    assert.match(textOf('.scn-year'), /2031/, 'and it is printed on the row it can be found by')

    filterTo('2031')
    assert.deepEqual(visible(), ['North quarter'], 'found by the year it is FOR')

    filterTo(String(new Date().getFullYear()))
    assert.equal(visible().length, 2, 'and both are still found by the day they were saved')
  })

  test('a year finds the budgets saved in it', async () => {
    await saveBudgets([{ name: 'North quarter' }, { name: 'South quarter' }])
    const year = String(new Date().getFullYear())

    filterTo(year)
    assert.deepEqual(visible().sort(), ['North quarter', 'South quarter'])

    filterTo(String(Number(year) - 1))
    assert.deepEqual(visible(), [], 'and does not find the ones saved in another')

    // The month is offered the way it is said out loud, not the way the row
    // prints it: "8/5/2026" fed in digit by digit would have "5" return every
    // budget touched on the fifth of a month.
    filterTo(new Date().toLocaleString(undefined, { month: 'long' }))
    assert.equal(visible().length, 2)
  })

  test('typing hides the rows that do not match, without re-rendering', async () => {
    await sixBudgets()
    const box = filterTo('quarter')
    assert.deepEqual(visible().sort(), ['North quarter', 'South quarter'])
    // The box the producer is typing into must survive its own keystroke. A
    // render() here would replace it and take the caret and the mobile keyboard
    // with it.
    assert.equal(doc.querySelector('[data-scn-filter]'), box, 'the same box, not a new one')
    assert.equal(box.value, 'quarter')
  })

  test('a crop finds a budget whose name never mentions it', async () => {
    // "Which of these had soybeans in it" is the actual question, and the
    // budget's own name frequently cannot answer it.
    await sixBudgets()
    filterTo('soybeans')
    assert.deepEqual(visible(), ['South quarter'])
  })

  test('the filter matches named fields, not whatever the row happens to print', async () => {
    // The row also carries an acreage and a profit figure. Matching on rendered
    // text would have "acres" return every budget, and a digit return whichever
    // ones have it somewhere in a dollar amount.
    await sixBudgets()
    filterTo('acres')
    assert.deepEqual(visible(), [], 'the word next to the number is not searchable')
    filterTo('profit')
    assert.deepEqual(visible(), [])
  })

  test('nothing matching says so rather than showing an empty list', async () => {
    await sixBudgets()
    filterTo('alfalfa')
    assert.deepEqual(visible(), [])
    const empty = doc.querySelector('[data-scn-empty]')
    assert.equal(empty.hidden, false)
    assert.match(empty.textContent, /No saved budget matches "alfalfa"/)
  })

  test('reordering is off while filtered, and comes straight back', async () => {
    // Moving a row while most of the list is hidden is an operation whose
    // result the producer cannot see: the arrow swaps it past a budget that is
    // not on screen and appears to do nothing at all.
    await sixBudgets()
    const grips = () => [...doc.querySelectorAll('.scn-grip')]
    const arrows = () => [...doc.querySelectorAll('.scn-move')]

    filterTo('corn')
    assert.equal(
      grips().every((g) => g.draggable === false),
      true,
      'the handle is dead'
    )
    assert.equal(
      arrows().every((a) => a.disabled),
      true,
      'and so are the arrows'
    )
    assert.match(textOf('[data-scn-hint]'), /Showing 2 of 6 budgets\. Reordering is off/)

    click('[data-action="clear-scn-filter"]')
    assert.equal(
      grips().every((g) => g.draggable === true),
      true,
      'the handle works again'
    )
    // The ends stay disabled, because that was never about the filter.
    const up = doc.querySelectorAll('[data-action="move-scenario-up"]')
    const down = doc.querySelectorAll('[data-action="move-scenario-down"]')
    assert.equal(up[0].disabled, true, 'the first row still cannot go up')
    assert.equal(up[1].disabled, false, 'but the second one can')
    assert.equal(down[down.length - 1].disabled, true, 'the last row still cannot go down')
    assert.equal(down[0].disabled, false)
    assert.match(textOf('[data-scn-hint]'), /Reorder the list with the ▲▼ arrows/)
  })

  test('Clear puts every budget back and keeps the ticks', async () => {
    await sixBudgets()
    const tick = (name) => {
      const row = [...doc.querySelectorAll('.scn')].find(
        (r) => r.querySelector('.scn-name-input').value === name
      )
      const box = row.querySelector('[data-compare-id]')
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }

    tick('North quarter')
    filterTo('soybeans')
    click('[data-action="clear-scn-filter"]')

    assert.equal(visible().length, 6)
    assert.equal(doc.querySelector('[data-scn-filter]').value, '')
    // Clearing in place rather than re-rendering is what keeps this true.
    assert.equal(doc.querySelectorAll('[data-compare-id]:checked').length, 1)
  })

  test('a selected budget hidden by the filter is still compared, and says so', async () => {
    // Hiding a row does not untick it: "select two corn budgets, filter to
    // soybeans, select two more" is a real way to build a comparison. But a
    // comparison that quietly contains budgets nobody can see is the failure
    // this app is careful about, so the discrepancy is named on screen.
    await sixBudgets()
    const tickVisible = () => {
      for (const row of doc.querySelectorAll('.scn')) {
        if (row.hidden) continue
        const box = row.querySelector('[data-compare-id]')
        box.checked = true
        box.dispatchEvent(new win.Event('change', { bubbles: true }))
      }
    }

    filterTo('corn')
    tickVisible() // North quarter, Home place
    filterTo('soybeans')
    tickVisible() // South quarter

    const note = doc.querySelector('[data-scn-hidden-note]')
    assert.equal(note.hidden, false)
    // "Not on screen" rather than "hidden by this filter": with folders there
    // are now two ways for a ticked row to be invisible, and the note has to
    // cover a budget folded away inside a shut folder as well.
    assert.match(note.textContent, /2 budgets you have selected are not on screen/)
    assert.match(textOf('[data-action="compare-selected"]'), /Compare 3 budgets/)

    click('[data-action="compare-selected"]')
    assert.match(textOf('.compare .title'), /Comparing 3 budgets/)
  })

  test('hiding a row actually hides it', async () => {
    // Everything else in this block asserts `row.hidden`, and in jsdom that is
    // true the moment the property is set because jsdom loads no CSS at all. In
    // a browser the UA rule `[hidden] { display: none }` is outranked by any
    // author rule that sets a display, and `.scn` is display:flex — so the
    // filter set the attribute on every non-matching row and the list did not
    // change. The stylesheet is the only place this can be proved.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    assert.match(
      css.replace(/\s+/g, ' '),
      /\[hidden\] \{ display: none !important; \}/,
      'the attribute has to be given enough weight to beat .scn and .typ-option'
    )
  })

  test('a budget saved while the list is filtered is never filtered out of sight', async () => {
    // Otherwise the row arrives hidden and the save reads as having failed.
    await sixBudgets()
    filterTo('corn')
    click('[data-action="new-scenario"]')
    type('name', 'Bottom field')
    await typeCrop('enterprises.0.crop', 'Sunflowers')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')

    assert.equal(doc.querySelector('[data-scn-filter]').value, '', 'the box was emptied')
    assert.ok(visible().includes('Bottom field'), 'and the new budget is on screen')
    assert.equal(visible().length, 7)
  })
})

describe('typical values know their units', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the picker states the unit its figures are quoted in', async () => {
    click('[data-typical="customHire"]')
    assert.match(textOf('.modal-unit'), /\$\/acre/)
  })

  test('a $/bu list warns when the line is set to $/ac, then fixes it', async () => {
    // Hauling is quoted per bushel; put the line in $/acre mode first. The pill
    // segments share a data-path, so the one being clicked has to be named.
    click('[data-line="hauling"] .mode-seg[data-mode="perAcre"]')

    click('[data-line="hauling"] [data-typical="hauling"]')
    // The warning has to name BOTH modes: what the figures are quoted in, and
    // what the line is currently set to. Either one alone leaves the producer
    // to work out which way round the mismatch runs.
    const warn = doc.querySelector('.modal-warn').textContent
    // "bu", not "bushel". It is the unit the producer picked in the Unit select
    // beside Yield / acre, and a picker that spells it out differently reads as
    // a different quantity.
    assert.match(warn, /\$\/bu/, 'says what the list is quoted in')
    assert.doesNotMatch(warn, /bushel/i, 'in the same shorthand the yield unit uses')
    assert.match(warn, /\$\/ac/, 'says what the line is set to')
    assert.match(warn, /switch/i, 'says picking one will move the line')

    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    // The value landed in the cost-per-unit box, and the line switched with it.
    const unitInput = doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]')
    assert.ok(unitInput, 'the line is back in $/unit mode')
    assert.equal(Number(unitInput.value) > 0, true)
  })

  test('the offer sits beside the label it belongs to, not below the inputs', async () => {
    const tip = doc.querySelector('[data-line="customHire"] .line-head .tip')
    assert.ok(tip, 'inline with the line label')
    assert.equal(tip.textContent.trim(), 'use typical value')
  })
})

describe('long modals stay put', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the how-to guide opens folded, one heading per section', async () => {
    click('[data-action="how-to"]')
    const folds = doc.querySelectorAll('.modal-body details.def-fold')
    assert.ok(folds.length >= 5, 'every section is its own fold')
    assert.equal([...folds].every((d) => !d.open), true, 'all closed to begin with')
    assert.match(folds[0].querySelector('summary').textContent, /What this calculator does/)
  })

  test('the page behind a modal is frozen while it is open', async () => {
    const { closeModal } = await import('../src/ui/modals.js')
    click('[data-action="how-to"]')
    assert.equal(doc.body.classList.contains('modal-open'), true)
    closeModal()
    assert.equal(doc.body.classList.contains('modal-open'), false)
  })
})

describe('a figure is shown in the units it is actually in', () => {
  beforeEach(async () => {
    await boot()
  })

  // A sentinel renders as a percentage because the salvage-value ones are
  // shares of a sibling field: 0.25 of what you paid is "25%". The overhead
  // sentinels are a RATE multiplied by acres, and the same rule turned $6.11 an
  // acre of utilities into "611%" on the button.
  test('an overhead rate reads as dollars an acre, not as a percentage', async () => {
    type('enterprises.0.acres', '500')
    doc
      .querySelector('[data-typical="overheadUtilities"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const values = [...doc.querySelectorAll('.overlay.open .typ-option .typ-value')].map((v) =>
      v.textContent.trim()
    )
    assert.deepEqual(values, ['$6.11 /acre', '$4.79 /acre'])
    for (const v of values) assert.doesNotMatch(v, /%/, 'a per-acre rate is not a percentage')
  })

  test('a share of a sibling field still reads as a percentage', async () => {
    click('[data-action="add-equipment"]')
    doc
      .querySelector('[data-typical="salvageValue"][data-target="fixed.equipment.0.salvageValue"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const shown = [...doc.querySelectorAll('.overlay.open .typ-option')].find(
      (o) => o.getAttribute('data-value') === '=0.25*initialCost'
    )
    assert.equal(shown.querySelector('.typ-value').textContent.trim(), '25%')
  })
})

describe('changing a yield unit does not silently reinterpret a figure', () => {
  beforeEach(async () => {
    await boot()
  })

  function pickHaulingRate() {
    click('[data-line="hauling"] [data-typical="hauling"]')
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    return doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]').value
  }

  function setUnit(value) {
    const select = doc.querySelector('[data-path="enterprises.0.yieldUnit"]')
    select.value = value
    select.dispatchEvent(new win.Event('change', { bubbles: true }))
  }

  test('a $/bushel figure is cleared when the enterprise moves to tons', async () => {
    const rate = pickHaulingRate()
    assert.ok(Number(rate) > 0, 'the picker wrote a per-bushel rate')

    setUnit('ton')

    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]').value,
      '',
      'a rate per bushel is not that rate per ton, so it does not survive the change'
    )
  })

  test('the producer is told why the figure went, on the card it went from', async () => {
    pickHaulingRate()
    setUnit('ton')

    const notice = doc.querySelector('.ent .unit-notice')
    assert.ok(notice, 'the notice sits on the enterprise that changed')
    assert.match(notice.textContent, /Hauling/i)
    assert.match(notice.textContent, /per bu/i)
    assert.match(notice.textContent, /ton/i)
  })

  test('the notice is shown once and is not part of the budget', async () => {
    pickHaulingRate()
    setUnit('ton')
    assert.ok(doc.querySelector('.unit-notice'))

    // A later structural render is about something else, and repeating it there
    // would make it read as a live problem rather than something that happened.
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('the notice goes when the producer taps into the box it is about', async () => {
    // It explains why a box is empty. Once they are filling that box in it has
    // said everything it has to say, and a paragraph still sitting above them
    // while they type is a standing complaint rather than an explanation.
    pickHaulingRate()
    setUnit('ton')
    const notice = doc.querySelector('.unit-notice')
    assert.ok(notice)
    assert.equal(
      notice.getAttribute('data-notice-for'),
      'enterprises.0.variable.hauling.costPerUnit'
    )

    doc
      .querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]')
      .dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('tabbing past a neighbouring box is not reading the notice', async () => {
    pickHaulingRate()
    setUnit('ton')

    doc
      .querySelector('[data-path="enterprises.0.pricePerUnit"]')
      .dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
    assert.ok(doc.querySelector('.unit-notice'), 'still there')
  })

  test('the overhead notice goes when its own line is tapped into', async () => {
    type('enterprises.0.acres', '500')
    doc
      .querySelector('[data-typical="overheadUtilities"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    ;[...doc.querySelectorAll('.overlay.open .typ-option')]
      .find((o) => /Corn farms/.test(o.textContent))
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'month'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))
    assert.ok(doc.querySelector('.fixed-block .unit-notice'))

    // A different overhead line is not the one that was cleared.
    doc
      .querySelector('[data-path="fixed.annual.misc"]')
      .dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
    assert.ok(doc.querySelector('.fixed-block .unit-notice'), 'not that one')

    doc
      .querySelector('[data-path="fixed.annual.utilities"]')
      .dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('a figure the producer typed themselves is left alone', async () => {
    // The app knows the unit changed. It does not know what the producer meant
    // by the number they typed, so it must not throw it away.
    type('enterprises.0.variable.hauling.costPerUnit', '0.22')
    setUnit('ton')

    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]').value,
      '0.22'
    )
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('an overhead figure is cleared when its period is moved off yearly', async () => {
    // The published FINBIN rate is a full year, and the picker moves the select
    // to "$ / year" to say so. Moving it to "$ / month" afterwards has
    // calcFixed() multiply an already-annual figure by twelve: $3,055 of
    // utilities becomes $36,660, which on a 500-acre farm is a fixed-cost line
    // appearing out of nowhere.
    type('enterprises.0.acres', '500')
    doc
      .querySelector('[data-typical="overheadUtilities"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const corn = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) =>
      /Corn farms/.test(o.textContent)
    )
    corn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '3055')

    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'month'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '')
    const notice = doc.querySelector('.fixed-block .unit-notice')
    assert.ok(notice, 'the notice sits in the block the figure went from')
    assert.match(notice.textContent, /Utilities/)
    assert.match(notice.textContent, /year/)
    assert.match(notice.textContent, /month/)
  })

  test('only the overhead line whose period moved is cleared', async () => {
    type('enterprises.0.acres', '500')
    for (const key of ['overheadUtilities', 'overheadInsurance']) {
      doc.querySelector(`[data-typical="${key}"]`).dispatchEvent(
        new win.MouseEvent('click', { bubbles: true })
      )
      ;[...doc.querySelectorAll('.overlay.open .typ-option')]
        .find((o) => /Corn farms/.test(o.textContent))
        .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    }

    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'quarter'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '')
    // $12.49 × 500 acres, untouched.
    assert.equal(doc.querySelector('[data-path="fixed.annual.farmInsurance"]').value, '6245')
  })

  test('an overhead figure the producer typed is left alone', async () => {
    type('fixed.annual.utilities', '1800')
    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'month'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '1800')
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('a $/acre figure is untouched by a unit change', async () => {
    // Custom Hire is quoted per acre, so bushels or tons makes no difference.
    click('[data-line="customHire"] [data-typical="customHire"]')
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const before = doc.querySelector('[data-path="enterprises.0.variable.customHire.perAcre"]').value
    assert.ok(Number(before) > 0)

    setUnit('cwt')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.customHire.perAcre"]').value,
      before
    )
  })
})

describe('a card `?` is a list of terms, not a wall of prose', () => {
  beforeEach(async () => {
    await boot()
  })

  test('several definitions open as folds, all shut', async () => {
    click('.fixed-block .block-head .help-btn')
    const folds = doc.querySelectorAll('.modal-body details.def-fold')
    assert.ok(folds.length >= 5, 'one fold per definition')
    assert.equal([...folds].every((d) => !d.open), true, 'nothing is open to start with')
  })

  test('a single definition is not folded, because there is nothing to choose', async () => {
    click('[data-info="landRent"]')
    assert.equal(doc.querySelectorAll('.modal-body details.def-fold').length, 0)
    assert.ok(doc.querySelector('.modal-body .def h3'), 'the answer is simply shown')
  })

  test('a multi-section guide opens with every section shut', async () => {
    click('[data-action="how-to"]')
    const folds = doc.querySelectorAll('.modal-body details.def-fold')
    assert.ok(folds.length >= 5)
    assert.equal([...folds].every((d) => !d.open), true)
  })
})

describe('a saved budget is opened from the same row as the rest of its actions', () => {
  beforeEach(async () => {
    await boot()
  })

  test('Open Budget sits first, beside Duplicate and Delete, and opens it', async () => {
    type('name', 'Kept budget')
    type('enterprises.0.acres', '640')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')

    const actions = [...doc.querySelectorAll('.scn-btns button')].map((b) =>
      b.getAttribute('data-action')
    )
    assert.deepEqual(actions, ['open-scenario', 'duplicate-scenario', 'delete-scenario'])
    assert.equal(doc.querySelector('.scn-btns button').textContent.trim(), 'Open Budget')

    // The summary beside it is text, not a hidden second way to open the row.
    assert.equal(doc.querySelector('.scn-meta').tagName, 'SPAN')

    click('.scn-btns [data-action="open-scenario"]')
    assert.equal(doc.querySelector('#scenarioName').value, 'Kept budget')
    assert.equal(doc.querySelector('[data-path="enterprises.0.acres"]').value, '640')
  })
})

describe('a budget opens folded, and a new one opens ready to type in', () => {
  beforeEach(async () => {
    await boot()
  })

  test('a new budget leaves its one enterprise open', async () => {
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), false)
  })

  test('every enterprise of a saved budget arrives folded', async () => {
    type('name', 'Two enterprises')
    click('[data-action="add-enterprise"]')
    await typeCrop('enterprises.1.crop', 'Soybeans')
    click('[data-action="save-scenario"]')

    // Go away and come back, the way a producer does the next morning.
    click('[data-action="go-scenarios"]')
    click('.scn-btns [data-action="open-scenario"]')

    const cards = [...doc.querySelectorAll('.ent')]
    assert.equal(cards.length, 2)
    assert.equal(
      cards.every((c) => c.classList.contains('collapsed')),
      true,
      'opening a farm you already built is not a request to unroll all of it'
    )
  })

  test('a duplicate opens folded too, because it is a farm already built', async () => {
    type('name', 'Original')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    click('[data-action="duplicate-scenario"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), true)
  })

  test('starting a new budget from the saved tab opens its enterprise', async () => {
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    click('[data-action="new-scenario"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), false)
  })
})

describe('a comparison can be handed to somebody', () => {
  beforeEach(async () => {
    await boot()
  })

  async function twoBudgets() {
    type('name', 'Conventional')
    await typeCrop('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')
    click('[data-action="save-scenario"]')

    click('[data-action="go-scenarios"]')
    click('[data-action="new-scenario"]')
    type('name', 'No-till')
    await typeCrop('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '186')
    type('enterprises.0.pricePerUnit', '4.25')
    click('[data-action="save-scenario"]')

    click('[data-action="go-scenarios"]')
    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click('[data-action="compare-selected"]')
  }

  test('the comparison screen offers its own export and print', async () => {
    await twoBudgets()
    assert.ok(doc.querySelector('.compare [data-action="export-compare-csv"]'))
    assert.ok(doc.querySelector('.compare [data-action="print"]'))
  })

  test('the CSV carries every figure on screen, plus the difference', async () => {
    const { compareToCSV } = await import('../src/export.js')
    const { listScenarios } = await import('../src/storage.js')
    await twoBudgets()

    // Explicit order: the saved list is newest-first, and which budget is the
    // baseline decides the sign of every difference in the file.
    const all = listScenarios()
    const ordered = ['Conventional', 'No-till'].map((n) => all.find((s) => s.name === n))
    const csv = compareToCSV(ordered)
    const lines = csv.split('\r\n')

    // Every row of the table is a row of the file — that is the point of the
    // two sharing one list.
    const { COMPARE_ROWS } = await import('../src/ui/scenarios.js')
    for (const row of COMPARE_ROWS) {
      assert.ok(
        lines.some((l) => l.startsWith(row.label)),
        `"${row.label}" is in the export`
      )
    }

    // Each non-baseline budget gets its own difference COLUMN. A merged
    // "value (+123)" cell would read correctly and compute as nothing.
    const header = lines.find((l) => l.startsWith('Figure'))
    assert.match(header, /difference from baseline/)

    const revenue = lines.find((l) => l.startsWith('Total revenue')).split(',')
    assert.equal(revenue.length, 4, 'label, baseline, other budget, difference')
    // 500 × 186 × 4.25 − 500 × 180 × 4.25 = 12750, as a summable number.
    assert.equal(Number(revenue[3]), 12750)
  })

  test('a budget named with a formula cannot execute in the recipient sheet', async () => {
    const { compareToCSV } = await import('../src/export.js')
    type('name', '=HYPERLINK("http://x","click")')
    click('[data-action="save-scenario"]')
    const { listScenarios } = await import('../src/storage.js')
    const csv = compareToCSV(listScenarios())
    assert.match(csv, /'=HYPERLINK/, 'the name is neutralised as text')
  })
})

describe('a folded enterprise can still be taken away', () => {
  beforeEach(async () => {
    await boot()
  })

  test('Remove is reachable without opening the card first', async () => {
    // Adding an enterprise folds the one you were working on, so a card added
    // by mistake leaves a shut card beside it either way round. Reaching
    // Remove must never require opening a card first.
    click('[data-action="add-enterprise"]')
    const folded = doc.querySelectorAll('.ent')[0]
    assert.equal(folded.classList.contains('collapsed'), true)

    const remove = folded.querySelector('[data-action="remove-enterprise"]')
    assert.ok(remove, 'Remove is present on a folded card')
    remove.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.querySelectorAll('.ent').length, 1)
  })
})

describe('folders on the saved tab', () => {
  let saved

  beforeEach(async () => {
    await boot()
    saved = 0
  })

  /** Save one budget per name, then land on the Saved tab. */
  function saveBudgets(names) {
    for (const name of names) {
      if (saved > 0) {
        click('[data-action="go-scenarios"]')
        click('[data-action="new-scenario"]')
      }
      type('name', name)
      click('[data-action="save-scenario"]')
      saved += 1
    }
    click('[data-action="go-scenarios"]')
  }

  /** Drive the folder editor: open it, fill it in, save. */
  function newFolder(name, { icon, color } = {}) {
    click('[data-action="new-folder"]')
    doc.querySelector('#fldName').value = name
    if (icon) click(`[data-icon="${icon}"]`)
    if (color) click(`[data-color="${color}"]`)
    click('.fld-save')
  }

  const rowNamed = (name) =>
    [...doc.querySelectorAll('.scn')].find(
      (r) => r.querySelector('.scn-name-input').value === name
    )

  /**
   * Every section, top to bottom, as "Heading[budget,budget]".
   *
   * A section with no folders on the device has no heading at all, and shows as
   * "[budget,budget]" — the whole point being that there is nothing above the
   * rows to read.
   */
  const shape = () =>
    [...doc.querySelectorAll('.scn-section')].map(
      (s) =>
        `${s.querySelector('.fld-name')?.textContent ?? ''}[${[
          ...s.querySelectorAll('.scn-name-input'),
        ]
          .map((i) => i.value)
          .join(',')}]`
    )

  /** File a budget through the Move modal, by folder name. */
  function moveTo(budget, folderName) {
    rowNamed(budget)
      .querySelector('[data-action="move-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const options = [...doc.querySelectorAll('.fld-option')]
    const wanted = options.find((o) => o.textContent.trim().startsWith(folderName))
    assert.ok(wanted, `the Move modal offers "${folderName}"`)
    for (const o of options) o.querySelector('input').checked = false
    wanted.querySelector('input').checked = true
    click('.fld-save')
  }

  /** A whole mouse drag of `name` into the list belonging to `folderId`. */
  function dragInto(name, folderId) {
    const row = rowNamed(name)
    const list = doc.querySelector(`[data-scn-list][data-folder-id="${folderId}"]`)
    row.querySelector('.scn-grip').dispatchEvent(new win.MouseEvent('dragstart', { bubbles: true }))
    const over = new win.MouseEvent('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(over, 'target', { value: list })
    list.dispatchEvent(over)
    row.dispatchEvent(new win.MouseEvent('dragend', { bubbles: true }))
  }

  const folderIdNamed = (name) =>
    [...doc.querySelectorAll('.scn-section')]
      .find((s) => s.querySelector('.fld-name').textContent === name)
      ?.getAttribute('data-scn-section')

  /** The rows belonging to the folder called `name`, hidden or not. */
  const listNamed = (name) =>
    doc.querySelector(`[data-scn-list][data-folder-id="${folderIdNamed(name)}"]`)

  test('opening a filed budget leaves the folder it came from open', async () => {
    saveBudgets(['North quarter', 'River bottom'])
    newFolder('Rented ground')
    moveTo('North quarter', 'Rented ground')

    // Filing a budget opens its folder, so shut it. This is the state every
    // folder is in on the next visit, which is the case that matters.
    click(`[data-scn-section="${folderIdNamed('Rented ground')}"] .fld-toggle`)
    assert.equal(listNamed('Rented ground').hidden, true, 'shut to start with')

    rowNamed('North quarter')
      .querySelector('[data-action="open-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    click('[data-action="go-scenarios"]')

    assert.equal(listNamed('Rented ground').hidden, false, 'and open on the way back')
  })

  test('the folder opens again on the next visit to the Saved tab', async () => {
    saveBudgets(['North quarter', 'River bottom'])
    newFolder('Rented ground')
    // The last budget saved is the one on the Budget tab.
    moveTo('River bottom', 'Rented ground')

    click(`[data-scn-section="${folderIdNamed('Rented ground')}"] .fld-toggle`)
    assert.equal(listNamed('Rented ground').hidden, true, 'shut')

    // A render on this page must not undo that. Shutting a section is allowed
    // to stick for as long as the producer is looking at it.
    rowNamed('North quarter')
      .querySelector('[data-action="delete-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(listNamed('Rented ground').hidden, true, 'and still shut after a re-render')

    // Leaving and coming back is a fresh look for the budget in hand.
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.equal(listNamed('Rented ground').hidden, false, 'open again on the way back')
  })

  test('the folder holding the reopened budget is open next session, alone', async () => {
    saveBudgets(['North quarter'])
    newFolder('Corn trials')
    newFolder('Rented ground')
    moveTo('North quarter', 'Rented ground')

    // Carry this session's store into the next one. Saving is what records the
    // budget to reopen, so "North quarter" is the one that comes back, and
    // every folder comes back shut.
    const keys = ['sdshc-fb-scenarios', 'sdshc-fb-folders', 'sdshc-fb-last-open']
    const store = keys.map((k) => [k, win.localStorage.getItem(k)])
    await boot((ls) => {
      for (const [k, v] of store) if (v != null) ls.setItem(k, v)
    })
    click('[data-action="go-scenarios"]')

    assert.equal(listNamed('Rented ground').hidden, false, 'the section holding it is open')
    assert.equal(listNamed('Corn trials').hidden, true, 'and no other section is')
  })

  test('a producer who never makes a folder sees the page they had before', async () => {
    // Most producers here keep three to eight budgets and folders are net
    // negative for them, so the cost of the feature to somebody not using it has
    // to be as close to nothing as it can be. One heading, and no fourth button
    // on every row opening a modal with nowhere to move anything to.
    saveBudgets(['North quarter', 'South quarter'])
    // Newest first, which is the order this list has always had.
    assert.deepEqual(shape(), ['[South quarter,North quarter]'])

    // No heading over the list at all. "Not in a folder" above every budget
    // there is, with nothing to contrast it against, is a fold to open and a
    // label answering a question nobody asked — and this is the state most
    // producers here will be in permanently.
    assert.equal(doc.querySelector('.fld-head'), null, 'no section heading')
    assert.equal(doc.querySelector('.fld-chev'), null, 'and nothing to fold')
    assert.equal(doc.querySelectorAll('[data-action="move-scenario"]').length, 0)
    assert.ok(doc.querySelector('[data-action="new-folder"]'), 'but a way in is on the header')

    // The heading arrives with the first folder, because now it means something.
    newFolder('Corn trials')
    assert.deepEqual(shape(), [
      'Not in a folder[South quarter,North quarter]',
      'Corn trials[]',
    ])
  })

  test('a new folder is a section, and Move appears once there is somewhere to go', async () => {
    saveBudgets(['North quarter'])
    newFolder('Corn trials', { icon: 'sprout', color: 'pink' })

    assert.deepEqual(shape(), ['Not in a folder[North quarter]', 'Corn trials[]'])
    assert.equal(doc.querySelectorAll('[data-action="move-scenario"]').length, 1)

    const section = doc.querySelector('[data-scn-section^="fld"]')
    assert.match(section.className, /fld-c-pink/, 'the colour is a token key on the section')
    assert.ok(section.querySelector('.fld-chip svg'), 'and the glyph is inline SVG, not an emoji')
    assert.match(section.querySelector('.fld-empty').textContent, /No budgets in this folder yet/)
  })

  test('the ungrouped pile is at the top, and stays there once it is empty', async () => {
    // "I just saved it and it is gone" is the worst thing an organising feature
    // can do, and a budget saved a moment ago lands in the pile.
    saveBudgets(['North quarter'])
    newFolder('Corn trials')
    assert.equal(shape()[0], 'Not in a folder[North quarter]')

    moveTo('North quarter', 'Corn trials')
    // Emptied, and still on screen: it is the place a budget comes back OUT to,
    // and hiding it would remove the drop target at exactly the moment the
    // producer might want it.
    assert.deepEqual(shape(), ['Not in a folder[]', 'Corn trials[North quarter]'])
    assert.match(textOf('.fld-empty'), /take it back out of a folder/)
  })

  test('deleting the last folder cannot leave the budgets folded out of sight', async () => {
    // Shut the pile while a folder exists, then delete the folder. The pile
    // comes back with no heading — and if it also came back still marked shut,
    // every budget on the device would be behind a control no longer on the
    // page. A section with nothing to unfold it is always open.
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    click('.fld-toggle[data-id=""]')
    assert.equal(
      doc.querySelector('[data-scn-list][data-folder-id=""]').hidden,
      true,
      'the pile folds while there is a heading to fold it with'
    )

    click('[data-action="edit-folder"]')
    click('.fld-delete')

    assert.equal(doc.querySelector('.fld-head'), null, 'no folders, so no heading')
    assert.equal(
      doc.querySelector('[data-scn-list][data-folder-id=""]').hidden,
      false,
      'and the budgets are on screen'
    )
    assert.deepEqual(shape(), ['[South quarter,North quarter]'])
  })

  test('Move files a budget, and the counts follow it', async () => {
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    assert.deepEqual(shape(), ['Not in a folder[South quarter]', 'Corn trials[North quarter]'])
    assert.deepEqual(
      [...doc.querySelectorAll('[data-fld-count]')].map((c) => c.textContent),
      ['1 budget', '1 budget']
    )
  })

  test('a folder made from inside the Move modal is created and chosen in one pass', async () => {
    // Filing into a folder that does not exist yet should not be a trip out to
    // the header and back.
    saveBudgets(['North quarter'])
    newFolder('Corn trials')
    rowNamed('North quarter')
      .querySelector('[data-action="move-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    click('.fld-new')
    doc.querySelector('#fldName').value = 'Soybean trials'
    click('.fld-save')

    // Back in the Move modal, with the folder that was just made selected.
    const picked = doc.querySelector('input[name="fldTarget"]:checked')
    assert.ok(picked, 'something is selected')
    const label = picked.closest('.fld-option').textContent.trim()
    assert.match(label, /Soybean trials/)

    click('.fld-save')
    assert.deepEqual(shape(), ['Not in a folder[]', 'Corn trials[]', 'Soybean trials[North quarter]'])
  })

  test('a folder from a previous session starts shut', async () => {
    // Folders default closed. The one exception is a folder made in this
    // session, which opens so the producer can see what they just made; that is
    // about the moment of creation, not about how folders sit.
    await boot((ls) => {
      ls.setItem(
        'sdshc-fb-folders',
        JSON.stringify([{ id: 'fld-1', name: 'Corn trials', icon: 'wheat', color: 'teal', sortIndex: 0 }])
      )
      ls.setItem(
        'sdshc-fb-scenarios',
        JSON.stringify([
          {
            schemaVersion: 5,
            id: 'scn-1',
            name: 'North quarter',
            folderId: 'fld-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            enterprises: [{ id: 'e1', name: '', crop: 'Corn', acres: 500, variable: {} }],
            fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
          },
        ])
      )
    })
    click('[data-action="go-scenarios"]')

    const section = doc.querySelector('[data-scn-section="fld-1"]')
    const list = section.querySelector('[data-scn-list]')
    const toggle = section.querySelector('.fld-toggle')
    assert.equal(list.hidden, true, 'shut')
    assert.equal(toggle.getAttribute('aria-expanded'), 'false')
    assert.equal(section.querySelector('.fld-count').textContent, '1 budget', 'and it says what is inside')

    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(list.hidden, false)
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  })

  test('folding a section keeps every compare tick', async () => {
    // Folding is a view over the list exactly as the filter box is. A render()
    // here would rebuild every row and throw the selection away.
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click(`.fld-toggle[data-id="${folderIdNamed('Corn trials')}"]`)

    assert.equal(doc.querySelectorAll('[data-compare-id]:checked').length, 2, 'still ticked')
    assert.match(textOf('[data-action="compare-selected"]'), /Compare 2 budgets/)
  })

  test('a budget ticked and then folded out of sight says so', async () => {
    // Two ways to be off screen now — filtered out, and folded away. A
    // comparison quietly containing budgets nobody can see is the failure this
    // app is careful about, so the discrepancy is named either way.
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click(`.fld-toggle[data-id="${folderIdNamed('Corn trials')}"]`)

    const note = doc.querySelector('[data-scn-hidden-note]')
    assert.equal(note.hidden, false)
    assert.match(note.textContent, /1 budget you have selected is not on screen/)
  })

  test('a filter reaches inside a shut folder, and hides one holding nothing', async () => {
    // The land-rent county search hit this exact failure: a search appeared to
    // find nothing while the row sat inside a closed fold.
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')
    const id = folderIdNamed('Corn trials')
    click(`.fld-toggle[data-id="${id}"]`)
    assert.equal(doc.querySelector(`[data-folder-id="${id}"]`).hidden, true, 'shut to start with')

    const box = doc.querySelector('[data-scn-filter]')
    box.value = 'north'
    box.dispatchEvent(new win.Event('input', { bubbles: true }))

    assert.equal(doc.querySelector(`[data-folder-id="${id}"]`).hidden, false, 'forced open')
    assert.equal(rowNamed('North quarter').hidden, false)
    assert.equal(
      doc.querySelector('[data-scn-section=""]').hidden,
      true,
      'and a section with no match goes entirely'
    )

    box.value = ''
    box.dispatchEvent(new win.Event('input', { bubbles: true }))
    assert.equal(
      doc.querySelector(`[data-folder-id="${id}"]`).hidden,
      true,
      'the fold comes back: a search is a question, not a decision about the list'
    )
  })

  test('a filtered folder says how many of its budgets are showing', async () => {
    saveBudgets(['North corn', 'South corn', 'West beans'])
    newFolder('Corn trials')
    moveTo('North corn', 'Corn trials')
    moveTo('South corn', 'Corn trials')
    moveTo('West beans', 'Corn trials')

    const box = doc.querySelector('[data-scn-filter]')
    box.value = 'corn'
    box.dispatchEvent(new win.Event('input', { bubbles: true }))
    // Left alone it would read "3 budgets" over a fold showing two, and nothing
    // would say whether the third was hidden or gone.
    const count = doc.querySelector(`[data-fld-count="${folderIdNamed('Corn trials')}"]`)
    assert.equal(count.textContent, '2 of 3 budgets')
  })

  test('the row arrows move a budget inside its own folder and nowhere else', async () => {
    saveBudgets(['A', 'B', 'C'])
    newFolder('Corn trials')
    moveTo('A', 'Corn trials')
    moveTo('B', 'Corn trials')
    assert.deepEqual(shape(), ['Not in a folder[C]', 'Corn trials[B,A]'])

    // A is last in its folder, so ▼ is dead and ▲ swaps it with B — not with C,
    // which is above it on the page but in another section. Trading ranks with C
    // would move nothing anybody can see.
    const a = rowNamed('A')
    assert.equal(a.querySelector('[data-action="move-scenario-down"]').disabled, true)
    a.querySelector('[data-action="move-scenario-up"]').dispatchEvent(
      new win.MouseEvent('click', { bubbles: true })
    )
    assert.deepEqual(shape(), ['Not in a folder[C]', 'Corn trials[A,B]'])

    // And a budget alone in its section has no neighbour to trade with at all.
    const c = rowNamed('C')
    assert.equal(c.querySelector('[data-action="move-scenario-up"]').disabled, true)
    assert.equal(c.querySelector('[data-action="move-scenario-down"]').disabled, true)
  })

  test('the folder arrows reorder the sections and stop at the ends', async () => {
    saveBudgets(['A'])
    newFolder('First')
    newFolder('Second')
    assert.deepEqual(shape(), ['Not in a folder[A]', 'First[]', 'Second[]'])

    const arrows = [...doc.querySelectorAll('.fld-btns')]
    assert.equal(arrows[0].querySelector('[data-action="move-folder-up"]').disabled, true)
    assert.equal(arrows[1].querySelector('[data-action="move-folder-down"]').disabled, true)

    click('[data-action="move-folder-down"]:not([disabled])')
    assert.deepEqual(shape(), ['Not in a folder[A]', 'Second[]', 'First[]'])
  })

  test('a drag with a shut folder present does not disturb what is inside it', async () => {
    // The bug this feature would otherwise have shipped with. reorderScenarios
    // appends ids it was not given, so a partial order rewrites the rank of
    // every budget the producer cannot see. It is only safe because a shut
    // folder still RENDERS its rows and hides them with CSS.
    saveBudgets(['A', 'B', 'C', 'D'])
    newFolder('Corn trials')
    moveTo('A', 'Corn trials')
    moveTo('B', 'Corn trials')
    const inside = () =>
      [...doc.querySelectorAll(`[data-folder-id="${folderIdNamed('Corn trials')}"] .scn-name-input`)].map(
        (i) => i.value
      )
    const before = inside()
    assert.deepEqual(before, ['B', 'A'])

    click(`.fld-toggle[data-id="${folderIdNamed('Corn trials')}"]`)

    // Reorder the two visible budgets, with the folder shut.
    const c = rowNamed('C')
    const d = rowNamed('D')
    c.querySelector('.scn-grip').dispatchEvent(new win.MouseEvent('dragstart', { bubbles: true }))
    d.parentElement.insertBefore(c, d.nextSibling)
    c.dispatchEvent(new win.MouseEvent('dragend', { bubbles: true }))

    assert.deepEqual(inside(), before, 'the shut folder is exactly as it was')
    assert.deepEqual(shape()[0], 'Not in a folder[D,C]', 'and the visible rows did move')
  })

  test('a drag across a section boundary reorders and re-files in one gesture', async () => {
    saveBudgets(['A', 'B'])
    newFolder('Corn trials')
    const id = folderIdNamed('Corn trials')

    dragInto('A', id)
    assert.deepEqual(shape(), ['Not in a folder[B]', 'Corn trials[A]'])

    // Membership is written, not just the arrangement: it has to survive a
    // reload, and a save from the Budget tab.
    const stored = JSON.parse(win.localStorage.getItem('sdshc-fb-scenarios'))
    assert.equal(stored.find((s) => s.name === 'A').folderId, id)
  })

  test('a budget can be dragged back out of a folder', async () => {
    // The drop target has to still be there afterwards. Emptying the ungrouped
    // pile hides it, and a hidden section cannot be dragged into — which is why
    // a cross-section drop re-renders.
    saveBudgets(['A'])
    newFolder('Corn trials')
    dragInto('A', folderIdNamed('Corn trials'))
    assert.deepEqual(shape(), ['Not in a folder[]', 'Corn trials[A]'])

    dragInto('A', '')
    assert.deepEqual(shape(), ['Not in a folder[A]', 'Corn trials[]'])
  })

  test('comparing still works across two folders', async () => {
    // The reason folders are sections on one page and not a screen you navigate
    // into. Selection lives in the DOM, so navigating would throw it away.
    saveBudgets(['A', 'B'])
    newFolder('First')
    newFolder('Second')
    moveTo('A', 'First')
    moveTo('B', 'Second')

    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click('[data-action="compare-selected"]')
    assert.match(textOf('.compare .title'), /Comparing 2 budgets/)
  })

  test('a duplicate lands in the same folder as the budget it came from', async () => {
    saveBudgets(['North quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    rowNamed('North quarter')
      .querySelector('[data-action="duplicate-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    click('[data-action="go-scenarios"]')

    assert.deepEqual(shape(), ['Not in a folder[]', 'Corn trials[North quarter (copy),North quarter]'])
  })

  test('an imported budget lands in no folder', async () => {
    // An exported file carries no folder, and an id from another device means
    // nothing here.
    saveBudgets(['North quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    const stored = JSON.parse(win.localStorage.getItem('sdshc-fb-scenarios'))[0]
    const { importScenarioJSON } = await import(`../src/storage.js?bust=${Math.random()}`)
    const result = importScenarioJSON(JSON.stringify(stored))
    assert.equal(result.ok, true)
    assert.equal(result.scenario.folderId, undefined)
  })

  test('a folder with an icon and colour this version has never heard of still draws', async () => {
    // The state after a hand-edited file, and after a future version writes a
    // token this one does not know. Same rule as perYearFactor() returning 1 for
    // an unrecognised basis: fall back, never crash and never render nothing.
    return boot((ls) => {
      ls.setItem(
        'sdshc-fb-folders',
        JSON.stringify([{ id: 'fld-1', name: 'From the future', icon: 'banana', color: '#ff0000', sortIndex: 0 }])
      )
    }).then(() => {
      click('[data-action="go-scenarios"]')
      // Nothing saved yet, so no list — make one so the sections render.
      click('[data-action="go-build"]')
      type('name', 'North quarter')
      click('[data-action="save-scenario"]')
      click('[data-action="go-scenarios"]')

      const section = doc.querySelector('[data-scn-section="fld-1"]')
      assert.ok(section, 'the folder is on screen')
      assert.match(section.className, /fld-c-grey/, 'an unknown colour falls back to the neutral')
      assert.ok(section.querySelector('.fld-chip svg'), 'and an unknown glyph to the plain folder')
      assert.equal(section.querySelector('.fld-name').textContent, 'From the future')
    })
  })

  test('a budget filed in a folder that no longer exists is drawn, not lost', async () => {
    // The pile is built as "everything no section claimed", NOT "everything with
    // no folderId". Those differ in exactly this case, and the other definition
    // would put this budget in a section that is never rendered.
    return boot((ls) => {
      ls.setItem(
        'sdshc-fb-scenarios',
        JSON.stringify([
          {
            schemaVersion: 5,
            id: 'scn-1',
            name: 'Orphan',
            folderId: 'fld-deleted-in-another-tab',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            enterprises: [{ id: 'e1', name: '', crop: 'Corn', acres: 500, variable: {} }],
            fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
          },
        ])
      )
    }).then(() => {
      click('[data-action="go-scenarios"]')
      // No folders on this device at all, so no heading either — the budget is
      // simply in the list, which is the honest rendering of "filed in nothing".
      assert.deepEqual(shape(), ['[Orphan]'])
    })
  })

  test('a shut folder prints expanded', async () => {
    // Paper has no chevron to tap, so a printed list that silently leaves out
    // half the budgets is a wrong document. This has to out-specify
    // `[hidden] { display: none !important }`, which is why the rule carries
    // both the attribute selector and its own !important — jsdom loads no CSS,
    // so the stylesheet source is the only thing that can be asserted.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    const print = css.slice(css.indexOf('@media print'))
    assert.match(print, /\.scn-list\[hidden\]\s*\{\s*display:\s*grid\s*!important/)
    // And a row hidden by the FILTER stays hidden, where the hint line explains
    // why. Forcing `.scn[hidden]` open would print budgets the producer filtered
    // out and left off the page on purpose.
    assert.equal(/\.scn\[hidden\]/.test(print), false)
  })
})

describe('the folder palette and glyph set', () => {
  // Read the module directly. These are facts about the two lists and the
  // stylesheet that has to keep up with them, and neither needs an app booted.
  let FOLDER_ICONS
  let FOLDER_COLORS
  let css

  beforeEach(async () => {
    ;({ FOLDER_ICONS, FOLDER_COLORS } = await import(
      `../src/ui/folders.js?bust=${Math.random()}`
    ))
    css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  })

  test('there are as many glyphs as there are colours', async () => {
    // The editor lays them out as two rows of the same width and they read as a
    // matched pair. Twelve and nine would look like one of them failed to load.
    assert.equal(FOLDER_ICONS.length, FOLDER_COLORS.length)
    assert.equal(FOLDER_ICONS.length, 12)
  })

  test('every colour has its class and both its theme values', async () => {
    // The one failure in this feature that nothing warns you about: a key in
    // FOLDER_COLORS with no `.fld-c-<key>` class renders with no colour at all —
    // no error, no fallback, just a chip the same shade as the card. jsdom loads
    // no CSS, so the stylesheet source is the only place this can be checked.
    // Anchored to the start of a line, so the mention of the selector inside
    // the token block's own comment does not get taken for the rule itself.
    const darkAt = css.search(/^\[data-theme="dark"\]/m)
    assert.ok(darkAt > 0, 'there is a dark theme block')
    const light = css.slice(0, darkAt)
    const dark = css.slice(darkAt, css.indexOf('\n}', darkAt))

    for (const key of FOLDER_COLORS) {
      assert.match(
        css,
        new RegExp(`\\.fld-c-${key}\\s*\\{`),
        `${key} has no .fld-c-${key} class, so it would render uncoloured`
      )
      // Blue and green are deliberately their OWN values rather than --sky and
      // --olive: a folder colour is a label the producer chose, and it should
      // not read as the app's chrome or move if the brand ever does.
      assert.match(light, new RegExp(`--fld-${key}:`), `${key} has no ink`)
      assert.match(light, new RegExp(`--fld-${key}-bg:`), `${key} has no light wash`)
      assert.match(dark, new RegExp(`--fld-${key}-bg:`), `${key} has no dark wash`)

      // The ink is NOT overridden for dark, and that is the point rather than an
      // omission: every other colour token in the file flips between themes, and
      // these twelve deliberately do not, so a producer who made the pink folder
      // finds a pink folder in either theme. Only the wash behind it changes.
      assert.equal(
        new RegExp(`--fld-${key}:`).test(dark),
        false,
        `${key} is overridden for dark, so the folder changes colour with the theme`
      )
    }
  })

  test('red is not on offer, under any of its names', async () => {
    // --green means a positive dollar figure and --cost a negative one. A red
    // folder mark on a page whose every row prints a profit or a loss re-opens
    // the question the palette exists to settle. Pink sits next to red on the
    // wheel and carries none of it.
    for (const forbidden of ['red', 'crimson', 'scarlet', 'ruby']) {
      assert.equal(FOLDER_COLORS.includes(forbidden), false, `${forbidden} is on offer`)
    }
  })

  test('the fold caret is drawn, never typed', async () => {
    // `.chev` builds the caret out of two borders of a rotated box. A ▾ put
    // inside it as well renders a second caret roughly twice the size,
    // underneath the real one — which shipped once and looked like a bug in the
    // font. The span stays empty and the direction comes off aria-expanded.
    return boot().then(() => {
      type('name', 'North quarter')
      click('[data-action="save-scenario"]')
      click('[data-action="go-scenarios"]')
      // A folder has to exist before anything has a heading to fold.
      click('[data-action="new-folder"]')
      doc.querySelector('#fldName').value = 'Corn trials'
      click('.fld-save')

      const chev = doc.querySelector('.fld-chev')
      assert.ok(chev, 'the section has a caret')
      assert.equal(chev.textContent.trim(), '', 'and it carries no glyph of its own')
      assert.match(css, /\.fld-toggle\[aria-expanded="false"\] \.fld-chev/)
    })
  })

  test('the ink on an olive fill is its own token, in both themes', async () => {
    // The selected segment of a mode pill is filled with --olive, which is a
    // light yellow-green. White on it is 2.0:1 and unreadable, and --on-sky IS
    // white — so reaching for it is the mistake --on-olive exists to prevent.
    //
    // It has to be overridden in the dark block for the opposite reason to
    // every other token here: --olive gets LIGHTER in dark mode, so its ink has
    // to go darker. --brown, which it resolves to in light mode, becomes a
    // light warm off-white there and would all but disappear.
    //
    // jsdom loads no CSS, so this has nowhere else to live.
    assert.match(css, /--on-olive:/, 'the token exists')
    const dark = css.slice(css.indexOf('[data-theme="dark"]'))
    assert.match(
      dark.slice(0, dark.indexOf('}')),
      /--on-olive:/,
      'and the dark theme sets its own, rather than inheriting a light one'
    )
    assert.match(css, /\.mode-seg\[aria-pressed='true'\][^}]*var\(--on-olive\)/s)
  })

  test('the mode pill is pinned to the height of the button it replaced', async () => {
    // Fifteen of these per enterprise, so a few pixels of drift is a screenful.
    // The height is declared rather than left to fall out of three segments
    // plus a container border.
    assert.match(css, /--pill-h:\s*\d+px/)
    assert.match(css, /\.mode-pill[^}]*height:\s*var\(--pill-h\)/s)
  })
})

describe('markup written as template literals', () => {
  // Every screen in this app is a template literal, and the comments explaining
  // the awkward bits are HTML comments INSIDE those literals. A backtick in one
  // ends the literal early, and what follows is parsed as JavaScript — so a
  // comment about `.chev` took the whole saved list down, and a comment about
  // `.block-head` did it again two weeks later.
  //
  // Both times the smoke tests caught it, as a hundred and twenty failures
  // saying nothing about the cause. This one names it.
  test('no HTML comment carries a backtick', async () => {
    const roots = [new URL('../src/', import.meta.url), new URL('../src/ui/', import.meta.url)]

    let checked = 0
    for (const dir of roots) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.js')) continue
        const src = readFileSync(new URL(name, dir), 'utf8')
        for (const [whole] of src.matchAll(/<!--[\s\S]*?-->/g)) {
          checked += 1
          assert.equal(
            whole.includes('`'),
            false,
            `${name}: an HTML comment contains a backtick, which ends the ` +
              `template literal it sits in. Say it without the backticks:\n${whole.slice(0, 160)}`
          )
        }
      }
    }
    assert.ok(checked > 10, 'the scan actually found comments to check')
  })
})

describe('the one field that fills itself', () => {
  // Seeds-per-unit is the single exception to "nothing auto-fills", and every
  // test here is about a guard rather than about the filling. The reason it
  // exists: corn ships in 80,000-seed bags and soybeans in 140,000-seed units,
  // so a soybean budget left on corn's bag size is out by a factor of 1.75 with
  // an entirely ordinary number on the screen.
  beforeEach(async () => {
    await boot()
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
  })

  const seedsBox = () => doc.querySelector('[data-path="enterprises.0.variable.seed.seedsPerBag"]')
  const note = () => doc.querySelector('[data-line="seed"] .field-note')

  test('an empty box is filled from the crop, and says where it came from', async () => {
    assert.equal(seedsBox().value, '', 'nothing is filled in before a crop is named')
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(seedsBox().value, '80000')
    assert.match(note().textContent, /filled in from "Corn"/)
  })

  test('a crop nobody has a published rate for gets nothing', async () => {
    // Guessing here would be worse than leaving it blank: a wrong denominator
    // is a silently wrong seed cost, and a blank one computes as $0 and shows a
    // warning naming the box.
    await typeCrop('enterprises.0.crop', 'Sorghum')
    assert.equal(seedsBox().value, '')
    assert.equal(note(), null)
  })

  test('two letters of a crop name do not fill anything in', async () => {
    await typeCrop('enterprises.0.crop', 'Co')
    assert.equal(seedsBox().value, '', 'a prefix is not a match')
  })

  test('a figure the producer typed is never overwritten', async () => {
    // THE guard. The app knows the crop changed; it does not know what they
    // meant by the number, and overwriting it would be destroying work.
    type('enterprises.0.variable.seed.seedsPerBag', '78000')
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(seedsBox().value, '78000')
    assert.equal(note(), null, 'and no caption claims the app put it there')
  })

  test('typing in the box takes it over, and the crop stops driving it', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(seedsBox().value, '80000')

    type('enterprises.0.variable.seed.seedsPerBag', '78000')
    assert.equal(note(), null, 'the caption goes as soon as the box is theirs')

    await typeCrop('enterprises.0.crop', 'Soybeans')
    assert.equal(seedsBox().value, '78000', 'the crop no longer drives the box')
  })

  test('the caption is removed without re-rendering the card', async () => {
    // render() would rebuild the card and take the focus out of the input they
    // are mid-keystroke in, which is the rule updateOutputs() exists for.
    await typeCrop('enterprises.0.crop', 'Corn')
    const box = seedsBox()
    box.focus()
    type('enterprises.0.variable.seed.seedsPerBag', '78000')
    assert.equal(doc.activeElement, box, 'focus stayed in the box being typed in')
  })

  test('while the number is still ours, changing the crop revises it', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(seedsBox().value, '80000')
    await typeCrop('enterprises.0.crop', 'Soybeans')
    assert.equal(seedsBox().value, '140000')
    assert.match(note().textContent, /Soybeans/)
  })

  test('a crop cleared to something unrecognised drops what we put there', async () => {
    // A stale 80,000 sitting under a crop the app can no longer vouch for is
    // worse than a blank box, which computes as $0 and says so.
    await typeCrop('enterprises.0.crop', 'Corn')
    await typeCrop('enterprises.0.crop', 'Sunflower')
    assert.equal(seedsBox().value, '')
    assert.equal(note(), null)
  })

  test('the population figure reaches the same cost as the fraction of a bag', async () => {
    type('enterprises.0.acres', '100')
    await typeCrop('enterprises.0.crop', 'Corn')
    type('enterprises.0.variable.seed.costPerBag', '285')
    type('enterprises.0.variable.seed.population', '33000')
    // 33,000 / 80,000 = 0.4125 of a bag at $285.
    assert.equal(textOf('[data-out="enterprises.0.lines.seed"]'), '$117.56')
  })
})

describe('a picker whose groups are quoted in different units', () => {
  beforeEach(async () => {
    await boot()
  })

  test('each list says which unit it is in, and the banner does not claim one', async () => {
    // Phosphorus is published both as a price per pound and as a cost per acre.
    // One banner at the top cannot be true of both lists.
    click('[data-line="phosphorus"] [data-typical="phosphorus"]')
    assert.doesNotMatch(textOf('.modal-unit'), /\$\/lb|\$\/acre/)

    const units = [...doc.querySelectorAll('.typ-group-unit')].map((p) => p.textContent)
    assert.ok(units.length >= 2, 'every group states its own unit')
    assert.ok(units.some((u) => /\$\/lb/.test(u)))
    assert.ok(units.some((u) => /\$\/acre/.test(u)))
  })

  test('a value lands in the box ITS OWN group belongs in', async () => {
    // The bug this prevents: resolving the destination once for the whole modal
    // puts a per-acre figure into the cost-per-unit box, where it is multiplied
    // by the rate a second time.
    click('[data-line="phosphorus"] [data-typical="phosphorus"]')
    const groups = [...doc.querySelectorAll('.typ-group')]

    // The per-acre group. The line starts in $/unit, so this also switches it.
    const perAcre = groups.find((g) => /Cost per acre/.test(g.textContent))
    perAcre.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.equal(
      doc.querySelector('[data-line="phosphorus"] .mode-seg[aria-pressed="true"]').dataset.mode,
      'perAcre'
    )
    assert.equal(doc.querySelector('[data-path="enterprises.0.variable.phosphorus.perAcre"]').value, '47.69')
  })

  test('the mismatch warning sits on the group it is about', async () => {
    // With the line in $/unit, the price-per-pound list needs no warning and
    // the cost-per-acre list below it does. One banner could not say both.
    click('[data-line="phosphorus"] [data-typical="phosphorus"]')
    const groups = [...doc.querySelectorAll('.typ-group')]
    const perLb = groups.find((g) => /Cost per pound/.test(g.textContent))
    const perAcre = groups.find((g) => /Cost per acre/.test(g.textContent))

    assert.equal(perLb.querySelector('.modal-warn'), null, 'the matching list is not warned about')
    assert.ok(perAcre.querySelector('.modal-warn'), 'the mismatched one is')
  })

  test('a mismatch warning names the mode the line is actually in', async () => {
    // modeName() was a two-way ternary and described a line set to "population"
    // as "$/unit × units". A warning that misnames one of the two things it is
    // comparing is worse than no warning, because it is the sentence a producer
    // would rely on to decide.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
    click('[data-line="seed"] [data-typical="seed"]')
    const warn = [...doc.querySelectorAll('.modal-warn')].map((w) => w.textContent).join(' ')
    // And it names it in the SAME words the pill uses, because the sentence is
    // telling the producer to go and look at that pill.
    assert.match(warn, /set to\s+seeds\/ac/i)
    assert.doesNotMatch(warn, /set to\s+\$\/unit/i)

    const pressed = doc.querySelector('[data-line="seed"] .mode-seg[aria-pressed="true"]')
    assert.equal(pressed.textContent.trim(), 'seeds/ac', 'the pill says the same thing')
  })

  test('a bare count is printed with separators', async () => {
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
    click('[data-line="seed"] [data-typical="seedsPerBag"]')
    const values = [...doc.querySelectorAll('.typ-value')].map((v) => v.textContent)
    assert.ok(values.includes('80,000'), `expected a formatted count, got ${values.join(', ')}`)
    assert.ok(values.includes('140,000'))
  })
})

describe('where the data lives is said, not only linked', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the footer states it in one sentence on every screen', async () => {
    // A producer typing their yields, prices, and land rent into a web page at
    // a workshop is entitled to know where it goes without going looking.
    for (const action of ['go-build', 'go-scenarios']) {
      click(`[data-action="${action}"]`)
      const line = doc.querySelector('.footer-privacy')
      assert.ok(line, `the ${action} screen states it`)
      assert.match(line.textContent, /stays on this device/i)
    }
  })

  test('the link opens the full explanation and writes nothing', async () => {
    click('.footer-privacy [data-info="privacy"]')
    const body = textOf('.overlay.open .modal-body')
    assert.match(body, /not sent anywhere/i)
    assert.match(body, /cannot see your budgets/i)
    assert.match(body, /clearing your browsing data/i)
    assert.match(body, /Save budget file/i, 'and says how to move one on purpose')
    assert.equal(
      doc.querySelectorAll('.overlay.open .typ-option').length,
      0,
      'it is a definition, not a picker'
    )
  })

  test('the how-to guide gives it its own heading', async () => {
    click('[data-action="how-to"]')
    const headings = [...doc.querySelectorAll('.modal-body summary')].map((s) => s.textContent)
    assert.ok(
      headings.some((h) => /Where your budgets live/i.test(h)),
      `expected a privacy heading, got: ${headings.join(' | ')}`
    )
  })

  test('the sentence survives printing, the link does not', async () => {
    // A budget handed to a lender still carries the statement, and it is true
    // on paper. `.footer button` is what the print block hides.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    const print = css.slice(css.indexOf('@media print'))
    assert.match(print, /\.footer button/)
    assert.doesNotMatch(print, /\.footer-privacy\s*\{[^}]*display:\s*none/)
  })
})

describe('naming corn or soybeans opens the seeds/ac mode', () => {
  beforeEach(async () => {
    await boot()
  })

  const pressed = () =>
    doc.querySelector('[data-line="seed"] .mode-seg[aria-pressed="true"]')?.dataset.mode

  test('a new budget starts on the sheet’s own mode', async () => {
    assert.equal(pressed(), 'unit')
  })

  test('typing a crop this app knows opens it', async () => {
    // Population is how corn and soybean seed is bought and quoted. Working out
    // a fraction of a bag is the arithmetic this mode exists to remove, and a
    // producer who has to find the mode first mostly will not.
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(pressed(), 'population')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.seedsPerBag"]').value,
      '80000',
      'and the denominator is filled in with it'
    )
  })

  test('a crop with no published seeding rate does not', async () => {
    await typeCrop('enterprises.0.crop', 'Sorghum')
    assert.equal(pressed(), 'unit')
  })

  test('a line somebody has already typed in is left where it is', async () => {
    // THE guard. The mode decides which boxes exist, so switching it out from
    // under an entered figure hides that figure — it is still stored, which
    // makes it worse rather than better, because nothing on screen says where
    // it went.
    type('enterprises.0.variable.seed.costPerUnit', '320')
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.equal(pressed(), 'unit', 'the mode did not move')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.costPerUnit"]').value,
      '320',
      'and the figure is still on screen'
    )
  })

  test('a mode the producer chose themselves is left alone', async () => {
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="perAcre"]')
    type('enterprises.0.variable.seed.perAcre', '125')
    await typeCrop('enterprises.0.crop', 'Soybeans')
    assert.equal(pressed(), 'perAcre')
  })

  test('opening the mode brings the seeds-per-unit offer with it', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    const offers = [...doc.querySelectorAll('[data-line="seed"] .tip[data-typical="seedsPerBag"]')]
    assert.equal(offers.length, 2, 'one copy for each width — see renderLine()')
    for (const el of offers) {
      assert.equal(el.dataset.target, 'enterprises.0.variable.seed.seedsPerBag')
    }
    assert.ok(
      doc.querySelector('[data-path="enterprises.0.variable.seed.seedsPerBag"]'),
      'and the box they fill is on the line'
    )
  })

  test('the caption stays under the whole line, below both offers', async () => {
    // The OFFER moved. The CAPTION did not, and the two are different things:
    // the offer is a control belonging to one box, the caption is a sentence
    // about a figure that is already there. Inside the row of boxes it squeezed
    // three number inputs into two columns' worth of width.
    await typeCrop('enterprises.0.crop', 'Corn')
    const note = doc.querySelector('[data-line="seed"] .field-note')
    assert.ok(note, 'the caption is on the seed line')
    assert.match(note.textContent, /filled in from/i)
    assert.equal(note.closest('.line-inputs'), null, 'not inside the row of boxes')
    assert.equal(note.closest('.line-head'), null, 'nor up in the label row')
    assert.equal(note.parentElement.dataset.line, 'seed', 'it is a child of the line itself')

    // The phone copy of the offer is the row directly above it, which is what
    // "in the row above the field-note text" means.
    assert.ok(
      note.previousElementSibling.classList.contains('seeds-link-row'),
      'and the offer is the row above it'
    )
  })
})

describe('the baseline note can be put away', () => {
  async function withOneBudget() {
    await boot()
    type('name', 'North quarter')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
  }

  test('it is there to begin with, and says what a baseline is', async () => {
    await withOneBudget()
    assert.match(textOf('.baseline-note'), /first one you select becomes the/i)
  })

  test('dismissing it removes it without rebuilding the list', async () => {
    await withOneBudget()
    // A render here would throw away every compare tick on the page, which is
    // the same rule the filter box follows.
    const list = doc.querySelector('.scn-list')
    click('[data-action="dismiss-note"]')
    assert.equal(doc.querySelector('.baseline-note'), null)
    assert.equal(doc.querySelector('.scn-list'), list, 'the list is the same node')
  })

  test('it stays gone on the next visit, and the next session', async () => {
    await withOneBudget()
    click('[data-action="dismiss-note"]')

    // Away and back: a re-render must not bring it home again.
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('.baseline-note'), null, 'survives a render')

    // A note explaining a feature is read once. Showing it again tomorrow is
    // the behaviour the button exists to stop, so the preference persists.
    assert.match(localStorage.getItem('sdshc-fb-dismissed') ?? '', /baseline/)
  })
})

describe('units read the same everywhere they are shown', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the pill abbreviates, the box does not, and both are deliberate', async () => {
    // A pill segment is one of three sharing a row with a label and a "use
    // typical value" link on a 360px screen, and it is what gives when any of
    // them grows. A placeholder has the whole box to itself, so there is no
    // reason to make a producer expand an abbreviation to read it. The in-box
    // affix goes back to the short form because by then it is sharing the box
    // with a figure — the same reason the labor-rate field says "/hr".
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="perAcre"]')
    assert.equal(
      doc.querySelector('[data-line="seed"] .mode-seg[aria-pressed="true"]').textContent.trim(),
      '$/ac'
    )
    const box = doc.querySelector('[data-path="enterprises.0.variable.seed.perAcre"]')
    assert.equal(box.placeholder, '$/acre')
    assert.equal(box.closest('.in-box').querySelector('.in-post').textContent, '/ac')
  })

  test('nothing user-facing spells out "bushel"', async () => {
    // The yield-unit select offers "bu", so a picker that spells it out reads
    // as a different quantity. Checked across every spec's own strings.
    for (const [key, spec] of Object.entries(TYPICAL_VALUES)) {
      const text = [
        spec.unit,
        spec.note ?? '',
        ...spec.groups.map((g) => `${g.label} ${g.unit ?? ''}`),
        ...spec.groups.flatMap((g) => g.options.map((o) => `${o.label} ${o.desc ?? ''}`)),
      ].join(' ')
      assert.doesNotMatch(text, /bushel/i, `${key} spells out "bushel"`)
    }
  })
})

describe('a picker opens as a list of headings', () => {
  beforeEach(async () => {
    await boot()
  })

  test('every fold starts shut, including the first', async () => {
    // Same rule openInfo() holds for a card's definitions: when a modal opens
    // folded, the list of headings is itself the answer to "what is on offer
    // here?", and one group left open pushes the rest below the fold on a
    // phone so the list stops being a list.
    click('[data-line="customHire"] [data-typical="customHire"]')
    const folds = [...doc.querySelectorAll('.typ-group.typ-fold')]
    assert.ok(folds.length > 2, 'this picker folds its groups')
    assert.equal(
      folds.some((d) => d.open),
      false,
      'none of them is open'
    )
  })
})

describe('the offer to upload a budget file rides with the hint', () => {
  async function withOneBudget() {
    await boot()
    type('name', 'North quarter')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
  }

  test('it reads on from the end of the sentence, and is not a separate action', async () => {
    await withOneBudget()
    const hint = doc.querySelector('[data-scn-hint]')
    assert.match(hint.textContent, /organize your budgets into folders\.\s*You can also/)
    assert.ok(
      hint.querySelector('[data-action="import-scenario"]'),
      'the control itself is in the hint'
    )
    assert.ok(hint.querySelector('.help-btn[data-info="budgetFile"]'), 'and so is its question mark')

    // Not beside Compare any more. A lone link there read as an action of the
    // same weight as comparing budgets, which is the one thing this screen is
    // actually for.
    assert.equal(
      doc.querySelector('.scn-actions [data-action="import-scenario"]'),
      null,
      'and not next to the Compare button'
    )
  })

  test('typing in the filter box cannot delete it', async () => {
    await withOneBudget()
    // applyScenarioFilter() rewrites the hint on every keystroke. It has to
    // address the TEXT, not the paragraph, or the first character typed takes
    // the import control off the page with it.
    const filter = doc.querySelector('[data-scn-filter]')
    filter.value = 'zzz'
    filter.dispatchEvent(new win.Event('input', { bubbles: true }))

    const hint = doc.querySelector('[data-scn-hint]')
    assert.match(hint.textContent, /Showing 0 of 1 budget/, 'the sentence was rewritten')
    assert.ok(
      hint.querySelector('[data-action="import-scenario"]'),
      'and the control survived it'
    )
  })

  test('the empty state still offers it on its own', async () => {
    await boot()
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('[data-scn-hint]'), null, 'there is no list to hint about')
    assert.ok(
      doc.querySelector('[data-action="import-scenario"]'),
      'but importing is the one useful thing here, so it stands alone'
    )
  })
})

describe('the whole Saved tab can be taken away and put back', () => {
  // The app boots holding one blank budget; every one after that has to be
  // started, and "+ New budget" only exists on the Saved tab.
  async function withBudgets(names) {
    await boot()
    names.forEach((name, i) => {
      if (i > 0) {
        click('[data-action="go-scenarios"]')
        click('[data-action="new-scenario"]')
      }
      type('name', name)
      click('[data-action="save-scenario"]')
    })
    click('[data-action="go-scenarios"]')
  }

  test('backup and restore sit left of the "+" buttons, not among them', async () => {
    await withBudgets(['North quarter'])
    const head = doc.querySelector('.saved-head')
    const tools = head.querySelector('.head-tools')
    assert.ok(tools, 'they have their own group')
    assert.ok(tools.querySelector('[data-action="backup-all"]'))
    assert.ok(tools.querySelector('[data-action="restore-all"]'))
    assert.ok(tools.querySelector('.help-btn[data-info="backupFile"]'), 'and an explanation')

    // Restore is the one control in the app that can delete work the producer
    // never opened. It must not be sitting inside the row of things that make
    // budgets, where a mis-tap costs the lot.
    assert.equal(
      head.querySelector('.head-btns [data-action="restore-all"]'),
      null,
      'not among the + buttons'
    )
    const kids = [...head.children]
    assert.ok(
      kids.indexOf(tools) < kids.indexOf(head.querySelector('.head-btns')),
      'and before them in the source, which is what the tab key follows'
    )
  })

  test('a backup carries every budget, every folder, and the filing between them', async () => {
    await withBudgets(['North quarter', 'South eighty'])
    click('[data-action="new-folder"]')
    doc.querySelector('#fldName').value = 'Corn trials'
    click('.fld-save')

    const text = JSON.parse((await import('../src/storage.js')).exportBackupJSON())
    assert.equal(text.scenarios.length, 2)
    assert.equal(text.folders.length, 1)
  })

  test('restoring replaces the list and lands the producer back on it', async () => {
    const { exportBackupJSON, importBackupJSON, replaceAll } = await import('../src/storage.js')

    await withBudgets(['North quarter'])
    const backup = exportBackupJSON()

    // Two more budgets saved after the backup was taken. They are the ones a
    // restore is supposed to remove, and the confirm dialog in main.js counts
    // them out loud before it does.
    await withBudgets(['North quarter', 'Later one', 'Later two'])
    assert.equal(doc.querySelectorAll('.scn').length, 3)

    const read = importBackupJSON(backup)
    assert.equal(read.ok, true)
    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)
    click('[data-action="go-scenarios"]')

    const names = [...doc.querySelectorAll('.scn .scn-name-input')].map((el) => el.value)
    assert.deepEqual(names, ['North quarter'])
  })

  test('the backup file and a single budget file each say which control they belong to', async () => {
    // Both are .json out of this app, so the near miss is real in both
    // directions and neither message may be the generic refusal.
    const { exportBackupJSON, importScenarioJSON, importBackupJSON, exportScenarioJSON } =
      await import('../src/storage.js')
    await withBudgets(['North quarter'])

    const asBudget = importScenarioJSON(exportBackupJSON())
    assert.equal(asBudget.ok, false)
    assert.match(asBudget.error, /Restore backup/)

    const one = exportScenarioJSON({ id: 'x', name: 'One', enterprises: [], fixed: {} })
    const asBackup = importBackupJSON(one)
    assert.equal(asBackup.ok, false)
    assert.match(asBackup.error, /upload a budget file/)
  })
})

describe('the title, and the way back from a comparison', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

  test('the top bar carries the tool name, centred on a wide screen only', async () => {
    await boot()
    const title = doc.querySelector('.topbar .topbar-title')
    assert.ok(title, 'it is in the bar')
    // The wording is not pinned here. What it says is a decision about the
    // tool's name; that it says SOMETHING is the thing a test can keep true.
    assert.ok(title.textContent.trim().length, 'and it carries a name')

    // Centred on the PAGE, which a flex row cannot do here: the logo and the
    // controls are nowhere near the same width. Three grid tracks with equal
    // outer ones is what makes the middle one the middle of the page.
    assert.match(css, /\n\.topbar-title \{[^}]*display: none/, 'hidden by default')
    assert.match(css, /\n  \.topbar \{[^}]*grid-template-columns: 1fr auto 1fr/)
    assert.match(css, /\n  \.topbar-title \{[^}]*display: block/)
  })

  test('the phone gets the square mark, and it keeps its colours in the dark', async () => {
    await boot()
    const wide = doc.querySelector('.toplogo-wide')
    const mark = doc.querySelector('.toplogo-mark')
    assert.ok(wide && mark, 'both are in the markup, one per width')
    assert.match(wide.getAttribute('src'), /horizontal/)
    assert.doesNotMatch(mark.getAttribute('src'), /horizontal/)

    // Both carry the same alt text, and exactly one is ever displayed, so
    // exactly one is ever announced. Same idiom as the two copies of the
    // seeds-per-unit offer.
    assert.equal(wide.getAttribute('alt'), mark.getAttribute('alt'))
    assert.match(css, /\n\.toplogo-mark \{[^}]*display: none/)
    assert.match(css, /\n  \.toplogo-wide \{[^}]*display: none/)

    // The dark-mode filter is brightness(0) invert(1): on the lockup's dark ink
    // it lifts the wordmark out, on four coloured leaves it makes a white blob.
    // It must name the wide one and only the wide one.
    assert.match(css, /\[data-theme="dark"\] \.toplogo-wide \{[^}]*filter:/)
    assert.doesNotMatch(css, /\[data-theme="dark"\] \.toplogo \{/, 'not both of them')
  })

  test('the bar is one row at every width, and the logo is what gives way', async () => {
    // Wrapped, the font control and the theme toggle took a line of their own
    // and cost about 50px above the first thing on the page — on the screen with
    // the least of it to spare.
    assert.match(css, /\n\.topbar \{[^}]*flex-wrap: nowrap/)
    assert.doesNotMatch(css, /\.topbar \{[^}]*flex-wrap: wrap/, 'and nothing puts it back')

    // A replaced element's automatic minimum size is its intrinsic width, so
    // flex-shrink on an <img> does nothing until this floor is lifted. Without
    // it the row overflows instead of shrinking, which is the same bug wearing
    // a different hat.
    assert.match(css, /\n\.toplogo \{[^}]*min-width: 0/)

    // The controls do not shrink: a squeezed pill wraps its own segments and
    // gets taller, which is the failure being avoided.
    assert.match(css, /\n\.topbar-controls \{[^}]*flex: 0 0 auto/)
  })

  test('Back to Saved is a button, and it goes back', async () => {
    await boot()
    type('name', 'North quarter')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    click('[data-action="new-scenario"]')
    type('name', 'South eighty')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    for (const box of doc.querySelectorAll('[data-compare-id]')) {
      box.checked = true
      box.dispatchEvent(new win.Event('change', { bubbles: true }))
    }
    click('[data-action="compare-selected"]')

    const back = doc.querySelector('[data-action="back-to-scenarios"]')
    assert.equal(back.className, 'btn-back', 'shaped like a button, not a text link')
    assert.equal(back.textContent.trim(), 'Back to Saved')

    back.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.ok(doc.querySelector('.saved-head'), 'and it lands on the saved list')
  })

  test('the button is chrome, so it does not print', async () => {
    // It used to be a `.tip`, which the print block already hides. Changing the
    // class without adding the new one would have put a navigation control on a
    // printed comparison.
    const print = css.slice(css.indexOf('@media print'))
    assert.match(print, /\n  \.btn-back,/)
  })
})

describe('a money box wears the same affixes as a fixed-cost field', () => {
  // jsdom loads no CSS, so this reads the stylesheet source — the same way the
  // folder palette and the [hidden] rule are checked.
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

  // Plain string scanning rather than a built regex: every selector here has
  // a dot, and two have parentheses, and escaping them into a pattern is more
  // ways to be wrong than the search is worth.
  const ruleFor = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    assert.notEqual(at, -1, `no rule found for ${selector}`)
    return css.slice(at, css.indexOf('}', at))
  }

  test('the size and the two offsets are the ones the labor-rate field uses', async () => {
    // A page carrying both treatments read as two different controls doing the
    // same job: a 10.5px grey tail inside an expense box, a 14px one inside the
    // Labor rate box an inch below it.
    assert.match(ruleFor('.affix'), /font-size:\s*14px/)
    assert.match(ruleFor('.in-affix'), /font-size:\s*14px/)

    assert.match(ruleFor('.prefix'), /left:\s*10px/)
    assert.match(ruleFor('.in-pre'), /left:\s*10px/)

    assert.match(ruleFor('.suffix'), /right:\s*10px/)
    assert.match(ruleFor('.in-post'), /right:\s*10px/)
  })

  test('and so is the room reserved for them', async () => {
    // Same size at the same offset needs the same padding, or the figure runs
    // under its own unit.
    assert.match(ruleFor('.has-prefix input'), /padding-left:\s*24px/)
    assert.match(
      ruleFor('.has-pre .line-input:not(:placeholder-shown)'),
      /padding-left:\s*24px/
    )

    assert.match(ruleFor('.has-suffix input'), /padding-right:\s*44px/)
    assert.match(
      ruleFor('.has-post .line-input:not(:placeholder-shown)'),
      /padding-right:\s*44px/
    )
  })
})

describe('the save state stands next to the button it is about', () => {
  beforeEach(async () => {
    await boot()
  })

  test('it is in the sticky bar, immediately left of Save', async () => {
    // It used to sit up in the page header beside the tabs, which put
    // "Unsaved changes" and the control that answers it at opposite ends of a
    // long page.
    const state = doc.getElementById('saveState')
    assert.ok(state, 'the state is on the page')
    assert.ok(state.closest('.sticky-bar'), 'in the sticky bar')
    assert.equal(state.closest('.app-head'), null, 'and no longer in the page header')
    assert.equal(
      state.nextElementSibling.dataset.action,
      'save-scenario',
      'with the Save button immediately after it'
    )

    // Still exactly one in the DOM, because updateStatus() and flashSaved()
    // address it by id.
    assert.equal(doc.querySelectorAll('#saveState').length, 1)
  })

  test('the button loses a word on a phone, not a meaning', async () => {
    const btn = doc.querySelector('[data-action="save-scenario"]')
    assert.equal(btn.textContent.replace(/\s+/g, ' ').trim(), 'Save budget')
    assert.equal(
      btn.querySelector('.btn-word').textContent.trim(),
      'budget',
      'and the droppable half is the one that is wrapped'
    )

    // Hidden with display: none rather than clipped, so the accessible name
    // narrows to "Save" along with the visible text instead of announcing a
    // word that is not on screen. jsdom loads no CSS, so this reads the source.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    const mobile = css.slice(css.indexOf('@media (max-width: 899px)'))
    assert.match(mobile, /\n {2}\.btn-word \{[^}]*display: none/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   A render that answers a keystroke must not evict the producer
   ══════════════════════════════════════════════════════════════════════════ */

describe('a structural render puts the producer back in the box', () => {
  beforeEach(async () => {
    await boot()
  })

  test('a crop name can be typed in full before the app acts on it', async () => {
    // "Corn silage" matches corn at four characters. Acting on the keystroke
    // rebuilt the card at that point, focus fell to the body, and on a phone the
    // keyboard closed — so the rest of the word went nowhere. The mode now waits
    // for the producer to leave the box.
    const el = doc.querySelector('[data-path="enterprises.0.crop"]')
    el.focus()
    for (const value of ['Corn', 'Corn ', 'Corn s', 'Corn silage']) {
      el.value = value
      el.dispatchEvent(new win.Event('input', { bubbles: true }))
      assert.equal(
        doc.activeElement?.getAttribute('data-path'),
        'enterprises.0.crop',
        `still in the crop box after typing "${value}"`
      )
    }
    assert.equal(doc.activeElement.value, 'Corn silage', 'and the whole name is in it')
    assert.equal(
      doc.querySelector(
        '[data-path="enterprises.0.variable.seed.mode"][data-mode="population"][aria-pressed="true"]'
      ),
      null,
      'nothing structural happened while they were typing'
    )

    // Leaving the box is when it acts.
    el.dispatchEvent(new win.Event('change', { bubbles: true }))
    await flush()
    assert.ok(
      doc.querySelector(
        '[data-path="enterprises.0.variable.seed.mode"][data-mode="population"][aria-pressed="true"]'
      ),
      'the seeds/ac mode opens once they are done'
    )
  })

  test('the render is deferred past the click that caused the blur', async () => {
    // `change` fires DURING the blur a click causes. A synchronous render there
    // replaces the page between mousedown and mouseup, detaching the element
    // the producer pressed — so tapping Acres straight after typing a crop
    // would put them nowhere and tapping Save would do nothing at all.
    const el = doc.querySelector('[data-path="enterprises.0.crop"]')
    el.value = 'Corn'
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
    el.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(
      doc.querySelector(
        '[data-path="enterprises.0.variable.seed.mode"][data-mode="population"][aria-pressed="true"]'
      ),
      null,
      'the page is still standing when change returns'
    )

    await flush()
    assert.ok(
      doc.querySelector(
        '[data-path="enterprises.0.variable.seed.mode"][data-mode="population"][aria-pressed="true"]'
      ),
      'and rebuilt on the next turn of the loop'
    )
  })

  test('restoring focus does not dismiss the notice that render just raised', async () => {
    // The focusin listener dismisses a notice when the producer taps into the
    // field it names. A focus the APP moved is not that, and without the guard
    // the notice explaining a cleared box was killed by the same render that
    // raised it, leaving an empty box and nothing saying why.
    click('[data-line="hauling"] [data-typical="hauling"]')
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const select = doc.querySelector('[data-path="enterprises.0.yieldUnit"]')
    select.value = 'ton'
    select.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.ok(doc.querySelector('.ent .unit-notice'), 'the notice survived the render')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   The app may only ever revise a figure IT wrote
   ══════════════════════════════════════════════════════════════════════════ */

describe('a provenance marker is released when the figure stops being ours', () => {
  beforeEach(async () => {
    await boot()
  })

  function pickFirstOption() {
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
  }

  test('a seeds-per-unit figure the producer PICKED is theirs', async () => {
    await typeCrop('enterprises.0.crop', 'Corn')
    assert.ok(
      doc.querySelector('[data-line="seed"] .field-note'),
      'the app filled the box and said so'
    )

    // Choosing from the picker is the producer answering the question. It is
    // written programmatically, which fires no input event, so the keystroke
    // path that normally releases the marker never runs.
    click('[data-line="seed"] [data-typical="seedsPerBag"]')
    pickFirstOption()
    const picked = doc.querySelector(
      '[data-path="enterprises.0.variable.seed.seedsPerBag"]'
    ).value
    assert.ok(Number(picked) > 0, 'the picker wrote a figure')

    await typeCrop('enterprises.0.crop', 'Soybeans')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.seedsPerBag"]').value,
      picked,
      'and changing the crop does not overwrite what they chose'
    )
  })

  test('a hauling rate typed over the picker\u2019s survives a yield-unit change', async () => {
    click('[data-line="hauling"] [data-typical="hauling"]')
    pickFirstOption()

    type('enterprises.0.variable.hauling.costPerUnit', '0.20')

    const select = doc.querySelector('[data-path="enterprises.0.yieldUnit"]')
    select.value = 'ton'
    select.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]').value,
      '0.20',
      'their own number is not deleted as if the picker had written it'
    )
    assert.equal(doc.querySelector('.ent .unit-notice'), null, 'and nothing claims it was')
  })

  test('an overhead figure typed over the picker\u2019s survives a period change', async () => {
    type('enterprises.0.acres', '500')
    click('[data-typical="overheadUtilities"]')
    pickFirstOption()

    type('fixed.annual.utilities', '380')

    const select = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    select.value = 'month'
    select.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(
      doc.querySelector('[data-path="fixed.annual.utilities"]').value,
      '380',
      'a producer converting their own figure on purpose is why the select exists'
    )
  })
})

describe('a seed price is at home in either entry mode', () => {
  beforeEach(async () => {
    await boot()
  })

  test('picking a cost per bag in seeds/ac mode does not switch the line', async () => {
    // A list quoted "per unit of seed" is quoting a cost per BAG, which is
    // exactly what the seeds/ac mode's own cost box holds. Switching to
    // $/unit would hide the population already entered, leaving it stored with
    // nothing on screen to say where it went.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')
    type('enterprises.0.variable.seed.population', '33000')

    click('[data-line="seed"] [data-typical="seed"]')

    // Per GROUP, because this spec also carries three $/acre lists that must
    // still warn — the exemption is about two boxes holding the same quantity,
    // not about the seed line as a whole.
    const perBag = doc.querySelector('.typ-option').closest('.typ-group')
    assert.match(perBag.textContent, /per bag or unit/i, 'this is the cost-per-bag list')
    assert.equal(
      perBag.querySelector('.modal-warn'),
      null,
      'and no warning claims the mode is about to change'
    )
    const perAcre = [...doc.querySelectorAll('.typ-group')].find((g) =>
      /cost per acre/i.test(g.textContent)
    )
    assert.ok(perAcre.querySelector('.modal-warn'), 'while a $/acre list still warns')

    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.ok(
      doc.querySelector(
        '[data-path="enterprises.0.variable.seed.mode"][data-mode="population"][aria-pressed="true"]'
      ),
      'the line is still in seeds/ac'
    )
    assert.ok(
      Number(doc.querySelector('[data-path="enterprises.0.variable.seed.costPerBag"]').value) > 0,
      'and the figure landed in the cost-per-bag box'
    )
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.population"]').value,
      '33000',
      'with the population they entered untouched'
    )
  })

  test('a genuinely different unit still switches the mode', async () => {
    // The exemption is only for two boxes holding the SAME quantity. A $/acre
    // list and a $/unit line are different figures and must still switch.
    click('[data-path="enterprises.0.variable.hauling.mode"][data-mode="perAcre"]')
    click('[data-line="hauling"] [data-typical="hauling"]')
    assert.ok(doc.querySelector('.modal-warn'), 'the mismatch is still announced')
  })
})

describe('a folded enterprise card still shows what it earns', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the shut card carries gross margin per acre and in total', async () => {
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')

    const card = doc.querySelector('.ent')
    const perAcre = card.querySelector('.ent-fold-sub [data-out$="grossMarginPerAcre"]')
    const total = card.querySelector('.ent-fold-sub [data-out$="enterpriseGrossMargin"]')
    assert.ok(perAcre && total, 'both figures are on the card head')

    // They are the same numbers the open card and the results table print, so
    // they must be [data-out] placeholders rather than baked into the literal —
    // otherwise they freeze at the last structural render while the ones below
    // them track every keystroke.
    assert.equal(perAcre.textContent, textOf('[data-out="enterprises.0.grossMarginPerAcre"]'))
    assert.match(total.textContent, /^\$/, 'and the total reads as money')

    // Positive money is green, and that is the whole point of putting it here.
    assert.ok(perAcre.classList.contains('pos'), 'a margin that is there reads as there')

    // A cost big enough to swallow the revenue, since a blank budget has none.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="perAcre"]')
    type('enterprises.0.variable.seed.perAcre', '2000')
    assert.ok(
      doc
        .querySelector('.ent .ent-fold-sub [data-out$="grossMarginPerAcre"]')
        .classList.contains('neg'),
      'and one that is not turns red'
    )
  })

  test('the figures are hidden while the card is open', async () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    // jsdom loads no CSS. Open, both figures are already readout rows inside the
    // card, and the same number twice on one card reads as two that disagree.
    assert.match(css, /\n\.ent-fold-sub \{[^}]*display: none/)
    assert.match(css, /\n\.ent\.collapsed \.ent-fold-sub \{[^}]*display: block/)
  })
})

describe('a figure the app filled in has to be readable in full', () => {
  beforeEach(async () => {
    await boot()
  })

  test('seeds per unit takes a row of its own, with its divisor', async () => {
    // A soybean unit is 140,000 seeds. Third of three factors on a phone row,
    // that box rendered "1400" and scrolled the rest out of sight, which is the
    // worst kind of wrong number: one the app wrote, that looks like an answer.
    click('[data-path="enterprises.0.variable.seed.mode"][data-mode="population"]')

    const row = doc.querySelector('[data-line="seed"] .line-inputs')
    const kids = [...row.children]
    const at = (path) =>
      kids.findIndex((el) => el.querySelector?.(`[data-path$="${path}"]`))

    const brk = kids.findIndex((el) => el.classList.contains('line-break'))
    assert.notEqual(brk, -1, 'the row declares its break')
    assert.ok(at('.population') < brk, 'population is above it')
    assert.ok(at('.seedsPerBag') > brk, 'and seeds per unit below')

    // The divisor goes with the box it divides, or the new row opens with a
    // number and no sign to say what it is doing there.
    assert.equal(kids[brk + 1].textContent.trim(), '÷')
  })

  test('the break is a full-width flex item, not display: none', async () => {
    // jsdom loads no CSS. `display: none` would take it out of the layout and
    // the break with it, leaving the bug and an element that does nothing.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    assert.match(css, /\n\.line-break \{[^}]*flex: 1 0 100%/)
    assert.match(css, /\n\.line-break \{[^}]*height: 0/)
  })
})

describe('a row of boxes reads as a row', () => {
  beforeEach(async () => {
    await boot()
  })

  test('Remove sits in the name field label row, not beside the box', async () => {
    // Level with the input it was a full-height target immediately right of the
    // text box, and a mis-tap there costs a filled-in machine.
    click('[data-action="add-equipment"]')

    const remove = doc.querySelector('[data-action="remove-equipment"]')
    const label = remove.closest('.field-label')
    assert.ok(label, 'it is in a label row')
    assert.ok(
      label.querySelector('label').textContent.includes('Equipment name'),
      'the name field'
    )
    assert.ok(remove.closest('.field-aside'), 'pinned to the right-hand end')
    assert.equal(remove.getAttribute('aria-label'), 'Remove this equipment')
  })

  test('so does a building Remove', async () => {
    click('[data-action="add-building"]')
    const remove = doc.querySelector('[data-action="remove-building"]')
    assert.ok(
      remove.closest('.field-label')?.querySelector('label').textContent.includes('Building name')
    )
  })

  test('the boxes hang from the foot of their cell, whatever the labels did', async () => {
    // Salvage value and Useful life carry a `?` and a "use typical value" link;
    // Initial cost and Interest rate carry neither, and on a phone the link
    // wraps. jsdom has no layout, so this reads the rule that fixes it: the
    // fields stretch to the grid row, and the input is pushed to the bottom.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    assert.match(css, /\n\.item-grid > \.field \{[^}]*flex-direction: column/)
    assert.match(css, /\n\.item-grid > \.field > \.input-wrap \{[^}]*margin-top: auto/)
  })
})

describe('a modal message cannot scroll out of sight', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the error sits in the head, which does not scroll', async () => {
    // A sentinel like "=0.25*initialCost" needs a sibling filled in first. The
    // option that raises it can be a long way down a long list, so at the foot
    // of the body the answer was written where the producer was not looking:
    // they tapped a figure, nothing appeared to happen, and the sentence saying
    // why was off the bottom of the screen.
    click('[data-action="add-equipment"]')
    const salvage = doc.querySelector('.item [data-typical="salvageValue"]')
    assert.ok(salvage, 'the salvage line offers typical values')
    salvage.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const err = doc.querySelector('.modal-err')
    assert.equal(err.hidden, false, 'the message is shown')
    assert.match(err.textContent, /initial cost/i, 'and says what to do first')
    assert.ok(err.closest('.modal-head'), 'from the head, above the scrolling body')
    assert.equal(err.closest('.modal-body'), null)
    assert.equal(err.getAttribute('aria-live'), 'polite', 'and is announced')
  })

  test('it does not survive into the next modal', async () => {
    click('[data-action="add-equipment"]')
    doc
      .querySelector('.item [data-typical="salvageValue"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.querySelector('.modal-err').hidden, false)

    // It lives in the head now, so it outlives the body it was raised about.
    click('.modal-close')
    click('[data-action="how-to"]')
    assert.equal(doc.querySelector('.modal-err').hidden, true, 'cleared on the way in')
  })
})

describe('an organising feature applies to the folders that are shut', () => {
  beforeEach(async () => {
    await boot()
  })

  async function oneBudgetAndAFolder() {
    type('name', 'North quarter')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    click('[data-action="new-folder"]')
    doc.querySelector('#fldName').value = 'Rented ground'
    click('.fld-save')
  }

  test('hovering a shut folder while dragging opens it', async () => {
    await oneBudgetAndAFolder()

    const section = [...doc.querySelectorAll('.scn-section')].find(
      (s) => s.getAttribute('data-scn-section') !== ''
    )
    assert.ok(section, 'the folder has a section')
    // A folder is opened by the act of creating it, so shut it — this is the
    // state every folder is in on the next visit, which is the whole problem.
    section.querySelector('.fld-toggle').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const list = doc
      .querySelector(`[data-scn-section="${section.getAttribute('data-scn-section')}"]`)
      .querySelector('[data-scn-list]')
    assert.equal(list.hidden, true, 'and now it is shut')

    // A shut section hides its rows, so elementFromPoint never returns the list
    // and the drag had no way in. Since folders start shut, that meant a budget
    // could not be dragged into most of them at all.
    const row = doc.querySelector('.scn')
    row.dispatchEvent(new win.MouseEvent('dragstart', { bubbles: true }))
    section
      .querySelector('.fld-toggle')
      .dispatchEvent(new win.MouseEvent('dragover', { bubbles: true, cancelable: true }))

    assert.equal(list.hidden, false, 'hovering the heading opens the section')
    assert.equal(
      section.querySelector('.fld-toggle').getAttribute('aria-expanded'),
      'true',
      'and the caret agrees'
    )
  })

  test('a duplicate lands somewhere the producer can see it', async () => {
    await oneBudgetAndAFolder()

    // File the budget through the Move modal, the way a producer would.
    doc
      .querySelector('.scn [data-action="move-scenario"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    const options = [...doc.querySelectorAll('.fld-option')]
    const wanted = options.find((o) => o.textContent.trim().startsWith('Rented ground'))
    for (const o of options) o.querySelector('input').checked = false
    wanted.querySelector('input').checked = true
    click('.fld-save')

    const section = [...doc.querySelectorAll('.scn-section')].find(
      (s) => s.getAttribute('data-scn-section') !== ''
    )
    const folderId = section.getAttribute('data-scn-section')
    const id = doc.querySelector('.scn').getAttribute('data-scn-id')

    // Shut it again. Filing a budget opens its folder, so without this the
    // section is open for a reason that has nothing to do with the duplicate
    // and the test would pass whether or not the copy is reachable.
    section.querySelector('.fld-toggle').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(
      doc
        .querySelector(`[data-scn-section="${folderId}"]`)
        .querySelector('[data-scn-list]').hidden,
      true,
      'the folder is shut before the copy is made'
    )

    click(`[data-action="duplicate-scenario"][data-id="${id}"]`)
    click('[data-action="go-scenarios"]')

    const listNow = [...doc.querySelectorAll('.scn-section')]
      .find((s) => s.getAttribute('data-scn-section') === folderId)
      .querySelector('[data-scn-list]')
    assert.equal(listNow.hidden, false, 'the section holding the copy is open')
    assert.equal(listNow.querySelectorAll('.scn').length, 2, 'and the copy is in it')
  })
})

describe('a placeholder says what the box is actually for', () => {
  beforeEach(async () => {
    await boot()
  })

  const ph = (path) => doc.querySelector(`[data-path="${path}"]`)?.getAttribute('placeholder')
  const post = (path) =>
    doc.querySelector(`[data-path="${path}"]`)?.closest('.in-box')?.querySelector('.in-post')
      ?.textContent

  test('the total-premium box says what the total is OF', async () => {
    click('[data-path="enterprises.0.variable.cropInsurance.mode"][data-mode="total"]')
    assert.equal(ph('enterprises.0.variable.cropInsurance.totalCost'), 'total premium')
  })

  test('the units/acre box says "unit" until something tells it otherwise', async () => {
    // It used to be filled from the line's own unitHint, which was a guess:
    // crop insurance and repairs read "acre/acre", and seed read
    // "bag, unit/acre" — two nouns and a comma inside a placeholder.
    assert.equal(ph('enterprises.0.variable.nitrogen.unitsPerAcre'), 'unit/acre')
    click('[data-path="enterprises.0.variable.repairs.mode"][data-mode="unit"]')
    assert.equal(ph('enterprises.0.variable.repairs.unitsPerAcre'), 'unit/acre')
  })

  test('picking a $/unit typical value names the unit', async () => {
    // Nitrogen is published "$/lb of N", so the box below is counting pounds.
    // The noun comes off the GROUP that was chosen from, which is the only
    // thing in the app that actually knows one.
    click('[data-line="nitrogen"] [data-typical="nitrogen"]')
    const perLb = [...doc.querySelectorAll('.typ-option')].find(
      (o) => o.getAttribute('data-unit') === '$/lb of N'
    )
    assert.ok(perLb, 'the picker offers a per-pound list')
    perLb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    assert.equal(ph('enterprises.0.variable.nitrogen.unitsPerAcre'), 'lb/acre')
    // The noun appears TWICE on the row and the two must agree, because between
    // them they are the whole sentence: dollars per pound, times pounds per acre.
    assert.equal(post('enterprises.0.variable.nitrogen.costPerUnit'), '/lb')

    // And the app stops describing the figure once it is no longer the one it
    // wrote — the same rule the other three provenance markers follow. In place,
    // because this runs on a keystroke: clearing the marker alone left both
    // labels on screen describing a cost that had just been overwritten.
    type('enterprises.0.variable.nitrogen.costPerUnit', '0.71')
    assert.equal(
      ph('enterprises.0.variable.nitrogen.unitsPerAcre'),
      'unit/acre',
      'without waiting for a render'
    )
    assert.equal(post('enterprises.0.variable.nitrogen.costPerUnit'), '/unit')

    // And it stays that way once something does rebuild the card.
    click('[data-action="go-scenarios"]')
    click('[data-action="go-build"]')
    assert.equal(ph('enterprises.0.variable.nitrogen.unitsPerAcre'), 'unit/acre')
    assert.equal(post('enterprises.0.variable.nitrogen.costPerUnit'), '/unit')
  })

  test('clearing the cost box puts the labels back too', async () => {
    click('[data-line="nitrogen"] [data-typical="nitrogen"]')
    ;[...doc.querySelectorAll('.typ-option')]
      .find((o) => o.getAttribute('data-unit') === '$/lb of N')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(ph('enterprises.0.variable.nitrogen.unitsPerAcre'), 'lb/acre')

    // Deleted, not replaced. An empty box is not a figure the app wrote either.
    type('enterprises.0.variable.nitrogen.costPerUnit', '')
    assert.equal(ph('enterprises.0.variable.nitrogen.unitsPerAcre'), 'unit/acre')
    assert.equal(post('enterprises.0.variable.nitrogen.costPerUnit'), '/unit')
  })

  test('the folded card names both figures in full', async () => {
    type('enterprises.0.acres', '500')
    const keys = [...doc.querySelectorAll('.ent-fold-sub .ent-fig-key')].map((k) =>
      k.textContent.trim()
    )
    assert.deepEqual(keys, ['Gross margin / ac:', 'Enterprise gross margin:'])

    // One figure per line, each nowrap so the money never breaks away from the
    // label it belongs to.
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    assert.match(css, /\n\.ent-fig \{[^}]*display: block/)
    assert.match(css, /\n\.ent-fig \{[^}]*white-space: nowrap/)
  })
})
