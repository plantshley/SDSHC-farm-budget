/**
 * Enterprise cards — the sheet's four columns, unlimited.
 *
 * The SAME markup renders at every width. Desktop lays the cards out as
 * parallel columns (mirroring the spreadsheet); mobile stacks them as
 * accordions. That is a CSS grid change only — see styles.css. Never fork this
 * into separate mobile and desktop components.
 */

import { esc } from './format.js'
import { field, moneyField, readout, sectionInfo } from './fields.js'
import { VARIABLE_LINES } from '../calc.js'

const YIELD_UNITS = ['bu', 'ton', 'cwt', 'lb', 'bale', 'AUM']

export function renderEnterprises(scenario) {
  return `
    <div class="ent-scroller">
      <div class="ent-grid">
        ${scenario.enterprises.map((e, i) => renderEnterprise(e, i)).join('')}
        <div class="ent-add">
          <button type="button" class="btn-add" data-action="add-enterprise">
            + Add enterprise
          </button>
          <p class="hint">A separate crop or activity to budget — corn, silage, soybeans, grazing.</p>
        </div>
      </div>
    </div>`
}

function renderEnterprise(e, i) {
  const p = `enterprises.${i}`
  const heading = e.crop?.trim() || `Enterprise ${i + 1}`

  return `
    <section class="box ent" data-ent-index="${i}">
      <header class="ent-head">
        <button type="button" class="ent-toggle" data-action="toggle-enterprise"
          aria-expanded="true">
          <span class="ent-name">${esc(heading)}</span>
          <span class="ent-sub" data-out="${p}.acres" data-fmt="acres">—</span>
          <span class="chev" aria-hidden="true"></span>
        </button>
        ${
          i > 0 || true
            ? `<button type="button" class="btn-remove" data-action="remove-enterprise"
                 data-index="${i}" aria-label="Remove ${esc(heading)}">Remove</button>`
            : ''
        }
      </header>

      <div class="ent-body">
        <div class="row-2">
          ${field({ label: 'Crop', path: `${p}.crop`, value: e.crop, placeholder: 'Corn' })}
          ${moneyField({ label: 'Acres', path: `${p}.acres`, value: e.acres, placeholder: '0' })}
        </div>

        <h3 class="sub-title">Income ${sectionInfo(['grossRevenue', 'enterpriseBudget'], 'Income')}</h3>
        <div class="row-2">
          ${moneyField({ label: 'Yield / acre', path: `${p}.yieldPerAcre`, value: e.yieldPerAcre, placeholder: '0' })}
          ${unitSelect(`${p}.yieldUnit`, e.yieldUnit)}
        </div>
        ${moneyField({ label: 'Price / unit', path: `${p}.pricePerUnit`, value: e.pricePerUnit, prefix: '$', placeholder: '0.00' })}
        ${moneyField({
          label: 'Miscellaneous income / acre',
          path: `${p}.miscIncomePerAcre`,
          value: e.miscIncomePerAcre,
          prefix: '$',
          placeholder: '0.00',
        })}
        ${readout('Gross revenue / acre', `${p}.grossRevPerAcre`, { info: 'grossRevenue' })}

        <h3 class="sub-title">
          Variable expenses
          ${sectionInfo(['totalVariableExpenses', 'grossMargin'], 'Variable expenses')}
        </h3>
        <p class="hint">Enter a cost per unit and units per acre, or switch a line to a straight cost per acre.</p>
        ${VARIABLE_LINES.map((def) => renderLine(def, e, p)).join('')}
        ${renderPreharvest(e, p)}

        ${readout('Total variable expenses / acre', `${p}.totalVarPerAcre`)}
        ${readout('Gross margin / acre', `${p}.grossMarginPerAcre`, {
          strong: true,
          info: 'grossMargin',
        })}
        ${readout('Enterprise gross margin', `${p}.enterpriseGrossMargin`, { fmt: 'usd' })}
      </div>
    </section>`
}

function unitSelect(path, value) {
  const id = `f-${path.replace(/\./g, '-')}`
  return `
    <div class="field">
      <label for="${id}">Unit</label>
      <div class="input-wrap">
        <select id="${id}" data-path="${esc(path)}">
          ${YIELD_UNITS.map(
            (u) => `<option value="${u}"${u === value ? ' selected' : ''}>${u}</option>`
          ).join('')}
        </select>
      </div>
    </div>`
}

/**
 * One variable expense line, in whichever entry mode it is currently set to.
 *
 * The sheet only offers $/unit × units/acre, which forces naturally-per-acre
 * costs to be entered as "cost × 1". Both modes are available here and the
 * values for each are kept, so toggling back and forth loses nothing.
 */
function renderLine(def, e, entPath) {
  const line = e.variable?.[def.key] ?? {}
  const p = `${entPath}.variable.${def.key}`
  const perAcreMode = line.mode === 'perAcre'
  const typical = def.key

  return `
    <div class="line" data-line="${esc(def.key)}">
      <div class="line-head">
        <span class="line-label">${esc(def.label)}</span>
        <button type="button" class="mode-toggle" data-action="toggle-line-mode"
          data-path="${esc(p)}.mode" data-mode="${perAcreMode ? 'perAcre' : 'unit'}"
          title="Switch entry mode">${perAcreMode ? '$/acre' : '$/unit × units'}</button>
      </div>
      <div class="line-inputs">
        ${
          perAcreMode
            ? `<input type="number" step="any" inputmode="decimal" class="line-input"
                 data-path="${esc(p)}.perAcre" value="${esc(line.perAcre ?? '')}"
                 placeholder="0.00" aria-label="${esc(def.label)} dollars per acre" />`
            : `<input type="number" step="any" inputmode="decimal" class="line-input"
                 data-path="${esc(p)}.costPerUnit" value="${esc(line.costPerUnit ?? '')}"
                 placeholder="$/unit" aria-label="${esc(def.label)} cost per unit" />
               <span class="times">×</span>
               <input type="number" step="any" inputmode="decimal" class="line-input"
                 data-path="${esc(p)}.unitsPerAcre" value="${esc(line.unitsPerAcre ?? '')}"
                 placeholder="${esc(def.unitHint)}/acre" aria-label="${esc(def.label)} units per acre" />`
        }
        <span class="line-total" data-out="${entPath}.lines.${def.key}" data-fmt="usdCents">—</span>
      </div>
      ${
        typicalAvailable(typical)
          ? `<button type="button" class="tip" data-typical="${esc(typical)}"
               data-target="${esc(p)}.${perAcreMode ? 'perAcre' : 'costPerUnit'}"
             >use typical value</button>`
          : ''
      }
    </div>`
}

// Only lines with a real, cited source get the link. See data/typical-values.js.
const LINES_WITH_TYPICAL = new Set([
  'customHire',
  'herbicide',
  'nitrogen',
  'hauling',
  'drying',
  'miscellaneous',
])

function typicalAvailable(key) {
  return LINES_WITH_TYPICAL.has(key)
}

function renderPreharvest(e, entPath) {
  const pre = e.preharvest ?? {}
  const auto = pre.auto !== false
  const p = `${entPath}.preharvest`

  return `
    <div class="line preharvest">
      <div class="line-head">
        <span class="line-label">
          Interest on preharvest costs
          <button type="button" class="help-btn" data-info="preharvestInterest"
            aria-label="What is interest on preharvest costs?" title="What is this?">?</button>
        </span>
        <button type="button" class="mode-toggle" data-action="toggle-preharvest"
          data-path="${esc(p)}.auto" data-mode="${auto ? 'auto' : 'manual'}"
          title="Switch entry mode">${auto ? 'calculated' : 'entered by me'}</button>
      </div>
      <div class="line-inputs">
        ${
          auto
            ? `<input type="number" step="any" inputmode="decimal" class="line-input narrow"
                 data-path="${esc(p)}.rate" value="${esc(pre.rate ?? '')}"
                 placeholder="10" aria-label="Interest rate percent" />
               <span class="times">% for</span>
               <input type="number" step="any" inputmode="decimal" class="line-input narrow"
                 data-path="${esc(p)}.months" value="${esc(pre.months ?? '')}"
                 placeholder="8" aria-label="Months carried" />
               <span class="times">mo</span>`
            : `<input type="number" step="any" inputmode="decimal" class="line-input"
                 data-path="${esc(p)}.manualPerAcre" value="${esc(pre.manualPerAcre ?? '')}"
                 placeholder="0.00" aria-label="Preharvest interest dollars per acre" />`
        }
        <span class="line-total" data-out="${entPath}.preharvestInterestPerAcre" data-fmt="usdCents">—</span>
      </div>
      ${
        auto
          ? `<p class="hint">Worked out from the preharvest costs above. Hauling, drying and marketing are not included.</p>`
          : ''
      }
    </div>`
}
