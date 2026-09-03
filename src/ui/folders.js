/**
 * Folders on the Saved tab.
 *
 * A folder is a collapsible SECTION in the existing list, not a screen you
 * navigate into. There is no "inside a folder" and no back button, for three
 * reasons and the first one is decisive:
 *
 *  - Compare would break. `compare-selected` reads [data-compare-id]:checked off
 *    the document, so the selection lives in the DOM and navigating away throws
 *    it out. "Compare my 2025 corn against my 2026 corn" is the most valuable
 *    thing the Saved tab does and it has to keep working across folders.
 *  - With every row on one page the visible top-to-bottom order is still a valid
 *    global order, so the reorder code keeps working.
 *  - Folding is the idiom this app already uses everywhere else.
 *
 * This module owns the glyphs, the palette, the section markup and the two
 * modals. It talks to storage.js and to the modal component, and to nothing
 * else — main.js passes a callback in rather than being imported.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TO CHANGE WHAT THE FOLDER EDITOR OFFERS
 *
 *   Another icon    add one entry to PATHS below (24-unit box, stroke only, no
 *                   fills) and one to ICON_LABELS. FOLDER_ICONS derives itself
 *                   from PATHS, so there is nothing else to update.
 *
 *   Another colour  add the key to FOLDER_COLORS and COLOR_LABELS below, THEN
 *                   add three things to styles.css: `--fld-<key>` and
 *                   `--fld-<key>-bg` in `:root`, the same pair under
 *                   `[data-theme="dark"]`, and a `.fld-c-<key>` class in the
 *                   folders block that maps them onto `--fld-ink` / `--fld-wash`.
 *                   A key with no class renders with no colour at all, which is
 *                   the one failure here that nothing warns you about.
 *
 * Keep the two lists the SAME LENGTH. The editor lays them out as two rows of
 * the same width, and they read as a matched pair; twelve and nine would look
 * like one of them had failed to load.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { esc } from './format.js'
import { openModal, closeModal } from './modals.js'
import {
  listFolders,
  listScenarios,
  saveFolder,
  deleteFolder,
  moveScenarioToFolder,
} from '../storage.js'

/* ─────────────────────────── icons ─────────────────────────────────────── */

/**
 * Inline SVG, never emoji, and the reason is already written down in prefs.js:
 * emoji render at wildly different sizes and colours across platforms, and on
 * Windows several come out as flat monochrome glyphs that read as smudges. A row
 * of eight emoji folder icons on Windows, Android and iOS is three
 * different-looking apps, and one of them is worse.
 *
 * Same drawing rules as the theme toggle: 24-unit box, `stroke="currentColor"`,
 * no fills. `currentColor` is what lets one glyph carry any of the eight
 * colours, so there is no per-colour asset and nothing to keep in step.
 *
 * Twelve of them, chosen to cover what a producer actually files by: a default,
 * a growing crop, a harvested crop, the yard, a season, money, a place, a
 * favourite, machinery, water, hauling, and a comparison.
 */
const PATHS = {
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  sprout:
    '<path d="M7 21h10"/><path d="M12 21V9"/>' +
    '<path d="M12 9C12 5.7 9.3 3 6 3c0 3.3 2.7 6 6 6z"/>' +
    '<path d="M12 13c0-2.8 2.2-5 5-5 0 2.8-2.2 5-5 5z"/>',
  wheat:
    '<path d="M12 22V10"/>' +
    '<path d="M12 10c0-2.4-1.5-4.3-3.8-4.8C8.2 7.6 9.7 9.5 12 10z"/>' +
    '<path d="M12 10c0-2.4 1.5-4.3 3.8-4.8C15.8 7.6 14.3 9.5 12 10z"/>' +
    '<path d="M12 15.5c0-2.4-1.5-4.3-3.8-4.8C8.2 13.1 9.7 15 12 15.5z"/>' +
    '<path d="M12 15.5c0-2.4 1.5-4.3 3.8-4.8C15.8 13.1 14.3 15 12 15.5z"/>',
  barn: '<path d="M3 10 12 3l9 7v11H3z"/><path d="M9 21v-7h6v7"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
    '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/>',
  dollar:
    '<line x1="12" y1="1" x2="12" y2="23"/>' +
    '<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  field: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3"/>',
  tractor:
    '<circle cx="7" cy="17" r="4"/><circle cx="18" cy="18" r="3"/>' +
    '<path d="M7 13V6h4l2.5 6H21v3"/><path d="M4 9h3"/>',
  droplet: '<path d="M12 2.7 6.9 7.8a7.2 7.2 0 1 0 10.2 0z"/>',
  truck:
    '<rect x="1" y="6" width="13" height="10" rx="1"/>' +
    '<path d="M14 9h4l3 3.5V16h-7z"/>' +
    '<circle cx="6" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>',
  chart:
    '<line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="11" width="4" height="7"/>' +
    '<rect x="11" y="7" width="4" height="11"/><rect x="17" y="14" width="4" height="4"/>',
}

export const FOLDER_ICONS = Object.keys(PATHS)

/** Plain words, because these label the buttons for anyone not seeing them. */
const ICON_LABELS = {
  folder: 'Folder',
  sprout: 'Growing crop',
  wheat: 'Harvested crop',
  barn: 'Barn',
  calendar: 'Season or year',
  dollar: 'Money',
  field: 'Field location',
  star: 'Favorite',
  tractor: 'Machinery',
  droplet: 'Water',
  truck: 'Hauling',
  chart: 'Comparison',
}

/**
 * An unrecognised key falls back to the plain folder rather than to nothing and
 * rather than to a crash — the same rule as perYearFactor() returning 1 for a
 * basis it does not know. This is the state after a hand-edited file, and after
 * a future version of the app writes a glyph this one has never heard of.
 */
export function folderIcon(key, size = 16) {
  const paths = PATHS[key] || PATHS.folder
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

/* ─────────────────────────── colours ───────────────────────────────────── */

/**
 * Twelve swatches: a walk round the wheel with PINK in place of red, closing on
 * two neutrals.
 *
 * Red is the one colour that is not on offer, and that is not squeamishness. The
 * palette in styles.css is semantic and load-bearing — `--green` means a
 * positive dollar figure and `--cost` a negative one — so a red folder mark on
 * the Saved tab, a page whose every row prints a profit or a loss, re-opens the
 * exact question the palette exists to settle. Pink sits next to red on the
 * wheel and carries none of that.
 *
 * These are all their OWN values, including the blue and the green. Earlier they
 * borrowed `--sky` and `--olive`, which cost no new tokens but tied a folder's
 * colour to the app's chrome: a sky folder was the same blue as every `?` button
 * and every KPI edge, and an olive one the same as every section rule. A folder
 * colour is a label a producer chose, so it should not read as part of the
 * furniture, and it should not shift if the brand ever does.
 *
 * The colour appears on the section header and nowhere else. Rows are never
 * tinted by folder — fifteen rows in twelve colours next to fifteen profit
 * figures is the same collision by another route.
 */
export const FOLDER_COLORS = [
  'pink',
  'magenta',
  'violet',
  'indigo',
  'blue',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'slate',
  'grey',
]

const COLOR_LABELS = {
  pink: 'Pink',
  magenta: 'Magenta',
  violet: 'Violet',
  indigo: 'Indigo',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  lime: 'Lime',
  yellow: 'Yellow',
  orange: 'Orange',
  slate: 'Slate',
  // The KEY stays `grey` and only the label changes. Keys are stored in
  // producers' browsers; renaming one would leave every folder already using it
  // pointing at a colour that no longer exists. It falls back rather than
  // crashing, so nothing would break — a grey folder would just quietly stop
  // being the swatch the producer picked, which is worse than an inconsistency
  // nobody but us can see.
  grey: 'Gray',
}

/** Same fallback rule as the glyph, and the same reasons. */
export function folderColor(key) {
  return FOLDER_COLORS.includes(key) ? key : 'grey'
}

/* ─────────────────────────── section markup ────────────────────────────── */

/**
 * The mark at the head of a section: the glyph, in the folder's colour, on a
 * tint of it.
 *
 * Colour is NEVER the only signal. The folder's name is always rendered beside
 * this, in ordinary text, so a producer who cannot tell the swatches apart loses
 * decoration and no information at all — which is the whole test of whether
 * colour was doing a job it should not have been doing.
 */
export function folderChip(folder) {
  return `<span class="fld-chip fld-c-${esc(folderColor(folder?.color))}" aria-hidden="true">
    ${folderIcon(folder?.icon)}
  </span>`
}

function countLabel(n) {
  return `${n} budget${n === 1 ? '' : 's'}`
}

/**
 * One section: a header that folds it, and the rows.
 *
 * @param {object|null} folder  null renders the "Not in a folder" pile, which
 *   has a chevron and a count and no controls — there is nothing to rename,
 *   recolour, reorder or delete about the absence of a folder.
 * @param {string} rowsHtml
 * @param {boolean} open
 * @param {number} index  position among the folders, and `total` how many there
 *   are, so the arrows grey out at the ends. Folders are arranged by arrow only:
 *   dragging them would be a third drag implementation on a page that already
 *   carries two, for a list that is five items long.
 * @param {boolean} headed  false renders the rows with NO heading at all. Only
 *   the ungrouped pile ever asks for this, and only on a device with no folders:
 *   "Not in a folder" over the whole list, with nothing to contrast it against,
 *   is a fold to open and a label that answers a question nobody has asked. The
 *   section element and the list stay, so the drag, filter and reorder code all
 *   see the structure they always see — the heading is the only thing missing.
 */
export function renderFolderSection(folder, rowsHtml, count, open, index = 0, total = 1, headed = true) {
  const id = folder?.id ?? ''
  const name = folder ? folder.name || 'Untitled folder' : 'Not in a folder'

  const controls = folder
    ? `<span class="fld-btns">
         <button type="button" class="tip" data-action="edit-folder" data-id="${esc(id)}">Edit folder</button>
         <button type="button" class="scn-move" data-action="move-folder-up" data-id="${esc(id)}"
           ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(name)} up">▲</button>
         <button type="button" class="scn-move" data-action="move-folder-down" data-id="${esc(id)}"
           ${index === total - 1 ? 'disabled' : ''} aria-label="Move ${esc(name)} down">▼</button>
       </span>`
    : ''

  // An empty section says what to do about it. One that is simply blank reads as
  // a folder whose contents failed to load. The empty pile is the other half of
  // the same sentence: it is the place a budget comes back OUT to, and it is on
  // screen for that reason even when nothing is in it.
  const empty = `<p class="hint fld-empty"${count ? ' hidden' : ''}>
      ${
        folder
          ? 'No budgets in this folder yet. Use <b>Move</b> on any budget to file it here.'
          : 'Every budget is filed. Use <b>Move</b>, or drag one here, to take it back out of a folder.'
      }
    </p>`

  // The colour class goes on the SECTION as well as on the chip, because the
  // custom properties it sets are read by the list's left edge too. The chip
  // keeps its own copy for the places it appears outside a section — the Move
  // modal's radio list, and the folder editor.
  const tone = folder ? ` fld-c-${esc(folderColor(folder.color))}` : ''

  // The chevron span is EMPTY on purpose. `.chev` draws the caret itself, from
  // two borders of a box rotated 45 degrees, so a ▾ placed inside it as well
  // rendered a second and much larger caret underneath the real one. Which way
  // it points is read off aria-expanded in styles.css: one source of truth, and
  // nothing for JS to keep in step.
  const head = headed
    ? `<header class="fld-head">
         <button type="button" class="fld-toggle" data-action="toggle-folder" data-id="${esc(id)}"
           aria-expanded="${open}">
           <span class="chev fld-chev" aria-hidden="true"></span>
           ${folder ? folderChip(folder) : ''}
           <span class="fld-name">${esc(name)}</span>
           <span class="fld-count" data-fld-count="${esc(id)}">${countLabel(count)}</span>
         </button>
         ${controls}
       </header>`
    : ''

  // A headless section is always open — there is no heading to reopen it from.
  const shut = headed && !open

  return `
    <section class="scn-section${tone}${headed ? '' : ' scn-section-bare'}"
      data-scn-section="${esc(id)}">
      ${head}
      <div class="scn-list" data-scn-list data-folder-id="${esc(id)}"${shut ? ' hidden' : ''}>
        ${rowsHtml}
        ${empty}
      </div>
    </section>`
}

/** Kept here so main.js and the section header cannot drift on the wording. */
export function folderCountText(shown, total, filtering) {
  return filtering ? `${shown} of ${countLabel(total)}` : countLabel(total)
}

/* ─────────────────────────── the Move modal ────────────────────────────── */

/**
 * File one budget. A radio list, because a budget is in exactly one folder.
 *
 * This is the PRIMARY control, and dragging a row across a section boundary is
 * the shortcut — the same rule the row arrows already settled against the drag
 * handle. A radio list works by finger, by mouse, by keyboard and by screen
 * reader, and needs no precision and no steady hand.
 *
 * @param {object} scenario  the stored record being filed
 * @param {Function} onDone  called after a successful write
 */
export function openMoveModal(scenario, onDone) {
  const folders = listFolders()
  const current = scenario.folderId ?? ''

  const option = (value, labelHtml, checked) => `
    <label class="fld-option">
      <input type="radio" name="fldTarget" value="${esc(value)}"${checked ? ' checked' : ''} />
      ${labelHtml}
    </label>`

  const body = openModal(
    `Move "${scenario.name || 'this budget'}"`,
    `<div class="fld-options">
       ${option('', '<span class="fld-option-label">Not in a folder</span>', !current)}
       ${folders
         .map((f) =>
           option(
             f.id,
             `${folderChip(f)}<span class="fld-option-label">${esc(f.name || 'Untitled folder')}</span>`,
             f.id === current
           )
         )
         .join('')}
     </div>
     <button type="button" class="tip fld-new">+ New folder…</button>
     <p class="modal-err" hidden></p>
     <div class="modal-actions">
       <button type="button" class="tip fld-cancel">Cancel</button>
       <button type="button" class="btn-main fld-save">Move</button>
     </div>`
  )

  body.querySelector('.fld-cancel').addEventListener('click', closeModal)

  // Creating and filing in one pass, so a folder that does not exist yet is not
  // a reason to close this, go elsewhere, and come back.
  body.querySelector('.fld-new').addEventListener('click', () => {
    openFolderEditor(null, (created) => {
      if (created) {
        // Re-read the budget's own membership rather than assuming: another tab
        // may have moved it while this modal sat open.
        openMoveModal({ ...scenario, folderId: created.id }, onDone)
      } else {
        openMoveModal(scenario, onDone)
      }
    })
  })

  body.querySelector('.fld-save').addEventListener('click', () => {
    const picked = body.querySelector('input[name="fldTarget"]:checked')?.value ?? ''
    const result = moveScenarioToFolder(scenario.id, picked)
    if (!result.ok) {
      showError(body, 'That budget could not be filed. This browser may be out of storage space.')
      return
    }
    closeModal()
    onDone?.(picked)
  })
}

/* ─────────────────────────── the folder editor ─────────────────────────── */

/**
 * Create or edit one folder.
 *
 * Icon and colour are button grids carrying `aria-pressed`, matching how the
 * font control in prefs.js already works — not a native <select>, which cannot
 * show a glyph, and not a colour input, which would hand out the red the palette
 * reserves.
 *
 * @param {object|null} folder  null creates
 * @param {Function} onDone  called with the saved folder, or with null on a
 *   cancel or a delete. Callers use the argument to decide what to select next.
 */
export function openFolderEditor(folder, onDone) {
  const editing = Boolean(folder?.id)
  const draft = {
    icon: folder?.icon && FOLDER_ICONS.includes(folder.icon) ? folder.icon : 'folder',
    color: folderColor(folder?.color),
  }

  const body = openModal(
    editing ? 'Folder' : 'New folder',
    `<div class="fld-field">
       <label class="fld-label" for="fldName">Name</label>
       <input id="fldName" class="fld-name-input" value="${esc(folder?.name ?? '')}"
         placeholder="Corn trials" maxlength="60" />
     </div>

     <div class="fld-field">
       <span class="fld-label">Icon</span>
       <div class="fld-grid" role="group" aria-label="Folder icon">
         ${FOLDER_ICONS.map(
           (key) => `
           <button type="button" class="fld-pick" data-icon="${key}"
             aria-pressed="${key === draft.icon}" title="${esc(ICON_LABELS[key])}"
             aria-label="${esc(ICON_LABELS[key])}">${folderIcon(key, 20)}</button>`
         ).join('')}
       </div>
     </div>

     <div class="fld-field">
       <span class="fld-label">Color</span>
       <div class="fld-grid" role="group" aria-label="Folder color">
         ${FOLDER_COLORS.map(
           (key) => `
           <button type="button" class="fld-pick fld-swatch fld-c-${key}" data-color="${key}"
             aria-pressed="${key === draft.color}" title="${esc(COLOR_LABELS[key])}"
             aria-label="${esc(COLOR_LABELS[key])}"><span class="fld-dot" aria-hidden="true"></span></button>`
         ).join('')}
       </div>
     </div>

     <p class="modal-err" hidden></p>

     <div class="modal-actions">
       ${
         editing
           ? '<button type="button" class="tip danger fld-delete">Delete folder</button>'
           : ''
       }
       <button type="button" class="tip fld-cancel">Cancel</button>
       <button type="button" class="btn-main fld-save">Save</button>
     </div>`
  )

  // A grid of eight is a radio group in everything but markup; aria-pressed is
  // how prefs.js already says which one is on.
  for (const attr of ['icon', 'color']) {
    for (const btn of body.querySelectorAll(`[data-${attr}]`)) {
      btn.addEventListener('click', () => {
        draft[attr] = btn.getAttribute(`data-${attr}`)
        for (const other of body.querySelectorAll(`[data-${attr}]`)) {
          other.setAttribute('aria-pressed', String(other === btn))
        }
      })
    }
  }

  body.querySelector('.fld-cancel').addEventListener('click', () => {
    closeModal()
    onDone?.(null)
  })

  body.querySelector('.fld-save').addEventListener('click', () => {
    const name = body.querySelector('#fldName').value.trim()
    // A folder with no name is a section with no heading, which is a fold you
    // cannot tell from the next one. Asked for rather than filled in, because
    // nothing in this app auto-fills.
    if (!name) {
      showError(body, 'Give the folder a name.')
      body.querySelector('#fldName').focus()
      return
    }
    const result = saveFolder({ ...folder, name, icon: draft.icon, color: draft.color })
    if (!result.ok) {
      showError(body, 'That folder could not be saved. This browser may be out of storage space.')
      return
    }
    closeModal()
    onDone?.(result.folder)
  })

  body.querySelector('.fld-delete')?.addEventListener('click', () => {
    // Says the count and says plainly that nothing is deleted. A producer
    // pressing Delete on a folder has no way to know from the word alone whether
    // the budgets in it go too, and the honest answer has to be in the question.
    const n = listScenarios().filter((s) => s.folderId === folder.id).length
    const holding = n === 0 ? 'It is empty' : `The ${countLabel(n)} in it move back to Not in a folder`
    if (!confirm(`Delete the folder "${folder.name}"?\n\n${holding}. No budget is deleted.`)) {
      return
    }
    const result = deleteFolder(folder.id)
    if (!result.ok) {
      showError(body, 'That folder could not be deleted. This browser may be blocking storage.')
      return
    }
    closeModal()
    onDone?.(null)
  })

  body.querySelector('#fldName').focus()
}

function showError(body, message) {
  const err = body.querySelector('.modal-err')
  err.textContent = message
  err.hidden = false
}
