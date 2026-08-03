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

  test('the how-to guide covers saving and comparing scenarios', () => {
    click('[data-action="how-to"]')
    const body = doc.querySelector('.overlay.open .modal-body').textContent
    assert.match(body, /Duplicate it/i)
    assert.match(body, /Compare/i)
    assert.match(body, /Silage/i)
    assert.match(body, /No-Till/i)
  })

  test('the divergence note explains the equipment interest correction', () => {
    click('[data-action="show-differences"]')
    const body = doc.querySelector('.overlay.open .modal-body').textContent
    assert.match(body, /equipment interest/i)
    assert.match(body, /weighted/i)
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
    assert.match(textOf('.scn-name'), /Field corn, conventional/)
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
