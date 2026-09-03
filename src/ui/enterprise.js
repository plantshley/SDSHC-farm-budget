/**
 * Enterprise cards — the sheet's four columns, unlimited.
 *
 * The SAME markup renders at every width. Desktop lays the cards out as
 * parallel columns (mirroring the spreadsheet); mobile stacks them as
 * accordions. That is a CSS grid change only — see styles.css. Never fork this
 * into separate mobile and desktop components.
 */

import { esc } from './format.js'
import { field, moneyField, modePill, readout, sectionInfo, unitNotice, STEP } from './fields.js'
import { VARIABLE_LINES, enterpriseLabel, lineModes } from '../calc.js'

/**
 * What each entry mode is called on its segment of the pill.
 *
 * Short on purpose: three segments plus a label plus "use typical value" have to
 * share one line on a 360px screen, and the pill is the thing that gives if any
 * of them grows. The full sentence lives in the hint above the list.
 */
const MODE_LABELS = {
  unit: '$/unit',
  perAcre: '$/ac',
  // "seeds/ac" rather than "population": it names the number the box actually
  // wants. "Population" is the agronomy term for it and reads, on a pill beside
  // two dollar labels, as a category rather than a unit.
  population: 'seeds/ac',
  total: 'total',
}

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
          <span class="ent-sub">
            <span data-out="${p}.acres" data-fmt="acres">—</span>
            <!-- Shown only while the card is SHUT. Open, both figures are
                 already readout rows a few inches below, and the same number
                 twice on one card is the thing .fold-sub exists to prevent.
                 They are the two the card is folded around: what the crop
                 makes an acre, and what it makes altogether. -->
            <span class="ent-fold-sub">
              <span class="ent-fig">
                <span class="ent-fig-key">Gross margin / ac:</span>
                <span data-out="${p}.grossMarginPerAcre" data-fmt="usdCents" data-tone>—</span>
              </span>
              <span class="ent-fig">
                <span class="ent-fig-key">Enterprise gross margin:</span>
                <span data-out="${p}.enterpriseGrossMargin" data-fmt="usd" data-tone>—</span>
              </span>
            </span>
          </span>
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
        <p class="hint">Enter a cost per unit and units per acre, or switch a line to a straight cost per acre.
          On a $/unit line <b>both boxes are needed.</b> If you leave either one blank, the line counts as $0.</p>
        ${VARIABLE_LINES.map((def) => renderLine(def, e, p, seedNote(e, p))).join('')}
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
        <!-- This enterprise's own warnings, at the foot of its own card and
             inside its fold. Almost every one names a specific box on this
             card, so it is printed within arm's reach of the box rather than
             in a pile at the bottom of the page addressed by name.

             A [data-warnings] placeholder, not markup: warnings appear and
             disappear as figures are typed, and updateOutputs() is all that
             runs on a keystroke. data-warnings-for says whose list to draw. -->
        <div data-warnings data-warnings-for="${i}"></div>
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
 * costs to be entered as "cost × 1". Every mode a line offers is available here
 * and each mode's values are stored separately, so switching back and forth
 * loses nothing.
 *
 * Which modes a line offers is declared on the line in calc.js, not decided
 * here — see lineModes(). Only seed and crop insurance carry a third.
 */
function renderLine(def, e, entPath, seedNote) {
  const line = e.variable?.[def.key] ?? {}
  const p = `${entPath}.variable.${def.key}`
  const modes = lineModes(def)
  // An unrecognised mode from a hand-edited file falls back to the sheet's own,
  // the same way perYearFactor() falls back to a multiplier of 1.
  const mode = modes.includes(line.mode) ? line.mode : 'unit'
  const typical = def.key

  // The seeds-per-unit offer, when this line is in population mode. It is
  // rendered TWICE and one copy is hidden at each width, which needs saying
  // plainly because duplicated markup is normally a smell:
  //
  //   - on a computer it belongs in the head row, right-aligned against the
  //     mode pill, where it reads as the second of this line's two controls;
  //   - on a phone that row is already a label, a link, and a three-segment
  //     pill at 360px, so it drops to a line of its own under the boxes.
  //
  // Those are different parents, and no amount of `order` moves a flex item
  // between containers. The hidden copy is `display: none`, which takes it out
  // of the accessibility tree as well as off the screen, so exactly one offer
  // is ever announced. See `.seeds-link-row` in styles.css.
  const seedsLink = (where) =>
    mode === 'population'
      ? `<button type="button" class="tip seeds-link-${where}" data-typical="seedsPerBag"
           data-target="${esc(seedNote.path)}">seeds per unit for my crop</button>`
      : ''

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
                 data-target="${esc(p)}.${
                   mode === 'perAcre'
                     ? 'perAcre'
                     : mode === 'population'
                       ? 'costPerBag'
                       : 'costPerUnit'
                 }"
                 data-mode-path="${esc(p)}.mode" data-line-mode="${esc(mode)}"
                 data-target-per-acre="${esc(p)}.perAcre" data-target-unit="${esc(p)}.costPerUnit"
                 ${
                   // Only on a line that offers seeds/ac. Its cost box holds the
                   // same quantity a $/unit list is quoting, so a seed price is
                   // at home in either mode -- see placeValue() in ui/modals.js.
                   modes.includes('population')
                     ? `data-target-population="${esc(p)}.costPerBag"`
                     : ''
                 }
               >use typical value</button>`
            : ''
        }
        ${seedsLink('head')}
        ${modePill({
          label: def.label,
          path: `${p}.mode`,
          current: mode,
          modes: modes.map((key) => ({ key, label: MODE_LABELS[key] ?? key })),
        })}
      </div>
      <div class="line-inputs">
        ${lineInputs(def, line, p, mode)}
        <span class="line-total" data-out="${entPath}.lines.${def.key}" data-fmt="usdCents">—</span>
      </div>
      ${seedsLink('row')}
      <!-- Under the whole line, not under the box. The caption is a sentence
           about a figure that is already there, and stacked inside the row it
           squeezed three number boxes into two columns' worth of width. Only
           the seed line offers population mode, so the mode test is also what
           keeps this off the other fourteen. -->
      ${mode === 'population' ? seedNote.html : ''}
    </div>`
}

/**
 * The caption under the seed line saying the app filled seeds-per-unit in.
 *
 * This is the visible half of the one deliberate exception to "nothing
 * auto-fills" (see CLAUDE.md). `seedsPerBagAuto` records the crop term the
 * number came from, and it is cleared the moment the producer types in the box.
 * So the caption is present exactly while the number is the app's rather than
 * theirs, which is what makes filling the box in the first place honest: a
 * figure that appeared without being asked for has to say where it came from,
 * and has to stop saying it once the producer takes the box over.
 */
function seedNote(e, entPath) {
  const path = `${entPath}.variable.seed.seedsPerBag`
  const from = e.variable?.seed?.seedsPerBagAuto
  return {
    path,
    html: from
      ? `<p class="field-note" data-notice-for="${esc(path)}">
           Seeds per unit filled in from "${esc(from)}". Change it if your bag is a different size.</p>`
      : '',
  }
}

/**
 * One input, with the two halves of its unit shown inside the box.
 *
 * A money box's placeholder carries the whole unit ("$/unit"), which is the
 * right thing to say while it is empty. Once there is a number in it the
 * placeholder is gone and the unit goes with it, so the box reads "285" with
 * nothing to say whether that is per acre, per unit, or for the whole crop.
 *
 * So the unit splits and stays: the `$` sits before the figure and the rest is
 * right-aligned at the end of the box. Both are dimmer and smaller than the
 * figure, because they are a label on it rather than part of it.
 *
 * **It is done in CSS, off `:placeholder-shown`.** The affixes are always in the
 * markup and the browser reveals them when the box stops showing its
 * placeholder, so nothing has to run on a keystroke to keep them in step —
 * which matters because `updateOutputs()` is the only thing that does run, and
 * an affix that appeared one render late would be worse than no affix.
 *
 * @param {string} [pre]   shown before the figure, always `$` in practice
 * @param {string} [post]  shown at the end of the box, e.g. `/ac`
 */
function moneyBox(o) {
  const affixed = o.pre || o.post
  const input = `
    <input type="number" step="${o.step ?? STEP.money}" inputmode="decimal"
      class="line-input" data-path="${esc(o.path)}" value="${esc(o.value ?? '')}"
      placeholder="${esc(o.placeholder)}" aria-label="${esc(o.ariaLabel)}" />`

  if (!affixed) return `<span class="in-box">${input}</span>`
  return `
    <span class="in-box${o.pre ? ' has-pre' : ''}${o.post ? ' has-post' : ''}">
      ${input}
      ${o.pre ? `<span class="in-affix in-pre" aria-hidden="true">${esc(o.pre)}</span>` : ''}
      ${o.post ? `<span class="in-affix in-post" aria-hidden="true">${esc(o.post)}</span>` : ''}
    </span>`
}

/**
 * What a `$/unit` line's two boxes are counting, in one place.
 *
 * The noun appears twice on the row — as the cost box's trailing affix (`/lb`)
 * and as the units box's placeholder (`lb/acre`) — and the two must never
 * disagree, because between them they are the whole sentence: dollars per pound,
 * times pounds per acre. `unit` is the honest default: until a typical value has
 * been chosen, nothing in the app knows what the line is counting.
 */
export function unitLabels(noun) {
  const word = noun || 'unit'
  return { post: `/${word}`, unitsPlaceholder: `${word}/acre` }
}

/**
 * Write those two labels straight onto a line's boxes, without a render.
 *
 * Both moments this is needed are keystroke-or-tap moments that do NOT rebuild
 * the card: choosing a figure in the mode the line is already in, and typing
 * over that figure afterwards. Rendering for either would take the caret out of
 * the box being used. Same idiom as applyValue() writing `.value` directly.
 */
export function applyUnitLabels(root, linePath, noun) {
  const labels = unitLabels(noun)
  const sel = (path) => {
    const escaped = globalThis.CSS?.escape ? CSS.escape(path) : path
    return root?.querySelector(`[data-path="${escaped}"]`)
  }

  const units = sel(`${linePath}.unitsPerAcre`)
  if (units) units.placeholder = labels.unitsPlaceholder

  const cost = sel(`${linePath}.costPerUnit`)
  const affix = cost?.closest('.in-box')?.querySelector('.in-post')
  if (affix) affix.textContent = labels.post
}

/** The boxes for one mode. Money everywhere except the two seed counts. */
function lineInputs(def, line, p, mode) {
  const box = (key, o) =>
    moneyBox({ ...o, path: `${p}.${key}`, value: line[key], ariaLabel: `${def.label} ${o.ariaLabel}` })

  if (mode === 'perAcre') {
    // "$/acre" rather than "0.00". An empty box saying 0.00 says what shape the
    // answer takes and nothing about what it is meant to be — and the mode this
    // line is in is exactly the thing a producer has just changed.
    //
    // The word is spelled out here and abbreviated on the pill, and that is
    // deliberate rather than drift. A pill segment is one of three sharing a
    // row with a label and a link on a 360px screen, and it is the thing that
    // gives when any of them grows; a placeholder has the whole box to itself
    // and no reason to make the producer expand an abbreviation.
    return box('perAcre', {
      placeholder: '$/acre',
      ariaLabel: 'dollars per acre',
      pre: '$',
      post: '/ac',
    })
  }

  if (mode === 'population') {
    // Three factors do not fit one row, and the third is the one that suffers:
    // a soybean unit is 140,000 seeds, and in a box narrow enough to be a third
    // of a phone it renders as "1400" with the rest scrolled out of sight. A
    // figure the APP filled in, cut off, reading as a plausible wrong number is
    // the worst version of that -- nothing on screen says to click in and press
    // End.
    //
    // So the break is declared rather than left to flex-wrap: seeds-per-unit and
    // its divisor take a row of their own, where the box has the width to show
    // six digits and its `/bag` affix. The operators still travel with the boxes
    // they sit between, so the row below reads as a continuation of the row
    // above rather than as a second sum.
    return `${box('costPerBag', {
      placeholder: '$/bag',
      ariaLabel: 'cost per bag or unit',
      pre: '$',
      post: '/bag',
    })}
      <span class="times">×</span>
      ${box('population', {
        placeholder: 'seeds/acre',
        ariaLabel: 'planting population, seeds per acre',
        step: STEP.population,
        post: '/ac',
      })}
      <span class="line-break" aria-hidden="true"></span>
      <span class="times">÷</span>
      ${box('seedsPerBag', {
        placeholder: 'seeds/bag',
        ariaLabel: 'seeds per bag or unit',
        step: STEP.population,
        post: '/bag',
      })}`
  }

  if (mode === 'total') {
    // Divided by THIS enterprise's acres, which is said on the placeholder
    // rather than left to be inferred from a figure that comes out per acre.
    // The noun comes off the line, not from here. Crop insurance is the only
    // line offering this mode today and "total premium" is what a producer
    // calls that figure, but a second line taking the mode would not be a
    // premium — so the word lives beside the line it describes.
    return `${box('totalCost', {
      placeholder: def.totalHint ?? 'total for this crop',
      ariaLabel: 'total cost for this enterprise',
      pre: '$',
      post: 'total',
    })}
      <span class="times">÷ acres</span>`
  }

  // Both boxes take the noun from the same place, so the row always reads as one
  // sentence: dollars per pound, times pounds per acre.
  const labels = unitLabels(line.typicalUnitLabel)
  return `${box('costPerUnit', {
    placeholder: '$/unit',
    ariaLabel: 'cost per unit',
    pre: '$',
    post: labels.post,
  })}
    <span class="times">×</span>
    ${box('unitsPerAcre', {
      // "unit/acre" until the app has been TOLD what the unit is, and then the
      // real noun. `def.unitHint` used to fill this from a guess about the
      // line, which gave crop insurance and repairs a box reading "acre/acre",
      // and gave seed "bag, unit/acre" — two nouns and a comma inside a
      // placeholder. A typical value quotes its own unit and is the only thing
      // here that actually knows one, so the generic word stands until one is
      // picked. See markQuotedUnitLabel() in ui/modals.js.
      placeholder: labels.unitsPlaceholder,
      ariaLabel: 'units per acre',
      post: '/ac',
    })}`
}

// Only lines with a real, cited source get the link. See data/typical-values.js.
const LINES_WITH_TYPICAL = new Set([
  'seed',
  'nitrogen',
  'phosphorus',
  'potassium',
  'herbicide',
  'insecticide',
  'cropInsurance',
  'fuelOil',
  'repairs',
  'customHire',
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
        ${modePill({
          label: 'interest on preharvest costs',
          path: `${p}.auto`,
          action: 'set-preharvest-mode',
          current: auto ? 'auto' : 'manual',
          modes: [
            { key: 'auto', label: 'calculated' },
            { key: 'manual', label: 'entered by me' },
          ],
        })}
      </div>
      <div class="line-inputs">
        ${
          auto
            ? `<input type="number" step="${STEP.money}" inputmode="decimal" class="line-input narrow"
                 data-path="${esc(p)}.rate" value="${esc(pre.rate ?? '')}"
                 placeholder="10" aria-label="Interest rate percent" />
               <span class="times">% for</span>
               <input type="number" step="${STEP.count}" inputmode="decimal" class="line-input narrow"
                 data-path="${esc(p)}.months" value="${esc(pre.months ?? '')}"
                 placeholder="8" aria-label="Months carried" />
               <span class="times">mo</span>`
            : moneyBox({
                path: `${p}.manualPerAcre`,
                value: pre.manualPerAcre,
                placeholder: '$/acre',
                ariaLabel: 'Preharvest interest dollars per acre',
                pre: '$',
                post: '/ac',
              })
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
