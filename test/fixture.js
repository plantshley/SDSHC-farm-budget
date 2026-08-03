/**
 * The golden fixture: one realistic two-enterprise farm.
 *
 * `SHEET` values were produced by filling a copy of SimpleFarmPlanBudget
 * (002).xlsx with the scenario below, letting real Excel calculate, and reading
 * the cells back. They are ground truth, not hand arithmetic. To regenerate,
 * see the "Golden fixture" section of CLAUDE.md.
 *
 * Two things about the fixture worth knowing:
 *
 * 1. `preharvest.auto` is false and mirrors the hand-entered row 23 values,
 *    because in the sheet that row IS hand-entered. The app's *computed*
 *    preharvest interest is covered separately in calc.test.js, so this fixture
 *    isolates one divergence at a time.
 *
 * 2. To get numbers out of Excel at all, the unused depreciation rows had to be
 *    given a useful life of 1. Left blank they evaluate to #DIV/0! and poison
 *    P44, P61, P75, P76, P77 and P78 — see CLAUDE.md.
 */

export const scenario = {
  schemaVersion: 1,
  id: 'fixture',
  name: 'Corn + Soybeans (golden fixture)',
  enterprises: [
    {
      id: 'corn',
      crop: 'Corn',
      acres: 500,
      yieldPerAcre: 180,
      yieldUnit: 'bu',
      pricePerUnit: 4.25,
      miscIncomePerAcre: 0,
      variable: {
        seed: { mode: 'unit', costPerUnit: 320, unitsPerAcre: 0.35 },
        nitrogen: { mode: 'unit', costPerUnit: 0.55, unitsPerAcre: 180 },
        phosphorus: { mode: 'unit', costPerUnit: 0.65, unitsPerAcre: 50 },
        potassium: { mode: 'unit', costPerUnit: 0.45, unitsPerAcre: 40 },
        herbicide: { mode: 'unit', costPerUnit: 28, unitsPerAcre: 2 },
        insecticide: { mode: 'unit', costPerUnit: 12, unitsPerAcre: 1 },
        cropInsurance: { mode: 'perAcre', perAcre: 22 },
        fuelOil: { mode: 'unit', costPerUnit: 3.1, unitsPerAcre: 7 },
        repairs: { mode: 'perAcre', perAcre: 18 },
        customHire: { mode: 'perAcre', perAcre: 30 },
        miscellaneous: { mode: 'perAcre', perAcre: 10 },
        hauling: { mode: 'unit', costPerUnit: 0.22, unitsPerAcre: 180 },
        drying: { mode: 'unit', costPerUnit: 0.18, unitsPerAcre: 180 },
        marketing: { mode: 'perAcre', perAcre: 5 },
      },
      preharvest: { auto: false, manualPerAcre: 25.5 },
    },
    {
      id: 'soybeans',
      crop: 'Soybeans',
      acres: 300,
      yieldPerAcre: 55,
      yieldUnit: 'bu',
      pricePerUnit: 10.5,
      miscIncomePerAcre: 8,
      variable: {
        seed: { mode: 'unit', costPerUnit: 58, unitsPerAcre: 1.1 },
        nitrogen: { mode: 'unit', costPerUnit: 0, unitsPerAcre: 0 },
        phosphorus: { mode: 'unit', costPerUnit: 0.65, unitsPerAcre: 30 },
        potassium: { mode: 'unit', costPerUnit: 0.45, unitsPerAcre: 60 },
        herbicide: { mode: 'unit', costPerUnit: 24, unitsPerAcre: 2 },
        insecticide: { mode: 'unit', costPerUnit: 11, unitsPerAcre: 1 },
        cropInsurance: { mode: 'perAcre', perAcre: 19 },
        fuelOil: { mode: 'unit', costPerUnit: 3.1, unitsPerAcre: 5 },
        repairs: { mode: 'perAcre', perAcre: 15 },
        customHire: { mode: 'perAcre', perAcre: 26 },
        miscellaneous: { mode: 'perAcre', perAcre: 8 },
        hauling: { mode: 'unit', costPerUnit: 0.22, unitsPerAcre: 55 },
        drying: { mode: 'unit', costPerUnit: 0, unitsPerAcre: 0 },
        marketing: { mode: 'perAcre', perAcre: 4 },
      },
      preharvest: { auto: false, manualPerAcre: 18.75 },
    },
  ],
  fixed: {
    landRentPerAcre: 165,
    labor: { ratePerHour: 24, totalHoursPerYear: 1200 },
    equipment: [
      {
        id: 'tractor',
        name: 'Tractor',
        initialCost: 285000,
        salvageValue: 95000,
        usefulLife: 12,
        interestRate: 7,
      },
      {
        id: 'planter',
        name: 'Planter',
        initialCost: 145000,
        salvageValue: 40000,
        usefulLife: 15,
        interestRate: 6.5,
      },
    ],
    buildings: [
      {
        id: 'shed',
        name: 'Machine shed',
        initialCost: 90000,
        usefulLife: 30,
        interestRate: 6,
      },
    ],
    annual: { utilities: 4800, farmInsurance: 7200, duesFees: 1500, misc: 2000 },
  },
}

/** Cells read straight out of Excel after it calculated the scenario above. */
export const SHEET = {
  // Enterprise 1 — Corn (columns A–D)
  D7: 765,
  D9: 765,
  D10: 382500,
  D27: 533.7,
  D28: 266850,
  D29: 231.3,
  D30: 115650,

  // Enterprise 2 — Soybeans (columns E–H)
  H7: 577.5,
  H9: 585.5,
  H10: 175650,
  H27: 287.65,
  H28: 86295,
  H29: 297.85,
  H30: 89355,

  // Shared fixed costs
  O33: 132000,
  N35: 1.5,
  O35: 36,
  P35: 28800,
  P38: 15833.3333333333,
  O38: 19.7916666666667,
  P39: 7000,
  O39: 8.75,
  P44: 22833.3333333333,
  O44: 28.5416666666667,
  P46: 13300,
  O46: 16.625,
  P47: 6012.5,
  O47: 7.515625,
  P52: 19312.5,
  O52: 24.140625,
  P55: 3000,
  O55: 3.75,
  P61: 3000,
  O61: 3.75,
  P63: 2700,
  O63: 3.375,
  P69: 2700,
  O69: 3.375,
  O71: 6,
  O72: 9,
  O73: 1.875,
  O74: 2.5,

  // Whole-farm totals
  P75: 280.182291666667,
  P76: 1101.53229166667, // defective — see calc.test.js
  P77: 248.967708333333, // defective — see calc.test.js
  P78: 171.666666666657, // defective — see calc.test.js
}
