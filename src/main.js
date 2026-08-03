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
} from './storage.js'
import { renderEnterprises } from './ui/enterprise.js'
import { renderFixed } from './ui/fixed.js'
import { renderResults, showDifferences } from './ui/results.js'
import { renderScenarioList, renderCompare } from './ui/scenarios.js'
import { openInfo, openTypical, openGuide } from './ui/modals.js'
import { usd, usdCents, esc, signClass } from './ui/format.js'
import { matchCategory, EQUIPMENT_CATALOG, BUILDING_CATALOG } from './data/typical-values.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import { downloadCSV, downloadJSON, printResults } from './export.js'

initPrefs()

const app = document.getElementById('app')

let screen = 'build' // 'build' | 'scenarios' | 'compare'
let compareIds = []
let dirty = false

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
    app.innerHTML =
      header() +
      renderEnterprises(scenario) +
      renderFixed(scenario) +
      renderResults(calcScenario(scenario)) +
      footer() +
      stickyBar()
  }

  updateOutputs()
  updateStatus()
}

function header() {
  const scenario = getScenario()
  return `
    <div class="app-head">
      <div class="name-wrap">
        <label class="sr-only" for="scenarioName">Budget name</label>
        <input id="scenarioName" class="scenario-name" value="${esc(scenario.name)}"
          data-path="name" placeholder="Name this budget" />
        <span class="save-state" id="saveState"></span>
      </div>
      <nav class="app-nav">
        <button type="button" class="nav-btn ${screen === 'build' ? 'active' : ''}"
          data-action="go-build">Budget</button>
        <button type="button" class="nav-btn ${screen !== 'build' ? 'active' : ''}"
          data-action="go-scenarios">Saved</button>
        <button type="button" class="help-btn" data-action="how-to"
          aria-label="How to use this calculator" title="How to use this calculator">?</button>
      </nav>
    </div>`
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
  acres: (v) => (Number(v) > 0 ? `${Math.round(Number(v) * 100) / 100} acres` : 'no acres yet'),
}

/** Refresh every derived figure in place, leaving inputs and focus untouched. */
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

  for (const el of document.querySelectorAll('.sticky-bar [data-out]')) {
    const raw = getPath(result, el.getAttribute('data-out'))
    const fmt = FORMATTERS[el.getAttribute('data-fmt')] || usdCents
    el.textContent = fmt(raw)
    el.classList.remove('pos', 'neg')
    const tone = signClass(Number(raw))
    if (tone) el.classList.add(tone)
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
  const path = el.getAttribute?.('data-path')
  if (!path) return

  // Numeric fields keep the raw string while typing ("3." is a legal thing to
  // be in the middle of entering); calc.js coerces with num() anyway.
  const value = el.type === 'number' ? el.value : el.value
  setPath(getScenario(), path, value)

  // The enterprise heading and the equipment category follow the name field.
  if (/^enterprises\.\d+\.crop$/.test(path)) {
    const card = el.closest('.ent')
    const nameEl = card?.querySelector('.ent-name')
    if (nameEl) {
      const index = Number(card.getAttribute('data-ent-index'))
      nameEl.textContent = el.value.trim() || `Enterprise ${index + 1}`
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
    openTypical(typical, btn.getAttribute('data-target'), btn.getAttribute('data-category') || '')
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
      const name = scenario.enterprises[i]?.crop?.trim() || `Enterprise ${i + 1}`
      if (!confirm(`Remove ${name} and everything entered for it?`)) return
      scenario.enterprises.splice(i, 1)
      if (!scenario.enterprises.length) scenario.enterprises.push(newEnterprise())
      notify()
      render()
      break
    }

    case 'toggle-enterprise': {
      const card = btn.closest('.ent')
      const open = card.classList.toggle('collapsed')
      btn.setAttribute('aria-expanded', String(!open))
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

    case 'remove-equipment':
      scenario.fixed.equipment.splice(Number(btn.getAttribute('data-index')), 1)
      notify()
      render()
      break

    case 'add-building':
      scenario.fixed.buildings.push(newBuilding())
      notify()
      render()
      break

    case 'remove-building':
      scenario.fixed.buildings.splice(Number(btn.getAttribute('data-index')), 1)
      notify()
      render()
      break

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
      render()
      break

    case 'open-scenario': {
      if (dirty && !confirm('Open another budget? Unsaved changes to this one will be lost.')) return
      const found = getScenarioById(btn.getAttribute('data-id'))
      if (found) {
        setScenario(found)
        dirty = false
        screen = 'build'
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
      openGuide('How to use this calculator', HOW_TO_SECTIONS)
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
    // Import under a fresh id so it never overwrites an existing budget.
    const copy = duplicateScenario(result.scenario, result.scenario.name)
    saveScenario(copy)
    setScenario(copy)
    dirty = false
    screen = 'build'
    render()
  })
  input.click()
}

/** Last line of defence against losing a budget by closing the tab. */
window.addEventListener('beforeunload', (e) => {
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
