/**
 * Typical values are the one part of this app that asserts a fact about the
 * world on someone else's authority. A bad figure here reaches a producer with
 * a USDA or Iowa State citation printed under it, which is worse than no figure
 * at all — so the shape of this data is checked mechanically.
 *
 * The land rent figures in particular were extracted from a PDF by script
 * rather than typed, and these tests are what stand behind that decision.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  TYPICAL_VALUES,
  EQUIPMENT_CATALOG,
  BUILDING_CATALOG,
  SEED_CROPS,
  matchCategory,
  matchCrop,
} from '../src/data/typical-values.js'
import { YIELD_UNITS } from '../src/ui/enterprise.js'

const specs = Object.entries(TYPICAL_VALUES)

describe('a figure quoted per yield unit says which one', () => {
  // Hauling and drying are published in dollars per BUSHEL. Applying one records
  // that on the line so main.js can clear it if the enterprise is later measured
  // in tons; a spec naming a unit the picker does not offer would never match,
  // and the figure would be thrown away the first time the unit was touched.
  const quoted = specs.filter(([, spec]) => spec.quotedPerYieldUnit)

  test('the per-bushel lists are the ones that declare it', () => {
    assert.deepEqual(
      quoted.map(([key]) => key).sort(),
      ['drying', 'hauling'],
      'every list quoted per unit of yield declares which unit'
    )
  })

  test('each names a unit the producer can actually select', () => {
    for (const [key, spec] of quoted) {
      assert.ok(
        YIELD_UNITS.includes(spec.quotedPerYieldUnit),
        `${key} is quoted per "${spec.quotedPerYieldUnit}", which is not an option`
      )
    }
  })

  test('only a per-unit list can be quoted per yield unit', () => {
    // A $/acre figure has nothing to do with bushels or tons, so declaring one
    // would clear a perfectly good number for no reason.
    for (const [key, spec] of quoted) {
      assert.equal(spec.appliesTo, 'unit', `${key} writes into the cost-per-unit box`)
    }
  })
})

describe('every typical value is citable and well formed', () => {
  test('each spec has a title, a unit and at least one group', () => {
    for (const [key, spec] of specs) {
      assert.ok(spec.title, `${key} has a title`)
      assert.ok(spec.unit, `${key} states its unit`)
      assert.ok(spec.groups?.length, `${key} has options`)
    }
  })

  test('nothing ships without a source or an explicit reason for having none', () => {
    for (const [key, spec] of specs) {
      // `source: null` is allowed only where the modal explains itself instead
      // — salvage value, which is arithmetic rather than market data.
      if (spec.source === null) {
        assert.ok(spec.note, `${key} has no source, so it must explain itself`)
        continue
      }
      assert.equal(typeof spec.source, 'string', `${key} cites a source`)
      assert.ok(spec.source.length > 30, `${key}'s citation names a document`)
    }
  })

  test('every option value is a usable number or a resolvable sentinel', () => {
    for (const [key, spec] of specs) {
      for (const group of spec.groups) {
        assert.ok(group.label, `${key} group has a label`)
        assert.ok(group.options.length, `${key}/${group.label} has options`)
        for (const o of group.options) {
          assert.ok(o.label, `${key}/${group.label} option has a label`)
          if (typeof o.value === 'string') {
            assert.match(
              o.value,
              /^=[\d.]+\*\w+$/,
              `${key} sentinel "${o.value}" must be resolvable by ui/modals.js`
            )
            continue
          }
          assert.equal(
            Number.isFinite(o.value),
            true,
            `${key}/${o.label} is a finite number`
          )
          assert.ok(o.value >= 0, `${key}/${o.label} is not negative`)
        }
      }
    }
  })

  test('an entry-mode claim is one the line UI can honour', () => {
    // Checked at BOTH levels. A spec may declare `appliesTo` per group, because
    // phosphorus is published as a price per pound and as a cost per acre and
    // both are worth offering — and a group's claim decides which box the value
    // lands in, so a typo there is a figure written into the wrong field and
    // multiplied by a rate a second time.
    for (const [key, spec] of specs) {
      const claims = [spec.appliesTo, ...spec.groups.map((g) => g.appliesTo)]
      for (const claim of claims) {
        if (!claim) continue
        assert.ok(
          claim === 'perAcre' || claim === 'unit',
          `${key} appliesTo must name an entry mode, got "${claim}"`
        )
      }
    }
  })

  test('a group quoted in its own unit also says which box it belongs in', () => {
    // The two travel together. A group that overrides the unit but not the
    // entry mode prints "$/acre" over figures that land in the cost-per-unit
    // box, which is the exact mismatch the unit line exists to prevent.
    for (const [key, spec] of specs) {
      for (const g of spec.groups) {
        if (g.unit == null) continue
        assert.ok(
          g.appliesTo,
          `${key} group "${g.label}" overrides the unit and must also declare appliesTo`
        )
      }
    }
  })

  test('provisional entries say so in their note, not only in a flag', () => {
    for (const [key, spec] of specs) {
      if (spec.status !== 'provisional') continue
      assert.ok(spec.note, `${key} is provisional and must carry a caveat`)
    }
  })
})

describe('South Dakota overhead, from FINBIN crop enterprise records', () => {
  const KEYS = ['overheadUtilities', 'overheadInsurance', 'overheadDues', 'overheadMisc']

  // Read off FINBIN reports 972802 (corn) and 972803 (soybeans), South Dakota
  // 2025, "Overhead Expenses" block. Transcribed here a second time on purpose:
  // if a figure in the shipped data is edited by hand, this disagrees.
  const PUBLISHED = {
    overheadUtilities: [6.11, 4.79],
    overheadInsurance: [12.49, 9.37],
    overheadDues: [4.97, 4.29],
    overheadMisc: [8.07, 6.98],
  }

  test('all four overhead lines are offered', () => {
    for (const key of KEYS) assert.ok(TYPICAL_VALUES[key], `${key} is shipped`)
  })

  test('each figure matches the published report', () => {
    for (const key of KEYS) {
      const options = TYPICAL_VALUES[key].groups.flatMap((g) => g.options)
      const shares = options.map((o) => Number(/^=([\d.]+)\*acres$/.exec(o.value)[1]))
      assert.deepEqual(shares, PUBLISHED[key], `${key} matches FINBIN`)
    }
  })

  test('corn always costs more than soybeans, as the two reports show', () => {
    for (const key of KEYS) {
      const [corn, soy] = PUBLISHED[key]
      assert.ok(corn > soy, `${key}: corn overhead exceeds soybean overhead`)
    }
  })

  test('every overhead sentinel multiplies by acres, never by a sibling field', () => {
    // `acres` is resolved from the whole farm by ui/modals.js. A sentinel naming
    // anything else would look for `fixed.annual.<name>`, find nothing, and show
    // the "enter your acres" guard forever.
    for (const key of KEYS) {
      for (const o of TYPICAL_VALUES[key].groups.flatMap((g) => g.options)) {
        assert.match(o.value, /^=[\d.]+\*acres$/, `${key}/${o.label} multiplies by acres`)
      }
    }
  })

  test('each spec pins the period its figures are for', () => {
    // The published figure is a full year. Without this the picker cannot move a
    // line off "$ / month", and calcFixed() would multiply it by twelve.
    for (const key of KEYS) {
      assert.equal(TYPICAL_VALUES[key].basis, 'year', `${key} declares a yearly basis`)
      assert.ok(TYPICAL_VALUES[key].requires?.message, `${key} explains what it needs`)
    }
  })

  test('the citation names the database, the state, the year and the sample size', () => {
    for (const key of KEYS) {
      const source = TYPICAL_VALUES[key].source
      assert.match(source, /FINBIN/)
      assert.match(source, /South Dakota/)
      assert.match(source, /2025/)
      // Eight farms is thin enough that hiding it would be a misrepresentation.
      assert.match(source, /[Ee]ight farms/)
    }
  })

  test('the note tells the producer these are a check, not a substitute', () => {
    for (const key of KEYS) {
      // The sample size is carried by the citation, asserted above. The note's
      // job is the caveat that goes with it.
      assert.match(TYPICAL_VALUES[key].note, /check your own bills rather than in place of them/i)
    }
  })
})

describe('South Dakota land rent, extracted from the NASS county maps', () => {
  const spec = TYPICAL_VALUES.landRent
  const byLabel = Object.fromEntries(spec.groups.map((g) => [g.label, g.options]))

  test('the citation names the survey, the geography and the release date', () => {
    assert.match(spec.source, /National Agricultural Statistics Service/)
    assert.match(spec.source, /South Dakota/)
    assert.match(spec.source, /2025/)
  })

  test('the three land types are present with the counts NASS published', () => {
    // 66 SD counties. Non-irrigated cropland omits Fall River and Oglala Lakota;
    // pasture omits Clark and Union; only nine counties report irrigated ground.
    assert.equal(byLabel['Cropland, non-irrigated'].length, 64)
    assert.equal(byLabel['Pasture'].length, 64)
    assert.equal(byLabel['Cropland, irrigated'].length, 9)
  })

  test('counties NASS did not publish are absent, never guessed', () => {
    const names = (label) => byLabel[label].map((o) => o.label)
    assert.ok(!names('Cropland, non-irrigated').includes('Fall River County'))
    assert.ok(!names('Cropland, non-irrigated').includes('Oglala Lakota County'))
    assert.ok(!names('Pasture').includes('Clark County'))
    assert.ok(!names('Pasture').includes('Union County'))
  })

  test('the extracted ranges match the legend bands printed on the maps', () => {
    const range = (label) => {
      const vs = byLabel[label].map((o) => o.value)
      return [Math.min(...vs), Math.max(...vs)]
    }
    assert.deepEqual(range('Cropland, non-irrigated'), [24, 251])
    assert.deepEqual(range('Pasture'), [6.8, 73])
    assert.deepEqual(range('Cropland, irrigated'), [115, 281])
  })

  test('every entry is a South Dakota county, spelled as one', () => {
    for (const group of spec.groups) {
      for (const o of group.options) {
        assert.match(o.label, /^[A-Z][a-zA-Z ]+ County$/, `"${o.label}" reads as a county`)
        // A run-together name is what a failed PDF extraction looks like —
        // "FallRiverOglalaLakotaMeade County". McCook and McPherson are the
        // only legitimate internal capitals in South Dakota.
        assert.ok(
          !/[a-z][A-Z]/.test(o.label.replace(/\bMc/g, '')),
          `"${o.label}" has two county names stuck together`
        )
      }
    }
  })

  test('no county appears twice within a land type', () => {
    for (const group of spec.groups) {
      const names = group.options.map((o) => o.label)
      assert.equal(new Set(names).size, names.length, `${group.label} has no duplicates`)
    }
  })

  test('a few figures spot-check against the published maps', () => {
    const find = (label, county) =>
      byLabel[label].find((o) => o.label === county)?.value
    assert.equal(find('Cropland, non-irrigated', 'Moody County'), 251)
    assert.equal(find('Cropland, non-irrigated', 'Custer County'), 24)
    assert.equal(find('Cropland, non-irrigated', 'McPherson County'), 105)
    assert.equal(find('Cropland, non-irrigated', 'Bon Homme County'), 164)
    assert.equal(find('Pasture', 'Oglala Lakota County'), 6.8)
    assert.equal(find('Pasture', 'Lake County'), 73)
    assert.equal(find('Cropland, irrigated', 'Clay County'), 281)
    assert.equal(find('Cropland, irrigated', 'Butte County'), 115)
  })
})

describe('Iowa State A3-29 figures, as published', () => {
  const life = TYPICAL_VALUES.usefulLifeEquipment
  const salvage = TYPICAL_VALUES.salvageValue
  const lifeOptions = life.groups.flatMap((g) => g.options)

  test('both cite A3-29 by file number and edition', () => {
    for (const spec of [life, salvage]) {
      assert.match(spec.source, /A3-29/)
      assert.match(spec.source, /March 2026/)
    }
  })

  test('15 years is offered for tractors and for nothing else', () => {
    // "...an economic life of 10 to 12 years for most farm machines and a
    // 15-year life for tractors". Planters, tillage tools, grain handling and
    // trucks all carried 15 here before the source was read; they must not
    // drift back.
    for (const o of lifeOptions) {
      if (o.value !== 15) continue
      assert.deepEqual(o.categories, ['tractor'], `15 years offered for ${o.label}`)
    }
  })

  test('every non-tractor life is inside the published 10-to-12 range', () => {
    for (const o of lifeOptions) {
      if (o.categories?.includes('tractor')) continue
      assert.ok(
        o.value >= 10 && o.value <= 12,
        `${o.label} is outside A3-29's 10–12 years for most farm machines`
      )
    }
  })

  test('the useful-life entries are no longer provisional', () => {
    assert.equal(life.status, undefined, 'A3-29 states this directly; it is sourced now')
  })

  test('building lives stay provisional — A3-29 covers machinery only', () => {
    assert.equal(TYPICAL_VALUES.usefulLifeBuilding.status, 'provisional')
  })

  test('salvage percentages match Table 1a at moderate annual use', () => {
    const pct = (groupLabel, ageLabel) => {
      const g = salvage.groups.find((x) => x.label.startsWith(groupLabel))
      assert.ok(g, `group ${groupLabel} exists`)
      const o = g.options.find((x) => x.label.startsWith(ageLabel))
      assert.ok(o, `${groupLabel} / ${ageLabel} exists`)
      return Number(/^=([\d.]+)\*/.exec(o.value)[1])
    }
    // Read off Table 1a: tractors at 400 h/yr, combines at 300 h/yr.
    assert.equal(pct('Tractor over 150 hp', 'Kept 10'), 0.32)
    assert.equal(pct('Tractor over 150 hp', 'Kept 12'), 0.28)
    assert.equal(pct('Tractor over 150 hp', 'Kept 15'), 0.23)
    assert.equal(pct('Tractor 80–149 hp', 'Kept 12'), 0.34)
    assert.equal(pct('Tractor under 80 hp', 'Kept 12'), 0.29)
    assert.equal(pct('Combine', 'Kept 12'), 0.18)
    assert.equal(pct('Combine', 'Kept 15'), 0.13)
  })

  test('salvage falls monotonically with years kept, in every class', () => {
    for (const g of salvage.groups) {
      if (g.table !== '1a') continue
      const values = g.options.map((o) => Number(/^=([\d.]+)\*/.exec(o.value)[1]))
      for (let i = 1; i < values.length; i++) {
        assert.ok(values[i] < values[i - 1], `${g.label} must decline with age`)
      }
    }
  })

  test('every Table 1b class is offered, under A3-29’s own column heading', () => {
    // The eight column headings of Table 1b, verbatim. If a class is dropped or
    // renamed, a producer loses the ability to see which one they are picking.
    // The table a group came from is carried as a flag, not spelled out in the
    // heading — provenance belongs in the modal's source footer, not in the row
    // a producer is choosing between.
    for (const cls of [
      'Plows and subsoilers',
      'Other tillage',
      'Planter, drill, or sprayer',
      'Mower or chopper',
      'Baler',
      'Swather or rake',
      'Vehicle',
      'Other machinery',
    ]) {
      assert.ok(
        salvage.groups.some((g) => g.label === cls && g.table === '1b'),
        `Table 1b class "${cls}" is offered`
      )
    }
  })

  test('every Table 1b figure sits inside its column’s published range', () => {
    // An independent check on transcription: read off the age-1 (highest) and
    // age-20 (lowest) rows of the printed table. Anything shipped for ages
    // 10/12/15 must fall between them, or a column was copied from the wrong
    // place. This catches a shifted column, which monotonicity alone would not.
    const BOUNDS = {
      'Plows and subsoilers': [0.26, 0.47],
      'Other tillage': [0.16, 0.61],
      'Planter, drill, or sprayer': [0.29, 0.65],
      'Mower or chopper': [0.21, 0.47],
      Baler: [0.16, 0.56],
      'Swather or rake': [0.15, 0.49],
      Vehicle: [0.19, 0.42],
      'Other machinery': [0.2, 0.69],
    }
    for (const [cls, [low, high]] of Object.entries(BOUNDS)) {
      const g = salvage.groups.find((x) => x.label === cls && x.table === '1b')
      for (const o of g.options) {
        const share = Number(/^=([\d.]+)\*/.exec(o.value)[1])
        assert.ok(
          share >= low && share <= high,
          `${cls} ${o.label}: ${share} is outside the printed column range ${low}–${high}`
        )
      }
    }
  })

  test('a category spanning two Table 1b columns is offered both, never one', () => {
    // A chisel plow is a "Plow"; a disk is "Other tillage". Both are `tillage`
    // here, and A3-29 gives no basis for choosing between 32% and 26% on the
    // producer's behalf.
    const forTillage = salvage.groups.filter((g) =>
      g.options.some((o) => o.categories?.includes('tillage'))
    )
    assert.equal(forTillage.length, 2, 'tillage sees both plow and other-tillage classes')
  })

  test('an uncited fallback remains for a machine that matched no class', () => {
    const fallback = salvage.groups.find((g) => /None of these/.test(g.label))
    assert.ok(fallback, 'the fallback group is still there')
    assert.ok(
      fallback.options.every((o) => !o.categories),
      'the fallback is offered whatever the machine'
    )
  })

  test('every equipment category can reach a sourced salvage figure', () => {
    const sourced = new Set(
      salvage.groups
        .filter((g) => g.table)
        .flatMap((g) => g.options.flatMap((o) => o.categories ?? []))
    )
    for (const { category } of EQUIPMENT_CATALOG) {
      assert.ok(sourced.has(category), `category "${category}" has a cited salvage class`)
    }
  })

  test('the salvage note warns that the base is list price, not what you paid', () => {
    assert.match(salvage.note, /list price/i)
  })
})

describe('equipment name matching only ever filters', () => {
  test('every catalog entry carries a category', () => {
    for (const item of [...EQUIPMENT_CATALOG, ...BUILDING_CATALOG]) {
      assert.ok(item.name, 'catalog entry has a name')
      assert.ok(item.category, `${item.name} has a category`)
    }
  })

  test('every category a match can produce has options to filter to', () => {
    const offered = new Set(
      TYPICAL_VALUES.usefulLifeEquipment.groups.flatMap((g) =>
        g.options.flatMap((o) => o.categories ?? [])
      )
    )
    const produced = new Set(EQUIPMENT_CATALOG.map((c) => c.category))
    for (const category of produced) {
      // 'other' is the deliberate escape hatch: it matches nothing, so the
      // picker falls back to showing the full list.
      if (category === 'other') continue
      assert.ok(offered.has(category), `category "${category}" has useful-life options`)
    }
  })

  test('a free-typed name still resolves to the right category', () => {
    assert.equal(matchCategory('John Deere 1770 planter'), 'planting')
    assert.equal(matchCategory('no-till drill'), 'planting')
    assert.equal(matchCategory('something nobody sells'), '')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   South Dakota crop budgets
   ══════════════════════════════════════════════════════════════════════════ */

describe('South Dakota crop budgets, as published', () => {
  // Re-transcribed from the workbook rather than read back out of the module,
  // the same way the FINBIN block above does it. A test that reads the figure
  // from the code it is checking proves only that the code is self-consistent.
  //
  // Source: SDSU Extension, 2026 Crop Production Budgets (P-00138-2026), sheets
  // "East & Central High Production", "East & Central Mid Production" and
  // "Central & West Low Production". Columns are corn, soybeans, spring wheat,
  // winter wheat, in the workbook's own order.
  const PUBLISHED = {
    fuelOil: [
      [36, 22, 20, 20],
      [36, 23, 26, 21],
      [29, 27, 20, 20],
    ],
    repairs: [
      [66, 41, 36, 36],
      [67, 41, 36, 34],
      [64, 36, 33, 34],
    ],
    cropInsurance: [
      [32, 26, 22, 22],
      [31, 27, 21, 22],
      [27, 23, 19, 18],
    ],
  }

  const CROPS = ['Corn', 'Soybeans', 'Spring wheat', 'Winter wheat']

  for (const [key, table] of Object.entries(PUBLISHED)) {
    test(`${key} matches the workbook, zone by zone`, () => {
      const spec = TYPICAL_VALUES[key]
      assert.ok(spec, `${key} is shipped`)
      assert.equal(spec.groups.length, 3, 'one group per production zone')
      table.forEach((row, z) => {
        const options = spec.groups[z].options
        assert.deepEqual(
          options.map((o) => o.label),
          CROPS,
          `${key} zone ${z} offers every crop the budget covers`
        )
        assert.deepEqual(
          options.map((o) => o.value),
          row,
          `${key} zone ${z}`
        )
      })
    })
  }

  test('the three zones are named in the workbook order', () => {
    // High, mid, low. A producer picking "the middle one" off a list that has
    // been reordered gets a different farm's costs.
    for (const key of Object.keys(PUBLISHED)) {
      const labels = TYPICAL_VALUES[key].groups.map((g) => g.label)
      assert.match(labels[0], /high production/i, key)
      assert.match(labels[1], /mid production/i, key)
      assert.match(labels[2], /low production/i, key)
    }
  })

  test('the citation names the publisher, the file number, and the author', () => {
    for (const key of [...Object.keys(PUBLISHED), 'phosphorus', 'potassium', 'seed']) {
      const source = TYPICAL_VALUES[key].source
      assert.match(source, /SDSU Extension/, key)
      assert.match(source, /P-00138-2026/, key)
      assert.match(source, /Sellars/, key)
    }
  })

  test('these carry no "not South Dakota" caveat, because they are', () => {
    // The Iowa lists have to warn that they are Iowa. These are the reason that
    // caveat exists, and repeating it here would be false.
    for (const key of Object.keys(PUBLISHED)) {
      assert.doesNotMatch(TYPICAL_VALUES[key].note ?? '', /not South Dakota/i, key)
    }
  })
})

describe('the three nutrients are offered on the same terms', () => {
  // A picker that quotes a price per pound for potash and nothing at all for
  // nitrogen invites a budget with two nutrients costed and one left blank.
  const NUTRIENTS = ['nitrogen', 'phosphorus', 'potassium']

  // $/lb of NUTRIENT, derived the way the workbook's own "Input Assumptions"
  // sheet derives them: price per ton, over 2000, over the analysis. Urea is
  // 46% N at $575/ton, MAP 11-52-0 is 52% P2O5 at $800, potash 0-0-60 is 60%
  // K2O at $470. Written out rather than pasted so the arithmetic is checkable.
  const PRICE_PER_LB = {
    nitrogen: 575 / 2000 / 0.46,
    phosphorus: 800 / 2000 / 0.52,
    potassium: 470 / 2000 / 0.6,
  }

  test('each offers a price per pound and a cost per acre', () => {
    for (const key of NUTRIENTS) {
      const spec = TYPICAL_VALUES[key]
      const modes = new Set(spec.groups.map((g) => g.appliesTo ?? spec.appliesTo))
      assert.ok(modes.has('unit'), `${key} offers a per-pound price`)
      assert.ok(modes.has('perAcre'), `${key} offers a per-acre cost`)
    }
  })

  test('the per-pound price is the one the workbook publishes', () => {
    for (const key of NUTRIENTS) {
      const spec = TYPICAL_VALUES[key]
      const perLb = spec.groups.find((g) => (g.appliesTo ?? spec.appliesTo) === 'unit')
      // Nitrogen offers a choice of source; the other two are one product each.
      // Whichever is FIRST has to be the one the per-acre figures below were
      // computed from, or the two halves of the picker disagree.
      // A tenth of a cent: the shipped figure is rounded for the data file and
      // the picker prints three decimals, but it has to be close enough that
      // rate x price still lands on the per-acre figures.
      assert.ok(
        Math.abs(perLb.options[0].value - PRICE_PER_LB[key]) < 0.001,
        `${key}: shipped ${perLb.options[0].value}, workbook ${PRICE_PER_LB[key]}`
      )
    }
  })

  test('every nitrogen source is priced off its own analysis', () => {
    // Four products, and the arithmetic is the same each time: price per ton,
    // over 2000, over the percentage of N in the bag. Written out so a future
    // addition has a worked example to copy.
    const SOURCES = {
      'Urea, 46-0-0': 575 / 2000 / 0.46,
      'UAN solution, 28-0-0': 395 / 2000 / 0.28,
      // NOT the workbook's own figure. It divides AMS by 11% nitrogen, a formula
      // dragged down from the MAP row above it, and publishes $2.32. AMS is 21%
      // N. The sulfur figure on the same row is right, which is what makes the
      // slip visible rather than merely suspicious. See TYPICAL-VALUES.md.
      'Ammonium sulfate, 21-0-0-24S': 510 / 2000 / 0.21,
      // The one figure here that is not South Dakota's, from a different
      // publication and with the state on its own label. Nothing in South
      // Dakota prices anhydrous, and it is the cheapest nitrogen per pound and
      // the one most corn acres actually get, so leaving it off the list left
      // the picker missing the product a producer is most likely to be pricing.
      'Anhydrous ammonia, 82-0-0, Illinois': 786 / 2000 / 0.82,
    }
    const offered = TYPICAL_VALUES.nitrogen.groups
      .filter((g) => (g.appliesTo ?? TYPICAL_VALUES.nitrogen.appliesTo) === 'unit')
      .flatMap((g) => g.options)

    assert.deepEqual(
      offered.map((o) => o.label),
      Object.keys(SOURCES),
      'every N source offered is one this test knows how to check'
    )
    for (const o of offered) {
      assert.ok(
        Math.abs(o.value - SOURCES[o.label]) < 0.001,
        `${o.label}: shipped ${o.value}, derived ${SOURCES[o.label].toFixed(4)}`
      )
    }
  })

  test('no multi-nutrient product is priced as if it were all nitrogen', () => {
    // MAP 11-52-0 and 10-34-0 are in the same table and are deliberately absent.
    // Charging a whole multi-nutrient product to nitrogen prices N at $3.64 and
    // $3.00 a pound, five times urea, because the phosphate in the bag is being
    // paid for on the nitrogen line.
    const offered = TYPICAL_VALUES.nitrogen.groups
      .filter((g) => (g.appliesTo ?? TYPICAL_VALUES.nitrogen.appliesTo) === 'unit')
      .flatMap((g) => g.options)
    for (const o of offered) {
      assert.ok(o.value < 2, `${o.label} at $${o.value}/lb of N is a whole blend charged to N`)
    }
  })

  test('every per-acre figure is its zone rate times that price', () => {
    // The check that catches a transcription slip: each option's caption states
    // the pounds per acre it came from, so the figure and its own explanation
    // have to agree.
    //
    // One cent, not half a cent. Spring wheat's nitrogen works out to exactly
    // $78.125, which rounds to 78.12 or 78.13 depending on which convention you
    // reach for, and both are right. A cent is still three orders of magnitude
    // tighter than any real transcription error, which moves dollars.
    for (const key of NUTRIENTS) {
      const spec = TYPICAL_VALUES[key]
      for (const g of spec.groups) {
        // Material groups only. Nitrogen's application group is also per acre
        // and is a different quantity entirely: the charge for putting
        // fertilizer on, with no pounds of nutrient in it to multiply.
        if (!/^Cost per acre/.test(g.label)) continue
        for (const o of g.options) {
          const lb = Number(/^(\d+(?:\.\d+)?) lb/.exec(o.desc ?? '')?.[1])
          assert.ok(Number.isFinite(lb), `${key} ${o.label} states the rate it came from`)
          const expected = lb * PRICE_PER_LB[key]
          assert.ok(
            Math.abs(o.value - expected) <= 0.01,
            `${key} ${g.label} ${o.label}: ${o.value} should be ${lb} lb x price = ${expected.toFixed(4)}`
          )
        }
      }
    }
  })

  test('the three nutrients reconcile to the workbook’s own fertilizer line', () => {
    // THIS is the test that says the per-acre figures are legitimate rather
    // than merely arithmetic. The workbook does not publish a cost per nutrient
    // — it publishes ONE Fertilizer line per crop — so these are derived, and
    // TYPICAL-VALUES.md is explicit that a derived rate has to be checked
    // against a line whose right answer is already known.
    //
    // N + P2O5 + K2O, at the rates and prices above, reproduces that published
    // Fertilizer figure to the cent for every crop that takes no sulfur. Corn
    // is excluded because it does, and this app has no sulfur line.
    //
    // Published Fertilizer, from the three zone sheets: soybeans, spring wheat,
    // winter wheat.
    const PUBLISHED_FERTILIZER = [
      [62.0038, 136.2404, 159.3654],
      [42.5897, 102.7564, 115.2564],
      [23.1474, 58.3846, 91.8686],
    ]
    // The workbook's own rates, same three crops, same zone order.
    const RATES = {
      nitrogen: [[0, 125, 162], [0, 90, 110], [0, 50, 85]],
      phosphorus: [[47, 45, 45], [35, 35, 35], [25, 20, 30]],
      potassium: [[66, 60, 60], [40, 50, 50], [10, 30, 40]],
    }

    PUBLISHED_FERTILIZER.forEach((zone, z) => {
      zone.forEach((published, c) => {
        const derived = NUTRIENTS.reduce(
          (sum, key) => sum + RATES[key][z][c] * PRICE_PER_LB[key],
          0
        )
        assert.ok(
          Math.abs(derived - published) < 0.01,
          `zone ${z} crop ${c}: N+P+K came to ${derived.toFixed(4)}, workbook says ${published}`
        )
      })
    })
  })

  test('nitrogen alone carries an application group, and says it is separate', () => {
    // Application is a different quantity from material: the charge for putting
    // fertilizer on, with no fertilizer in it. Picking one and stopping books a
    // nitrogen line with no nitrogen in it.
    const application = TYPICAL_VALUES.nitrogen.groups.filter((g) =>
      /application only/i.test(g.label)
    )
    assert.equal(application.length, 1)
    assert.match(TYPICAL_VALUES.nitrogen.note, /material figure plus an application figure/i)

    // Spreading is quoted ONCE per pass. Offering it under all three nutrients
    // would have it entered three times.
    for (const key of ['phosphorus', 'potassium']) {
      assert.equal(
        TYPICAL_VALUES[key].groups.some((g) => /application/i.test(g.label)),
        false,
        `${key} does not repeat the spreading charge`
      )
      assert.match(TYPICAL_VALUES[key].note, /nitrogen line/i, `${key} says where it is`)
    }
  })
})

describe('insecticide, where the two states disagree', () => {
  test('both publications are named in the one source', () => {
    const spec = TYPICAL_VALUES.insecticide
    assert.match(spec.source, /North Dakota/i)
    assert.match(spec.source, /Iowa/i)
  })

  test('the state is on the option, never in the group heading', () => {
    // Which state a figure is from is the whole difference between $0 and $25,
    // so it has to be visible on the row being chosen. It goes on the OPTION
    // because a group label naming a publication is a citation, and citations
    // belong in the source footer.
    const spec = TYPICAL_VALUES.insecticide
    for (const g of spec.groups) {
      assert.doesNotMatch(g.label, /Iowa|North Dakota|NDSU|SDSU/i, `group "${g.label}"`)
      for (const o of g.options) {
        assert.match(o.label, /Iowa|North Dakota/, `option "${o.label}" names its state`)
      }
    }
  })

  test('no option fills the box with nothing', () => {
    // The crops whose budgets carry no insecticide used to be listed as a group
    // of $0 rows. Honest, and useless: a button that writes nothing is a tap to
    // achieve what leaving the line alone already does, and it padded the
    // picker with three rows nobody would ever choose. A crop absent from this
    // list is one budgeted without an insecticide.
    const all = TYPICAL_VALUES.insecticide.groups.flatMap((g) => g.options)
    for (const o of all) {
      assert.ok(o.value > 0, `"${o.label}" offers $${o.value}`)
    }
    assert.ok(
      all.some((o) => o.value === 25),
      'the Iowa corn figure is still there'
    )
  })
})

describe('seed, and the two crops sold by seed count', () => {
  test('only crops with a published seeding rate are offered', () => {
    // Wheat, oats and barley are priced BY WEIGHT, so a seeds-per-unit figure
    // is not a thing they have. Sunflower and sorghum are absent from every
    // source checked. Nothing here is guessed to fill the list out.
    assert.deepEqual(
      SEED_CROPS.map((c) => c.label),
      ['Corn', 'Soybeans']
    )
    for (const crop of SEED_CROPS) {
      assert.ok(Number.isFinite(crop.seedsPerUnit) && crop.seedsPerUnit > 0, crop.label)
      assert.ok(crop.terms.length, crop.label)
    }
  })

  test('one denomination per crop, and it is the bag it is bought in', () => {
    // Corn is PUBLISHED per thousand seeds and was offered that way alongside
    // the 80,000-seed bag. Two ways of quoting the same corn seed, sitting next
    // to each other on one list, is a choice a producer has to work out before
    // they can answer — and picking the wrong one is off by a factor of eighty
    // with no way to see it. The published price is converted instead.
    const values = TYPICAL_VALUES.seedsPerBag.groups.flatMap((g) => g.options.map((o) => o.value))
    assert.deepEqual(
      values.sort((a, b) => a - b),
      [80000, 140000]
    )
    assert.equal(values.length, SEED_CROPS.length, 'one per crop, no alternatives')
  })

  test('the seed price is quoted against the bag the picker offers', () => {
    // The two pickers fill the two halves of one multiplication, so their
    // denominations have to agree. SDSU publishes corn at $3.80 per thousand;
    // an 80,000-seed bag is that x80.
    const prices = TYPICAL_VALUES.seed.groups[0].options
    const corn = prices.find((o) => /^Corn/.test(o.label))
    assert.match(corn.label, /80,000/, 'the price names the bag it is for')
    assert.ok(Math.abs(corn.value - 3.8 * 80) < 0.01, `corn at ${corn.value} should be 3.80 x 80`)

    const soy = prices.find((o) => /^Soybeans/.test(o.label))
    assert.match(soy.label, /140,000/)
    assert.equal(soy.value, 51.0)
  })

  test('nothing anywhere still quotes seed per thousand', () => {
    // The per-thousand denomination was removed from both pickers, so a
    // leftover mention of it in a note or a caption would send a producer
    // looking for an option that is not there.
    const spec = TYPICAL_VALUES.seedsPerBag
    const text = [
      spec.note,
      ...spec.groups.map((g) => g.label),
      ...spec.groups.flatMap((g) => g.options.map((o) => `${o.label} ${o.desc ?? ''}`)),
      TYPICAL_VALUES.seed.note,
      ...TYPICAL_VALUES.seed.groups[0].options.map((o) => o.label),
    ].join(' ')
    assert.doesNotMatch(text, /per thousand|1,000 seed|per 1,000/i)
  })

  test('a crop match is strict enough not to fire on two letters', () => {
    // matchCategory() also matches when the CATALOG entry contains the query,
    // which is right for a type-ahead and wrong here: this one WRITES a number
    // into a box, so "co" must not resolve to corn and fill in 80,000.
    assert.equal(matchCrop('co'), null)
    assert.equal(matchCrop('cor'), null, 'a prefix is not a match')
    assert.equal(matchCrop(''), null)
    assert.equal(matchCrop(null), null)
    assert.equal(matchCrop('sorghum'), null, 'a crop with no published rate gets nothing')
  })

  test('a crop match reads the way producers write a crop', () => {
    assert.equal(matchCrop('Corn')?.seedsPerUnit, 80000)
    assert.equal(matchCrop('corn silage')?.seedsPerUnit, 80000, 'bought in the same bags')
    assert.equal(matchCrop('Seed corn, north quarter')?.seedsPerUnit, 80000)
    assert.equal(matchCrop('Soybeans')?.seedsPerUnit, 140000)
    assert.equal(matchCrop('soybean, no-till')?.seedsPerUnit, 140000)
  })
})
