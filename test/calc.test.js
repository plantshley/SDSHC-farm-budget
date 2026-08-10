import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  calcScenario,
  calcEnterprise,
  linePerAcre,
  lineModes,
  num,
  VARIABLE_LINES,
} from '../src/calc.js'
import { scenario, SHEET } from './fixture.js'

/** Excel carries ~15 significant digits, so exact equality is not available. */
function close(actual, expected, label) {
  const tolerance = 1e-6 * Math.max(1, Math.abs(expected))
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`
  )
}

const r = calcScenario(scenario)
const [corn, soy] = r.enterprises

/* ══════════════════════════════════════════════════════════════════════════
   Agreement with the spreadsheet
   Everything the sheet gets right, calc.js must reproduce exactly.
   ══════════════════════════════════════════════════════════════════════════ */

describe('matches the spreadsheet — enterprise budgets', () => {
  test('Corn (columns A–D)', () => {
    close(corn.cropRevPerAcre, SHEET.D7, 'D7 crop revenue/acre')
    close(corn.grossRevPerAcre, SHEET.D9, 'D9 total crop revenue/acre')
    close(corn.totalRevenue, SHEET.D10, 'D10 total enterprise revenue')
    close(corn.totalVarPerAcre, SHEET.D27, 'D27 total variable expenses/acre')
    close(corn.totalVar, SHEET.D28, 'D28 total variable expenses')
    close(corn.grossMarginPerAcre, SHEET.D29, 'D29 gross margin/acre')
    close(corn.enterpriseGrossMargin, SHEET.D30, 'D30 enterprise gross margin')
  })

  test('Soybeans (columns E–H), including misc income', () => {
    close(soy.cropRevPerAcre, SHEET.H7, 'H7 crop revenue/acre')
    close(soy.grossRevPerAcre, SHEET.H9, 'H9 total crop revenue/acre')
    close(soy.totalRevenue, SHEET.H10, 'H10 total enterprise revenue')
    close(soy.totalVarPerAcre, SHEET.H27, 'H27 total variable expenses/acre')
    close(soy.totalVar, SHEET.H28, 'H28 total variable expenses')
    close(soy.grossMarginPerAcre, SHEET.H29, 'H29 gross margin/acre')
    close(soy.enterpriseGrossMargin, SHEET.H30, 'H30 enterprise gross margin')
  })
})

describe('matches the spreadsheet — fixed costs', () => {
  const f = r.fixed

  test('land rent and labor', () => {
    close(f.landRentTotal, SHEET.O33, 'O33 land rent total')
    close(f.laborHrsPerAcre, SHEET.N35, 'N35 hours/acre')
    close(f.laborPerAcre, SHEET.O35, 'O35 labor $/acre')
    close(f.laborTotal, SHEET.P35, 'P35 total labor cost')
  })

  test('equipment depreciation', () => {
    close(f.equipment[0].annualDep, SHEET.P38, 'P38 tractor depreciation')
    close(f.equipment[0].depPerAcre, SHEET.O38, 'O38 tractor depreciation/acre')
    close(f.equipment[1].annualDep, SHEET.P39, 'P39 planter depreciation')
    close(f.equipment[1].depPerAcre, SHEET.O39, 'O39 planter depreciation/acre')
    close(f.equipDepTotal, SHEET.P44, 'P44 total equipment depreciation')
    close(f.equipDepPerAcre, SHEET.O44, 'O44 total equipment depreciation/acre')
  })

  test('equipment interest uses (initial + salvage) / 2', () => {
    close(f.equipment[0].annualInt, SHEET.P46, 'P46 tractor interest')
    close(f.equipment[0].intPerAcre, SHEET.O46, 'O46 tractor interest/acre')
    close(f.equipment[1].annualInt, SHEET.P47, 'P47 planter interest')
    close(f.equipment[1].intPerAcre, SHEET.O47, 'O47 planter interest/acre')
    close(f.equipIntTotal, SHEET.P52, 'P52 total equipment interest')
    close(f.equipIntPerAcre, SHEET.O52, 'O52 total equipment interest/acre')
  })

  test('building depreciation and interest (interest on initial / 2)', () => {
    close(f.buildings[0].annualDep, SHEET.P55, 'P55 shed depreciation')
    close(f.buildings[0].depPerAcre, SHEET.O55, 'O55 shed depreciation/acre')
    close(f.bldgDepTotal, SHEET.P61, 'P61 total building depreciation')
    close(f.bldgDepPerAcre, SHEET.O61, 'O61 total building depreciation/acre')
    close(f.buildings[0].annualInt, SHEET.P63, 'P63 shed interest')
    close(f.buildings[0].intPerAcre, SHEET.O63, 'O63 shed interest/acre')
    close(f.bldgIntTotal, SHEET.P69, 'P69 total building interest')
    close(f.bldgIntPerAcre, SHEET.O69, 'O69 total building interest/acre')
  })

  test('annual overhead costs', () => {
    close(f.annual.utilities.perAcre, SHEET.O71, 'O71 utilities/acre')
    close(f.annual.farmInsurance.perAcre, SHEET.O72, 'O72 farm insurance/acre')
    close(f.annual.duesFees.perAcre, SHEET.O73, 'O73 dues & fees/acre')
    close(f.annual.misc.perAcre, SHEET.O74, 'O74 miscellaneous/acre')
  })

  test('P75 total fixed costs/acre — the one whole-farm total the sheet gets right', () => {
    close(r.fixed.totalFixedPerAcre, SHEET.P75, 'P75 total fixed costs/acre')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Deliberate divergences
   These assert that calc.js does NOT match the sheet, and pin the exact
   relationship between the two so a future change can't quietly reintroduce
   the spreadsheet's bugs.
   ══════════════════════════════════════════════════════════════════════════ */

describe('deliberate divergences from the spreadsheet', () => {
  test('P78: total profit includes the equipment interest the sheet omits', () => {
    // The sheet subtracts SUM(P44,P35,O33,P61,P69,P71:P74) — P52 is missing.
    // The gap is therefore exactly total equipment interest.
    close(
      r.totals.totalProfit,
      SHEET.P78 - SHEET.P52,
      'total profit = sheet P78 minus the omitted equipment interest'
    )

    // Concretely: the sheet reports a small profit on a farm that loses money.
    assert.ok(SHEET.P78 > 0, 'sheet reports a profit')
    assert.ok(r.totals.totalProfit < 0, 'the farm actually loses money')
    close(r.totals.totalProfit, -19140.833333333336, 'total profit')
  })

  test('P75 and P78 contradict each other in the sheet, but not here', () => {
    // P75 includes equipment interest, P78 does not. Rebuilding the sheet's own
    // P78 from its own P75 gives a different answer than its P78 cell.
    const impliedFromP75 =
      r.totals.totalRevenue - r.totals.totalVariable - SHEET.P75 * r.totalAcres
    assert.ok(
      Math.abs(impliedFromP75 - SHEET.P78) > 19000,
      'the sheet is internally inconsistent by ~$19k'
    )
    // calc.js has one fixed-cost figure, used everywhere.
    close(
      r.totals.totalProfit,
      r.totals.totalRevenue - r.totals.totalVariable - r.fixed.totalFixedAnnual,
      'total profit is consistent with total fixed costs'
    )
    close(
      r.fixed.totalFixedPerAcre * r.totalAcres,
      r.fixed.totalFixedAnnual,
      'per-acre and annual fixed costs agree'
    )
  })

  test('P76/P77: per-acre figures are acreage-weighted, not summed across enterprises', () => {
    // The sheet adds the per-acre figures of enterprises with DIFFERENT acreage.
    close(
      SHEET.P76,
      corn.totalVarPerAcre + soy.totalVarPerAcre + SHEET.P75,
      'sheet P76 is an unweighted sum'
    )
    assert.notEqual(r.totals.expensesPerAcre, SHEET.P76)
    assert.notEqual(r.totals.profitPerAcre, SHEET.P77)

    // Ours are whole-farm dollars over whole-farm acres, so they round-trip.
    close(
      r.totals.profitPerAcre * r.totalAcres,
      r.totals.totalProfit,
      'profit/acre × acres = total profit'
    )
    close(r.totals.profitPerAcre, -23.92604166666667, 'profit/acre')
    close(r.totalAcres, 800, 'total acres')
  })

  test('adds a whole-farm Total Gross Margin, which the sheet only labels', () => {
    close(
      r.totals.totalGrossMargin,
      SHEET.D30 + SHEET.H30,
      'total gross margin = sum of enterprise gross margins'
    )
  })

  test('empty equipment rows are $0, not #DIV/0!', () => {
    // In the sheet, one blank useful-life cell propagates #DIV/0! through
    // P44, P61, P75, P76, P77 and P78 — no total can be produced at all.
    const withBlanks = calcScenario({
      ...scenario,
      fixed: {
        ...scenario.fixed,
        equipment: [...scenario.fixed.equipment, { id: 'blank', name: '' }],
        buildings: [...scenario.fixed.buildings, { id: 'blank2', name: '' }],
      },
    })
    assert.ok(Number.isFinite(withBlanks.totals.totalProfit))
    close(
      withBlanks.totals.totalProfit,
      r.totals.totalProfit,
      'a blank row changes nothing'
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Preharvest interest — computed here, hand-entered in the sheet
   ══════════════════════════════════════════════════════════════════════════ */

describe('preharvest interest', () => {
  test('computes from preharvest costs only, at the stated 8 months / 10%', () => {
    const auto = calcEnterprise({
      ...scenario.enterprises[0],
      preharvest: { auto: true, rate: 10, months: 8 },
    })
    // Corn preharvest costs (seed..miscellaneous) = 431.20; postharvest
    // (hauling, drying, marketing) = 77.00 and must NOT be financed.
    close(auto.preharvestBasis, 431.2, 'preharvest basis excludes post-harvest costs')
    close(
      auto.preharvestInterestPerAcre,
      431.2 * 0.1 * (8 / 12),
      'interest = basis × rate × months/12'
    )
    close(auto.preharvestInterestPerAcre, 28.746666666666666, 'interest/acre')
  })

  test('rate and term are editable', () => {
    const e = calcEnterprise({
      ...scenario.enterprises[0],
      preharvest: { auto: true, rate: 6, months: 12 },
    })
    close(e.preharvestInterestPerAcre, 431.2 * 0.06, 'a full year at 6%')
  })

  test('defaults to the spreadsheet assumption when unspecified', () => {
    const e = calcEnterprise({ ...scenario.enterprises[0], preharvest: { auto: true } })
    close(e.preharvestInterestPerAcre, 431.2 * 0.1 * (8 / 12), '8 months at 10%')
  })

  test('manual entry overrides the calculation', () => {
    close(corn.preharvestInterestPerAcre, 25.5, 'uses the entered figure')
    assert.equal(corn.preharvestAuto, false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Input handling and edge cases
   ══════════════════════════════════════════════════════════════════════════ */

describe('variable expense entry modes', () => {
  test('$/unit × units/acre and $/acre reach the same total', () => {
    close(linePerAcre({ mode: 'unit', costPerUnit: 22, unitsPerAcre: 1 }), 22, 'unit mode')
    close(linePerAcre({ mode: 'perAcre', perAcre: 22 }), 22, 'per-acre mode')
  })

  test('an unset line is $0, not NaN', () => {
    assert.equal(linePerAcre(undefined), 0)
    assert.equal(linePerAcre({}), 0)
    assert.equal(linePerAcre({ mode: 'perAcre' }), 0)
  })

  test('mode switching does not lose the other mode’s values', () => {
    const line = { mode: 'unit', costPerUnit: 10, unitsPerAcre: 3, perAcre: 99 }
    close(linePerAcre(line), 30, 'unit mode reads costPerUnit × unitsPerAcre')
    close(linePerAcre({ ...line, mode: 'perAcre' }), 99, 'per-acre mode reads perAcre')
  })

  test('every spreadsheet variable line is present', () => {
    assert.equal(VARIABLE_LINES.length, 14) // rows 12–26, less the computed row 23
    for (const def of VARIABLE_LINES) {
      assert.ok(def.key in corn.lines, `${def.key} missing from results`)
    }
  })

  test('only the two lines that need a third mode have one', () => {
    // A third segment on all fifteen pills would put "population" on the
    // hauling line, where it means nothing. Declared per line for that reason.
    const extra = VARIABLE_LINES.filter((d) => d.modes && d.modes.length > 2)
    assert.deepEqual(
      extra.map((d) => d.key),
      ['seed', 'cropInsurance']
    )
    assert.deepEqual(lineModes(extra[0]), ['unit', 'perAcre', 'population'])
    assert.deepEqual(lineModes(extra[1]), ['unit', 'perAcre', 'total'])
    // Everything else falls back to the sheet's own pair.
    for (const def of VARIABLE_LINES.filter((d) => !d.modes)) {
      assert.deepEqual(lineModes(def), ['unit', 'perAcre'], def.key)
    }
  })
})

describe('entering seed by planting population', () => {
  // (cost per unit of seed) × (population ÷ seeds per unit). The producer knows
  // their population; almost nobody knows what fraction of a bag it is.
  test('it reaches the same figure as working the fraction out by hand', () => {
    const byPopulation = linePerAcre({
      mode: 'population',
      costPerBag: 285,
      population: 33000,
      seedsPerBag: 80000,
    })
    // 33,000 ÷ 80,000 = 0.4125 of a bag, at $285 a bag.
    close(byPopulation, linePerAcre({ mode: 'unit', costPerUnit: 285, unitsPerAcre: 0.4125 }))
    close(byPopulation, 117.5625)
  })

  test('it works in either denomination, which is why seeds-per-unit is a field', () => {
    // South Dakota and Iowa both price corn per THOUSAND seeds; producers buy
    // 80,000-seed bags. Both have to come out the same or the picker offering
    // both denominations is a trap.
    close(
      linePerAcre({ mode: 'population', costPerBag: 3.8, population: 33000, seedsPerBag: 1000 }),
      125.4
    )
    close(
      linePerAcre({ mode: 'population', costPerBag: 304, population: 33000, seedsPerBag: 80000 }),
      125.4
    )
  })

  test('a blank seeds-per-unit is $0, never Infinity', () => {
    // safeDiv is the guard. Without it this divides by zero, and Infinity
    // spreads through every total below it and prints as "∞" on a phone.
    for (const seedsPerBag of ['', null, undefined, 0]) {
      const v = linePerAcre({ mode: 'population', costPerBag: 285, population: 33000, seedsPerBag })
      assert.equal(Number.isFinite(v), true, `seedsPerBag ${JSON.stringify(seedsPerBag)}`)
      assert.equal(v, 0)
    }
  })

  test('a half-filled population line says which box is empty', () => {
    const s = scenarioWithSeed({ mode: 'population', costPerBag: 285, population: 33000 })
    const r = calcScenario(s)
    assert.equal(r.enterprises[0].lines.seed, 0)
    assert.match(r.warnings.join(' '), /seeds-per-unit/i)
  })

  test('a line nobody has touched is not a warning', () => {
    // Twelve untouched expense rows are the ordinary state of a new budget.
    const s = scenarioWithSeed({ mode: 'population', costPerBag: '', population: '', seedsPerBag: '' })
    assert.equal(calcScenario(s).warnings.length, 0)
  })

  test('a box the APP filled is not somebody starting the line', () => {
    // Typing "Corn" into the crop box opens this mode and fills seeds-per-unit
    // by itself. Counting that as a half-filled line means the first thing a
    // producer types answers back with a warning about a row they have not
    // reached yet.
    const auto = { mode: 'population', costPerBag: '', population: '', seedsPerBag: 80000, seedsPerBagAuto: 'corn' }
    assert.equal(calcScenario(scenarioWithSeed(auto)).warnings.length, 0)

    // Once they DO start it, the warning is back.
    const started = calcScenario(scenarioWithSeed({ ...auto, costPerBag: 304 }))
    assert.match(started.warnings.join(' '), /seeds-per-unit/i)

    // The marker over an empty box proves nothing — a hand-edited file can
    // carry one — so that line is still checked the ordinary way.
    const hollow = calcScenario(
      scenarioWithSeed({ ...auto, seedsPerBag: '', costPerBag: 304 })
    )
    assert.match(hollow.warnings.join(' '), /seeds-per-unit/i)
  })
})

describe('entering a cost as a total for the enterprise', () => {
  test('a premium divided by acres matches the same figure entered per acre', () => {
    close(linePerAcre({ mode: 'total', totalCost: 3200 }, 100), 32)
    close(linePerAcre({ mode: 'total', totalCost: 3200 }, 100), linePerAcre({ mode: 'perAcre', perAcre: 32 }))
  })

  test('it divides by THIS enterprise’s acres, not the whole farm’s', () => {
    // The premium is for that crop. Spreading it over the farm would understate
    // it on the insured enterprise and charge it to enterprises it never
    // covered — and both errors look like ordinary numbers.
    const s = scenarioWithInsurance(3200, 100, 900)
    const r = calcScenario(s)
    close(r.enterprises[0].lines.cropInsurance, 32, 'the insured enterprise carries all of it')
    assert.equal(r.enterprises[1].lines.cropInsurance, 0, 'the other one carries none')
  })

  test('a premium with no acres is $0 and says so', () => {
    const s = scenarioWithInsurance(3200, 0, 0)
    const r = calcScenario(s)
    assert.equal(r.enterprises[0].lines.cropInsurance, 0)
    assert.match(r.warnings.join(' '), /no acres to spread it over/i)
  })

  test('a premium over NEGATIVE acres is $0, never a credit', () => {
    // Negative acres are deliberately allowed through everywhere else so the
    // per-acre figures still compute and show what a stray minus sign did. This
    // is the one place a divisor is a quantity rather than a rate, so a premium
    // over negative acres would come out negative — a cost handed back as
    // income, which is the one thing the model never does.
    const r = calcScenario(scenarioWithInsurance(3200, -100, 0))
    assert.equal(r.enterprises[0].lines.cropInsurance, 0)
    assert.ok(r.enterprises[0].lines.cropInsurance >= 0)
  })

  test('negative acres and blank acres get different advice', () => {
    // "Enter the acres above" is wrong and confusing advice to give somebody who
    // did enter them and put a minus sign on them by accident.
    const negative = calcScenario(scenarioWithInsurance(3200, -100, 0)).warnings.join(' ')
    assert.match(negative, /acres are negative/i)
    assert.doesNotMatch(negative, /no acres to spread it over/i)

    const blank = calcScenario(scenarioWithInsurance(3200, '', 0)).warnings.join(' ')
    assert.match(blank, /no acres to spread it over/i)
  })
})

describe('a stored mode a line does not offer cannot erase a cost', () => {
  // Two ways a stored mode goes wrong, and the second is the dangerous one.
  //
  // An unrecognised mode is obvious. A mode this APP knows but this LINE does
  // not offer is not: `total` on the nitrogen line would run the total branch,
  // read a `totalCost` the UI never writes for that line, and return $0 while a
  // perfectly good costPerUnit x unitsPerAcre sat in the record unread. Both
  // fall back to the sheet's own mode, because a file the app cannot make sense
  // of must not be able to silently delete a real cost.
  function nitrogenIn(mode) {
    return {
      enterprises: [
        {
          name: 'Test',
          acres: 100,
          variable: { nitrogen: { mode, costPerUnit: 0.625, unitsPerAcre: 150 } },
        },
      ],
      fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
    }
  }

  test('a mode nobody recognises falls back to $/unit, not to zero', () => {
    close(calcScenario(nitrogenIn('wat')).enterprises[0].lines.nitrogen, 93.75)
  })

  test('a mode another line offers falls back too', () => {
    // The one the reviewer found. `total` and `population` are real modes, just
    // not this line's.
    close(calcScenario(nitrogenIn('total')).enterprises[0].lines.nitrogen, 93.75)
    close(calcScenario(nitrogenIn('population')).enterprises[0].lines.nitrogen, 93.75)
  })

  test('a line that DOES offer the mode still uses it', () => {
    // The guard must not be so eager that it breaks the feature.
    const s = scenarioWithSeed({ mode: 'population', costPerBag: 285, population: 33000, seedsPerBag: 80000 })
    close(calcScenario(s).enterprises[0].lines.seed, 117.5625)
  })

  test('called without a line definition, every mode is honoured', () => {
    // The bare arithmetic is testable on its own; the restriction only applies
    // where a def says which modes the line offers.
    close(linePerAcre({ mode: 'total', totalCost: 3200 }, 100), 32)
    close(linePerAcre({ mode: 'total', totalCost: 3200 }, 100, { key: 'seed', modes: ['unit'] }), 0)
  })

  test('garbage where a line should be is $0, not a crash', () => {
    for (const junk of [null, undefined, 'seed', 42, [], [1, 2], true]) {
      assert.equal(linePerAcre(junk), 0, JSON.stringify(junk))
    }
  })
})

describe('a $/unit line needs both of its boxes', () => {
  // The product of a filled box and a blank one is zero, so the line reads $0
  // while looking like a line somebody filled in. The arithmetic is right and
  // nothing about $0 says which box is empty.
  test('a cost with no units warns, and names the direction', () => {
    const r = calcScenario(scenarioWithSeed({ mode: 'unit', costPerUnit: 285 }))
    assert.equal(r.enterprises[0].lines.seed, 0)
    assert.match(r.warnings.join(' '), /cost per unit but no units per acre/i)
  })

  test('units with no cost warns the other way round', () => {
    const r = calcScenario(scenarioWithSeed({ mode: 'unit', unitsPerAcre: 0.4 }))
    assert.match(r.warnings.join(' '), /units per acre but no cost per unit/i)
  })

  test('both filled, or neither, is silent', () => {
    assert.equal(
      calcScenario(scenarioWithSeed({ mode: 'unit', costPerUnit: 285, unitsPerAcre: 0.4 })).warnings
        .length,
      0
    )
    assert.equal(calcScenario(scenarioWithSeed({ mode: 'unit' })).warnings.length, 0)
  })

  test('an explicit zero is an answer, not a blank', () => {
    // A producer who typed 0 meant 0. Warning about it would be telling them
    // their own deliberate entry is a mistake.
    assert.equal(
      calcScenario(scenarioWithSeed({ mode: 'unit', costPerUnit: 0, unitsPerAcre: 0.4 })).warnings
        .length,
      0
    )
  })

  test('a $/acre line is never warned about, having only one box', () => {
    assert.equal(
      calcScenario(scenarioWithSeed({ mode: 'perAcre', costPerUnit: 285 })).warnings.length,
      0
    )
  })
})

/** One enterprise with 100 acres and one seed line, everything else blank. */
function scenarioWithSeed(seed) {
  return {
    enterprises: [{ name: 'Test', acres: 100, variable: { seed } }],
    fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
  }
}

/** Two enterprises, only the first insured. */
function scenarioWithInsurance(totalCost, acresA, acresB) {
  return {
    enterprises: [
      { name: 'Insured', acres: acresA, variable: { cropInsurance: { mode: 'total', totalCost } } },
      { name: 'Other', acres: acresB, variable: {} },
    ],
    fixed: { labor: {}, annual: {}, annualBasis: {}, equipment: [], buildings: [] },
  }
}

describe('edge cases', () => {
  test('zero acres produces zeros and a warning, never Infinity or NaN', () => {
    const empty = calcScenario({ enterprises: [], fixed: scenario.fixed })
    assert.equal(empty.totalAcres, 0)
    for (const [key, value] of Object.entries(empty.totals)) {
      assert.ok(Number.isFinite(value), `${key} is ${value}`)
    }
    assert.ok(Number.isFinite(empty.fixed.totalFixedPerAcre))
    assert.ok(empty.warnings.some((w) => w.includes('acres')))
  })

  test('an enterprise with zero acres does not break the others', () => {
    const withEmpty = calcScenario({
      ...scenario,
      enterprises: [...scenario.enterprises, { id: 'x', crop: 'Oats', acres: 0 }],
    })
    close(withEmpty.totalAcres, 800, 'total acres unchanged')
    close(withEmpty.totals.totalProfit, r.totals.totalProfit, 'profit unchanged')
  })

  test('zero useful life is $0 depreciation plus a warning, not Infinity', () => {
    const out = calcScenario({
      ...scenario,
      fixed: {
        ...scenario.fixed,
        equipment: [
          { id: 'q', name: 'Combine', initialCost: 400000, salvageValue: 0, usefulLife: 0, interestRate: 5 },
        ],
      },
    })
    assert.equal(out.fixed.equipDepTotal, 0)
    close(out.fixed.equipIntTotal, 10000, 'interest is still charged')
    assert.ok(out.warnings.some((w) => w.includes('useful life')))
  })

  test('negative useful life is $0 depreciation, never a negative cost', () => {
    // Regression: safeDiv only guards an exact-zero divisor, so a typo of "-12"
    // for 12 produced NEGATIVE depreciation — quietly REDUCING the farm's costs
    // and inflating profit, while the warning claimed it was counted as $0.
    const out = calcScenario({
      ...scenario,
      fixed: {
        ...scenario.fixed,
        equipment: [
          { id: 'q', name: 'Tractor', initialCost: 285000, salvageValue: 95000, usefulLife: -12, interestRate: 0 },
        ],
        buildings: [{ id: 'b', name: 'Shed', initialCost: 90000, usefulLife: -30, interestRate: 0 }],
      },
    })
    assert.equal(out.fixed.equipDepTotal, 0, 'equipment depreciation is not negative')
    assert.equal(out.fixed.bldgDepTotal, 0, 'building depreciation is not negative')
    assert.ok(out.fixed.totalFixedAnnual >= 0, 'fixed costs were not reduced by a typo')
    assert.ok(out.warnings.some((w) => w.includes('useful life')))
  })

  test('a blank preharvest rate falls back to the documented default', () => {
    // Clearing the field mid-edit must not silently drop the sheet's stated
    // "8 months at 10%" assumption to zero. An explicit 0 still means zero.
    const blank = calcEnterprise({
      ...scenario.enterprises[0],
      preharvest: { auto: true, rate: '', months: '' },
    })
    close(blank.preharvestInterestPerAcre, 431.2 * 0.1 * (8 / 12), 'blank uses the default')

    const explicitZero = calcEnterprise({
      ...scenario.enterprises[0],
      preharvest: { auto: true, rate: 0, months: 8 },
    })
    assert.equal(explicitZero.preharvestInterestPerAcre, 0, 'an entered 0 means 0')
  })

  test('a negative preharvest rate is $0 and never a credit', () => {
    // This figure is ADDED to total variable costs, so a negative one is a cost
    // handed back as a credit — the one thing the model never does. The box
    // ships pre-filled with 10 and sits on every enterprise card, so "-10" for
    // 10% is the ordinary typo, and it moved profit in the flattering direction
    // with nothing on screen naming the field.
    const base = calcEnterprise({
      ...scenario.enterprises[0],
      preharvest: { auto: true, rate: 10, months: 8 },
    })

    for (const [field, bad] of [
      ['rate', -10],
      ['months', -8],
    ]) {
      const own = []
      const out = calcEnterprise(
        {
          ...scenario.enterprises[0],
          preharvest: { auto: true, rate: 10, months: 8, [field]: bad },
        },
        0,
        own
      )
      assert.equal(out.preharvestInterestPerAcre, 0, `a negative ${field} counts as $0`)
      assert.ok(
        out.totalVarPerAcre < base.totalVarPerAcre,
        'removing a real cost may lower costs, which is honest'
      )
      assert.ok(
        out.totalVarPerAcre >= base.totalVarPerAcre - base.preharvestInterestPerAcre - 1e-9,
        'but it is worth ZERO, never subtracted as a credit'
      )
      assert.ok(
        own.some((w) => /preharvest interest/i.test(w) && /negative/i.test(w)),
        `the producer is told which box the minus sign is in (${field})`
      )
    }
  })

  test('a negative hand-entered preharvest interest is $0 and never a credit', () => {
    // Manual mode is the same hazard with one box instead of two: "-15" is a
    // straight $15/acre credit against the crop.
    const own = []
    const out = calcEnterprise(
      {
        ...scenario.enterprises[0],
        preharvest: { auto: false, manualPerAcre: -15 },
      },
      0,
      own
    )
    assert.equal(out.preharvestInterestPerAcre, 0)
    assert.ok(own.some((w) => /preharvest/i.test(w) && /negative/i.test(w)))
  })

  test('negative acres are flagged, not silently sign-flipped', () => {
    const out = calcScenario({
      ...scenario,
      enterprises: [{ ...scenario.enterprises[0], crop: 'Corn', acres: -500 }],
    })
    assert.ok(out.warnings.some((w) => /negative acres/i.test(w)))
  })

  test('salvage above initial cost warns rather than silently inverting', () => {
    const out = calcScenario({
      ...scenario,
      fixed: {
        ...scenario.fixed,
        equipment: [
          { id: 'q', name: 'Odd', initialCost: 100, salvageValue: 500, usefulLife: 10, interestRate: 0 },
        ],
      },
    })
    assert.ok(out.warnings.some((w) => w.includes('salvage')))
    close(out.fixed.equipDepTotal, -40, 'the arithmetic still follows the sheet')
  })

  test('missing sections do not throw', () => {
    for (const input of [undefined, {}, { enterprises: [] }, { fixed: {} }]) {
      const out = calcScenario(input)
      assert.ok(Number.isFinite(out.totals.totalProfit))
    }
  })

  test('scales past the spreadsheet’s four-enterprise ceiling', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      ...scenario.enterprises[0],
      id: `e${i}`,
      acres: 100,
    }))
    const out = calcScenario({ ...scenario, enterprises: ten })
    assert.equal(out.enterprises.length, 10)
    close(out.totalAcres, 1000, 'total acres')
    close(
      out.totals.totalGrossMargin,
      out.enterprises.reduce((a, e) => a + e.enterpriseGrossMargin, 0),
      'gross margin rolls up across all ten'
    )
  })

  test('num() rejects Infinity, which `Number(x) || 0` would let through', () => {
    assert.equal(num(Infinity), 0)
    assert.equal(num(-Infinity), 0)
    assert.equal(num(NaN), 0)
    assert.equal(num(undefined), 0)
    assert.equal(num(null), 0)
    assert.equal(num(''), 0)
    assert.equal(num('abc'), 0)
    assert.equal(num('12.5'), 12.5)
    assert.equal(num(-3), -3)
  })

  test('a negative-profit farm reports a negative figure, not zero', () => {
    assert.ok(r.totals.totalProfit < 0)
    assert.ok(r.totals.profitPerAcre < 0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Schema v2 — entry conveniences that must not change any answer
   ══════════════════════════════════════════════════════════════════════════ */

describe('entering labour for a period other than a year', () => {
  const base = {
    enterprises: [{ acres: 100 }],
    fixed: { labor: { ratePerHour: 20, hours: 10 } },
  }

  const laborTotal = (labor) =>
    calcScenario({ ...base, fixed: { labor: { ...base.fixed.labor, ...labor } } }).fixed.laborTotal

  test('a missing basis means yearly, so a v1 budget is untouched', () => {
    assert.equal(laborTotal({}), 200, '10 hours a year at $20')
  })

  test('weekly hours are multiplied by 52', () => {
    assert.equal(laborTotal({ hoursBasis: 'week' }), 10 * 52 * 20)
  })

  test('monthly hours are multiplied by 12', () => {
    assert.equal(laborTotal({ hoursBasis: 'month' }), 10 * 12 * 20)
  })

  test('an unrecognised basis falls back to yearly, never to zero', () => {
    // A hand-edited file or a future key must not silently erase a real cost.
    assert.equal(laborTotal({ hoursBasis: 'fortnight' }), 200)
    assert.equal(laborTotal({ hoursBasis: null }), 200)
    assert.equal(laborTotal({ hoursBasis: 42 }), 200)
  })

  test('the pre-v2 key still reads, so an unmigrated budget still calculates', () => {
    const r2 = calcScenario({
      enterprises: [{ acres: 100 }],
      fixed: { labor: { ratePerHour: 20, totalHoursPerYear: 400 } },
    })
    assert.equal(r2.fixed.laborTotal, 8000)
    assert.equal(r2.fixed.totalHoursPerYear, 400)
  })

  test('the annualised hours are reported, not just the cost', () => {
    const r2 = calcScenario({
      enterprises: [{ acres: 100 }],
      fixed: { labor: { ratePerHour: 20, hours: 10, hoursBasis: 'week' } },
    })
    assert.equal(r2.fixed.totalHoursPerYear, 520)
    assert.equal(r2.fixed.laborHrsPerAcre, 5.2)
  })
})

describe('entering overhead for a period other than a year', () => {
  const overhead = (annual, annualBasis) =>
    calcScenario({ enterprises: [{ acres: 100 }], fixed: { annual, annualBasis } }).fixed

  test('a missing basis means yearly', () => {
    assert.equal(overhead({ utilities: 1200 }).annualTotal, 1200)
  })

  test('a monthly bill becomes twelve of them', () => {
    assert.equal(overhead({ utilities: 180 }, { utilities: 'month' }).annualTotal, 2160)
  })

  test('each line carries its own period', () => {
    const f = overhead(
      { utilities: 180, farmInsurance: 4000, duesFees: 50, misc: 100 },
      { utilities: 'month', duesFees: 'quarter', misc: 'week' }
    )
    // 2160 + 4000 + 200 + 5200
    assert.equal(f.annualTotal, 11560)
    assert.equal(f.annual.utilities.total, 2160)
    assert.equal(f.annual.farmInsurance.total, 4000, 'no basis given, so yearly')
    assert.equal(f.annual.duesFees.total, 200)
    assert.equal(f.annual.misc.total, 5200)
  })

  test('the figure as entered is preserved alongside the annualised one', () => {
    const f = overhead({ utilities: 180 }, { utilities: 'month' })
    assert.equal(f.annual.utilities.entered, 180)
    assert.equal(f.annual.utilities.basis, 'month')
  })

  test('an unrecognised period falls back to yearly, never to zero', () => {
    assert.equal(overhead({ utilities: 1200 }, { utilities: 'decade' }).annualTotal, 1200)
  })

  test('the annualised overhead reaches total profit', () => {
    const r2 = calcScenario({
      enterprises: [{ acres: 100 }],
      fixed: { annual: { utilities: 100 }, annualBasis: { utilities: 'month' } },
    })
    assert.equal(r2.totals.totalFixed, 1200)
    assert.equal(r2.totals.totalProfit, -1200)
  })
})

describe('an enterprise name, separate from its crop', () => {
  const label = (ent, i) => calcScenario({ enterprises: [ent] }).enterprises[0].label

  test('the name wins when there is one', () => {
    assert.equal(label({ name: 'No-till', crop: 'Corn' }), 'No-till')
  })

  test('the crop is the fallback, so a v1 budget reads exactly as before', () => {
    assert.equal(label({ crop: 'Corn' }), 'Corn')
    assert.equal(label({ name: '', crop: 'Corn' }), 'Corn')
    assert.equal(label({ name: '   ', crop: 'Corn' }), 'Corn')
  })

  test('with neither, the position is the label', () => {
    assert.equal(label({}), 'Enterprise 1')
    const two = calcScenario({ enterprises: [{}, {}] })
    assert.equal(two.enterprises[1].label, 'Enterprise 2')
  })

  test('two enterprises growing the same crop are still distinguishable', () => {
    const r2 = calcScenario({
      enterprises: [
        { name: 'Conventional', crop: 'Corn', acres: 500 },
        { name: 'No-till', crop: 'Corn', acres: 500 },
      ],
    })
    assert.notEqual(r2.enterprises[0].label, r2.enterprises[1].label)
    assert.equal(r2.enterprises[0].crop, r2.enterprises[1].crop)
  })

  test('a name changes no number', () => {
    const without = calcScenario({ enterprises: [{ crop: 'Corn', acres: 100, yieldPerAcre: 50, pricePerUnit: 4 }] })
    const with_ = calcScenario({ enterprises: [{ name: 'X', crop: 'Corn', acres: 100, yieldPerAcre: 50, pricePerUnit: 4 }] })
    assert.deepEqual(without.totals, with_.totals)
  })
})
