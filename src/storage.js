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
function readRaw() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeRaw(value) {
  try {
    localStorage.setItem(KEY, value)
    return { ok: true }
  } catch (err) {
    // QuotaExceededError is the realistic failure: dozens of scenarios, or a
    // browser configured with no storage. The caller must surface this — a
    // silent failure would let a producer keep working on unsaved data.
    return { ok: false, error: err?.name || 'StorageError' }
  }
}

/**
 * Bring an older stored scenario up to the current shape.
 * Each version gets its own step; steps run in order and fall through.
 */
function migrate(scenario) {
  const version = Number(scenario?.schemaVersion) || 0

  // v0 → v1: pre-release scenarios had no schemaVersion at all.
  if (version < 1) {
    scenario.schemaVersion = 1
    scenario.enterprises ??= []
    scenario.fixed ??= {}
    scenario.fixed.equipment ??= []
    scenario.fixed.buildings ??= []
    scenario.fixed.annual ??= {}
    scenario.fixed.labor ??= {}
    // Without this, the list sorts on the string "undefined", which compares
    // above any ISO date — an ancient scenario would show up as the newest.
    scenario.createdAt ??= new Date(0).toISOString()
    scenario.updatedAt ??= scenario.createdAt
  }

  // v1 → v2: enterprises gained a name distinct from the crop; labour hours and
  // overhead amounts gained a period basis; the list gained a manual order.
  if (Number(scenario.schemaVersion) < 2) {
    scenario.schemaVersion = 2
    for (const ent of scenario.enterprises ?? []) {
      // The crop was the label before v2. Leaving `name` blank keeps that
      // behaviour exactly — enterpriseLabel() falls back to the crop — so an
      // old budget looks identical until someone chooses to rename a column.
      if (ent && typeof ent === 'object') ent.name ??= ''
    }
    scenario.fixed ??= {}
    scenario.fixed.labor ??= {}
    const labor = scenario.fixed.labor
    // v1 stored an annual figure. Carry it across under the new key with the
    // basis that makes it mean the same number of hours it meant before.
    if (labor.hours == null && labor.totalHoursPerYear != null) {
      labor.hours = labor.totalHoursPerYear
    }
    labor.hoursBasis ??= 'year'
    scenario.fixed.annualBasis ??= {}
    for (const key of ['utilities', 'farmInsurance', 'duesFees', 'misc']) {
      scenario.fixed.annualBasis[key] ??= 'year'
    }
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
  return writeRaw(JSON.stringify(arranged))
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
  const result = writeRaw(JSON.stringify(all))
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

  // Someone else wrote this record after we last read it.
  if (!force && existing && seen && String(existing.updatedAt) > String(seen)) {
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
    all[index] = record
  } else {
    // A brand-new budget belongs at the top, alongside where the newest-first
    // fallback would have put it. Only meaningful once something was dragged.
    const indices = all.map((s) => Number(s.sortIndex)).filter(Number.isFinite)
    if (indices.length) record.sortIndex = Math.min(...indices) - 1
    all.push(record)
  }

  const result = writeRaw(JSON.stringify(all))
  if (result.ok) {
    lastKnownUpdatedAt.set(record.id, record.updatedAt)
    setLastOpened(scenario.id)
  }
  return result
}

export function deleteScenario(id) {
  const remaining = listScenarios().filter((s) => s.id !== id)
  const result = writeRaw(JSON.stringify(remaining))
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

export function exportScenarioJSON(scenario) {
  return JSON.stringify({ ...scenario, schemaVersion: SCHEMA_VERSION }, null, 2)
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
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.enterprises)) {
    return { ok: false, error: 'That file is not a saved budget.' }
  }
  return { ok: true, scenario: migrate(parsed) }
}
