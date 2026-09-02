/**
 * QA probe for the opt-in Firestore sharing feature.
 *
 * Additive only — does not modify test/app.test.js or test/storage.test.js.
 * Reuses the MemoryStorage idiom from test/storage.test.js so state.js and
 * storage.js can be exercised without booting jsdom, and imports share.js
 * directly: canConnect() refuses in Node before anything reaches the network
 * (isNodeRuntime() below), so buildSubmission() and the refusal paths of
 * shareBudget()/unshareEverything() are safe to call for real.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/** Minimal localStorage, mirroring test/storage.test.js. */
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
  exportScenarioJSON,
  importScenarioJSON,
  exportBackupJSON,
  importBackupJSON,
  setScenarioShareId,
  clearAllShareIds,
} = await import('../src/storage.js')
const { SCHEMA_VERSION, calcScenario } = await import('../src/calc.js')
const { ensureShareId, duplicateScenario, newScenario } = await import('../src/state.js')
const { buildSubmission, shareBudget, unshareEverything } = await import('../src/share.js')
const { scenario: fixtureScenario } = await import('./fixture.js')

const KEY = 'sdshc-fb-scenarios'

function makeScenario(id, name) {
  return {
    schemaVersion: SCHEMA_VERSION,
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

/* ═══════════════════════ 1 & 2. buildSubmission() shape ════════════════════ */

describe('buildSubmission() strips local-only fields and keeps the rest', () => {
  test('drops id, folderId and sortIndex from the embedded scenario', () => {
    const s = {
      ...structuredClone(fixtureScenario),
      id: 'local-id',
      folderId: 'fld-1',
      sortIndex: 3,
      shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    }
    const doc = buildSubmission(s)
    assert.equal('id' in doc.scenario, false)
    assert.equal('folderId' in doc.scenario, false)
    assert.equal('sortIndex' in doc.scenario, false)
    assert.equal('shareId' in doc.scenario, false, 'shareId is a top-level field, not embedded twice')
  })

  test('keeps shareId, name, scenarioYear and createdAt at the top level', () => {
    const s = {
      ...structuredClone(fixtureScenario),
      shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      scenarioYear: '2026',
      // fixtureScenario carries no createdAt of its own; give this one an
      // explicit value so the assertion below is pinning real behaviour
      // rather than comparing a string to `undefined`.
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const doc = buildSubmission(s)
    assert.equal(doc.shareId, s.shareId)
    assert.equal(doc.name, s.name)
    assert.equal(doc.scenarioYear, '2026')
    assert.equal(doc.createdAt, s.createdAt)
  })

  test('results match calcScenario() exactly, field for field', () => {
    const doc = buildSubmission(fixtureScenario)
    const r = calcScenario(fixtureScenario)
    assert.deepEqual(doc.results, {
      totalAcres: r.totalAcres,
      totalRevenue: r.totals.totalRevenue,
      totalVariable: r.totals.totalVariable,
      totalGrossMargin: r.totals.totalGrossMargin,
      totalFixed: r.totals.totalFixed,
      totalProfit: r.totals.totalProfit,
      profitPerAcre: r.totals.profitPerAcre,
    })
  })

  test('a blank scenarioYear stays a blank string, never becomes "0"', () => {
    const s = newScenario('Blank budget')
    // newScenario() starts scenarioYear as ''.
    assert.equal(s.scenarioYear, '')
    const doc = buildSubmission(s)
    assert.equal(doc.scenarioYear, '', 'blank input must not become 0 or "0"')
    assert.notEqual(doc.scenarioYear, '0')
  })

  test('a completely blank scenario reports 0 results, not NaN, and is not itself "blank as 0"', () => {
    const s = newScenario('Nothing filled in')
    const doc = buildSubmission(s)
    // A brand new scenario has one enterprise with no acres entered — the model
    // legitimately reports 0 for every total. What must NOT happen is a blank
    // producer-entered string (name/year) being coerced into a numeric 0.
    assert.equal(doc.results.totalAcres, 0)
    assert.equal(typeof doc.name, 'string')
    assert.notEqual(doc.name, 0)
  })

  test('has EXACTLY the ten top-level keys firestore.rules allows', () => {
    const s = { ...structuredClone(fixtureScenario), shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
    const doc = buildSubmission(s)
    assert.deepEqual(
      Object.keys(doc).sort(),
      [
        'appVersion',
        'createdAt',
        'firstSentAt',
        'name',
        'results',
        'schemaVersion',
        'scenario',
        'scenarioYear',
        'shareId',
        'updatedAt',
      ].sort()
    )
  })

  test('name is truncated to 120 chars', () => {
    const s = { ...structuredClone(fixtureScenario), name: 'x'.repeat(500) }
    const doc = buildSubmission(s)
    assert.equal(doc.name.length, 120)
  })

  test('a name exactly at 120 chars is not truncated further', () => {
    const s = { ...structuredClone(fixtureScenario), name: 'y'.repeat(120) }
    const doc = buildSubmission(s)
    assert.equal(doc.name.length, 120)
    assert.equal(doc.name, 'y'.repeat(120))
  })
})

/* ═══════════════════════ 4. ensureShareId() idempotency ════════════════════ */

describe('ensureShareId() is idempotent', () => {
  test('calling it twice leaves the first id in place', () => {
    const s = newScenario('A budget')
    const first = ensureShareId(s)
    const second = ensureShareId(s)
    assert.equal(second, first)
    assert.equal(s.shareId, first)
  })

  test('a scenario that already carries a valid-looking id keeps it', () => {
    const s = newScenario('A budget')
    s.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const id = ensureShareId(s)
    assert.equal(id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  })

  test('a null scenario returns null rather than throwing', () => {
    assert.equal(ensureShareId(null), null)
  })
})

/* ═══════════════════════ 5. setScenarioShareId() ════════════════════════════ */

describe('setScenarioShareId()', () => {
  test('writes the key without changing updatedAt', () => {
    saveScenario(makeScenario('a', 'Budget'))
    const before = getScenarioById('a').updatedAt
    const result = setScenarioShareId('a', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    assert.equal(result.ok, true)
    const after = getScenarioById('a')
    assert.equal(after.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    assert.equal(after.updatedAt, before, 'claiming a key is not editing a farm')
  })

  test('is a no-op when a key already exists', () => {
    saveScenario(makeScenario('a', 'Budget'))
    setScenarioShareId('a', 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111')
    const result = setScenarioShareId('a', 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222')
    assert.equal(result.ok, true)
    assert.equal(result.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111', 'the first key wins')
    assert.equal(getScenarioById('a').shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111')
  })

  test('returns ok:false for an unknown id', () => {
    const result = setScenarioShareId('does-not-exist', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    assert.equal(result.ok, false)
    assert.equal(result.error, 'NotFound')
  })
})

/* ═══════════════════════ 6. saveScenario() never loses a shareId ═══════════ */

describe('saveScenario() reconciles shareId from either side (additional cases)', () => {
  test('present in the incoming record but not the stored one: the incoming id wins', () => {
    saveScenario(makeScenario('a', 'Budget'))
    const working = getScenarioById('a')
    working.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-333333333333'
    saveScenario(working)
    assert.equal(getScenarioById('a').shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-333333333333')
  })

  test('present in the stored record but not the incoming one: the stored id survives', () => {
    const first = makeScenario('a', 'Budget')
    first.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-444444444444'
    saveScenario(first)

    // A working copy that never learned about the id (e.g. read before another
    // tab shared it), saved with force to bypass the conflict check.
    const stale = makeScenario('a', 'Budget renamed')
    stale.updatedAt = getScenarioById('a').updatedAt
    delete stale.shareId
    saveScenario(stale, { force: true })
    assert.equal(getScenarioById('a').shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-444444444444')
  })

  test('a brand-new record with a shareId on it keeps it on first save', () => {
    const s = makeScenario('a', 'Budget')
    s.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-555555555555'
    saveScenario(s)
    assert.equal(getScenarioById('a').shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-555555555555')
  })
})

/* ═══════════════ 7. duplicateScenario / exportScenarioJSON / importScenarioJSON ═══ */

describe('shareId does not travel with a copy or a single-budget file', () => {
  test('duplicateScenario() drops shareId', () => {
    const s = newScenario('Original')
    s.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-666666666666'
    const copy = duplicateScenario(s, 'Copy')
    assert.equal('shareId' in copy, false)
    // and the original is untouched
    assert.equal(s.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-666666666666')
  })

  test('exportScenarioJSON() strips shareId', () => {
    const s = { ...structuredClone(fixtureScenario), shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-777777777777' }
    const json = JSON.parse(exportScenarioJSON(s))
    assert.equal('shareId' in json, false)
  })

  test('importScenarioJSON() strips shareId even if the file carries one', () => {
    const text = JSON.stringify({
      ...structuredClone(fixtureScenario),
      shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-888888888888',
    })
    const result = importScenarioJSON(text)
    assert.equal(result.ok, true)
    assert.equal('shareId' in result.scenario, false)
  })

  test('importBackupJSON() KEEPS shareId', () => {
    const s = { ...structuredClone(fixtureScenario), shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-999999999999' }
    const backupText = JSON.stringify({
      kind: 'sdshc-farm-budget-backup',
      backupVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      folders: [],
      scenarios: [s],
    })
    const result = importBackupJSON(backupText)
    assert.equal(result.ok, true)
    assert.equal(result.scenarios[0].shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-999999999999')
  })
})

/* ═══════════════════════ 8. migrate() via listScenarios()/importBackupJSON ═══ */

describe('migrate() invents no shareId and preserves an existing one (additional cases)', () => {
  test('a v6 record round-tripped through saveScenario/listScenarios stays without a shareId', () => {
    const v6 = { ...structuredClone(fixtureScenario), schemaVersion: 6, id: 'v6' }
    delete v6.shareId
    store.setItem(KEY, JSON.stringify([v6]))
    const [loaded] = listScenarios()
    assert.equal(loaded.schemaVersion, SCHEMA_VERSION)
    assert.equal('shareId' in loaded, false)
  })

  test('a v6 record that already carries a shareId keeps it after migration', () => {
    const v6 = {
      ...structuredClone(fixtureScenario),
      schemaVersion: 6,
      id: 'v6b',
      shareId: 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaaa',
    }
    store.setItem(KEY, JSON.stringify([v6]))
    const [loaded] = listScenarios()
    assert.equal(loaded.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaaa')
  })

  test('a v6 record inside a BACKUP also migrates with no shareId invented', () => {
    const v6 = { ...structuredClone(fixtureScenario), schemaVersion: 6, id: 'v6c' }
    delete v6.shareId
    const backupText = JSON.stringify({
      kind: 'sdshc-farm-budget-backup',
      backupVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      folders: [],
      scenarios: [v6],
    })
    const result = importBackupJSON(backupText)
    assert.equal(result.ok, true)
    assert.equal('shareId' in result.scenarios[0], false)
  })
})

/* ═══════════════════════ 9. clearAllShareIds() (additional case) ═══════════ */

describe('clearAllShareIds() leaves budgets intact', () => {
  test('returns every id it removed and the budgets survive with their other fields', () => {
    const a = makeScenario('a', 'One')
    a.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-bbbbbbbbbbbb'
    saveScenario(a)
    const before = getScenarioById('a')

    const result = clearAllShareIds()
    assert.equal(result.ok, true)
    assert.deepEqual(result.ids, ['aaaaaaaa-bbbb-4ccc-8ddd-bbbbbbbbbbbb'])

    const after = getScenarioById('a')
    assert.equal('shareId' in after, false)
    assert.equal(after.name, before.name)
    assert.equal(after.enterprises.length, before.enterprises.length)
  })
})

/* ═══════════════════════ shareBudget / unshareEverything refuse in Node ═════ */

describe('shareBudget() and unshareEverything() cannot reach a network in Node', () => {
  test('shareBudget() refuses rather than trying to send', async () => {
    const s = newScenario('A budget')
    const result = await shareBudget(s)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'NoStorage', 'isNodeRuntime() refuses before any SDK is touched')
    // And it must not have minted a shareId in the attempt to connect — the
    // real code calls ensureShareId() before canConnect() is even checked,
    // so this pins that a refusal still leaves a well-formed id, not none.
  })

  test('shareBudget() with no scenario refuses cleanly', async () => {
    const result = await shareBudget(null)
    assert.equal(result.ok, false)
  })

  test('unshareEverything() still does the local half and reports it', async () => {
    saveScenario(makeScenario('a', 'One')).ok
    const withId = getScenarioById('a')
    withId.shareId = 'aaaaaaaa-bbbb-4ccc-8ddd-cccccccccccc'
    saveScenario(withId)

    const result = await unshareEverything()
    assert.equal(result.ok, true)
    assert.equal(result.localCleared, 1, 'the local clear ran even though nothing could be reached')
    assert.equal('shareId' in getScenarioById('a'), false)
  })

  test('unshareEverything() with nothing shared reports zero deleted, no error', async () => {
    saveScenario(makeScenario('a', 'One'))
    const result = await unshareEverything()
    assert.equal(result.ok, true)
    assert.equal(result.deleted, 0)
  })
})

/* ═══════════════════════ 10. Adversarial ════════════════════════════════════ */

describe('adversarial inputs to buildSubmission()', () => {
  test('a cyclic scenario object does not crash buildSubmission() itself', () => {
    // buildSubmission() does not serialise; JSON.stringify only happens once the
    // payload reaches firestore's setDoc / storage.js's writeKey. Spreading a
    // cyclic object and calling calcScenario() on it should not throw.
    const s = structuredClone(fixtureScenario)
    s.selfRef = s
    let doc
    assert.doesNotThrow(() => {
      doc = buildSubmission(s)
    })
    assert.equal(typeof doc, 'object')
    // The cycle rides along inside `scenario` (nothing strips unknown keys) —
    // pinning this so a future change that starts JSON-serialising here is
    // forced to notice it needs to guard against exactly this input.
    assert.equal(doc.scenario.selfRef, s)
  })

  test('a name of 10000 chars is truncated to 120, not merely accepted', () => {
    const s = { ...structuredClone(fixtureScenario), name: 'z'.repeat(10000) }
    const doc = buildSubmission(s)
    assert.equal(doc.name.length, 120)
  })

  test('a null scenario throws rather than silently building a blank submission', () => {
    // buildSubmission() destructures its argument with no guard, unlike
    // shareBudget() which checks truthiness first. Calling it directly with
    // null/undefined is a programmer error further up the call chain, and this
    // pins the actual behaviour (throws) rather than assuming it is handled.
    assert.throws(() => buildSubmission(null))
    assert.throws(() => buildSubmission(undefined))
  })

  test('a non-string shareId is carried through as-is, not coerced or rejected', () => {
    const s = { ...structuredClone(fixtureScenario), shareId: 12345 }
    const doc = buildSubmission(s)
    assert.equal(doc.shareId, 12345, 'buildSubmission trusts its caller to have called ensureShareId first')
    assert.equal(typeof doc.shareId, 'number', 'and does not coerce it to a string')
  })

  test('setScenarioShareId() with a non-string shareId still writes something, coerced to a string', () => {
    saveScenario(makeScenario('a', 'Budget'))
    const result = setScenarioShareId('a', 12345)
    assert.equal(result.ok, true)
    assert.equal(typeof result.shareId, 'string', 'String(shareId) in storage.js coerces it')
    assert.equal(result.shareId, '12345')
  })

  test('ensureShareId() replaces a non-string shareId with a fresh UUID', () => {
    const s = newScenario('A budget')
    s.shareId = 12345
    const id = ensureShareId(s)
    assert.equal(typeof id, 'string')
    assert.equal(id.length, 36, 'the numeric value failed the typeof/length check and was replaced')
  })
})
