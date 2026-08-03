/**
 * Storage tests.
 *
 * A producer's saved budgets are the one thing in this app that cannot be
 * regenerated. These tests exist to make sure they are never silently dropped,
 * overwritten or lost to a corrupt neighbour.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/** Minimal localStorage, with a switch to simulate a full or blocked store. */
class MemoryStorage {
  constructor() {
    this.map = new Map()
    this.failWrites = null
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    if (this.failWrites) {
      const err = new Error('full')
      err.name = this.failWrites
      throw err
    }
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

const store = new MemoryStorage()
globalThis.localStorage = store

const {
  listScenarios,
  getScenarioById,
  saveScenario,
  deleteScenario,
  storageAvailable,
  importScenarioJSON,
  exportScenarioJSON,
} = await import('../src/storage.js')

const KEY = 'sdshc-fb-scenarios'

function makeScenario(id, name) {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    enterprises: [{ id: 'e1', crop: 'Corn', acres: 500 }],
    fixed: { equipment: [], buildings: [], annual: {}, labor: {} },
  }
}

beforeEach(() => {
  store.clear()
  store.failWrites = null
})

describe('saving and reading', () => {
  test('round-trips a scenario', () => {
    assert.equal(saveScenario(makeScenario('a', 'Corn')).ok, true)
    const all = listScenarios()
    assert.equal(all.length, 1)
    assert.equal(all[0].name, 'Corn')
    assert.equal(all[0].schemaVersion, 1)
  })

  test('replaces by id rather than accumulating duplicates', () => {
    saveScenario(makeScenario('a', 'First'))
    const again = getScenarioById('a')
    again.name = 'Renamed'
    saveScenario(again)

    const all = listScenarios()
    assert.equal(all.length, 1)
    assert.equal(all[0].name, 'Renamed')
  })

  test('keeps separate scenarios separate', () => {
    saveScenario(makeScenario('a', 'Conventional'))
    saveScenario(makeScenario('b', 'No-till'))
    assert.equal(listScenarios().length, 2)
  })

  test('reports a full store instead of failing silently', () => {
    store.failWrites = 'QuotaExceededError'
    const result = saveScenario(makeScenario('a', 'Corn'))
    assert.equal(result.ok, false)
    assert.equal(result.error, 'QuotaExceededError')
  })

  test('reports rather than throws on an unclonable scenario', () => {
    const bad = makeScenario('a', 'Corn')
    bad.oops = () => {}
    const result = saveScenario(bad)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'NotSerializable')
  })

  test('deleting removes only the named scenario', () => {
    saveScenario(makeScenario('a', 'One'))
    saveScenario(makeScenario('b', 'Two'))
    deleteScenario('a')
    const all = listScenarios()
    assert.equal(all.length, 1)
    assert.equal(all[0].id, 'b')
  })
})

describe('never lose a producer’s work', () => {
  test('one corrupt record does not take the rest of the list with it', () => {
    saveScenario(makeScenario('a', 'Good one'))
    const raw = JSON.parse(store.getItem(KEY))
    raw.push(null, 'garbage', { noId: true }, 42)
    store.setItem(KEY, JSON.stringify(raw))

    const all = listScenarios()
    assert.equal(all.length, 1, 'the good scenario survived')
    assert.equal(all[0].name, 'Good one')
  })

  test('unparseable storage yields an empty list rather than throwing', () => {
    store.setItem(KEY, '{not json at all')
    assert.deepEqual(listScenarios(), [])
  })

  test('a save from another tab is detected instead of being overwritten', () => {
    // This tab opens the budget...
    saveScenario(makeScenario('a', 'Mine'))
    const mine = getScenarioById('a')

    // ...meanwhile another tab saves its own changes to the same budget.
    const theirs = { ...makeScenario('a', 'Theirs'), updatedAt: '2030-01-01T00:00:00.000Z' }
    store.setItem(KEY, JSON.stringify([theirs]))

    mine.name = 'Mine, edited'
    const blocked = saveScenario(mine)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'Conflict')
    assert.equal(blocked.theirs.name, 'Theirs')
    assert.equal(listScenarios()[0].name, 'Theirs', 'their work is still intact')

    // The producer chooses to overwrite; only then does it go through.
    const forced = saveScenario(mine, { force: true })
    assert.equal(forced.ok, true)
    assert.equal(listScenarios()[0].name, 'Mine, edited')
  })

  test('a first save of a brand-new scenario is never a conflict', () => {
    assert.equal(saveScenario(makeScenario('fresh', 'New')).ok, true)
  })
})

describe('migration', () => {
  test('a pre-release scenario with no schemaVersion is brought forward', () => {
    store.setItem(
      KEY,
      JSON.stringify([{ id: 'old', name: 'Ancient', enterprises: [{ crop: 'Corn' }] }])
    )
    const all = listScenarios()
    assert.equal(all.length, 1, 'an old scenario is migrated, never dropped')
    assert.equal(all[0].schemaVersion, 1)
    assert.ok(Array.isArray(all[0].fixed.equipment))
    assert.ok(Array.isArray(all[0].fixed.buildings))
  })

  test('a migrated scenario without a date does not masquerade as the newest', () => {
    // Sorting compares strings; "undefined" would sort above any ISO date.
    store.setItem(
      KEY,
      JSON.stringify([
        { id: 'old', name: 'Ancient', enterprises: [] },
        { ...makeScenario('new', 'Recent'), updatedAt: '2026-06-01T00:00:00.000Z' },
      ])
    )
    const all = listScenarios()
    assert.equal(all[0].name, 'Recent', 'the genuinely recent one is listed first')
  })
})

describe('import and export', () => {
  test('a budget file round-trips', () => {
    const original = makeScenario('a', 'Corn')
    const result = importScenarioJSON(exportScenarioJSON(original))
    assert.equal(result.ok, true)
    assert.equal(result.scenario.name, 'Corn')
    assert.equal(result.scenario.enterprises.length, 1)
  })

  test('a file that is not a budget is rejected with a readable message', () => {
    for (const bad of ['', 'nonsense', '{}', '[]', '{"enterprises":"nope"}']) {
      const result = importScenarioJSON(bad)
      assert.equal(result.ok, false, `${bad} should be rejected`)
      assert.match(result.error, /not a saved budget/)
    }
  })

  test('storageAvailable reports a blocked store', () => {
    assert.equal(storageAvailable(), true)
    store.failWrites = 'SecurityError'
    assert.equal(storageAvailable(), false)
  })
})
