/**
 * Modals — two kinds, deliberately never merged.
 *
 *   openInfo()    backs every round `?`. READ-ONLY. It explains a term and
 *                 cannot change a producer's numbers.
 *   openTypical() backs every "use typical value" link. It WRITES one value
 *                 into one field.
 *
 * Tapping a `?` must never alter data. That is the whole reason the two
 * affordances look different, and it is why they are separate functions here.
 */

import { esc } from './format.js'
import { DEFINITIONS } from '../data/definitions.js'
import { TYPICAL_VALUES } from '../data/typical-values.js'
import { getScenario, getPath, setPath, notify } from '../state.js'

let overlay = null
let lastFocused = null

function ensureOverlay() {
  // Rebuild unless the cached node is still live in THIS document. isConnected
  // alone is not enough — it stays true for a node attached to a previous
  // document. A stale overlay would silently swallow every modal.
  if (overlay?.isConnected && overlay.ownerDocument === document) return overlay
  overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2 class="modal-title" id="modalTitle"></h2>
        <button type="button" class="modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>`
  overlay.setAttribute('aria-labelledby', 'modalTitle')

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close')) closeModal()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal()
  })
  document.body.appendChild(overlay)
  return overlay
}

function openModal(title, bodyHtml) {
  const el = ensureOverlay()
  lastFocused = document.activeElement
  el.querySelector('.modal-title').textContent = title
  el.querySelector('.modal-body').innerHTML = bodyHtml
  el.classList.add('open')
  el.querySelector('.modal-close').focus()
}

export function closeModal() {
  if (!overlay) return
  overlay.classList.remove('open')
  overlay.querySelector('.modal-body').innerHTML = ''
  // Return focus to whatever opened the modal, so keyboard users don't get
  // dumped back at the top of the document.
  if (lastFocused?.isConnected) lastFocused.focus()
  lastFocused = null
}

/* ─────────────────────────── `?` — read only ───────────────────────────── */

/** One or more definitions. Never writes anything. */
export function openInfo(keys, title) {
  const list = Array.isArray(keys) ? keys : [keys]
  const entries = list.map((k) => DEFINITIONS[k]).filter(Boolean)
  if (!entries.length) return

  const html = entries
    .map(
      (d) => `
      <section class="def">
        <h3>${esc(d.title)}</h3>
        ${d.body.map((p) => `<p>${esc(p)}</p>`).join('')}
      </section>`
    )
    .join('')

  openModal(title || entries[0].title, html)
}

/**
 * Free-form explanatory content — same read-only modal component.
 * A section may carry prose, a numbered list, or both; all three are valid.
 */
export function openGuide(title, sections) {
  const html = sections
    .map(
      (s) => `
      <section class="def">
        ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}
        ${(s.body ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}
        ${
          s.steps?.length
            ? `<ol>${s.steps.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>`
            : ''
        }
      </section>`
    )
    .join('')
  openModal(title, html)
}

/* ──────────────────── "use typical value" — writes ─────────────────────── */

/**
 * Resolve a sentinel like '=0.25*initialCost' against a sibling field.
 *
 * Follows the Virtual Fence ROI tool's '=40*herd' pattern: the option carries a
 * formula, and it is resolved at apply time against data the producer has
 * already entered — so the suggestion is scaled to their machine, not ours.
 */
function resolveValue(raw, targetPath) {
  if (typeof raw !== 'string' || !raw.startsWith('=')) {
    return { ok: true, value: raw }
  }
  const match = /^=([\d.]+)\*(\w+)$/.exec(raw)
  if (!match) return { ok: false, error: 'That typical value could not be applied.' }

  const [, factor, fieldName] = match
  const parentPath = targetPath.split('.').slice(0, -1).join('.')
  const siblingPath = parentPath ? `${parentPath}.${fieldName}` : fieldName
  const sibling = Number(getPath(getScenario(), siblingPath))

  if (!Number.isFinite(sibling) || sibling === 0) {
    return { ok: false, error: null } // caller shows the field's own `requires` message
  }
  return { ok: true, value: Number((Number(factor) * sibling).toFixed(2)) }
}

/**
 * Open the picker for one field.
 *
 * @param {string} typicalKey  key into TYPICAL_VALUES
 * @param {string} targetPath  scenario path the chosen value is written to
 * @param {string} category    optional item category, to filter the options
 */
export function openTypical(typicalKey, targetPath, category = '') {
  const spec = TYPICAL_VALUES[typicalKey]
  if (!spec) return

  const groups = spec.groups
    .map((g) => ({
      ...g,
      options: g.options.filter(
        (o) => !category || !o.categories || o.categories.includes(category)
      ),
    }))
    .filter((g) => g.options.length)

  // When a category filters everything out, show the full list rather than an
  // empty modal — the typed name is a hint, not a constraint.
  const shown = groups.length ? groups : spec.groups

  const provisional =
    spec.status === 'provisional'
      ? `<p class="modal-warn">These are commonly used figures, not survey data. Treat them as a starting point.</p>`
      : ''

  const body = `
    ${spec.note ? `<p class="modal-note">${esc(spec.note)}</p>` : ''}
    ${provisional}
    ${shown
      .map(
        (g) => `
      <div class="typ-group">
        <div class="typ-group-label">${esc(g.label)}</div>
        ${g.options
          .map(
            (o) => `
          <button type="button" class="typ-option" data-value="${esc(o.value)}">
            <span class="typ-value">${esc(formatOption(o.value, spec.unit))}</span>
            <span class="typ-label">${esc(o.label)}</span>
            ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}
          </button>`
          )
          .join('')}
      </div>`
      )
      .join('')}
    ${
      spec.source
        ? `<p class="modal-source">Source: ${esc(spec.source)}</p>`
        : `<p class="modal-source">No published source — see the note above.</p>`
    }
    <p class="modal-err" hidden></p>`

  openModal(spec.title, body)

  overlay.querySelectorAll('.typ-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-value')
      const parsed = /^=/.test(raw) ? raw : Number(raw)
      const resolved = resolveValue(parsed, targetPath)

      if (!resolved.ok) {
        const err = overlay.querySelector('.modal-err')
        err.textContent =
          resolved.error || spec.requires?.message || 'That value could not be applied.'
        err.hidden = false
        return
      }

      applyValue(targetPath, resolved.value)
      closeModal()
    })
  })
}

function formatOption(value, unit) {
  if (typeof value === 'string' && value.startsWith('=')) {
    const m = /^=([\d.]+)\*/.exec(value)
    return m ? `${Math.round(Number(m[1]) * 100)}%` : value
  }
  if (unit === 'years') return `${value} yr`
  if (unit && unit.startsWith('$')) {
    return value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
  }
  return String(value)
}

/** Write the chosen value into the scenario and flash the field it landed in. */
function applyValue(path, value) {
  setPath(getScenario(), path, value)
  notify()

  // CSS.escape is unavailable in some older WebViews; paths only ever contain
  // word characters and dots, so a plain attribute match is safe.
  const escaped = globalThis.CSS?.escape ? CSS.escape(path) : path
  const input = document.querySelector(`[data-path="${escaped}"]`)
  if (!input) return
  input.value = value
  input.classList.remove('flash')
  void input.offsetWidth // restart the animation
  input.classList.add('flash')
  input.focus()
}
