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
  listFolders,
  reorderFolders,
  moveScenarioToFolder,
} from './storage.js'
import { openMoveModal, openFolderEditor, folderCountText } from './ui/folders.js'
import { renderEnterprises } from './ui/enterprise.js'
import { renderFixed, OVERHEAD_LINES } from './ui/fixed.js'
import { renderResults, renderWarningsInto } from './ui/results.js'
import { renderScenarioList, renderCompare, scenarioHint } from './ui/scenarios.js'
import { openInfo, openTypical, openGuide } from './ui/modals.js'
import { usd, usdCents, esc, signClass } from './ui/format.js'
import { matchCategory, EQUIPMENT_CATALOG, BUILDING_CATALOG } from './data/typical-values.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import { downloadCSV, downloadCompareCSV, downloadJSON, printResults } from './export.js'
import { enterpriseLabel, VARIABLE_LINES, COST_BASIS } from './calc.js'

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

/**
 * What is typed in the Saved tab's filter box.
 *
 * UI state for the same reason the folds above are: which budgets a producer is
 * looking at right now is not a fact about any farm, so it is neither in the
 * scenario nor in localStorage. It does survive render() — the list re-renders
 * on a delete, a reorder and a failed rename, none of which are a reason for
 * the box to empty itself — and it is cleared whenever the set of saved budgets
 * GROWS, so a newly saved budget can never arrive filtered out of sight.
 */
let scenarioFilter = ''

/**
 * Which folder sections are open, by id. The ungrouped pile is `''`.
 *
 * UI state, like the folds above and for the same reason: whether a section is
 * open on this phone right now is not a fact about any farm, so it is neither in
 * the scenario nor in localStorage.
 *
 * A set of OPEN ids rather than closed ones, because folders default shut and
 * "not in the set" is then the resting state — a set of closed ids would have to
 * be re-seeded every time a folder was created, and a folder the app forgot to
 * seed would spring open. The ungrouped pile is seeded open here because it is
 * not a folder: it is where a budget saved a moment ago lands, and a Saved tab
 * whose every section is shut has hidden every piece of work the producer came
 * to find.
 */
const expandedFolders = new Set([''])

/**
 * One-shot messages saying why a figure just vanished from a card, by
 * enterprise index. Each is `{ text, paths }` — the words, and the fields the
 * words are about, so focusing one of them can dismiss the message.
 *
 * Consumed by the render that follows the change and dropped at the end of it,
 * so it is a notice about something that just happened rather than a piece of
 * the budget. Same reasoning as collapsedEnterprises: not a fact about the farm,
 * so not in the scenario and not in storage.
 */
const unitNotices = new Map()

/** The same thing for the shared fixed-cost block, which has no index. */
let fixedNotice = null

/**
 * Whether the budget on screen was created here rather than read from storage.
 *
 * The only thing this decides is whether one enterprise starts open — see
 * applyCollapseDefaults. A new budget has exactly one and nothing else to look
 * at; an opened one is a farm you already built and are coming back to.
 */
let scenarioIsNew = true

const isNarrow = () => globalThis.matchMedia?.('(max-width: 899px)').matches ?? false

/**
 * Every enterprise starts folded, at every width.
 *
 * A card is fifteen expense lines tall. Opening one is a decision to work on
 * that enterprise, and it should be the producer's, not a side effect of the
 * budget having loaded. On a phone the alternative is scrolling past a whole
 * enterprise to reach the second; on a computer it is columns squeezed narrow to
 * fit contents nobody is reading yet.
 *
 * The single exception is the one enterprise a NEW budget starts with. There is
 * nothing to choose between, nothing to come back to, and no other place to
 * begin typing — a fresh budget that opens as one shut card and a Save button is
 * a worse first screen than any amount of scrolling.
 *
 * Applied once per budget, so it never re-folds a card the producer just opened.
 */
function applyCollapseDefaults(scenario) {
  if (collapseDefaultsApplied) return
  collapseDefaultsApplied = true

  const keepOpen = scenarioIsNew ? 1 : 0
  scenario.enterprises.slice(keepOpen).forEach((e) => collapsedEnterprises.add(e.id))

  // Fixed costs still fold on a phone only. It is one block rather than one per
  // enterprise, and on a wide screen it sits below everything anyway.
  if (isNarrow() && scenario.enterprises.length > 1) fixedCollapsed = true
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
    app.innerHTML =
      header() + renderScenarioList(scenario.id, scenarioFilter, expandedFolders) + footer()
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
      renderEnterprises(scenario, collapsedEnterprises, unitNotices) +
      renderFixed(scenario, fixedCollapsed, fixedNotice) +
      renderResults(calcScenario(scenario)) +
      footer() +
      stickyBar()
  }

  updateOutputs()
  updateStatus()
  sizeNameInputs()
  // A no-op on every screen but the saved list. The filter survives a render,
  // so a list rebuilt underneath it has to be re-filtered to match the box.
  applyScenarioFilter()
  // Shown once, by the render that answers the change that raised it.
  unitNotices.clear()
  fixedNotice = null
}

/**
 * A notice is answered by going to the field it is about.
 *
 * It explains why a box is empty. The moment the producer taps into that box
 * they have taken the point and are about to fill it in, and leaving the
 * paragraph sitting above them while they type turns an explanation into a
 * standing complaint. Removed from the DOM directly rather than through
 * render(), which would take the focus they just gave the input.
 *
 * Only the fields the notice actually names dismiss it. Tabbing past a
 * neighbouring box is not reading it.
 */
app.addEventListener('focusin', (e) => {
  const path = e.target.getAttribute?.('data-path')
  if (!path) return
  for (const notice of app.querySelectorAll('.unit-notice')) {
    if (notice.getAttribute('data-notice-for')?.split(' ').includes(path)) notice.remove()
  }
})

function header() {
  const scenario = getScenario()

  // The budget name belongs to the budget being edited. On the Saved tab every
  // row carries its own editable name, so a second one floating above the list
  // is just ambiguous — which budget would it rename?
  const nameBlock =
    screen === 'build'
      ? `<div class="name-wrap">
           <span class="title-row">
             <label class="sr-only" for="scenarioName">Budget name</label>
             <span class="name-edit">
               <input id="scenarioName" class="scenario-name" value="${esc(scenario.name)}"
                 data-path="name" placeholder="Name this budget" />
               <button type="button" class="edit-name" data-action="focus-name"
                 aria-label="Rename this budget" title="Rename this budget">&#9998;</button>
             </span>
           </span>
           <!-- Beside the name because it is the same kind of thing: a label for
                the whole budget rather than a figure in it. The caption is not
                decoration — a bare four-digit box next to a title reads as a
                version number, and once it is filled in a placeholder is gone.
                On a phone .name-wrap turns into a column, so this drops to its
                own row and the title gets the width to itself. -->
           <span class="year-edit">
             <label class="year-label" for="scenarioYear">(Optional) Scenario year:</label>
             <input id="scenarioYear" class="scenario-year" type="number"
               inputmode="numeric" step="1" data-path="scenarioYear"
               value="${esc(scenario.scenarioYear ?? '')}"
               placeholder="${new Date().getFullYear()}" />
           </span>
         </div>`
      : ''

  return `
    <div class="app-head">
      ${nameBlock}
      <!-- A direct child of the header, between the name and the tabs, because
           it has to land in a different place at each width: beside the tabs on
           a computer, and on the end of the title row on a phone. One element in
           one place in the DOM, moved by the flex rules alone — it cannot be
           rendered twice, because updateStatus() and flashSaved() address it by
           id. -->
      <span class="save-state" id="saveState"></span>
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
function sizeNameInputs() {
  // The header name and every row on the Saved tab, which needs the same
  // treatment for the same reason and additionally so the "open" tag lands
  // directly after the pencil rather than at the far end of a full-width box.
  sizeNameInput(document.getElementById('scenarioName'), 50, 118)
  for (const el of document.querySelectorAll('.scn-name-input')) sizeNameInput(el, 44, 92)
}

/**
 * @param {HTMLInputElement|null} input
 * @param {number} allowance  the box's own horizontal padding plus the pencil,
 *   which sits INSIDE the right edge rather than beside the box. Too small and
 *   the last character disappears under the pencil the moment it fades in.
 * @param {number} floor  keeps an empty name from collapsing to an untappable
 *   sliver.
 */
function sizeNameInput(input, allowance, floor) {
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
  input.style.width = `${Math.max(mirror.offsetWidth + allowance, floor)}px`
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
      <p>South Dakota Soil Health Coalition</p>
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

/**
 * The word "Saved" also names a tab, three inches to the right of this. The tick
 * is what stops the two reading as the same control — one is a state, the other
 * is somewhere to go.
 *
 * A plain U+2713, not an emoji: it renders in the page's own font at the page's
 * own size and colour, which is the whole reason the theme toggle uses inline
 * SVG rather than ✅ (see prefs.js). Only the settled state gets a mark; a tick
 * beside "Unsaved changes" would be saying two opposite things at once.
 */
const SAVED_LABEL = '✓ Saved'

function updateStatus() {
  const el = document.getElementById('saveState')
  if (!el) return
  if (!storageAvailable()) {
    el.textContent = 'This browser will not save budgets'
    el.className = 'save-state warn'
  } else {
    el.textContent = dirty ? 'Unsaved changes' : SAVED_LABEL
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
    // The row's name box is sized to its text, so it has to grow as it is typed
    // in. Without this, typing past the original name runs off the end of a box
    // that no longer fits it.
    sizeNameInput(el, 44, 92)
    return
  }

  // The filter box is a view over the list, not a value in anything. It writes
  // no scenario, marks nothing dirty, and never re-renders.
  if (el.hasAttribute?.('data-scn-filter')) {
    scenarioFilter = el.value
    applyScenarioFilter()
    return
  }

  const path = el.getAttribute?.('data-path')
  if (!path) return

  // A keystroke that leaves the value where it was is not an edit. Without this
  // check, tabbing through a form, or an arrow key on a number box that is
  // already at its value, marks the budget unsaved — and the browser then asks
  // "are you sure you want to leave?" on the way out, over nothing. The stored
  // value may be a number while the box hands back a string, so compare as text.
  if (String(getPath(getScenario(), path) ?? '') === String(el.value)) return

  // Numeric fields keep the raw string while typing ("3." is a legal thing to
  // be in the middle of entering); calc.js coerces with num() anyway.
  setPath(getScenario(), path, el.value)

  if (path === 'name') sizeNameInput(el, 50, 118)

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
    const changedUnit = /^enterprises\.(\d+)\.yieldUnit$/.exec(path)
    if (changedUnit) dropStaleTypicalValues(Number(changedUnit[1]), e.target.value)

    const changedPeriod = /^fixed\.annualBasis\.(\w+)$/.exec(path)
    if (changedPeriod) dropStaleOverheadValue(changedPeriod[1], e.target.value)
  }
  if (e.target.matches('[data-compare-id]')) refreshCompareButton()
})

/**
 * Changing an enterprise's yield unit invalidates any figure taken from a table
 * quoted in the old one.
 *
 * Hauling is published in $/bushel. Switch the enterprise from bushels to tons
 * and that $0.135 is now $0.135 a TON — off by roughly the weight of a ton of
 * corn, in the flattering direction, with a number on screen that looks exactly
 * as reasonable as it did a moment ago. Nothing downstream can detect it,
 * because $0.135 is a perfectly ordinary cost per unit.
 *
 * Only figures the PICKER wrote are cleared: those carry `typicalYieldUnit`,
 * set when the value was applied. A number the producer typed is theirs and is
 * left alone, however unlikely it looks — the app knows the unit changed, not
 * what the producer meant by it.
 */
function dropStaleTypicalValues(index, unit) {
  const ent = getScenario().enterprises?.[index]
  if (!ent?.variable) return

  const cleared = []
  const paths = []
  let was = ''
  for (const [key, line] of Object.entries(ent.variable)) {
    if (!line || typeof line !== 'object') continue
    if (!line.typicalYieldUnit || line.typicalYieldUnit === unit) continue
    cleared.push(VARIABLE_LINES.find((d) => d.key === key)?.label ?? key)
    paths.push(`enterprises.${index}.variable.${key}.costPerUnit`)
    was ||= line.typicalYieldUnit // read before the marker is dropped
    line.costPerUnit = ''
    delete line.typicalYieldUnit
  }
  if (!cleared.length) return

  const one = cleared.length === 1
  unitNotices.set(index, {
    paths,
    text:
      `${listOf(cleared)} ${one ? 'was' : 'were'} filled in from a table quoted per ${was}. ` +
      `This enterprise is now measured in ${unit}, so ${one ? 'that figure was' : 'those were'} ` +
      `cleared. Pick a typical value again or enter your own.`,
  })
  notify()
  render()
}

function listOf(items) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The same problem one field over: an overhead figure taken from the picker is a
 * published ANNUAL rate, and the period select is what says so.
 *
 * The picker moves the select to "$ / year" when it writes the value, and
 * records that it did. Move the select to "$ / month" afterwards and calcFixed()
 * multiplies a figure that is already a year's worth by twelve — $3,055 of
 * utilities becomes $36,660, which on a 500-acre farm is most of a fixed-cost
 * line appearing out of nowhere.
 *
 * As with the yield unit, only a figure the picker wrote is cleared: a producer
 * who typed their own number and then changed the period is converting it on
 * purpose, which is the entire reason the select exists.
 */
function dropStaleOverheadValue(key, period) {
  const fixed = getScenario().fixed
  const quotedFor = fixed?.annualTypicalBasis?.[key]
  if (!quotedFor || quotedFor === period) return

  // A hand-edited or very old file can be missing `annual` entirely, and this
  // must not be the thing that throws on a select change.
  fixed.annual ??= {}
  fixed.annual[key] = ''
  delete fixed.annualTypicalBasis[key]

  const label = OVERHEAD_LINES.find((o) => o.key === key)?.label ?? key
  const now = COST_BASIS.find((b) => b.key === period)?.label ?? period
  fixedNotice = {
    paths: [`fixed.annual.${key}`],
    text:
      `${label} was filled in from a figure published for a full ${quotedFor}. ` +
      `You have moved that line to ${now}, so it was cleared. ` +
      `Enter the amount for the period you have chosen, or pick a typical value again.`,
  }
  notify()
  render()
}

/* ────────────────────── filtering the Saved tab ────────────────────────── */

/**
 * Hide the rows that do not match, in place.
 *
 * Deliberately NOT a render(): this runs on every keystroke, and replacing the
 * DOM under the box being typed into would move the caret and drop the mobile
 * keyboard, which is the same rule updateOutputs() exists for. It would also
 * throw away every compare tick, so a search mid-selection would silently undo
 * the selection it was helping with.
 */
function applyScenarioFilter() {
  const root = app.querySelector('[data-scn-sections]')
  if (!root) return

  const query = scenarioFilter.trim().toLowerCase()
  const rows = [...root.querySelectorAll('.scn')]
  let shown = 0

  for (const row of rows) {
    const match = !query || (row.getAttribute('data-scn-search') || '').includes(query)
    row.hidden = !match
    if (match) shown += 1
  }

  applySectionVisibility(root, Boolean(query))

  const hint = app.querySelector('[data-scn-hint]')
  if (hint) hint.textContent = scenarioHint(shown, rows.length, Boolean(query))

  const empty = app.querySelector('[data-scn-empty]')
  if (empty) {
    empty.hidden = shown > 0
    empty.textContent = `No saved budget matches "${scenarioFilter.trim()}". Try part of a budget name, an enterprise name, or a crop.`
  }

  const clear = app.querySelector('[data-action="clear-scn-filter"]')
  if (clear) clear.hidden = !query

  setReorderEnabled(root, !query)
  refreshCompareButton()
}

/**
 * A filter has to reach inside a shut folder, or it is lying about the list.
 *
 * Folders start closed, so a match sitting inside one is invisible — the exact
 * failure the land-rent county search already hit, where a search appeared to
 * find nothing while the row sat in a closed fold. So while a filter is running:
 * a section holding a match is forced open, and a section holding none is hidden
 * whole rather than left as a heading over nothing.
 *
 * None of that touches `expandedFolders`. The producer's own arrangement is
 * restored the moment the box is cleared, because a search is a question, not a
 * decision about how the list should sit.
 *
 * The per-folder count is rewritten for the same reason the hint line is. Left
 * alone it would read "3 budgets" over a fold showing one, and a producer has no
 * way to tell whether the other two are hidden or gone.
 */
function applySectionVisibility(root, filtering) {
  for (const section of root.querySelectorAll('.scn-section')) {
    const id = section.getAttribute('data-scn-section') ?? ''
    const list = section.querySelector('[data-scn-list]')
    const all = [...section.querySelectorAll('.scn')]
    const matching = all.filter((row) => !row.hidden).length

    // An empty section stays on screen while nothing is being filtered: a folder
    // because it is a place to file into, the ungrouped pile because it is the
    // place a budget comes back out to. Both say so in their own hint. Only a
    // filter takes a section away, and then only because it holds no match.
    // A section with no heading cannot be folded, because there is nothing left
    // to unfold it with. Without this: shut the ungrouped pile while a folder
    // exists, then delete that folder, and the pile comes back headless AND
    // still marked shut in `expandedFolders` — every budget on the device
    // disappears behind a control that is no longer on the page.
    const bare = section.classList.contains('scn-section-bare')

    section.hidden = filtering && matching === 0
    if (list) {
      list.hidden = filtering ? matching === 0 : !bare && !expandedFolders.has(id)
    }

    // aria-expanded is the only thing set: the caret is drawn by CSS and points
    // off that attribute, so it cannot fall out of step with the fold.
    section.querySelector('.fld-toggle')?.setAttribute('aria-expanded', String(!list?.hidden))

    // The ungrouped pile has no folder record and no count to keep honest when
    // it is empty — it simply is not rendered.
    const count = section.querySelector('[data-fld-count]')
    if (count) count.textContent = folderCountText(matching, all.length, filtering)

    const empty = section.querySelector('.fld-empty')
    if (empty) empty.hidden = all.length > 0
  }
}

/**
 * Reordering is off while the list is filtered.
 *
 * A manual arrangement is an arrangement of the WHOLE list, and moving a row
 * while most of that list is hidden is an operation whose result the producer
 * cannot see: ▲ swaps the row past a budget that is not on screen and appears
 * to do nothing at all, and a drop lands it somewhere relative to rows nobody
 * can point at. Turning the controls off and saying so in the hint beats either
 * of those. Clearing the box gives them straight back.
 *
 * The arrows are restored SECTION BY SECTION, which is the same rule they were
 * rendered with: an arrow moves a budget past its neighbour in its own folder,
 * so it greys out at that folder's ends and not at the whole list's. Recomputing
 * from the flat row list would leave the first budget in every folder but the
 * top one with a live ▲ that trades global ranks with a row in another section
 * and appears to do nothing.
 */
function setReorderEnabled(root, enabled) {
  for (const list of root.querySelectorAll('[data-scn-list]')) {
    const rows = [...list.querySelectorAll('.scn')]
    rows.forEach((row, i) => {
      const grip = row.querySelector('.scn-grip')
      if (grip) grip.draggable = enabled
      const up = row.querySelector('[data-action="move-scenario-up"]')
      const down = row.querySelector('[data-action="move-scenario-down"]')
      if (up) up.disabled = !enabled || i === 0
      if (down) down.disabled = !enabled || i === rows.length - 1
    })
    list.classList.toggle('filtered', !enabled)
  }
}

/**
 * Which section a budget is actually DRAWN in, which is not the same question as
 * what its `folderId` says.
 *
 * A folderId naming a folder that no longer exists — deleted here, deleted in
 * another tab, or lost to a partial write — renders in the ungrouped pile,
 * because the pile is built as "everything no section claimed". Anything
 * reasoning about a budget's neighbours has to resolve it the same way, or the
 * arrows will look for section-mates in a section that is nowhere on screen.
 */
function sectionOf(scenario, folderIds) {
  const id = scenario?.folderId ?? ''
  return id && folderIds.has(id) ? id : ''
}

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

function setDragActive(on) {
  for (const list of app.querySelectorAll('[data-scn-list]')) {
    list.classList.toggle('dragging-active', on)
  }
}

/**
 * Let the rows that got out of the way SLIDE, instead of teleporting.
 *
 * Reordering happens by moving a node in the DOM, and there is no CSS transition
 * for that: the browser lays the new order out in one frame, so every row that
 * shifted jumps a whole row-height instantly. Against a finger moving smoothly
 * down the screen that reads as the list stuttering.
 *
 * FLIP is the fix. Measure where each row is, do the move, measure again, then
 * put each row back where it was with a transform and let it transition to
 * nothing. The layout was only ever done once; the movement the eye sees is a
 * compositor animation of a transform, which is the one thing a phone can
 * animate at frame rate without touching layout.
 *
 * The dragged row is excluded — it has a transform of its own, tracking the
 * finger, and must not be animated back to anywhere.
 */
function measureRows(root) {
  const seen = new Map()
  for (const row of root.querySelectorAll('.scn')) {
    if (!row.classList.contains('dragging')) seen.set(row, row.getBoundingClientRect().top)
  }
  return seen
}

function slideRows(root, before) {
  const moved = []
  for (const [row, was] of before) {
    if (!row.isConnected || row.classList.contains('dragging')) continue
    const delta = was - row.getBoundingClientRect().top
    if (!delta) continue
    row.style.transition = 'none'
    row.style.transform = `translateY(${delta}px)`
    moved.push(row)
  }
  if (!moved.length) return
  // One forced reflow for the whole batch, so the browser takes the offsets
  // above as a starting state rather than collapsing them into the end state.
  void root.offsetWidth
  for (const row of moved) {
    row.style.transition = ''
    row.style.transform = ''
  }
}

/** Every row back to plain, whichever way the drag ended. */
function clearRowTransforms(root) {
  for (const row of root.querySelectorAll('.scn')) {
    row.style.transition = ''
    row.style.transform = ''
  }
}

app.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.scn')
  if (!row) return
  // Reordering is off while the list is filtered — see setReorderEnabled. The
  // handle is already draggable=false, so this only catches a synthetic event.
  if (scenarioFilter.trim()) return
  draggingId = row.getAttribute('data-scn-id')
  row.classList.add('dragging')
  // Dims the rows that are NOT moving, so the lifted one is the only thing at
  // full strength. Every section, not just the one the row started in — a row
  // can be dropped into any of them, and a folder left at full strength reads as
  // one the drag cannot reach. Removed on dragend whichever way the drag ends.
  setDragActive(true)
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
  const dragged = app.querySelector('.scn.dragging')
  if (!dragged) return
  const root = app.querySelector('[data-scn-sections]')
  const over = e.target.closest('.scn')

  // Over the empty part of a section — including a folder with nothing in it,
  // which has no row to aim at and would otherwise be the one place a budget
  // could not be dropped.
  if (!over) {
    if (list === dragged.parentElement) return
    const before = measureRows(root)
    list.appendChild(dragged)
    slideRows(root, before)
    return
  }
  if (over === dragged) return

  // Insert before or after depending on which half of the row we are over, so
  // the placeholder follows the pointer instead of jumping a row late.
  const box = over.getBoundingClientRect()
  const after = e.clientY > box.top + box.height / 2
  const target = after ? over.nextSibling : over
  // Already there. Without this the FLIP measurement runs on every dragover,
  // which is several times a frame and all of it wasted.
  if (target === dragged || dragged.nextSibling === target) return
  const before = measureRows(root)
  list.insertBefore(dragged, target)
  slideRows(root, before)
})

app.addEventListener('drop', (e) => {
  if (draggingId) e.preventDefault()
})

app.addEventListener('dragend', (e) => {
  const root = app.querySelector('[data-scn-sections]')
  app.querySelector('.scn.dragging')?.classList.remove('dragging')
  if (root) clearRowTransforms(root)
  setDragActive(false)
  if (!root || !draggingId) return
  const movedId = draggingId
  draggingId = null

  // Escape cancels a drag, but the rows have already been moved by dragover, so
  // the browser has nothing to put back — only this code can. Re-render from
  // storage to restore the saved order rather than committing an arrangement
  // the producer just backed out of.
  if (e.dataTransfer && e.dataTransfer.dropEffect === 'none') {
    render()
    return
  }

  commitOrder(root, movedId)
})

/* ──────────────────── the same reorder, by finger ──────────────────────── */

/**
 * HTML5 drag-and-drop does not exist on touch, and these budgets are mostly
 * reordered on a phone, so the handle needs a second implementation rather than
 * being decoration there.
 *
 * The whole gesture has to be claimed on POINTERDOWN. A touch the browser is
 * allowed to turn into a scroll is gone for good: it fires `pointercancel` and
 * there is no way to ask for it back. `touch-action: none` on `.scn-grip` (see
 * styles.css) is the half of this that says "never scroll from here"; this code
 * is the half that then owns every move until the finger lifts.
 *
 * A mouse is left entirely to the native implementation above. Running both for
 * one device would start two drags from one gesture.
 */
let touchDrag = null

app.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return
  const grip = e.target.closest?.('.scn-grip')
  const row = grip?.closest('.scn')
  const root = row?.closest('[data-scn-sections]')
  if (!root) return
  // draggable=false does nothing to a pointer gesture, so the touch path needs
  // the filter check itself.
  if (scenarioFilter.trim()) return

  e.preventDefault()
  // `grabY` is where in the row the finger landed, so the lift below can hold
  // the row under that exact point rather than snapping its top to the finger.
  touchDrag = {
    row,
    root,
    moved: false,
    grabY: e.clientY,
    frame: 0,
    y: e.clientY,
    x: e.clientX,
    pointerMoved: false,
  }
  row.classList.add('dragging')
  setDragActive(true)
  startDragLoop()
  // Capture keeps the events coming to the handle after the row has slid out
  // from under the finger. Not fatal if the browser refuses it.
  try {
    grip.setPointerCapture(e.pointerId)
  } catch {
    /* the gesture still works, it just ends early if the finger leaves */
  }
})

/** One frame at a time, for as long as the finger is down. */
function startDragLoop() {
  const tick = () => {
    if (!touchDrag) return
    // The row went out from under us — a re-render, or a delete in another tab.
    // Nothing after this point can do anything useful with a detached node, and
    // a loop that reschedules itself forever is worse than a dropped gesture.
    if (!touchDrag.row.isConnected) {
      touchDrag = null
      return
    }
    dragFrame()
    touchDrag.frame = view().requestAnimationFrame?.(tick) ?? 0
  }
  touchDrag.frame = view().requestAnimationFrame?.(tick) ?? 0
}

/**
 * The event records where the finger is; a frame loop does the work.
 *
 * Two reasons, and the second one only became clear on a phone.
 *
 * A phone fires pointermove faster than it paints — 120Hz panels report at
 * 120Hz — and the first version did a hit test, a getBoundingClientRect and a
 * DOM insertion on every single one. Several forced layouts per frame, on the
 * device least able to afford them.
 *
 * And a held finger fires NOTHING. Auto-scrolling at the edge of the screen has
 * to keep happening while the finger sits still, which a move-driven update
 * cannot do — so the loop runs for the whole gesture rather than being scheduled
 * by movement.
 */
app.addEventListener('pointermove', (e) => {
  if (!touchDrag) return
  e.preventDefault()
  touchDrag.x = e.clientX
  touchDrag.y = e.clientY
  touchDrag.pointerMoved = true
  // No rAF at all (an old WebView, or a synthetic document): the loop never
  // started, so do the work inline. Auto-scroll is what is lost, not the drag.
  if (!touchDrag.frame) dragFrame()
})

/**
 * How far a long list can be dragged: as far as you like.
 *
 * Without this a budget can only be moved as far as the screen already shows.
 * Getting one from the bottom of a list of thirty to the top means dropping it,
 * scrolling, picking it up again, and repeating — which is not a worse version
 * of dragging, it is a different and much worse operation.
 *
 * Only the touch path needs it. Native HTML5 drag-and-drop scrolls the page at
 * the edges by itself, so the mouse has had this all along.
 *
 * The speed ramps with how far into the margin the finger is, so resting just
 * inside it creeps and pushing to the very edge moves quickly. A fixed speed
 * makes the only usable choice a slow one.
 */
const EDGE_MARGIN = 76
const EDGE_SPEED = 16

/**
 * The window the app is actually running in.
 *
 * Read through the document rather than off a bare global, for the same reason
 * sizeNameInput() does: booted into a synthetic document, window globals are not
 * aliased onto globalThis, so `globalThis.innerHeight` is undefined and every
 * viewport measurement here silently answers zero.
 */
const view = () => app.ownerDocument?.defaultView ?? globalThis

function edgeScroll(y) {
  const win = view()
  const height = win.innerHeight || 0
  if (!height) return 0

  let step = 0
  if (y < EDGE_MARGIN) step = -((EDGE_MARGIN - y) / EDGE_MARGIN) * EDGE_SPEED
  else if (y > height - EDGE_MARGIN) {
    step = ((y - (height - EDGE_MARGIN)) / EDGE_MARGIN) * EDGE_SPEED
  }
  if (!step) return 0

  // What the page ACTUALLY did, not what was asked for. At the top or the bottom
  // of the document it scrolls by less than requested, or not at all, and the
  // lift below has to be corrected by the real figure or the row drifts away
  // from the finger every frame the page refuses to move.
  const was = win.scrollY ?? 0
  win.scrollBy?.(0, step)
  return (win.scrollY ?? 0) - was
}

function dragFrame() {
  if (!touchDrag) return
  const { row, root, x } = touchDrag

  // Not until the finger has actually moved. Rows are picked up near the bottom
  // of the screen all the time — that is where the end of a list is — and a grab
  // that starts scrolling the page before the producer has moved at all reads as
  // the app taking the gesture away from them.
  //
  // Scrolling then moves the row's layout box under a finger that may not have
  // moved, so the grab point travels with it; without that the row slides out
  // from under the finger at exactly the speed of the scroll.
  const scrolled = touchDrag.pointerMoved ? edgeScroll(touchDrag.y) : 0
  touchDrag.grabY -= scrolled
  const { y, grabY } = touchDrag

  // Nothing moved and nothing scrolled since the last frame. The loop runs for
  // the whole gesture now, so without this a stationary finger would pay for a
  // hit test and a getBoundingClientRect sixty times a second to reach the same
  // answer it already had.
  if (!scrolled && touchDrag.lastX === x && touchDrag.lastY === y) return
  touchDrag.lastX = x
  touchDrag.lastY = y

  // The row follows the finger. Without this it stays exactly where it was until
  // the finger crosses a neighbour's midpoint and then teleports a whole row —
  // so the thing being dragged is the only thing on screen not moving, and a
  // gesture that has not "taken" yet is indistinguishable from one that failed.
  // A transform, so nothing reflows: see `--lift` on .scn.dragging in styles.css.
  row.style.setProperty('--lift', `${y - grabY}px`)

  // A captured pointer reports the HANDLE as its target for the whole gesture,
  // so what is under the finger has to be found by coordinate instead.
  //
  // The dragged row has to be taken OUT of the hit test first, and this is not
  // optional: it now follows the finger, at z-index 2, so it is the topmost
  // element at those coordinates every single time. Left in, every hit test
  // answers "the row you are already dragging", the target search returns early,
  // and the drop lands the row exactly where it started — which is the bug that
  // arrived with the lift and could not have arrived before it.
  //
  // Toggled around the one call rather than set in CSS: pointer capture is only
  // best-effort here (setPointerCapture is in a try), and a row that is
  // permanently transparent to pointers would end the gesture the moment capture
  // was refused. Nothing paints between these two lines.
  const wasPointerEvents = row.style.pointerEvents
  row.style.pointerEvents = 'none'
  const under = document.elementFromPoint?.(x, y)
  row.style.pointerEvents = wasPointerEvents

  const list = under?.closest?.('[data-scn-list]')
  if (!list || !root.contains(list)) return

  const over = under.closest('.scn')
  if (!over) {
    // The empty part of a section, which for an empty folder is all of it.
    if (list === row.parentElement) return
    const before = measureRows(root)
    list.appendChild(row)
    slideRows(root, before)
    touchDrag.moved = true
    return
  }
  if (over === row) return

  // Insert before or after depending on which half of the row we are over, so
  // the list opens up ahead of the finger rather than a place late.
  const box = over.getBoundingClientRect()
  const after = y > box.top + box.height / 2
  const target = after ? over.nextSibling : over
  if (target === row || row.nextSibling === target) return

  const before = measureRows(root)
  const wasTop = row.getBoundingClientRect().top
  list.insertBefore(row, target)
  slideRows(root, before)

  // Reinsertion moves the row's own layout box by a whole row height, and the
  // lift is measured from where the finger first grabbed it — so without this
  // the row jumps by exactly that amount at the moment it changes place, which
  // is the one instant it most needs to look continuous. Both readings include
  // the current lift, so the difference is the layout shift alone.
  touchDrag.grabY += row.getBoundingClientRect().top - wasTop
  row.style.setProperty('--lift', `${y - touchDrag.grabY}px`)
  touchDrag.moved = true
}

app.addEventListener('pointerup', () => endTouchDrag(true))
app.addEventListener('pointercancel', () => endTouchDrag(false))

function endTouchDrag(commit) {
  if (!touchDrag) return

  // Stop the loop, then run one last frame by hand. The finger's final position
  // may have arrived after the last tick, and it is usually the one that decides
  // where the row lands.
  if (touchDrag.frame) view().cancelAnimationFrame?.(touchDrag.frame)
  touchDrag.frame = 0
  dragFrame()

  const { row, root, moved } = touchDrag
  touchDrag = null
  row.classList.remove('dragging')
  row.style.removeProperty('--lift')
  clearRowTransforms(root)
  setDragActive(false)

  // A tap on the handle that went nowhere is not a reorder, and writing every
  // row's position back for one would be a storage write for no change.
  if (!moved) return

  // A cancelled gesture has already moved the rows, and only this code can put
  // them back — same reasoning as Escape on the mouse path.
  if (!commit) {
    render()
    return
  }
  commitOrder(root, row.getAttribute('data-scn-id'))
}

/**
 * Write back both things a drop can change: which folder the row is in, and
 * where everything sits.
 *
 * MEMBERSHIP FIRST. They are two writes, and if the reorder is the one that
 * fails, a row drawn inside a folder it does not belong to is a lie about the
 * producer's own filing. The other order leaves the arrangement right and the
 * membership stale, which the next render corrects on its own.
 *
 * The order sent is every row on the page, top to bottom, which is a COMPLETE
 * global order — and that is only true because a collapsed folder still renders
 * its rows and hides them with CSS. If a future change ever stops rendering a
 * shut folder's contents, this quietly starts sending a partial list, and
 * reorderScenarios' documented contract appends the ids it was not given to the
 * end: one drag would then rewrite the rank of every budget the producer cannot
 * see, with nothing on screen to say so. Keep the rows in the DOM.
 */
function commitOrder(root, movedId) {
  const rows = [...root.querySelectorAll('.scn')]
  let filed = false

  if (movedId) {
    const row = rows.find((el) => el.getAttribute('data-scn-id') === movedId)
    const landedIn = row?.closest('[data-scn-list]')?.getAttribute('data-folder-id') ?? ''
    const wasIn = getScenarioById(movedId)?.folderId ?? ''
    filed = landedIn !== wasIn
    if (filed && !moveScenarioToFolder(movedId, landedIn).ok) {
      alert('This browser would not save that move.')
      render()
      return
    }
  }

  const order = rows.map((el) => el.getAttribute('data-scn-id'))
  if (!reorderScenarios(order).ok) {
    alert('This browser would not save the new order.')
    render()
    return
  }

  // A drop WITHIN a section is refreshed in place, never by render(), which
  // would rebuild the list and take every compare tick with it: "tick two,
  // reorder, tick two more" is a real way to build a comparison, and this is the
  // same rule the filter box follows.
  //
  // A drop ACROSS one is a filing action and gets the full render, like the Move
  // button. Not for the counts, which update in place perfectly well, but for
  // the drop targets: emptying the ungrouped pile hides it, and a hidden section
  // cannot be dragged back into. Dropping a budget somewhere and then finding
  // nowhere to put it back is a worse trade than re-ticking two boxes.
  if (filed) render()
  else applyScenarioFilter()
}

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
    // An overhead line also passes the path of its period select, so a figure
    // that is annual by construction cannot land in a line set to "$ / month",
    // plus where to record which period it was published for.
    const basisPath = btn.getAttribute('data-basis-path')
    openTypical(
      typical,
      btn.getAttribute('data-target'),
      btn.getAttribute('data-category') || '',
      line,
      basisPath
        ? {
            path: basisPath,
            provenancePath: btn.getAttribute('data-typical-basis-path') || '',
          }
        : null
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
    case 'add-enterprise': {
      // Added folded shut. On a phone the alternative is fifteen blank expense
      // rows appearing below an already-long page; on a computer it is every
      // open column being squeezed narrower to make room for an empty one. The
      // new card arrives as a closed spine you open when you are ready for it.
      const added = newEnterprise()
      scenario.enterprises.push(added)
      collapsedEnterprises.add(added.id)
      notify()
      render()
      break
    }

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
        // A save can add a row, and a row that arrives filtered out of sight
        // reads as the save having failed. Whenever the list grows, the filter
        // goes.
        scenarioFilter = ''
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
      collapseDefaultsApplied = false
      scenarioIsNew = true
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
        scenarioIsNew = false
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
      // A copy is a farm somebody already built, so it opens folded like any
      // other saved budget rather than like a blank one.
      setScenario(copy)
      dirty = false
      scenarioFilter = '' // the list just grew, see save-scenario
      screen = 'build'
      collapsedEnterprises.clear()
      collapseDefaultsApplied = false
      scenarioIsNew = false
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
      const all = listScenarios()
      const order = all.map((s) => s.id)
      const from = order.indexOf(id)
      if (from < 0) break

      // Swap with the neighbour IN THE SAME SECTION, not the neighbour in the
      // list. `sortIndex` is one global rank shared by every budget, so the row
      // above this one on screen can belong to another folder; trading ranks
      // with it would move nothing anybody can see and would not change either
      // budget's folder. Exchanging ranks with a section-mate makes the two rows
      // trade places and leaves every other budget exactly where it was.
      const folderIds = new Set(listFolders().map((f) => f.id))
      const section = sectionOf(all[from], folderIds)
      const mates = all.filter((s) => sectionOf(s, folderIds) === section)
      const at = mates.findIndex((s) => s.id === id)
      const swap = mates[action === 'move-scenario-up' ? at - 1 : at + 1]
      if (!swap) break

      const other = order.indexOf(swap.id)
      ;[order[from], order[other]] = [order[other], order[from]]

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

    /* ── folders ───────────────────────────────────────────────────────── */

    case 'toggle-folder': {
      // In place, never render(). Folding is a view over the list exactly as the
      // filter box is, and a render here would rebuild every row and take the
      // compare ticks with it.
      const id = btn.getAttribute('data-id') ?? ''
      const open = !expandedFolders.has(id)
      if (open) expandedFolders.add(id)
      else expandedFolders.delete(id)

      const section = btn.closest('.scn-section')
      const list = section?.querySelector('[data-scn-list]')
      if (list) list.hidden = !open
      btn.setAttribute('aria-expanded', String(open))
      // A budget ticked for comparison and then folded out of sight is exactly
      // what the note under the Compare button is for.
      refreshCompareButton()
      break
    }

    case 'new-folder':
      openFolderEditor(null, (created) => {
        // Opened, so the producer can see what they just made and file into it.
        // The default-shut rule is about folders you have had for a while.
        if (created) expandedFolders.add(created.id)
        render()
      })
      break

    case 'edit-folder': {
      const id = btn.getAttribute('data-id')
      const folder = listFolders().find((f) => f.id === id)
      if (!folder) return
      openFolderEditor(folder, () => render())
      break
    }

    case 'move-scenario': {
      const target = getScenarioById(btn.getAttribute('data-id'))
      if (!target) return
      openMoveModal(target, (folderId) => {
        // A budget filed into a shut folder would leave the screen with nothing
        // to show for the move but a row disappearing.
        expandedFolders.add(folderId ?? '')
        render()
      })
      break
    }

    case 'move-folder-up':
    case 'move-folder-down': {
      const id = btn.getAttribute('data-id')
      const order = listFolders().map((f) => f.id)
      const from = order.indexOf(id)
      const to = action === 'move-folder-up' ? from - 1 : from + 1
      if (from < 0 || to < 0 || to >= order.length) break
      order.splice(to, 0, ...order.splice(from, 1))
      if (!reorderFolders(order).ok) {
        alert('This browser would not save the new folder order.')
        break
      }
      render()
      // Keep the keyboard on the button that just moved, so a folder can be
      // walked up the list with repeated presses — same as the row arrows.
      document
        .querySelector(`${attrSelect('data-action', action)}${attrSelect('data-id', id)}`)
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

    case 'clear-scn-filter': {
      scenarioFilter = ''
      const box = app.querySelector('[data-scn-filter]')
      if (box) box.value = ''
      // Filtered in place, so cleared in place. A render() here would rebuild
      // the list and take every compare tick with it.
      applyScenarioFilter()
      box?.focus()
      break
    }

    case 'import-scenario':
      importFromFile()
      break

    case 'how-to':
      // Folded shut so the whole guide is one screen of headings you can pick
      // from, rather than several screens of scrolling to reach the last one.
      openGuide('How to use this calculator', HOW_TO_SECTIONS, { collapsible: true })
      break

    case 'export-csv':
      downloadCSV(scenario)
      break

    case 'export-compare-csv':
      downloadCompareCSV(compareIds.map((id) => getScenarioById(id)).filter(Boolean))
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
  const checked = [...document.querySelectorAll('[data-compare-id]:checked')]
  const btn = document.querySelector('[data-action="compare-selected"]')
  if (btn) {
    btn.disabled = checked.length < 2
    btn.textContent =
      checked.length < 2 ? 'Compare selected' : `Compare ${checked.length} budgets`
  }

  // A row that goes off screen keeps its tick. Clearing a deliberate selection
  // to answer a search would be destroying work to help with a lookup, and
  // "select two corn budgets, filter to soybeans, select two more" is a real
  // way to build a comparison. But a comparison that quietly contains budgets
  // the producer cannot see is exactly the kind of silently-wrong output this
  // app is careful about, so the count above says four and this line says how
  // many of them are not on the screen.
  //
  // Two ways to be off screen and they are counted together: filtered out (the
  // row itself is hidden) and folded away inside a shut folder (the row is
  // fine, its list is hidden). The second one only became possible with folders,
  // and it is the more likely of the two now that folders start shut.
  const note = document.querySelector('[data-scn-hidden-note]')
  if (!note) return
  const hidden = checked.filter((el) => {
    const row = el.closest('.scn')
    return Boolean(
      row?.hidden || row?.closest('[data-scn-list]')?.hidden || row?.closest('.scn-section')?.hidden
    )
  }).length
  note.hidden = hidden === 0
  note.textContent =
    hidden === 1
      ? '1 budget you have selected is not on screen right now, and it will still be compared.'
      : `${hidden} budgets you have selected are not on screen right now, and they will still be compared.`
}

function flashSaved() {
  const el = document.getElementById('saveState')
  if (!el) return
  el.textContent = SAVED_LABEL
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
    scenarioFilter = '' // the list just grew, see save-scenario
    screen = 'build'
    collapsedEnterprises.clear()
    collapseDefaultsApplied = false
    scenarioIsNew = false
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
const reopened = last ? getScenarioById(last) : null
scenarioIsNew = !reopened
setScenario(reopened || newScenario())
render()

subscribe(() => {
  dirty = true
  updateOutputs()
  updateStatus()
})
