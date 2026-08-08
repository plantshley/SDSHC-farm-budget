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
  // Fresh ids so the two scenarios' rows never collide in a compare view.
  for (const e of copy.enterprises) e.id = makeId('ent')
  for (const e of copy.fixed.equipment) e.id = makeId('eq')
  for (const b of copy.fixed.buildings) b.id = makeId('bl')
  return copy
}
