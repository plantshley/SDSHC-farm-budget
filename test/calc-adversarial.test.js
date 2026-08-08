import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { calcScenario, calcEnterprise, calcFixed, linePerAcre, num } from '../src/calc.js'
import { scenario as fixtureScenario } from './fixture.js'

/* ─────────────────────────── helpers ──────────────────────────────────── */

/**
 * Recursively walk a result object/array and collect the path of every
 * numeric leaf that is NOT Number.isFinite (NaN, Infinity, -Infinity).
 * Also flags null/undefined found where a sibling numeric field exists
 * (best effort — we mainly care about actual `number` typed leaves here,
 * since that's what would render as a dollar figure in the UI).
 */
function findNonFinite(value, path = '$') {
  const bad = []
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) bad.push({ path, value })
    return bad
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => bad.push(...findNonFinite(v, `${path}[${i}]`)))
    return bad
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      bad.push(...findNonFinite(v, `${path}.${k}`))
    }
  }
  return bad
}

function assertAllFinite(result, label) {
  const bad = findNonFinite(result)
  assert.equal(
    bad.length,
    0,
    `${label}: found non-finite numeric leaves: ${JSON.stringify(bad)}`
  )
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x))
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Hunt for NaN / Infinity / -Infinity anywhere in the output
   ══════════════════════════════════════════════════════════════════════════ */

describe('never produces NaN/Infinity — raw-string poison values', () => {
  const poisonValues = [
    '', 'abc', '3.', '-', '1e400', '-1e400', '0.1', ' 5 ', null, undefined,
    [], [5], {}, { a: 1 }, 'NaN', 'Infinity', '-Infinity', '$5', '1,000',
    '007', '  ', '5px', true, false, () => 5,
  ]

  for (const poison of poisonValues) {
    test(`acres = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].acres = poison
      const out = calcScenario(s)
      assertAllFinite(out, `acres=${JSON.stringify(poison)}`)
    })

    test(`yieldPerAcre = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].yieldPerAcre = poison
      const out = calcScenario(s)
      assertAllFinite(out, `yieldPerAcre=${JSON.stringify(poison)}`)
    })

    test(`pricePerUnit = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].pricePerUnit = poison
      const out = calcScenario(s)
      assertAllFinite(out, `pricePerUnit=${JSON.stringify(poison)}`)
    })

    test(`fixed.equipment interestRate = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.fixed.equipment[0].interestRate = poison
      const out = calcScenario(s)
      assertAllFinite(out, `interestRate=${JSON.stringify(poison)}`)
    })

    test(`fixed.equipment usefulLife = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.fixed.equipment[0].usefulLife = poison
      const out = calcScenario(s)
      assertAllFinite(out, `usefulLife=${JSON.stringify(poison)}`)
    })

    test(`fixed.landRentPerAcre = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.fixed.landRentPerAcre = poison
      const out = calcScenario(s)
      assertAllFinite(out, `landRentPerAcre=${JSON.stringify(poison)}`)
    })

    test(`variable.seed.costPerUnit = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].variable.seed.costPerUnit = poison
      const out = calcScenario(s)
      assertAllFinite(out, `seed.costPerUnit=${JSON.stringify(poison)}`)
    })

    test(`preharvest.rate = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].preharvest = { auto: true, rate: poison, months: 8 }
      const out = calcScenario(s)
      assertAllFinite(out, `preharvest.rate=${JSON.stringify(poison)}`)
    })
  }
})

/* ══════════════════════════════════════════════════════════════════════════
   2. Floating point precision
   ══════════════════════════════════════════════════════════════════════════ */

describe('floating point precision', () => {
  test('profitPerAcre * totalAcres reliably equals totalProfit (round-trip)', () => {
    const r = calcScenario(fixtureScenario)
    const roundTrip = r.totals.profitPerAcre * r.totalAcres
    // Not necessarily bit-exact, but must be extremely close (sub-cent).
    assert.ok(
      Math.abs(roundTrip - r.totals.totalProfit) < 1e-6,
      `round-trip diverged: profitPerAcre*acres=${roundTrip} vs totalProfit=${r.totals.totalProfit} (diff ${roundTrip - r.totals.totalProfit})`
    )
  })

  test('summing many small fractional-cent enterprises does not drift beyond a cent', () => {
    const many = Array.from({ length: 137 }, (_, i) => ({
      id: `e${i}`,
      crop: 'X',
      acres: 0.1,
      yieldPerAcre: 33.33,
      pricePerUnit: 4.999,
      miscIncomePerAcre: 0,
      variable: {},
    }))
    const out = calcScenario({ enterprises: many, fixed: {} })
    const manualTotalRevenue = many.reduce(
      (a, e) => a + e.yieldPerAcre * e.pricePerUnit * e.acres,
      0
    )
    assert.ok(
      Math.abs(out.totals.totalRevenue - manualTotalRevenue) < 1e-6,
      `totalRevenue drifted: got ${out.totals.totalRevenue}, expected ~${manualTotalRevenue}`
    )
  })

  test('classic 0.1 + 0.2 style inputs stay finite and sane', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable.seed.costPerUnit = 0.1
    s.enterprises[0].variable.seed.unitsPerAcre = 0.2
    const out = calcEnterprise(s.enterprises[0])
    assert.ok(Number.isFinite(out.lines.seed))
    // 0.1 * 0.2 in IEEE754 is 0.020000000000000004, not exactly 0.02.
    assert.ok(Math.abs(out.lines.seed - 0.02) < 1e-9)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3. Negative / zero inputs in every position
   ══════════════════════════════════════════════════════════════════════════ */

describe('negative and zero inputs', () => {
  test('negative acres flow through arithmetic without crashing (but flip signs oddly)', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].acres = -500
    const out = calcScenario(s)
    assertAllFinite(out, 'negative acres')
    // totalAcres becomes 300 - 500 = -200: fixed costs get spread over
    // NEGATIVE acreage, which safeDiv does not guard against (only guards
    // against exactly zero).
    assert.equal(out.totalAcres, -200)
    assert.ok(Number.isFinite(out.fixed.totalFixedPerAcre))
  })

  test('negative yield and negative price both produce finite (if nonsensical) revenue', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].yieldPerAcre = -180
    s.enterprises[1].pricePerUnit = -10.5
    const out = calcScenario(s)
    assertAllFinite(out, 'negative yield/price')
  })

  test('negative useful life does not produce Infinity/NaN and still warns', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].usefulLife = -12
    const out = calcScenario(s)
    assertAllFinite(out, 'negative useful life')
    // usefulLife <= 0 triggers the "no useful life" warning even though the
    // life is negative, not merely absent.
    assert.ok(out.warnings.some((w) => w.includes('useful life')))
  })

  test('zero useful life on a building is $0 depreciation, not Infinity', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.buildings[0].usefulLife = 0
    const out = calcScenario(s)
    assertAllFinite(out, 'zero building useful life')
    assert.equal(out.fixed.buildings[0].annualDep, 0)
  })

  test('a negative interest rate is counted as $0 and said out loud', () => {
    // This test used to assert the opposite — that a negative rate produced
    // negative (but finite) interest. Finite is not the same as right: a "-7"
    // typed for 7% subtracts from total fixed costs and therefore INFLATES the
    // farm's profit, silently, with a perfectly normal-looking number on screen.
    // Same failure as the negative-useful-life bug, and now closed the same way.
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].interestRate = -7
    const out = calcScenario(s)
    assertAllFinite(out, 'negative interest rate')
    assert.equal(out.fixed.equipment[0].annualInt, 0)
    assert.ok(
      out.warnings.some((w) => /interest rate is negative/i.test(w)),
      'the producer is told which field to look at'
    )
  })

  test('a negative rate behaves exactly like zero, and never like a rebate', () => {
    // The invariant is NOT "profit cannot rise" — treating a typo as $0 does
    // remove a real cost, so profit rises against a correctly-entered rate, and
    // the warning is what covers that. The invariant is that a negative figure
    // is worth the SAME as zero rather than being handed back as a credit, which
    // is what turns a mistyped cost into extra profit.
    const clean = calcScenario(deepClone(fixtureScenario))

    for (const [label, negative, zero] of [
      [
        'equipment interest',
        (s) => (s.fixed.equipment[0].interestRate = -7),
        (s) => (s.fixed.equipment[0].interestRate = 0),
      ],
      [
        'land rent',
        (s) => (s.fixed.landRentPerAcre = -60),
        (s) => (s.fixed.landRentPerAcre = 0),
      ],
      [
        'labor rate',
        (s) => (s.fixed.labor.ratePerHour = -22),
        (s) => (s.fixed.labor.ratePerHour = 0),
      ],
      [
        'overhead',
        (s) => (s.fixed.annual.utilities = -4000),
        (s) => (s.fixed.annual.utilities = 0),
      ],
      [
        'a seed cost',
        (s) => (s.enterprises[0].variable.seed.costPerUnit = -320),
        (s) => (s.enterprises[0].variable.seed.costPerUnit = 0),
      ],
    ]) {
      const bad = deepClone(fixtureScenario)
      negative(bad)
      const good = deepClone(fixtureScenario)
      zero(good)

      const outBad = calcScenario(bad)
      const outGood = calcScenario(good)
      assertAllFinite(outBad, label)

      assert.equal(
        outBad.totals.totalProfit,
        outGood.totals.totalProfit,
        `a negative ${label} must be worth the same as zero, not a credit`
      )
      assert.ok(
        outBad.totals.totalProfit < clean.totals.totalProfit + Math.abs(clean.totals.totalProfit) * 10,
        `a negative ${label} must not blow the total up`
      )
      assert.ok(
        outBad.warnings.length > clean.warnings.length,
        `a negative ${label} is warned about`
      )
    }
  })

  test('salvage greater than initial cost warns and yields negative depreciation (finite)', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].salvageValue = 999999999
    const out = calcScenario(s)
    assertAllFinite(out, 'salvage > initial cost')
    assert.ok(out.warnings.some((w) => w.includes('salvage')))
    assert.ok(out.fixed.equipment[0].annualDep < 0)
  })

  test('zero acres AND zero everything else stays fully finite', () => {
    const out = calcScenario({
      enterprises: [{ id: 'z', crop: 'Nothing', acres: 0 }],
      fixed: {},
    })
    assertAllFinite(out, 'all zero')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4. Extreme magnitudes — overflow hunting
   ══════════════════════════════════════════════════════════════════════════ */

describe('extreme magnitudes', () => {
  test('very large acreage (1e15) stays finite', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].acres = 1e15
    const out = calcScenario(s)
    assertAllFinite(out, 'acres=1e15')
  })

  test('very small acreage (1e-15) stays finite', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].acres = 1e-15
    const out = calcScenario(s)
    assertAllFinite(out, 'acres=1e-15')
  })

  test('very large equipment cost (1e15) stays finite', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].initialCost = 1e15
    s.fixed.equipment[0].salvageValue = 1e14
    const out = calcScenario(s)
    assertAllFinite(out, 'initialCost=1e15')
  })

  test('yield and price individually huge enough that their PRODUCT overflows to Infinity', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].yieldPerAcre = 1e200
    s.enterprises[0].pricePerUnit = 1e200
    const out = calcScenario(s)
    assertAllFinite(out, 'yield=1e200, price=1e200 (product overflow)')
  })

  test('huge yield*price combined with acres=0 (Infinity * 0 = NaN territory)', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].yieldPerAcre = 1e200
    s.enterprises[0].pricePerUnit = 1e200
    s.enterprises[0].acres = 0
    const out = calcScenario(s)
    assertAllFinite(out, 'overflowed per-acre revenue times zero acres')
  })

  test('equipment initialCost + salvageValue individually huge, summed they overflow past MAX_VALUE', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].initialCost = 1e308
    s.fixed.equipment[0].salvageValue = 1e308
    s.fixed.equipment[0].interestRate = 7
    const out = calcScenario(s)
    assertAllFinite(out, 'initialCost=1e308, salvageValue=1e308')
  })

  test('equipment initialCost + salvageValue overflow AND interestRate = 0 (Infinity * 0 = NaN territory)', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment[0].initialCost = 1e308
    s.fixed.equipment[0].salvageValue = 1e308
    s.fixed.equipment[0].interestRate = 0
    const out = calcScenario(s)
    assertAllFinite(out, 'initialCost=1e308, salvageValue=1e308, interestRate=0')
  })

  test('preharvest basis huge combined with rate/months that could overflow', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable.seed.costPerUnit = 1e250
    s.enterprises[0].variable.seed.unitsPerAcre = 1e250
    s.enterprises[0].preharvest = { auto: true, rate: 10, months: 8 }
    const out = calcScenario(s)
    assertAllFinite(out, 'preharvest basis overflow')
  })

  test('preharvest basis overflow with rate = 0 (Infinity * 0 = NaN territory)', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable.seed.costPerUnit = 1e250
    s.enterprises[0].variable.seed.unitsPerAcre = 1e250
    s.enterprises[0].preharvest = { auto: true, rate: 0, months: 8 }
    const out = calcScenario(s)
    assertAllFinite(out, 'preharvest basis overflow, rate=0')
  })

  test('1e400 as a raw string input (already overflowed at parse time) is treated as 0 by num()', () => {
    assert.equal(num('1e400'), 0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5. Malformed scenario structures
   ══════════════════════════════════════════════════════════════════════════ */

describe('malformed scenario structures', () => {
  test('missing enterprises array entirely', () => {
    const out = calcScenario({ fixed: fixtureScenario.fixed })
    assertAllFinite(out, 'missing enterprises')
    assert.deepEqual(out.enterprises, [])
  })

  // A corrupted localStorage record or a hand-edited budget file can present
  // any of these as an object. They are ignored rather than thrown on, matching
  // how every other unusable input in the model is treated.
  test('enterprises as an object instead of an array is ignored, not thrown on', () => {
    const out = calcScenario({
      enterprises: { corn: fixtureScenario.enterprises[0] },
      fixed: {},
    })
    assertAllFinite(out, 'enterprises as object')
    assert.deepEqual(out.enterprises, [])
  })

  test('fixed.equipment as an object instead of an array is ignored', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.equipment = { tractor: s.fixed.equipment[0] }
    const out = calcScenario(s)
    assertAllFinite(out, 'equipment as object')
    assert.deepEqual(out.fixed.equipment, [])
    assert.equal(out.fixed.equipDepTotal, 0)
  })

  test('fixed.buildings as an object instead of an array is ignored', () => {
    const s = deepClone(fixtureScenario)
    s.fixed.buildings = { shed: s.fixed.buildings[0] }
    const out = calcScenario(s)
    assertAllFinite(out, 'buildings as object')
    assert.deepEqual(out.fixed.buildings, [])
  })

  test('a variable line is a bare string instead of an object', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable.seed = '320'
    const out = calcScenario(s)
    assertAllFinite(out, 'variable.seed as string')
  })

  test('variable is null', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable = null
    const out = calcScenario(s)
    assertAllFinite(out, 'variable=null')
  })

  test('an enterprise entry is null', () => {
    const out = calcScenario({ enterprises: [null], fixed: {} })
    assertAllFinite(out, 'enterprise=null')
  })

  test('an enterprise entry is a bare string', () => {
    const out = calcScenario({ enterprises: ['oats'], fixed: {} })
    assertAllFinite(out, 'enterprise=string')
  })

  test('an enterprise entry is a number', () => {
    const out = calcScenario({ enterprises: [42], fixed: {} })
    assertAllFinite(out, 'enterprise=number')
  })

  test('extra unknown keys are ignored, not reflected or mishandled', () => {
    const s = deepClone(fixtureScenario)
    s.enterprises[0].bogusField = { nested: 'garbage' }
    s.bogusTopLevel = 12345
    const out = calcScenario(s)
    assertAllFinite(out, 'extra unknown keys')
  })

  test('deeply missing nested paths: fixed.labor absent, fixed.annual absent', () => {
    const out = calcScenario({
      enterprises: [{ id: 'c', crop: 'Corn', acres: 100, yieldPerAcre: 180, pricePerUnit: 4 }],
      fixed: { equipment: [{}], buildings: [{}] },
    })
    assertAllFinite(out, 'deeply missing nested paths')
  })

  test('scenario itself is null/undefined/a primitive', () => {
    for (const bad of [null, undefined, 'not an object', 42, true, []]) {
      const out = calcScenario(bad)
      assertAllFinite(out, `scenario=${JSON.stringify(bad)}`)
    }
  })

  test('fixed is a bare string', () => {
    const out = calcScenario({ enterprises: fixtureScenario.enterprises, fixed: 'garbage' })
    assertAllFinite(out, 'fixed=string')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6. String parsing oddities
   ══════════════════════════════════════════════════════════════════════════ */

describe('string parsing from raw HTML inputs', () => {
  test('whitespace-padded numeric strings parse correctly', () => {
    assert.equal(num(' 5 '), 5)
    assert.equal(num('\t42\n'), 42)
  })

  test('thousands separators are understood', () => {
    // Number("1,000") is NaN. Left unhandled, a producer who types or pastes
    // "1,000" acres would be modelled as 0 acres with nothing to show for it.
    assert.equal(num('1,000'), 1000)
    assert.equal(num('1,234,567.89'), 1234567.89)
  })

  test('currency symbols are understood', () => {
    assert.equal(num('$5'), 5)
    assert.equal(num('$1,234.56'), 1234.56)
  })

  test('leading zeros parse fine', () => {
    assert.equal(num('007'), 7)
    assert.equal(num('00.5'), 0.5)
  })

  test('trailing-decimal-point strings parse fine', () => {
    assert.equal(num('3.'), 3)
    assert.equal(num('.5'), 0.5)
  })

  test('a bare minus sign or bare "e" is rejected to 0', () => {
    assert.equal(num('-'), 0)
    assert.equal(num('e'), 0)
    assert.equal(num('-.'), 0)
  })

  test('the literal strings "NaN"/"Infinity" are rejected to 0, not passed through', () => {
    assert.equal(num('NaN'), 0)
    assert.equal(num('Infinity'), 0)
    assert.equal(num('-Infinity'), 0)
  })

  test('hex-like and scientific strings', () => {
    assert.equal(num('0x10'), 16) // Number() understands hex; farmers won't type this, but it's a quirk
    assert.equal(num('1e3'), 1000)
    assert.equal(num('1e-3'), 0.001)
  })

  test('an array with a single numeric element coerces via Number() oddities', () => {
    // Number([5]) === 5 (JS quirk: single-element arrays coerce to their element).
    assert.equal(num([5]), 5)
    // Number([5, 6]) is NaN -> 0.
    assert.equal(num([5, 6]), 0)
  })

  test('whole scenario built entirely from raw HTML-input strings stays finite', () => {
    const s = {
      enterprises: [
        {
          id: 'c',
          crop: 'Corn',
          acres: ' 500 ',
          yieldPerAcre: '180',
          pricePerUnit: '4.25',
          miscIncomePerAcre: '',
          variable: {
            seed: { mode: 'unit', costPerUnit: '320', unitsPerAcre: '0.35' },
            cropInsurance: { mode: 'perAcre', perAcre: '22' },
          },
        },
      ],
      fixed: {
        landRentPerAcre: '165',
        labor: { ratePerHour: '24', totalHoursPerYear: '1,200' }, // thousands separator
        equipment: [
          { id: 't', name: 'Tractor', initialCost: '285,000', salvageValue: '$95000', usefulLife: '12', interestRate: '7' },
        ],
        buildings: [],
        annual: { utilities: '4800', farmInsurance: '', duesFees: undefined, misc: null },
      },
    }
    const out = calcScenario(s)
    assertAllFinite(out, 'all-string scenario')
    // Separators and currency symbols survive the round trip rather than
    // collapsing a real cost to zero.
    assert.equal(out.fixed.totalHoursPerYear, 1200, 'totalHoursPerYear "1,200"')
    assert.equal(out.fixed.equipment[0].initialCost, 285000, 'initialCost "285,000"')
    assert.equal(out.fixed.equipment[0].salvageValue, 95000, 'salvageValue "$95000"')
    // Blank, undefined and null annual costs are all simply $0.
    assert.equal(out.fixed.annualTotal, 4800)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   7. Preharvest interest basis correctness under unusual configurations
   ══════════════════════════════════════════════════════════════════════════ */

describe('preharvest interest basis excludes hauling/drying/marketing', () => {
  test('extreme hauling/drying/marketing values do not leak into preharvestBasis', () => {
    const ent = deepClone(fixtureScenario.enterprises[0])
    ent.variable.hauling = { mode: 'unit', costPerUnit: 1e9, unitsPerAcre: 1e9 }
    ent.variable.drying = { mode: 'unit', costPerUnit: 1e9, unitsPerAcre: 1e9 }
    ent.variable.marketing = { mode: 'perAcre', perAcre: 1e9 }
    ent.preharvest = { auto: true, rate: 10, months: 8 }
    const out = calcEnterprise(ent)
    // preharvestBasis should be unchanged from the known-good 431.2 baseline
    // computed in calc.test.js, regardless of hauling/drying/marketing size.
    assert.ok(
      Math.abs(out.preharvestBasis - 431.2) < 1e-6,
      `preharvestBasis leaked postharvest costs: ${out.preharvestBasis}`
    )
    assert.ok(Number.isFinite(out.preharvestBasis))
  })

  test('negative hauling/drying/marketing do not leak into preharvestBasis', () => {
    const ent = deepClone(fixtureScenario.enterprises[0])
    ent.variable.hauling = { mode: 'unit', costPerUnit: -50, unitsPerAcre: 180 }
    ent.variable.drying = { mode: 'unit', costPerUnit: -50, unitsPerAcre: 180 }
    ent.variable.marketing = { mode: 'perAcre', perAcre: -500 }
    ent.preharvest = { auto: true, rate: 10, months: 8 }
    const out = calcEnterprise(ent)
    assert.ok(
      Math.abs(out.preharvestBasis - 431.2) < 1e-6,
      `preharvestBasis leaked postharvest costs: ${out.preharvestBasis}`
    )
  })

  test('preharvest.auto = false with a poisoned manualPerAcre never yields non-finite', () => {
    for (const poison of ['', 'abc', null, undefined, NaN, Infinity, '1e400']) {
      const ent = deepClone(fixtureScenario.enterprises[0])
      ent.preharvest = { auto: false, manualPerAcre: poison }
      const out = calcEnterprise(ent)
      assert.ok(
        Number.isFinite(out.preharvestInterestPerAcre),
        `manualPerAcre=${JSON.stringify(poison)} -> preharvestInterestPerAcre=${out.preharvestInterestPerAcre}`
      )
    }
  })

  test('preharvestBasis only sums the 11 preharvest lines, never the 3 postharvest ones', () => {
    const ent = deepClone(fixtureScenario.enterprises[0])
    // Zero out everything except hauling/drying/marketing.
    for (const key of Object.keys(ent.variable)) {
      if (['hauling', 'drying', 'marketing'].includes(key)) continue
      ent.variable[key] = { mode: 'perAcre', perAcre: 0 }
    }
    const out = calcEnterprise(ent)
    assert.equal(out.preharvestBasis, 0, 'basis should be exactly 0 when only postharvest lines are nonzero')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   The v6 entry modes, under the same poison
   ══════════════════════════════════════════════════════════════════════════ */

describe('the population and total modes never produce NaN/Infinity', () => {
  // Same table as the block at the top of this file. These two modes introduced
  // the first DIVISION inside a variable expense line, which is exactly the
  // shape that turns two finite inputs into Infinity and then, one multiply
  // later, into "NaN" on a producer's screen.
  const poisonValues = [
    '', 'abc', '3.', '-', '1e400', '-1e400', '0.1', ' 5 ', null, undefined,
    [], [5], {}, { a: 1 }, 'NaN', 'Infinity', '-Infinity', '$5', '1,000',
    '007', '  ', '5px', true, false, () => 5, 0, -0, -1,
  ]

  for (const poison of poisonValues) {
    test(`seed.seedsPerBag = ${JSON.stringify(poison)}`, () => {
      // The divisor. safeDiv guards an exact zero; everything else has to come
      // through num() finite or this is the one that breaks.
      const s = deepClone(fixtureScenario)
      s.enterprises[0].variable.seed = {
        mode: 'population',
        costPerBag: 285,
        population: 33000,
        seedsPerBag: poison,
      }
      assertAllFinite(calcScenario(s), `seedsPerBag=${JSON.stringify(poison)}`)
    })

    test(`seed.population = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].variable.seed = {
        mode: 'population',
        costPerBag: 285,
        population: poison,
        seedsPerBag: 80000,
      }
      assertAllFinite(calcScenario(s), `population=${JSON.stringify(poison)}`)
    })

    test(`cropInsurance.totalCost = ${JSON.stringify(poison)}`, () => {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].variable.cropInsurance = { mode: 'total', totalCost: poison }
      assertAllFinite(calcScenario(s), `totalCost=${JSON.stringify(poison)}`)
    })

    test(`acres = ${JSON.stringify(poison)} with a total-mode premium`, () => {
      // The other divisor, and the one that varies independently of the line.
      const s = deepClone(fixtureScenario)
      s.enterprises[0].acres = poison
      s.enterprises[0].variable.cropInsurance = { mode: 'total', totalCost: 3200 }
      assertAllFinite(calcScenario(s), `acres=${JSON.stringify(poison)}`)
    })
  }

  test('an overflow in the numerator collapses to 0, as everywhere else', () => {
    // costPerBag x population can exceed Number.MAX_VALUE with both inputs
    // finite. finite() catches it before safeDiv sees it.
    const s = deepClone(fixtureScenario)
    s.enterprises[0].variable.seed = {
      mode: 'population',
      costPerBag: 1e308,
      population: 1e308,
      seedsPerBag: 1,
    }
    const out = calcScenario(s)
    assertAllFinite(out, 'population overflow')
    assert.equal(out.enterprises[0].lines.seed, 0)
  })

  test('a mode nobody recognises falls back to the sheet, never to zero', () => {
    // A hand-edited file or a future key. Falling back to 0 would silently erase
    // a real cost, the same failure perYearFactor() returns 1 to avoid.
    const line = { mode: 'wat', costPerUnit: 10, unitsPerAcre: 3 }
    assert.equal(linePerAcre(line), 30)
  })

  test('the new modes are ignored while the line is set to another', () => {
    // Each mode reads only its own keys, so switching back and forth round-trips
    // and a stale figure in an unused mode can never leak into a total.
    const line = {
      mode: 'unit',
      costPerUnit: 10,
      unitsPerAcre: 3,
      perAcre: 99,
      costPerBag: 285,
      population: 33000,
      seedsPerBag: 80000,
      totalCost: 5000,
    }
    assert.equal(linePerAcre(line, 100), 30)
    assert.equal(linePerAcre({ ...line, mode: 'perAcre' }, 100), 99)
    assert.equal(linePerAcre({ ...line, mode: 'population' }, 100), 117.5625)
    assert.equal(linePerAcre({ ...line, mode: 'total' }, 100), 50)
  })

  test('a negative figure in either new mode is worth zero, never a credit', () => {
    // The invariant the whole suite asserts: treating a typo as $0 can RAISE
    // profit, because it removes a real cost. What must never happen is a
    // negative expense being handed back as income.
    for (const line of [
      { mode: 'population', costPerBag: -285, population: 33000, seedsPerBag: 80000 },
      { mode: 'population', costPerBag: 285, population: -33000, seedsPerBag: 80000 },
      { mode: 'total', totalCost: -3200 },
    ]) {
      const s = deepClone(fixtureScenario)
      s.enterprises[0].variable.seed = { mode: 'perAcre', perAcre: 0 }
      s.enterprises[0].variable.cropInsurance = line.mode === 'total' ? line : { mode: 'perAcre', perAcre: 0 }
      if (line.mode === 'population') s.enterprises[0].variable.seed = line
      const out = calcScenario(s)
      assertAllFinite(out, JSON.stringify(line))
      const key = line.mode === 'total' ? 'cropInsurance' : 'seed'
      assert.equal(out.enterprises[0].lines[key], 0, `${JSON.stringify(line)} counted as $0`)
    }
  })
})
