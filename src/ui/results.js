/**
 * Results — the whole-farm summary, the per-enterprise breakdown, and the
 * notes explaining where this calculator deliberately differs from the
 * spreadsheet.
 *
 * Those notes are not optional garnish. Producers and instructors will hold
 * this next to the .xlsx and see different numbers; if the app doesn't say why,
 * it looks broken. Every divergence gets a `?`.
 */

import { esc } from './format.js'
import { openGuide } from './modals.js'
import { infoButton } from './fields.js'

/**
 * Every figure below is emitted as a `data-out` placeholder, NOT as a literal.
 *
 * This whole section used to interpolate its numbers directly from the result
 * object. That made it a snapshot of the last STRUCTURAL render: typing a price
 * ran updateOutputs(), which only refreshes [data-out] elements, so the sticky
 * bar (which had them) moved while the KPI cards and every table below them
 * stayed frozen at whatever the farm looked like when an enterprise was last
 * added. The two disagreed on screen — the sticky bar was right.
 *
 * The rule for this file: if a number can change without the DOM changing
 * shape, it must be a data-out, never a template literal.
 */
export function renderResults(r) {
  return `
    <section class="box results">
      <header class="block-head">
        <h2 class="title">Results</h2>
        <button type="button" class="help-btn" data-action="show-differences"
          aria-label="How this differs from the spreadsheet"
          title="How this differs from the spreadsheet">?</button>
      </header>

      <div data-warnings>${r.warnings.length ? renderWarnings(r.warnings) : ''}</div>

      <div class="kpi-row">
        ${kpi('Total profit', 'totals.totalProfit', 'usd', 'totalProfit')}
        ${kpi('Profit / acre', 'totals.profitPerAcre', 'usdCents', 'profitPerAcre')}
        ${kpi('Total gross margin', 'totals.totalGrossMargin', 'usd', 'totalGrossMargin')}
        ${kpi('Total acres', 'totalAcres', 'plain')}
      </div>

      <div class="results-grid">
        <div>
          <h3 class="sub-title">Whole farm</h3>
          <table class="tbl">
            <tbody>
              ${row('Total revenue', 'totals.totalRevenue', 'usd')}
              ${row('Total variable expenses', 'totals.totalVariable', 'usd', 'minus')}
              ${row('Total gross margin', 'totals.totalGrossMargin', 'usd', 'subtotal')}
              ${row('Total fixed costs', 'totals.totalFixed', 'usd', 'minus')}
              ${row('Total profit', 'totals.totalProfit', 'usd', 'total', true)}
            </tbody>
          </table>

          <h3 class="sub-title">
            Per acre <span class="sub-note">weighted across
              <span data-out="totalAcres" data-fmt="plain">—</span> acres</span>
          </h3>
          <table class="tbl">
            <tbody>
              ${row('Revenue / acre', 'totals.revenuePerAcre', 'usdCents')}
              ${row('Variable expenses / acre', 'totals.variablePerAcre', 'usdCents', 'minus')}
              ${row('Gross margin / acre', 'totals.grossMarginPerAcre', 'usdCents', 'subtotal')}
              ${row('Fixed costs / acre', 'fixed.totalFixedPerAcre', 'usdCents', 'minus')}
              ${row('Profit / acre', 'totals.profitPerAcre', 'usdCents', 'total', true)}
            </tbody>
          </table>
        </div>

        <div>
          <h3 class="sub-title">By enterprise</h3>
          ${
            r.enterprises.length
              ? `<div class="tbl-scroll"><table class="tbl">
                  <thead>
                    <tr>
                      <th>Enterprise</th><th>Acres</th>
                      <th>Gross margin / acre</th><th>Gross margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${r.enterprises
                      .map(
                        (e, i) => `
                      <tr>
                        <td data-ent-label="${i}">${esc(e.label)}</td>
                        <td data-out="enterprises.${i}.acres" data-fmt="plain">—</td>
                        <td data-out="enterprises.${i}.grossMarginPerAcre"
                            data-fmt="usdCents" data-tone="1">—</td>
                        <td data-out="enterprises.${i}.enterpriseGrossMargin"
                            data-fmt="usd" data-tone="1">—</td>
                      </tr>`
                      )
                      .join('')}
                  </tbody>
                </table></div>`
              : '<p class="hint">No enterprises yet.</p>'
          }

          <h3 class="sub-title">Fixed cost breakdown</h3>
          <div class="tbl-scroll"><table class="tbl">
            <thead><tr><th>Item</th><th>Per acre</th><th>Per year</th></tr></thead>
            <tbody>
              ${fixedRow('Land rent', 'landRentPerAcre', 'landRentTotal')}
              ${fixedRow('Labor', 'laborPerAcre', 'laborTotal')}
              ${fixedRow('Equipment depreciation', 'equipDepPerAcre', 'equipDepTotal')}
              ${fixedRow('Equipment interest', 'equipIntPerAcre', 'equipIntTotal')}
              ${fixedRow('Building depreciation', 'bldgDepPerAcre', 'bldgDepTotal')}
              ${fixedRow('Building interest', 'bldgIntPerAcre', 'bldgIntTotal')}
              ${fixedRow('Annual overhead', 'annualPerAcre', 'annualTotal')}
              <tr class="total">
                <td>Total fixed costs</td>
                <td data-out="fixed.totalFixedPerAcre" data-fmt="usdCents">—</td>
                <td data-out="fixed.totalFixedAnnual" data-fmt="usd">—</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>

      <p class="differs-note">
        Some figures here are calculated differently from the original spreadsheet.
        <button type="button" class="tip" data-action="show-differences">See what changed and why</button>
      </p>
    </section>`
}

function kpi(label, path, fmt, info) {
  return `
    <div class="kpi">
      <div class="kpi-label">${esc(label)}${info ? infoButton(info, label) : ''}</div>
      <div class="kpi-value" data-out="${esc(path)}" data-fmt="${esc(fmt)}"
        ${info ? 'data-tone="1"' : ''}>—</div>
    </div>`
}

function row(label, path, fmt, cls = '', tone = false) {
  return `<tr class="${cls}"><td>${esc(label)}</td><td data-out="${esc(path)}"
    data-fmt="${esc(fmt)}"${tone ? ' data-tone="1"' : ''}>—</td></tr>`
}

function fixedRow(label, perAcreKey, perYearKey) {
  return `<tr><td>${esc(label)}</td>
    <td data-out="fixed.${perAcreKey}" data-fmt="usdCents">—</td>
    <td data-out="fixed.${perYearKey}" data-fmt="usd">—</td></tr>`
}

/**
 * Warnings appear and disappear as acres are typed, so they cannot be baked in
 * at render time either. updateOutputs() rewrites this container in place.
 */
export function renderWarningsInto(container, warnings) {
  container.innerHTML = warnings.length ? renderWarnings(warnings) : ''
}

function renderWarnings(warnings) {
  return `
    <div class="warnings">
      ${warnings.map((w) => `<p>${esc(w)}</p>`).join('')}
    </div>`
}

/**
 * The divergence guide. Kept here next to the results it explains, so the two
 * cannot drift apart.
 */
export function showDifferences() {
  openGuide(
    'How this differs from the spreadsheet',
    [
    {
      heading: 'Why there are differences at all',
      body: [
        'This calculator follows the SimpleFarmPlanBudget spreadsheet formula for formula, with a small number of deliberate corrections. If you compare the two side by side, these are the places the numbers will not match — and in each case the spreadsheet is the one that is wrong.',
      ],
    },
    {
      heading: '1. Equipment interest is included in total profit',
      body: [
        'The spreadsheet leaves equipment interest out of its Total Profit, even though its own Total Fixed Costs line includes it. The two totals in the sheet therefore disagree with each other.',
        'Equipment interest is a real cost, so it is counted here — in both figures. On a farm with a few hundred thousand dollars of machinery this can easily be the difference between showing a profit and showing a loss.',
      ],
    },
    {
      heading: '2. Per-acre figures are weighted by acres',
      body: [
        'For the whole farm, the spreadsheet adds together the per-acre figures of each enterprise. That only works if every enterprise has exactly the same acreage.',
        'If corn is on 500 acres and soybeans on 300, adding "$533 per acre" and "$288 per acre" produces a number that does not describe any acre on the farm.',
        'This calculator divides whole-farm dollars by whole-farm acres instead, so Profit per acre × total acres always equals Total profit. Each enterprise still shows its own gross margin per acre exactly as the spreadsheet calculates it.',
      ],
    },
    {
      heading: '3. Interest on preharvest costs is calculated',
      body: [
        'The spreadsheet labels this line "8 months at 10%" but still expects you to type the answer in yourself, so it is often left blank.',
        'Here it is worked out from the preharvest costs above it. You can change the rate and the number of months, or switch the line back to entering the figure yourself.',
      ],
    },
    {
      heading: '4. Blank rows stay blank',
      body: [
        'In the spreadsheet, leaving an equipment or building row empty makes it divide by zero, and that error spreads into every total — no profit figure can be produced at all unless all six equipment rows and all six building rows are filled in.',
        'Here you add only the items you actually have, and empty means zero.',
      ],
    },
    {
      heading: '5. A whole-farm gross margin was added',
      body: [
        'The spreadsheet has a "Total Gross Margin" label but no cell that actually adds the enterprises together. That total is calculated here.',
      ],
    },
    {
      heading: 'What was deliberately left alone',
      body: [
        'Interest on equipment is charged on its average value — (purchase price + salvage) ÷ 2 — while buildings are charged on half their purchase price. The spreadsheet treats the two differently and so does this calculator, because both approaches are defensible and changing it would move your numbers for no clear gain.',
        'Land rent is still a single rate applied across all your acres.',
      ],
    },
    ],
    { collapsible: true, firstOpen: true }
  )
}
