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
  renameScenario,
  reorderScenarios,
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
    assert.equal(all[0].schemaVersion, 2)
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
    assert.equal(all[0].schemaVersion, 2)
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

describe('v2 migration', () => {
  test('a v1 budget keeps the crop as its enterprise label', () => {
    store.setItem(
      KEY,
      JSON.stringify([
        {
          schemaVersion: 1,
          id: 'a',
          name: 'Old',
          updatedAt: '2026-01-01T00:00:00.000Z',
          enterprises: [{ id: 'e1', crop: 'Corn', acres: 500 }],
          fixed: { labor: { totalHoursPerYear: 400 }, annual: { utilities: 1200 } },
        },
      ])
    )
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, 2)
    // Blank, not copied from the crop: enterpriseLabel() falls back to the crop,
    // so the column reads exactly as it did before, and a producer who renames
    // it isn't fighting a value they never typed.
    assert.equal(s.enterprises[0].name, '')
  })

  test('a v1 annual labor figure still means the same number of hours', () => {
    store.setItem(
      KEY,
      JSON.stringify([
        {
          schemaVersion: 1,
          id: 'a',
          name: 'Old',
          updatedAt: '2026-01-01T00:00:00.000Z',
          enterprises: [],
          fixed: { labor: { ratePerHour: 20, totalHoursPerYear: 400 }, annual: {} },
        },
      ])
    )
    const [s] = listScenarios()
    assert.equal(s.fixed.labor.hours, 400)
    assert.equal(s.fixed.labor.hoursBasis, 'year', 'must not silently become weekly')
  })

  test('v1 overhead amounts are annual, and stay annual', () => {
    store.setItem(
      KEY,
      JSON.stringify([
        {
          schemaVersion: 1,
          id: 'a',
          name: 'Old',
          updatedAt: '2026-01-01T00:00:00.000Z',
          enterprises: [],
          fixed: { labor: {}, annual: { utilities: 1200, misc: 300 } },
        },
      ])
    )
    const [s] = listScenarios()
    for (const key of ['utilities', 'farmInsurance', 'duesFees', 'misc']) {
      assert.equal(s.fixed.annualBasis[key], 'year')
    }
  })
})

describe('list order', () => {
  test('newest first until something is dragged', () => {
    // Written straight to the store: saveScenario always stamps updatedAt with
    // the current time, which would make both records the same age.
    store.setItem(
      KEY,
      JSON.stringify([
        { ...makeScenario('a', 'Older'), updatedAt: '2026-01-01T00:00:00.000Z' },
        { ...makeScenario('b', 'Newer'), updatedAt: '2026-06-01T00:00:00.000Z' },
      ])
    )
    assert.equal(listScenarios()[0].name, 'Newer')
  })

  test('a dragged order survives a reload and a later save', () => {
    saveScenario(makeScenario('a', 'One'))
    saveScenario(makeScenario('b', 'Two'))
    saveScenario(makeScenario('c', 'Three'))

    assert.equal(reorderScenarios(['c', 'a', 'b']).ok, true)
    assert.deepEqual(
      listScenarios().map((s) => s.name),
      ['Three', 'One', 'Two']
    )

    // Editing and re-saving a budget must not fling it back to the top.
    const one = getScenarioById('a')
    one.name = 'One, edited'
    saveScenario(one)
    assert.deepEqual(
      listScenarios().map((s) => s.name),
      ['Three', 'One, edited', 'Two']
    )
  })

  test('a reorder never drops a budget it was not told about', () => {
    saveScenario(makeScenario('a', 'One'))
    saveScenario(makeScenario('b', 'Two'))
    // 'b' is missing from the arrangement — as it would be if another tab saved
    // it between this tab rendering the list and the drag finishing.
    reorderScenarios(['a'])
    assert.equal(listScenarios().length, 2)
  })

  test('a new budget lands at the top of an arranged list', () => {
    saveScenario(makeScenario('a', 'One'))
    saveScenario(makeScenario('b', 'Two'))
    reorderScenarios(['a', 'b'])
    saveScenario(makeScenario('c', 'Brand new'))
    assert.equal(listScenarios()[0].name, 'Brand new')
  })
})

describe('renaming in place', () => {
  test('renames without touching anything else', () => {
    const original = makeScenario('a', 'Before')
    original.enterprises[0].acres = 500
    saveScenario(original)

    assert.equal(renameScenario('a', 'After').ok, true)
    const stored = getScenarioById('a')
    assert.equal(stored.name, 'After')
    assert.equal(stored.enterprises[0].acres, 500, 'the budget itself is untouched')
  })

  test('renaming a budget that is gone reports rather than throws', () => {
    assert.deepEqual(renameScenario('nope', 'X'), { ok: false, error: 'NotFound' })
  })

  test('a rename does not overwrite unsaved work in another budget', () => {
    saveScenario(makeScenario('a', 'A'))
    saveScenario(makeScenario('b', 'B'))
    renameScenario('a', 'A renamed')
    assert.equal(getScenarioById('b').name, 'B')
    assert.equal(listScenarios().length, 2)
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
