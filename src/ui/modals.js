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
import { applyUnitLabels } from './enterprise.js'

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
        <div class="modal-head-row">
          <h2 class="modal-title" id="modalTitle"></h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <!-- In the HEAD, which does not scroll, because this is raised in answer
             to a tap on an option that may be a long way down a long list. At
             the foot of the body it was written to a part of the modal the
             producer was not looking at: they tapped a figure, nothing appeared
             to happen, and the sentence saying why was off the bottom of the
             screen. aria-live because it appears without the focus moving. -->
        <p class="modal-err" role="status" aria-live="polite" hidden></p>
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
  // The error lives in the head now, so it outlives the body it was raised
  // about. Every modal opens with it cleared.
  const err = el.querySelector('.modal-err')
  err.textContent = ''
  err.hidden = true
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

  // More than a handful of groups is a scrolling problem on a phone, and the
  // Custom Hire list has four. Fold them; leave a short list alone.
  const fold = shown.length > 2

  // A spec may quote its groups in DIFFERENT units. Phosphorus is published
  // both as a price per pound and as a cost per acre, and both are worth
  // offering: the per-pound figure leaves the rate to the producer's soil test,
  // the per-acre one answers the question in one tap. Neither is the "real"
  // one, so `unit` and `appliesTo` resolve per group and fall back to the spec.
  const mixed = shown.some((g) => unitOf(g, spec) !== spec.unit)

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
  // ONE copy of this, in the head, and only once the producer tries to pick.
  // `spec.requires.message` is also what `.modal-err` says when a value cannot
  // be applied, so rendering it here as well put the same sentence on screen
  // twice — once at the top of the body and once in the head — and the two
  // copies were saying it about the same tap.
  //
  // The head is the one kept: it is raised in answer to something the producer
  // actually did, and it cannot scroll away.
  const acresNote =
    /\*acres$/.test(String(shown[0]?.options?.[0]?.value ?? '')) && totalAcres() > 0
      ? `<p class="modal-note">Your acres: <b>${totalAcres()}</b>. Whichever figure you pick is
           multiplied by that and entered as a total for the year.</p>`
      : ''

  const body = `
    ${
      // When the groups disagree, one banner at the top cannot be true of all
      // of them, so each group states its own unit instead.
      mixed
        ? `<p class="modal-unit">These figures are quoted two ways. Each is indicated in the dropdown title and units.</p>`
        : spec.unit
          ? `<p class="modal-unit">Figures below are <b>${esc(spec.unit)}</b></p>`
          : ''
    }
    ${acresNote}
    ${spec.note ? `<p class="modal-note">${esc(spec.note)}</p>` : ''}
    ${provisional}
    ${search}
    ${shown.map((g) => renderGroup(g, spec, fold, line, mixed)).join('')}
    ${
      spec.source
        ? `<p class="modal-source">Source: ${esc(spec.source)}</p>`
        : `<p class="modal-source">No published source. See the note above.</p>`
    }
`

  openModal(spec.title, body)
  if (search) wireSearch()

  overlay.querySelectorAll('.typ-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Which box this lands in is decided by the OPTION's own group, not once
      // for the whole modal. In a mixed picker the button above this one can be
      // a price per pound while this one is a cost per acre, and writing a
      // per-acre figure into the cost-per-unit box would be multiplied by the
      // rate a second time.
      const appliesTo = btn.getAttribute('data-applies-to') || spec.appliesTo || ''
      const needsMode = switchesMode(appliesTo, line)
      const destination = line
        ? boxFor(needsMode ? appliesTo : line.mode, line)
        : targetPath

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
      // The GROUP's unit, not the spec's: a mixed picker quotes one list per
      // pound and the next per acre, and only the list actually chosen from
      // says what the units/acre box is counting.
      markQuotedUnitLabel(destination, btn.getAttribute('data-unit'))

      if (needsMode) {
        setPath(getScenario(), line.modePath, appliesTo)
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
/**
 * Remember the NOUN a per-unit figure was quoted in, for the units/acre box.
 *
 * The second box of a `$/unit` line asks "how many of them per acre?", and until
 * a figure has been chosen nothing in the app knows what "them" is — the line's
 * own `unitHint` was a guess, and a wrong guess reads as fact. A spec does know:
 * nitrogen is quoted `$/lb of N`, hauling `$/bu`. The first word after the `$/`
 * is that noun.
 *
 * Cosmetic, unlike the other three markers: it changes a placeholder and never a
 * value, so a stale one costs a wrong word rather than a wrong number. It is
 * still released when the producer types their own cost over the top, for the
 * same reason the others are — the app should not go on describing a figure that
 * is no longer the one it wrote.
 */
function markQuotedUnitLabel(destination, unit) {
  if (!destination || !/\.costPerUnit$/.test(destination)) return
  const noun = /^\$\/(\S+)/.exec(String(unit ?? ''))?.[1]
  if (!noun) return
  setPath(getScenario(), destination.replace(/\.costPerUnit$/, '.typicalUnitLabel'), noun)

  // Written straight onto the boxes, the way applyValue() writes the value.
  // Choosing a figure in the mode the line is already in is not a structural
  // change and does not re-render, so the labels would otherwise keep saying
  // "unit" until something else rebuilt the card.
  applyUnitLabels(document, destination.replace(/\.costPerUnit$/, ''), noun)
}

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

/** The unit a group's figures are in — its own, or the spec's. */
function unitOf(group, spec) {
  return group.unit ?? spec.unit
}

/** The entry mode a group's figures belong in — its own, or the spec's. */
function appliesToOf(group, spec) {
  return group.appliesTo ?? spec.appliesTo ?? ''
}

/**
 * How an entry mode reads in a sentence.
 *
 * Every mode is named. This used to be a two-way ternary, which quietly
 * described a line set to "population" as "$/unit × units" — a warning about a
 * mismatch that misnames one of the two things it is comparing is worse than no
 * warning, because it is the sentence a producer would rely on to decide.
 */
// These have to read as the labels on the pill, because the sentence is telling
// a producer to look at that pill. "$/acre" here against "$/ac" on the segment
// is one more thing to reconcile in a warning whose whole job is to stop a
// figure landing in the wrong box.
const MODE_NAMES = {
  perAcre: '$/ac',
  unit: '$/unit × units',
  population: 'seeds/ac',
  total: 'total',
}

function modeName(mode) {
  return MODE_NAMES[mode] ?? MODE_NAMES.unit
}

/** Which of a line's boxes holds the figure a given entry mode asks for. */
function boxFor(mode, line) {
  if (mode === 'perAcre') return line.perAcreTarget
  if (mode === 'population') return line.populationTarget
  return line.unitTarget
}

/**
 * Whether choosing from this list has to change the line's entry mode.
 *
 * A list quoted per unit of seed is quoting a cost per BAG, and `seeds/ac` mode
 * already has a box for exactly that: `costPerBag`, the same number in the same
 * units as `costPerUnit`. So a seed price is at home in either mode, and
 * switching would not merely be unnecessary — it would hide the population the
 * producer has already entered, leaving a figure stored where nothing on screen
 * says it went. Every other mismatch still switches, because there the two
 * modes hold genuinely different quantities.
 */
function switchesMode(appliesTo, line) {
  if (!line || !appliesTo || appliesTo === line.mode) return false
  if (appliesTo === 'unit' && line.mode === 'population' && line.populationTarget) return false
  return true
}

function renderGroup(g, spec, fold, line, mixed) {
  const unit = unitOf(g, spec)
  const appliesTo = appliesToOf(g, spec)

  const options = g.options
    .map(
      (o) => `
    <button type="button" class="typ-option" data-value="${esc(o.value)}"
      data-applies-to="${esc(appliesTo)}" data-unit="${esc(unit ?? '')}">
      <span class="typ-value">${esc(formatOption(o.value, unit))}</span>
      <span class="typ-label">${esc(o.label)}</span>
      ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}
    </button>`
    )
    .join('')

  // A $/bushel figure belongs in the "cost per unit" box, a $/acre figure in
  // the "$ per acre" box. Rather than hide the offer or write to the wrong box,
  // say so plainly and switch the line's mode when a value is chosen.
  //
  // This sits per GROUP rather than once at the top, because in a mixed picker
  // the answer differs between one list and the next: with the line set to
  // $/unit, the price-per-pound list needs no warning and the cost-per-acre
  // list below it does.
  const modeNote =
    switchesMode(appliesTo, line)
      ? `<p class="modal-warn">This list is <b>${esc(unit)}</b> and the line is set to
           <b>${esc(modeName(line.mode))}</b>. Picking one below switches the line to
           <b>${esc(modeName(appliesTo))}</b> and fills it in.</p>`
      : ''

  // Only when the groups disagree. On a single-unit spec the banner at the top
  // already said it, and repeating it over every group is noise.
  const unitLine =
    mixed && unit ? `<p class="typ-group-unit">Quoted in <b>${esc(unit)}</b></p>` : ''

  if (!fold) {
    return `<div class="typ-group">
      <div class="typ-group-label">${esc(g.label)}</div>${unitLine}${modeNote}${options}
    </div>`
  }
  // Every fold starts SHUT, including the first. Same rule openInfo() holds for
  // a card's definitions: when a modal opens folded, the list of headings is
  // itself the answer to "what is on offer here?", and one group left open
  // pushes the rest below the fold on a phone so the list stops being a list.
  return `<details class="typ-group typ-fold">
    <summary class="typ-group-label">${esc(g.label)}</summary>${unitLine}${modeNote}${options}
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
  // A bare count still needs separators. The seeds-per-unit picker offers
  // 80,000 and 140,000, and "80000" beside "140000" on two buttons is two
  // strings a producer has to count the digits of to tell apart.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US')
  }
  return String(value)
}

/** Write the chosen value into the scenario and flash the field it landed in. */
function applyValue(path, value) {
  setPath(getScenario(), path, value)

  // Choosing a seeds-per-unit figure here makes it the PRODUCER'S, so the marker
  // saying the app filled that box goes. It is written programmatically, which
  // fires no `input` event, so the listener that normally releases the marker on
  // a keystroke never runs — and without this the caption goes on crediting the
  // Crop field for a number the producer picked, and the next edit to that field
  // overwrites their 140,000 with corn's 80,000.
  if (/\.seedsPerBag$/.test(path)) {
    setPath(getScenario(), path.replace(/\.seedsPerBag$/, '.seedsPerBagAuto'), '')
  }

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
