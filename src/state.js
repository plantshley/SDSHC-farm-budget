/**
 * The working scenario, plus the factory functions that define its shape.
 *
 * Data flows one way: inputs write a value by path, then everything derived
 * re-reads from calcScenario(). Nothing derived is ever stored.
 */

import { SCHEMA_VERSION, VARIABLE_LINES, PREHARVEST_DEFAULTS } from './calc.js'

let scenario = null
const listeners = new Set()

export function getScenario() {
  return scenario
}

export function setScenario(next) {
  scenario = next
  notify()
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Drop every subscriber. A browser page boots once, so this is a no-op there;
 * it exists so the app can be booted repeatedly into a fresh document (the
 * smoke tests) without stale subscribers writing into the new one.
 */
export function clearListeners() {
  listeners.clear()
}

export function notify() {
  if (scenario) scenario.updatedAt = new Date().toISOString()
  for (const fn of listeners) fn(scenario)
}

/* ─────────────────────────── path access ───────────────────────────────── */

/**
 * Inputs declare `data-path="enterprises.0.variable.seed.costPerUnit"`, which
 * keeps the markup and the data shape in one place instead of needing a
 * bespoke handler per field.
 */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

export function setPath(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let target = obj
  for (const k of keys) {
    if (target[k] == null) target[k] = /^\d+$/.test(k) ? [] : {}
    target = target[k]
  }
  target[last] = value
}

/* ─────────────────────────── factories ─────────────────────────────────── */

let idCounter = 0

/** Unique within a scenario; not a security token. */
export function makeId(prefix) {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

function blankVariableLines() {
  const variable = {}
  for (const def of VARIABLE_LINES) {
    const line = {
      // Costs that are naturally quoted per acre (crop insurance, custom hire)
      // default to that mode so producers aren't forced to enter "cost × 1".
      mode: def.prefersPerAcre ? 'perAcre' : 'unit',
      costPerUnit: '',
      unitsPerAcre: '',
      perAcre: '',
    }
    // Only the lines that offer a third mode carry its keys. Seeding every line
    // with all of them would put `totalCost` on hauling, where nothing can ever
    // read it and its presence in an exported file would suggest otherwise.
    if (def.modes?.includes('population')) {
      line.costPerBag = ''
      line.seedsPerBag = ''
      line.population = ''
    }
    if (def.modes?.includes('total')) line.totalCost = ''
    variable[def.key] = line
  }
  return variable
}

export function newEnterprise(crop = '') {
  return {
    id: makeId('ent'),
    // Separate from the crop on purpose: two columns can both grow corn and
    // still need to be told apart ("No-till", "Conventional").
    name: '',
    crop,
    acres: '',
    yieldPerAcre: '',
    yieldUnit: 'bu',
    pricePerUnit: '',
    miscIncomePerAcre: '',
    variable: blankVariableLines(),
    preharvest: {
      auto: true,
      rate: PREHARVEST_DEFAULTS.rate,
      months: PREHARVEST_DEFAULTS.months,
      manualPerAcre: '',
    },
  }
}

export function newEquipment() {
  return {
    id: makeId('eq'),
    name: '',
    category: '',
    initialCost: '',
    salvageValue: '',
    usefulLife: '',
    interestRate: '',
  }
}

export function newBuilding() {
  return {
    id: makeId('bl'),
    name: '',
    category: '',
    initialCost: '',
    usefulLife: '',
    interestRate: '',
  }
}

export function newScenario(name = 'My Budget Scenario') {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId('scn'),
    name,
    // The crop year this plan is FOR, which is not the year it was written in.
    // Blank like every other field: nothing auto-fills here, and a year the app
    // guessed would be indistinguishable on screen from one the producer chose.
    scenarioYear: '',
    createdAt: now,
    updatedAt: now,
    enterprises: [newEnterprise()],
    fixed: {
      landRentPerAcre: '',
      // Weekly, because that is how hired help is actually described: "a couple
      // of days a week through the season", not "312 hours a year". A yearly
      // default puts the conversion back in the producer's head, which is the
      // arithmetic HOURS_BASIS exists to take out of it.
      //
      // NEW budgets only. The v1 to v2 migration still writes 'year' onto old
      // ones, because they stored an annual figure and reinterpreting it as
      // weekly would multiply somebody's labour bill by fifty-two.
      labor: { ratePerHour: '', hours: '', hoursBasis: 'week' },
      equipment: [],
      buildings: [],
      annual: { utilities: '', farmInsurance: '', duesFees: '', misc: '' },
      // Parallel to `annual`: what period each figure above was entered for.
      annualBasis: { utilities: 'year', farmInsurance: 'year', duesFees: 'year', misc: 'year' },
    },
  }
}

/**
 * Give a budget its `shareId` if it has not got one, and hand it back.
 *
 * HERE, RATHER THAN IN share.js, FOR TWO REASONS. It is a fact about the
 * scenario's shape, which is this file's job; and it must be callable without
 * loading Firebase, because main.js has to stamp the id BEFORE `saveScenario()`
 * runs. Doing it after the save would leave the id in memory only, and a
 * producer who shared once and never saved again would have a record nobody
 * could update or delete — see the note in saveScenario().
 *
 * A v4 UUID, not `makeId()`. See the SCHEMA_VERSION comment in calc.js: makeId
 * restarts its counter every page load, so two devices can mint the same one.
 * This is the key of a record in a store shared by every device, and a
 * collision there is one budget silently overwriting another.
 *
 * `crypto.randomUUID` needs a secure context and is absent in some test
 * environments, so there is a fallback. It is only ever a fallback: getRandomValues
 * is still 122 bits of entropy, which is what the id being unguessable rests on.
 */
export function ensureShareId(scenario) {
  if (!scenario) return null
  if (typeof scenario.shareId === 'string' && scenario.shareId.length === 36) {
    return scenario.shareId
  }
  scenario.shareId = randomUUID()
  return scenario.shareId
}

/**
 * A fresh key, with no scenario to hang it on.
 *
 * ensureAllShareIds() in storage.js stamps a whole list in one write and has no
 * scenario object to pass. Exported from here so there is one implementation of
 * what a share key IS, rather than a second copy of the fallback below.
 */
export function newShareId() {
  return randomUUID()
}

function randomUUID() {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  // RFC 4122 v4 laid out by hand from 16 random bytes.
  const b = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** A copy under a new id and name — the starting point of every comparison. */
export function duplicateScenario(source, name) {
  const copy = structuredClone(source)
  const now = new Date().toISOString()
  copy.id = makeId('scn')
  copy.name = name || `${source.name} (copy)`
  copy.createdAt = now
  copy.updatedAt = now
  // A copy has never been dragged anywhere. Inheriting the original's list
  // position would put two budgets at the same rank.
  delete copy.sortIndex
  // A copy has never been shared either, and this one is not cosmetic like the
  // rank above. `shareId` keys the ORIGINAL's record with the Coalition, so a
  // duplicate that inherited it would, on its first save, upload itself over
  // the budget it was copied from — silently, into a store the producer cannot
  // see, destroying the comparison they made the copy to build.
  delete copy.shareId
  // Fresh ids so the two scenarios' rows never collide in a compare view.
  for (const e of copy.enterprises) e.id = makeId('ent')
  for (const e of copy.fixed.equipment) e.id = makeId('eq')
  for (const b of copy.fixed.buildings) b.id = makeId('bl')
  return copy
}
