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
import { listScenarios } from '../storage.js'
import { infoButton } from './fields.js'

export function renderScenarioList(currentId) {
  const all = listScenarios()

  const openFile = `
    <span class="open-file">
      <button type="button" class="tip" data-action="import-scenario">Upload a budget file</button>
      ${infoButton('budgetFile', 'a budget file')}
    </span>`

  return `
    <section class="box">
      <header class="block-head">
        <h2 class="title">Saved scenarios</h2>
        <!-- Sized to its own text rather than the full width .btn-add normally
             takes. Full width it read as the primary thing to do on a page whose
             actual subject is the list underneath it. -->
        <button type="button" class="btn-add btn-add-inline" data-action="new-scenario">
          + New budget
        </button>
      </header>

      ${
        all.length
          ? `<p class="hint">
               Saved on this device only. Tap a name to rename it.
               Reorder the list with the ▲▼ arrows, or by dragging the handle.
             </p>
             <div class="scn-list" data-scn-list>
               ${all.map((s, i) => renderScenarioRow(s, currentId, i, all.length)).join('')}
             </div>
             <p class="hint baseline-note">
               Select two or more to compare them. <b>The first one you select becomes the
               baseline.</b> Every other budget is shown as a difference from it.
             </p>
             <div class="scn-actions">
               <button type="button" class="btn-main" data-action="compare-selected" disabled>
                 Compare selected
               </button>
               ${openFile}
             </div>`
          : `<p class="hint">
               No saved budget scenarios yet. Build one, name it, and save it. Then duplicate it to
               compare different scenarios.
             </p>
             ${openFile}`
      }
    </section>`
}

function renderScenarioRow(s, currentId, index, total) {
  const r = calcScenario(s)
  const when = new Date(s.updatedAt || s.createdAt)
  const isCurrent = s.id === currentId

  return `
    <div class="scn ${isCurrent ? 'current' : ''}" data-scn-id="${esc(s.id)}">
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
          ${r.enterprises.length} enterprise${r.enterprises.length === 1 ? '' : 's'} ·
          ${Math.round(r.totalAcres * 100) / 100} acres ·
          <b class="${signClass(r.totals.totalProfit)}">${usd(r.totals.totalProfit)}</b> profit
          ${isNaN(when) ? '' : `· ${when.toLocaleDateString()}`}
        </span>
      </div>
      <div class="scn-btns">
        <button type="button" class="tip" data-action="open-scenario" data-id="${esc(s.id)}">Open Budget</button>
        <button type="button" class="tip alt" data-action="duplicate-scenario" data-id="${esc(s.id)}">Duplicate</button>
        <button type="button" class="tip danger" data-action="delete-scenario" data-id="${esc(s.id)}">Delete</button>
      </div>
    </div>`
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
