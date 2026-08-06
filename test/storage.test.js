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
