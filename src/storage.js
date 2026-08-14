/**
 * Scenario persistence — localStorage only.
 *
 * This is a producer's saved work on their own device. Two rules follow from
 * that and neither is negotiable:
 *
 *  1. Every stored scenario carries `schemaVersion`. When the shape changes,
 *     bump SCHEMA_VERSION in calc.js and add a step to `migrate()` below.
 *     Never drop a scenario because it is old.
 *  2. A read that fails must not take the whole list with it. One corrupt
 *     record is skipped, not fatal.
 */

import { SCHEMA_VERSION } from './calc.js'

const KEY = 'sdshc-fb-scenarios'
const KEY_LAST = 'sdshc-fb-last-open'

/**
 * Folders live in their OWN key, never inside a scenario.
 *
 * A folder is metadata about this device's list. It must not travel in an
 * exported budget file, it must not mark a budget dirty, and it has to be
 * readable and writable without touching the scenarios key at all — so that a
 * folders key which fails to parse costs the producer their folders and not one
 * single budget.
 */
const KEY_FOLDERS = 'sdshc-fb-folders'

/**
 * The `updatedAt` we last read or wrote for each scenario, so a save can tell
 * whether someone else changed that record in the meantime.
 *
 * Saving is a read-modify-write of one localStorage key. Within a tab that runs
 * synchronously, so the list itself can't tear — but a producer with the app
 * open in two tabs can still have the second tab save a stale copy over the
 * first tab's work, with nothing on screen to say so. This map is what lets
 * saveScenario() detect that and ask rather than silently clobber.
 *
 * Deliberately module-level and not persisted: a fresh page load has read
 * nothing yet, which is exactly the right starting state.
 */
const lastKnownUpdatedAt = new Map()

/** localStorage throws in Safari private mode and when the quota is full. */
function readKey(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Serialise and store, reporting rather than throwing.
 *
 * The stringify sits INSIDE the guard on purpose. It used to be done at each of
 * the eight call sites, outside every try, so an object carrying a self
 * reference threw "Converting circular structure to JSON" straight out of a
 * module whose whole contract is that it never throws.
 *
 * saveScenario()'s own NotSerializable guard does not cover this and cannot:
 * structuredClone() SUPPORTS cycles, so it accepts the record, and the throw
 * then lands here, one layer past the check that was supposed to catch it. One
 * try around the serialisation is the only place that holds for every writer.
 */
function writeKey(key, value) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    return { ok: false, error: 'NotSerializable' }
  }
  try {
    localStorage.setItem(key, text)
    return { ok: true }
  } catch (err) {
    // QuotaExceededError is the realistic failure: dozens of scenarios, or a
    // browser configured with no storage. The caller must surface this — a
    // silent failure would let a producer keep working on unsaved data.
    return { ok: false, error: err?.name || 'StorageError' }
  }
}

const readRaw = () => readKey(KEY)
const writeRaw = (value) => writeKey(KEY, value)

/**
 * Bring an older stored scenario up to the current shape.
 * Each version gets its own step; steps run in order and fall through.
 */
const isBag = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * The containers the steps below write into, made safe before any of them run.
 *
 * Two separate failures, one fix. `??=` replaces null and undefined and nothing
 * else, so a hand-edited or corrupted file carrying `"fixed": "x"` left the
 * string standing and the next line assigned a property onto a primitive, which
 * is a TypeError in strict mode — thrown out of a module whose contract is that
 * it never throws, and out through an async change handler where it surfaced as
 * nothing happening at all.
 *
 * And this runs OUTSIDE the version steps on purpose. Every step is gated on
 * `version < N`, so a record claiming a version above all of them skips the lot:
 * a backup written by a future build, or one with a made-up number in it,
 * reached the app with no `enterprises` array at all. These are the shape the
 * rest of the app assumes rather than checks, so they cannot be conditional on
 * the version being one we recognise.
 *
 * Replacing an unusable value is not the same as dropping work. A number where
 * the enterprise list belongs is not data anybody can get back, and the record
 * still carries its name, its year and its fixed costs — where the alternative,
 * the caller's `catch`, loses the whole budget.
 */
function normalizeShape(scenario) {
  if (!Array.isArray(scenario.enterprises)) scenario.enterprises = []
  if (!isBag(scenario.fixed)) scenario.fixed = {}
  const fixed = scenario.fixed
  if (!Array.isArray(fixed.equipment)) fixed.equipment = []
  if (!Array.isArray(fixed.buildings)) fixed.buildings = []
  if (!isBag(fixed.annual)) fixed.annual = {}
  if (!isBag(fixed.annualBasis)) fixed.annualBasis = {}
  if (!isBag(fixed.labor)) fixed.labor = {}
  return scenario
}

function migrate(scenario) {
  const version = Number(scenario?.schemaVersion) || 0
  normalizeShape(scenario)

  // v0 → v1: pre-release scenarios had no schemaVersion at all.
  if (version < 1) {
    scenario.schemaVersion = 1
    // Without this, the list sorts on the string "undefined", which compares
    // above any ISO date — an ancient scenario would show up as the newest.
    scenario.createdAt ??= new Date(0).toISOString()
    scenario.updatedAt ??= scenario.createdAt
  }

  // v1 → v2: enterprises gained a name distinct from the crop; labour hours and
  // overhead amounts gained a period basis; the list gained a manual order.
  if (Number(scenario.schemaVersion) < 2) {
    scenario.schemaVersion = 2
    for (const ent of scenario.enterprises) {
      // The crop was the label before v2. Leaving `name` blank keeps that
      // behaviour exactly — enterpriseLabel() falls back to the crop — so an
      // old budget looks identical until someone chooses to rename a column.
      if (ent && typeof ent === 'object') ent.name ??= ''
    }
    const labor = scenario.fixed.labor
    // v1 stored an annual figure. Carry it across under the new key with the
    // basis that makes it mean the same number of hours it meant before.
    if (labor.hours == null && labor.totalHoursPerYear != null) {
      labor.hours = labor.totalHoursPerYear
    }
    labor.hoursBasis ??= 'year'
    for (const key of ['utilities', 'farmInsurance', 'duesFees', 'misc']) {
      scenario.fixed.annualBasis[key] ??= 'year'
    }
  }

  // v2 → v3: a figure taken from the typical-value picker can carry a marker
  // saying what it was quoted against — `typicalYieldUnit` on a variable expense
  // line, `fixed.annualTypicalBasis.<key>` on an overhead line.
  //
  // Nothing is written here on purpose. The marker is only ever set by the
  // typical-value picker, so a v2 budget has no lines that carry one, and the
  // absence is the correct state: a figure the producer typed themselves is
  // theirs, and clearing it on a unit change would be destroying work the app
  // has no evidence is wrong. The step exists so the version stays monotonic
  // and a later migration knows what it is looking at.
  if (Number(scenario.schemaVersion) < 3) {
    scenario.schemaVersion = 3
  }

  // v3 → v4: budgets gained `scenarioYear`, the crop year the plan is FOR.
  //
  // Nothing is written here either, and specifically NOT a year guessed from
  // createdAt. A 2027 plan is routinely built in 2026, so a timestamp is
  // evidence of when someone was at the keyboard and no evidence at all of what
  // they were planning for. Filling it in would put a fact on the budget that
  // the producer never stated, and the filter would then find that budget under
  // a year they did not choose. Blank is the honest answer, and blank is what
  // the absent key already reads as everywhere it is shown.
  if (Number(scenario.schemaVersion) < 4) {
    scenario.schemaVersion = 4
  }

  // v4 → v5: budgets gained `folderId`, naming the folder they are filed in.
  //
  // Nothing is written here, and the reason is the same one as v2 → v3: absence
  // is already the correct representation of the new state. A v4 budget is in no
  // folder, `folderId: null` says exactly what a missing key says, and writing
  // it across every stored record would be a full rewrite of the store to
  // restate what it already said — on a device whose quota is the reason
  // saveScenario() has an error path at all.
  if (Number(scenario.schemaVersion) < 5) {
    scenario.schemaVersion = 5
  }

  // v5 → v6: two variable expense lines gained a third entry mode and the keys
  // it reads — seed's `costPerBag` / `seedsPerBag` / `population` (plus the
  // `seedsPerBagAuto` provenance marker), and crop insurance's `totalCost`.
  //
  // Nothing is written here, for the v2 → v3 reason and one more besides. The
  // keys are only ever read while the line's `mode` names them, and a v5 budget
  // has no line set to either new mode, so they cannot be reached. Seeding them
  // as empty strings would rewrite every stored record to add fields nothing
  // will look at, and `seedsPerBagAuto` in particular must NOT be invented: it
  // means "the app put this number here, so the app may replace it", and
  // stamping it onto figures a producer typed would hand their own work to the
  // clearing logic. Absent is the only correct value for a budget that predates
  // the feature.
  if (Number(scenario.schemaVersion) < 6) {
    scenario.schemaVersion = 6
  }

  return scenario
}

/**
 * Compare two scenarios for list order.
 *
 * `sortIndex` is set only by an explicit drag; until then it is absent and the
 * list falls back to newest-first, which is what a producer who has never
 * reordered anything expects. Mixed lists put dragged records first, because a
 * deliberate arrangement outranks a timestamp.
 */
function byListOrder(a, b) {
  const ai = Number.isFinite(Number(a.sortIndex)) ? Number(a.sortIndex) : null
  const bi = Number.isFinite(Number(b.sortIndex)) ? Number(b.sortIndex) : null
  if (ai !== null && bi !== null) return ai - bi
  if (ai !== null) return -1
  if (bi !== null) return 1
  return String(b.updatedAt).localeCompare(String(a.updatedAt))
}

/**
 * Persist a producer's drag-and-drop arrangement.
 *
 * Ids not present in `idsInOrder` keep whatever order they had, appended after
 * the arranged ones — a reorder must never make a budget disappear from the
 * list, including one saved by another tab a moment ago.
 */
export function reorderScenarios(idsInOrder) {
  const all = listScenarios()
  const rank = new Map(idsInOrder.map((id, i) => [id, i]))
  const arranged = [
    ...all.filter((s) => rank.has(s.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)),
    ...all.filter((s) => !rank.has(s.id)),
  ]
  arranged.forEach((s, i) => {
    s.sortIndex = i
  })
  return writeRaw(arranged)
}

/* ─────────────────────────── folders ───────────────────────────────────── */

/**
 * Folders, in list order. A record that cannot be read is skipped.
 *
 * The whole point of this function is that it can fail quietly. A folders key
 * that will not parse costs the producer their folders and nothing else: with
 * `[]` returned, the Saved tab is exactly the flat list it was before folders
 * existed, still holding every budget. Nothing in here can take a budget with
 * it, because budgets are not in this key.
 *
 * `icon` and `color` are token KEYS, never a glyph and never a hex. A stored
 * `#2e7d32` cannot be re-rendered for dark mode and strands the record if the
 * palette ever moves; `'olive'` resolves through the same custom properties as
 * the rest of the app, in whichever theme is on. An unrecognised key is left
 * alone here and falls back at render time (see folderIcon/folderColor in
 * ui/folders.js) — the same rule as perYearFactor() returning 1 for a basis it
 * does not know, rather than 0 or a crash.
 */
export function listFolders() {
  const raw = readKey(KEY_FOLDERS)
  if (!raw) return []

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out = []
  for (const f of parsed) {
    if (!f || typeof f !== 'object' || !f.id) continue
    out.push({
      ...f,
      id: String(f.id),
      name: String(f.name ?? ''),
    })
  }
  return out.sort(byFolderOrder)
}

/**
 * Folders are arranged by arrow only (there is no third drag implementation on
 * this page), so `sortIndex` is always set by the time there is anything to
 * compare. Creation order is the fallback for a hand-edited or partly written
 * file, and it is stable: a folder made later belongs below one made earlier.
 */
function byFolderOrder(a, b) {
  const ai = Number.isFinite(Number(a.sortIndex)) ? Number(a.sortIndex) : null
  const bi = Number.isFinite(Number(b.sortIndex)) ? Number(b.sortIndex) : null
  if (ai !== null && bi !== null) return ai - bi
  if (ai !== null) return -1
  if (bi !== null) return 1
  return String(a.createdAt).localeCompare(String(b.createdAt))
}

function writeFolders(list) {
  return writeKey(KEY_FOLDERS, list)
}

let folderCounter = 0

function makeFolderId() {
  folderCounter += 1
  return `fld-${Date.now().toString(36)}-${folderCounter}`
}

let restoredCounter = 0

/** For a backup that names one id twice — see importBackupJSON(). */
function makeRestoredId() {
  restoredCounter += 1
  return `scn-restored-${Date.now().toString(36)}-${restoredCounter}`
}

/**
 * Create or update one folder by id. Returns `{ok, folder}`.
 *
 * A new folder goes to the BOTTOM of the list rather than the top. Making one is
 * a decision about where things will go from now on, not a thing you then want
 * sitting above the budgets you were already looking at.
 */
export function saveFolder(folder) {
  if (!folder || typeof folder !== 'object') return { ok: false, error: 'MissingFolder' }

  const all = listFolders()
  const index = folder.id ? all.findIndex((f) => f.id === folder.id) : -1

  const record = {
    ...(index >= 0 ? all[index] : {}),
    ...folder,
    id: folder.id || makeFolderId(),
    name: String(folder.name ?? ''),
  }

  if (index >= 0) {
    all[index] = record
  } else {
    record.createdAt = new Date().toISOString()
    const indices = all.map((f) => Number(f.sortIndex)).filter(Number.isFinite)
    record.sortIndex = indices.length ? Math.max(...indices) + 1 : 0
    all.push(record)
  }

  const result = writeFolders(all)
  return result.ok ? { ok: true, folder: record } : result
}

/**
 * Remove a folder. Every budget in it survives, un-filed.
 *
 * There is no cascade delete, no "also delete contents" option, and no
 * configuration that produces one. This app holds a producer's saved work in one
 * browser with no server behind it, and an organisational feature that can lose
 * a budget is worse than no organisational feature.
 *
 * The members are cleared FIRST, and a failure there abandons the whole
 * operation with nothing changed. The other order can leave budgets pointing at
 * a folder that is gone — survivable, because a dangling folderId reads as "not
 * in a folder" everywhere, but it is a state nobody can see or clean up. An
 * emptied folder that would not delete is at least still on screen, and the
 * producer can press Delete again.
 */
export function deleteFolder(id) {
  const all = listFolders()
  if (!all.some((f) => f.id === id)) return { ok: false, error: 'NotFound' }

  const scenarios = listScenarios()
  const members = scenarios.filter((s) => s.folderId === id)
  if (members.length) {
    for (const s of members) delete s.folderId
    const cleared = writeRaw(scenarios)
    if (!cleared.ok) return cleared
  }

  return writeFolders(all.filter((f) => f.id !== id))
}

/**
 * Persist the folder arrangement. Mirrors reorderScenarios: ids not named keep
 * their order and are appended, so a reorder can never make a folder vanish
 * because another tab created one between render and press.
 */
export function reorderFolders(idsInOrder) {
  const all = listFolders()
  const rank = new Map(idsInOrder.map((id, i) => [id, i]))
  const arranged = [
    ...all.filter((f) => rank.has(f.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)),
    ...all.filter((f) => !rank.has(f.id)),
  ]
  arranged.forEach((f, i) => {
    f.sortIndex = i
  })
  return writeFolders(arranged)
}

/**
 * File one budget, by id. `folderId` of null or '' means "not in a folder".
 *
 * Modelled on renameScenario() and NOT on saveScenario(), for the same reason:
 * the Saved tab is filing a row that may not be the budget currently open on the
 * Budget tab, and routing it through saveScenario() would write the whole
 * working scenario over the stored one — including Budget-tab edits the producer
 * has not saved.
 *
 * It differs from renameScenario() in one way that matters: it does NOT bump
 * `updatedAt`. Filing a budget is not editing it. The date on the row is the
 * producer's record of when they last worked on that farm, and moving it between
 * folders must not reset it — which also means filing can never manufacture a
 * save conflict in another tab, and never disturbs the newest-first fallback
 * order.
 */
export function moveScenarioToFolder(id, folderId) {
  const all = listScenarios()
  const found = all.find((s) => s.id === id)
  if (!found) return { ok: false, error: 'NotFound' }

  if (folderId) found.folderId = String(folderId)
  else delete found.folderId

  return writeRaw(all)
}

/**
 * Rename in place without touching anything else.
 *
 * The Saved tab edits names inline and autosaves on every keystroke. Routing
 * that through saveScenario() would write the whole working scenario over the
 * stored one — including edits the producer has not saved from the Budget tab.
 */
export function renameScenario(id, name) {
  const all = listScenarios()
  const found = all.find((s) => s.id === id)
  if (!found) return { ok: false, error: 'NotFound' }
  found.name = String(name)
  found.updatedAt = new Date().toISOString()
  const result = writeRaw(all)
  if (result.ok) lastKnownUpdatedAt.set(id, found.updatedAt)
  return result
}

/** All saved scenarios in list order. Unreadable records are skipped. */
export function listScenarios() {
  const raw = readRaw()
  if (!raw) return []

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out = []
  for (const record of parsed) {
    try {
      if (record && typeof record === 'object' && record.id) out.push(migrate(record))
    } catch {
      /* skip this one, keep the rest */
    }
  }
  return out.sort(byListOrder)
}

export function getScenarioById(id) {
  const found = listScenarios().find((s) => s.id === id) || null
  if (found) lastKnownUpdatedAt.set(found.id, found.updatedAt)
  return found
}

/**
 * Insert or replace by id.
 *
 * Returns `{ok: false, error: 'Conflict'}` when the stored copy has moved on
 * since this tab last read it — the caller must ask the producer before
 * overwriting. Pass `{force: true}` to save anyway.
 *
 * Also returns `{ok: false}` on a full or unavailable store, never throwing:
 * a silent failure would let someone keep working on data that isn't being kept.
 */
export function saveScenario(scenario, { force = false } = {}) {
  if (!scenario?.id) return { ok: false, error: 'MissingId' }

  const all = listScenarios()
  const index = all.findIndex((s) => s.id === scenario.id)
  const existing = index >= 0 ? all[index] : null
  const seen = lastKnownUpdatedAt.get(scenario.id)

  // The stored record is not the one we read. Compared for DIFFERENCE and not
  // for later-than: what makes this copy stale is that the record moved, and a
  // record can move backwards. Restoring a backup puts an older timestamp on an
  // id this tab is holding a newer copy of, and under `>` that read as nobody
  // having touched it — so the save went through and took the restored budget
  // with it. Every writer here sets the map on success, so an ordinary
  // read-edit-save still compares equal and is not interrupted.
  if (!force && existing && seen && String(existing.updatedAt) !== String(seen)) {
    return { ok: false, error: 'Conflict', theirs: existing }
  }

  let record
  try {
    record = { ...structuredClone(scenario), schemaVersion: SCHEMA_VERSION }
  } catch {
    // structuredClone rejects functions, DOM nodes and other non-cloneables.
    // Reporting beats throwing — this module promises never to throw.
    return { ok: false, error: 'NotSerializable' }
  }
  record.updatedAt = new Date().toISOString()

  if (index >= 0) {
    // The working scenario in memory has no idea where the producer dragged it
    // to; the stored record does. Saving must not undo a manual arrangement.
    if (existing.sortIndex != null) record.sortIndex = existing.sortIndex

    // Membership is owned by the Saved tab, in both directions, so the stored
    // value always wins — including when it is absent. Without this: open a
    // budget, go to Saved, file it, come back and save. The working copy was
    // read before the move and still carries the old folderId, so the save
    // un-files it with nothing on screen to say so. The `else` half is the same
    // hazard run backwards, after a move OUT of a folder. It is exactly the trap
    // sortIndex already guards against, one field over.
    if (existing.folderId != null) record.folderId = existing.folderId
    else delete record.folderId

    all[index] = record
  } else {
    // A brand-new budget belongs at the top, alongside where the newest-first
    // fallback would have put it. Only meaningful once something was dragged.
    const indices = all.map((s) => Number(s.sortIndex)).filter(Number.isFinite)
    if (indices.length) record.sortIndex = Math.min(...indices) - 1
    all.push(record)
  }

  const result = writeRaw(all)
  if (result.ok) {
    lastKnownUpdatedAt.set(record.id, record.updatedAt)
    setLastOpened(scenario.id)
  }
  return result
}

export function deleteScenario(id) {
  const remaining = listScenarios().filter((s) => s.id !== id)
  const result = writeRaw(remaining)
  if (result.ok) lastKnownUpdatedAt.delete(id)
  return result
}

export function setLastOpened(id) {
  try {
    localStorage.setItem(KEY_LAST, id)
  } catch {
    /* non-fatal */
  }
}

export function getLastOpened() {
  try {
    return localStorage.getItem(KEY_LAST)
  } catch {
    return null
  }
}

/** True when the browser will actually retain anything. */
export function storageAvailable() {
  try {
    const probe = '__sdshc_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/* ───────────────────── import / export (device transfer) ───────────────── */

/**
 * `folderId` is stripped on the way out and on the way back in.
 *
 * A folder organises one device's list. It is not part of a budget, it means
 * nothing on the machine the file is opened on, and an id that happened to
 * collide with a real folder there would file somebody else's budget into it.
 */
export function exportScenarioJSON(scenario) {
  const { folderId, ...rest } = scenario
  return JSON.stringify({ ...rest, schemaVersion: SCHEMA_VERSION }, null, 2)
}

/* ─────────────────────────── backup / restore ──────────────────────────── */

/**
 * A backup is the whole Saved tab in one file, and it is a DIFFERENT kind of
 * thing from a budget file.
 *
 * A budget file is one budget, handed to another person or carried to another
 * device, which is why exportScenarioJSON() strips `folderId`: a folder id means
 * nothing on the machine it lands on, and one that happened to collide would
 * file somebody else's budget into a folder they never chose.
 *
 * A backup restores a list onto itself. The folders travel WITH the budgets and
 * every id is resolved against the folders in the same file, so membership is
 * internally consistent and stripping it would lose the arrangement the producer
 * built — which is most of what they would be backing up for.
 *
 * `kind` is checked on the way back in. Both files are .json and both came out
 * of this app, so nothing about the extension distinguishes them, and restoring
 * one budget over a list of twelve is the one mistake this file format has to
 * make impossible.
 */
const BACKUP_KIND = 'sdshc-farm-budget-backup'

export function exportBackupJSON() {
  return JSON.stringify(
    {
      kind: BACKUP_KIND,
      backupVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      folders: listFolders(),
      scenarios: listScenarios(),
    },
    null,
    2
  )
}

/**
 * Parse a backup file. Returns `{ok, scenarios, folders}` or `{ok:false,error}`,
 * never throwing — this is a file the producer picked off their own device.
 *
 * A single-budget file gets its own message rather than the generic refusal.
 * It is the near miss somebody will actually hit, and "that file is not a
 * backup" leaves them with no idea that the control they wanted is two lines
 * further down the same screen.
 *
 * An empty backup is refused. Restoring one would be a way to delete every
 * budget on the device by answering a confirm dialog about a file that turned
 * out to hold nothing, and there is no reason anybody would mean it.
 */
export function importBackupJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a backup of your saved budgets.' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'That file is not a backup of your saved budgets.' }
  }
  if (parsed.kind !== BACKUP_KIND) {
    return {
      ok: false,
      error: Array.isArray(parsed.enterprises)
        ? 'That file holds one budget, not a backup. Use "upload a budget file" to bring it in alongside what you already have.'
        : 'That file is not a backup of your saved budgets.',
    }
  }
  if (!Array.isArray(parsed.scenarios)) {
    return { ok: false, error: 'That backup file is damaged and cannot be read.' }
  }

  // Same rule as listScenarios() and listFolders(): one unreadable record is
  // skipped, never fatal to the rest of the file.
  //
  // Ids are made strings here, which listFolders() has always done and this side
  // never did. Every id in this app is a string, and every action on the Saved
  // tab compares one against a `data-id` read off the DOM, which is always a
  // string too. A number arriving from a hand-edited or third-party file matches
  // nothing under `===`: the row renders and is counted, but Open, Delete,
  // Duplicate, Move and the arrows all quietly do nothing, and there is no way
  // to be rid of it short of clearing the browser's storage.
  //
  // A repeated id is re-issued rather than dropped. Both records are somebody's
  // work, and `.find()` resolves the first every time — so left alone, the second
  // row opens the first record and saving it overwrites the first budget with the
  // second one's edits. Dropping it instead would honour the ids and lose a
  // budget, which is the one thing this tab is not allowed to do.
  const scenarios = []
  const takenIds = new Set()
  for (const record of parsed.scenarios) {
    try {
      if (!record || typeof record !== 'object' || !record.id) continue
      const scenario = migrate(record)
      const id = String(scenario.id)
      scenario.id = takenIds.has(id) ? makeRestoredId() : id
      takenIds.add(scenario.id)
      if (scenario.folderId != null) scenario.folderId = String(scenario.folderId)
      scenarios.push(scenario)
    } catch {
      /* skip this one, keep the rest */
    }
  }

  const folders = (Array.isArray(parsed.folders) ? parsed.folders : [])
    .filter((f) => f && typeof f === 'object' && f.id)
    .map((f) => ({ ...f, id: String(f.id), name: String(f.name ?? '') }))

  if (!scenarios.length && !folders.length) {
    return { ok: false, error: 'That backup file has no budgets in it.' }
  }
  return { ok: true, scenarios, folders }
}

/**
 * Replace the whole Saved tab. The one destructive write in this module.
 *
 * The budgets go first, and that order is the safety property. If the budgets
 * fail to write, nothing has changed at all and the caller can say so. If they
 * succeed and the folders do not, the restored budgets are on screen carrying
 * folder ids that resolve to nothing — and a budget naming a folder that does
 * not exist lands in the ungrouped pile, which is exactly the case
 * renderSections() is built to catch. Written the other way round, a folders
 * failure would leave the producer's own folders holding the file's budgets.
 *
 * `lastKnownUpdatedAt` is deliberately NOT cleared, and it used to be. The
 * reasoning was that every record in it now describes a budget this tab has not
 * read, so a restored record older than the remembered timestamp would read as
 * untouched and the next save would overwrite it unasked. The conclusion was
 * right and the fix was the wrong way round: saveScenario()'s check is guarded
 * on `seen` being truthy, so emptying the map does not reset the comparison, it
 * switches it off. The older-record case came out the same either way, and the
 * newer-record case came out worse — a restore that brought in work AHEAD of
 * what this tab was holding had its conflict prompt suppressed by the clear.
 *
 * What the map holds is what this tab last saw, which a restore does not change.
 * Keeping it, and comparing for difference rather than for greater-than, is what
 * makes the save after a restore ask.
 */
export function replaceAll(scenarios, folders) {
  const wrote = writeRaw(scenarios)
  if (!wrote.ok) return wrote

  const wroteFolders = writeFolders(folders)
  if (!wroteFolders.ok) return { ok: false, error: wroteFolders.error, budgetsRestored: true }
  return { ok: true }
}

/**
 * Parse a scenario file. Returns {ok, scenario} or {ok:false, error} — never
 * throws, because this input comes from a file the producer picked.
 */
export function importScenarioJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a saved budget.' }
  }
  // The near miss in the other direction: a backup handed to the single-budget
  // control. Both are .json and both came out of this app, so it says which
  // control the file belongs to rather than refusing it as unreadable.
  if (parsed?.kind === BACKUP_KIND) {
    return {
      ok: false,
      error:
        'That file is a backup of a whole Saved tab, not one budget. Use "Restore backup" to bring it in.',
    }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.enterprises)) {
    return { ok: false, error: 'That file is not a saved budget.' }
  }
  // An imported budget lands in no folder — see exportScenarioJSON. A file the
  // app wrote carries none; a hand-edited one is not evidence of anything about
  // the folders on THIS device.
  delete parsed.folderId
  // The two sibling readers both wrap migrate() per record and this one did not,
  // which is the whole difference between "that file is not a saved budget" and
  // an unhandled rejection out of an async change handler, where the producer
  // presses the control and nothing whatever happens. normalizeShape() now takes
  // away the reachable throw; the catch stays because the promise this module
  // makes is that it never throws, not that we thought of everything.
  try {
    return { ok: true, scenario: migrate(parsed) }
  } catch {
    return { ok: false, error: 'That file is not a saved budget.' }
  }
}
