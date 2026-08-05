/**
 * Enterprise cards — the sheet's four columns, unlimited.
 *
 * The SAME markup renders at every width. Desktop lays the cards out as
 * parallel columns (mirroring the spreadsheet); mobile stacks them as
 * accordions. That is a CSS grid change only — see styles.css. Never fork this
 * into separate mobile and desktop components.
 */

import { esc } from './format.js'
import { field, moneyField, readout, sectionInfo, unitNotice } from './fields.js'
import { VARIABLE_LINES, enterpriseLabel } from '../calc.js'

/**
 * Exported so the typical-value tests can check that a spec declaring which
 * yield unit its figures are quoted against (`quotedPerYieldUnit`) names one the
 * producer can actually pick. A spec pointing at a unit not on this list would
 * never match, and its figure would be cleared the moment the unit was touched.
 */
export const YIELD_UNITS = ['bu', 'ton', 'cwt', 'lb', 'bale', 'AUM']

/**
 * @param {object} scenario
 * @param {Set<string>} collapsed  ids of the cards currently folded shut
 * @param {Map<number,{text:string,paths:string[]}>} [notices]  one-shot messages
 *   by enterprise index, saying why a figure was just cleared, with the fields
 *   they are about. Owned by main.js and dropped after the render that shows it.
 */
export function renderEnterprises(scenario, collapsed = new Set(), notices = new Map()) {
  return `
    <div class="ent-scroller">
      <div class="ent-grid">
        ${scenario.enterprises
          .map((e, i) => renderEnterprise(e, i, collapsed, notices.get(i)))
          .join('')}
        <div class="ent-add">
          <button type="button" class="btn-add" data-action="add-enterprise">
            + Add enterprise
          </button>
          <p class="hint">One crop or activity to budget on its own (corn, silage, soybeans, grazing, etc.)</p>
        </div>
      </div>
    </div>`
}

function renderEnterprise(e, i, collapsed, notice) {
  const p = `enterprises.${i}`
  const heading = enterpriseLabel(e, i)
  const isShut = collapsed.has(e.id)

  return `
    <section class="box ent ${isShut ? 'collapsed' : ''}" data-ent-index="${i}"
      data-ent-id="${esc(e.id ?? '')}">
      <header class="ent-head">
        <button type="button" class="ent-toggle" data-action="toggle-enterprise"
          aria-expanded="${!isShut}"
          aria-label="${isShut ? 'Expand' : 'Collapse'} ${esc(heading)}">
          <span class="chev" aria-hidden="true"></span>
          <span class="ent-name">${esc(heading)}</span>
          <span class="ent-sub" data-out="${p}.acres" data-fmt="acres">—</span>
        </button>
        <button type="button" class="btn-remove" data-action="remove-enterprise"
          data-index="${i}" aria-label="Remove ${esc(heading)}">Remove</button>
      </header>

      <div class="ent-body">
        ${field({
          label: 'Enterprise name',
          path: `${p}.name`,
          value: e.name,
          placeholder: heading,
          info: 'enterpriseName',
        })}
        <div class="row-2">
          ${field({ label: 'Crop', path: `${p}.crop`, value: e.crop, placeholder: 'Corn' })}
          ${moneyField({ label: 'Acres', path: `${p}.acres`, value: e.acres, placeholder: '0' })}
        </div>

        <h3 class="sub-title">Income ${sectionInfo(['grossRevenue', 'enterpriseBudget'], 'Income')}</h3>
        <div class="row-2">
          ${moneyField({ label: 'Yield / acre', path: `${p}.yieldPerAcre`, value: e.yieldPerAcre, placeholder: '0' })}
          ${unitSelect(`${p}.yieldUnit`, e.yieldUnit)}
        </div>
        ${unitNotice(notice)}
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
        ${readout('Enterprise gross margin', `${p}.enterpriseGrossMargin`, {
          fmt: 'usd',
          info: 'enterpriseGrossMargin',
        })}
      </div>
    </section>`
}

/**
 * The unit picker beside Yield / acre.
 *
 * It wraps its label in `.field-label` like every other field, rather than
 * emitting a bare <label>. That row carries a min-height and a bottom margin, so
 * without it this select's caption occupied less vertical space than the one
 * next to it and the two boxes started at different heights.
 */
function unitSelect(path, value) {
  const id = `f-${path.replace(/\./g, '-')}`
  return `
    <div class="field">
      <div class="field-label"><label for="${id}">Unit</label></div>
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

  // The typical-value link sits beside the label rather than under the inputs.
  // Below, it read as a caption belonging to the row above it and pushed every
  // line taller; beside the label it reads as an offer about THIS line, and the
  // fifteen lines of a variable-expense list stay compact enough to scan.
  return `
    <div class="line" data-line="${esc(def.key)}">
      <div class="line-head">
        <span class="line-label">${esc(def.label)}</span>
        ${
          typicalAvailable(typical)
            ? `<button type="button" class="tip line-tip" data-typical="${esc(typical)}"
                 data-target="${esc(p)}.${perAcreMode ? 'perAcre' : 'costPerUnit'}"
                 data-mode-path="${esc(p)}.mode" data-line-mode="${perAcreMode ? 'perAcre' : 'unit'}"
                 data-target-per-acre="${esc(p)}.perAcre" data-target-unit="${esc(p)}.costPerUnit"
               >use typical value</button>`
            : ''
        }
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
          ? `<p class="hint">Calculated from the preharvest costs above. Hauling, drying, and marketing are excluded.</p>`
          : ''
      }
    </div>`
}
