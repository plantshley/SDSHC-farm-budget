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
 * The label, its `?`, and its "use typical value" link, side by side but NOT
 * nested.
 *
 * A `<button>` is a labelable element, and a `<label>` may not contain one other
 * than the control it labels — the `?` inside the label made every field with a
 * definition invalid HTML, and left it to each browser to decide what clicking
 * the label should do. The row wraps them instead.
 *
 * The typical-value link sits here rather than under the input, for the same
 * reason it does on a variable-expense line: below the box it reads as a caption
 * belonging to the next field down, and it adds a row of height to every field
 * that has one. Beside the label it reads as an offer about this field.
 */
function labelRow(id, o) {
  return `
    <div class="field-label">
      <label for="${id}">${esc(o.label)}</label>
      ${o.info ? infoButton(o.info, o.label) : ''}
      ${
        o.typical
          ? `<button type="button" class="tip line-tip" data-typical="${esc(o.typical)}"
               data-target="${esc(o.path)}" data-category="${esc(o.category || '')}"
               ${o.basisPath ? `data-basis-path="${esc(o.basisPath)}"` : ''}
               ${
                 o.typicalBasisPath
                   ? `data-typical-basis-path="${esc(o.typicalBasisPath)}"`
                   : ''
               }
             >use typical value</button>`
          : ''
      }
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

/**
 * How far one press of a number input's up/down arrow moves the value.
 *
 * The browser's default is 1, which is the wrong size for almost everything
 * here: a seed cost of $3.80 and a 7% interest rate both want a tenth. HTML
 * gives one knob for this and `step` is it.
 *
 * A consequence worth knowing before changing it: `step` also governs
 * VALIDITY. At 0.1, a value of 177.85 is a "step mismatch" and the input
 * matches :invalid. That is harmless here only because nothing in styles.css
 * targets :invalid — the value still reads back exactly, and the sole visible
 * effect is that an arrow press from 177.85 snaps to 177.8. Do not add an
 * :invalid rule to the stylesheet without revisiting this.
 *
 * MONEY is the default because most number fields here are money. The two
 * exceptions are named rather than inferred:
 *   COUNT       whole things — years of useful life, hours, months carried.
 *               A tenth of a year is not a step anyone reaches for.
 *   POPULATION  tens of thousands of seeds. A tenth would be pressing the
 *               arrow ten thousand times to make a difference you can see.
 */
export const STEP = {
  money: '0.1',
  count: '1',
  population: '1000',
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
          ${o.type === 'number' ? `step="${esc(o.step || STEP.money)}"` : ''}
          data-path="${esc(o.path)}"
          value="${esc(inputValue(o.value, o.type))}"
          placeholder="${esc(o.placeholder ?? '')}"
          ${o.list ? `list="${esc(o.list)}"` : ''}
          ${o.ariaLabel ? `aria-label="${esc(o.ariaLabel)}"` : ''}
        />
        ${o.suffix ? `<span class="affix suffix">${esc(o.suffix)}</span>` : ''}
      </div>
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
 * @param {string} [o.typicalBasisPath]  where to record the period a figure
 *   taken from the picker was published for. Kept separate from basisPath
 *   because the producer may move the select afterwards, and the difference
 *   between the two is exactly what says the figure no longer means what it did.
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
            step="${esc(o.step || STEP.money)}"
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

/**
 * The entry-mode control on a variable expense line, and on preharvest interest.
 *
 * One pill split into segments, with the active one filled. It replaced a single
 * button that showed the mode it was currently in — which reads equally well as
 * the mode it would switch you TO, so a producer had no way to tell the state
 * from the offer. Both readings are reasonable, which is what made the old
 * control ambiguous rather than merely terse.
 *
 * Every segment carries the SAME `data-path` and its own `data-mode`, so the
 * handler in main.js writes the mode named rather than flipping to whatever is
 * next. That matters as soon as there are three of them: "toggle" has no
 * meaning on a three-way control.
 *
 * The consequence for tests: `querySelector('[data-path="…"]')` now finds the
 * FIRST segment rather than the only button, so a click has to name the segment
 * it wants — `[data-path="…"][data-mode="perAcre"]`.
 *
 * @param {object} o
 * @param {string} o.label    what the pill belongs to, for the group's a11y name
 * @param {string} o.path     scenario path the mode is stored at
 * @param {Array<{key: string, label: string}>} o.modes
 * @param {string} o.current  the key currently selected
 */
export function modePill(o) {
  return `
    <div class="mode-pill" role="group" aria-label="Entry mode for ${esc(o.label)}">
      ${o.modes
        .map(
          (m) => `<button type="button" class="mode-seg" data-action="${esc(
            o.action || 'set-line-mode'
          )}"
            data-path="${esc(o.path)}" data-mode="${esc(m.key)}"
            aria-pressed="${m.key === o.current}">${esc(m.label)}</button>`
        )
        .join('')}
    </div>`
}

/**
 * A one-shot message explaining why a figure was just cleared.
 *
 * `data-notice-for` carries the paths of the fields it is about, space
 * separated. A focusin listener in main.js removes the paragraph when the
 * producer taps into one of them: the notice exists to explain an empty box, and
 * once they are filling that box in it has said everything it has to say.
 *
 * @param {{text: string, paths: string[]}|null|undefined} notice
 */
export function unitNotice(notice) {
  if (!notice?.text) return ''
  return `<p class="unit-notice" role="status"
    data-notice-for="${esc((notice.paths ?? []).join(' '))}">${esc(notice.text)}</p>`
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
