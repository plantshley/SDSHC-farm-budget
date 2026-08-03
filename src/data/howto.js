/**
 * "How to Use This Calculator" — the guide behind the `?` in the header.
 *
 * Covers both halves. Building a budget has the spreadsheet to fall back on;
 * saving and comparing scenarios does not, so that section is worked through
 * with the two comparisons the Soil Health School actually teaches.
 */

export const HOW_TO_SECTIONS = [
  {
    heading: 'What this calculator does',
    body: [
      'It works out whether the crops you grow are paying for themselves — and by how much.',
      'You build one budget per enterprise (a crop or activity: corn, silage, soybeans, grazing), then enter the costs your whole operation carries no matter what you plant. The calculator puts the two together and tells you what the farm makes.',
      'It follows the SimpleFarmPlanBudget spreadsheet, with a few corrections. The results screen has a note explaining exactly where and why the numbers differ.',
      'Every ? on this page explains a term. Tapping one never changes your numbers.',
    ],
  },
  {
    heading: 'Building a budget',
    steps: [
      'Name the crop and enter the acres. Acres matter more than anything else here — fixed costs are spread across them, so nothing per-acre works until they are entered.',
      'Enter your yield per acre and the price you expect. Add any other income the enterprise brings in, such as grazing residue.',
      'Work down the variable expenses: seed, fertilizer, chemicals, fuel, insurance, hauling. Each line can be entered as a cost per unit times units per acre, or as a straight cost per acre — tap the small button on the line to switch.',
      'Interest on preharvest costs is worked out for you. Adjust the rate and months to match your operating note if you like.',
      'Add another enterprise for each crop you want to budget. There is no limit — the original spreadsheet stopped at four.',
      'Fill in the shared fixed costs below: land rent, hired labor, each machine, each building, and your annual overhead.',
      'Read the results. Gross margin per acre tells you how each enterprise is doing; total profit tells you how the farm is doing.',
    ],
  },
  {
    heading: 'Where the typical values come from',
    body: [
      'Some fields offer a "use typical value" link. It fills that one field, and only when you ask it to — nothing is ever filled in automatically.',
      'Each list says where its figures came from. Most are from the Iowa State custom rate survey, which is the nearest published survey to South Dakota; check them against what local operators actually charge.',
      'Where there is no trustworthy published figure, there is no link. That is deliberate.',
    ],
  },
  {
    heading: 'Saving and comparing scenarios',
    body: [
      'This is what the calculator is really for. A scenario is one complete set of assumptions, saved under a name you choose.',
      'Budgets are saved on this device only — in this browser. They are not sent anywhere, and they will not appear on your other phone or computer unless you export the file and open it there.',
    ],
    steps: [
      'Build a budget and give it a clear name — "Field corn, conventional" rather than "Budget 1".',
      'Save it. It appears in Saved budgets.',
      'Duplicate it. You now have two identical budgets.',
      'Open the copy, rename it, and change ONE thing — the crop, a tillage pass, a seed rate.',
      'Go to Saved budgets, tick both, and choose Compare. You will see them side by side with the difference on every line.',
    ],
  },
  {
    heading: 'Two comparisons worth building',
    body: [
      'FIELD CORN vs. SILAGE CORN. Duplicate your corn budget. On the copy, change the yield unit to tons and the yield and price to your silage figures, then adjust harvest costs — silage usually means chopping instead of combining and drying. Compare gross margin per acre. The revenue often looks better for silage; the question is whether the harvest and hauling costs eat the difference.',
      'TILLAGE vs. NO-TILL ON SOYBEANS. Duplicate your soybean budget. On the no-till copy, remove the tillage passes from custom hire or fuel, adjust repairs, and change the herbicide line if your program changes. Compare gross margin per acre. Remember that the machinery you no longer run still costs you depreciation and interest until you actually sell it — that shows up in fixed costs, not variable.',
      'In both cases, compare GROSS MARGIN first. Fixed costs usually stay the same between two scenarios, so gross margin is the honest measure of what actually changed.',
    ],
  },
  {
    heading: 'Getting your numbers out',
    body: [
      'Export CSV opens in Excel or Google Sheets with every line item.',
      'Print produces a clean copy for paper or PDF.',
      'Save budget file downloads a file you can open on another device — use it to move a budget from your phone to your computer, or to hand it to someone else.',
      'Because everything lives in this browser, clearing your browsing data will delete your saved budgets. Export anything you want to keep.',
    ],
  },
]
