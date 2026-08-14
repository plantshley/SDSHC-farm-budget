// styles.css is linked from index.html, not imported here — see the comment
// there. Keeping this entry module plain JS lets the smoke tests import it.
import { initPrefs, dismiss } from './prefs.js'
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
  importBackupJSON,
  replaceAll,
  renameScenario,
  reorderScenarios,
  listFolders,
  reorderFolders,
  moveScenarioToFolder,
} from './storage.js'
import { openMoveModal, openFolderEditor, folderCountText } from './ui/folders.js'
import { renderEnterprises, applyUnitLabels } from './ui/enterprise.js'
import { renderFixed, OVERHEAD_LINES } from './ui/fixed.js'
import { renderResults, renderWarningsInto } from './ui/results.js'
import { renderScenarioList, renderCompare, scenarioHint, searchText } from './ui/scenarios.js'
import { openInfo, openTypical, openGuide } from './ui/modals.js'
import { usd, usdCents, esc, signClass } from './ui/format.js'
import {
  matchCategory,
  matchCrop,
  EQUIPMENT_CATALOG,
  BUILDING_CATALOG,
} from './data/typical-values.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import {
  downloadCSV,
  downloadCompareCSV,
  downloadJSON,
  downloadBackup,
  printResults,
} from './export.js'
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
 * Open the section holding the budget that is open on the Budget tab, and shut
 * every other one.
 *
 * Folders start shut, so a producer arriving at the Saved tab to find the
 * budget they have open had to remember which section it was filed under and
 * open it by hand. The list marks that row as the open one, and a marked row
 * inside a shut section is not on screen at all.
 *
 * The ungrouped pile is shut along with the folders. It is seeded open at boot
 * because it is where a budget with nowhere else to go lands, but on arrival
 * there is a better answer: exactly one section is open, and it is the one with
 * the budget in it. A budget in no folder opens the pile by the same rule, so
 * `''` is a section id here like any other.
 *
 * Run on ARRIVAL at the Saved tab, every time. Each visit is a fresh look for
 * the budget in hand, so shutting a section, going back to the Budget tab and
 * returning restores the arrangement rather than remembering the last one.
 *
 * Never from inside render(), which would be a different rule entirely:
 * deleting a budget or committing a reorder re-renders the list, and every
 * section a producer had opened would collapse under them without their having
 * left the page.
 *
 * Read from the STORED record rather than the working copy, because filing is
 * done from the Saved tab and the copy in hand may predate it. An unsaved
 * budget resolves to `''`, which is the pile it would land in.
 */
function revealScenarioFolder(id) {
  expandedFolders.clear()
  expandedFolders.add(getScenarioById(id)?.folderId || '')
}

/**
 * Put the top of an enterprise card at the top of the screen.
 *
 * Phones stack the cards, so a card added below four others opens off the
 * bottom of the page and the press looks like it did nothing. Wide screens lay
 * them out as parallel columns and have no such gap, so this is narrow-only.
 *
 * Nothing is fixed to the top of the page — the sticky bar is at the bottom —
 * so the card's own top edge is the right place to land. The optional call is
 * for jsdom, which has no layout and therefore no scrollIntoView.
 */
function scrollCardIntoView(id) {
  if (!isNarrow()) return
  app.querySelector(`.ent[data-ent-id="${id}"]`)?.scrollIntoView?.({
    block: 'start',
    behavior: 'smooth',
  })
}

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
/**
 * Remember which field the producer is in, so a render can put them back.
 *
 * Almost every render answers a click, where losing focus is right. A few
 * answer a KEYSTROKE: naming a crop opens the seeds/ac mode, which changes
 * which boxes exist and therefore cannot be an updateOutputs(). There the
 * producer is mid-word in a box that is about to be destroyed and rebuilt, and
 * without this the caret goes to the body and the phone keyboard closes — so
 * "Corn silage" could not be typed in one go, on the one field the app fills
 * itself from.
 *
 * Scoped to INPUT/SELECT/TEXTAREA on purpose. The mode-pill segments carry a
 * `data-path` too, and restoring "focus" to a path shared by three buttons
 * would land on whichever segment came first rather than the one just pressed.
 */
function activeField() {
  const el = app.ownerDocument.activeElement
  if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return null
  const path = el.getAttribute('data-path')
  if (!path) return null
  // selectionStart throws on a number input in some browsers and reads null in
  // others, so it is taken defensively and only used when it is really there.
  let caret = null
  try {
    caret = el.selectionStart
  } catch {
    caret = null
  }
  return { path, caret }
}

/**
 * True only while render() is putting focus back, so the `focusin` listener can
 * tell the app's own restore from the producer tapping into a field.
 */
let restoringFocus = false

function restoreField(field) {
  if (!field) return
  const escaped = globalThis.CSS?.escape ? CSS.escape(field.path) : field.path
  const el = app.querySelector(`[data-path="${escaped}"]`)
  if (!el) return
  restoringFocus = true
  try {
    el.focus()
    if (field.caret != null) {
      try {
        el.setSelectionRange(field.caret, field.caret)
      } catch {
        // A number input has no text selection to restore. The focus is the point.
      }
    }
  } finally {
    restoringFocus = false
  }
}

/**
 * Render after the interaction that asked for it has finished.
 *
 * `change` on a text box fires during the blur that a CLICK causes, so a
 * synchronous render there replaces the page between mousedown and mouseup. The
 * element the producer pressed is then detached, no common ancestor remains,
 * and the click never lands — tapping Acres straight after typing a crop name
 * would put them nowhere, and tapping Save would do nothing at all. A timeout
 * of 0 runs after the click has been dispatched.
 */
function deferRender() {
  const view = app.ownerDocument.defaultView ?? globalThis
  view.setTimeout(render, 0)
}

function render() {
  const scenario = getScenario()
  const field = activeField()

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
  sizeEntNames()
  // A no-op on every screen but the saved list. The filter survives a render,
  // so a list rebuilt underneath it has to be re-filtered to match the box.
  applyScenarioFilter()
  restoreField(field)
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
  // A focus the APP moved is not the producer answering the notice. render()
  // puts them back in the box they were typing in, and that focus() fires here
  // synchronously — so without this guard the notice explaining why a figure
  // was just cleared is dismissed by the same render that raised it, and the
  // box reads empty with nothing on screen to say why.
  if (restoringFocus) return
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
  const mirror = nameMirror()
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

/** The off-screen span both measuring passes lay their text out in. */
function nameMirror() {
  let mirror = document.getElementById('nameMirror')
  if (!mirror) {
    mirror = document.createElement('span')
    mirror.id = 'nameMirror'
    mirror.className = 'name-mirror'
    mirror.setAttribute('aria-hidden', 'true')
    document.body.appendChild(mirror)
  }
  return mirror
}

/**
 * How wide the name column on a shut enterprise card may get, in px.
 *
 * The ceiling is what stops one long name ("North quarter, no-till") taking the
 * room the figures beside it need — past it every name truncates, and they all
 * truncate at the same place, which is still the alignment this is here for.
 * The floor keeps a card holding one blank enterprise from collapsing the column
 * to nothing and putting the chevron against the acreage.
 */
const ENT_NAME_MAX = 120
const ENT_NAME_MIN = 44

/**
 * Give every shut enterprise card the same name column, sized to the longest
 * name on the page.
 *
 * The cards are separate boxes, so CSS cannot size a track across them — a
 * shared column is either `subgrid` (which would mean restructuring a card that
 * also has an open state) or a measurement. This is the measurement, and it uses
 * the mirror span sizeNameInputs() already keeps for exactly this job.
 *
 * Only the SHUT cards are measured, because they are the only ones laid out this
 * way. An open card is a full-width column of fields and its heading takes the
 * whole row.
 *
 * No layout available means no write, and the `var()` fallback in the stylesheet
 * stands. That is the smoke tests, where jsdom has no layout at all, and it is
 * cosmetic in every case — never a reason to fail.
 */
function sizeEntNames() {
  const grid = app.querySelector('.ent-grid')
  if (!grid) return

  const names = [...app.querySelectorAll('.ent.collapsed .ent-name')]
  if (!names.length) {
    grid.style.removeProperty('--ent-name-w')
    return
  }

  const view = grid.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return

  // Every name is styled alike, so the font is read once rather than per card.
  const mirror = nameMirror()
  const style = view.getComputedStyle(names[0])
  mirror.style.font = style.font
  mirror.style.letterSpacing = style.letterSpacing

  let widest = 0
  for (const el of names) {
    mirror.textContent = el.textContent.trim()
    widest = Math.max(widest, mirror.offsetWidth)
  }

  // One pixel of slack: a track measured to exactly its text can round down
  // against the element's own layout and clip the last glyph into an ellipsis
  // on the name the column was sized FOR.
  const w = Math.min(Math.max(widest + 1, ENT_NAME_MIN), ENT_NAME_MAX)
  grid.style.setProperty('--ent-name-w', `${w}px`)
}

function footer() {
  // The privacy line is STATED, not only linked. A producer being asked to type
  // their yields, prices, and land rent into a web page at a workshop is
  // entitled to know where it goes without having to go looking, and "there is
  // a page about it somewhere" is not the same answer as one sentence they
  // cannot miss. The link opens the full explanation for anyone who wants it.
  return `
    <div class="footer">
      <button type="button" class="tip" data-action="how-to">How to use this calculator</button>
      ·
      <button type="button" class="tip" data-action="export-csv">Export budget CSV</button>
      ·
      <button type="button" class="tip" data-action="export-json">Save budget file</button>
      ·
      <button type="button" class="tip" data-action="print">Print</button>
      <p class="footer-privacy">
        Everything you enter stays on this device.
        <button type="button" class="tip" data-info="privacy">Read more</button>
      </p>
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
      <!-- Immediately left of the button it is about. It used to sit up in the
           header beside the tabs, where "Unsaved changes" and the control that
           answers it were at opposite ends of the page. There is still exactly
           one of these in the DOM, because updateStatus() and flashSaved()
           address it by id — it has simply moved house.

           The sticky bar renders on the Budget screen only, so the state is not
           on screen on the Saved tab. Nothing is lost by that: the two ways to
           discard unsaved work from there, opening another budget and leaving
           the page, both stop and ask first. -->
      <span class="save-state" id="saveState"></span>
      <button type="button" class="btn-main" data-action="save-scenario">
        <!-- "Save" alone on a phone, where this button shares a fixed bar with
             two dollar figures and the state beside it. The hidden half is
             display: none, so the accessible name narrows to "Save" with it
             rather than reading a word that is not on screen. -->
        Save<span class="btn-word"> budget</span>
      </button>
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
    // A path that resolves to nothing is a BUG in the markup, and it must not
    // be able to look like an answer. Every formatter here turns undefined into
    // a confident $0.00, so a mistyped data-out would print a plausible dollar
    // figure on a producer's screen and nothing anywhere would say it was
    // wrong. The em dash is what the placeholder in the markup already says,
    // and it reads as "not calculated" rather than as "zero".
    el.textContent = raw === undefined || raw === null ? '—' : fmt(raw)
    if (el.hasAttribute('data-tone')) {
      el.classList.remove('pos', 'neg')
      const tone = signClass(Number(raw))
      if (tone) el.classList.add(tone)
    }
  }

  // Warnings come and go as figures are typed, so they are not part of the
  // rendered markup either. Each holder says whose list it draws: an enterprise
  // index, or the shared fixed block. A holder naming an enterprise that no
  // longer exists draws nothing rather than throwing — remove-enterprise
  // re-renders, but updateOutputs() can run first.
  for (const el of app.querySelectorAll('[data-warnings]')) {
    const which = el.getAttribute('data-warnings-for')
    const list =
      which === 'fixed'
        ? result.fixed.warnings
        : which === 'farm'
          ? result.farmWarnings
          : result.enterprises[Number(which)]?.warnings
    renderWarningsInto(el, list ?? [])
  }

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

  // The crop drives the seeds-per-unit suggestion; typing in that box takes it
  // back. Both halves are needed, and both are in one place so neither can be
  // changed without the other being read. See autofillSeedsPerUnit().
  const typedSeedsPerBag = /^enterprises\.\d+\.variable\.seed\.seedsPerBag$/.test(path)
  if (typedSeedsPerBag) releaseSeedsPerUnit(el)

  // The same rule for the other two provenance markers, and for the same
  // reason: the app may only ever revise a figure IT wrote. Both markers were
  // set when the picker filled the box, and nothing dropped them when the
  // producer typed their own number over the top — so dropStaleTypicalValues()
  // and dropStaleOverheadValue() would later delete work that was never the
  // app's, and explain it with a sentence that is not true of the number they
  // just deleted. Using a typical value as a starting point and then editing it
  // is ordinary behaviour, which is what made this reachable.
  const typedLineCost = /^(enterprises\.\d+\.variable\.\w+)\.(?:costPerUnit|perAcre)$/.exec(path)
  if (typedLineCost) {
    setPath(getScenario(), `${typedLineCost[1]}.typicalYieldUnit`, '')
    // Cosmetic rather than destructive — it names the two unit labels on the row
    // and never a value — but released on the same rule: the app stops
    // describing a figure once the figure is no longer the one it wrote.
    //
    // Put back on the boxes in place, because this runs on a KEYSTROKE. The
    // labels are baked in at render time, so clearing the marker alone left
    // "lb/acre" and "/lb" on screen describing a cost the producer had just
    // overwritten with their own — and a rendered answer that contradicts the
    // box beside it is worse than the stale label it replaced.
    setPath(getScenario(), `${typedLineCost[1]}.typicalUnitLabel`, '')
    applyUnitLabels(app, typedLineCost[1], '')
  }

  const typedOverhead = /^fixed\.annual\.(\w+)$/.exec(path)
  if (typedOverhead) setPath(getScenario(), `fixed.annualTypicalBasis.${typedOverhead[1]}`, '')

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

  // The crop field waits for `change`, which fires when the producer leaves the
  // box, rather than acting on every keystroke. Naming a crop fills
  // seeds-per-unit and can open the seeds/ac mode, and the mode decides which
  // boxes exist — so it is a structural render, and running it mid-word rebuilt
  // the card while somebody was still typing into it. "Corn silage" is the case
  // that made this obvious: it matches corn at four characters and the rest of
  // the word was being typed into a box that had already been replaced.
  const changedCrop = /^enterprises\.(\d+)\.crop$/.exec(path ?? '')
  if (changedCrop && e.target.tagName === 'INPUT') {
    autofillSeedsPerUnit(Number(changedCrop[1]), e.target.value)
  }

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

/* ─────────────── the one field that fills itself, and its guards ─────────── */

/**
 * Fill seeds-per-unit from the crop name. THE ONE EXCEPTION to "nothing
 * auto-fills", and it is guarded rather than trusted.
 *
 * The reason it exists: the population entry mode divides by a seeds-per-unit
 * figure, and getting it wrong is not a visible error. Corn ships in
 * 80,000-seed bags and soybeans in 140,000-seed units, so a soybean budget left
 * on corn's bag size is out by a factor of 1.75 with an entirely ordinary
 * number on the screen. The box has to be right far more often than a blank box
 * gets filled in correctly.
 *
 * The reason it is safe: `seedsPerBagAuto` records that the APP put the number
 * there. Everything follows from that one marker.
 *
 *   - It only ever writes an empty box, or one the app itself last wrote.
 *   - A producer typing in the box drops the marker (releaseSeedsPerUnit), and
 *     from then on the crop can change freely and the number stays theirs.
 *   - No match means no write. "Sorghum" gets nothing rather than corn's bag.
 *   - While the marker is set, a caption under the line says where the number
 *     came from, so a figure that appeared unasked-for is never unexplained.
 *
 * Same idiom as `typicalYieldUnit` and `fixed.annualTypicalBasis`: a marker
 * saying a figure's provenance, so the app can tell its own guesses apart from
 * a producer's work and only ever revise the former.
 */
function autofillSeedsPerUnit(index, cropText) {
  const ent = getScenario()?.enterprises?.[index]
  if (!ent) return
  ent.variable ??= {}
  ent.variable.seed ??= {}
  const line = ent.variable.seed

  // A figure the producer typed carries no marker and is never touched, however
  // firmly the crop now says otherwise. The app knows the crop changed; it does
  // not know what they meant by the number, and overwriting it would be
  // destroying work on a guess.
  const isOurs = Boolean(line.seedsPerBagAuto)
  const isEmpty = line.seedsPerBag === '' || line.seedsPerBag == null
  if (!isOurs && !isEmpty) return

  const match = matchCrop(cropText)
  if (!match) {
    // The crop was cleared or changed to something unrecognised. Drop what we
    // put there, but only what WE put there — a blank box and a stale 80,000
    // under a crop we can no longer vouch for are both better than the latter.
    if (isOurs) {
      line.seedsPerBag = ''
      delete line.seedsPerBagAuto
      if (line.mode === 'population') deferRender()
    }
    return
  }

  const alreadySet =
    line.seedsPerBag === match.seedsPerUnit && line.seedsPerBagAuto === match.label
  line.seedsPerBag = match.seedsPerUnit
  line.seedsPerBagAuto = match.label

  // Corn and soybeans are the two crops this mode is FOR, so naming one of them
  // opens it. Population is how their seed is bought and quoted; working out a
  // fraction of a bag is the arithmetic this mode exists to remove, and a
  // producer who has to find the mode first mostly will not.
  //
  // Only on an UNTOUCHED line. Once anything has been typed into any of the
  // seed boxes the mode is a decision somebody made, and changing it out from
  // under them would hide the figure they entered — it would still be stored,
  // which makes it worse rather than better, because nothing on screen would
  // say where it went.
  const opened = openPopulationMode(line)
  if (alreadySet && !opened) return
  // Only a structural render while the boxes are actually on screen. In the
  // other modes the value is stored and waiting, and there is nothing to show.
  if (line.mode === 'population') deferRender()
}

/** True if the mode was changed, so the caller knows a render is owed. */
function openPopulationMode(line) {
  if (line.mode === 'population') return false
  const touched = ['costPerUnit', 'unitsPerAcre', 'perAcre', 'costPerBag', 'population'].some(
    (k) => line[k] !== '' && line[k] != null
  )
  if (touched) return false
  line.mode = 'population'
  return true
}

/**
 * The producer has typed in the seeds-per-unit box, so it is theirs now.
 *
 * The marker is removed WITHOUT a render. render() would rebuild the card and
 * take the focus out of the input they are mid-keystroke in, which is the same
 * rule updateOutputs() exists for. The caption it controls is removed from the
 * DOM directly instead.
 */
function releaseSeedsPerUnit(el) {
  const card = el.closest('.ent')
  const index = Number(card?.getAttribute('data-ent-index'))
  const line = getScenario()?.enterprises?.[index]?.variable?.seed
  if (!line?.seedsPerBagAuto) return
  delete line.seedsPerBagAuto
  card?.querySelector('[data-line="seed"] .field-note')?.remove()
}

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
/**
 * A comma splits the box into terms, and a row matching ANY of them stays.
 *
 * OR, which makes the box a way to assemble a working set rather than to zero in
 * on one budget. "corn, soybeans" is the two crops side by side; "north, home
 * place" is those two fields whatever is planted on them. A producer who wants
 * one budget already has the whole name to type, and typing more of it is how
 * they get there.
 *
 * A comma is the separator rather than a space because the fields hold spaces:
 * "north quarter" is one budget name, and splitting on whitespace would make it
 * two terms and match every budget with "north" OR "quarter" in it. It is also
 * how the placeholder above the box already reads, so the punctuation is doing
 * what it looks like it does.
 *
 * Empty terms are dropped, so a trailing comma mid-typing changes nothing and a
 * box holding only commas is not a filter at all. That matters more under OR
 * than it would under AND: a term of `''` is a substring of every row, so one
 * stray comma would silently show the entire list back.
 */
function filterTerms() {
  return scenarioFilter
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function applyScenarioFilter() {
  const root = app.querySelector('[data-scn-sections]')
  if (!root) return

  const terms = filterTerms()
  const filtering = terms.length > 0
  const rows = [...root.querySelectorAll('.scn')]
  let shown = 0

  for (const row of rows) {
    const haystack = row.getAttribute('data-scn-search') || ''
    // No terms means no filter, and `some()` over an empty list is false — so
    // the "not filtering" case is stated rather than left to fall out of the
    // predicate, which under OR would hide every row instead of showing them.
    const match = !filtering || terms.some((t) => haystack.includes(t))
    row.hidden = !match
    if (match) shown += 1
  }

  applySectionVisibility(root, filtering)

  // The TEXT span, not the whole paragraph: the "upload a budget file" offer is
  // a control sitting at the end of the same line, and rewriting the paragraph
  // would delete it on the first keystroke into the filter box.
  const hint = app.querySelector('[data-scn-hint-text]')
  if (hint) hint.textContent = scenarioHint(shown, rows.length, filtering, terms.length)

  const empty = app.querySelector('[data-scn-empty]')
  if (empty) {
    empty.hidden = shown > 0
    // Under OR an empty list means every term failed, so it says so. Otherwise
    // a producer whose second term was a typo reads the list as evidence that
    // the first one found nothing either.
    empty.textContent =
      terms.length > 1
        ? `No saved budget matches any of "${scenarioFilter.trim()}". Try part of a budget name, an enterprise name, or a crop.`
        : `No saved budget matches "${scenarioFilter.trim()}". Try part of a budget name, an enterprise name, or a crop.`
  }

  const clear = app.querySelector('[data-action="clear-scn-filter"]')
  if (clear) clear.hidden = !scenarioFilter.trim()

  setReorderEnabled(root, !filtering)
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

    // The filter matches on data-scn-search, a field list baked into the row at
    // render time, and a rename never re-renders. Without this the row keeps
    // answering to its OLD name and cannot be found by its new one until
    // something else rebuilds the list — so a producer who renames a budget and
    // immediately searches for what they just typed finds nothing.
    const row = app.querySelector(`.scn[data-scn-id="${globalThis.CSS?.escape(id) ?? id}"]`)
    const record = getScenarioById(id)
    if (row && record) row.setAttribute('data-scn-search', searchText(record))
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
  if (!draggingId) return
  const root = app.querySelector('[data-scn-sections]')
  // A shut folder hides its rows, so there is no list under the pointer to aim
  // at. Opening it on hover is what makes a section that starts shut a place
  // you can drag INTO at all — see springOpenSection().
  springOpenSection(e.target, root)

  const list = e.target.closest?.('[data-scn-list]')
  if (!list) return
  e.preventDefault()
  const dragged = app.querySelector('.scn.dragging')
  if (!dragged) return
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
  // One finger at a time. A second finger landing on another handle overwrote
  // `touchDrag`, and the first row was left carrying `.dragging` and whatever
  // `--lift` it had reached, stuck mid-air until the next render.
  //
  // Explicitly `=== false`, not `!e.isPrimary`. A real browser always sets this;
  // a synthetic event does not, and treating "absent" as "not primary" would
  // reject every gesture rather than only the extra fingers.
  if (e.isPrimary === false) return
  if (touchDrag) return
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

/**
 * Hovering a shut folder's heading during a drag opens it.
 *
 * A shut section hides its rows with `hidden`, so `elementFromPoint()` never
 * returns that list and the drag had no way in — and since folders START shut,
 * that meant a budget could not be dragged into most of them at all. The Move
 * button covered it, so nothing looked broken; the drag affordance simply did
 * not apply, which is worse than an error because there is nothing to report.
 *
 * `expandedFolders` is updated as well as the DOM, so the section stays open
 * after the drop, when the list re-renders. Opening only: a section the producer
 * passed over on the way somewhere else stays open, because shutting it under a
 * finger that is still holding a row would take the drop target away mid-gesture.
 */
function springOpenSection(under, root) {
  const section = under?.closest?.('.scn-section')
  if (!section || !root.contains(section)) return
  const list = section.querySelector('[data-scn-list]')
  if (!list?.hidden) return
  const id = section.getAttribute('data-scn-section') ?? ''
  expandedFolders.add(id)
  list.hidden = false
  section.querySelector('.fld-toggle')?.setAttribute('aria-expanded', 'true')
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

  springOpenSection(under, root)

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
          populationTarget: btn.getAttribute('data-target-population'),
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
      // The new card opens, and every other one shuts.
      //
      // Pressing Add is asking for a box to type in. Arriving shut, it was a
      // closed spine below everything else and the press looked like it had
      // done nothing. Leaving the previous cards open is the other half of the
      // same problem: on a phone the new one sits below fifteen rows of the
      // enterprise just finished with, and on a computer every open column is
      // squeezed narrower to make room for an empty one.
      //
      // Shut them BEFORE pushing, or the new enterprise — not yet in
      // collapsedEnterprises, so counted as open — is shut along with them.
      scenario.enterprises.forEach((e) => collapsedEnterprises.add(e.id))
      const added = newEnterprise()
      scenario.enterprises.push(added)
      notify()
      render()
      scrollCardIntoView(added.id)
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

    // Each segment of the pill names the mode it selects, rather than the
    // control flipping to "the other one". With three segments there is no
    // other one, and even at two, writing the named mode means clicking the
    // segment you are already in is a no-op instead of a surprise.
    case 'set-line-mode': {
      const path = btn.getAttribute('data-path')
      const next = btn.getAttribute('data-mode')
      if (getPath(scenario, path) === next) return
      setPath(scenario, path, next)
      notify()
      render()
      break
    }

    case 'set-preharvest-mode': {
      // Stored as a boolean, not a mode string — the pre-v6 shape, and changing
      // it would mean migrating every saved budget to rename one flag.
      const path = btn.getAttribute('data-path')
      const next = btn.getAttribute('data-mode') === 'auto'
      if (getPath(scenario, path) === next) return
      setPath(scenario, path, next)
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
      revealScenarioFolder(scenario.id)
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
        revealScenarioFolder(found.id)
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
      // The copy inherits its source's folder, so the section holding it has to
      // be open when the producer comes back to the list. Shut, the copy they
      // just asked for is nowhere on screen, which reads as the duplicate
      // having failed. Same reasoning as clearing the filter on the line below.
      expandedFolders.add(copy.folderId ?? '')
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
      revealScenarioFolder(scenario.id)
      render()
      break

    // Removed from the DOM directly rather than through render(). A render here
    // would rebuild the whole saved list to delete one paragraph, throwing away
    // every compare tick on the page — the same rule the filter box follows.
    case 'dismiss-note': {
      dismiss(btn.getAttribute('data-note'))
      btn.closest('.baseline-note')?.remove()
      break
    }

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

    case 'backup-all':
      if (!listScenarios().length && !listFolders().length) {
        alert('There is nothing saved on this device to back up yet.')
        break
      }
      downloadBackup()
      break

    case 'restore-all':
      restoreFromFile()
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

/** "1 budget", "3 budgets" — used in a dialog where the count is the point. */
function pluralCount(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Replace the whole Saved tab from a backup file.
 *
 * This is the one destructive action in the app, and the only one that can take
 * away work the producer never opened. Three things follow from that:
 *
 * The dialog states BOTH counts — what is arriving and what is going — because
 * "are you sure?" is a question nobody can answer without them, and the
 * dangerous case is the one where the file holds two budgets and the device
 * holds twenty. The file is parsed BEFORE the dialog is raised, so a file that
 * turns out to be unreadable never gets as far as asking.
 *
 * The budget open on the Budget tab is left exactly as it is, including unsaved
 * edits. It is not part of the saved list, so a restore has no business
 * touching it; a producer mid-edit who restores a backup keeps what is in front
 * of them and can save it afterwards, which puts it back in the list.
 *
 * The filter is cleared, for the same reason a save clears it: the list it was
 * describing is gone, and a restored budget filtered out of sight reads as the
 * restore having failed.
 */
function restoreFromFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    const result = importBackupJSON(await file.text())
    if (!result.ok) {
      alert(result.error)
      return
    }

    const have = listScenarios().length
    const arriving = `This backup holds ${pluralCount(
      result.scenarios.length,
      'budget'
    )} in ${pluralCount(result.folders.length, 'folder')}.`
    const losing = have
      ? `Restoring it deletes the ${pluralCount(have, 'budget')} saved on this device now.`
      : 'There is nothing saved on this device now, so nothing is lost.'
    if (!confirm(`${arriving}\n\n${losing}\n\nThis cannot be undone. Restore anyway?`)) return

    const wrote = replaceAll(result.scenarios, result.folders)
    if (!wrote.ok) {
      alert(
        wrote.budgetsRestored
          ? 'The budgets were restored, but this browser would not save the folders. Every budget is in the list, none is in a folder.'
          : 'Nothing was changed — this browser is out of storage space.'
      )
    }

    screen = 'scenarios'
    scenarioFilter = ''
    revealScenarioFolder(getScenario().id)
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

/**
 * A typeface swap changes every glyph advance on the page, so the two widths
 * this file measures and writes as px are laid out again.
 *
 * Not a render: choosing a font changes no structure and touches no figure, and
 * a render here would take the caret out of whatever box somebody was typing in.
 * See announceFontChange() in prefs.js for why this is its own event.
 */
document.addEventListener('fb:fontchange', () => {
  sizeNameInputs()
  sizeEntNames()
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
// The Saved tab has not been drawn yet, but the section holding the budget
// being reopened has to be open by the time it is. See revealScenarioFolder.
if (reopened) revealScenarioFolder(reopened.id)
render()

subscribe(() => {
  dirty = true
  updateOutputs()
  updateStatus()
})
