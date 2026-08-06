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
    if (!overlay.classList.contains('open')) return
    if (e.key === 'Escape') {
      closeModal()
      return
    }
    if (e.key === 'Tab') trapFocus(e)
  })
  document.body.appendChild(overlay)
  return overlay
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Keep Tab inside the dialog while it is open.
 *
 * The overlay claims `aria-modal="true"`, and without this that claim is simply
 * false: Tab walks straight out of the panel into the budget form behind it,
 * which is still live and still announced. A producer using a screen reader
 * would be told they are in a dialog and then find themselves editing seed cost.
 */
function trapFocus(e) {
  const focusable = [...overlay.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  } else if (!overlay.contains(document.activeElement)) {
    // Focus escaped some other way — a click on the page behind, say. Pull it back.
    e.preventDefault()
    first.focus()
  }
}

/**
 * Returns the body element so a caller can wire its own controls up.
 *
 * Exported for ui/folders.js, which is the third kind of modal: one that writes
 * to the FOLDER store rather than to a budget. It gets the component and none of
 * the behaviour — the read-only rule for `?` and the one-field rule for "use
 * typical value" are enforced by openInfo() and openTypical() being separate
 * functions, and nothing here weakens that.
 */
export function openModal(title, bodyHtml) {
  const el = ensureOverlay()
  lastFocused = document.activeElement
  el.querySelector('.modal-title').textContent = title
  const body = el.querySelector('.modal-body')
  body.innerHTML = bodyHtml
  body.scrollTop = 0
  el.classList.add('open')
  // The modal scrolls its own body (see .modal-body in styles.css). Freezing the
  // page underneath stops a scroll gesture that runs past the end of the modal
  // from carrying on into the budget behind it and losing the producer's place.
  document.body.classList.add('modal-open')
  el.querySelector('.modal-close').focus()
  return body
}

export function closeModal() {
  if (!overlay) return
  overlay.classList.remove('open')
  overlay.querySelector('.modal-body').innerHTML = ''
  document.body.classList.remove('modal-open')
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

  // A card's `?` opens several definitions at once — the fixed-costs one opens
  // seven. Flat, that is four screens of prose to scroll past to reach the term
  // you actually tapped for. Folded, it is a list of terms you pick from, and
  // all of them start shut so the list is the first thing you see.
  //
  // A single definition is not a list, so it stays open: folding one heading
  // would mean tapping `?` and then tapping again to read the answer.
  const fold = entries.length > 1

  const html = entries
    .map((d) => {
      const paras = d.body.map((p) => `<p>${esc(p)}</p>`).join('')
      return fold
        ? `<details class="def def-fold">
             <summary>${esc(d.title)}</summary>
             <div class="def-fold-body">${paras}</div>
           </details>`
        : `<section class="def">
             <h3>${esc(d.title)}</h3>
             ${paras}
           </section>`
    })
    .join('')

  openModal(title || entries[0].title, html)
}

/**
 * Free-form explanatory content — same read-only modal component.
 * A section may carry prose, a numbered list, or both; all three are valid.
 *
 * `collapsible` renders each section as a native <details>, closed by default.
 * A long guide opened on a phone is otherwise a wall of text you have to scroll
 * past to find the one heading you wanted. <details> is used rather than a
 * hand-rolled accordion because the browser already gives it keyboard support,
 * the right ARIA semantics, and — importantly for the Print action — the
 * ability to be forced open by CSS.
 */
export function openGuide(title, sections, { collapsible = false, firstOpen = false } = {}) {
  const html = sections
    .map((s, i) => {
      const inner = `
        ${(s.body ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}
        ${
          s.steps?.length
            ? `<ol>${s.steps.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>`
            : ''
        }`

      if (!collapsible || !s.heading) {
        return `<section class="def">
          ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}${inner}
        </section>`
      }

      return `<details class="def def-fold"${firstOpen && i === 0 ? ' open' : ''}>
        <summary>${esc(s.heading)}</summary>
        <div class="def-fold-body">${inner}</div>
      </details>`
    })
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
  const base = fieldName === 'acres' ? totalAcres() : sibling(targetPath, fieldName)

  if (!Number.isFinite(base) || base === 0) {
    return { ok: false, error: null } // caller shows the field's own `requires` message
  }
  return { ok: true, value: Number((Number(factor) * base).toFixed(2)), base }
}

function sibling(targetPath, fieldName) {
  const parentPath = targetPath.split('.').slice(0, -1).join('.')
  const path = parentPath ? `${parentPath}.${fieldName}` : fieldName
  return Number(getPath(getScenario(), path))
}

/**
 * `acres` is the one sentinel base that is NOT a sibling field.
 *
 * Overhead is published per acre but entered here as a whole-farm amount, so a
 * $6.11/acre utilities figure has to be multiplied by the farm before it means
 * anything. The multiplier lives across every enterprise rather than next to the
 * field, which is why it cannot go through sibling().
 *
 * Summed with Number() and a finite guard rather than calc.js's num(), because
 * this module must not import the model — the same rule that keeps calc.js free
 * of the DOM. A blank or nonsense acreage contributes nothing, and a farm with
 * no acres at all falls through to the field's own `requires` message.
 */
function totalAcres() {
  const list = getScenario()?.enterprises
  if (!Array.isArray(list)) return 0
  let total = 0
  for (const e of list) {
    const acres = Number(String(e?.acres ?? '').replace(/[$\s,]/g, ''))
    if (Number.isFinite(acres) && acres > 0) total += acres
  }
  return total
}

/**
 * Open the picker for one field.
 *
 * @param {string} typicalKey  key into TYPICAL_VALUES
 * @param {string} targetPath  scenario path the chosen value is written to
 * @param {string} category    optional item category, to filter the options
 * @param {object} [line]      for a variable expense line: its entry mode and
 *                             the two paths it could write to. A line set to
 *                             $/acre and a list quoted in $/bushel disagree
 *                             about what the number means, and applying one to
 *                             the other silently produces a wrong budget.
 * @param {object} [basis]     for an overhead line: `{ path, provenancePath }`.
 *                             `path` is the period select, moved to match the
 *                             spec; `provenancePath` records what it was moved
 *                             to, so main.js can clear the figure if the period
 *                             is later changed to something the figure is not.
 */
export function openTypical(typicalKey, targetPath, category = '', line = null, basis = null) {
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

  // A $/bushel figure belongs in the "cost per unit" box, a $/acre figure in
  // the "$ per acre" box. Rather than hide the link or write to the wrong box,
  // say so plainly and switch the line's mode when a value is chosen.
  const needsMode = line && spec.appliesTo && spec.appliesTo !== line.mode
  const modeNote = needsMode
    ? `<p class="modal-warn">These figures are <b>${esc(spec.unit)}</b>. This line is set to
         <b>${esc(line.mode === 'perAcre' ? '$/acre' : '$/unit × units')}</b> — picking one
         below will switch the line to <b>${esc(
           spec.appliesTo === 'perAcre' ? '$/acre' : '$/unit × units'
         )}</b> and fill it in.</p>`
    : ''

  // Where the value lands, once the mode question is settled.
  const destination = line
    ? (spec.appliesTo || line.mode) === 'perAcre'
      ? line.perAcreTarget
      : line.unitTarget
    : targetPath

  // More than a handful of groups is a scrolling problem on a phone, and the
  // Custom Hire list has four. Fold them; leave a short list alone.
  const fold = shown.length > 2

  // A list long enough to need scrolling needs a way to skip the scrolling.
  // Land rent is 137 counties across three groups; finding yours by eye means
  // opening each fold and reading down it.
  const search = spec.searchPlaceholder
    ? `<div class="typ-search">
         <label class="sr-only" for="typSearch">${esc(spec.searchPlaceholder)}</label>
         <input id="typSearch" type="search" class="typ-search-input" autocomplete="off"
           placeholder="${esc(spec.searchPlaceholder)}" />
         <p class="typ-search-empty" hidden>Nothing matches that.</p>
       </div>`
    : ''

  // A figure that is about to be multiplied by the farm must say so BEFORE it is
  // chosen. "$6.11" and "$4,203 a year" are the same decision, but only the
  // second one is the number that lands in the box, and a producer who sees
  // $6.11 on the button and $4,203 in the field is entitled to think something
  // went wrong.
  const acresNote = /\*acres$/.test(String(shown[0]?.options?.[0]?.value ?? ''))
    ? totalAcres() > 0
      ? `<p class="modal-note">Your acres: <b>${totalAcres()}</b>. Whichever figure you pick is
           multiplied by that and entered as a total for the year.</p>`
      : `<p class="modal-warn">${esc(
          spec.requires?.message || 'Enter your acres first.'
        )}</p>`
    : ''

  const body = `
    ${spec.unit ? `<p class="modal-unit">Figures below are <b>${esc(spec.unit)}</b></p>` : ''}
    ${acresNote}
    ${modeNote}
    ${spec.note ? `<p class="modal-note">${esc(spec.note)}</p>` : ''}
    ${provisional}
    ${search}
    ${shown.map((g, i) => renderGroup(g, spec, fold, i === 0)).join('')}
    ${
      spec.source
        ? `<p class="modal-source">Source: ${esc(spec.source)}</p>`
        : `<p class="modal-source">No published source. See the note above.</p>`
    }
    <p class="modal-err" hidden></p>`

  openModal(spec.title, body)
  if (search) wireSearch()

  overlay.querySelectorAll('.typ-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-value')
      const parsed = /^=/.test(raw) ? raw : Number(raw)
      const resolved = resolveValue(parsed, destination)

      if (!resolved.ok) {
        const err = overlay.querySelector('.modal-err')
        err.textContent =
          resolved.error || spec.requires?.message || 'That value could not be applied.'
        err.hidden = false
        return
      }

      markQuotedUnit(destination, spec)

      if (needsMode) {
        setPath(getScenario(), line.modePath, spec.appliesTo)
        setPath(getScenario(), destination, resolved.value)
        closeModal()
        // Switching modes swaps which inputs exist, so this needs a structural
        // re-render. Announced rather than called directly, to keep this module
        // free of any dependency on main.js.
        //
        // The constructor comes from the document's own window, not the global.
        // Node has its own CustomEvent, and a synthetic document will reject an
        // event built from a different realm's class.
        const View = document.defaultView ?? globalThis
        document.dispatchEvent(
          new View.CustomEvent('fb:rerender', { detail: { flash: destination } })
        )
        return
      }

      // An annualised figure landing in a line still set to "$ / month" would be
      // multiplied by twelve by calcFixed(). The spec says what period its
      // figures are for, and the line is moved to match — and the move is
      // recorded, because moving it BACK afterwards reopens the same hole.
      if (spec.basis && basis?.path) {
        setPath(getScenario(), basis.path, spec.basis)
        const select = document.querySelector(`[data-path="${basis.path}"]`)
        if (select) select.value = spec.basis
        if (basis.provenancePath) setPath(getScenario(), basis.provenancePath, spec.basis)
      }

      applyValue(destination, resolved.value)
      closeModal()
    })
  })
}

/**
 * Remember which yield unit a chosen figure was quoted against.
 *
 * Hauling is published in $/bushel and drying in $/point per bushel. Both are
 * only that figure while the enterprise is measured in bushels: switch the unit
 * to tons and $0.14 a bushel silently becomes $0.14 a ton, off by roughly the
 * weight of a ton of corn, with a perfectly ordinary-looking number on screen.
 *
 * The marker is stored on the line rather than held in memory because the
 * mismatch outlives the session — a budget saved in bushels and reopened a week
 * later can still have its unit changed. main.js clears the figure when that
 * happens; without this it has no way to know the number came from a table
 * quoted in something else.
 */
function markQuotedUnit(destination, spec) {
  if (!spec.quotedPerYieldUnit || !destination) return
  const linePath = destination.split('.').slice(0, -1).join('.')
  if (!linePath) return
  setPath(getScenario(), `${linePath}.typicalYieldUnit`, spec.quotedPerYieldUnit)
}

/**
 * Filter the open picker as the producer types.
 *
 * Matching is on the option's own label, which is the county name here. A group
 * with no matches is hidden entirely rather than left as an empty heading, and a
 * folded group holding a match is forced open — otherwise a search for "Brown"
 * would appear to find nothing while the row sat inside a closed fold.
 *
 * Clearing the box restores the original open/shut state, so a search that turns
 * up nothing useful does not leave all three hundred rows unfolded.
 */
function wireSearch() {
  const box = overlay.querySelector('.typ-search-input')
  const empty = overlay.querySelector('.typ-search-empty')
  const groups = [...overlay.querySelectorAll('.typ-group')]
  const wasOpen = new Map(groups.map((g) => [g, g.open]))

  box.addEventListener('input', () => {
    const q = box.value.trim().toLowerCase()
    let hits = 0

    for (const group of groups) {
      let shown = 0
      for (const opt of group.querySelectorAll('.typ-option')) {
        const label = opt.querySelector('.typ-label')?.textContent ?? ''
        const match = !q || label.toLowerCase().includes(q)
        opt.hidden = !match
        if (match) shown += 1
      }
      group.hidden = shown === 0
      hits += shown
      // `open` only exists on <details>; on a plain div it is simply ignored.
      if (q) group.open = shown > 0
      else group.open = wasOpen.get(group)
    }

    empty.hidden = hits > 0
  })
}

function renderGroup(g, spec, fold, openFirst) {
  const options = g.options
    .map(
      (o) => `
    <button type="button" class="typ-option" data-value="${esc(o.value)}">
      <span class="typ-value">${esc(formatOption(o.value, spec.unit))}</span>
      <span class="typ-label">${esc(o.label)}</span>
      ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}
    </button>`
    )
    .join('')

  if (!fold) {
    return `<div class="typ-group">
      <div class="typ-group-label">${esc(g.label)}</div>${options}
    </div>`
  }
  return `<details class="typ-group typ-fold"${openFirst ? ' open' : ''}>
    <summary class="typ-group-label">${esc(g.label)}</summary>${options}
  </details>`
}

/**
 * The number as it will read on the button.
 *
 * The unit suffix matters: "$0.14" and "$0.14 /bu" are the same number but only
 * the second one tells a producer whether it is about to be multiplied by their
 * bushels or by their acres.
 */
function formatOption(value, unit) {
  if (typeof value === 'string' && value.startsWith('=')) {
    const m = /^=([\d.]+)\*(\w+)$/.exec(value)
    if (!m) return value
    // A SHARE of a sibling field reads as a percentage: 0.25 of what you paid
    // for a tractor is "25%". A RATE multiplied by acres does not. $6.11 an
    // acre of utilities rendered as "611%" is not a small cosmetic slip; it is
    // a different quantity, and there is nothing on the button to say so.
    if (m[2] === 'acres') return formatFigure(Number(m[1]), unit)
    return `${Math.round(Number(m[1]) * 100)}%`
  }
  return formatFigure(value, unit)
}

function formatFigure(value, unit) {
  if (unit === 'years') return `${value} yr`
  if (unit && unit.startsWith('$')) {
    const money = value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
    const per = /^\$\s*\/\s*([^\s(]+)/.exec(unit)
    return per ? `${money} /${per[1]}` : money
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
