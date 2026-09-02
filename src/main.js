// styles.css is linked from index.html, not imported here — see the comment
// there. Keeping this entry module plain JS lets the smoke tests import it.
import {
  initPrefs,
  dismiss,
  isSharingOn,
  setSharing,
  hasBeenAskedToShare,
  markAskedToShare,
} from './prefs.js'
// Config only. share.js itself is reached through a dynamic import in the save
// path, so the Firebase SDK never enters this module's import graph and the
// Node smoke tests can keep importing main.js directly.
import { SHARING_ENABLED, SHARING_AVAILABLE } from './firebase-config.js'
import { initAnalytics, track, trackOnce, resetOnce } from './analytics.js'
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
  ensureShareId,
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
  setScenarioShareId,
  ensureAllShareIds,
  rememberDeletedShareId,
  reorderScenarios,
  listFolders,
  reorderFolders,
  moveScenarioToFolder,
} from './storage.js'
import { openMoveModal, openFolderEditor, folderCountText } from './ui/folders.js'
import { renderEnterprises, applyUnitLabels } from './ui/enterprise.js'
import { renderFixed, OVERHEAD_LINES } from './ui/fixed.js'
import { renderResults, renderWarningsInto } from './ui/results.js'
import {
  renderScenarioList,
  renderCompare,
  scenarioHint,
  searchText,
  openExportDialog,
} from './ui/scenarios.js'
import { openInfo, openTypical, openGuide, openModal, closeModal, withBusy } from './ui/modals.js'
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
  downloadPNG,
  downloadBackup,
  printResults,
} from './export.js'
import { enterpriseLabel, VARIABLE_LINES, COST_BASIS } from './calc.js'

initAnalytics(initPrefs())

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

/**
 * Whether the budget on screen exists in the saved list.
 *
 * SEPARATE FROM scenarioIsNew, which stays true through the first save because
 * it is what tells the fold defaults to leave a blank budget's one enterprise
 * open. This one flips the moment there is a stored record, because it answers
 * a different question: whether the save state is allowed to say "Saved".
 *
 * It exists because that line read `dirty ? 'Unsaved changes' : SAVED_LABEL`,
 * which has no state for a budget nobody has saved yet. A brand-new budget is
 * not dirty — nothing has been typed into it — so pressing New put a tick and
 * the word Saved under a budget that was in no list and would be gone on
 * reload. The producer is being told their work is safe at the one moment it
 * is not.
 *
 * A flag rather than a lookup because updateStatus() runs on every keystroke,
 * and asking storage would parse the whole saved list each time.
 */
let scenarioSaved = false

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

  // `role="tablist"` moved off the <nav> and onto an inner wrapper holding the
  // two tabs and nothing else. It was on the nav, which also carries the `?`
  // and now the share switch, and a tablist announcing "3 of 3" for a control
  // that is not a tab misdescribes the whole group. The nav is a plain flex row
  // of [switch] [tablist] [help].
  return `
    <div class="app-head">
      ${nameBlock}
      <nav class="app-nav">
        ${shareToggle()}
        <div class="app-tabs" role="tablist">
          <button type="button" class="tab ${screen === 'build' ? 'active' : ''}"
            role="tab" aria-selected="${screen === 'build'}"
            data-action="go-build">Budget</button>
          <button type="button" class="tab ${screen !== 'build' ? 'active' : ''}"
            role="tab" aria-selected="${screen !== 'build'}"
            data-action="go-scenarios">Saved</button>
        </div>
        <button type="button" class="help-btn" data-action="how-to"
          aria-label="How to use this calculator" title="How to use this calculator">?</button>
      </nav>
    </div>`
}

/**
 * The sharing switch, beside the tabs on every screen.
 *
 * `role="switch"` rather than a checkbox: it takes effect the moment it is
 * pressed, with no form to submit, which is what a switch means and what a
 * checkbox does not.
 *
 * THE VISIBLE LABEL IS ONE WORD AND THE ACCESSIBLE NAME IS A SENTENCE. There is
 * not room for the sentence beside two tabs on a 320px screen, and "Share" on
 * its own is a question a screen reader cannot answer (share what, with whom?).
 * `aria-label` overrides the text for anybody who needs the long form. Same
 * problem the Saved tab's "Open Budget" solves the other way round, and for the
 * opposite reason: there the short form must not become the accessible name,
 * here the long one must.
 *
 * It renders nothing at all when sharing is switched off in firebase-config.js
 * or the project is not configured yet. A switch that cannot do anything is
 * worse than no switch: it invites a producer to turn on a thing that will not
 * happen, and there is no way for them to tell.
 */
function shareToggle() {
  if (!SHARING_ENABLED) return ''
  const on = isSharingOn()
  return `
    <button type="button" class="share-toggle" role="switch"
      aria-checked="${on}" data-action="toggle-share"
      aria-label="Share my budgets with the South Dakota Soil Health Coalition"
      title="${on ? 'Sharing is on. Saved budgets are sent to the Coalition.' : 'Sharing is off. Nothing is sent.'}">
      <span class="share-dot" aria-hidden="true"></span>Share
    </button>`
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
  //
  // The sentence carries "unless you turn on sharing" because it has to be true
  // in BOTH states. It cannot read the toggle and change: a line that says one
  // thing to somebody who has opted in and another to somebody who has not is a
  // line neither of them can quote back at us.
  //
  // `data-ex-tap` is the touch gesture for the hidden exporter panel (see
  // exporter.js). It sits on the Coalition line rather than on the logo because
  // themelab already owns five-taps-on-the-logo, and two counters watching one
  // element would both advance.
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
        Your figures stay on this device unless you turn on sharing.
        <button type="button" class="tip" data-info="privacy">Read more</button>
      </p>
      <p data-ex-tap>South Dakota Soil Health Coalition</p>
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
      <!-- Two lines in a column, and the share line is a SIBLING of #saveState
           rather than a child of it. updateStatus() rewrites that element's
           textContent and its className wholesale on every keystroke, so
           anything nested inside would be thrown away or restyled with it. -->
      <span class="save-stack">
        <span class="save-state" id="saveState"></span>
        <span class="share-state" data-share-state hidden></span>
      </span>
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
  trackProgress(getScenario(), result)

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
    // Three states, not two. "Not saved yet" is its own thing: it is not an
    // unsaved CHANGE, because nothing has been changed, and it is certainly not
    // saved. It wears the same ink as Unsaved changes, since what both mean to
    // a producer is the same — this is not in the list yet.
    const unsaved = dirty || !scenarioSaved
    el.textContent = !scenarioSaved ? 'Not saved yet' : dirty ? 'Unsaved changes' : SAVED_LABEL
    el.className = `save-state ${unsaved ? 'dirty' : ''}`
  }
  // Refreshed here rather than only after a send, so the line is right on every
  // path that rebuilds the bar: a render, opening another budget, or a toggle.
  updateShareState()
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

    // Three of the selects on this page are segmented controls wearing a
    // dropdown, so they belong under the same `control` dimension as the pills.
    for (const [re, read] of TRACKED_SELECTS) {
      const m = re.exec(path)
      if (!m) continue
      const [control, context] = read(m)
      track('mode_select', { control, choice: e.target.value, context })
      break
    }
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
    // The FIRST id only. A `?` may open several definitions at once, and sending
    // the joined list would make every combination its own dimension value; the
    // first is the one heading the panel and is what was asked about.
    track('definition_open', { definition_id: info.split(',')[0] })
    openInfo(info.split(','), btn.getAttribute('data-info-title') || undefined)
    return
  }

  // "use typical value" — writes exactly one field.
  const typical = btn.getAttribute('data-typical')
  if (typical) {
    // OPENED, not applied. The gap between this and `typical_value_applied` is
    // the number worth having: somebody who opens the picker and closes it again
    // is telling you the shipped figure did not match their operation, which is
    // a different and more useful signal than "nobody uses typical values".
    track('typical_value_open', {
      typical_key: typical,
      category: btn.getAttribute('data-category') || undefined,
    })
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

/* ──────────────────────────── what GA is told ──────────────────────────── */

/**
 * The actions worth counting, and what each one is called in GA.
 *
 * An allowlist rather than "track every action": most of the thirty-eight action
 * names are plumbing (`toggle-folder`, `focus-name`, `move-scenario-up`) and
 * counting them would bury the questions anybody actually asks of this data.
 *
 * Nothing here carries a name, a crop, or an amount. `count` is the only number
 * that goes out, and it is a count of rows rather than anything on them.
 */
const TRACKED_ACTIONS = {
  'new-scenario': () => ['scenario_start', {}],
  'new-folder': () => ['folder_created', {}],
  'import-scenario': () => ['scenario_imported', {}],
  'restore-all': () => ['backup_restored', {}],
  'how-to': () => ['guide_open', { source: 'footer' }],
  print: () => ['export_file', { format: 'print', scope: 'working' }],
  'export-csv': () => ['export_file', { format: 'csv', scope: 'working' }],
  'export-png': () => ['export_file', { format: 'png', scope: 'working' }],
  'export-json': () => ['export_file', { format: 'json', scope: 'working' }],
  'export-scenario': () => ['export_file', { format: 'json', scope: 'saved' }],
  'export-compare-csv': () => ['export_file', { format: 'csv', scope: 'compare' }],
  'backup-all': () => ['export_file', { format: 'json', scope: 'backup' }],
  // The segmented controls. Every one of these is a decision the spreadsheet
  // made for the producer and this app hands back, and none was measurable.
  'set-line-mode': (btn) => [
    'mode_select',
    {
      control: 'cost_line_mode',
      choice: btn.getAttribute('data-mode'),
      // `enterprises.0.variable.seed.mode` -> `seed`. WHICH line reached for the
      // escape hatch is the whole question: "producers override the sheet
      // sometimes" is not actionable, "they override it on fertilizer" is.
      context: (btn.getAttribute('data-path') || '').split('.').at(-2),
    },
  ],
  'set-preharvest-mode': (btn) => [
    'mode_select',
    { control: 'preharvest_mode', choice: btn.getAttribute('data-mode') },
  ],
}

/** Select paths that are really segmented controls, and the dimension each fills. */
const TRACKED_SELECTS = [
  [/^enterprises\.\d+\.yieldUnit$/, () => ['yield_unit', undefined]],
  [/^fixed\.annualBasis\.(\w+)$/, (m) => ['fixed_basis', m[1]]],
  [/^fixed\.labor\.hoursBasis$/, () => ['labour_basis', undefined]],
]

/**
 * One delegated hook for the allowlist above, plus the counts that are about the
 * budget rather than the button.
 */
function trackAction(action, btn, scenario) {
  if (action === 'add-enterprise') {
    // Counted AFTER the row lands, so the number is what the producer now has.
    // The four-enterprise ceiling is the reason this app exists, so how far past
    // four anybody actually goes is the one figure that judges that decision.
    track('enterprise_added', { count: (scenario?.enterprises?.length ?? 0) + 1 })
    return
  }
  if (action === 'compare-selected') {
    const picked = document.querySelectorAll('[data-compare-id]:checked').length
    // Below two the case bails out and no comparison happens.
    if (picked >= 2) track('compare_run', { count: picked })
    return
  }
  if (action === 'new-scenario') resetOnce(scenario?.id)

  const entry = TRACKED_ACTIONS[action]
  if (!entry) return
  const [name, params] = entry(btn)
  track(name, params)
}

/**
 * A warning's identity, from its own first six words.
 *
 * The model raises warnings as finished sentences, so there is no id to send.
 * Slugging the opening is the cheapest thing that reads well in a report, and it
 * has one real cost worth knowing before you reword a warning: **rewording its
 * first six words starts a new dimension value**, and the old one stops accruing
 * rather than erroring. Giving warnings real ids means changing what `warnings`
 * holds, which every consumer reads, and that is a bigger change than analytics
 * should force.
 */
function warningId(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
    .slice(0, 60)
}

/**
 * Reaching a real budget, and anything questionable on the way.
 *
 * "Complete" is revenue AND cost both above zero: a budget with only income
 * typed is half a budget, and its profit line is the revenue over again. There
 * is no unanswered-goal concept here the way the grazing calculator has one, so
 * this is the honest substitute and it is worth knowing it is a judgement call.
 *
 * Both go through `trackOnce()` against the scenario id, because updateOutputs()
 * runs on every keystroke.
 */
function trackProgress(scenario, result) {
  const t = result?.totals
  if (t && t.totalRevenue > 0 && finiteCost(t) > 0) {
    trackOnce(scenario?.id, 'budget_complete', {
      enterprises: scenario?.enterprises?.length ?? 0,
    })
  }
  for (const text of result?.warnings ?? []) {
    trackOnce(scenario?.id, 'warning_shown', { warning_id: warningId(text) })
  }
}

const finiteCost = (t) => (t.totalVariable || 0) + (t.totalFixed || 0)

function handleAction(action, btn) {
  const scenario = getScenario()
  trackAction(action, btn, scenario)

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
      // Stamp the share key BEFORE saving, so the save that triggers the send
      // is the one that writes the key to disk. See sendSharedBudget().
      // Remembered so the failure paths below can put it back. A key stamped
      // for a save that then fails is a key the disk never received, and
      // leaving it on the working budget is the one shape this app treats as
      // dangerous: it disagrees with storage until some later save happens to
      // reconcile it. shareNow() and shareOnOpen() both undo their stamp on
      // failure; this did not.
      const hadShareId = Boolean(scenario?.shareId)
      if (SHARING_ENABLED && isSharingOn()) ensureShareId(scenario)

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

      // A key stamped for a save that then failed is a key the disk never
      // received, so it comes back off. Nothing is sent in that state anyway,
      // but leaving it would have the working budget disagree with storage
      // until some later save happened to reconcile it.
      if (!result.ok && !hadShareId) delete scenario.shareId

      if (result.ok) {
        // Here rather than on the button: the press can end at the conflict
        // prompt above, and a count of presses is not a count of work kept.
        // scenarioSaved, NOT scenarioIsNew. The two look interchangeable here
        // and are not: scenarioIsNew is about PROVENANCE — this budget was
        // never opened from the saved list — and it deliberately survives the
        // first save, because it is what keeps a blank budget's one enterprise
        // unfolded rather than collapsing it under the producer the moment they
        // press Save. Read as "is this the first save", it answered yes to
        // every save of the same budget for as long as the tab stayed open.
        //
        // Read BEFORE the assignment below, which is what makes the first
        // press the one that says yes.
        track('scenario_saved', {
          enterprises: scenario?.enterprises?.length ?? 0,
          first_save: scenarioSaved ? 'no' : 'yes',
        })
        dirty = false
        scenarioSaved = true
        // A save can add a row, and a row that arrives filtered out of sight
        // reads as the save having failed. Whenever the list grows, the filter
        // goes.
        scenarioFilter = ''
        updateStatus()
        flashSaved()
        // Both of these come AFTER the budget is safely stored. Neither can
        // fail in a way that costs the producer their work, and the modal in
        // particular must never stand between somebody and a save.
        sendSharedBudget(scenario)
        maybeAskToShare(scenario)
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
      scenarioSaved = false
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
        scenarioSaved = true
        // getScenario(), NOT the `scenario` this handler captured on entry:
        // that binding is still the budget the producer just navigated away
        // from, so it would share the wrong one.
        shareOnOpen(getScenario())
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
      scenarioSaved = true
      // A copy is a budget that arrived in the list without a save being
      // pressed, exactly like one opened from it, so it goes now rather than
      // waiting for a save the producer has no reason to make. It carries no
      // key — duplicateScenario() strips it — so this mints a fresh one and
      // writes a SECOND record, never overwriting the original's.
      shareOnOpen(getScenario())
      render()
      break
    }

    case 'delete-scenario': {
      const id = btn.getAttribute('data-id')
      const target = getScenarioById(id)
      if (!target) return
      // IT SAYS WHAT ACTUALLY HAPPENS. A budget that has been sent leaves a
      // copy with the Coalition, marked deleted rather than removed, and
      // somebody pressing Delete would otherwise reasonably read the word as
      // covering both. The sentence is only shown when there is a record to
      // describe, and it names the control that does remove it. See the
      // KEY_SHARE_GONE comment in storage.js.
      const shared = Boolean(target.shareId) && SHARING_ENABLED
      if (
        !confirm(
          `Delete "${target.name}"? This cannot be undone.` +
            (shared
              ? '\n\nThe copy you shared with the Coalition is kept and marked deleted. ' +
                'If you would like to unshare it as well, turn the Share switch off and back on.'
              : '')
        )
      )
        return
      // READ BEFORE THE DELETE, because after it there is nowhere left to read
      // it from. The key lives on the budget alone and reads are denied, so a
      // record whose budget is gone can never be named again by anything — not
      // by a later save, and not by "stop sharing", which walks the budgets
      // that remain. Deleting a budget locally while its copy stayed with the
      // Coalition forever is the one outcome this app must not have.
      const key = target.shareId
      const gone = deleteScenario(id)
      // THE RECORD IS MARKED, NOT REMOVED. Clearing out last year's plans is
      // tidying this device's list, not withdrawing what was already
      // contributed, and last year's costs are the data being gathered. The
      // Share switch is the control that means withdraw, and it still reaches
      // these — which is what the tombstone below is for.
      if (key && gone.ok) {
        // BEFORE the network call and after the local delete. The key lives on
        // the budget and nowhere else, so without this the record has no
        // surviving handle: reads are denied, nothing can find a document it
        // cannot name, and "stop sharing" walks the budgets that remain. That
        // is what left records behind.
        const kept = rememberDeletedShareId(key)
        if (!kept.ok) console.warn('[share] could not remember a deleted record:', key, kept.error)
        // Fire and forget, exactly like a send: the local delete has already
        // happened and is what the producer asked for, so a slow or impossible
        // network must not hold the list open.
        markDeletedRecord(key)
        // The outcome described the record as this session last left it, and
        // the budget it belonged to is gone from the page.
        shareOutcomes.delete(key)
      }
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
    case 'toggle-share': {
      const on = !isSharingOn()
      // THE SWITCH DOES NOT CONSENT ON ITS OWN. Turning sharing on by flipping a
      // control labelled with one word would have somebody agree to send their
      // figures having read nothing about what goes or who gets it. So a press
      // that would turn it ON raises the dialog instead of taking effect, and
      // the dialog's own buttons decide — including saving and sending the open
      // budget, which shareNow() does.
      //
      // EVERY TIME, not only the first. Turning sharing off and on again is
      // consent given a second time, and so is turning it on after declining;
      // there is no reading of this where the second yes needs less information
      // than the first. It also cannot nag, because it answers a press the
      // producer just made.
      //
      // This is why openShareConsent() is separate from maybeAskToShare().
      // `hasBeenAskedToShare()` exists to stop the prompt following every SAVE
      // around, which is a different question from what an explicit press of
      // the switch deserves, and gating this on it would have meant "you
      // already read that once".
      //
      // Only in this direction. Turning sharing OFF always takes effect
      // immediately, whatever has or has not been asked: withdrawing must never
      // be gated behind reading something.
      if (on) {
        openShareConsent(scenario)
        break
      }
      // Turning it ON is one click and takes effect. Turning it OFF also
      // deletes what this device has already sent, which is destructive and
      // irreversible, so that direction asks first. The asymmetry is the point:
      // the confirm is not about consent, it is about the deletion, and the
      // dialog says what goes rather than asking "are you sure?" — a producer
      // switching off to stop FUTURE sends may not expect the back catalogue to
      // go with it, and that is exactly the case that needs the sentence.
      if (!on) {
        const ok = confirm(
          'Stop sharing?\n\n' +
            'Nothing more will be sent, and the budgets this device has already shared will be ' +
            'deleted from the Coalition.\n\n' +
            'Your own copies stay on this device and are not touched.'
        )
        if (!ok) break
      }
      // AND THE QUESTION COMES BACK, which is setSharing()'s doing rather than
      // this line's — see its comment. Switching off used to mark the question
      // answered, so a producer who tried sharing and turned it off again was
      // never asked anything on any later save. That made the switch a way of
      // opting out of being asked, which is not something a control labelled
      // with one word can say. Only the dialog's own "Not now" ends it.
      setSharing(on)
      track('share_toggled', { state: on ? 'on' : 'off' })
      // ONLY THE OFF DIRECTION REACHES HERE. The ON press returned above, at
      // the consent dialog, and it is the dialog's own Share button that calls
      // shareNow(). There used to be an `if (on) shareNow(scenario)` at this
      // point as well: unreachable, and a trap rather than merely dead, since
      // anyone tidying the two `if (on)` tests into one would reinstate a send
      // that runs whether or not the question was answered.
      {
        // The working budget's own key goes NOW, not in the `.then()` below.
        // The stored copies have already been cleared by the time that promise
        // resolves, and the remote half can take a while or never arrive — so
        // waiting left this budget holding a key its saved copy no longer had,
        // and the next save wrote it straight back. Withdrawing appeared to
        // work and then undid itself.
        delete scenario.shareId
        // The records are going, so what this session remembers about sending
        // them is not merely stale: it describes documents that will not exist.
        shareOutcomes.clear()
        import('./share.js')
          .then((m) => m.unshareEverything())
          .then((r) => shareLog(`withdrawn: ${r?.deleted ?? 0} record(s) deleted`))
          .catch((err) => shareLog(`withdrawal incomplete: ${err}`))
          .finally(() => render())
      }
      render()
      break
    }

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

    // The Results header's own button. Like the footer's three it acts on the
    // working budget, unsaved edits included: it is a picture of the figures
    // on screen, and reading the stored record would hand back a picture of
    // the last save instead.
    case 'export-png':
      downloadPNG(scenario)
      break

    /* The same files, for a row in the saved list rather than for the budget
       open on the Budget tab. They are separate actions and not the ones above
       with an id bolted on, because these read the STORED record: a producer
       picking Export on a row has named which budget they mean, and it is
       routinely not the one they are in the middle of editing. */
    case 'export-scenario': {
      const found = getScenarioById(btn.getAttribute('data-id'))
      if (!found) return
      openExportDialog(found)
      break
    }

    case 'save-as-json':
    case 'save-as-csv':
    case 'save-as-png':
    case 'save-as-print': {
      const found = getScenarioById(btn.getAttribute('data-id'))
      if (!found) return
      // Shut first. Printing renders the page the sheet is taken from, and the
      // modal is part of that page: left open it prints as a grey veil over
      // the budget. The downloads close it for consistency, and because a menu
      // that stays up after its one choice has been made reads as the tap not
      // having landed.
      closeModal()
      if (action === 'save-as-json') downloadJSON(found)
      else if (action === 'save-as-csv') downloadCSV(found)
      // The image is drawn from the stored record like the other two, and
      // never borrows the page the way Print has to — a canvas is not the
      // document, so there is nothing to swap out and put back.
      else if (action === 'save-as-png') downloadPNG(found)
      else printSavedBudget(found)
      break
    }

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
 * Print a budget that is not the one open on the Budget tab.
 *
 * `window.print()` prints the page, and the page here is the saved list. So
 * printing a row means putting that budget on screen first, which means
 * borrowing the working scenario and putting it back afterwards, unsaved edits
 * and all: a producer printing last year's budget out of the list has not
 * asked to lose what is in front of them.
 *
 * A CLONE goes in, never the stored record, so nothing that runs while the
 * sheet is up can write through into the saved list.
 *
 * THREE things have to come back, and only the first is obvious.
 *
 *   The scenario, as the same object, so anything holding a reference to it is
 *   not left pointing at a copy.
 *
 *   Its `updatedAt`. setScenario() calls notify(), which stamps whatever
 *   scenario it is handed — so the restoring call re-stamps it too, and a
 *   budget nobody touched would come back from a print looking edited.
 *
 *   And `dirty`, for the same reason: notify() sets it through the subscriber,
 *   so a clean budget would come back claiming unsaved changes and would put
 *   the browser's "are you sure you want to leave?" dialog in front of somebody
 *   who had done nothing but press Print.
 *
 * Fold state is deliberately left alone. `@media print` opens every collapsed
 * card and the fixed block, so what is folded on screen changes nothing on
 * paper, and restoring a Set of enterprise ids that belong to a different
 * budget is a state swap with no reader.
 *
 * The swap back runs on `afterprint`. Reading it off print() returning instead
 * is wrong on a phone, where print() can hand back before the sheet has
 * appeared and the page would be pulled out from under it. A browser with no
 * such event gets the synchronous version, which is what it behaves like.
 */
function printSavedBudget(found) {
  const before = { scenario: getScenario(), screen, dirty }
  const updatedAt = before.scenario?.updatedAt

  setScenario(structuredClone(found))
  screen = 'build'
  render()

  const restore = () => {
    setScenario(before.scenario)
    if (before.scenario) before.scenario.updatedAt = updatedAt
    screen = before.screen
    dirty = before.dirty
    render()
    updateStatus()
  }

  const win = document.defaultView
  if (win && 'onafterprint' in win) {
    win.addEventListener('afterprint', restore, { once: true })
    printResults()
  } else {
    printResults()
    restore()
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

/* ─────────────────────────── sharing with SDSHC ────────────────────────── */

/**
 * What the last send of each record actually did: 'sent', 'queued', or 'failed'.
 *
 * UI STATE, so it is module-level here and not on the scenario — the same rule
 * fold state follows. Putting it on the budget would mark it dirty, ride into
 * the exported file, and describe one device's last network attempt as though
 * it were a fact about the farm.
 *
 * KEYED ON shareId RATHER THAN THE OPEN BUDGET, because a producer can open
 * another budget between a send going out and the answer coming back.
 *
 * IT DOES NOT SURVIVE A RELOAD, and that is honest rather than a gap. Nothing
 * on this device can find out whether a record exists: reads are denied, which
 * is the entire point of the rules. So after a reload the line says nothing
 * until the next send answers. That under-reports, which is the safe direction
 * for a line whose only job is to not over-claim.
 */
const shareOutcomes = new Map()

/** One prefix, so a producer's console filters the lot with one word. */
function shareLog(message) {
  console.info(`[share] ${message}`)
}

/** The three things the line can say. A state with no entry says nothing. */
const SHARE_STATE_TEXT = {
  sent: 'Shared',
  // NOT "Shared", and not an error either. The write is already durable in
  // IndexedDB and will go on its own, which is the normal path at the Soil
  // Health School — but it has not gone yet, and saying it has is the exact
  // false claim this line was rewritten to stop making.
  queued: 'Shares when back online',
  failed: 'Not shared',
}

/**
 * Delete one record, because the budget that named it has just been deleted.
 *
 * NOT GATED ON isSharingOn(). Every other path here checks the switch, and this
 * one must not: a producer who turned sharing off and then deleted a budget
 * would be relying on the "off" to have taken the record away, and if it did
 * not — a failed delete, a device that was offline at the time — this is the
 * last chance anything has to name it. The key existing at all is the evidence
 * that a record was sent; the switch says nothing about the past.
 *
 * SHARING_AVAILABLE still applies, inside share.js, because an unconfigured
 * build has no project to delete from.
 */
function markDeletedRecord(shareId) {
  if (!SHARING_AVAILABLE) return shareLog(`not marked: sharing is unavailable — ${shareId}`)
  import('./share.js')
    .then((m) => m.markBudgetDeleted(shareId))
    .then((r) => {
      // A MARK THAT DID NOT LAND IS WORTH SAYING OUT LOUD. The record keeps
      // whatever it last said, so the Coalition reads a budget as live when the
      // producer has deleted it. That is a stale row rather than a lost one —
      // the key is in the tombstone list, so the Share switch still reaches it
      // — but nothing else will retry, and the figures are correct while only
      // the status is wrong.
      if (r?.ok) shareLog(`record marked deleted — ${shareId}`)
      else console.warn('[share] record NOT marked deleted:', shareId, r?.error)
    })
    .catch((err) => console.warn('[share] record NOT marked deleted:', shareId, err))
}

/**
 * Take the deleted mark off a record whose budget has come back.
 *
 * The mirror of markDeletedRecord(), and it fails the same way: the record
 * keeps whatever it last said, so the Coalition reads a budget as deleted while
 * the producer is holding it. A stale status rather than a lost row, and the
 * next ordinary save of that budget corrects it, because every send clears the
 * field too.
 */
function unmarkDeletedRecord(shareId) {
  if (!SHARING_AVAILABLE) return shareLog(`not unmarked: sharing is unavailable — ${shareId}`)
  import('./share.js')
    .then((m) => m.unmarkBudgetDeleted(shareId))
    .then((r) => {
      if (r?.ok) shareLog(`record unmarked — ${shareId}`)
      else console.warn('[share] record NOT unmarked:', shareId, r?.error)
    })
    .catch((err) => console.warn('[share] record NOT unmarked:', shareId, err))
}

/**
 * Send this budget's record, if the producer has asked for that.
 *
 * DELIBERATELY NOT AWAITED. The budget is already in localStorage before this
 * runs, so the send is the one part that can be slow or impossible, and a save
 * button that waits on a network round trip at a workshop with no signal is a
 * save button that looks broken. Firestore queues the write in IndexedDB and
 * flushes it whenever the connection returns, so "fire and forget" here means
 * "durable and later" rather than "lost".
 *
 * The dynamic import is what keeps Firebase out of this module's graph — see
 * the header of share.js. It is also why this cannot be inlined at the call
 * site: `import()` is a promise, and awaiting it in the save handler would
 * reintroduce exactly the wait the comment above is avoiding.
 */
function sendSharedBudget(scenario) {
  // EVERY EXIT SAYS WHICH ONE IT WAS. This function had three silent returns
  // and a swallowed rejection, so "nothing happened and nothing was logged"
  // covered a misconfigured project, a switch that was off, a refused write,
  // and a successful send alike. Diagnosing it meant guessing between them from
  // the outside, repeatedly. One line in the console is worth more than the
  // tidiness of not having it.
  if (!SHARING_AVAILABLE) return shareLog('not sent: sharing is unavailable (check firebase-config.js)')
  if (!isSharingOn()) return shareLog('not sent: the Share switch is off')
  if (!scenario) return shareLog('not sent: no budget open')
  import('./share.js')
    .then((m) => m.shareBudget(scenario))
    .then((result) => {
      const id = scenario.shareId
      if (id) {
        shareOutcomes.set(
          id,
          result && result.ok ? (result.queued ? 'queued' : 'sent') : 'failed'
        )
      }
      updateShareState()
      // The id is in the message so it can be matched against the document in
      // the Firestore console, which is the only way to check from outside that
      // the record a save claims to have written is the one that is there.
      if (result && result.ok) {
        shareLog(`${result.queued ? 'queued, will send when online' : 'sent'} — ${id}`)
      }
      // SAY SO IN THE CONSOLE, because otherwise nothing anywhere does.
      //
      // shareBudget() RESOLVES {ok: false, error} rather than throwing, which
      // is what rule 3 in share.js requires of it — but it also means the
      // .catch() below never sees a rejected write, and the "Shared" line is
      // written from the presence of a shareId rather than from a send having
      // landed. So a write refused by firestore.rules produced no failure, no
      // log, and a budget on screen claiming to be shared. There was nothing
      // to look at.
      //
      // A queued offline write is NOT a failure and is not warned about: it is
      // durable in IndexedDB and will flush, which is the normal path at the
      // Soil Health School.
      if (result && result.ok === false) console.warn('[share] not sent:', result.error)

    })
    .catch((err) => {
      /* a failed send must never cost a save */
      if (scenario.shareId) shareOutcomes.set(scenario.shareId, 'failed')
      updateShareState()
      console.warn('[share] not sent:', err)
    })
}

/**
 * Share a budget that is not already mid-save: stamp, store, then send.
 *
 * The save path does these three things itself, in this order, spread either
 * side of its own `saveScenario()`. The other two ways a budget gets shared —
 * turning the switch on, and answering the consent dialog — are not saves, so
 * they would otherwise mint an id at SEND time and never write it down.
 *
 * THE ORDER IS THE POINT, AND SO IS THE EARLY RETURN. The key has to be on disk
 * before the record it names exists, because the key is the only handle on that
 * record: reads are denied, so a budget that sent something it cannot name can
 * never update it and can never delete it, and "turning sharing off deletes the
 * records this device has sent" would be false for it forever.
 *
 * So a failed save means no send. That is the safe direction: a budget nobody
 * shared can be shared later, while a record nobody can reach is permanent. A
 * Conflict here is deliberately NOT forced past — another tab has newer work,
 * and taking it over to enable a setting is not a trade the producer asked for.
 */
function shareNow(scenario) {
  if (!SHARING_ENABLED) return shareLog('not sent: sharing is switched off in this build')
  if (!isSharingOn()) return shareLog('not sent: the Share switch is off')
  if (!scenario) return shareLog('not sent: no budget open')
  // The three gates above are SHARING_ENABLED, matching the save path's own
  // stamp a few lines into the `save-scenario` case. Only sendSharedBudget()
  // below follows SHARING_AVAILABLE: the key is device state and is written
  // whenever sharing is on, so an unconfigured build behaves exactly like a
  // configured one right up to the network call. The two must not diverge, or
  // the code path that runs in development is not the one that runs in
  // production.
  ensureShareId(scenario)
  const result = saveScenario(scenario)
  if (!result.ok) {
    // Silent until now, and it is the one exit with a visible consequence: the
    // key is taken back off the budget, so the producer agreed to share and
    // nothing at all happened. A Conflict is the likely cause and says nothing
    // about sharing, which makes it the hardest of these to guess from outside.
    shareLog(`not sent: the budget could not be saved first (${result.error})`)
    delete scenario.shareId
    return
  }
  // This IS a save, so the bar has to know. Without it, agreeing to share left
  // "Not saved yet" standing over a budget that had just been written to disk,
  // and the share line paired to that state stayed hidden with it.
  dirty = false
  scenarioSaved = true
  updateStatus()
  sendSharedBudget(scenario)
}

/**
 * Send every budget already in the saved list.
 *
 * TURNING SHARING ON IS ABOUT THE PRODUCER'S BUDGETS, NOT THE OPEN ONE. Consent
 * used to send only what was on screen, so somebody who built a season's worth
 * of plans and agreed to share at the end of it sent one of them and left the
 * other nineteen to be opened one at a time, with nothing on screen saying so.
 *
 * KEYS FIRST, IN ONE WRITE, THEN THE SENDS. ensureAllShareIds() stamps the
 * whole list in a single localStorage write and does not bump `updatedAt` —
 * flipping a switch must not re-date twenty budgets and re-sort the list under
 * the producer. If that write fails nothing is sent at all, which is the rule
 * every path here obeys: a record whose key was never written down can never be
 * updated or deleted.
 *
 * `skipId` is the budget the caller has already handled through shareNow(),
 * which is a real save and therefore not this function's business.
 */
function shareAllSaved(skipId) {
  if (!SHARING_ENABLED || !isSharingOn()) return
  const stamped = ensureAllShareIds()
  if (!stamped.ok) return shareLog(`not sent: keys could not be stored (${stamped.error})`)
  const rest = stamped.scenarios.filter((s) => s.id !== skipId)
  if (!rest.length) return
  shareLog(`sending ${rest.length} saved budget(s)`)
  // AS STORED, never through getScenario(). The open budget is the caller's to
  // handle and is skipped above; every other record here is a budget nobody is
  // editing, and what the Coalition should have is what is on disk.
  for (const record of rest) sendSharedBudget(record)
}

/**
 * Send a budget that arrived on screen without a save, if sharing is on.
 *
 * THREE CALLERS, ONE SITUATION: opening a saved budget, duplicating one, and
 * importing a budget file. All three end with a budget in the saved list and on
 * screen that the producer never pressed Save for, so all three would otherwise
 * sit unsent until somebody pressed it for no reason they could see. Only the
 * first of them started here; the other two were the same gap, one step further
 * along.
 *
 * A DUPLICATE AND AN IMPORT BOTH ARRIVE WITH NO KEY, which is the difference
 * that matters. duplicateScenario() and importScenarioJSON() strip `shareId` —
 * see the strip table in CLAUDE.md — so the branch below mints a fresh one and
 * each becomes its OWN record. That is the point of stripping it: a copy that
 * kept the key would overwrite the budget it was copied from, and an imported
 * file would overwrite whatever the device that exported it had already sent.
 *
 * From here they follow every other budget: the key is on disk, so each later
 * save upserts that same record through the save path.
 *
 * WHY OPENING SENDS AT ALL. Sharing only ever fired on a save, so a budget that
 * was already finished before the switch went on sat there unsent until
 * somebody thought to open it and press Save for no reason they could see. A
 * restored backup was the worst of it: twenty budgets arrive, sharing is on,
 * and nineteen of them are invisible to the Coalition until each is opened and
 * re-saved by hand.
 *
 * IT DOES NOT BUMP updatedAt, which is the one thing separating this from
 * shareNow(). Opening a budget is not editing it, and `updatedAt` is what the
 * saved list prints as the last time the producer was at the keyboard — so
 * routing this through saveScenario() would re-date a budget somebody merely
 * looked at, and re-sort the list under them. setScenarioShareId() writes the
 * key and nothing else.
 *
 * The key still reaches disk BEFORE the send, which is the rule every path here
 * obeys: reads are denied, so a record whose key was never written down can
 * never be updated or deleted.
 *
 * Nothing is sent if the key cannot be stored. That is the safe direction, and
 * it is the same call shareNow() makes for the same reason.
 */
function shareOnOpen(scenario) {
  if (!SHARING_ENABLED || !isSharingOn() || !scenario?.id) return
  if (!scenario.shareId) {
    ensureShareId(scenario)
    const result = setScenarioShareId(scenario.id, scenario.shareId)
    if (!result.ok) {
      shareLog(`not sent on open: the key could not be stored (${result.error})`)
      delete scenario.shareId
      return
    }
    scenario.shareId = result.shareId
  }
  sendSharedBudget(scenario)
}

/**
 * Ask on a save, and only until the question has been answered.
 *
 * ON THE FIRST SAVE RATHER THAN THE FIRST VISIT, which is the whole reason this
 * is not in the boot block. A consent dialog in front of an empty calculator
 * asks somebody to agree to share a budget that does not exist yet, before they
 * know what the app collects or whether they will use it twice. The first save
 * is the moment there is something to share and the producer has seen what it
 * looks like.
 *
 * `markAskedToShare()` IS CALLED ON AN ANSWER AND ONLY ON AN ANSWER. Declining
 * has to stick, or the dialog becomes something a producer says no to on every
 * save, which is how a consent prompt turns into a thing people click through
 * without reading. But putting the dialog away is not declining.
 *
 * This was the other way round and was wrong. Escape and the close button used
 * to count as having been asked, on the reasoning that silence is the same
 * answer as "not now" and re-raising it punishes somebody for dismissing it.
 * That reasoning holds for a prompt offering a feature. It does not hold for
 * this one, because the two answers are not symmetric: "not now" is a decision
 * the producer made and can revisit from the switch, while a dismissal is a
 * producer who has not read the question yet. Treating those alike means the
 * question is never put again, and the quietest possible way of not answering
 * becomes permanent.
 *
 * So the dialog returns on the next save until it is answered, and BOTH buttons
 * end it — including the one that says no.
 */
function maybeAskToShare(scenario) {
  if (hasBeenAskedToShare()) return
  openShareConsent(scenario)
}

/**
 * Put the question, whether or not it has been put before.
 *
 * TWO ENTRY POINTS, ONE DIALOG, and they are gated differently on purpose. A
 * save asks through maybeAskToShare(), which asks once, because a prompt that
 * followed every save around is one people learn to dismiss without reading.
 * The switch comes straight here every time it would turn sharing ON, because a
 * press of it is a request to be asked: it is the moment consent is given, and
 * the second yes does not need less information than the first.
 *
 * Answering yes from either place saves and sends the budget on screen through
 * shareNow().
 */
function openShareConsent(scenario) {
  if (!SHARING_ENABLED) return
  track('share_prompt_shown')
  const body = openModal(
    'Share this budget with the Coalition?',
    `<div class="def">
       <p>The South Dakota Soil Health Coalition would like to see the budgets built with this
          calculator to gather data on real-world production costs across the state in order to better-serve producers we assist.
          This is optional and it is up to you.</p>
       <p><b>If you say yes,</b> saving a budget sends a copy to the South Dakota Soil Health Coalition.</p>
       <p><b>Your information remains anonymous.</b> Leave personally identifying information out of your budget name
          if you would like to avoid being identifiable.</p>
       <p>Shared budgets are not published, sold, or shared outside the Coalition. You can
          change your mind at any time with the <b>Share</b> switch beside the Budget and Saved tabs. Turning
          it off deletes any records this device has sent.</p>
       <div class="share-ask-btns">
         <button type="button" class="btn-main" data-share-answer="yes">Share my budgets</button>
         <button type="button" class="btn-remove btn-quiet" data-share-answer="no">Not now</button>
       </div>
     </div>`
  )
  if (!body) return

  for (const btn of body.querySelectorAll('[data-share-answer]')) {
    btn.addEventListener('click', () => {
      const yes = btn.getAttribute('data-share-answer') === 'yes'
      setSharing(yes)
      // BOTH buttons end the question, which is the whole difference between an
      // answer and a dismissal. "Not now" has to stick or it is not an answer.
      markAskedToShare()
      track('share_prompt_answered', { answer: yes ? 'yes' : 'no' })
      closeModal()
      // The budget that prompted the question is the one they were asked
      // about, so it goes now rather than waiting for another save. Through
      // shareNow(), because the save that has just finished ran BEFORE the
      // answer existed and therefore stamped no key.
      if (yes) {
        shareNow(scenario)
        // AND EVERYTHING ALREADY SAVED. Saying yes is saying yes to the budgets
        // this producer has, not only to the one that happens to be open — and
        // before this, agreeing at the end of a season sent exactly one of
        // twenty and left the rest to be opened one at a time by hand.
        shareAllSaved(scenario?.id)
      }
      render()
    })
  }

  // Nothing is marked here. Dismissing the dialog leaves the question open and
  // the next save asks it again. See the note above.
}

/**
 * Say whether the budget on screen has a record, under the save state.
 *
 * A SIBLING OF #saveState, NEVER A CHILD. updateStatus() rewrites that
 * element's className wholesale, so anything nested inside it is rebuilt or
 * restyled on every keystroke.
 *
 * IT REPORTS THE SEND, NOT THE SETTING, and it used to report neither. The line
 * followed the presence of a `shareId`, which is stamped BEFORE the save that
 * triggers a send — so a write the rules refused, a project misconfigured, a
 * Firestore that would not start, all left "Shared" on screen under a budget
 * that had gone nowhere. That is the one thing this line must never do: it is
 * the only place the app says anything about whether the Coalition has the
 * budget, and a promise it cannot keep is worse than saying nothing.
 *
 * So it says what happened, from shareOutcomes, and distinguishes the queued
 * case rather than folding it into either answer.
 */
function updateShareState() {
  const el = document.querySelector('[data-share-state]')
  if (!el) return
  // PAIRED WITH THE SAVE STATE, never shown beside anything but a tick. What
  // went to the Coalition is the budget as it was SAVED, so the moment there
  // are unsaved changes the line describes a version that is no longer the one
  // on screen — and "Shared" over edits somebody is still typing reads as a
  // promise about those edits. The same goes for a budget that has never been
  // saved at all, where there is nothing to describe.
  //
  // The line comes back on the next save, which is also the next send.
  const settled = scenarioSaved && !dirty
  const id = settled && SHARING_ENABLED && isSharingOn() ? getScenario()?.shareId : null
  const outcome = id ? shareOutcomes.get(id) : undefined
  const text = SHARE_STATE_TEXT[outcome] ?? ''
  el.textContent = text
  el.hidden = !text
  el.classList.toggle('share-state-bad', outcome === 'failed')
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
    scenarioSaved = true
    // Same reasoning as a duplicate: the budget is in the list and on screen
    // without a save having been pressed. importScenarioJSON() strips the key,
    // so a file that already went to the Coalition from the device it was
    // exported on becomes a new record here rather than overwriting that one.
    shareOnOpen(getScenario())
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
    // Two veils, not one, because the confirm dialog sits between them and a
    // spinner behind a question the producer is being asked to answer says the
    // app is busy with something they have not agreed to yet.
    const result = await withBusy('Reading the backup file', async () =>
      importBackupJSON(await file.text())
    )
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

    // The write and the render are under ONE veil, because on a long list the
    // render is the slower of the two and a veil that comes away before the
    // page has been rebuilt hands back a blank moment that reads as a failure.
    const wrote = await withBusy('Restoring your budgets', () => {
      const res = replaceAll(result.scenarios, result.folders)
      // A total failure changed nothing, so nothing below should run either.
      // Saying "nothing was changed" and then switching tab and re-rendering
      // reads as a restore having happened after being told it had not.
      if (!res.ok && !res.budgetsRestored) return res

      screen = 'scenarios'
      scenarioFilter = ''
      revealScenarioFolder(getScenario().id)
      render()
      return res
    })

    // A RESTORE THAT DROPPED BUDGETS MARKS THEIR RECORDS, and keeps them. Same
    // decision as deleting one budget, reached the same way: rolling this
    // device's list back is not asking the Coalition to forget what was already
    // contributed, and last year's costs are the data being gathered. What the
    // mark says is only that the producer no longer holds that budget, so the
    // record will not be updated again — which a reader of the workbook needs
    // in order to know what they are averaging.
    //
    // replaceAll() has already tombstoned the keys, so these stay reachable and
    // the Share switch still deletes them. That part is not optional: it is
    // what keeps "turning it off deletes any records this device has sent"
    // true. Marking them is the part that is a judgement call.
    for (const key of wrote.dropped ?? []) markDeletedRecord(key)
    // AND THE OTHER DIRECTION. A backup keeps shareId, so this restore can also
    // bring BACK a budget an earlier one dropped — arriving with the key to a
    // record that says it was deleted, which it is not: the producer has it
    // again. replaceAll() has already lifted the tombstone; this is the half
    // that tells the Coalition.
    for (const key of wrote.revived ?? []) unmarkDeletedRecord(key)

    // Both alerts are raised with the veil already down, so neither is a
    // question asked over a picture of the app still working. The partial
    // failure is reported AFTER the render on purpose: it describes the list
    // the producer is now looking at, and reading it before the list arrives
    // gives them nothing to check it against.
    if (!wrote.ok) {
      alert(
        wrote.budgetsRestored
          ? 'The budgets were restored, but this browser would not save the folders. Every budget is in the list, none is in a folder.'
          : 'Nothing was changed — this browser is out of storage space.'
      )
    }
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
scenarioSaved = Boolean(reopened)
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
