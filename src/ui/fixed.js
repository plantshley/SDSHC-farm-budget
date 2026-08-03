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
import { field, moneyField, readout, sectionInfo, infoButton } from './fields.js'
import { EQUIPMENT_CATALOG, BUILDING_CATALOG } from '../data/typical-values.js'

export function renderFixed(scenario) {
  const f = scenario.fixed ?? {}

  return `
    <section class="box fixed-block">
      <header class="block-head">
        <h2 class="title">Shared fixed costs</h2>
        ${sectionInfo(
          ['fixedCosts', 'landRent', 'laborCost', 'equipmentVsBuilding', 'depreciationVsInterest', 'salvageValue', 'usefulLife'],
          'Fixed costs'
        )}
      </header>
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
          ${moneyField({
            label: 'Total labor hours / year',
            path: 'fixed.labor.totalHoursPerYear',
            value: f.labor?.totalHoursPerYear,
            suffix: 'hrs',
            placeholder: '0',
          })}
          ${readout('Labor cost / acre', 'fixed.laborPerAcre')}
        </div>

        <div class="fixed-col">
          <h3 class="sub-title">Annual overhead</h3>
          ${moneyField({ label: 'Utilities', path: 'fixed.annual.utilities', value: f.annual?.utilities, prefix: '$', suffix: '/yr', placeholder: '0' })}
          ${moneyField({ label: 'Farm insurance', path: 'fixed.annual.farmInsurance', value: f.annual?.farmInsurance, prefix: '$', suffix: '/yr', placeholder: '0' })}
          ${moneyField({ label: 'Dues & professional fees', path: 'fixed.annual.duesFees', value: f.annual?.duesFees, prefix: '$', suffix: '/yr', placeholder: '0' })}
          ${moneyField({ label: 'Miscellaneous', path: 'fixed.annual.misc', value: f.annual?.misc, prefix: '$', suffix: '/yr', placeholder: '0' })}
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
    </section>`
}

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
