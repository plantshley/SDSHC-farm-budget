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

import { TYPICAL_VALUES, EQUIPMENT_CATALOG, BUILDING_CATALOG, matchCategory } from '../src/data/typical-values.js'
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
    for (const [key, spec] of specs) {
      if (!spec.appliesTo) continue
      assert.ok(
        spec.appliesTo === 'perAcre' || spec.appliesTo === 'unit',
        `${key} appliesTo must name an entry mode`
      )
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
      assert.match(TYPICAL_VALUES[key].note, /eight farms/i)
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
      'Planter, drill or sprayer',
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
      'Planter, drill or sprayer': [0.29, 0.65],
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
