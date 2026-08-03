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

export function renderScenarioList(currentId) {
  const all = listScenarios()

  return `
    <section class="box">
      <header class="block-head">
        <h2 class="title">Saved budgets</h2>
        <button type="button" class="btn-add" data-action="new-scenario">+ New budget</button>
      </header>

      ${
        all.length
          ? `<p class="hint">
               Saved on this device only. Pick two or more to compare them side by side.
             </p>
             <div class="scn-list">
               ${all.map((s) => renderScenarioRow(s, currentId)).join('')}
             </div>
             <div class="scn-actions">
               <button type="button" class="btn-main" data-action="compare-selected" disabled>
                 Compare selected
               </button>
               <button type="button" class="tip" data-action="import-scenario">Open a budget file</button>
             </div>`
          : `<p class="hint">
               No saved budgets yet. Build one, give it a name, and save it — then duplicate it
               to compare a different set of assumptions.
             </p>
             <button type="button" class="tip" data-action="import-scenario">Open a budget file</button>`
      }
    </section>`
}

function renderScenarioRow(s, currentId) {
  const r = calcScenario(s)
  const when = new Date(s.updatedAt || s.createdAt)
  const isCurrent = s.id === currentId

  return `
    <div class="scn ${isCurrent ? 'current' : ''}">
      <label class="scn-pick">
        <input type="checkbox" data-compare-id="${esc(s.id)}" aria-label="Select ${esc(s.name)} to compare" />
      </label>
      <button type="button" class="scn-open" data-action="open-scenario" data-id="${esc(s.id)}">
        <span class="scn-name">${esc(s.name)}${isCurrent ? ' <em>(open)</em>' : ''}</span>
        <span class="scn-meta">
          ${r.enterprises.length} enterprise${r.enterprises.length === 1 ? '' : 's'} ·
          ${Math.round(r.totalAcres * 100) / 100} acres ·
          <b class="${signClass(r.totals.totalProfit)}">${usd(r.totals.totalProfit)}</b> profit
        </span>
        <span class="scn-date">${isNaN(when) ? '' : when.toLocaleDateString()}</span>
      </button>
      <div class="scn-btns">
        <button type="button" class="tip" data-action="duplicate-scenario" data-id="${esc(s.id)}">Duplicate</button>
        <button type="button" class="tip danger" data-action="delete-scenario" data-id="${esc(s.id)}">Delete</button>
      </div>
    </div>`
}

/* ─────────────────────────── compare view ──────────────────────────────── */

const COMPARE_ROWS = [
  { label: 'Total acres', get: (r) => r.totalAcres, fmt: (v) => String(Math.round(v * 100) / 100) },
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
        <table class="tbl">
          <thead>
            <tr><th>Budget</th><th>Enterprise</th><th>Acres</th><th>Gross margin / acre</th></tr>
          </thead>
          <tbody>
            ${results
              .flatMap((x) =>
                x.r.enterprises.map(
                  (e) => `
                <tr>
                  <td>${esc(x.scenario.name)}</td>
                  <td>${esc(e.crop || 'Unnamed')}</td>
                  <td>${e.acres}</td>
                  <td class="${signClass(e.grossMarginPerAcre)}">${usdCents(e.grossMarginPerAcre)}</td>
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
      return `<td class="${tone}">${esc(row.fmt(value))}${delta}</td>`
    })
    .join('')

  return `<tr class="${row.highlight ? 'total' : ''}"><td>${esc(row.label)}</td>${cells}</tr>`
}
