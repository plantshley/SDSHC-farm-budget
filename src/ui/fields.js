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

export function field(o) {
  const id = `f-${o.path.replace(/\./g, '-')}`
  return `
    <div class="field">
      <label for="${id}">
        ${esc(o.label)}
        ${o.info ? infoButton(o.info, o.label) : ''}
      </label>
      <div class="input-wrap${o.prefix ? ' has-prefix' : ''}${o.suffix ? ' has-suffix' : ''}">
        ${o.prefix ? `<span class="affix prefix">${esc(o.prefix)}</span>` : ''}
        <input
          id="${id}"
          type="${o.type || 'text'}"
          ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}
          ${o.type === 'number' ? 'step="any"' : ''}
          data-path="${esc(o.path)}"
          value="${esc(o.value ?? '')}"
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
  return `
    <div class="readout${opts.strong ? ' strong' : ''}">
      <span class="readout-label">
        ${esc(label)}
        ${opts.info ? infoButton(opts.info, label) : ''}
      </span>
      <span class="readout-value" data-out="${esc(path)}" data-fmt="${esc(opts.fmt || 'usdCents')}">—</span>
    </div>`
}
