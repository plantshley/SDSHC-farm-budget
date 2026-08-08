/**
 * Saved scenarios and the compare view.
 *
 * This is the part with no spreadsheet equivalent, and the reason the app
 * exists: "Field Corn vs. Silage Corn" and "Tillage vs. No-Till on soybeans"
 * are questions you answer by building one budget, duplicating it, changing one
 * thing, and putting the two side by side.
 */

import { usd, usdCents, esc, signClass } from './format.js'
import { calcScenario } from '../calc.js'
import { listScenarios, listFolders } from '../storage.js'
import { infoButton } from './fields.js'
import { renderFolderSection } from './folders.js'
import { isDismissed } from '../prefs.js'

/**
 * The sentence explaining what a baseline is, with a way to put it away.
 *
 * It is worth saying once: which budget you tick first decides what every other
 * column is measured against, and nothing else on screen says so. It is not
 * worth saying forever. A producer who compares budgets regularly reads it on
 * every visit to this tab, and a permanent instruction is one people stop
 * seeing, which costs the genuinely useful notices beside it their credibility.
 *
 * Dismissal is a PREFERENCE and persists — see prefs.js. Per-session would mean
 * showing it again tomorrow, which is the behaviour the button exists to stop.
 */
function baselineNote() {
  if (isDismissed(BASELINE_NOTE_ID)) return ''
  return `
    <p class="hint baseline-note">
      <span>
        Select two or more to compare them. <b>The first one you select becomes the
        baseline.</b> Every other budget is shown as a difference from it.
      </span>
      <button type="button" class="note-dismiss" data-action="dismiss-note"
        data-note="${esc(BASELINE_NOTE_ID)}"
        aria-label="Hide this note">Got it</button>
    </p>`
}

export const BASELINE_NOTE_ID = 'baseline'

/**
 * The line above the list, which has two things to say depending on whether a
 * filter is running.
 *
 * Defined once and called from both the template and main.js, because the two
 * must never drift: the unfiltered version promises the ▲▼ arrows work, and
 * while a filter is on they deliberately do not.
 *
 * It is the TEXT only. The "upload a budget file" offer lives at the end of the
 * same paragraph but outside the part this rewrites — see `hint` below — so
 * that typing in the filter box cannot delete a control.
 */
export function scenarioHint(shown, total, filtering) {
  if (!filtering) {
    return 'Saved on this device only. Tap a name to rename it. Reorder the list with the ▲▼ arrows, or by dragging the handle, and organize your budgets into folders.'
  }
  return `Showing ${shown} of ${total} budget${total === 1 ? '' : 's'}. Reordering is off while the list is filtered.`
}

export function renderScenarioList(currentId, filterQuery = '', expandedFolders = new Set()) {
  const all = listScenarios()
  const folders = listFolders()

  // Two forms of the same offer.
  //
  // On the populated list it is a clause on the end of the hint, because that
  // paragraph is already the place a producer reads to find out what this
  // screen can do, and a lone link floating beside the Compare button read as
  // an action of equal weight to comparing budgets. It sits OUTSIDE
  // [data-scn-hint-text], which the filter rewrites on every keystroke.
  //
  // On the empty state it stands alone, because there is no hint sentence to
  // hang it off and importing is the only thing you can usefully do there.
  const openFileClause = `
    You can also
    <button type="button" class="tip" data-action="import-scenario">upload a budget file</button>
    ${infoButton('budgetFile', 'a budget file')}`

  const openFile = `
    <span class="open-file">
      <button type="button" class="tip" data-action="import-scenario">Upload a budget file</button>
      ${infoButton('budgetFile', 'a budget file')}
    </span>`

  // Always present once anything is saved, rather than appearing at some row
  // count: a control that materialises partway down a list is one a producer
  // has to notice arriving, and there is no obvious number to arrive at.
  //
  // The box carries whatever was typed into it, because the list re-renders for
  // reasons that have nothing to do with the filter (a delete, a reorder, a
  // rename that failed to save) and a box that empties itself on one of those
  // reads as the app losing track of what you asked for.
  //
  // The placeholder is deliberately terse. It named five fields in full and ran
  // to 66 characters, which is cut off mid-word on a 360px screen — and
  // placeholder TEXT cannot be varied by width in CSS, only its size, so the
  // short form has to be the only form.
  //
  // "year" carries the same promise the longer "planning year" did: the filter
  // matches the scenarioYear field AND the budget's name, so a producer who
  // wrote the year into the title as "2027 Corn" is covered by the same word.
  // It stays unambiguous against `updatedAt` because "date saved" is sitting
  // right beside it, which is the contrast that does the work.
  const filter = `
    <div class="scn-filter">
      <input type="search" class="scn-filter-input" data-scn-filter
        value="${esc(filterQuery)}"
        placeholder="Filter name, enterprise, crop, year, or date saved"
        aria-label="Filter saved budgets" />
      <button type="button" class="tip" data-action="clear-scn-filter"
        ${filterQuery.trim() ? '' : 'hidden'}>Clear</button>
    </div>`

  return `
    <section class="box">
      <!-- saved-head exists only so the phone layout can reach this one header.
           block-head is shared with the enterprise cards, the fixed block, the
           results and the compare view, and none of those wants the centred
           two-row treatment. (No backticks in here: this is inside a template
           literal, and one would end it.) -->
      <header class="block-head saved-head">
        <h2 class="title">Saved budget scenarios / plans</h2>
        <!-- Sized to its own text rather than the full width .btn-add normally
             takes. Full width it read as the primary thing to do on a page whose
             actual subject is the list underneath it. -->
        <span class="head-btns">
          <button type="button" class="btn-add btn-add-inline" data-action="new-folder">
            + New folder
          </button>
          <button type="button" class="btn-add btn-add-inline" data-action="new-scenario">
            + New budget
          </button>
        </span>
      </header>

      ${
        all.length
          ? `${filter}
             <p class="hint" data-scn-hint><span data-scn-hint-text>${esc(
               scenarioHint(all.length, all.length, false)
             )}</span>${openFileClause}</p>
             <div class="scn-sections" data-scn-sections>
               ${renderSections(all, folders, currentId, expandedFolders)}
             </div>
             <p class="hint scn-empty" data-scn-empty hidden></p>
             ${baselineNote()}
             <div class="scn-actions">
               <button type="button" class="btn-main" data-action="compare-selected" disabled>
                 Compare selected
               </button>
             </div>
             <p class="hint scn-hidden-note" data-scn-hidden-note hidden></p>`
          : `<p class="hint">
               No saved budget scenarios yet. Build one, name it, and save it. Then duplicate it to
               compare different scenarios.
             </p>
             ${openFile}`
      }
    </section>`
}

/**
 * Partition every saved budget into sections, and render them.
 *
 * The ungrouped pile is built as "everything no section claimed", NOT as
 * "everything with no folderId". Those differ in exactly one case and it is the
 * one that matters: a budget carrying a folderId whose folder has been deleted —
 * here, or in another tab, or by a partial write. Defined this way it lands in
 * the ungrouped pile and is on screen. Defined the other way it would belong to
 * a section that is never rendered, and it would be gone.
 *
 * The pile goes at the TOP. A budget saved a moment ago lands there, and "I just
 * saved it and it has vanished" is the worst thing an organising feature can do.
 *
 * It is drawn whenever it has members, and also whenever ANY folder exists — so
 * once there is filing to undo, there is somewhere to undo it to. Left to hide
 * when empty it disappeared exactly when every budget had been filed, taking the
 * drop target for "drag one back out" with it and leaving a shortcut that works
 * until the moment you need it.
 *
 * **With no folders at all it gets no heading**, just the rows. "Not in a
 * folder" over the entire list, with nothing to contrast it against, is a fold
 * to open and a label answering a question nobody asked — and this is the state
 * most producers here will be in permanently. The section element and the list
 * stay, so every other piece of machinery sees the structure it always sees.
 *
 * `sortIndex` stays a single GLOBAL rank. Each section takes its members in that
 * order, so folder order decides which section comes first and a budget's global
 * rank decides where it sits inside its own. There is no second ordering
 * concept, and the whole page is still one valid top-to-bottom order — which is
 * what lets the drag code keep working (see commitOrder in main.js).
 */
function renderSections(all, folders, currentId, expandedFolders) {
  const claimed = new Set()
  const sections = []

  for (const folder of folders) {
    const members = all.filter((s) => s.folderId === folder.id)
    members.forEach((s) => claimed.add(s.id))
    sections.push({ folder, members })
  }

  const loose = all.filter((s) => !claimed.has(s.id))
  const rows = (members) =>
    members
      .map((s, i) => renderScenarioRow(s, currentId, i, members.length, folders.length > 0))
      .join('')

  // Folders are shut until opened — see expandedFolders in main.js. The
  // ungrouped pile is not a folder and starts open.
  const out =
    loose.length || folders.length
      ? [
          renderFolderSection(
            null,
            rows(loose),
            loose.length,
            expandedFolders.has(''),
            0,
            1,
            folders.length > 0
          ),
        ]
      : []

  sections.forEach(({ folder, members }, i) => {
    out.push(
      renderFolderSection(
        folder,
        rows(members),
        members.length,
        expandedFolders.has(folder.id),
        i,
        sections.length
      )
    )
  })
  return out.join('')
}

/**
 * @param {number} index  position WITHIN this section, and `total` its size.
 *   The arrows swap a budget with its neighbour in the same section, so they
 *   have to grey out at the section's ends. Given the whole list's index they
 *   would stay live on a row that is first in its folder, and pressing one would
 *   trade global ranks with a budget in a different section — which changes
 *   nothing anybody can see. That is the same "appears to do nothing" failure
 *   that turns reordering off while a filter is running.
 * @param {boolean} hasFolders  whether "Move" is offered on this row at all.
 *   Until the producer has made one folder there is nowhere to move anything,
 *   and a fourth button on every row that opens a modal offering only "Not in a
 *   folder" is a control that costs everybody and pays nobody. Most producers
 *   here keep three to eight budgets and will never make a folder; for them the
 *   Saved tab stays exactly the page it was. The first folder is made from
 *   "+ New folder" in the header, and from then on every filing is one trip.
 */
function renderScenarioRow(s, currentId, index, total, hasFolders) {
  const r = calcScenario(s)
  const when = new Date(s.updatedAt || s.createdAt)
  const isCurrent = s.id === currentId

  return `
    <div class="scn ${isCurrent ? 'current' : ''}" data-scn-id="${esc(s.id)}"
      data-scn-search="${esc(searchText(s))}">
      <div class="scn-order">
        <!-- Two ways to do one thing, deliberately. The arrows are the control
             that always works: from a keyboard, from a screen reader, and
             without a steady hand. The handle is the shortcut, and it is driven
             by native drag-and-drop on a mouse and by pointer events on touch
             (main.js), because HTML5 drag-and-drop does not exist on touch and
             these budgets are mostly reordered on a phone. -->
        <button type="button" class="scn-move" data-action="move-scenario-up"
          data-id="${esc(s.id)}" ${index === 0 ? 'disabled' : ''}
          aria-label="Move ${esc(s.name)} up">▲</button>
        <span class="scn-grip" draggable="true" title="Drag to reorder"
          aria-hidden="true">⠿</span>
        <button type="button" class="scn-move" data-action="move-scenario-down"
          data-id="${esc(s.id)}" ${index === total - 1 ? 'disabled' : ''}
          aria-label="Move ${esc(s.name)} down">▼</button>
      </div>
      <label class="scn-pick">
        <input type="checkbox" data-compare-id="${esc(s.id)}" aria-label="Select ${esc(s.name)} to compare" />
      </label>
      <div class="scn-main">
        <div class="scn-name-row">
          <!-- The pencil sits inside the name box, at its right edge, and only
               appears on hover or focus. It is a hint that the name is editable,
               not a control of its own — the input is what you click. -->
          <span class="name-edit">
            <input class="scn-name-input" value="${esc(s.name)}" data-scn-name="${esc(s.id)}"
              aria-label="Budget name" />
            <span class="edit-icon" aria-hidden="true">&#9998;</span>
          </span>
          ${isCurrent ? '<em class="scn-open-flag">open</em>' : ''}
        </div>
        <!-- A summary, not a control. Opening is one of three things you can do
             to a row, so it sits with the other two rather than being hidden
             behind the whole block of text being secretly tappable. -->
        <span class="scn-meta">
          ${
            // First, because it is the one thing here the producer stated rather
            // than the app worked out, and because a filter must never match
            // something that is not on the row. Not bold: the only bold thing on
            // this line is the profit figure, and a second one competes with it.
            s.scenarioYear ? `<span class="scn-year">${esc(s.scenarioYear)}</span> ·` : ''
          }
          ${r.enterprises.length} enterprise${r.enterprises.length === 1 ? '' : 's'} ·
          ${Math.round(r.totalAcres * 100) / 100} acres ·
          <b class="${signClass(r.totals.totalProfit)}">${usd(r.totals.totalProfit)}</b> profit
          ${isNaN(when) ? '' : `· saved ${when.toLocaleDateString()}`}
        </span>
      </div>
      <div class="scn-btns">
        <button type="button" class="tip" data-action="open-scenario" data-id="${esc(s.id)}">Open Budget</button>
        ${
          hasFolders
            ? `<button type="button" class="tip scn-move-btn" data-action="move-scenario" data-id="${esc(s.id)}">Move</button>`
            : ''
        }
        <button type="button" class="tip alt" data-action="duplicate-scenario" data-id="${esc(s.id)}">Duplicate</button>
        <button type="button" class="tip danger" data-action="delete-scenario" data-id="${esc(s.id)}">Delete</button>
      </div>
    </div>`
}

/**
 * What the filter box matches a row against, baked in at render time.
 *
 * A named list of fields, not the row's rendered text. The row also shows an
 * acreage and a profit figure, so filtering on what is on screen would have
 * "5" turn up every budget whose loss happens to contain a 5, and "acres"
 * turn up every budget there is. The enterprise names and crops are in here on
 * purpose: "which of these had soybeans in it" is the question, and the
 * budget's own name frequently cannot answer it.
 *
 * Read off the scenario rather than through enterpriseLabel(), because that
 * falls back to "Enterprise 1" for an unnamed column and a filter of
 * "enterprise" that matched every budget on the device would be worse than no
 * filter at all. A column nobody has named contributes nothing to find it by,
 * which is the honest answer.
 *
 * TWO different years are searchable and they are not interchangeable. The
 * PLANNING year is the crop year the budget is for, stated by the producer. The
 * SAVED date is when they were last at the keyboard, which for a 2027 plan
 * written in 2026 is a different number. Both are offered because both are
 * things somebody reaches for, and both are printed on the row so a filter can
 * never match something invisible.
 *
 * The saved date contributes its YEAR and its month name, and deliberately not
 * the "8/5/2026" the row prints. Feeding those digits in individually would have
 * a filter of "5" return every budget touched on the fifth of a month, which is
 * the same spurious-digit problem as matching on rendered text. "2026" and
 * "august" are how a producer says a date out loud; the slashed form is not.
 */
function searchText(s) {
  const when = new Date(s.updatedAt || s.createdAt)
  const saved = isNaN(when)
    ? []
    : [
        String(when.getFullYear()),
        when.toLocaleString(undefined, { month: 'long' }),
        when.toLocaleString(undefined, { month: 'short' }),
      ]

  return [
    ...(s.enterprises ?? []).flatMap((e) => [e?.name, e?.crop]),
    s.name,
    s.scenarioYear,
    ...saved,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/* ─────────────────────────── compare view ──────────────────────────────── */

// `money: false` marks the one row whose values are a plain count rather than
// dollars. Only money is right-aligned in the compare table — everything else
// reads better flush left, next to the label it belongs to.
//
// Exported because export.js builds the comparison CSV from this same list. A
// second list would be two things to keep in step, and the failure mode is a
// producer handing an instructor a file that quietly disagrees with the screen
// it was exported from. The CSV ignores `fmt` and writes the raw numbers.
export const COMPARE_ROWS = [
  {
    label: 'Total acres',
    get: (r) => r.totalAcres,
    fmt: (v) => String(Math.round(v * 100) / 100),
    money: false,
  },
  { label: 'Total revenue', get: (r) => r.totals.totalRevenue, fmt: usd },
  { label: 'Total variable expenses', get: (r) => r.totals.totalVariable, fmt: usd },
  { label: 'Total gross margin', get: (r) => r.totals.totalGrossMargin, fmt: usd, highlight: true },
  { label: 'Total fixed costs', get: (r) => r.totals.totalFixed, fmt: usd },
  { label: 'Total profit', get: (r) => r.totals.totalProfit, fmt: usd, highlight: true, tone: true },
  { label: 'Revenue / acre', get: (r) => r.totals.revenuePerAcre, fmt: usdCents },
  { label: 'Variable expenses / acre', get: (r) => r.totals.variablePerAcre, fmt: usdCents },
  { label: 'Gross margin / acre', get: (r) => r.totals.grossMarginPerAcre, fmt: usdCents },
  { label: 'Fixed costs / acre', get: (r) => r.fixed.totalFixedPerAcre, fmt: usdCents },
  { label: 'Profit / acre', get: (r) => r.totals.profitPerAcre, fmt: usdCents, highlight: true, tone: true },
]

export function renderCompare(scenarios) {
  const results = scenarios.map((s) => ({ scenario: s, r: calcScenario(s) }))
  const base = results[0]

  return `
    <section class="box compare">
      <header class="block-head">
        <h2 class="title">Comparing ${results.length} budgets</h2>
        <!-- A comparison is the thing worth handing to somebody: it is the
             answer to the question the class was asked. Getting it out was
             possible only by exporting each budget separately and rebuilding
             the table by hand. -->
        <button type="button" class="tip" data-action="export-compare-csv">Export CSV</button>
        <button type="button" class="tip" data-action="print">Print</button>
        <button type="button" class="tip" data-action="back-to-scenarios">Back to saved budgets</button>
      </header>

      <p class="hint">
        Differences are measured against <b>${esc(base.scenario.name)}</b>, the first budget selected.
      </p>

      <div class="tbl-scroll">
        <table class="tbl compare-tbl">
          <thead>
            <tr>
              <th>Figure</th>
              ${results
                .map(
                  (x, i) =>
                    `<th>${esc(x.scenario.name)}${i === 0 ? '<br><small>baseline</small>' : ''}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${COMPARE_ROWS.map((row) => renderCompareRow(row, results)).join('')}
          </tbody>
        </table>
      </div>

      <h3 class="sub-title">Enterprises in each budget</h3>
      <div class="tbl-scroll">
        <table class="tbl compare-tbl">
          <thead>
            <tr><th>Budget</th><th>Enterprise</th><th>Crop</th><th>Acres</th><th>Gross margin / acre</th></tr>
          </thead>
          <tbody>
            ${results
              .flatMap((x) =>
                x.r.enterprises.map(
                  (e) => `
                <tr>
                  <td>${esc(x.scenario.name)}</td>
                  <td>${esc(e.label)}</td>
                  <td>${esc(e.crop || '—')}</td>
                  <td>${e.acres}</td>
                  <td class="num ${signClass(e.grossMarginPerAcre)}">${usdCents(e.grossMarginPerAcre)}</td>
                </tr>`
                )
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`
}

function renderCompareRow(row, results) {
  const baseValue = row.get(results[0].r)
  const isMoney = row.money !== false

  const cells = results
    .map((x, i) => {
      const value = row.get(x.r)
      const tone = row.tone ? signClass(value) : ''
      const delta =
        i === 0
          ? ''
          : `<small class="delta ${signClass(value - baseValue)}">${
              value - baseValue >= 0 ? '+' : '−'
            }${row.fmt(Math.abs(value - baseValue))}</small>`
      return `<td class="${isMoney ? 'num' : ''} ${tone}">${esc(row.fmt(value))}${delta}</td>`
    })
    .join('')

  return `<tr class="${row.highlight ? 'total' : ''}"><td>${esc(row.label)}</td>${cells}</tr>`
}
