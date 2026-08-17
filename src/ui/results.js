/**
 * Results — the whole-farm summary and the per-enterprise breakdown.
 *
 * This screen used to carry a "How this differs from the spreadsheet" guide and
 * a note at the foot of the card pointing at it. Both are gone: the corrections
 * were signed off, and the app is no longer presented as a version of a
 * spreadsheet a producer here may never have opened.
 *
 * The corrections themselves have not changed and are not in question. They are
 * documented in DESIGN-NOTES.md under "deliberate divergences" and asserted in
 * test/calc.test.js, which is where they belong now — a note to whoever works on
 * the model next, not a caveat on a producer's results.
 */

import { esc } from './format.js'
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
      <!-- ONE warning is printed here, and it is the only one that belongs to
           the whole farm rather than to a box: "Enter acres for at least one
           enterprise." With no acres entered it is the reason every figure on
           this card is blank, so it belongs beside them. Everything else names
           a field and rides with the card that field is on — see
           renderEnterprises() and renderFixed().

           In the header row rather than a banner above the card: a full-width
           red box over four blank KPI figures reads as something having gone
           wrong rather than as the next thing to type. It stays a
           [data-warnings] placeholder, because it appears and disappears as
           acres are typed and updateOutputs() is all that runs on a keystroke.
           data-warnings-for says whose list to draw. -->
      <!-- Save results as image sits at the right-hand end of this row and
           needs no auto margin to get there: .block-head .title is flex: 1 and
           eats the free space, the same way the Saved tab's header tools do.

           It wears .btn-remove's quiet box because it is the same kind of
           thing, a small action hanging off a card's heading rather than one
           of the screen's main moves, and .btn-quiet changes the hover and
           nothing else. Red on hover would be wrong here: --cost means a loss
           on every other row of this page, and this button saves a picture.

           It acts on the WORKING budget, like the footer's three and unlike
           the Saved tab's save-as-png, which reads a stored record. This
           button sits on the results it is a picture of, so there is no id to
           carry and nothing to look up. -->
      <header class="block-head">
        <h2 class="title">Results</h2>
        <div data-warnings data-warnings-for="farm"></div>
        <button type="button" class="btn-remove btn-quiet" data-action="export-png">
          Save results as image
        </button>
      </header>

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
