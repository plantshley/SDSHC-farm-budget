/**
 * Term definitions, shown by the round `?` buttons.
 *
 * These are read-only explanations. Nothing here writes a value into a field —
 * that is what the "use typical value" links do, deliberately kept separate.
 *
 * HOUSE STYLE, and it is a requirement rather than a preference:
 *   - Say what the thing is, then how it is calculated, then a worked number.
 *   - No em-dashes. Use a full stop, a comma, or a colon.
 *   - SERIAL COMMA on every list that ends in "and" or "or": "hauling, drying,
 *     and marketing", never "hauling, drying and marketing". A list written
 *     without a final conjunction ("seed, fertilizer, chemicals, fuel") is a
 *     different construction and takes no extra comma.
 *   - No hedging openers ("if you want", "you might"), no editorialising
 *     ("that beats any table", "this is the most useful thing here").
 *   - No source citations in the prose. Sources belong in the `source` field of
 *     a typical-value spec, which the modal prints in its footer, and in
 *     TYPICAL-VALUES.md. A producer reading a definition does not need a
 *     bibliography in the middle of it.
 *   - Short sentences. These are read on a phone, often outdoors.
 */

export const DEFINITIONS = {
  enterpriseName: {
    title: 'Enterprise name',
    body: [
      'A label for this column. It changes no numbers.',
      'Leave it blank and the crop name is used instead.',
    ],
  },

  enterpriseGrossMargin: {
    title: 'Enterprise gross margin',
    body: [
      'The whole enterprise in dollars: gross margin per acre × acres.',
      'Example: $232/acre × 500 acres = $116,000.',
      'Gross margin per acre says how each acre performed. Enterprise gross margin says how much the enterprise contributed to the farm. A strong margin on 40 acres contributes less than a thin one on 900.',
      'This is the money available to cover fixed costs. Add up every enterprise, subtract total fixed costs, and the result is farm profit.',
    ],
  },

  laborHours: {
    title: 'Hired labor hours',
    body: [
      'Hired help for the whole farm. Do not include your own hours unless you intend to charge the business for your time.',
      'Enter the figure the way you know it. For someone working ten hours a week, choose "hours / week" and enter 10. The calculator converts it to a yearly total.',
    ],
  },

  overheadPeriod: {
    title: 'Overhead and its period',
    body: [
      'Overhead is the cost of running the business: utilities, insurance, dues, subscriptions, and anything else that does not belong to one crop.',
      'Most of these bills arrive monthly, so each line lets you choose the period your figure covers. A $180 power bill entered as "$ / month" becomes $2,160 a year.',
      'Every line is converted to a yearly figure before it is spread across your acres.',
      'Real estate and property taxes on ground you own belong on the Miscellaneous line. There is no separate row for them, and land rent covers rented acres only.',
      'Each line offers a typical value taken from South Dakota farm records. Those figures are published per acre, so choosing one multiplies it by the acres you have entered and fills in a yearly total.',
    ],
  },

  budgetFile: {
    title: 'What is a budget file?',
    body: [
      'A .json file this calculator produces. Choose "Save budget file" at the bottom of the page and it downloads to your device.',
      'It holds one complete budget: every enterprise, every expense, and the shared fixed costs.',
      'It exists because budgets are saved in this browser only. To move a budget from your phone to your laptop, save the file on the phone, transfer it, and upload it here with "Upload a budget file".',
      'Only files this calculator produced will open. A spreadsheet or a PDF is refused.',
      'Uploading a file never replaces a saved budget. It always comes in as a new one. If the name is already in use, "(opened from file)" is added to it.',
    ],
  },

  enterpriseBudget: {
    title: 'Enterprise budget',
    body: [
      'An enterprise is one crop or activity budgeted on its own: corn, soybeans, silage, a grazing enterprise, etc.',
      'Budgeting each one separately shows which enterprises make money, instead of only showing whether the whole farm did.',
      'Add as many as you need. Income and variable expenses belong to a single enterprise. Fixed costs are shared across all of them.',
    ],
  },

  grossRevenue: {
    title: 'Gross revenue',
    body: [
      'Everything the enterprise brings in per acre, before expenses.',
      'Yield per acre × price per unit, plus any miscellaneous income such as grazing crop residue or selling stalks.',
      'Example: 180 bu/acre × $4.25 = $765/acre.',
    ],
  },

  totalVariableExpenses: {
    title: 'Total variable expenses',
    body: [
      'Costs that change with how much you grow, and that you would not have if you did not plant the crop: seed, fertilizer, chemicals, fuel, crop insurance, hauling, drying.',
      'Also called direct or operating costs.',
      'These are the costs that change most from one year to the next, which is what makes them worth comparing between scenarios.',
    ],
  },

  grossMargin: {
    title: 'Gross margin',
    body: [
      'Gross revenue minus total variable expenses. What the enterprise contributes before fixed costs are paid.',
      'Example: $765 revenue − $533.70 variable expenses = $231.30 gross margin per acre.',
      'Gross margin is the fairest way to compare two enterprises or two practices, because fixed costs such as land and equipment usually stay the same either way.',
      'A positive gross margin means the enterprise covers its own operating costs and contributes to overhead.',
    ],
  },

  totalGrossMargin: {
    title: 'Total gross margin',
    body: [
      'Every enterprise gross margin added together. The whole farm contribution toward fixed costs.',
      'If total gross margin is larger than total fixed costs, the farm makes a profit. If it is smaller, it does not, however well any single field performed.',
    ],
  },

  fixedCosts: {
    title: 'Fixed costs (overhead)',
    body: [
      'Costs you pay whether or not you plant an acre: land rent, hired labor, machinery depreciation and interest, buildings, utilities, insurance, dues.',
      'They belong to the whole operation rather than one crop, so they are spread across the total acres of every enterprise entered.',
      'With no acres entered there is nothing to spread them over, and no per-acre figure can be calculated.',
    ],
  },

  salvageValue: {
    title: 'Salvage value',
    body: [
      'What a machine will still be worth when you are done with it. Its trade-in or resale value at the end of its useful life.',
      'It is not what you paid, and for most farm equipment it is not zero. A tractor bought for $285,000 might still be worth $95,000 after twelve years.',
      'Buildings in this calculator depreciate to zero, so they have no salvage value.',
    ],
  },

  usefulLife: {
    title: 'Useful life',
    body: [
      'How many years you expect to use the item before replacing it. Not how long it would physically last.',
      'It spreads the cost of a machine across the years that machine earns money, instead of charging the whole purchase to the year you bought it.',
    ],
  },

  depreciationVsInterest: {
    title: 'Depreciation and interest: why both',
    body: [
      'They are two different costs, and a machine has both.',
      'DEPRECIATION is wear-out. The machine loses value every year you use it. No money leaves your account, but the lost value is a real cost. It is (purchase price − salvage value) ÷ useful life.',
      'INTEREST is the cost of the money tied up in the machine. If you borrowed, it is what you pay the lender. If you paid cash, it is what that money could have earned elsewhere, which is still a real cost.',
      'Example: a $285,000 tractor with $95,000 salvage over 12 years depreciates $15,833 a year. At 7% on its average value it also costs $13,300 a year in interest. Counting only one of the two understates what the tractor costs.',
      'Interest is charged on the average value over the machine life, (purchase price + salvage value) ÷ 2, because less money is tied up in it as it depreciates.',
    ],
  },

  equipmentVsBuilding: {
    title: 'Equipment or building?',
    body: [
      'EQUIPMENT is machinery you operate: tractors, combines, planters, drills, tillage tools, grain carts, augers, skid loaders, sprayers, trucks.',
      'BUILDINGS are permanent structures: machine sheds, grain bins, shops, barns, fencing, permanent water systems.',
      'The test for an unclear item: would it sell separately at an auction? If so, enter it as equipment.',
      'Include only items used for the enterprises in this budget, and enter the share that belongs to this operation.',
    ],
  },

  landRent: {
    title: 'Land rent',
    body: [
      'What the land costs you per acre for the year.',
      'If you rent, use your cash rent. If you own the ground, use what you could rent it out for.',
      'This calculator applies one rate across all acres. Where rented and owned ground differ, use a weighted average.',
    ],
  },

  preharvestInterest: {
    title: 'Interest on preharvest costs',
    body: [
      'Seed, fertilizer, and chemicals are paid for preharvest. Interest is the cost of carrying those expenses in between, either on an operating loan or on your own money.',
      'It is calculated here: preharvest costs × interest rate × months ÷ 12.',
      'Hauling, drying, and marketing are excluded. They happen at or after harvest, so they are not carried through the season.',
      'Change the rate and months to match your operating note, or switch the line to entering the figure yourself.',
    ],
  },

  laborCost: {
    title: 'Labor',
    body: [
      'Hired labor for the whole operation: the hourly wage, and the total hours across the year (number of employees × hours each).',
      'The hours are divided across your total acres to give a cost per acre.',
      'Unpaid operator labor is a real cost and many producers charge for their own time here. If you did not do the work, you would pay someone else to.',
    ],
  },

  profitPerAcre: {
    title: 'Profit per acre',
    body: [
      'Total farm profit divided by total acres. What is left after every variable and fixed cost is paid.',
      'It is weighted by acreage. With corn on 500 acres and soybeans on 300, the corn figure carries more weight.',
    ],
  },

  totalProfit: {
    title: 'Total profit',
    body: [
      'Total gross margin minus total fixed costs. The bottom line for the whole operation.',
      'A negative number is not a calculation error. It means the enterprises as entered are not covering the full cost of the land, labor, and machinery behind them.',
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
