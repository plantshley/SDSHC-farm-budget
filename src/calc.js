/**
 * The economic model — a direct translation of SimpleFarmPlanBudget (002).xlsx.
 *
 * CONTRACT: this module is pure. No DOM, no imports, no side effects, no I/O.
 * It is the only place economics live, and its purity is the only reason the
 * model can be tested against the spreadsheet independently of the UI.
 * Do not add a DOM reference here, however convenient.
 *
 * Spreadsheet cell references appear in comments throughout. Where this file
 * deliberately DIFFERS from the sheet, the comment says so and says why — see
 * CLAUDE.md. Those differences are corrections, not drift; do not "fix" them
 * back to match the .xlsx.
 *
 * UNITS: all interest rates are entered and stored as PERCENTAGES (7 = 7%) and
 * divided by 100 here. Money is dollars. Acres are acres.
 */

/* ────────────────────────────── schema ─────────────────────────────────── */

/**
 * The fifteen variable expense lines, in spreadsheet row order (rows 12–26).
 *
 * `preharvest` marks the costs that are incurred BEFORE harvest and therefore
 * form the basis of the preharvest interest charge. This is why the sheet puts
 * that charge at row 23: rows 12–22 precede it (seed through miscellaneous),
 * and hauling/drying/marketing (24–26) follow it because they happen at or
 * after harvest and aren't financed through the season.
 */
export const VARIABLE_LINES = [
  { key: 'seed', label: 'Seed', unitHint: 'bag, unit', preharvest: true },
  { key: 'nitrogen', label: 'Nitrogen', unitHint: 'lb', preharvest: true },
  { key: 'phosphorus', label: 'Phosphorus', unitHint: 'lb', preharvest: true },
  { key: 'potassium', label: 'Potassium', unitHint: 'lb', preharvest: true },
  { key: 'herbicide', label: 'Herbicide', unitHint: 'application', preharvest: true },
  { key: 'insecticide', label: 'Insecticide', unitHint: 'application', preharvest: true },
  { key: 'cropInsurance', label: 'Crop Insurance', unitHint: 'acre', preharvest: true, prefersPerAcre: true },
  { key: 'fuelOil', label: 'Fuel/Oil', unitHint: 'gal', preharvest: true },
  { key: 'repairs', label: 'Repairs', unitHint: 'acre', preharvest: true, prefersPerAcre: true },
  { key: 'customHire', label: 'Custom Hire', unitHint: 'acre', preharvest: true, prefersPerAcre: true },
  { key: 'miscellaneous', label: 'Miscellaneous', unitHint: 'acre', preharvest: true, prefersPerAcre: true },
  // row 23 — preharvest interest is computed, not a line item. See below.
  { key: 'hauling', label: 'Hauling', unitHint: 'bu', preharvest: false },
  { key: 'drying', label: 'Drying', unitHint: 'bu', preharvest: false },
  { key: 'marketing', label: 'Marketing', unitHint: 'acre', preharvest: false, prefersPerAcre: true },
]

/** The sheet's stated assumption: "8 months at 10%" (row 23 label). */
export const PREHARVEST_DEFAULTS = { rate: 10, months: 8 }

/**
 * How a labour figure is entered, and what it multiplies by to reach a year.
 *
 * The sheet has one cell, M35, labelled "total hours" — annual. Producers do not
 * think in annual hours; they think "about ten hours a week through the season"
 * or "two days a month". Entering that as an annual figure means doing the
 * arithmetic in your head before you get to the box, which is exactly the kind
 * of silent error a budget tool should absorb. The stored number is whatever was
 * typed; the basis says what it means.
 */
export const HOURS_BASIS = [
  { key: 'year', label: 'hours / year', short: 'hrs/yr', perYear: 1 },
  { key: 'month', label: 'hours / month', short: 'hrs/mo', perYear: 12 },
  { key: 'week', label: 'hours / week', short: 'hrs/wk', perYear: 52 },
]

/** The same idea for overhead bills, which arrive monthly far more often than annually. */
export const COST_BASIS = [
  { key: 'year', label: '$ / year', short: '/yr', perYear: 1 },
  { key: 'quarter', label: '$ / quarter', short: '/qtr', perYear: 4 },
  { key: 'month', label: '$ / month', short: '/mo', perYear: 12 },
  { key: 'week', label: '$ / week', short: '/wk', perYear: 52 },
]

/**
 * v2 added: enterprise.name (previously the crop doubled as the label),
 * fixed.labor.hoursBasis, and fixed.annualBasis. See migrate() in storage.js.
 */
export const SCHEMA_VERSION = 2

/* ────────────────────────────── helpers ────────────────────────────────── */

/**
 * Coerce anything to a finite number, defaulting to 0.
 *
 * Mirrors the ROI tool's `Number(x) || 0` but also rejects Infinity, which
 * `|| 0` lets through and which would silently poison every downstream total.
 *
 * Currency symbols, spaces and thousands separators are stripped first. The
 * money fields are `type="number"`, so a browser will not produce "1,000" —
 * but an imported budget file or a paste can, and `Number("1,000")` is NaN,
 * which would turn a $1,000 cost into $0 with nothing to show for it.
 */
export function num(v) {
  const n = Number(typeof v === 'string' ? v.replace(/[$\s,]/g, '') : v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Every figure that reaches the screen goes through here.
 *
 * Two finite inputs can still multiply past Number.MAX_VALUE, and the resulting
 * Infinity spreads — worse, `Infinity * 0` and `Infinity - Infinity` become
 * NaN, so a dollar amount renders as "NaN" or "∞". Collapsing an overflow to 0
 * matches how every other unusable input is treated here, and keeps the
 * module's promise that no total is ever non-finite.
 */
function finite(n) {
  return Number.isFinite(n) ? n : 0
}

/**
 * Divide, returning 0 rather than Infinity/NaN for a zero or unusable divisor.
 *
 * Every fixed cost in the sheet divides by SUM(D3,H3,L3,P3) — total acres — so
 * a blank acreage cascades #DIV/0! through the entire fixed-cost block. The app
 * shows 0 and raises a warning instead.
 */
function safeDiv(numerator, divisor) {
  const d = num(divisor)
  return d === 0 ? 0 : finite(num(numerator) / d)
}

/** Arrays arrive from stored JSON, which may be anything. */
function asArray(v) {
  return Array.isArray(v) ? v : []
}

/**
 * A cost or rate that a minus sign would turn upside down.
 *
 * This is the same bug the useful-life clamp exists for, and it is open on every
 * other rate in the model until it is closed here. A "-7" typed for a 7% equipment
 * interest rate produces a NEGATIVE cost, which is subtracted from total fixed
 * costs and therefore *inflates* profit — on a farm with $500,000 of machinery
 * that is a swing of tens of thousands of dollars, in the flattering direction,
 * with a perfectly finite number on screen and nothing to suggest anything is
 * wrong. Every adversarial finiteness check in the suite passes straight over it.
 *
 * Negative acres are treated differently on purpose: those are warned about but
 * left alone, because the per-acre arithmetic still has to be shown to explain
 * what went wrong. A negative *rate* has no such reading — it is only ever a typo.
 */
function nonNegative(value, label, warnings) {
  const n = num(value)
  if (n >= 0) return n
  warnings?.push(
    `${label} is negative. A cost cannot be below zero — it is counted as $0 here. Check for a stray minus sign.`
  )
  return 0
}

/**
 * Blank means "use the documented default"; an explicit 0 means zero.
 * Without this, clearing the preharvest rate mid-edit silently drops the
 * spreadsheet's stated 8-months-at-10% assumption to nothing.
 */
function orDefault(value, fallback) {
  return value === '' || value == null ? num(fallback) : num(value)
}

/**
 * Annualising multiplier for a basis key, defaulting to 'year' (multiplier 1).
 *
 * An unrecognised key — an old budget, a hand-edited file — must fall back to
 * the identity, never to 0. Falling back to 0 would erase a real cost silently.
 */
function perYearFactor(table, key) {
  const row = table.find((b) => b.key === key)
  return row ? row.perYear : 1
}

/**
 * The display label for whatever entry name an enterprise ends up with.
 *
 * DIFFERS FROM SHEET: the sheet's column heading IS the crop (D2). Here the two
 * are separate, because "No-till, east half" and "Corn" are different facts and
 * a producer comparing two tillage systems needs to tell the columns apart while
 * both are still growing corn. The crop is the fallback so nothing is lost.
 */
export function enterpriseLabel(ent, index) {
  const name = String(ent?.name ?? '').trim()
  if (name) return name
  const crop = String(ent?.crop ?? '').trim()
  if (crop) return crop
  return `Enterprise ${Number(index) >= 0 ? Number(index) + 1 : ''}`.trim()
}

/**
 * Resolve one variable expense line to $/acre.
 *
 * The sheet only offers $/unit × units/acre (D12 = B12*C12), which forces
 * naturally-per-acre costs like crop insurance to be entered as "cost × 1".
 * The app accepts either, and stores both so switching modes round-trips.
 */
export function linePerAcre(line) {
  if (!line) return 0
  if (line.mode === 'perAcre') return num(line.perAcre)
  return finite(num(line.costPerUnit) * num(line.unitsPerAcre))
}

/* ──────────────────────────── enterprise ───────────────────────────────── */

/**
 * One enterprise budget — the sheet's columns A–D (and its E–H, I–L, M–P
 * copies). Unlike the sheet, which hard-codes exactly four, any number of
 * these may exist.
 */
export function calcEnterprise(ent, index, warnings) {
  const acres = num(ent?.acres)
  const named = enterpriseLabel(ent, index)

  // Income. A negative yield or price is a typo with the same shape as a
  // negative interest rate — see nonNegative(). Misc income is left alone: a
  // producer may legitimately be recording a net figure there.
  const yieldPerAcre = nonNegative(ent?.yieldPerAcre, `"${named}" yield per acre`, warnings)
  const pricePerUnit = nonNegative(ent?.pricePerUnit, `"${named}" price per unit`, warnings)
  const cropRevPerAcre = finite(yieldPerAcre * pricePerUnit) // D7
  const miscIncomePerAcre = num(ent?.miscIncomePerAcre) // D8
  const grossRevPerAcre = finite(cropRevPerAcre + miscIncomePerAcre) // D9
  const totalRevenue = finite(grossRevPerAcre * acres) // D10

  // Variable expenses, $/acre each                                    // D12–D26
  const lines = {}
  let preharvestBasis = 0
  for (const def of VARIABLE_LINES) {
    // A negative expense would ADD to gross margin. Same class of typo, same
    // treatment: counted as $0, and said out loud.
    const value = nonNegative(
      linePerAcre(ent?.variable?.[def.key]),
      `"${named}" ${def.label.toLowerCase()}`,
      warnings
    )
    lines[def.key] = value
    if (def.preharvest) preharvestBasis = finite(preharvestBasis + value)
  }

  // DIFFERS FROM SHEET (row 23): the sheet makes this a hand-entered line
  // (D23 = B23*C23) even though its own label reads "8 months at 10%", so it
  // is routinely left blank or guessed. Here it is computed from the
  // preharvest costs above it. `auto: false` restores manual entry.
  const preharvest = ent?.preharvest ?? {}
  const auto = preharvest.auto !== false
  const preharvestInterestPerAcre = auto
    ? finite(
        preharvestBasis *
          (orDefault(preharvest.rate, PREHARVEST_DEFAULTS.rate) / 100) *
          (orDefault(preharvest.months, PREHARVEST_DEFAULTS.months) / 12)
      )
    : num(preharvest.manualPerAcre)

  const totalVarPerAcre = finite(
    Object.values(lines).reduce((a, b) => finite(a + b), 0) + preharvestInterestPerAcre
  ) // D27
  const totalVar = finite(totalVarPerAcre * acres) // D28

  const grossMarginPerAcre = finite(grossRevPerAcre - totalVarPerAcre) // D29
  const enterpriseGrossMargin = finite(totalRevenue - totalVar) // D30

  return {
    id: ent?.id,
    name: ent?.name || '',
    crop: ent?.crop || '',
    label: enterpriseLabel(ent, index),
    acres,
    cropRevPerAcre,
    miscIncomePerAcre,
    grossRevPerAcre,
    totalRevenue,
    lines,
    preharvestBasis,
    preharvestInterestPerAcre,
    preharvestAuto: auto,
    totalVarPerAcre,
    totalVar,
    grossMarginPerAcre,
    enterpriseGrossMargin,
  }
}

/* ────────────────────────── fixed costs ────────────────────────────────── */

/**
 * One piece of equipment carries BOTH its depreciation and its interest.
 *
 * DIFFERS FROM SHEET (structure, not math): rows 38–43 and 46–51 are separate
 * tables, so initial cost and salvage value must be typed twice per machine.
 * The formulas are unchanged — only the data entry is unified.
 */
function calcEquipment(item, totalAcres, warnings) {
  const named = item?.name || 'Equipment'
  const initialCost = nonNegative(item?.initialCost, `"${named}" initial cost`, warnings)
  const salvageValue = nonNegative(item?.salvageValue, `"${named}" salvage value`, warnings)
  const usefulLife = num(item?.usefulLife)
  const rate = nonNegative(item?.interestRate, `"${named}" interest rate`, warnings) / 100

  if (initialCost > 0 && usefulLife <= 0) {
    warnings.push(
      `"${item?.name || 'Equipment'}" has no useful life, so its depreciation is counted as $0.`
    )
  }
  if (salvageValue > initialCost && initialCost > 0) {
    warnings.push(
      `"${item?.name || 'Equipment'}" has a salvage value above its initial cost, which makes its depreciation negative.`
    )
  }

  // A negative useful life is a typo ("-5" for 5). safeDiv only guards an exact
  // zero, so without this the depreciation comes out NEGATIVE and quietly
  // REDUCES total costs — inflating profit, and doing the opposite of what the
  // warning above tells the producer.
  const life = usefulLife > 0 ? usefulLife : 0

  const annualDep = safeDiv(initialCost - salvageValue, life) // P38
  const annualInt = finite(((initialCost + salvageValue) / 2) * rate) // P46

  return {
    id: item?.id,
    name: item?.name || '',
    initialCost,
    salvageValue,
    usefulLife,
    annualDep,
    annualInt,
    depPerAcre: safeDiv(annualDep, totalAcres), // O38
    intPerAcre: safeDiv(annualInt, totalAcres), // O46
  }
}

/**
 * Buildings: no salvage value, and interest is charged on half the initial cost.
 *
 * KEPT FAITHFUL: equipment averages (initial + salvage)/2 while buildings use
 * initial/2 — i.e. the sheet assumes buildings depreciate to zero. The two
 * differ, but both are defensible, and changing it would move producers'
 * numbers for no clear gain.
 */
function calcBuilding(item, totalAcres, warnings) {
  const named = item?.name || 'Building'
  const initialCost = nonNegative(item?.initialCost, `"${named}" initial cost`, warnings)
  const usefulLife = num(item?.usefulLife)
  const rate = nonNegative(item?.interestRate, `"${named}" interest rate`, warnings) / 100

  if (initialCost > 0 && usefulLife <= 0) {
    warnings.push(
      `"${item?.name || 'Building'}" has no useful life, so its depreciation is counted as $0.`
    )
  }

  // See calcEquipment: a negative useful life would otherwise produce negative
  // depreciation and reduce the farm's costs.
  const life = usefulLife > 0 ? usefulLife : 0

  const annualDep = safeDiv(initialCost, life) // P55
  const annualInt = finite((initialCost / 2) * rate) // P63

  return {
    id: item?.id,
    name: item?.name || '',
    initialCost,
    usefulLife,
    annualDep,
    annualInt,
    depPerAcre: safeDiv(annualDep, totalAcres), // O55
    intPerAcre: safeDiv(annualInt, totalAcres), // O63
  }
}

const ANNUAL_KEYS = ['utilities', 'farmInsurance', 'duesFees', 'misc'] // rows 71–74

/** Only for warning text, so a producer is told which box to look at. */
const ANNUAL_LABELS = {
  utilities: 'utilities',
  farmInsurance: 'farm insurance',
  duesFees: 'dues and fees',
  misc: 'miscellaneous',
}

/**
 * Fixed costs belong to the whole farm, not to any one enterprise, and are
 * spread across the TOTAL acreage of every enterprise.
 */
export function calcFixed(fixed, totalAcres, warnings) {
  const landRentPerAcre = nonNegative(fixed?.landRentPerAcre, 'Land rent per acre', warnings) // M33
  const landRentTotal = finite(landRentPerAcre * totalAcres) // O33

  const ratePerHour = nonNegative(fixed?.labor?.ratePerHour, 'Labor rate', warnings) // L35
  // `hours` is whatever the producer typed; `hoursBasis` says what it means.
  // Pre-v2 budgets stored an annual figure under totalHoursPerYear and had no
  // basis, so reading both keys keeps them working untouched.
  const laborHours = nonNegative(
    fixed?.labor?.hours ?? fixed?.labor?.totalHoursPerYear,
    'Labor hours',
    warnings
  )
  const hoursBasis = fixed?.labor?.hoursBasis || 'year'
  const totalHoursPerYear = finite(laborHours * perYearFactor(HOURS_BASIS, hoursBasis)) // M35
  const laborHrsPerAcre = safeDiv(totalHoursPerYear, totalAcres) // N35
  const laborPerAcre = finite(ratePerHour * laborHrsPerAcre) // O35
  const laborTotal = finite(ratePerHour * totalHoursPerYear) // P35

  const equipment = asArray(fixed?.equipment).map((e) =>
    calcEquipment(e, totalAcres, warnings)
  )
  const buildings = asArray(fixed?.buildings).map((b) =>
    calcBuilding(b, totalAcres, warnings)
  )

  const sum = (arr, key) => arr.reduce((a, x) => finite(a + x[key]), 0)

  const equipDepTotal = sum(equipment, 'annualDep') // P44
  const equipIntTotal = sum(equipment, 'annualInt') // P52
  const bldgDepTotal = sum(buildings, 'annualDep') // P61
  const bldgIntTotal = sum(buildings, 'annualInt') // P69

  const annual = {}
  let annualTotal = 0
  for (const key of ANNUAL_KEYS) {
    const entered = nonNegative(fixed?.annual?.[key], `Overhead — ${ANNUAL_LABELS[key]}`, warnings)
    const basis = fixed?.annualBasis?.[key] || 'year'
    const total = finite(entered * perYearFactor(COST_BASIS, basis)) // O71–O74
    annual[key] = { entered, basis, total, perAcre: safeDiv(total, totalAcres) }
    annualTotal = finite(annualTotal + total)
  }

  const totalFixedAnnual = finite(
    landRentTotal +
      laborTotal +
      equipDepTotal +
      equipIntTotal +
      bldgDepTotal +
      bldgIntTotal +
      annualTotal
  )

  return {
    landRentPerAcre,
    landRentTotal,
    ratePerHour,
    laborHours,
    hoursBasis,
    totalHoursPerYear,
    laborHrsPerAcre,
    laborPerAcre,
    laborTotal,
    equipment,
    equipDepTotal,
    equipDepPerAcre: safeDiv(equipDepTotal, totalAcres), // O44
    equipIntTotal,
    equipIntPerAcre: safeDiv(equipIntTotal, totalAcres), // O52
    buildings,
    bldgDepTotal,
    bldgDepPerAcre: safeDiv(bldgDepTotal, totalAcres), // O61
    bldgIntTotal,
    bldgIntPerAcre: safeDiv(bldgIntTotal, totalAcres), // O69
    annual,
    annualTotal,
    annualPerAcre: safeDiv(annualTotal, totalAcres),
    totalFixedAnnual,
    totalFixedPerAcre: safeDiv(totalFixedAnnual, totalAcres), // P75
  }
}

/* ────────────────────────────── scenario ───────────────────────────────── */

/**
 * The whole farm: every enterprise plus the shared fixed costs.
 */
export function calcScenario(scenario) {
  const warnings = []
  // Explicit arrow, not a bare reference: map's third argument would otherwise
  // land in the warnings parameter.
  const enterprises = asArray(scenario?.enterprises).map((e, i) =>
    calcEnterprise(e, i, warnings)
  )
  const totalAcres = enterprises.reduce((a, e) => finite(a + e.acres), 0) // SUM(D3,H3,L3,P3)

  const negative = enterprises.filter((e) => e.acres < 0)
  if (negative.length) {
    warnings.push(
      `${negative
        .map((e) => `"${e.label}"`)
        .join(', ')} has negative acres. Check for a stray minus sign — it turns every per-acre figure upside down.`
    )
  }

  if (totalAcres <= 0) {
    warnings.push(
      'Enter acres for at least one enterprise — fixed costs are spread across total acres, so without them per-acre figures cannot be calculated.'
    )
  }

  const fixed = calcFixed(scenario?.fixed, totalAcres, warnings)

  const totalRevenue = enterprises.reduce((a, e) => finite(a + e.totalRevenue), 0)
  const totalVariable = enterprises.reduce((a, e) => finite(a + e.totalVar), 0)

  // DIFFERS FROM SHEET: the sheet has no whole-farm gross margin. It carries
  // the LABEL "Total Gross Margin" at I30/M30, but those cells only hold a
  // single enterprise's figure. This is the real roll-up.
  const totalGrossMargin = finite(totalRevenue - totalVariable)

  // DIFFERS FROM SHEET (P78): the sheet's Total Profit subtracts
  // SUM(P44,P35,O33,P61,P69,P71:P74) — omitting P52, Total Equipment Interest.
  // Its own Total Fixed Costs/Acre (P75) DOES include equipment interest, so
  // the sheet's two totals contradict each other. Equipment interest is a real
  // cost; it is included here, in both.
  const totalProfit = finite(totalGrossMargin - fixed.totalFixedAnnual)

  // DIFFERS FROM SHEET (P76/P77): the sheet adds the per-acre figures of all
  // four enterprises together, which is only meaningful when every enterprise
  // has identical acreage — otherwise it is summing incompatible rates. These
  // are acreage-weighted instead: whole-farm dollars ÷ whole-farm acres.
  return {
    schemaVersion: SCHEMA_VERSION,
    totalAcres,
    enterprises,
    fixed,
    totals: {
      totalRevenue,
      totalVariable,
      totalGrossMargin,
      totalFixed: fixed.totalFixedAnnual,
      totalProfit,
      revenuePerAcre: safeDiv(totalRevenue, totalAcres),
      variablePerAcre: safeDiv(totalVariable, totalAcres),
      grossMarginPerAcre: safeDiv(totalGrossMargin, totalAcres),
      expensesPerAcre: safeDiv(finite(totalVariable + fixed.totalFixedAnnual), totalAcres),
      profitPerAcre: safeDiv(totalProfit, totalAcres),
    },
    warnings,
  }
}
