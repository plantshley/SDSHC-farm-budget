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
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

let dom
let win
let doc
let app

/** Boot index.html with a working localStorage, then import main.js into it. */
async function boot() {
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

    assert.equal(textOf('#saveState'), 'Saved')
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
    assert.equal(textOf('#saveState'), 'Saved')
    click('.ent [data-action="toggle-enterprise"]')
    assert.equal(textOf('#saveState'), 'Saved')
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
    assert.equal(textOf('#saveState'), 'Saved')

    // Same value again, as a focus or an arrow key on a number box produces.
    type('enterprises.0.acres', '500')
    assert.equal(textOf('#saveState'), 'Saved')
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
    assert.equal(textOf('#saveState'), 'Saved')

    type('fixed.equipment.0.salvageValue', '50000')
    assert.equal(textOf('#saveState'), 'Saved')
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

    click('.scn:last-child [data-action="move-scenario-up"]')
    assert.deepEqual(names(), ['Third', 'First', 'Second'])

    // The order is persisted, not just shuffled on screen.
    click('[data-action="go-build"]')
    click('[data-action="go-scenarios"]')
    assert.deepEqual(names(), ['Third', 'First', 'Second'])
  })

  test('the handle reorders by finger, not just by mouse', () => {
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
    // real browser answers this from the coordinates.
    doc.elementFromPoint = () => rows[0]
    touch('pointermove', { clientY: 0 })
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
