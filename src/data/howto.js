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
      'Every ? on this page explains a term. Tapping one never changes your numbers.',
    ],
  },
  {
    heading: 'Building a budget scenario',
    steps: [
      'Name the crop and enter the acres. Fixed costs are spread across acres, so no per-acre figure can be calculated until they are entered.',
      'Give the enterprise its own name if it needs one. Left blank, the crop name is used.',
      'Enter your yield per acre and the price you expect. Add any other income the enterprise brings in, such as grazing residue.',
      'Work down the variable expenses: seed, fertilizer, chemicals, fuel, insurance, hauling. Each line takes either a cost per unit times units per acre, or a straight cost per acre. The small button on the line switches between them.',
      'Interest on preharvest costs is calculated for you. Adjust the rate and months to match your operating note.',
      'Add an enterprise for each crop you want to budget. There is no limit.',
      'Fill in the shared fixed costs below: land rent, hired labor, each machine, each building, and your annual overhead.',
      'For labor and overhead, enter the figure the way you know it. A $180 monthly power bill goes in as 180 with "$ / month" selected. Ten hours a week of hired help goes in as 10 with "hours / week" selected.',
      'Read the results. Gross margin per acre shows how each enterprise is doing. Total profit shows how the farm is doing.',
    ],
  },
  {
    heading: 'Keeping a long budget manageable',
    body: [
      'Tap an enterprise heading to fold it shut. On a phone the ones you are not working on collapse out of the way.',
      'A new enterprise arrives folded shut. Tap its heading to open it.',
      'The shared fixed costs block folds the same way, with its yearly total still showing on the closed header.',
      'Folding only changes what you can see. It changes no number and is not saved with the budget.',
    ],
  },
  {
    heading: 'Where the typical values come from',
    body: [
      'Some fields have a "use typical value" link beside the label. It fills that one field, and only when you ask. Nothing is filled in automatically.',
      'Each list states its unit at the top and its source at the bottom. Land rent is South Dakota county data: averages of what was actually paid. Most of the rest come from the nearest published custom rate survey. Check those against what local operators charge.',
      'If a list is quoted per bushel and the line you are filling is set to dollars per acre, the calculator says so and switches the line rather than putting the number in the wrong box.',
    ],
  },
  {
    // The privacy question, answered at length and in one place. It used to be
    // two sentences inside "Saving and comparing scenarios", where it was
    // accurate and easy to miss. A producer typing their yields, prices, and
    // land rent into a web page at a workshop is entitled to a heading they can
    // find, not a clause inside one about something else.
    heading: 'Where your budgets live',
    body: [
      'Everything you enter stays on this device, in this browser. It is not sent anywhere and it is not stored on any server.',
      'The South Dakota Soil Health Coalition cannot see your budgets. Nobody can, except someone using this device.',
      'Your saved budgets will not appear on your other phone or computer, and they are not shared with anyone else at a workshop.',
      'To move a budget to another device, or to give one to somebody else, use "Save budget file" to download it and "Upload a budget file" on the Saved tab to read it back in.',
      'To keep a copy of everything at once, use "Export backup" on the Saved tab. It downloads every saved budget and every folder as one file, and "Restore backup" reads it back. Restoring replaces everything on the Saved tab, so the calculator says how many budgets are arriving and how many are going before it does anything.',
      'Those files are the only things that ever leave this device, and only when you download them yourself.',
      'Because the budgets live in this browser, clearing your browsing data deletes them. Export a backup for anything you want to keep.',
    ],
  },
  {
    heading: 'Saving and comparing scenarios',
    body: [
      'A scenario is one complete set of assumptions, saved under a name you choose. Comparing them is what this calculator is for.',
    ],
    steps: [
      'Build a budget and give it a clear name: "Field corn, conventional" rather than "Budget 1".',
      'Save it. It appears under Saved budgets.',
      'Duplicate it. You now have two identical budgets.',
      'Open the copy, rename it, and change any inputs.',
      'Go to Saved budgets, select both, and choose Compare. They appear side by side with the difference on every line. The first budget you select is the baseline, and every other one is shown as a difference from it. Select the budget you are comparing against first.',
    ],
  },
  {
    heading: 'Two comparison examples',
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
      'Save budget file downloads a file. Upload a budget file, on the Saved tab, reads one back in. Use the pair to move a budget from your phone to your computer, or to share with others.',
      'Export backup, on the Saved tab, downloads every saved budget and every folder as one file. Restore backup reads it back and replaces everything on the Saved tab.',
      'Export, on a row in the saved list, offers the same three for that budget without opening it. Use it when the budget you want to send is not the one you are working on.',
    ],
  },
]
