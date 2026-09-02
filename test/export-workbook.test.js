/**
 * The workbook builder: seven sheets at three grains, from one batch.
 *
 * These assertions are about SHAPE rather than about arithmetic. calc.test.js
 * already proves the model against real spreadsheet output, and this file
 * imports the same calcScenario(), so re-checking the totals here would be
 * testing that `=` works. What can go wrong in a flattener is different and is
 * what is covered below: a sheet at the wrong grain, a column set that moves
 * between batches, a blank that turns into a zero, and a header taken from a
 * row that happened to be sparse.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorkbook,
  headersFor,
  toCSV,
  exportStem,
  SHEETS,
} from '../src/export-workbook.js'
import { VARIABLE_LINES } from '../src/calc.js'
import {
  newScenario,
  newEnterprise,
  newEquipment,
  newBuilding,
} from '../src/state.js'

/* ─────────────────────────────── fixtures ──────────────────────────────── */

function submission(scenario, over = {}) {
  return {
    shareId: over.shareId ?? 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: scenario.name,
    scenarioYear: scenario.scenarioYear ?? '',
    createdAt: scenario.createdAt,
    firstSentAt: Date.UTC(2026, 2, 1),
    updatedAt: Date.UTC(2026, 2, 2),
    schemaVersion: scenario.schemaVersion,
    appVersion: '1.0.0',
    scenario,
    ...over,
  }
}

/** A two-enterprise farm with one machine and one building. */
function fullFarm() {
  const s = newScenario('Big Farm')
  s.scenarioYear = '2027'
  Object.assign(s.enterprises[0], {
    name: 'No-till corn',
    crop: 'Corn',
    acres: '500',
    yieldPerAcre: '180',
    pricePerUnit: '4.50',
  })
  s.enterprises[0].variable.seed.costPerUnit = '3.80'
  s.enterprises[0].variable.seed.unitsPerAcre = '30'

  const beans = newEnterprise('Soybeans')
  Object.assign(beans, { acres: '300', yieldPerAcre: '55', pricePerUnit: '11' })
  s.enterprises.push(beans)

  s.fixed.landRentPerAcre = '120'
  const eq = newEquipment()
  Object.assign(eq, {
    name: 'Tractor',
    initialCost: '200000',
    salvageValue: '40000',
    usefulLife: '10',
    interestRate: '6',
  })
  s.fixed.equipment.push(eq)
  const b = newBuilding()
  Object.assign(b, { name: 'Shed', initialCost: '50000', usefulLife: '20', interestRate: '6' })
  s.fixed.buildings.push(b)
  return s
}

/** One enterprise, no machinery, nothing filled in beyond the acres. */
function bareFarm() {
  const s = newScenario('Small Farm')
  s.enterprises[0].crop = 'Wheat'
  s.enterprises[0].acres = '80'
  return s
}

/* ────────────────────────────── the contract ───────────────────────────── */

describe('every sheet can be joined back to its budget', () => {
  test('all seven exist and lead with shareId and Budget name', () => {
    // The one rule the whole set obeys. Everything else in the workbook is a
    // choice about grain and width; this is what makes a pivot table or a
    // VLOOKUP possible at all, so it is asserted for every sheet rather than
    // spot-checked.
    const { sheets } = buildWorkbook([submission(fullFarm())])
    assert.deepEqual(Object.keys(sheets).sort(), [...SHEETS].sort())
    for (const name of SHEETS) {
      const rows = sheets[name]
      assert.ok(rows.length > 0, `${name} has rows`)
      assert.deepEqual(
        headersFor(rows).slice(0, 2),
        ['shareId', 'Budget name'],
        `${name} leads with the join columns`
      )
      for (const row of rows) {
        assert.equal(row.shareId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', `${name} carries the id`)
        assert.equal(row['Budget name'], 'Big Farm', `${name} carries the name`)
      }
    }
  })

  test('every sheet carries the Deleted column, blank while the budget is live', () => {
    // DELETING A BUDGET MARKS ITS RECORD AND KEEPS THE FIGURES, so the workbook
    // has rows in it for plans nobody has on screen any more. A reader who
    // cannot see which is which averages them in without knowing, and the
    // question can be asked at any grain — so this rides with the identity
    // block on every sheet rather than living on the summary one.
    const { sheets } = buildWorkbook([submission(fullFarm())])
    for (const name of SHEETS) {
      assert.equal(headersFor(sheets[name])[2], 'Deleted', `${name} has it, third`)
      for (const row of sheets[name]) {
        // Blank, never "No". A column of "No" with the occasional "Yes" hides
        // the thing being looked for.
        assert.equal(row.Deleted, '', `${name} says nothing about a live budget`)
      }
    }
  })

  test('and dates it once the record is marked', () => {
    const { sheets } = buildWorkbook([
      submission(fullFarm(), { deletedAt: Date.UTC(2026, 4, 17, 12, 30) }),
    ])
    for (const name of SHEETS) {
      for (const row of sheets[name]) {
        assert.match(row.Deleted, /^2026-05-17 /, `${name} carries the date`)
      }
    }
  })

  test('a marked record keeps every figure it last sent', () => {
    // The mark is a merge that writes two fields and omits the rest, which is
    // what keeps the figures. A row for a deleted budget is as good as any
    // other; what changed is that it will never be updated again.
    const live = buildWorkbook([submission(fullFarm())]).sheets.Budgets[0]
    const marked = buildWorkbook([submission(fullFarm(), { deletedAt: 1 })]).sheets.Budgets[0]
    for (const key of Object.keys(live)) {
      if (key === 'Deleted') continue
      assert.deepEqual(marked[key], live[key], `${key} is unchanged`)
    }
  })

  test('the tabs are in a stated order, not a set', () => {
    // The order is what somebody sees along the bottom of Excel, and "All data"
    // being first is the point of it: it is the sheet most questions are
    // answered from.
    assert.deepEqual(SHEETS, [
      'All data',
      'Budgets',
      'Enterprises',
      'Enterprises all data',
      'Variable lines',
      'Fixed costs',
      'Equipment and buildings',
    ])
  })
})

describe('the three grains', () => {
  const batch = [submission(fullFarm()), submission(bareFarm(), { shareId: 'ffffffff-1111-4222-8333-444444444444' })]

  test('one row per budget on All data, Budgets, and Fixed costs', () => {
    // The counting sheets. A budget appears exactly once, so `COUNT` on these
    // is a count of farms — which is not true of the other four, and is the
    // single most likely way for this workbook to be misread.
    const { sheets, count } = buildWorkbook(batch)
    assert.equal(count, 2)
    for (const name of ['All data', 'Budgets', 'Fixed costs']) {
      assert.equal(sheets[name].length, 2, `${name} has one row per budget`)
    }
  })

  test('one row per enterprise on both enterprise sheets', () => {
    const { sheets } = buildWorkbook(batch)
    // Two enterprises plus one.
    assert.equal(sheets.Enterprises.length, 3)
    assert.equal(sheets['Enterprises all data'].length, 3)
  })

  test('one row per line and per item on the rest', () => {
    const { sheets } = buildWorkbook(batch)
    assert.equal(sheets['Variable lines'].length, 3 * VARIABLE_LINES.length)
    // One machine and one building, from the first budget only.
    assert.equal(sheets['Equipment and buildings'].length, 2)
    assert.deepEqual(
      sheets['Equipment and buildings'].map((r) => r.Kind),
      ['equipment', 'building']
    )
  })

  test('a budget with no machinery still appears on Fixed costs', () => {
    // The trap that comes with splitting equipment onto its own grain. The bare
    // farm contributes no item rows at all, and if fixed costs had been merged
    // into that sheet its land rent would have vanished from the workbook.
    const { sheets } = buildWorkbook([submission(bareFarm())])
    assert.equal(sheets['Equipment and buildings'].length, 0)
    assert.equal(sheets['Fixed costs'].length, 1)
    assert.ok('Land rent $/acre' in sheets['Fixed costs'][0])
  })
})

describe('Enterprises all data repeats the budget on every row', () => {
  test('the same fixed cost lands on each enterprise', () => {
    // This repetition is the reason the sheet exists: it is what lets somebody
    // filter to one crop across every budget and still see the farm behind it.
    // It is also why a fixed cost must never be SUMMED down this sheet, which
    // docs/DATA-EXPORT.md says in the reader's language.
    const { sheets } = buildWorkbook([submission(fullFarm())])
    const rows = sheets['Enterprises all data']
    assert.equal(rows.length, 2)
    assert.equal(rows[0]['Land rent $/acre'], rows[1]['Land rent $/acre'])
    assert.equal(rows[0]['Total profit $'], rows[1]['Total profit $'])
    assert.notEqual(rows[0].Crop, rows[1].Crop, 'while the enterprise half differs')
  })

  test('the narrow sheet is not the wide one', () => {
    const { sheets } = buildWorkbook([submission(fullFarm())])
    const narrow = headersFor(sheets.Enterprises)
    const wide = headersFor(sheets['Enterprises all data'])
    assert.ok(wide.length > narrow.length * 2, 'the wide one is substantially wider')
    assert.ok(!narrow.includes('Land rent $/acre'), 'the narrow one carries no budget context')
    assert.ok(wide.includes('Land rent $/acre'))
  })
})

describe('All data is a rectangle whatever is in the batch', () => {
  test('every row has the same columns', () => {
    // A row built from a one-enterprise budget must still carry the ent2_
    // columns, empty, or the sheet stops being a table.
    const { sheets } = buildWorkbook([
      submission(bareFarm()),
      submission(fullFarm(), { shareId: 'ffffffff-1111-4222-8333-444444444444' }),
    ])
    const rows = sheets['All data']
    const headers = headersFor(rows)
    for (const row of rows) {
      assert.equal(Object.keys(row).length, headers.length, 'no row is short')
    }
    assert.ok(headers.includes('ent2_Crop'), 'the widest budget decides the width')
  })

  test('the column count follows the data, not a guess', () => {
    // A batch of one-enterprise budgets must not carry blocks for enterprises
    // nobody has. This is what stops the sheet being ninety columns of blanks.
    const narrow = buildWorkbook([submission(bareFarm())])
    const wide = buildWorkbook([submission(fullFarm())])
    assert.ok(!headersFor(narrow.sheets['All data']).includes('ent2_Crop'))
    assert.ok(headersFor(wide.sheets['All data']).includes('ent2_Crop'))
    assert.ok(!headersFor(narrow.sheets['All data']).includes('equip1_name'))
    assert.ok(headersFor(wide.sheets['All data']).includes('equip1_name'))
  })
})

describe('a blank is a blank', () => {
  test('an untouched box exports empty, never 0', () => {
    // THE MOST IMPORTANT RULE IN THE FILE. "Left empty" and "entered zero" are
    // different facts about a farm, and a spreadsheet that renders both as 0
    // has destroyed the difference before anybody opens it. Averaging such a
    // column counts every untouched row as a real zero.
    const { sheets } = buildWorkbook([submission(bareFarm())])
    const row = sheets['Variable lines'].find((r) => r['Line key'] === 'nitrogen')
    assert.equal(row['Cost per unit $'], '', 'blank stays blank')
    assert.notEqual(row['Cost per unit $'], 0)
    const ent = sheets.Enterprises[0]
    assert.equal(ent['Price per unit $'], '', 'and on the enterprise sheet too')
  })

  test('an explicit zero survives as a zero', () => {
    // The other half of the same rule: a producer who types 0 has answered.
    const s = bareFarm()
    s.enterprises[0].variable.nitrogen.perAcre = '0'
    s.enterprises[0].variable.nitrogen.mode = 'perAcre'
    const { sheets } = buildWorkbook([submission(s)])
    const row = sheets['Variable lines'].find((r) => r['Line key'] === 'nitrogen')
    assert.equal(row['Entered $/acre'], 0)
    assert.notEqual(row['Entered $/acre'], '')
  })

  test('a building gets no salvage column value at all', () => {
    // A building has no salvage in this model. That is an absent concept, not
    // an amount of zero, so the cell is blank rather than 0.
    const { sheets } = buildWorkbook([submission(fullFarm())])
    const building = sheets['Equipment and buildings'].find((r) => r.Kind === 'building')
    assert.equal(building['Salvage value $'], '')
  })
})

describe('figures come from the model, not from the stored results', () => {
  test('a tampered results block is ignored', () => {
    // The stored `results` is a convenience for anybody reading raw Firestore.
    // The workbook recomputes, the same rule the screen, the CSV, and the PNG
    // follow, so a stale or edited document cannot put a wrong number in a
    // spreadsheet that looks authoritative.
    const doc = submission(fullFarm())
    doc.results = { totalProfit: 999999999 }
    const { sheets } = buildWorkbook([doc])
    assert.notEqual(sheets.Budgets[0]['Total profit $'], 999999999)
    // 500ac corn + 300ac soybeans, land rent 120/ac, one tractor, one shed.
    assert.equal(sheets.Budgets[0]['Total acres'], 800)
    assert.equal(sheets.Budgets[0]['Total revenue $'], 586500)
    assert.equal(sheets.Budgets[0]['Total fixed costs $'], 123200)
  })
})

describe('one bad record does not cost the export', () => {
  test('an unreadable document is skipped and reported', () => {
    // Same rule listScenarios() follows for a corrupt local budget: report it,
    // keep the rest. An export that aborts on one malformed row is an export
    // nobody can run.
    const poison = { shareId: 'bad', name: 'Broken', scenario: null }
    Object.defineProperty(poison, 'scenario', {
      get() {
        throw new Error('unreadable')
      },
    })
    const { sheets, skipped, count } = buildWorkbook([poison, submission(fullFarm())])
    assert.equal(count, 1, 'the good one still exported')
    assert.equal(skipped.length, 1)
    assert.equal(skipped[0].shareId, 'bad')
    assert.equal(sheets.Budgets.length, 1)
  })

  test('an empty batch produces empty sheets, not a crash', () => {
    const { sheets, count } = buildWorkbook([])
    assert.equal(count, 0)
    for (const name of SHEETS) assert.deepEqual(sheets[name], [])
  })
})

describe('the CSV is safe to hand to somebody', () => {
  test('a name that looks like a formula is neutralised', () => {
    // Budget and crop names are free text, and all three major spreadsheets
    // execute a cell of TEXT beginning = + - @ tab or CR when the file opens.
    // Lifted from csvCell() in export.js, which guards the same hazard.
    const s = fullFarm()
    s.name = '=HYPERLINK("http://evil","click")'
    const { sheets } = buildWorkbook([submission(s, { name: s.name })])
    const csv = toCSV(sheets.Budgets)
    assert.ok(csv.includes(`"'=HYPERLINK`), 'prefixed with an apostrophe and quoted')
  })

  test('a negative number stays a number', () => {
    // The other half, and the reason the guard tests the TYPE rather than the
    // leading character: a loss has to stay summable for the formulas whoever
    // receives this will write over it.
    const csv = toCSV([{ shareId: 'x', 'Budget name': 'y', 'Total profit $': -1234.5 }])
    assert.ok(csv.includes('-1234.5'), 'not quoted, not apostrophised')
    assert.ok(!csv.includes("'-1234.5"))
  })

  test('the header is the union of every row, not the first row', () => {
    // A first row from a budget with no equipment carries fewer keys. A writer
    // that took its keys as the header would silently truncate every column the
    // first row happened not to reach.
    const rows = [
      { shareId: 'a', 'Budget name': 'A' },
      { shareId: 'b', 'Budget name': 'B', Extra: 7 },
    ]
    assert.deepEqual(headersFor(rows), ['shareId', 'Budget name', 'Extra'])
    assert.ok(toCSV(rows).split('\r\n')[0].endsWith('Extra'))
  })

  test('quotes and newlines survive a round trip', () => {
    const csv = toCSV([{ shareId: 'a', 'Budget name': 'He said "hi"\nthen left' }])
    assert.ok(csv.includes('"He said ""hi""\nthen left"'))
  })
})

describe('the filename says when it was taken', () => {
  test('the stem is the date, zero padded', () => {
    assert.equal(exportStem(new Date(2026, 0, 5)), 'submissions-2026-01-05')
  })
})
