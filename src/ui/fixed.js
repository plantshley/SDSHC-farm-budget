/**
 * Shared fixed costs — the sheet's rows 31–74.
 *
 * Fixed costs belong to the whole farm, so this block spans the full width
 * beneath the enterprise columns rather than sitting inside any one of them.
 *
 * Equipment and buildings are each entered ONCE. The sheet has two separate
 * tables (depreciation rows 38–43, interest rows 46–51) that require the same
 * initial cost and salvage value to be typed twice per machine; the formulas
 * here are unchanged, only the duplicate data entry is gone.
 *
 * NOTHING AUTO-FILLS. Every field starts blank. Typing a name matches a
 * category, which only filters what the useful-life picker offers — it never
 * writes a value.
 */

import { esc } from './format.js'
import { field, moneyField, readout, sectionInfo, infoButton, periodField } from './fields.js'
import { EQUIPMENT_CATALOG, BUILDING_CATALOG } from '../data/typical-values.js'
import { HOURS_BASIS, COST_BASIS } from '../calc.js'

export function renderFixed(scenario, collapsed = false) {
  const f = scenario.fixed ?? {}

  return `
    <section class="box fixed-block ${collapsed ? 'collapsed' : ''}">
      <header class="block-head">
        <!-- The button lives INSIDE the heading, not the other way round: a
             <button> may only contain phrasing content, so an <h2> nested in one
             is invalid and screen readers lose the heading. -->
        <h2 class="title">
          <button type="button" class="fold-toggle" data-action="toggle-fixed"
            aria-expanded="${!collapsed}">
            <span class="chev" aria-hidden="true"></span>
            Shared fixed costs
          </button>
        </h2>
        <span class="fold-sub" data-out="fixed.totalFixedAnnual" data-fmt="usd">—</span>
        ${sectionInfo(
          ['fixedCosts', 'landRent', 'laborCost', 'equipmentVsBuilding', 'depreciationVsInterest', 'salvageValue', 'usefulLife'],
          'Fixed costs'
        )}
      </header>

      <div class="fixed-body">
      <p class="hint">
        Costs you pay whether or not you plant: land, labor, machinery, buildings, overhead.
        They are spread across the total acres of every enterprise above.
      </p>

      <div class="fixed-grid">
        <div class="fixed-col">
          <h3 class="sub-title">Land &amp; labor</h3>
          ${moneyField({
            label: 'Land rent / acre',
            path: 'fixed.landRentPerAcre',
            value: f.landRentPerAcre,
            prefix: '$',
            placeholder: '0.00',
            info: 'landRent',
            typical: 'landRent',
          })}
          ${moneyField({
            label: 'Labor rate',
            path: 'fixed.labor.ratePerHour',
            value: f.labor?.ratePerHour,
            prefix: '$',
            suffix: '/hr',
            placeholder: '0.00',
            info: 'laborCost',
            typical: 'laborRate',
          })}
          ${periodField({
            label: 'Hired labor',
            path: 'fixed.labor.hours',
            value: f.labor?.hours ?? f.labor?.totalHoursPerYear,
            basisPath: 'fixed.labor.hoursBasis',
            basisValue: f.labor?.hoursBasis,
            options: HOURS_BASIS,
            placeholder: '0',
            info: 'laborHours',
          })}
          ${readout('Labor hours / year', 'fixed.totalHoursPerYear', { fmt: 'plain' })}
          ${readout('Labor cost / acre', 'fixed.laborPerAcre')}
        </div>

        <div class="fixed-col">
          <h3 class="sub-title">Overhead ${infoButton('overheadPeriod', 'overhead')}</h3>
          ${OVERHEAD_LINES.map((o) =>
            periodField({
              label: o.label,
              path: `fixed.annual.${o.key}`,
              value: f.annual?.[o.key],
              basisPath: `fixed.annualBasis.${o.key}`,
              basisValue: f.annualBasis?.[o.key],
              options: COST_BASIS,
              prefix: '$',
              placeholder: '0',
            })
          ).join('')}
          ${readout('Overhead / year', 'fixed.annualTotal', { fmt: 'usd' })}
        </div>
      </div>

      <h3 class="sub-title">
        Equipment
        ${infoButton('equipmentVsBuilding', 'equipment')}
        ${infoButton('depreciationVsInterest', 'depreciation and interest')}
      </h3>
      <p class="hint">
        Enter each machine once — depreciation and interest are both worked out from it.
      </p>
      <div class="item-list">
        ${(f.equipment ?? []).map((item, i) => renderEquipment(item, i)).join('')}
      </div>
      <button type="button" class="btn-add" data-action="add-equipment">+ Add equipment</button>

      <h3 class="sub-title">
        Buildings &amp; improvements
        ${infoButton('equipmentVsBuilding', 'buildings')}
      </h3>
      <p class="hint">Permanent structures — sheds, bins, shops, fencing, water systems. No salvage value.</p>
      <div class="item-list">
        ${(f.buildings ?? []).map((item, i) => renderBuilding(item, i)).join('')}
      </div>
      <button type="button" class="btn-add" data-action="add-building">+ Add building</button>

      <div class="fixed-totals">
        ${readout('Total fixed costs / acre', 'fixed.totalFixedPerAcre', { strong: true })}
        ${readout('Total fixed costs / year', 'fixed.totalFixedAnnual', { fmt: 'usd' })}
      </div>

      <datalist id="equipment-names">
        ${EQUIPMENT_CATALOG.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
      <datalist id="building-names">
        ${BUILDING_CATALOG.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
      </div>
    </section>`
}

const OVERHEAD_LINES = [
  { key: 'utilities', label: 'Utilities' },
  { key: 'farmInsurance', label: 'Farm insurance' },
  { key: 'duesFees', label: 'Dues & professional fees' },
  { key: 'misc', label: 'Miscellaneous' },
]

function renderEquipment(item, i) {
  const p = `fixed.equipment.${i}`
  return `
    <div class="item" data-item-index="${i}">
      <div class="item-head">
        ${field({
          label: 'Equipment name',
          path: `${p}.name`,
          value: item.name,
          placeholder: 'Tractor, planter, combine…',
          list: 'equipment-names',
        })}
        <button type="button" class="btn-remove" data-action="remove-equipment"
          data-index="${i}" aria-label="Remove this equipment">Remove</button>
      </div>
      <div class="item-grid">
        ${moneyField({ label: 'Initial cost', path: `${p}.initialCost`, value: item.initialCost, prefix: '$', placeholder: '0' })}
        ${moneyField({
          label: 'Salvage value',
          path: `${p}.salvageValue`,
          value: item.salvageValue,
          prefix: '$',
          placeholder: '0',
          info: 'salvageValue',
          typical: 'salvageValue',
        })}
        ${moneyField({
          label: 'Useful life',
          path: `${p}.usefulLife`,
          value: item.usefulLife,
          suffix: 'yrs',
          placeholder: '0',
          info: 'usefulLife',
          typical: 'usefulLifeEquipment',
          category: item.category || '',
        })}
        ${moneyField({ label: 'Interest rate', path: `${p}.interestRate`, value: item.interestRate, suffix: '%', placeholder: '0.0' })}
      </div>
      <div class="item-out">
        <span>Depreciation <b data-out="fixed.equipment.${i}.annualDep" data-fmt="usd">—</b>/yr</span>
        <span>Interest <b data-out="fixed.equipment.${i}.annualInt" data-fmt="usd">—</b>/yr</span>
      </div>
    </div>`
}

function renderBuilding(item, i) {
  const p = `fixed.buildings.${i}`
  return `
    <div class="item" data-item-index="${i}">
      <div class="item-head">
        ${field({
          label: 'Building name',
          path: `${p}.name`,
          value: item.name,
          placeholder: 'Machine shed, grain bin…',
          list: 'building-names',
        })}
        <button type="button" class="btn-remove" data-action="remove-building"
          data-index="${i}" aria-label="Remove this building">Remove</button>
      </div>
      <div class="item-grid three">
        ${moneyField({ label: 'Initial cost', path: `${p}.initialCost`, value: item.initialCost, prefix: '$', placeholder: '0' })}
        ${moneyField({
          label: 'Useful life',
          path: `${p}.usefulLife`,
          value: item.usefulLife,
          suffix: 'yrs',
          placeholder: '0',
          info: 'usefulLife',
          typical: 'usefulLifeBuilding',
        })}
        ${moneyField({ label: 'Interest rate', path: `${p}.interestRate`, value: item.interestRate, suffix: '%', placeholder: '0.0' })}
      </div>
      <div class="item-out">
        <span>Depreciation <b data-out="fixed.buildings.${i}.annualDep" data-fmt="usd">—</b>/yr</span>
        <span>Interest <b data-out="fixed.buildings.${i}.annualInt" data-fmt="usd">—</b>/yr</span>
      </div>
    </div>`
}
