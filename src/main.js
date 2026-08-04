// styles.css is linked from index.html, not imported here — see the comment
// there. Keeping this entry module plain JS lets the smoke tests import it.
import { initPrefs } from './prefs.js'
import { calcScenario } from './calc.js'
import {
  getScenario,
  setScenario,
  getPath,
  setPath,
  notify,
  subscribe,
  clearListeners,
  newScenario,
  newEnterprise,
  newEquipment,
  newBuilding,
  duplicateScenario,
} from './state.js'
import {
  listScenarios,
  getScenarioById,
  saveScenario,
  deleteScenario,
  getLastOpened,
  storageAvailable,
  importScenarioJSON,
  renameScenario,
  reorderScenarios,
} from './storage.js'
import { renderEnterprises } from './ui/enterprise.js'
import { renderFixed } from './ui/fixed.js'
import { renderResults, showDifferences, renderWarningsInto } from './ui/results.js'
import { renderScenarioList, renderCompare } from './ui/scenarios.js'
import { openInfo, openTypical, openGuide } from './ui/modals.js'
import { usd, usdCents, esc, signClass } from './ui/format.js'
import { matchCategory, EQUIPMENT_CATALOG, BUILDING_CATALOG } from './data/typical-values.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import { downloadCSV, downloadJSON, printResults } from './export.js'
import { enterpriseLabel } from './calc.js'

initPrefs()

const app = document.getElementById('app')

let screen = 'build' // 'build' | 'scenarios' | 'compare'
let compareIds = []
let dirty = false

/**
 * Which cards are folded shut, by enterprise id.
 *
 * Deliberately NOT part of the scenario: whether a column is open on this phone
 * right now is not a fact about the farm, and storing it would mean a rename or
 * a fold marked the budget dirty and travelled into the exported file.
 */
const collapsedEnterprises = new Set()
let fixedCollapsed = false
let collapseDefaultsApplied = false

const isNarrow = () => globalThis.matchMedia?.('(max-width: 899px)').matches ?? false

/**
 * On a phone, open the first enterprise and fold the rest.
 *
 * Fifteen expense lines per enterprise is a very long scroll before the second
 * card even begins. Applied once, on the first budget screen, so it never
 * re-folds a card the producer has just opened.
 */
function applyCollapseDefaults(scenario) {
  if (collapseDefaultsApplied) return
  collapseDefaultsApplied = true
  if (!isNarrow()) return
  scenario.enterprises.slice(1).forEach((e) => collapsedEnterprises.add(e.id))
  if (scenario.enterprises.length > 1) fixedCollapsed = true
}

/* ─────────────────────────── render ────────────────────────────────────── */

/**
 * Full re-render, for STRUCTURAL changes only (adding an enterprise, switching
 * screens). Typing never triggers this — see updateOutputs — because replacing
 * the DOM under a focused input would move the caret and lose the keyboard on
 * mobile.
 */
function render() {
  const scenario = getScenario()

  if (screen === 'scenarios') {
    app.innerHTML = header() + renderScenarioList(scenario.id) + footer()
  } else if (screen === 'compare') {
    const picked = compareIds.map((id) => getScenarioById(id)).filter(Boolean)
    app.innerHTML =
      header() +
      (picked.length >= 2
        ? renderCompare(picked)
        : '<section class="box"><p class="hint">Select at least two saved budgets to compare.</p></section>') +
      footer()
  } else {
    applyCollapseDefaults(scenario)
    app.innerHTML =
      header() +
      renderEnterprises(scenario, collapsedEnterprises) +
      renderFixed(scenario, fixedCollapsed) +
      renderResults(calcScenario(scenario)) +
      footer() +
      stickyBar()
  }

  updateOutputs()
  updateStatus()
  if (screen === 'build') sizeNameInput()
}

function header() {
  const scenario = getScenario()

  // The budget name belongs to the budget being edited. On the Saved tab every
  // row carries its own editable name, so a second one floating above the list
  // is just ambiguous — which budget would it rename?
  const nameBlock =
    screen === 'build'
      ? `<div class="name-wrap">
           <label class="sr-only" for="scenarioName">Budget name</label>
           <input id="scenarioName" class="scenario-name" value="${esc(scenario.name)}"
             data-path="name" placeholder="Name this budget" />
           <button type="button" class="edit-name" data-action="focus-name"
             aria-label="Rename this budget" title="Rename this budget">&#9998;</button>
           <span class="save-state" id="saveState"></span>
         </div>`
      : '<div class="name-wrap"><span class="save-state" id="saveState"></span></div>'

  return `
    <div class="app-head">
      ${nameBlock}
      <nav class="app-nav" role="tablist">
        <button type="button" class="tab ${screen === 'build' ? 'active' : ''}"
          role="tab" aria-selected="${screen === 'build'}"
          data-action="go-build">Budget</button>
        <button type="button" class="tab ${screen !== 'build' ? 'active' : ''}"
          role="tab" aria-selected="${screen !== 'build'}"
          data-action="go-scenarios">Saved</button>
        <button type="button" class="help-btn" data-action="how-to"
          aria-label="How to use this calculator" title="How to use this calculator">?</button>
      </nav>
    </div>`
}

/**
 * Shrink the budget-name box to the width of what is actually in it.
 *
 * A full-width text input reads as "this is a form field you must fill in";
 * sized to its content with a pencil beside it, it reads as a title you may
 * rename. `field-sizing: content` does this in CSS but is not yet everywhere,
 * so the width is measured from a mirror span — the same text in the same font,
 * laid out off-screen.
 */
function sizeNameInput() {
  const input = document.getElementById('scenarioName')
  if (!input) return
  let mirror = document.getElementById('nameMirror')
  if (!mirror) {
    mirror = document.createElement('span')
    mirror.id = 'nameMirror'
    mirror.className = 'name-mirror'
    mirror.setAttribute('aria-hidden', 'true')
    document.body.appendChild(mirror)
  }
  mirror.textContent = input.value || input.placeholder || ''

  // Read through the input's own document rather than a bare global, so this
  // works when the app is booted into a synthetic document (the smoke tests)
  // where window globals are not aliased. No measurement is available there and
  // the CSS default width stands — cosmetic, and never a reason to fail.
  const view = input.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return
  const style = view.getComputedStyle(input)
  mirror.style.font = style.font
  mirror.style.letterSpacing = style.letterSpacing
  // A floor keeps an empty name from collapsing to an untappable sliver.
  input.style.width = `${Math.max(mirror.offsetWidth + 26, 90)}px`
}

function footer() {
  return `
    <div class="footer">
      <button type="button" class="tip" data-action="how-to">How to use this calculator</button>
      ·
      <button type="button" class="tip" data-action="export-csv">Export CSV</button>
      ·
      <button type="button" class="tip" data-action="export-json">Save budget file</button>
      ·
      <button type="button" class="tip" data-action="print">Print</button>
      <p>South Dakota Soil Health Coalition · budgets are saved on this device only</p>
    </div>`
}

function stickyBar() {
  return `
    <div class="sticky-bar">
      <div class="sticky-figs">
        <span><small>Total profit</small>
          <b data-out="totals.totalProfit" data-fmt="usd" data-tone="1">—</b></span>
        <span><small>Profit / acre</small>
          <b data-out="totals.profitPerAcre" data-fmt="usdCents" data-tone="1">—</b></span>
      </div>
      <button type="button" class="btn-main" data-action="save-scenario">Save budget</button>
    </div>`
}

/* ───────────────────── live recompute (no re-render) ───────────────────── */

const FORMATTERS = {
  usd,
  usdCents,
  /** Counts and hours — no currency, no trailing zeros on a whole number. */
  plain: (v) => String(Math.round(Number(v) * 100) / 100 || 0),
  acres: (v) => (Number(v) > 0 ? `${Math.round(Number(v) * 100) / 100} acres` : 'no acres yet'),
}

/**
 * Refresh every derived figure in place, leaving inputs and focus untouched.
 *
 * This is the ONLY thing that runs on a keystroke, so anything it does not
 * touch is frozen until the next structural render. That is exactly how the
 * results section and the sticky bar came to disagree — see the note at the top
 * of ui/results.js. Everything derived is now a [data-out] and updates here.
 */
function updateOutputs() {
  if (screen !== 'build') return
  const result = calcScenario(getScenario())

  for (const el of app.querySelectorAll('[data-out]')) {
    const raw = getPath(result, el.getAttribute('data-out'))
    const fmt = FORMATTERS[el.getAttribute('data-fmt')] || usdCents
    el.textContent = fmt(raw)
    if (el.hasAttribute('data-tone')) {
      el.classList.remove('pos', 'neg')
      const tone = signClass(Number(raw))
      if (tone) el.classList.add(tone)
    }
  }

  // Warnings come and go as acres are typed, so they are not part of the
  // rendered markup either.
  const warnBox = app.querySelector('[data-warnings]')
  if (warnBox) renderWarningsInto(warnBox, result.warnings)

  // The results table names each enterprise; renaming one must not need a
  // re-render, which would drop focus out of the box being typed into.
  for (const el of app.querySelectorAll('[data-ent-label]')) {
    const label = result.enterprises[Number(el.getAttribute('data-ent-label'))]?.label
    if (label != null) el.textContent = label
  }
}

function updateStatus() {
  const el = document.getElementById('saveState')
  if (!el) return
  if (!storageAvailable()) {
    el.textContent = 'This browser will not save budgets'
    el.className = 'save-state warn'
  } else {
    el.textContent = dirty ? 'Unsaved changes' : 'Saved'
    el.className = `save-state ${dirty ? 'dirty' : ''}`
  }
}

/* ─────────────────────────── input handling ────────────────────────────── */

/**
 * One delegated listener for every field. Inputs declare where they write via
 * data-path, so a new field needs markup only — never a handler.
 */
app.addEventListener('input', (e) => {
  const el = e.target

  // Renaming on the Saved tab writes straight to the stored record. It is NOT
  // the working scenario — the producer may be looking at a list row for a
  // budget they do not currently have open — so it never goes through
  // setPath/notify, and never marks the open budget dirty.
  const renameId = el.getAttribute?.('data-scn-name')
  if (renameId) {
    queueRename(renameId, el.value)
    return
  }

  const path = el.getAttribute?.('data-path')
  if (!path) return

  // Numeric fields keep the raw string while typing ("3." is a legal thing to
  // be in the middle of entering); calc.js coerces with num() anyway.
  setPath(getScenario(), path, el.value)

  if (path === 'name') sizeNameInput()

  // The card heading follows whichever of name/crop is providing the label.
  if (/^enterprises\.\d+\.(name|crop)$/.test(path)) {
    const card = el.closest('.ent')
    const nameEl = card?.querySelector('.ent-name')
    if (nameEl) {
      const index = Number(card.getAttribute('data-ent-index'))
      const label = enterpriseLabel(getScenario().enterprises[index], index)
      nameEl.textContent = label
      // The visible heading is not the only place the name appears. Both of
      // these carry it in an aria-label baked in at render time, so without
      // this a screen reader keeps announcing "Remove Corn" long after the
      // column was renamed — the one user who cannot see the heading update.
      const toggle = card.querySelector('.ent-toggle')
      if (toggle) {
        const shut = card.classList.contains('collapsed')
        toggle.setAttribute('aria-label', `${shut ? 'Expand' : 'Collapse'} ${label}`)
      }
      card
        .querySelector('[data-action="remove-enterprise"]')
        ?.setAttribute('aria-label', `Remove ${label}`)
    }
  }

  if (/^fixed\.(equipment|buildings)\.\d+\.name$/.test(path)) {
    const isBuilding = path.includes('buildings')
    const category = matchCategory(
      el.value,
      isBuilding ? BUILDING_CATALOG : EQUIPMENT_CATALOG
    )
    // Only ever sets a hidden category used to filter suggestions. It does not
    // fill any field — nothing on this page auto-fills.
    setPath(getScenario(), path.replace(/\.name$/, '.category'), category)
    const typicalBtn = el
      .closest('.item')
      ?.querySelector('[data-typical="usefulLifeEquipment"]')
    if (typicalBtn) typicalBtn.setAttribute('data-category', category)
  }

  notify()
})

app.addEventListener('change', (e) => {
  const path = e.target.getAttribute?.('data-path')
  if (path && e.target.tagName === 'SELECT') {
    setPath(getScenario(), path, e.target.value)
    notify()
  }
  if (e.target.matches('[data-compare-id]')) refreshCompareButton()
})

/* ─────────────────── inline rename on the Saved tab ────────────────────── */

/**
 * Autosave a rename, one write per pause in typing.
 *
 * Writing on every keystroke would mean a full read-parse-stringify-write of
 * the whole budget list per character. The delay is short enough that a
 * producer who taps away immediately still lands inside it, and a blur or a
 * screen change flushes whatever is pending.
 */
const renameTimers = new Map()
const RENAME_DELAY = 400

function queueRename(id, name) {
  clearTimeout(renameTimers.get(id))
  renameTimers.set(
    id,
    setTimeout(() => {
      renameTimers.delete(id)
      commitRename(id, name)
    }, RENAME_DELAY)
  )
}

function commitRename(id, name) {
  const result = renameScenario(id, name)
  if (result.ok) {
    // Renaming the budget that is currently open keeps the two views in step.
    const open = getScenario()
    if (open?.id === id) open.name = name
    return
  }

  // Any failure means the new name is NOT on disk, so it must not be copied
  // into the open budget either — that would leave the header showing one name
  // and the list another, with the producer told nothing.
  if (result.error === 'QuotaExceededError') {
    alert('This browser has run out of storage space, so that rename was not saved.')
  } else if (result.error !== 'NotFound') {
    // NotFound means the budget was deleted, here or in another tab. The row is
    // about to disappear anyway, so an alert would only be noise.
    alert('That rename could not be saved. This browser may be blocking storage.')
  }
  if (screen === 'scenarios') render()
}

/**
 * CSS.escape where available — ids only ever contain word characters and
 * hyphens today, but a selector built from data is one changed id generator away
 * from being a crash. ui/modals.js already guards this way.
 */
function attrSelect(name, value) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(value) : value
  return `[${name}="${escaped}"]`
}

/** Flush every pending rename now — before navigating away or closing the tab. */
function flushRenames() {
  for (const [id, timer] of renameTimers) {
    clearTimeout(timer)
    const input = document.querySelector(attrSelect('data-scn-name', id))
    if (input) commitRename(id, input.value)
  }
  renameTimers.clear()
}

app.addEventListener(
  'blur',
  (e) => {
    const id = e.target.getAttribute?.('data-scn-name')
    if (id && renameTimers.has(id)) {
      clearTimeout(renameTimers.get(id))
      renameTimers.delete(id)
      commitRename(id, e.target.value)
    }
  },
  true
)

/* ─────────────────── drag to reorder the Saved list ────────────────────── */

let draggingId = null

app.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.scn')
  if (!row) return
  draggingId = row.getAttribute('data-scn-id')
  row.classList.add('dragging')
  // Optional: a synthetic dragstart carries no dataTransfer, and a missing
  // clipboard is no reason to abandon the drag.
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag unless some data is set.
    e.dataTransfer.setData('text/plain', draggingId)
  }
})

app.addEventListener('dragover', (e) => {
  const list = e.target.closest?.('[data-scn-list]')
  if (!list || !draggingId) return
  e.preventDefault()
  const dragged = list.querySelector('.dragging')
  const over = e.target.closest('.scn')
  if (!dragged || !over || over === dragged) return
  // Insert before or after depending on which half of the row we are over, so
  // the placeholder follows the pointer instead of jumping a row late.
  const box = over.getBoundingClientRect()
  const after = e.clientY > box.top + box.height / 2
  list.insertBefore(dragged, after ? over.nextSibling : over)
})

app.addEventListener('drop', (e) => {
  if (draggingId) e.preventDefault()
})

app.addEventListener('dragend', (e) => {
  const list = app.querySelector('[data-scn-list]')
  app.querySelector('.scn.dragging')?.classList.remove('dragging')
  if (!list || !draggingId) return
  draggingId = null

  // Escape cancels a drag, but the rows have already been moved by dragover, so
  // the browser has nothing to put back — only this code can. Re-render from
  // storage to restore the saved order rather than committing an arrangement
  // the producer just backed out of.
  if (e.dataTransfer && e.dataTransfer.dropEffect === 'none') {
    render()
    return
  }

  const order = [...list.querySelectorAll('.scn')].map((el) => el.getAttribute('data-scn-id'))
  if (!reorderScenarios(order).ok) {
    alert('This browser would not save the new order.')
    render()
  }
})

/* ─────────────────────────── actions ───────────────────────────────────── */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button')
  if (!btn) return

  // `?` — read-only, always.
  const info = btn.getAttribute('data-info')
  if (info) {
    openInfo(info.split(','), btn.getAttribute('data-info-title') || undefined)
    return
  }

  // "use typical value" — writes exactly one field.
  const typical = btn.getAttribute('data-typical')
  if (typical) {
    // A variable-expense line also passes its entry mode, so the picker can
    // tell a $/acre list from a $/bushel one and land the figure in the right
    // box rather than the box that happens to be showing.
    const modePath = btn.getAttribute('data-mode-path')
    const line = modePath
      ? {
          modePath,
          mode: btn.getAttribute('data-line-mode'),
          perAcreTarget: btn.getAttribute('data-target-per-acre'),
          unitTarget: btn.getAttribute('data-target-unit'),
        }
      : null
    openTypical(
      typical,
      btn.getAttribute('data-target'),
      btn.getAttribute('data-category') || '',
      line
    )
    return
  }

  const action = btn.getAttribute('data-action')
  if (!action) return
  handleAction(action, btn)
})

function handleAction(action, btn) {
  const scenario = getScenario()

  switch (action) {
    case 'add-enterprise':
      scenario.enterprises.push(newEnterprise())
      notify()
      render()
      break

    case 'remove-enterprise': {
      const i = Number(btn.getAttribute('data-index'))
      const removed = scenario.enterprises[i]
      if (!confirm(`Remove ${enterpriseLabel(removed, i)} and everything entered for it?`)) return
      collapsedEnterprises.delete(removed?.id)
      scenario.enterprises.splice(i, 1)
      if (!scenario.enterprises.length) scenario.enterprises.push(newEnterprise())
      notify()
      render()
      break
    }

    case 'toggle-enterprise': {
      const card = btn.closest('.ent')
      const id = card.getAttribute('data-ent-id')
      const shut = card.classList.toggle('collapsed')
      if (shut) collapsedEnterprises.add(id)
      else collapsedEnterprises.delete(id)
      btn.setAttribute('aria-expanded', String(!shut))
      const label = card.querySelector('.ent-name')?.textContent ?? ''
      btn.setAttribute('aria-label', `${shut ? 'Expand' : 'Collapse'} ${label}`)
      break
    }

    case 'toggle-fixed': {
      const block = btn.closest('.fixed-block')
      fixedCollapsed = block.classList.toggle('collapsed')
      btn.setAttribute('aria-expanded', String(!fixedCollapsed))
      break
    }

    case 'focus-name': {
      const input = document.getElementById('scenarioName')
      input?.focus()
      input?.select()
      break
    }

    case 'toggle-line-mode': {
      const path = btn.getAttribute('data-path')
      const next = btn.getAttribute('data-mode') === 'perAcre' ? 'unit' : 'perAcre'
      setPath(scenario, path, next)
      notify()
      render()
      break
    }

    case 'toggle-preharvest': {
      const path = btn.getAttribute('data-path')
      setPath(scenario, path, btn.getAttribute('data-mode') !== 'auto')
      notify()
      render()
      break
    }

    case 'add-equipment':
      scenario.fixed.equipment.push(newEquipment())
      notify()
      render()
      break

    case 'remove-equipment': {
      const i = Number(btn.getAttribute('data-index'))
      if (!confirmRemoveItem(scenario.fixed.equipment[i], 'equipment')) return
      scenario.fixed.equipment.splice(i, 1)
      notify()
      render()
      break
    }

    case 'add-building':
      scenario.fixed.buildings.push(newBuilding())
      notify()
      render()
      break

    case 'remove-building': {
      const i = Number(btn.getAttribute('data-index'))
      if (!confirmRemoveItem(scenario.fixed.buildings[i], 'building')) return
      scenario.fixed.buildings.splice(i, 1)
      notify()
      render()
      break
    }

    case 'save-scenario': {
      let result = saveScenario(scenario)

      // Another tab or window changed this budget after we opened it. Ask
      // rather than silently overwrite someone's work.
      if (!result.ok && result.error === 'Conflict') {
        const when = new Date(result.theirs.updatedAt)
        const overwrite = confirm(
          `This budget was changed somewhere else${
            isNaN(when) ? '' : ` at ${when.toLocaleTimeString()}`
          } — probably in another tab.\n\n` +
            'Save anyway and replace that version?\n\n' +
            'Cancel to leave it alone. You can export this copy to a file instead.'
        )
        if (!overwrite) break
        result = saveScenario(scenario, { force: true })
      }

      if (result.ok) {
        dirty = false
        updateStatus()
        flashSaved()
      } else if (result.error === 'QuotaExceededError') {
        alert(
          'This browser has run out of storage space. Delete an old budget, or export this one to a file.'
        )
      } else {
        alert('This browser will not let the app save budgets. Export to a file instead.')
      }
      break
    }

    case 'go-build':
      flushRenames()
      screen = 'build'
      render()
      break

    case 'go-scenarios':
      screen = 'scenarios'
      render()
      break

    case 'new-scenario':
      if (dirty && !confirm('Start a new budget? Unsaved changes to this one will be lost.')) return
      setScenario(newScenario())
      dirty = false
      screen = 'build'
      collapsedEnterprises.clear()
      render()
      break

    case 'open-scenario': {
      if (dirty && !confirm('Open another budget? Unsaved changes to this one will be lost.')) return
      flushRenames()
      const found = getScenarioById(btn.getAttribute('data-id'))
      if (found) {
        setScenario(found)
        dirty = false
        screen = 'build'
        collapsedEnterprises.clear()
        collapseDefaultsApplied = false
        render()
      }
      break
    }

    case 'duplicate-scenario': {
      const source = getScenarioById(btn.getAttribute('data-id'))
      if (!source) return
      const copy = duplicateScenario(source)
      const saved = saveScenario(copy)
      if (!saved.ok) {
        alert('Could not save the copy — this browser is out of storage space.')
        return
      }
      setScenario(copy)
      dirty = false
      screen = 'build'
      render()
      break
    }

    case 'delete-scenario': {
      const id = btn.getAttribute('data-id')
      const target = getScenarioById(id)
      if (!target) return
      if (!confirm(`Delete "${target.name}"? This cannot be undone.`)) return
      deleteScenario(id)
      compareIds = compareIds.filter((x) => x !== id)
      render()
      break
    }

    case 'move-scenario-up':
    case 'move-scenario-down': {
      flushRenames()
      const id = btn.getAttribute('data-id')
      const order = listScenarios().map((s) => s.id)
      const from = order.indexOf(id)
      const to = action === 'move-scenario-up' ? from - 1 : from + 1
      if (from < 0 || to < 0 || to >= order.length) break
      order.splice(to, 0, ...order.splice(from, 1))
      if (!reorderScenarios(order).ok) {
        alert('This browser would not save the new order.')
        break
      }
      render()
      // Keep the keyboard on the button that just moved, so a budget can be
      // walked up the list with repeated presses instead of one press and a hunt.
      document
        .querySelector(
          `${attrSelect('data-action', action)}${attrSelect('data-id', id)}:not([disabled])`
        )
        ?.focus()
      break
    }

    case 'compare-selected':
      compareIds = [...document.querySelectorAll('[data-compare-id]:checked')].map((el) =>
        el.getAttribute('data-compare-id')
      )
      if (compareIds.length < 2) return
      screen = 'compare'
      render()
      break

    case 'back-to-scenarios':
      screen = 'scenarios'
      render()
      break

    case 'import-scenario':
      importFromFile()
      break

    case 'how-to':
      // Folded shut so the whole guide is one screen of headings you can pick
      // from, rather than several screens of scrolling to reach the last one.
      openGuide('How to use this calculator', HOW_TO_SECTIONS, { collapsible: true })
      break

    case 'show-differences':
      showDifferences()
      break

    case 'export-csv':
      downloadCSV(scenario)
      break

    case 'export-json':
      downloadJSON(scenario)
      break

    case 'print':
      printResults()
      break
  }
}

/**
 * Ask before discarding a filled-in machine or building.
 *
 * Removing an enterprise has always asked; these did not, even though a single
 * equipment row can hold four typed figures and there is no undo. An EMPTY row
 * is removed without a prompt — a producer who added a row by mistake should not
 * have to answer a question to take it away again.
 */
function confirmRemoveItem(item, kind) {
  if (!item) return true
  const hasData = ['name', 'initialCost', 'salvageValue', 'usefulLife', 'interestRate'].some(
    (k) => String(item[k] ?? '').trim() !== ''
  )
  if (!hasData) return true
  return confirm(`Remove ${item.name?.trim() || `this ${kind}`} and everything entered for it?`)
}

function refreshCompareButton() {
  const count = document.querySelectorAll('[data-compare-id]:checked').length
  const btn = document.querySelector('[data-action="compare-selected"]')
  if (btn) {
    btn.disabled = count < 2
    btn.textContent = count < 2 ? 'Compare selected' : `Compare ${count} budgets`
  }
}

function flashSaved() {
  const el = document.getElementById('saveState')
  if (!el) return
  el.textContent = 'Saved'
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 700)
}

/**
 * Name an imported budget so it can be told apart from what is already saved.
 *
 * Importing your own exported file is the normal case — moving a budget from a
 * phone to a laptop — so a name collision is expected, not exceptional. Two
 * identical rows in the list with no way to tell which is which is the failure
 * to avoid; the suffix says where the newcomer came from. A second import of
 * the same file numbers itself rather than colliding again.
 */
function nameForImport(name, existingNames) {
  if (!existingNames.has(name)) return name
  const tagged = `${name} (opened from file)`
  if (!existingNames.has(tagged)) return tagged
  let n = 2
  while (existingNames.has(`${tagged} ${n}`)) n += 1
  return `${tagged} ${n}`
}

function importFromFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    const result = importScenarioJSON(await file.text())
    if (!result.ok) {
      alert(result.error)
      return
    }
    const taken = new Set(listScenarios().map((s) => s.name))
    // Import under a fresh id so it never overwrites an existing budget.
    const copy = duplicateScenario(result.scenario, nameForImport(result.scenario.name, taken))
    const saved = saveScenario(copy)
    if (!saved.ok) {
      alert('Could not save the opened budget — this browser is out of storage space.')
      return
    }
    setScenario(copy)
    dirty = false
    screen = 'build'
    collapsedEnterprises.clear()
    collapseDefaultsApplied = false
    render()
  })
  input.click()
}

/**
 * A structural re-render asked for by a module that must not import this one.
 *
 * The typical-value picker can switch a line's entry mode, which swaps which
 * inputs exist. ui/modals.js announces that rather than calling render()
 * directly, so it keeps no dependency on the app shell.
 */
document.addEventListener('fb:rerender', (e) => {
  notify()
  render()
  const path = e.detail?.flash
  if (!path) return
  const input = app.querySelector(`[data-path="${path}"]`)
  if (!input) return
  input.classList.add('flash')
  input.focus()
})

/** Last line of defence against losing a budget by closing the tab. */
window.addEventListener('beforeunload', (e) => {
  // A rename waiting on its debounce timer would be lost with the page.
  flushRenames()
  if (!dirty) return
  e.preventDefault()
  e.returnValue = ''
})

/* ─────────────────────────── boot ──────────────────────────────────────── */

// Deliberately last. render() reads const bindings declared above it (FORMATTERS
// in particular), so booting from the top of the file hits their temporal dead
// zone and the app never renders. Keep this block at the bottom.

clearListeners()

const last = getLastOpened()
setScenario((last && getScenarioById(last)) || newScenario())
render()

subscribe(() => {
  dirty = true
  updateOutputs()
  updateStatus()
})
