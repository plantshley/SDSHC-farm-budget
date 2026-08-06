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

  test('renders the budget screen with one enterprise', () => {
    assert.ok(app.innerHTML.length > 500, 'app rendered something')
    assert.equal(doc.querySelectorAll('.ent').length, 1)
    assert.ok(doc.querySelector('.fixed-block'), 'fixed costs block present')
    assert.ok(doc.querySelector('.results'), 'results present')
    assert.ok(doc.querySelector('.sticky-bar'), 'sticky results bar present')
  })

  test('warns that acres are needed before anything can be per-acre', () => {
    assert.match(textOf('.warnings'), /acres/i)
  })

  test('the warning sits in the results header, and clears on a keystroke', () => {
    // Beside the heading, not in a banner over the card.
    assert.ok(
      doc.querySelector('.results .block-head [data-warnings] .warnings'),
      'the warning is in the header row'
    )

    // And it is still a live placeholder there. Typing acres does not re-render,
    // so anything updateOutputs() cannot reach would stay on screen for good.
    type('enterprises.0.acres', 500)
    assert.equal(doc.querySelector('.warnings'), null, 'gone once there are acres')
    assert.ok(doc.querySelector('.results .block-head [data-warnings]'), 'the holder stays')
  })

  test('font control shows both options with Browser active', () => {
    const browser = doc.querySelector('[data-font-choice="browser"]')
    const classic = doc.querySelector('[data-font-choice="classic"]')
    assert.equal(browser.getAttribute('aria-pressed'), 'true')
    assert.equal(classic.getAttribute('aria-pressed'), 'false')
    assert.equal(doc.documentElement.getAttribute('data-font'), 'browser')

    classic.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.equal(doc.documentElement.getAttribute('data-font'), 'classic')
    assert.equal(classic.getAttribute('aria-pressed'), 'true')
    assert.equal(browser.getAttribute('aria-pressed'), 'false')
  })

  test('dark mode toggles and persists', () => {
    click('#themeToggle')
    assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark')
    assert.equal(win.localStorage.getItem('sdshc-fb-theme'), 'dark')
  })
})

describe('entering a budget', () => {
  beforeEach(async () => {
    await boot()
  })

  test('typing updates the results without re-rendering the field', () => {
    type('enterprises.0.crop', 'Corn')
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

  test('a variable expense line switches between $/unit and $/acre', () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.variable.seed.costPerUnit', '320')
    type('enterprises.0.variable.seed.unitsPerAcre', '0.35')
    assert.equal(textOf('[data-out="enterprises.0.lines.seed"]'), '$112.00')

    click('[data-path="enterprises.0.variable.seed.mode"]')
    // Per-acre mode is now showing, and the unit values are still stored.
    assert.ok(doc.querySelector('[data-path="enterprises.0.variable.seed.perAcre"]'))
    type('enterprises.0.variable.seed.perAcre', '99')
    assert.equal(textOf('[data-out="enterprises.0.lines.seed"]'), '$99.00')

    click('[data-path="enterprises.0.variable.seed.mode"]')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.seed.costPerUnit"]').value,
      '320',
      'switching back did not lose the per-unit entry'
    )
  })

  test('preharvest interest is calculated, and can be switched to manual', () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.variable.seed.costPerUnit', '100')
    type('enterprises.0.variable.seed.unitsPerAcre', '1')
    // 100 × 10% × 8/12 = 6.67
    assert.equal(textOf('[data-out="enterprises.0.preharvestInterestPerAcre"]'), '$6.67')

    click('[data-path="enterprises.0.preharvest.auto"]')
    type('enterprises.0.preharvest.manualPerAcre', '25.50')
    assert.equal(textOf('[data-out="enterprises.0.preharvestInterestPerAcre"]'), '$25.50')
  })

  test('enterprises can be added past the spreadsheet’s limit of four', () => {
    for (let i = 0; i < 5; i += 1) click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelectorAll('.ent').length, 6)
  })

  test('equipment is entered once and yields both depreciation and interest', () => {
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

  test('a typed equipment name sets a category but fills nothing', () => {
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

  test('a `?` opens a definition and changes no value', () => {
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

  test('"use typical value" writes exactly one field', () => {
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

  test('a sentinel with nothing to resolve against explains itself', () => {
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

  test('every "use typical value" link sits in its field label row', () => {
    // Under the input it read as a caption belonging to the NEXT field down,
    // and added a row of height to every field carrying one. If a link ever
    // escapes the label row again, this is what catches it.
    click('[data-action="add-equipment"]')
    click('[data-action="add-building"]')

    const links = [...doc.querySelectorAll('.ent .tip[data-typical], .fixed-block .tip[data-typical]')]
    assert.ok(links.length >= 6, 'the typical-value links are on the page')
    for (const link of links) {
      const row = link.closest('.field-label, .line-head')
      assert.ok(row, `"${link.textContent.trim()}" is not in a label row`)
      assert.ok(
        row.querySelector('label, .line-label'),
        'the row it is in actually carries the field label'
      )
    }
  })

  test('an overhead rate is multiplied by the farm, and forced to a yearly period', () => {
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

  test('the acres sentinel sums every enterprise, not just the first', () => {
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

  test('an overhead rate with no acres to multiply refuses, and says why', () => {
    doc
      .querySelector('[data-typical="overheadUtilities"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    // The warning is up before anything is chosen, not only after a failed tap.
    assert.match(doc.querySelector('.overlay.open').textContent, /Enter your acres/i)

    const corn = [...doc.querySelectorAll('.overlay.open .typ-option')].find((o) =>
      /Corn farms/.test(o.textContent)
    )
    corn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    const err = doc.querySelector('.modal-err')
    assert.equal(err.hidden, false)
    assert.match(err.textContent, /acres/i)
    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '')
  })

  test('the overhead picker shows the acreage it is about to multiply by', () => {
    type('enterprises.0.acres', '640')
    doc
      .querySelector('[data-typical="overheadDues"]')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    assert.match(doc.querySelector('.overlay.open').textContent, /640/)
  })

  test('a long picker can be searched, and a match inside a fold is revealed', () => {
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

  test('searching then picking still writes the county rate', () => {
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

  test('the how-to guide covers saving and comparing scenarios', () => {
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

  test('a budget saves and reappears in the saved list', () => {
    type('name', 'Field corn, conventional')
    type('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')

    assert.equal(textOf('#saveState'), SAVED_LABEL)
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelectorAll('.scn').length, 1)
    // The saved list renames in place, so the name is an input's value rather
    // than text content.
    assert.equal(doc.querySelector('.scn-name-input').value, 'Field corn, conventional')
  })

  test('duplicate then compare shows both budgets side by side', () => {
    type('name', 'Conventional')
    type('enterprises.0.crop', 'Soybeans')
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

  test('deleting a budget removes it', () => {
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelectorAll('.scn').length, 1)
    click('[data-action="delete-scenario"]')
    assert.equal(doc.querySelectorAll('.scn').length, 0)
  })

  test('removing the last enterprise leaves a blank one, never zero', () => {
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

  test('the KPI cards move with the sticky bar as revenue is typed', () => {
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')

    const sticky = textOf('.sticky-bar [data-out="totals.totalProfit"]')
    const kpi = textOf('.kpi [data-out="totals.totalProfit"]')
    assert.equal(kpi, sticky)
    assert.match(kpi, /382,500/, '180 x $4.25 x 500 acres, no costs entered yet')
  })

  test('every whole-farm figure updates without a re-render', () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.yieldPerAcre', '50')
    type('enterprises.0.pricePerUnit', '10')

    assert.match(textOf('[data-out="totals.totalRevenue"]'), /50,000/)
    assert.match(textOf('[data-out="totals.totalGrossMargin"]'), /50,000/)
    assert.match(textOf('[data-out="totals.revenuePerAcre"]'), /500\.00/)
    assert.equal(textOf('[data-out="totalAcres"]'), '100')
  })

  test('fixed costs reach the results table as they are typed', () => {
    type('enterprises.0.acres', '200')
    type('fixed.landRentPerAcre', '150')

    assert.match(textOf('[data-out="fixed.landRentTotal"]'), /30,000/)
    assert.match(textOf('[data-out="totals.totalFixed"]'), /30,000/)
    assert.match(textOf('[data-out="totals.totalProfit"]'), /30,000/)
  })

  test('the acres warning clears once acres are entered', () => {
    assert.match(textOf('[data-warnings]'), /Enter acres/)
    type('enterprises.0.acres', '80')
    assert.equal(textOf('[data-warnings]'), '')
  })
})

describe('naming an enterprise', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the name is separate from the crop and wins as the label', () => {
    type('enterprises.0.crop', 'Corn')
    assert.equal(textOf('.ent-name'), 'Corn', 'crop is the fallback label')

    type('enterprises.0.name', 'No-till, east half')
    assert.equal(textOf('.ent-name'), 'No-till, east half')
    assert.equal(
      doc.querySelector('[data-path="enterprises.0.crop"]').value,
      'Corn',
      'renaming the column must not touch the crop'
    )
  })

  test('the results table follows the rename without a re-render', () => {
    type('enterprises.0.acres', '100')
    type('enterprises.0.name', 'Silage')
    assert.equal(textOf('[data-ent-label="0"]'), 'Silage')
  })
})

describe('folding cards away', () => {
  beforeEach(async () => {
    await boot()
  })

  test('an enterprise collapses and stays collapsed through a re-render', () => {
    const card = doc.querySelector('.ent')
    assert.equal(card.classList.contains('collapsed'), false)

    click('.ent [data-action="toggle-enterprise"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), true)

    // Adding a second enterprise re-renders everything; the first must not
    // silently spring open again.
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelectorAll('.ent')[0].classList.contains('collapsed'), true)
  })

  test('a newly added enterprise arrives folded shut', () => {
    click('[data-action="add-enterprise"]')
    const cards = doc.querySelectorAll('.ent')
    assert.equal(cards.length, 2)
    // The one already being worked on is left exactly as it was.
    assert.equal(cards[0].classList.contains('collapsed'), false)
    assert.equal(cards[1].classList.contains('collapsed'), true)

    // And it opens on a tap, rather than needing anything else first.
    cards[1].querySelector('[data-action="toggle-enterprise"]').click()
    assert.equal(doc.querySelectorAll('.ent')[1].classList.contains('collapsed'), false)
  })

  test('the shared fixed costs block collapses', () => {
    click('[data-action="toggle-fixed"]')
    assert.equal(doc.querySelector('.fixed-block').classList.contains('collapsed'), true)
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelector('.fixed-block').classList.contains('collapsed'), true)
  })

  test('folding is not part of the budget, so it never marks it unsaved', () => {
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
  test('an input event that changes nothing leaves the budget saved', () => {
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')
    assert.equal(textOf('#saveState'), SAVED_LABEL)

    // Same value again, as a focus or an arrow key on a number box produces.
    type('enterprises.0.acres', '500')
    assert.equal(textOf('#saveState'), SAVED_LABEL)
  })

  test('a different value still marks it unsaved', () => {
    type('enterprises.0.acres', '500')
    click('[data-action="save-scenario"]')
    type('enterprises.0.acres', '501')
    assert.equal(textOf('#saveState'), 'Unsaved changes')
  })

  test('the stored number and the box’s string are compared as text', () => {
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

  test('hours a week become hours a year', () => {
    type('enterprises.0.acres', '100')
    type('fixed.labor.ratePerHour', '20')
    type('fixed.labor.hours', '10')
    setSelect('fixed.labor.hoursBasis', 'week')

    assert.equal(textOf('[data-out="fixed.totalHoursPerYear"]'), '520')
    assert.match(textOf('[data-out="fixed.laborTotal"]'), /10,400/)
  })

  test('a monthly bill is annualised', () => {
    type('enterprises.0.acres', '100')
    type('fixed.annual.utilities', '180')
    setSelect('fixed.annualBasis.utilities', 'month')
    assert.match(textOf('[data-out="fixed.annualTotal"]'), /2,160/)
  })

  test('the default period is yearly, so nothing changes until it is chosen', () => {
    type('enterprises.0.acres', '100')
    type('fixed.annual.utilities', '1200')
    assert.match(textOf('[data-out="fixed.annualTotal"]'), /1,200/)
  })
})

describe('the saved list', () => {
  beforeEach(async () => {
    await boot()
  })

  test('renaming a row saves without opening that budget', () => {
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

  test('a row name is sized to its text, so the pencil and the tag follow it', () => {
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

  test('the budget name is not shown twice on the saved tab', () => {
    click('[data-action="save-scenario"]')
    assert.ok(doc.querySelector('#scenarioName'), 'shown while building')
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('#scenarioName'), null, 'each row carries its own')
  })

  test('the baseline rule is stated where budgets are picked', () => {
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    // The RULE has to be on screen; the verb it is phrased with is free to
    // change with the rest of the copy.
    assert.match(textOf('.baseline-note').replace(/\s+/g, ' '), /first one you \w+ becomes the\s*baseline/i)
  })

  test('rows can be dragged, and the order survives leaving the tab', () => {
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

  test('the arrows reorder without a mouse, and the ends are disabled', () => {
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

  test('opening a budget file explains what one is', () => {
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
  function saveBudgets(entries) {
    for (const entry of entries) {
      // The app boots holding one blank budget; every one after that has to be
      // started, and "+ New budget" only exists on the Saved tab.
      if (saved > 0) {
        click('[data-action="go-scenarios"]')
        click('[data-action="new-scenario"]')
      }
      type('name', entry.name)
      if (entry.crop) type('enterprises.0.crop', entry.crop)
      if (entry.year) type('scenarioYear', entry.year)
      click('[data-action="save-scenario"]')
      saved += 1
    }
    click('[data-action="go-scenarios"]')
  }

  /** Six budgets: enough for the filter box to appear at all. */
  function sixBudgets() {
    saveBudgets([
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

  test('the box is there from the first saved budget, but not before', () => {
    // A control that materialises partway down a list is one a producer has to
    // notice arriving. Over nothing at all it has nothing to filter.
    click('[data-action="go-scenarios"]')
    assert.equal(doc.querySelector('[data-scn-filter]'), null, 'nothing saved, nothing to filter')

    click('[data-action="go-build"]')
    saveBudgets([{ name: 'One' }])
    assert.ok(doc.querySelector('[data-scn-filter]'), 'and from then on it is always there')
  })

  test('the scenario year and the year it was saved are two different filters', () => {
    // A 2031 plan written today is not a 2026 budget, and a producer reaching
    // for either of those numbers should find it. Nothing derives one from the
    // other, which is the whole reason scenarioYear exists as a stored field.
    saveBudgets([
      { name: 'North quarter', year: '2031' },
      { name: 'South quarter' },
    ])

    assert.match(textOf('.scn-year'), /2031/, 'and it is printed on the row it can be found by')

    filterTo('2031')
    assert.deepEqual(visible(), ['North quarter'], 'found by the year it is FOR')

    filterTo(String(new Date().getFullYear()))
    assert.equal(visible().length, 2, 'and both are still found by the day they were saved')
  })

  test('a year finds the budgets saved in it', () => {
    saveBudgets([{ name: 'North quarter' }, { name: 'South quarter' }])
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

  test('typing hides the rows that do not match, without re-rendering', () => {
    sixBudgets()
    const box = filterTo('quarter')
    assert.deepEqual(visible().sort(), ['North quarter', 'South quarter'])
    // The box the producer is typing into must survive its own keystroke. A
    // render() here would replace it and take the caret and the mobile keyboard
    // with it.
    assert.equal(doc.querySelector('[data-scn-filter]'), box, 'the same box, not a new one')
    assert.equal(box.value, 'quarter')
  })

  test('a crop finds a budget whose name never mentions it', () => {
    // "Which of these had soybeans in it" is the actual question, and the
    // budget's own name frequently cannot answer it.
    sixBudgets()
    filterTo('soybeans')
    assert.deepEqual(visible(), ['South quarter'])
  })

  test('the filter matches named fields, not whatever the row happens to print', () => {
    // The row also carries an acreage and a profit figure. Matching on rendered
    // text would have "acres" return every budget, and a digit return whichever
    // ones have it somewhere in a dollar amount.
    sixBudgets()
    filterTo('acres')
    assert.deepEqual(visible(), [], 'the word next to the number is not searchable')
    filterTo('profit')
    assert.deepEqual(visible(), [])
  })

  test('nothing matching says so rather than showing an empty list', () => {
    sixBudgets()
    filterTo('alfalfa')
    assert.deepEqual(visible(), [])
    const empty = doc.querySelector('[data-scn-empty]')
    assert.equal(empty.hidden, false)
    assert.match(empty.textContent, /No saved budget matches "alfalfa"/)
  })

  test('reordering is off while filtered, and comes straight back', () => {
    // Moving a row while most of the list is hidden is an operation whose
    // result the producer cannot see: the arrow swaps it past a budget that is
    // not on screen and appears to do nothing at all.
    sixBudgets()
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

  test('Clear puts every budget back and keeps the ticks', () => {
    sixBudgets()
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

  test('a selected budget hidden by the filter is still compared, and says so', () => {
    // Hiding a row does not untick it: "select two corn budgets, filter to
    // soybeans, select two more" is a real way to build a comparison. But a
    // comparison that quietly contains budgets nobody can see is the failure
    // this app is careful about, so the discrepancy is named on screen.
    sixBudgets()
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

  test('hiding a row actually hides it', () => {
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

  test('a budget saved while the list is filtered is never filtered out of sight', () => {
    // Otherwise the row arrives hidden and the save reads as having failed.
    sixBudgets()
    filterTo('corn')
    click('[data-action="new-scenario"]')
    type('name', 'Bottom field')
    type('enterprises.0.crop', 'Sunflowers')
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

  test('the picker states the unit its figures are quoted in', () => {
    click('[data-typical="customHire"]')
    assert.match(textOf('.modal-unit'), /\$\/acre/)
  })

  test('a $/bushel list warns when the line is set to $/acre, then fixes it', () => {
    // Hauling is quoted per bushel; put the line in $/acre mode first.
    const toggle = doc.querySelector('[data-line="hauling"] .mode-toggle')
    toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    click('[data-line="hauling"] [data-typical="hauling"]')
    assert.match(doc.querySelector('.modal-warn').textContent, /switch the line/i)

    doc.querySelector('.typ-option').dispatchEvent(new win.MouseEvent('click', { bubbles: true }))

    // The value landed in the cost-per-unit box, and the line switched with it.
    const unitInput = doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]')
    assert.ok(unitInput, 'the line is back in $/unit mode')
    assert.equal(Number(unitInput.value) > 0, true)
  })

  test('the offer sits beside the label it belongs to, not below the inputs', () => {
    const tip = doc.querySelector('[data-line="customHire"] .line-head .tip')
    assert.ok(tip, 'inline with the line label')
    assert.equal(tip.textContent.trim(), 'use typical value')
  })
})

describe('long modals stay put', () => {
  beforeEach(async () => {
    await boot()
  })

  test('the how-to guide opens folded, one heading per section', () => {
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
  test('an overhead rate reads as dollars an acre, not as a percentage', () => {
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

  test('a share of a sibling field still reads as a percentage', () => {
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

  test('a $/bushel figure is cleared when the enterprise moves to tons', () => {
    const rate = pickHaulingRate()
    assert.ok(Number(rate) > 0, 'the picker wrote a per-bushel rate')

    setUnit('ton')

    assert.equal(
      doc.querySelector('[data-path="enterprises.0.variable.hauling.costPerUnit"]').value,
      '',
      'a rate per bushel is not that rate per ton, so it does not survive the change'
    )
  })

  test('the producer is told why the figure went, on the card it went from', () => {
    pickHaulingRate()
    setUnit('ton')

    const notice = doc.querySelector('.ent .unit-notice')
    assert.ok(notice, 'the notice sits on the enterprise that changed')
    assert.match(notice.textContent, /Hauling/i)
    assert.match(notice.textContent, /per bu/i)
    assert.match(notice.textContent, /ton/i)
  })

  test('the notice is shown once and is not part of the budget', () => {
    pickHaulingRate()
    setUnit('ton')
    assert.ok(doc.querySelector('.unit-notice'))

    // A later structural render is about something else, and repeating it there
    // would make it read as a live problem rather than something that happened.
    click('[data-action="add-enterprise"]')
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('the notice goes when the producer taps into the box it is about', () => {
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

  test('tabbing past a neighbouring box is not reading the notice', () => {
    pickHaulingRate()
    setUnit('ton')

    doc
      .querySelector('[data-path="enterprises.0.pricePerUnit"]')
      .dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }))
    assert.ok(doc.querySelector('.unit-notice'), 'still there')
  })

  test('the overhead notice goes when its own line is tapped into', () => {
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

  test('a figure the producer typed themselves is left alone', () => {
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

  test('an overhead figure is cleared when its period is moved off yearly', () => {
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

  test('only the overhead line whose period moved is cleared', () => {
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

  test('an overhead figure the producer typed is left alone', () => {
    type('fixed.annual.utilities', '1800')
    const basis = doc.querySelector('[data-path="fixed.annualBasis.utilities"]')
    basis.value = 'month'
    basis.dispatchEvent(new win.Event('change', { bubbles: true }))

    assert.equal(doc.querySelector('[data-path="fixed.annual.utilities"]').value, '1800')
    assert.equal(doc.querySelector('.unit-notice'), null)
  })

  test('a $/acre figure is untouched by a unit change', () => {
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

  test('several definitions open as folds, all shut', () => {
    click('.fixed-block .block-head .help-btn')
    const folds = doc.querySelectorAll('.modal-body details.def-fold')
    assert.ok(folds.length >= 5, 'one fold per definition')
    assert.equal([...folds].every((d) => !d.open), true, 'nothing is open to start with')
  })

  test('a single definition is not folded, because there is nothing to choose', () => {
    click('[data-info="landRent"]')
    assert.equal(doc.querySelectorAll('.modal-body details.def-fold').length, 0)
    assert.ok(doc.querySelector('.modal-body .def h3'), 'the answer is simply shown')
  })

  test('a multi-section guide opens with every section shut', () => {
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

  test('Open Budget sits first, beside Duplicate and Delete, and opens it', () => {
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

  test('a new budget leaves its one enterprise open', () => {
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), false)
  })

  test('every enterprise of a saved budget arrives folded', () => {
    type('name', 'Two enterprises')
    click('[data-action="add-enterprise"]')
    type('enterprises.1.crop', 'Soybeans')
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

  test('a duplicate opens folded too, because it is a farm already built', () => {
    type('name', 'Original')
    click('[data-action="save-scenario"]')
    click('[data-action="go-scenarios"]')
    click('[data-action="duplicate-scenario"]')
    assert.equal(doc.querySelector('.ent').classList.contains('collapsed'), true)
  })

  test('starting a new budget from the saved tab opens its enterprise', () => {
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

  function twoBudgets() {
    type('name', 'Conventional')
    type('enterprises.0.crop', 'Corn')
    type('enterprises.0.acres', '500')
    type('enterprises.0.yieldPerAcre', '180')
    type('enterprises.0.pricePerUnit', '4.25')
    click('[data-action="save-scenario"]')

    click('[data-action="go-scenarios"]')
    click('[data-action="new-scenario"]')
    type('name', 'No-till')
    type('enterprises.0.crop', 'Corn')
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

  test('the comparison screen offers its own export and print', () => {
    twoBudgets()
    assert.ok(doc.querySelector('.compare [data-action="export-compare-csv"]'))
    assert.ok(doc.querySelector('.compare [data-action="print"]'))
  })

  test('the CSV carries every figure on screen, plus the difference', async () => {
    const { compareToCSV } = await import('../src/export.js')
    const { listScenarios } = await import('../src/storage.js')
    twoBudgets()

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

  test('Remove is reachable without opening the card first', () => {
    // A new enterprise arrives folded, so the card you are most likely to want
    // rid of is the one you would have had to open to reach the button.
    click('[data-action="add-enterprise"]')
    const added = doc.querySelectorAll('.ent')[1]
    assert.equal(added.classList.contains('collapsed'), true)

    const remove = added.querySelector('[data-action="remove-enterprise"]')
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

  test('a producer who never makes a folder sees the page they had before', () => {
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

  test('a new folder is a section, and Move appears once there is somewhere to go', () => {
    saveBudgets(['North quarter'])
    newFolder('Corn trials', { icon: 'sprout', color: 'pink' })

    assert.deepEqual(shape(), ['Not in a folder[North quarter]', 'Corn trials[]'])
    assert.equal(doc.querySelectorAll('[data-action="move-scenario"]').length, 1)

    const section = doc.querySelector('[data-scn-section^="fld"]')
    assert.match(section.className, /fld-c-pink/, 'the colour is a token key on the section')
    assert.ok(section.querySelector('.fld-chip svg'), 'and the glyph is inline SVG, not an emoji')
    assert.match(section.querySelector('.fld-empty').textContent, /No budgets in this folder yet/)
  })

  test('the ungrouped pile is at the top, and stays there once it is empty', () => {
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

  test('deleting the last folder cannot leave the budgets folded out of sight', () => {
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

  test('Move files a budget, and the counts follow it', () => {
    saveBudgets(['North quarter', 'South quarter'])
    newFolder('Corn trials')
    moveTo('North quarter', 'Corn trials')

    assert.deepEqual(shape(), ['Not in a folder[South quarter]', 'Corn trials[North quarter]'])
    assert.deepEqual(
      [...doc.querySelectorAll('[data-fld-count]')].map((c) => c.textContent),
      ['1 budget', '1 budget']
    )
  })

  test('a folder made from inside the Move modal is created and chosen in one pass', () => {
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

  test('folding a section keeps every compare tick', () => {
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

  test('a budget ticked and then folded out of sight says so', () => {
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

  test('a filter reaches inside a shut folder, and hides one holding nothing', () => {
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

  test('a filtered folder says how many of its budgets are showing', () => {
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

  test('the row arrows move a budget inside its own folder and nowhere else', () => {
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

  test('the folder arrows reorder the sections and stop at the ends', () => {
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

  test('a drag with a shut folder present does not disturb what is inside it', () => {
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

  test('a drag across a section boundary reorders and re-files in one gesture', () => {
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

  test('a budget can be dragged back out of a folder', () => {
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

  test('comparing still works across two folders', () => {
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

  test('a duplicate lands in the same folder as the budget it came from', () => {
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

  test('a folder with an icon and colour this version has never heard of still draws', () => {
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

  test('a budget filed in a folder that no longer exists is drawn, not lost', () => {
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

  test('a shut folder prints expanded', () => {
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

  test('there are as many glyphs as there are colours', () => {
    // The editor lays them out as two rows of the same width and they read as a
    // matched pair. Twelve and nine would look like one of them failed to load.
    assert.equal(FOLDER_ICONS.length, FOLDER_COLORS.length)
    assert.equal(FOLDER_ICONS.length, 12)
  })

  test('every colour has its class and both its theme values', () => {
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

  test('red is not on offer, under any of its names', () => {
    // --green means a positive dollar figure and --cost a negative one. A red
    // folder mark on a page whose every row prints a profit or a loss re-opens
    // the question the palette exists to settle. Pink sits next to red on the
    // wheel and carries none of it.
    for (const forbidden of ['red', 'crimson', 'scarlet', 'ruby']) {
      assert.equal(FOLDER_COLORS.includes(forbidden), false, `${forbidden} is on offer`)
    }
  })

  test('the fold caret is drawn, never typed', () => {
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
  test('no HTML comment carries a backtick', () => {
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
