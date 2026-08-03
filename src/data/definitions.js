/**
 * Term definitions, shown by the round `?` buttons.
 *
 * These are read-only explanations. Nothing here writes a value into a field —
 * that is what the "use typical value" links do, deliberately kept separate.
 *
 * Written for producers, not accountants: plain language, a worked number
 * wherever a formula would otherwise be abstract.
 */

export const DEFINITIONS = {
  enterpriseBudget: {
    title: 'Enterprise Budget',
    body: [
      'An enterprise is one crop or activity you want to budget on its own — corn, soybeans, silage, a grazing enterprise.',
      'Giving each enterprise its own budget lets you see which ones actually make money, instead of only seeing whether the whole farm did.',
      'Add as many as you need. Income and variable expenses belong to a single enterprise; fixed costs are shared across all of them.',
    ],
  },

  grossRevenue: {
    title: 'Total Crop Revenue / Gross Revenue',
    body: [
      'Everything the enterprise brings in per acre, before any expenses.',
      'Yield per acre × price per unit, plus any miscellaneous income such as grazing crop residue or selling stalks.',
      'Example: 180 bu/acre × $4.25 = $765/acre.',
    ],
  },

  totalVariableExpenses: {
    title: 'Total Variable Expenses',
    body: [
      'Costs that change with how much you grow, and that you would not have if you did not plant the crop: seed, fertilizer, chemicals, fuel, crop insurance, hauling, drying.',
      'Also called direct or operating costs.',
      'These are the costs you can most easily change from one year to the next, which is why comparing them between scenarios is so useful.',
    ],
  },

  grossMargin: {
    title: 'Gross Margin',
    body: [
      'Gross revenue minus total variable expenses — what an enterprise contributes before any fixed costs are paid.',
      'Example: $765 revenue − $533.70 variable expenses = $231.30 gross margin per acre.',
      'Gross margin is the fairest way to compare two enterprises or two practices, because fixed costs like land and equipment usually stay the same either way.',
      'A positive gross margin means the enterprise is at least paying its own operating costs and helping cover overhead.',
    ],
  },

  totalGrossMargin: {
    title: 'Total Gross Margin',
    body: [
      'Every enterprise’s gross margin added together — the whole farm’s contribution toward fixed costs.',
      'If total gross margin is larger than your total fixed costs, the farm makes a profit. If it is smaller, it does not, no matter how well any single field did.',
    ],
  },

  fixedCosts: {
    title: 'Fixed Costs (Overhead)',
    body: [
      'Costs you pay whether or not you plant a single acre: land rent, hired labor, machinery depreciation and interest, buildings, utilities, insurance, dues.',
      'They belong to the whole operation, not to one crop, so this calculator spreads them across the total acres of every enterprise you have entered.',
      'This is why acres matter: with no acres entered, there is nothing to spread fixed costs over.',
    ],
  },

  salvageValue: {
    title: 'Salvage Value',
    body: [
      'What a machine will still be worth when you are done with it — its trade-in or resale value at the end of its useful life.',
      'It is not what you paid, and it is not zero for most farm equipment. A tractor bought for $285,000 might still be worth $95,000 after twelve years.',
      'Salvage value matters because you only wear out the difference. You are not losing the whole purchase price, only the part that disappears.',
      'Buildings in this calculator are assumed to depreciate all the way to zero, so they have no salvage value.',
    ],
  },

  usefulLife: {
    title: 'Useful Life',
    body: [
      'How many years you expect to use the item before replacing it — not how long it will physically last.',
      'It spreads the cost of a machine over the years that machine actually earns money for you, instead of charging the whole purchase to the year you bought it.',
    ],
  },

  depreciationVsInterest: {
    title: 'Depreciation vs. Interest — why both?',
    body: [
      'They are two different costs, and a machine has both. This is the single most common point of confusion on this page.',
      'DEPRECIATION is wear-out. The machine loses value every year you use it, and that lost value is a real cost even though no money leaves your account. It is (purchase price − salvage value) ÷ useful life.',
      'INTEREST is the cost of the money tied up in the machine. If you borrowed, it is what you pay the lender. If you paid cash, it is what that money could have earned elsewhere — still a real cost, called opportunity cost.',
      'Example: a $285,000 tractor with $95,000 salvage over 12 years depreciates $15,833/year. At 7% on its average value, it also costs $13,300/year in interest. Counting only one of the two understates what that tractor really costs you.',
      'Interest is charged on the machine’s average value over its life — (purchase price + salvage value) ÷ 2 — because you have less money tied up in it as it depreciates.',
    ],
  },

  equipmentVsBuilding: {
    title: 'What counts as Equipment vs. a Building?',
    body: [
      'EQUIPMENT is machinery you operate: tractors, combines, planters, drills, tillage tools, grain carts, augers, skid loaders, sprayers, trucks.',
      'BUILDINGS are permanent structures: machine sheds, grain bins, shops, barns, fencing and permanent water systems.',
      'The practical difference here: equipment keeps a salvage value, buildings are assumed to depreciate to zero.',
      'If you are unsure, ask whether it would sell separately at an auction. If yes, enter it as equipment.',
      'Only include items you actually use for the enterprises in this budget, and enter the share that belongs to this operation.',
    ],
  },

  landRent: {
    title: 'Land Rent (Cash or Equivalent Value)',
    body: [
      'What the land costs you per acre for the year.',
      'If you rent, use your cash rent. If you own the ground, use what you could rent it out for — owning does not make land free, it means you are giving up the rent someone else would pay you.',
      'This calculator applies one rate across all your acres. If your rented and owned ground differ a lot, use a weighted average.',
    ],
  },

  preharvestInterest: {
    title: 'Interest on preharvest variable costs',
    body: [
      'You pay for seed, fertilizer and chemicals in the spring but do not get paid until after harvest. Interest is the cost of carrying those expenses in between — on an operating loan, or on your own money.',
      'This calculator works it out for you: the preharvest costs above it, × the interest rate, × the months carried ÷ 12. The spreadsheet this is based on assumed 8 months at 10%.',
      'Hauling, drying and marketing are not included, because they happen at or after harvest and are not carried through the season.',
      'Change the rate and months to match your operating note, or switch to entering the figure yourself.',
    ],
  },

  laborCost: {
    title: 'Labor',
    body: [
      'Hired labor for the whole operation: the hourly wage, and the total hours across the year (number of employees × hours each).',
      'The calculator divides those hours across your total acres to get a cost per acre.',
      'Many producers also charge for their own time here. Unpaid operator labour is a genuine cost — if you did not do the work, you would have to pay someone who did.',
    ],
  },

  profitPerAcre: {
    title: 'Profit per Acre',
    body: [
      'Total profit for the whole farm divided by total acres — what is left after every variable and fixed cost is paid.',
      'This is acreage-weighted. If corn is on 500 acres and soybeans on 300, the corn figure carries more weight, exactly as it should.',
      'Note: this is calculated differently from the original spreadsheet, which added the per-acre figures of each enterprise together. That only works if every enterprise has the same acreage. See the note on the results screen.',
    ],
  },

  totalProfit: {
    title: 'Total Profit',
    body: [
      'Total gross margin minus total fixed costs — the bottom line for the whole operation.',
      'A negative number is not a calculation error. It means the enterprises, as entered, are not covering the full cost of the land, labour and machinery behind them. That is worth knowing, and it is often the most useful thing this calculator tells you.',
    ],
  },
}

/**
 * Which definitions belong to which section, for the `?` on each card header.
 */
export const SECTION_DEFINITIONS = {
  income: ['grossRevenue', 'enterpriseBudget'],
  variable: ['totalVariableExpenses', 'preharvestInterest', 'grossMargin'],
  fixed: [
    'fixedCosts',
    'landRent',
    'laborCost',
    'equipmentVsBuilding',
    'depreciationVsInterest',
    'salvageValue',
    'usefulLife',
  ],
  results: ['totalGrossMargin', 'totalProfit', 'profitPerAcre', 'fixedCosts'],
}
