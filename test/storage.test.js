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
  listFolders,
  saveFolder,
  deleteFolder,
  reorderFolders,
  moveScenarioToFolder,
  exportBackupJSON,
  importBackupJSON,
  replaceAll,
  clearAllShareIds,
} = await import('../src/storage.js')
const { SCHEMA_VERSION } = await import('../src/calc.js')

const KEY = 'sdshc-fb-scenarios'
const KEY_FOLDERS = 'sdshc-fb-folders'

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
    assert.equal(all[0].schemaVersion, SCHEMA_VERSION)
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
    assert.equal(all[0].schemaVersion, SCHEMA_VERSION)
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
    assert.equal(s.schemaVersion, SCHEMA_VERSION)
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

describe('v3 migration', () => {
  // v3 added `typicalYieldUnit` on a variable expense line: the yield unit a
  // figure taken from the picker was quoted against. A v2 budget has none, and
  // that absence is the correct state, not a gap to fill in — every number in an
  // old budget is one the producer either typed or accepted, and marking them
  // would make a later unit change delete work the app has no evidence is wrong.
  function v2Budget(line) {
    return [
      {
        schemaVersion: 2,
        id: 'a',
        name: 'Existing',
        updatedAt: '2026-01-01T00:00:00.000Z',
        enterprises: [
          { id: 'e1', name: '', crop: 'Corn', acres: 500, yieldUnit: 'bu', variable: { hauling: line } },
        ],
        fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
      },
    ]
  }

  test('a v2 budget comes forward without its figures being touched', () => {
    store.setItem(KEY, JSON.stringify(v2Budget({ mode: 'unit', costPerUnit: 0.2, unitsPerAcre: 180 })))
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, SCHEMA_VERSION)
    assert.equal(s.enterprises[0].variable.hauling.costPerUnit, 0.2)
    assert.equal(
      s.enterprises[0].variable.hauling.typicalYieldUnit,
      undefined,
      'a figure with no recorded provenance is left with none'
    )
  })

  test('a marker already on a line survives being read back', () => {
    store.setItem(
      KEY,
      JSON.stringify(v2Budget({ mode: 'unit', costPerUnit: 0.135, typicalYieldUnit: 'bu' }))
    )
    const [s] = listScenarios()
    assert.equal(s.enterprises[0].variable.hauling.typicalYieldUnit, 'bu')
  })
})

describe('v4 migration', () => {
  // v4 added `scenarioYear`, the crop year the budget is FOR. A v3 budget has
  // none, and the step deliberately does not invent one.
  function v3Budget() {
    return [
      {
        schemaVersion: 3,
        id: 'a',
        name: 'Existing',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        enterprises: [{ id: 'e1', name: '', crop: 'Corn', acres: 500, variable: {} }],
        fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
      },
    ]
  }

  test('a v3 budget comes forward with no scenario year invented for it', () => {
    store.setItem(KEY, JSON.stringify(v3Budget()))
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, SCHEMA_VERSION)
    // Guessing one from createdAt would be the tempting move and is wrong: a
    // 2027 plan is routinely built in 2026, so the timestamp says when someone
    // was at the keyboard and nothing about what they were planning for. The
    // filter would then find this budget under a year nobody chose.
    assert.equal(s.scenarioYear, undefined, 'the producer never stated one')
    assert.equal(s.name, 'Existing', 'and nothing else moved')
  })

  test('a scenario year already set survives being read back', () => {
    const [budget] = v3Budget()
    store.setItem(KEY, JSON.stringify([{ ...budget, scenarioYear: '2027' }]))
    const [s] = listScenarios()
    assert.equal(s.scenarioYear, '2027')
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

describe('v5 migration', () => {
  // v5 added `folderId`. A v4 budget is in no folder, and the step deliberately
  // writes nothing — absence already says exactly that.
  function v4Budget() {
    return [
      {
        schemaVersion: 4,
        id: 'a',
        name: 'Existing',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        enterprises: [{ id: 'e1', name: '', crop: 'Corn', acres: 500, variable: {} }],
        fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
      },
    ]
  }

  test('a v4 budget comes forward filed nowhere, with nothing written', () => {
    store.setItem(KEY, JSON.stringify(v4Budget()))
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, SCHEMA_VERSION)
    // Writing `folderId: null` across every stored record would be a full
    // rewrite of the store to restate what it already said, on a device whose
    // quota is the reason saveScenario has an error path at all.
    assert.equal(s.folderId, undefined)
    assert.equal(s.name, 'Existing', 'and nothing else moved')
  })

  test('a budget already filed keeps its folder through a read', () => {
    const [budget] = v4Budget()
    budget.folderId = 'fld-1'
    store.setItem(KEY, JSON.stringify([budget]))
    assert.equal(listScenarios()[0].folderId, 'fld-1')
  })
})

describe('v6 migration', () => {
  // v6 added two entry modes and the keys they read: seed's costPerBag /
  // seedsPerBag / population / seedsPerBagAuto, and crop insurance's totalCost.
  // The step deliberately writes nothing.
  function v5Budget() {
    return [
      {
        schemaVersion: 5,
        id: 'a',
        name: 'Existing',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        enterprises: [
          {
            id: 'e1',
            name: '',
            crop: 'Corn',
            acres: 500,
            variable: { seed: { mode: 'unit', costPerUnit: 320, unitsPerAcre: 0.35 } },
          },
        ],
        fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
      },
    ]
  }

  test('a v5 budget comes forward with none of the new keys invented', () => {
    store.setItem(KEY, JSON.stringify(v5Budget()))
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, SCHEMA_VERSION)

    const seed = s.enterprises[0].variable.seed
    // The keys are only ever read while `mode` names them, and this budget's
    // mode is 'unit', so they cannot be reached. Seeding them would rewrite
    // every stored record to add fields nothing will look at.
    assert.equal(seed.costPerBag, undefined)
    assert.equal(seed.seedsPerBag, undefined)
    assert.equal(seed.population, undefined)
    assert.equal(s.enterprises[0].variable.cropInsurance, undefined)
    assert.equal(seed.costPerUnit, 320, 'and the entry that was there is untouched')
  })

  test('seedsPerBagAuto is never invented, which matters more than the rest', () => {
    // The marker means "the app put this number here, so the app may replace
    // it". Stamping it onto a figure the producer typed would hand their own
    // work to the clearing logic in autofillSeedsPerUnit().
    store.setItem(KEY, JSON.stringify(v5Budget()))
    assert.equal(listScenarios()[0].enterprises[0].variable.seed.seedsPerBagAuto, undefined)
  })

  test('a budget already using the new modes keeps them through a read', () => {
    const [budget] = v5Budget()
    budget.enterprises[0].variable.seed = {
      mode: 'population',
      costPerBag: 285,
      seedsPerBag: 80000,
      population: 33000,
      seedsPerBagAuto: 'Corn',
    }
    budget.enterprises[0].variable.cropInsurance = { mode: 'total', totalCost: 3200 }
    store.setItem(KEY, JSON.stringify([budget]))

    const seed = listScenarios()[0].enterprises[0].variable.seed
    assert.equal(seed.mode, 'population')
    assert.equal(seed.population, 33000)
    assert.equal(seed.seedsPerBagAuto, 'Corn')
    assert.equal(listScenarios()[0].enterprises[0].variable.cropInsurance.totalCost, 3200)
  })
})

describe('folders', () => {
  beforeEach(() => {
    store.clear()
    store.failWrites = null
  })

  /** Make one folder and hand back the stored record, id and all. */
  function folder(name, extra = {}) {
    const result = saveFolder({ name, icon: 'sprout', color: 'green', ...extra })
    assert.equal(result.ok, true, `saving ${name}`)
    return result.folder
  }

  test('a folder is created, read back, and updated in place', () => {
    const made = folder('Corn trials')
    assert.equal(listFolders().length, 1)
    assert.equal(listFolders()[0].name, 'Corn trials')
    assert.equal(listFolders()[0].icon, 'sprout')

    saveFolder({ ...made, name: 'Corn trials 2026', color: 'pink' })
    assert.equal(listFolders().length, 1, 'updated, not duplicated')
    assert.equal(listFolders()[0].name, 'Corn trials 2026')
    assert.equal(listFolders()[0].color, 'pink')
    assert.equal(listFolders()[0].icon, 'sprout', 'and the icon it was not asked about is kept')
  })

  test('a new folder goes to the bottom', () => {
    folder('First')
    folder('Second')
    assert.deepEqual(
      listFolders().map((f) => f.name),
      ['First', 'Second']
    )
  })

  test('reordering assigns a rank, and never loses a folder it was not told about', () => {
    const a = folder('A')
    folder('B')
    const c = folder('C')
    // Only two of the three named — the same guarantee reorderScenarios makes,
    // for the same reason: another tab may have created one between render and
    // press, and it must not disappear because of that.
    assert.equal(reorderFolders([c.id, a.id]).ok, true)
    assert.deepEqual(
      listFolders().map((f) => f.name),
      ['C', 'A', 'B']
    )
    assert.deepEqual(
      listFolders().map((f) => f.sortIndex),
      [0, 1, 2]
    )
  })

  test('DELETING A FOLDER LEAVES EVERY BUDGET IN IT', () => {
    // The one that matters most. This app holds a producer's saved work in one
    // browser with no server behind it; an organising feature that can lose a
    // budget is worse than no organising feature.
    const f = folder('Corn trials')
    saveScenario(makeScenario('a', 'North quarter'))
    saveScenario(makeScenario('b', 'South quarter'))
    moveScenarioToFolder('a', f.id)
    moveScenarioToFolder('b', f.id)

    assert.equal(deleteFolder(f.id).ok, true)
    assert.equal(listFolders().length, 0)

    const left = listScenarios()
    assert.equal(left.length, 2, 'both budgets survive')
    assert.deepEqual(
      left.map((s) => s.folderId),
      [undefined, undefined],
      'and come back un-filed'
    )
    assert.equal(getScenarioById('a').enterprises.length, 1, 'with their contents intact')
  })

  test('deleting a folder that is already gone reports rather than throws', () => {
    assert.deepEqual(deleteFolder('nope'), { ok: false, error: 'NotFound' })
  })

  test('a folderId naming a folder that no longer exists is still readable', () => {
    // The state after a folder is deleted in another tab, and after an unlucky
    // partial write. The record must survive; the Saved tab draws it in the
    // ungrouped pile (see the app tests).
    saveScenario(makeScenario('a', 'Orphan'))
    moveScenarioToFolder('a', 'fld-gone')
    assert.equal(listFolders().length, 0)
    assert.equal(listScenarios().length, 1)
    assert.equal(getScenarioById('a').folderId, 'fld-gone')
  })

  test('a corrupt folders key costs the folders and not one budget', () => {
    saveScenario(makeScenario('a', 'Keep me'))
    for (const junk of ['not json', '{}', '"a string"', 'null']) {
      store.setItem(KEY_FOLDERS, junk)
      assert.deepEqual(listFolders(), [], `${junk} reads as no folders`)
      assert.equal(listScenarios().length, 1, `${junk} leaves the budgets alone`)
    }
  })

  test('one malformed folder is skipped, not fatal to the rest', () => {
    store.setItem(
      KEY_FOLDERS,
      JSON.stringify([
        { id: 'f1', name: 'Good' },
        null,
        42,
        { name: 'no id' },
        { id: 'f2', name: 'Also good' },
      ])
    )
    assert.deepEqual(
      listFolders().map((f) => f.name),
      ['Good', 'Also good']
    )
  })

  test('every folder write reports a full store instead of throwing', () => {
    const f = folder('Corn trials')
    saveScenario(makeScenario('a', 'North'))
    moveScenarioToFolder('a', f.id)
    store.failWrites = 'QuotaExceededError'

    for (const [label, run] of [
      ['saveFolder', () => saveFolder({ name: 'New' })],
      ['saveFolder update', () => saveFolder({ ...f, name: 'Renamed' })],
      ['reorderFolders', () => reorderFolders([f.id])],
      ['deleteFolder', () => deleteFolder(f.id)],
      ['moveScenarioToFolder', () => moveScenarioToFolder('a', '')],
    ]) {
      const result = run()
      assert.equal(result.ok, false, `${label} reports`)
      assert.equal(result.error, 'QuotaExceededError', `${label} says why`)
    }
  })

  test('filing a budget is not editing it, so the saved date does not move', () => {
    // The date on the row is the producer's record of when they last worked on
    // that farm. Bumping it would also manufacture a save conflict in another
    // tab over an operation that changed no figure.
    saveScenario(makeScenario('a', 'North'))
    const before = getScenarioById('a').updatedAt
    const f = folder('Corn trials')
    assert.equal(moveScenarioToFolder('a', f.id).ok, true)
    assert.equal(getScenarioById('a').updatedAt, before)
  })

  test('filing writes only that budget, never the whole working scenario over it', () => {
    // The Saved tab files a row that may not be the budget open on the Budget
    // tab. Same hazard renameScenario() is built to avoid.
    const original = makeScenario('a', 'North')
    original.enterprises[0].acres = 500
    saveScenario(original)
    saveScenario(makeScenario('b', 'South'))

    const f = folder('Corn trials')
    moveScenarioToFolder('a', f.id)

    assert.equal(getScenarioById('a').enterprises[0].acres, 500)
    assert.equal(getScenarioById('b').name, 'South')
    assert.equal(getScenarioById('b').folderId, undefined)
  })

  test('moving to no folder un-files rather than storing an empty string', () => {
    const f = folder('Corn trials')
    saveScenario(makeScenario('a', 'North'))
    moveScenarioToFolder('a', f.id)
    assert.equal(moveScenarioToFolder('a', '').ok, true)
    assert.equal(getScenarioById('a').folderId, undefined)
  })

  test('filing a budget that is gone reports rather than throws', () => {
    assert.deepEqual(moveScenarioToFolder('nope', 'fld-1'), { ok: false, error: 'NotFound' })
  })

  test('saving from the Budget tab cannot un-file a budget, or re-file it', () => {
    // Open a budget, go to Saved, file it, come back and save. The working copy
    // in memory was read BEFORE the move and still says the old folder — so the
    // stored value has to win, in both directions.
    const working = makeScenario('a', 'North')
    saveScenario(working)
    const f = folder('Corn trials')
    moveScenarioToFolder('a', f.id)

    saveScenario(working) // still carrying no folderId at all
    assert.equal(getScenarioById('a').folderId, f.id, 'the filing survives the save')

    moveScenarioToFolder('a', '')
    saveScenario({ ...working, folderId: f.id }) // now the stale copy, the other way round
    assert.equal(getScenarioById('a').folderId, undefined, 'and so does the un-filing')
  })

  test('a folder never travels in an exported budget file', () => {
    const f = folder('Corn trials')
    saveScenario(makeScenario('a', 'North'))
    moveScenarioToFolder('a', f.id)

    const text = exportScenarioJSON(getScenarioById('a'))
    assert.equal(text.includes('folderId'), false, 'nothing about folders goes out')

    // And a file that carries one anyway — hand-edited, or written by some
    // future version — lands un-filed. An id from another device means nothing
    // here except by an unlucky collision.
    const back = importScenarioJSON(JSON.stringify({ ...getScenarioById('a'), folderId: f.id }))
    assert.equal(back.ok, true)
    assert.equal(back.scenario.folderId, undefined)
  })
})

/**
 * Backup and restore.
 *
 * The single destructive operation in the app, on the one kind of data it holds
 * that cannot be regenerated. Everything here is about the two failures that
 * matter: a restore that loses budgets it should not have touched, and a backup
 * that does not hold what somebody thought it held.
 */
describe('backup and restore', () => {
  function folder(name, extra = {}) {
    const result = saveFolder({ name, icon: 'sprout', color: 'green', ...extra })
    assert.equal(result.ok, true, `saving ${name}`)
    return result.folder
  }

  test('a backup holds every budget, every folder, and the filing between them', () => {
    const f = folder('Corn trials')
    saveScenario(makeScenario('a', 'North'))
    saveScenario(makeScenario('b', 'South'))
    moveScenarioToFolder('a', f.id)

    const parsed = JSON.parse(exportBackupJSON())
    assert.equal(parsed.scenarios.length, 2)
    assert.equal(parsed.folders.length, 1)
    assert.equal(
      parsed.scenarios.find((s) => s.id === 'a').folderId,
      f.id,
      'membership travels, unlike in a single-budget file'
    )
    assert.equal(parsed.schemaVersion, SCHEMA_VERSION)
  })

  test('a round trip through an empty device puts the list back as it was', () => {
    const trials = folder('Corn trials')
    saveScenario(makeScenario('a', 'North'))
    saveScenario(makeScenario('b', 'South'))
    moveScenarioToFolder('a', trials.id)
    const text = exportBackupJSON()

    store.clear()
    assert.equal(listScenarios().length, 0, 'the device starts empty')

    const read = importBackupJSON(text)
    assert.equal(read.ok, true)
    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)

    assert.deepEqual(
      listScenarios()
        .map((s) => s.name)
        .sort(),
      ['North', 'South']
    )
    assert.equal(listFolders().length, 1)
    assert.equal(getScenarioById('a').folderId, trials.id, 'still filed where it was')
  })

  test('restoring REPLACES — a budget not in the file is gone', () => {
    // The whole reason the dialog in main.js states both counts. If this ever
    // becomes a merge, that dialog is lying.
    saveScenario(makeScenario('a', 'North'))
    const text = exportBackupJSON()
    saveScenario(makeScenario('b', 'Saved after the backup'))

    const read = importBackupJSON(text)
    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)
    assert.deepEqual(
      listScenarios().map((s) => s.id),
      ['a']
    )
  })

  test('a full store abandons the restore with nothing changed', () => {
    saveScenario(makeScenario('a', 'North'))
    const read = importBackupJSON(exportBackupJSON())
    store.failWrites = 'QuotaExceededError'

    const result = replaceAll(read.scenarios, read.folders)
    assert.equal(result.ok, false)
    assert.equal(result.budgetsRestored, undefined, 'it did not get as far as the folders')

    store.failWrites = null
    assert.equal(listScenarios().length, 1, 'and the device still holds what it did')
  })

  test('one unreadable record in a backup does not cost the rest', () => {
    const text = JSON.stringify({
      kind: 'sdshc-farm-budget-backup',
      scenarios: [makeScenario('a', 'North'), null, 'not an object', { name: 'no id' }],
      folders: [{ id: 'f1', name: 'Trials' }, null, { name: 'no id' }],
    })
    const read = importBackupJSON(text)
    assert.equal(read.ok, true)
    assert.deepEqual(
      read.scenarios.map((s) => s.id),
      ['a']
    )
    assert.deepEqual(
      read.folders.map((f) => f.id),
      ['f1']
    )
  })

  test('an old budget in a backup comes forward, and nothing is invented', () => {
    const old = makeScenario('a', 'North') // schemaVersion 1
    const read = importBackupJSON(
      JSON.stringify({ kind: 'sdshc-farm-budget-backup', scenarios: [old], folders: [] })
    )
    assert.equal(read.scenarios[0].schemaVersion, SCHEMA_VERSION)
    assert.equal(read.scenarios[0].scenarioYear, undefined, 'no year was guessed')
  })

  test('an empty backup is refused rather than used to wipe the device', () => {
    const result = importBackupJSON(
      JSON.stringify({ kind: 'sdshc-farm-budget-backup', scenarios: [], folders: [] })
    )
    assert.equal(result.ok, false)
    assert.match(result.error, /no budgets/)
  })

  test('the two file types name each other rather than refusing as unreadable', () => {
    // Both are .json and both came out of this app, so the extension says
    // nothing. Each control has to point at the other one.
    saveScenario(makeScenario('a', 'North'))
    const oneBudget = exportScenarioJSON(getScenarioById('a'))
    const wholeTab = exportBackupJSON()

    const asBackup = importBackupJSON(oneBudget)
    assert.equal(asBackup.ok, false)
    assert.match(asBackup.error, /upload a budget file/)

    const asBudget = importScenarioJSON(wholeTab)
    assert.equal(asBudget.ok, false)
    assert.match(asBudget.error, /Restore backup/)
  })

  test('a file from somewhere else is refused, not thrown on', () => {
    for (const text of ['', 'not json at all', '[]', '{"kind":"something-else"}']) {
      const result = importBackupJSON(text)
      assert.equal(result.ok, false, `refused: ${text}`)
      assert.equal(typeof result.error, 'string')
    }
  })
})

/**
 * A .json file is a text file, and the producer picked it. It may have been hand
 * edited, written by a different build, or repaired by somebody in a text editor
 * after a bad transfer. None of that may cost a budget or take the tab down.
 */
describe('a backup file nobody in this app wrote', () => {
  const asBackup = (scenarios, folders = []) =>
    JSON.stringify({ kind: 'sdshc-farm-budget-backup', scenarios, folders })

  test('an id that is not a string is made one', () => {
    // Every action on the Saved tab compares against a `data-id` read off the
    // DOM, which is always a string. A number matches nothing under ===, so the
    // row rendered and was counted while Open, Delete, Duplicate, Move and the
    // arrows all quietly did nothing to it.
    const read = importBackupJSON(asBackup([{ ...makeScenario('x', 'North'), id: 12345 }]))
    assert.equal(read.ok, true)
    assert.equal(read.scenarios[0].id, '12345')

    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)
    assert.ok(getScenarioById('12345'), 'the id the DOM will ask for is the id that is there')
  })

  test('a folderId that is not a string still files the budget', () => {
    const read = importBackupJSON(
      asBackup([{ ...makeScenario('a', 'North'), folderId: 7 }], [{ id: 7, name: 'Trials' }])
    )
    assert.equal(read.scenarios[0].folderId, '7')
    assert.equal(read.folders[0].id, '7', 'folders were always coerced; budgets now match')
  })

  test('an id used twice keeps both budgets, and both can be opened', () => {
    // Dropping the second would honour the file and lose somebody's work, which
    // is the one thing this tab may not do. Leaving them both on one id is worse
    // still: find() resolves the first every time, so the second row opens the
    // first record and saving it overwrites the first budget.
    const read = importBackupJSON(
      asBackup([makeScenario('dup', 'First'), makeScenario('dup', 'Second')])
    )
    assert.equal(read.scenarios.length, 2, 'neither is dropped')
    const ids = read.scenarios.map((s) => s.id)
    assert.equal(new Set(ids).size, 2, 'and they no longer share an id')
    assert.equal(ids[0], 'dup', 'the first keeps the id it arrived with')

    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)
    assert.deepEqual(
      listScenarios()
        .map((s) => s.name)
        .sort(),
      ['First', 'Second']
    )
    for (const id of ids) assert.ok(getScenarioById(id), `${id} opens`)
  })

  test('a shape the app cannot use is repaired rather than skipped', () => {
    // `??=` replaces null and undefined and nothing else, so a string here left
    // the string standing and the next line assigned a property onto a
    // primitive — a TypeError, from a module that promises never to throw.
    const read = importBackupJSON(
      asBackup([{ id: 'a', name: 'Odd', fixed: 'x', enterprises: 12345 }])
    )
    assert.equal(read.ok, true)
    assert.equal(read.scenarios.length, 1, 'the budget survives, rather than being skipped')
    assert.deepEqual(read.scenarios[0].enterprises, [])
    assert.deepEqual(read.scenarios[0].fixed.equipment, [])
    // It carries no schemaVersion, so it migrates from v0 and the v1 → v2 step
    // stamps the labour basis onto the container this repair just supplied.
    assert.equal(read.scenarios[0].fixed.labor.hoursBasis, 'year')
  })

  test('a version above every migration step still gets its containers', () => {
    // Each step is gated on `version < N`, so a record claiming a version above
    // all of them skips every one. The containers cannot be conditional on the
    // version being a number we recognise.
    const read = importBackupJSON(asBackup([{ id: 'a', name: 'From a later build', schemaVersion: 999999 }]))
    assert.equal(read.ok, true)
    assert.deepEqual(read.scenarios[0].enterprises, [])
    assert.deepEqual(read.scenarios[0].fixed.annual, {})
  })

  test('a single-budget file with the same damage comes back usable', () => {
    const result = importScenarioJSON(JSON.stringify({ enterprises: [], fixed: 'x' }))
    assert.equal(result.ok, true)
    assert.deepEqual(result.scenario.fixed.buildings, [])
  })
})

/**
 * The map behind this holds what THIS tab last saw. A restore does not change
 * that, which is why it is no longer emptied — emptying it did not reset the
 * check, it switched it off, because the check is guarded on having seen the
 * record at all.
 */
describe('the save after a restore', () => {
  test('a copy read before the restore is not written over it unasked', () => {
    saveScenario(makeScenario('a', 'Mine'))
    const mine = getScenarioById('a')

    const older = { ...makeScenario('a', 'From the backup'), updatedAt: '2020-01-01T00:00:00.000Z' }
    const read = importBackupJSON(
      JSON.stringify({ kind: 'sdshc-farm-budget-backup', scenarios: [older], folders: [] })
    )
    assert.equal(replaceAll(read.scenarios, read.folders).ok, true)

    // The restored record is OLDER than the copy in hand, which is the ordinary
    // case: a backup is by definition from the past. Compared with `>` this read
    // as nobody having touched it, and the save went straight through.
    mine.name = 'Mine, edited'
    const blocked = saveScenario(mine)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.error, 'Conflict')
    assert.equal(listScenarios()[0].name, 'From the backup', 'the restore is still there')

    assert.equal(saveScenario(mine, { force: true }).ok, true, 'and the producer can still say yes')
  })

  test('an ordinary read, edit, and save is not interrupted', () => {
    saveScenario(makeScenario('a', 'Corn'))
    const mine = getScenarioById('a')
    mine.name = 'Corn, edited'
    assert.equal(saveScenario(mine).ok, true)
    mine.name = 'Corn, edited again'
    assert.equal(saveScenario(mine).ok, true, 'each write updates what this tab has seen')
  })
})

describe('reporting instead of throwing', () => {
  test('a budget that refers to itself is reported, not thrown on', () => {
    // structuredClone SUPPORTS cycles, so saveScenario's own NotSerializable
    // guard passed this record along and the throw landed one layer further in,
    // at a JSON.stringify that used to sit outside every try in the file.
    const scenario = makeScenario('a', 'Loop')
    scenario.enterprises[0].self = scenario.enterprises[0]
    const result = saveScenario(scenario)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'NotSerializable')
  })

  test('and so is one arriving through a restore', () => {
    const scenario = makeScenario('a', 'Loop')
    scenario.self = scenario
    const result = replaceAll([scenario], [])
    assert.equal(result.ok, false)
    assert.equal(result.error, 'NotSerializable')
    assert.equal(listScenarios().length, 0, 'and nothing was written')
  })

  test('a folder that refers to itself leaves the budgets standing', () => {
    const bad = { id: 'f1', name: 'Trials' }
    bad.self = bad
    const result = replaceAll([makeScenario('a', 'North')], [bad])
    assert.equal(result.ok, false)
    assert.equal(result.budgetsRestored, true)
    assert.equal(listScenarios().length, 1, 'budgets first is what makes this survivable')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   v7 — shareId, the key of a budget's record with the Coalition
   ══════════════════════════════════════════════════════════════════════════ */

describe('v7 migration', () => {
  // The step deliberately writes nothing, and this is the version where
  // inventing a value would do real harm rather than merely waste a write: a
  // shareId means "this budget has been sent", so stamping one onto stored
  // records would claim a consent nobody gave.
  function v6Budget() {
    return [
      {
        schemaVersion: 6,
        id: 'a',
        name: 'Existing',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        enterprises: [{ id: 'e1', crop: 'Corn', acres: 500 }],
        fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
      },
    ]
  }

  test('a v6 budget comes forward with no shareId invented', () => {
    store.setItem(KEY, JSON.stringify(v6Budget()))
    const [s] = listScenarios()
    assert.equal(s.schemaVersion, SCHEMA_VERSION)
    assert.equal('shareId' in s, false, 'never sent is the correct state, and absence says it')
  })

  test('a budget that already has one keeps it through a read', () => {
    const records = v6Budget()
    records[0].shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    store.setItem(KEY, JSON.stringify(records))
    const [s] = listScenarios()
    assert.equal(s.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  })
})

describe('shareId is stripped in three places and kept in one', () => {
  const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

  function shared(id = 'a') {
    const s = makeScenario(id, 'Shared budget')
    s.shareId = ID
    return s
  }

  test('a single-budget export strips it', () => {
    // Stronger reason than folderId's. A folder id that travels is meaningless
    // on the far device; a shareId that travels still RESOLVES, so two people
    // would hold the key to one record and whoever saved last would overwrite
    // the other in a store neither of them can look at.
    const json = JSON.parse(exportScenarioJSON(shared()))
    assert.equal('shareId' in json, false)
    assert.equal(json.name, 'Shared budget', 'and the rest of the budget travels')
  })

  test('an import drops one that arrives anyway', () => {
    // The export strips it, so a file the app wrote carries none. This covers
    // the hand-edited file and the file that predates the strip.
    const text = JSON.stringify({ ...shared(), shareId: ID })
    const result = importScenarioJSON(text)
    assert.equal(result.ok, true)
    assert.equal('shareId' in result.scenario, false)
  })

  test('a backup keeps it, because a restore is the same device', () => {
    // The asymmetry with the two above is the whole point. A restore puts a
    // budget back where it came from, so the id still names that device's own
    // record; dropping it would orphan the record, still held by the Coalition
    // and no longer removable by turning sharing off.
    saveScenario(shared())
    const backup = JSON.parse(exportBackupJSON())
    assert.equal(backup.scenarios[0].shareId, ID)
    const back = importBackupJSON(JSON.stringify(backup))
    assert.equal(back.ok, true)
    assert.equal(back.scenarios[0].shareId, ID)
  })
})

describe('a save never loses a shareId', () => {
  const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

  test('the stored id is adopted when the working copy has none', () => {
    // A share done in another tab is invisible to this copy. Ignoring the
    // stored id would mint a second one and leave the first record unreachable
    // forever: reads are denied, so nothing could update or delete it, and
    // "turning sharing off deletes what this device sent" would stop being
    // true without anything on screen to say so.
    const s = makeScenario('a', 'Budget')
    saveScenario(s)
    const stored = JSON.parse(store.getItem(KEY))
    stored[0].shareId = ID
    store.setItem(KEY, JSON.stringify(stored))

    const stale = { ...makeScenario('a', 'Budget'), updatedAt: stored[0].updatedAt }
    assert.equal('shareId' in stale, false)
    saveScenario(stale, { force: true })
    assert.equal(getScenarioById('a').shareId, ID, 'the record is still reachable')
  })

  test('the working copy wins when it has one', () => {
    // share.js writes the id onto the working scenario and saves in the same
    // breath, so the stored record has none yet. Letting absence win — the rule
    // folderId follows — would delete it on the way to disk.
    const s = makeScenario('a', 'Budget')
    saveScenario(s)
    const fresh = getScenarioById('a')
    fresh.shareId = ID
    saveScenario(fresh)
    assert.equal(getScenarioById('a').shareId, ID)
  })
})

describe('withdrawing consent clears every key and says which they were', () => {
  test('the ids come back so the remote half can run', () => {
    // Returned BEFORE being cleared, and the caller deletes remotely only after
    // this succeeds. The other order loses the list on a failed write: the
    // documents would be gone while the budgets still named them.
    const a = makeScenario('a', 'One')
    a.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111'
    const b = makeScenario('b', 'Two')
    b.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222'
    saveScenario(a)
    saveScenario(b)
    saveScenario(makeScenario('c', 'Never shared'))

    const result = clearAllShareIds()
    assert.equal(result.ok, true)
    assert.deepEqual(result.ids.sort(), [
      'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
      'aaaaaaaa-bbbb-4ccc-8ddd-222222222222',
    ])
    for (const s of listScenarios()) {
      assert.equal('shareId' in s, false, `${s.name} no longer names a record`)
    }
    assert.equal(listScenarios().length, 3, 'and no budget was deleted')
  })

  test('a device that never shared reports nothing and writes nothing', () => {
    saveScenario(makeScenario('a', 'One'))
    const before = store.getItem(KEY)
    const result = clearAllShareIds()
    assert.equal(result.ok, true)
    assert.deepEqual(result.ids, [])
    assert.equal(store.getItem(KEY), before, 'the store is untouched')
  })

  test('a failed write reports rather than half-clearing', () => {
    const a = makeScenario('a', 'One')
    a.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111'
    saveScenario(a)
    store.failWrites = 'QuotaExceededError'
    const result = clearAllShareIds()
    assert.equal(result.ok, false)
    store.failWrites = null
    assert.equal(getScenarioById('a').shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111')
  })
})
