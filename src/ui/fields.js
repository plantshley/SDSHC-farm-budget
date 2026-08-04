/**
 * Field markup helpers.
 *
 * Every input declares `data-path`, the scenario path it writes to. One
 * delegated listener in main.js handles all of them, so adding a field never
 * means adding a handler.
 *
 * The two help affordances are separate by construction:
 *   `info`    → a round `?`, read-only
 *   `typical` → a "use typical value" text link, which writes
 */

import { esc } from './format.js'

/**
 * @param {object} o
 * @param {string} o.label
 * @param {string} o.path      scenario path, e.g. 'fixed.landRentPerAcre'
 * @param {string|number} o.value
 * @param {string} [o.prefix]  '$' etc., shown inside the input frame
 * @param {string} [o.suffix]  'years', '%', '/acre'
 * @param {string} [o.info]    definition key for the `?`
 * @param {string} [o.typical] key into TYPICAL_VALUES for the link
 * @param {string} [o.category] passed to the typical picker to filter options
 * @param {string} [o.placeholder]
 */
export function moneyField(o) {
  return field({ ...o, inputmode: 'decimal', type: 'number' })
}

/**
 * The label and its `?`, side by side but NOT nested.
 *
 * A `<button>` is a labelable element, and a `<label>` may not contain one other
 * than the control it labels — the `?` inside the label made every field with a
 * definition invalid HTML, and left it to each browser to decide what clicking
 * the label should do. The row wraps them instead.
 */
function labelRow(id, o) {
  return `
    <div class="field-label">
      <label for="${id}">${esc(o.label)}</label>
      ${o.info ? infoButton(o.info, o.label) : ''}
    </div>`
}

/**
 * Values destined for a `type="number"` box lose their currency formatting.
 *
 * calc.js deliberately understands "$285,000" — an imported or pasted budget can
 * contain one. But the HTML value-sanitisation algorithm for number inputs
 * discards any string that is not a valid float, so that same value renders as
 * an EMPTY box while the totals below it are computed correctly from it. The
 * producer sees a blank field they did not leave blank, and typing into it
 * replaces a figure they could not see. Strip the formatting on the way to the
 * input; the model strips it again on the way back.
 */
function inputValue(value, type) {
  if (type !== 'number') return value ?? ''
  const s = String(value ?? '')
  return s === '' ? '' : s.replace(/[$\s,]/g, '')
}

export function field(o) {
  const id = `f-${o.path.replace(/\./g, '-')}`
  return `
    <div class="field">
      ${labelRow(id, o)}
      <div class="input-wrap${o.prefix ? ' has-prefix' : ''}${o.suffix ? ' has-suffix' : ''}">
        ${o.prefix ? `<span class="affix prefix">${esc(o.prefix)}</span>` : ''}
        <input
          id="${id}"
          type="${o.type || 'text'}"
          ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}
          ${o.type === 'number' ? 'step="any"' : ''}
          data-path="${esc(o.path)}"
          value="${esc(inputValue(o.value, o.type))}"
          placeholder="${esc(o.placeholder ?? '')}"
          ${o.list ? `list="${esc(o.list)}"` : ''}
          ${o.ariaLabel ? `aria-label="${esc(o.ariaLabel)}"` : ''}
        />
        ${o.suffix ? `<span class="affix suffix">${esc(o.suffix)}</span>` : ''}
      </div>
      ${
        o.typical
          ? `<button type="button" class="tip" data-typical="${esc(o.typical)}"
               data-target="${esc(o.path)}" data-category="${esc(o.category || '')}"
             >use typical value</button>`
          : ''
      }
    </div>`
}

/**
 * An amount paired with the period it was entered for.
 *
 * The spreadsheet asks for annual figures throughout, which quietly makes the
 * producer do a conversion before they reach the box: a $180 power bill is
 * monthly, hired help is "a couple of days a week". Doing that arithmetic in
 * your head is where a budget picks up a factor-of-twelve error that nothing
 * downstream can detect. The number goes in as it is known; the select says
 * what it means and calc.js annualises it.
 *
 * @param {object} o          as field(), plus:
 * @param {string} o.basisPath   scenario path for the period key
 * @param {string} o.basisValue  currently selected period key
 * @param {Array}  o.options     HOURS_BASIS or COST_BASIS from calc.js
 */
export function periodField(o) {
  const id = `f-${o.path.replace(/\./g, '-')}`
  const basisId = `f-${o.basisPath.replace(/\./g, '-')}`
  const selected = o.options.some((x) => x.key === o.basisValue) ? o.basisValue : 'year'

  return `
    <div class="field period-field">
      ${labelRow(id, o)}
      <div class="period-row">
        <div class="input-wrap${o.prefix ? ' has-prefix' : ''}">
          ${o.prefix ? `<span class="affix prefix">${esc(o.prefix)}</span>` : ''}
          <input
            id="${id}"
            type="number"
            step="any"
            inputmode="decimal"
            data-path="${esc(o.path)}"
            value="${esc(inputValue(o.value, 'number'))}"
            placeholder="${esc(o.placeholder ?? '')}"
          />
        </div>
        <select id="${basisId}" class="period-select" data-path="${esc(o.basisPath)}"
          aria-label="${esc(o.label)} period">
          ${o.options
            .map(
              (x) =>
                `<option value="${esc(x.key)}"${x.key === selected ? ' selected' : ''}>${esc(
                  x.label
                )}</option>`
            )
            .join('')}
        </select>
      </div>
    </div>`
}

/** The round `?`. Read-only by contract — it opens a definition, nothing else. */
export function infoButton(key, label) {
  return `<button type="button" class="help-btn" data-info="${esc(key)}"
    aria-label="What is ${esc(label)}?" title="What is ${esc(label)}?">?</button>`
}

/** A `?` for a whole card, opening several related definitions at once. */
export function sectionInfo(keys, title) {
  return `<button type="button" class="help-btn" data-info="${esc(keys.join(','))}"
    data-info-title="${esc(title)}" aria-label="About ${esc(title)}"
    title="About ${esc(title)}">?</button>`
}

export function readout(label, path, opts = {}) {
  // A readout is not a form control, so its caption is a span — the `?` may sit
  // inside it without the labelable-descendant problem that field() has.
  return `
    <div class="readout${opts.strong ? ' strong' : ''}">
      <span class="readout-label">
        ${esc(label)}
        ${opts.info ? infoButton(opts.info, label) : ''}
      </span>
      <span class="readout-value" data-out="${esc(path)}" data-fmt="${esc(opts.fmt || 'usdCents')}">—</span>
    </div>`
}
