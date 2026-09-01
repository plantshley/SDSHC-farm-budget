/**
 * Turning shared budgets into spreadsheet rows. Pure, and shared by both exits.
 *
 * The hidden panel in exporter.js and the script in tools/export-submissions.mjs
 * both call buildWorkbook() and both get the same seven sheets. That is the
 * whole reason this file exists separately from either of them: two exporters
 * that flattened the data independently would drift, and the first anybody
 * would know of it is two spreadsheets that disagree about a farm.
 *
 * IT IMPORTS calc.js AND RECOMPUTES EVERY FIGURE, rather than reading the
 * `results` block stored on each document. Same rule the screen, the CSV, and
 * the PNG follow. It is possible here at all because calc.js is pure — no DOM,
 * no imports, no I/O — so the identical arithmetic runs under Node in the export
 * script and in the browser in the panel.
 *
 * THE ONE CONTRACT EVERY SHEET OBEYS: the first two columns are `shareId` and
 * `Budget name`. That is what lets all seven be joined back together in a pivot
 * table or a VLOOKUP, and it is asserted in test/export-workbook.test.js.
 *
 * The sheets sit at three grains, and mixing them up is the way this workbook
 * gets misread:
 *
 *   one row per budget      All data · Budgets · Fixed costs
 *   one row per enterprise  Enterprises · Enterprises all data
 *   one row per line item   Variable lines · Equipment and buildings
 *
 * So a budget appears once on the first group and once per child on the others.
 * Counting budgets works only on the first group, and summing a repeated column
 * (a fixed cost down "Enterprises all data", say) counts it once per
 * enterprise. docs/DATA-EXPORT.md says both of these in the reader's language.
 */

import { calcScenario, VARIABLE_LINES } from './calc.js'

/** Sheet names, in the order they appear as tabs. */
export const SHEETS = [
  'All data',
  'Budgets',
  'Enterprises',
  'Enterprises all data',
  'Variable lines',
  'Fixed costs',
  'Equipment and buildings',
]

const ANNUAL_KEYS = ['utilities', 'farmInsurance', 'duesFees', 'misc']

const ANNUAL_LABELS = {
  utilities: 'Utilities',
  farmInsurance: 'Farm insurance',
  duesFees: 'Dues and fees',
  misc: 'Miscellaneous',
}

/**
 * Every input box a variable line can hold, across all four entry modes.
 *
 * Listed rather than derived from whatever a given document happens to carry,
 * so the column set is the same for every batch. A budget entered in $/acre and
 * one entered by seed population must line up in the same spreadsheet, and a
 * column that appears only when somebody used that mode is a column that moves.
 */
const LINE_FIELDS = [
  'mode',
  'costPerUnit',
  'unitsPerAcre',
  'perAcre',
  'costPerBag',
  'seedsPerBag',
  'population',
  'totalCost',
]

/* ────────────────────────────── small helpers ──────────────────────────── */

/**
 * A blank stays blank, and never becomes 0.
 *
 * This is the single most important formatting rule in the file. "The producer
 * left this box empty" and "the producer entered zero" are different facts
 * about a farm, and a spreadsheet that renders both as 0 has destroyed the
 * difference before anybody opens it. Averaging a column of those silently
 * counts every untouched row as a real zero.
 */
function raw(value) {
  if (value === '' || value === null || value === undefined) return ''
  const n = Number(value)
  return Number.isFinite(n) ? n : String(value)
}

/** A computed figure, rounded to cents. Always a number: calc.js never returns a blank. */
function money(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : ''
}

/** Millis or an ISO string to `YYYY-MM-DD HH:MM`, which Excel reads as a date. */
function stamp(value) {
  if (value === null || value === undefined || value === '') return ''
  const d = new Date(typeof value === 'number' ? value : String(value))
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * The identity columns every sheet starts with. See the contract above.
 *
 * `Budget name` is included on every grain, not just the budget-level sheets,
 * because a bare UUID is unreadable: somebody scanning the enterprise sheet
 * needs to see which farm a row belongs to without going and looking it up.
 */
function identity(doc) {
  return {
    shareId: doc?.shareId ?? '',
    'Budget name': doc?.name ?? '',
  }
}

/** Fixed-cost columns, repeated onto a child row so it carries its own context. */
function fixedColumns(f) {
  const out = {
    'Land rent $/acre': money(f.landRentPerAcre),
    'Land rent total $': money(f.landRentTotal),
    'Labor $/hour': money(f.ratePerHour),
    'Labor hours entered': raw(f.laborHours),
    'Labor hours basis': f.hoursBasis ?? '',
    'Labor hours/year': money(f.totalHoursPerYear),
    'Labor total $': money(f.laborTotal),
    'Equipment depreciation $': money(f.equipDepTotal),
    'Equipment interest $': money(f.equipIntTotal),
    'Building depreciation $': money(f.bldgDepTotal),
    'Building interest $': money(f.bldgIntTotal),
  }
  for (const key of ANNUAL_KEYS) out[`${ANNUAL_LABELS[key]} $/year`] = money(f.annual?.[key])
  out['Overheads total $'] = money(f.annualTotal)
  out['Total fixed costs $'] = money(f.totalFixedAnnual)
  out['Total fixed $/acre'] = money(f.totalFixedPerAcre)
  return out
}

/** Whole-farm results, the seven figures the app puts on the Results card. */
function resultColumns(r) {
  return {
    'Total acres': money(r.totalAcres),
    'Total revenue $': money(r.totals.totalRevenue),
    'Total variable costs $': money(r.totals.totalVariable),
    'Total gross margin $': money(r.totals.totalGrossMargin),
    'Total fixed costs $': money(r.totals.totalFixed),
    'Total profit $': money(r.totals.totalProfit),
    'Profit per acre $': money(r.totals.profitPerAcre),
  }
}

/** One enterprise's own inputs and its own computed figures. */
function enterpriseColumns(ent, calc) {
  return {
    'Enterprise name': ent?.name ?? '',
    Crop: ent?.crop ?? '',
    Acres: raw(ent?.acres),
    'Yield per acre': raw(ent?.yieldPerAcre),
    'Yield unit': ent?.yieldUnit ?? '',
    'Price per unit $': raw(ent?.pricePerUnit),
    'Misc income $/acre': raw(ent?.miscIncomePerAcre),
    'Crop revenue $/acre': money(calc.cropRevPerAcre),
    'Gross revenue $/acre': money(calc.grossRevPerAcre),
    'Total revenue $': money(calc.totalRevenue),
    'Preharvest interest auto': ent?.preharvest?.auto === false ? 'no' : 'yes',
    'Preharvest interest rate %': raw(ent?.preharvest?.rate),
    'Preharvest interest months': raw(ent?.preharvest?.months),
    'Preharvest interest $/acre': money(calc.preharvestInterestPerAcre),
    'Total variable $/acre': money(calc.totalVarPerAcre),
    'Total variable $': money(calc.totalVar),
    'Gross margin $/acre': money(calc.grossMarginPerAcre),
    'Enterprise gross margin $': money(calc.enterpriseGrossMargin),
  }
}

/** The resolved $/acre of each of the fourteen variable lines. */
function lineTotalColumns(calc) {
  const out = {}
  for (const def of VARIABLE_LINES) out[`${def.label} $/acre`] = money(calc.lines?.[def.key])
  return out
}

/* ──────────────────────────────── the sheets ───────────────────────────── */

/**
 * Read a batch of submission documents into rows, sheet by sheet.
 *
 * Takes an array of documents exactly as they come out of Firestore, so both
 * callers hand over the same thing and neither has to know the shape.
 *
 * A document that will not compute is SKIPPED, not fatal, and is reported in
 * `skipped`. One malformed record must not cost the export of the other
 * nineteen — the same rule listScenarios() follows for a corrupt local budget.
 */
export function buildWorkbook(docs) {
  const sheets = {}
  for (const name of SHEETS) sheets[name] = []
  const skipped = []

  // The widest budget in the batch decides how many numbered blocks "All data"
  // emits. Computed across the whole batch rather than per row so every row has
  // the same columns, and computed from the DATA rather than fixed at some
  // guessed maximum, so a batch of one-enterprise budgets is not ninety columns
  // of blanks.
  let maxEnterprises = 0
  let maxEquipment = 0
  let maxBuildings = 0

  const prepared = []
  for (const doc of asArray(docs)) {
    try {
      const scenario = doc?.scenario ?? {}
      const calc = calcScenario(scenario)
      const ents = asArray(scenario.enterprises)
      const equipment = asArray(scenario.fixed?.equipment)
      const buildings = asArray(scenario.fixed?.buildings)
      maxEnterprises = Math.max(maxEnterprises, ents.length)
      maxEquipment = Math.max(maxEquipment, equipment.length)
      maxBuildings = Math.max(maxBuildings, buildings.length)
      prepared.push({ doc, scenario, calc, ents, equipment, buildings })
    } catch (err) {
      skipped.push({ shareId: doc?.shareId ?? '(no id)', reason: String(err?.message || err) })
    }
  }

  for (const p of prepared) {
    addBudgetRow(sheets, p)
    addFixedRow(sheets, p)
    addEnterpriseRows(sheets, p)
    addVariableLineRows(sheets, p)
    addItemRows(sheets, p)
  }

  // Second pass, because the block count is only known once every document has
  // been read.
  for (const p of prepared) {
    sheets['All data'].push(allDataRow(p, { maxEnterprises, maxEquipment, maxBuildings }))
  }

  // Third pass: square every sheet off.
  //
  // Rows are built from what each budget actually holds, so they come out
  // ragged — a budget with one enterprise emits a shorter `ent2_` block than
  // one with two, and a line in $/acre mode carries no `population` key. A
  // ragged sheet is not a table: SheetJS takes its columns from the header it
  // is given and would leave a row's later values under the wrong headings,
  // and a CSV row would be short by however many keys that row happened to
  // lack. Filling the gaps with '' rather than 0 is the blank rule again.
  for (const name of SHEETS) sheets[name] = squareOff(sheets[name])

  return { sheets, skipped, count: prepared.length }
}

/** Give every row every column the sheet has, in one stable order. */
function squareOff(rows) {
  if (!rows.length) return rows
  const headers = headersFor(rows)
  return rows.map((row) => {
    const out = {}
    for (const key of headers) out[key] = key in row ? row[key] : ''
    return out
  })
}

/** Sheet 2. Summary only: what the Results card shows, one row per budget. */
function addBudgetRow(sheets, { doc, scenario, calc, ents }) {
  sheets.Budgets.push({
    ...identity(doc),
    'Scenario year': scenario.scenarioYear ?? '',
    'First sent': stamp(doc?.firstSentAt),
    'Last updated': stamp(doc?.updatedAt),
    'Budget created': stamp(scenario.createdAt),
    'Schema version': raw(doc?.schemaVersion),
    'App version': doc?.appVersion ?? '',
    Enterprises: ents.length,
    ...resultColumns(calc),
  })
}

/** Sheet 6. One row per budget: land rent, labor, and the overheads. */
function addFixedRow(sheets, { doc, calc }) {
  sheets['Fixed costs'].push({
    ...identity(doc),
    'Total acres': money(calc.totalAcres),
    ...fixedColumns(calc.fixed),
  })
}

/** Sheets 3 and 4. One row per enterprise, narrow and wide. */
function addEnterpriseRows(sheets, { doc, scenario, calc, ents }) {
  ents.forEach((ent, i) => {
    const ec = calc.enterprises[i] ?? {}
    const base = { ...identity(doc), ...enterpriseColumns(ent, ec) }

    // Narrow: what the enterprise is, and what each cost line came to. The
    // pivot-friendly one, and a superset of nothing.
    sheets.Enterprises.push({
      ...identity(doc),
      'Enterprise name': ent?.name ?? '',
      Crop: ent?.crop ?? '',
      Acres: raw(ent?.acres),
      'Yield per acre': raw(ent?.yieldPerAcre),
      'Yield unit': ent?.yieldUnit ?? '',
      'Price per unit $': raw(ent?.pricePerUnit),
      ...lineTotalColumns(ec),
      'Gross margin $/acre': money(ec.grossMarginPerAcre),
      'Enterprise gross margin $': money(ec.enterpriseGrossMargin),
    })

    // Wide: the same enterprise with the whole budget's context repeated on
    // every row. That repetition is what lets somebody filter to `Crop = Corn`
    // across every budget in the batch and still see the farm behind each one,
    // without a lookup. It is also why a fixed cost must not be SUMMED down
    // this sheet: three enterprises means three copies of one land rent.
    sheets['Enterprises all data'].push({
      ...base,
      'Scenario year': scenario.scenarioYear ?? '',
      'First sent': stamp(doc?.firstSentAt),
      'Last updated': stamp(doc?.updatedAt),
      ...lineTotalColumns(ec),
      ...variableInputColumns(ent),
      ...fixedColumns(calc.fixed),
      ...resultColumns(calc),
    })
  })
}

/** Sheet 5. One row per cost line: the long form, for per-line comparison. */
function addVariableLineRows(sheets, { doc, calc, ents }) {
  ents.forEach((ent, i) => {
    const ec = calc.enterprises[i] ?? {}
    for (const def of VARIABLE_LINES) {
      const line = ent?.variable?.[def.key] ?? {}
      sheets['Variable lines'].push({
        ...identity(doc),
        'Enterprise name': ent?.name ?? '',
        Crop: ent?.crop ?? '',
        Acres: raw(ent?.acres),
        Line: def.label,
        'Line key': def.key,
        Mode: line.mode ?? '',
        'Cost per unit $': raw(line.costPerUnit),
        'Units per acre': raw(line.unitsPerAcre),
        'Entered $/acre': raw(line.perAcre),
        'Cost per bag $': raw(line.costPerBag),
        'Seeds per unit': raw(line.seedsPerBag),
        Population: raw(line.population),
        'Total premium $': raw(line.totalCost),
        'Resolved $/acre': money(ec.lines?.[def.key]),
      })
    }
  })
}

/**
 * Sheet 7. One row per machine or building, typed by `kind`.
 *
 * Both on one tab because they are one section on the calculator and carry the
 * same columns. `Salvage value $` stays blank for a building rather than
 * reading 0, because a building has no salvage in this model at all — that is
 * an absent concept, not a zero amount, and it is the raw()/blank rule again.
 *
 * A budget with neither contributes no rows here, which is correct at this
 * grain: its land rent and labor are on `Fixed costs`, which is one row per
 * budget and cannot lose it.
 */
function addItemRows(sheets, { doc, calc, equipment, buildings }) {
  const rows = sheets['Equipment and buildings']
  equipment.forEach((item, i) => {
    const c = calc.fixed.equipment?.[i] ?? {}
    rows.push({
      ...identity(doc),
      Kind: 'equipment',
      'Item name': item?.name ?? '',
      Category: item?.category ?? '',
      'Initial cost $': raw(item?.initialCost),
      'Salvage value $': raw(item?.salvageValue),
      'Useful life (years)': raw(item?.usefulLife),
      'Interest rate %': raw(item?.interestRate),
      'Annual depreciation $': money(c.annualDep),
      'Annual interest $': money(c.annualInt),
      'Depreciation $/acre': money(c.depPerAcre),
      'Interest $/acre': money(c.intPerAcre),
    })
  })
  buildings.forEach((item, i) => {
    const c = calc.fixed.buildings?.[i] ?? {}
    rows.push({
      ...identity(doc),
      Kind: 'building',
      'Item name': item?.name ?? '',
      Category: item?.category ?? '',
      'Initial cost $': raw(item?.initialCost),
      'Salvage value $': '',
      'Useful life (years)': raw(item?.usefulLife),
      'Interest rate %': raw(item?.interestRate),
      'Annual depreciation $': money(c.annualDep),
      'Annual interest $': money(c.annualInt),
      'Depreciation $/acre': money(c.depPerAcre),
      'Interest $/acre': money(c.intPerAcre),
    })
  })
}

/** Every raw input box on one enterprise's fourteen lines, prefixed by line key. */
function variableInputColumns(ent) {
  const out = {}
  for (const def of VARIABLE_LINES) {
    const line = ent?.variable?.[def.key] ?? {}
    for (const field of LINE_FIELDS) {
      // The population and total keys exist on two lines only. Emitting them
      // for all fourteen would put `Hauling totalCost` in the sheet, a column
      // nothing can ever fill and which reads as data that went missing.
      if (!(field in line) && field !== 'mode') continue
      out[`${def.key}_${field}`] = field === 'mode' ? (line.mode ?? '') : raw(line[field])
    }
  }
  return out
}

/**
 * Sheet 1. One row per budget, carrying everything.
 *
 * Enterprises, equipment, and buildings are numbered into columns — `ent1_crop`,
 * `ent2_crop` — up to the widest budget in the batch, so every row has the same
 * header and the sheet is a rectangle. This is the wide one: roughly 70 columns
 * per enterprise, so a four-enterprise budget is around 300. That is inherent to
 * everything-in-one-row, and Excel's ceiling is 16,384.
 */
function allDataRow({ doc, scenario, calc, ents, equipment, buildings }, max) {
  const row = {
    ...identity(doc),
    'Scenario year': scenario.scenarioYear ?? '',
    'First sent': stamp(doc?.firstSentAt),
    'Last updated': stamp(doc?.updatedAt),
    'Budget created': stamp(scenario.createdAt),
    'Schema version': raw(doc?.schemaVersion),
    'App version': doc?.appVersion ?? '',
    Enterprises: ents.length,
    ...resultColumns(calc),
    ...fixedColumns(calc.fixed),
  }

  for (let i = 0; i < max.maxEnterprises; i += 1) {
    const ent = ents[i]
    const ec = calc.enterprises[i] ?? {}
    const p = `ent${i + 1}_`
    const cols = ent
      ? { ...enterpriseColumns(ent, ec), ...lineTotalColumns(ec), ...variableInputColumns(ent) }
      : blanksLike(enterpriseColumns({}, {}))
    for (const [k, v] of Object.entries(cols)) row[p + k] = v
  }

  for (let i = 0; i < max.maxEquipment; i += 1) {
    const item = equipment[i]
    const c = calc.fixed.equipment?.[i] ?? {}
    const p = `equip${i + 1}_`
    row[`${p}name`] = item?.name ?? ''
    row[`${p}category`] = item?.category ?? ''
    row[`${p}initialCost`] = raw(item?.initialCost)
    row[`${p}salvageValue`] = raw(item?.salvageValue)
    row[`${p}usefulLife`] = raw(item?.usefulLife)
    row[`${p}interestRate`] = raw(item?.interestRate)
    row[`${p}annualDep`] = item ? money(c.annualDep) : ''
    row[`${p}annualInt`] = item ? money(c.annualInt) : ''
  }

  for (let i = 0; i < max.maxBuildings; i += 1) {
    const item = buildings[i]
    const c = calc.fixed.buildings?.[i] ?? {}
    const p = `bldg${i + 1}_`
    row[`${p}name`] = item?.name ?? ''
    row[`${p}category`] = item?.category ?? ''
    row[`${p}initialCost`] = raw(item?.initialCost)
    row[`${p}usefulLife`] = raw(item?.usefulLife)
    row[`${p}interestRate`] = raw(item?.interestRate)
    row[`${p}annualDep`] = item ? money(c.annualDep) : ''
    row[`${p}annualInt`] = item ? money(c.annualInt) : ''
  }

  return row
}

function blanksLike(shape) {
  const out = {}
  for (const k of Object.keys(shape)) out[k] = ''
  return out
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

/* ──────────────────────────── shaping for output ───────────────────────── */

/**
 * The union of every key across a sheet's rows, in first-seen order.
 *
 * Needed because a row built from a budget with no equipment carries fewer keys
 * than one that has some, and a writer that took the FIRST row's keys as the
 * header would silently truncate every column the first row happened not to
 * reach. Both the CSV path and the SheetJS path go through this.
 */
export function headersFor(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

/**
 * One sheet as RFC 4180 CSV.
 *
 * The formula guard is lifted from csvCell() in export.js and is here for the
 * same reason: budget names, enterprise names, and crop names are free text,
 * and all three major spreadsheets execute a cell of text beginning `=`, `+`,
 * `-`, `@`, tab, or CR when the file is opened. This export is handed to other
 * people by definition.
 *
 * NUMBERS ARE DELIBERATELY EXEMPT, tested on the type rather than the leading
 * character, because a negative profit has to stay a summable number for the
 * formulas whoever receives this will write over it.
 */
export function toCSV(rows) {
  const headers = headersFor(rows)
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h] ?? '')).join(','))
  return lines.join('\r\n')
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** `submissions-2026-08-31`, the stem both exits name their file with. */
export function exportStem(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `submissions-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}
