/**
 * "How to Use This Calculator" — the guide behind the `?` in the header.
 *
 * Same house style as data/definitions.js: direct, no em-dashes, no hedging, no
 * source citations in the prose. Sources are printed in each picker's own
 * footer.
 *
 * Covers both halves. Building a budget has the spreadsheet to fall back on;
 * saving and comparing scenarios does not, so that section is worked through
 * with the two comparisons the Soil Health School actually teaches.
 */

export const HOW_TO_SECTIONS = [
  {
    heading: 'What this calculator does',
    body: [
      'It works out whether the crops you grow are paying for themselves, and by how much.',
      'You build one budget per enterprise (a crop or activity: corn, silage, soybeans, grazing), then enter the costs the whole operation carries whatever you plant. The calculator combines the two and reports what the farm makes.',
      'It follows the SimpleFarmPlanBudget spreadsheet, with a few corrections. The results screen lists exactly where the numbers differ and why.',
      'Every ? on this page explains a term. Tapping one never changes your numbers.',
    ],
  },
  {
    heading: 'Building a budget',
    steps: [
      'Name the crop and enter the acres. Fixed costs are spread across acres, so no per-acre figure can be calculated until they are entered.',
      'Give the enterprise its own name if it needs one. It is separate from the crop, which matters when you are comparing two ways of growing the same thing: "No-till corn" and "Conventional corn" keep the columns straight. Left blank, the crop name is used.',
      'Enter your yield per acre and the price you expect. Add any other income the enterprise brings in, such as grazing residue.',
      'Work down the variable expenses: seed, fertilizer, chemicals, fuel, insurance, hauling. Each line takes either a cost per unit times units per acre, or a straight cost per acre. The small button on the line switches between them.',
      'Interest on preharvest costs is calculated for you. Adjust the rate and months to match your operating note.',
      'Add an enterprise for each crop you want to budget. There is no limit. The original spreadsheet stopped at four.',
      'Fill in the shared fixed costs below: land rent, hired labor, each machine, each building, and your annual overhead.',
      'For labor and overhead, enter the figure the way you know it. A $180 monthly power bill goes in as 180 with "$ / month" selected. Ten hours a week of hired help goes in as 10 with "hours / week" selected, not 520.',
      'Read the results. Gross margin per acre shows how each enterprise is doing. Total profit shows how the farm is doing.',
    ],
  },
  {
    heading: 'Keeping a long budget manageable',
    body: [
      'Tap an enterprise heading to fold it shut. On a phone the ones you are not working on collapse out of the way. On a computer they shrink to a narrow card beside the one you are reading, so four enterprises fit on screen instead of two.',
      'A new enterprise arrives folded shut. Tap its heading to open it.',
      'The shared fixed costs block folds the same way, with its yearly total still showing on the closed header.',
      'Folding only changes what you can see. It changes no number and is not saved with the budget.',
    ],
  },
  {
    heading: 'Where the typical values come from',
    body: [
      'Some fields have a "use typical value" link beside the label. It fills that one field, and only when you ask. Nothing is filled in automatically.',
      'Each list states its unit at the top and its source at the bottom. Land rent is South Dakota county data: averages of what was actually paid. Most of the rest come from the nearest published custom rate survey, which is Iowa. Check those against what local operators charge.',
      'If a list is quoted per bushel and the line you are filling is set to dollars per acre, the calculator says so and switches the line rather than putting the number in the wrong box.',
      'Where there is no trustworthy published figure, there is no link. There is no typical value for what a tractor costs or for the price you will get for your grain. The first depends too much on the machine, and the second changes weekly.',
    ],
  },
  {
    heading: 'Saving and comparing scenarios',
    body: [
      'A scenario is one complete set of assumptions, saved under a name you choose. Comparing them is what this calculator is for.',
      'Budgets are saved in this browser, on this device. They are not sent anywhere. They will not appear on your other phone or computer unless you save the budget file and open it there.',
    ],
    steps: [
      'Build a budget and give it a clear name: "Field corn, conventional" rather than "Budget 1".',
      'Save it. It appears under Saved budgets.',
      'Duplicate it. You now have two identical budgets.',
      'Open the copy, rename it, and change one thing: the crop, a tillage pass, a seed rate.',
      'Go to Saved budgets, tick both, and choose Compare. They appear side by side with the difference on every line. The first budget you tick is the baseline, and every other one is shown as a difference from it. Tick the budget you are comparing against first.',
    ],
  },
  {
    heading: 'Housekeeping on the Saved tab',
    body: [
      'Open Budget, Duplicate and Delete sit together at the right of every row.',
      'Tap any budget name in the list to rename it. Renames save immediately. Renaming a budget in the list does not open it and does not disturb unsaved work on the Budget tab.',
      'The ▲ and ▼ arrows move a budget up or down the list. On a computer you can drag the handle between them instead. The order is kept.',
      'Duplicate makes a copy under a new name, which is how every comparison starts.',
      'Delete cannot be undone. Save the budget file first if you may want it back.',
    ],
  },
  {
    heading: 'Two comparisons worth building',
    body: [
      'FIELD CORN AGAINST SILAGE CORN. Duplicate your corn budget. On the copy, change the yield unit to tons and enter your silage yield and price, then adjust harvest costs: silage means chopping instead of combining and drying. Changing the unit clears any hauling or drying figure taken from the typical values, because those are published per bushel. Compare gross margin per acre. Silage revenue often looks better, and the question is whether the harvest and hauling costs absorb the difference.',
      'TILLAGE AGAINST NO-TILL ON SOYBEANS. Duplicate your soybean budget. On the no-till copy, remove the tillage passes from custom hire or fuel, adjust repairs, and change the herbicide line if your program changes. Compare gross margin per acre. The machinery you no longer run still costs depreciation and interest until you sell it, and that sits in fixed costs rather than variable.',
      'Compare gross margin first in both cases. Fixed costs usually stay the same between two scenarios, so gross margin measures what actually changed.',
    ],
  },
  {
    heading: 'Getting your numbers out',
    body: [
      'Export CSV opens in Excel or Google Sheets with every line item.',
      'Print produces a clean copy for paper or PDF.',
      'Save budget file downloads a file. Upload a budget file, on the Saved tab, reads one back in. Use the pair to move a budget from your phone to your computer, or to hand it to someone else.',
      'Clearing your browsing data deletes your saved budgets. Save a file for anything you want to keep.',
    ],
  },
]
