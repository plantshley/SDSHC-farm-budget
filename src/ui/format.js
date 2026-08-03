/** Display formatting. Producers read money, not floats. */

const money0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const money2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Whole dollars — for farm-wide totals, where cents are noise. */
export function usd(n) {
  return money0.format(Number.isFinite(n) ? n : 0)
}

/** Dollars and cents — for per-acre and per-unit figures, where cents matter. */
export function usdCents(n) {
  return money2.format(Number.isFinite(n) ? n : 0)
}

export function number(n) {
  return plain.format(Number.isFinite(n) ? n : 0)
}

/** Escape text before it goes into innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

/** Positive money reads green, negative reads red — including on the bottom line. */
export function signClass(n) {
  if (!Number.isFinite(n) || n === 0) return ''
  return n > 0 ? 'pos' : 'neg'
}
