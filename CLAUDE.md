# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

The **SDSHC Farm Plan Budget** — a mobile-and-desktop web app that reproduces
the `SimpleFarmPlanBudget (002).xlsx` enterprise budget spreadsheet, explains its
terminology, removes its four-enterprise ceiling, and lets producers save and
compare scenarios on their own device.

Built for the South Dakota Soil Health Coalition. The users are producers and
students at the Soil Health School, on phones, often with no signal.

Vanilla JS + Vite + `vite-plugin-pwa`, deployed to GitHub Pages. No framework.
Design tokens are ported from the SDSHC Virtual Fence ROI tool so the two look
like one family.

**Source documents** (outside the repo, in the SDSHC OneDrive under
`Attachments/Received/`):
- `SimpleFarmPlanBudget (002).xlsx` — the spreadsheet this app reproduces
- `Iowa State Custom Rates.pdf` — the 2026 survey behind most typical values

South Dakota land rent comes from USDA NASS county estimates; useful life and
salvage value come from Iowa State AgDM A3-29. Both were extracted from their
PDFs by script rather than typed in — see [TYPICAL-VALUES.md](TYPICAL-VALUES.md),
which also records what was deliberately NOT shipped and why.

## How it runs

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 396 tests: the economic model, storage, data, and a DOM smoke test
npm run build      # -> dist/
```

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`. **The workflow runs `npm test` before building**,
so a broken model blocks the deploy.

`vite.config.js` sets `base: '/SDSHC-farm-budget/'`. Hardcoded absolute asset
paths like `/assets/x.png` will 404 in production — reference `public/` files
relatively (`./sdshc-logo.png`) or through Vite's asset handling.

`styles.css` is linked from `index.html`, **not** imported by `main.js`. That
keeps the entry module plain JS so the Node smoke tests can import it. Don't
move it back.

---

## Deliberate divergences from the spreadsheet

**These are corrections, not drift. Do not "fix" them back to match the
.xlsx.** Every one is asserted in `test/calc.test.js` under *deliberate
divergences*, and explained to producers by the `?` on the results screen
(`showDifferences()` in `src/ui/results.js`).

1. **`P78` Total Profit omitted equipment interest.** The sheet subtracts
   `SUM(P44,P35,O33,P61,P69,P71:P74)` — `P52` is missing — while its own
   `P75` Total Fixed Costs/Acre *does* include `O52`. The sheet's two totals
   contradict each other by the full amount of equipment interest. On the test
   fixture the sheet reports **+$171.67 profit** on a farm that actually
   **loses $19,140.83**. Equipment interest is included here, in both figures.

2. **`P76`/`P77` summed per-acre figures across enterprises.** Valid only if
   every enterprise has identical acreage; otherwise it adds incompatible rates.
   Whole-farm per-acre figures here are acreage-weighted (`total ÷ total acres`),
   so `profitPerAcre × totalAcres === totalProfit` always holds. Per-enterprise
   gross margin per acre is unchanged from the sheet.

3. **Preharvest interest (`D23`) is computed.** The sheet labels the row
   "8 months at 10%" but still expects a hand-typed answer, so it is routinely
   left blank. It is calculated from the preharvest lines above it
   (`VARIABLE_LINES` where `preharvest: true` — seed through miscellaneous;
   hauling, drying and marketing are excluded because they happen at or after
   harvest). Rate and term are editable, and `preharvest.auto = false` restores
   manual entry.

4. **Blank rows are $0, not `#DIV/0!`.** In the sheet, any unused equipment or
   building row computes `(blank − blank) / blank` and the error propagates
   into `P44`, `P61`, `P75`, `P76`, `P77` and `P78`. **The delivered spreadsheet
   cannot produce a Total Profit at all unless all six equipment rows and all
   six building rows are filled in.** `safeDiv()` guards every division here.

5. **A whole-farm Total Gross Margin was added.** The sheet carries the label at
   `I30`/`M30` but has no cell that rolls the enterprises up.

6. **Equipment and buildings are entered once.** The sheet has separate
   depreciation (rows 38–43, 55–60) and interest (46–51, 63–68) tables requiring
   the same initial cost and salvage to be typed twice per item. The formulas
   are unchanged; only the duplicate entry is gone.

**Kept faithful on purpose:** equipment interest is charged on
`(initial + salvage) / 2` while buildings use `initial / 2`. The two differ in
the sheet; both are defensible, and changing it would move producers' numbers
for no clear gain. Land rent is still a single rate across all acres.

---

## Critical contracts

### `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. It is the only place economics
live, and its purity is the only reason the model can be tested against the
spreadsheet independently of the UI. **Do not add a DOM reference here**, however
convenient.

**Every arithmetic result must pass through `num()`, `finite()` or `safeDiv()`.**
Two finite inputs can still multiply past `Number.MAX_VALUE`; the resulting
`Infinity` spreads, and where it later meets `× 0` or `Infinity − Infinity` it
becomes `NaN` — so a dollar figure renders as "NaN" or "∞" on a producer's
screen. An adversarial QA pass found six such paths. An overflow collapses to 0,
consistent with how every other unusable input is treated here.

`num()` rejects `Infinity` as well as `NaN` — `Number(x) || 0` lets `Infinity`
through. It also strips `$`, spaces and thousands separators, because
`Number("1,000")` is `NaN` and a pasted or imported "$285,000" would otherwise
become $0 with nothing on screen to say so.

**`safeDiv()` only guards a divisor of exactly zero.** Negative divisors pass
straight through. Depreciation therefore clamps useful life with
`usefulLife > 0 ? usefulLife : 0` — without it, a typo of "-12" for 12 produced
*negative* depreciation that quietly **reduced** the farm's costs and inflated
profit, while the warning told the producer it was counted as $0.

**Every cost and rate goes through `nonNegative(value, label, warnings)`.** This
is the same bug generalised. A finite number is not a correct one: a "-7" typed
for a 7% equipment interest rate produces a negative cost, which is *subtracted*
from total fixed costs and therefore **inflates profit** — on a farm with
$500,000 of machinery, by tens of thousands of dollars, in the flattering
direction, with a perfectly ordinary-looking figure on screen. Every finiteness
assertion in `calc-adversarial.test.js` passes straight over it. Covered:
equipment and building initial cost / salvage / interest rate, land rent, labor
rate, labor hours, every overhead line, yield, price, and every variable expense
line.

Two deliberate exceptions, both already warned about and both left alone because
the arithmetic still has to be shown to explain what went wrong:

- **negative acres** — the per-acre figures must still compute so the producer
  can see the effect;
- **salvage above initial cost** — internally consistent (it says the machine
  appreciates) rather than a sign error, and pinned by its own test.

The invariant the tests assert is *not* "profit can never rise" — treating a typo
as $0 removes a real cost, so it can. It is that **a negative figure is worth the
same as zero, never handed back as a credit.**

### Adding an input means touching three places

Markup (`src/ui/*.js`) → the scenario shape (`src/state.js` factories) →
`src/calc.js`. Inputs declare `data-path="enterprises.0.variable.seed.costPerUnit"`
and one delegated listener in `main.js` writes by path, so a new field needs no
new handler — but it does need to exist in the state factory and be consumed by
the model.

### Entry conveniences must not change an answer

Two v2 additions let a producer enter a figure the way they actually know it,
and both are deliberately *presentational* — they annualise on the way into the
model and change nothing else:

- `fixed.labor.hours` + `fixed.labor.hoursBasis` (year / month / week)
- `fixed.annual.<key>` + `fixed.annualBasis.<key>` (year / quarter / month / week)

`perYearFactor()` in `calc.js` resolves the basis, and **an unrecognised basis
falls back to a multiplier of 1, never 0.** A hand-edited file or a future key
must not silently erase a real cost. Asserted in `test/calc.test.js`.

`calcFixed()` also still reads the pre-v2 `fixed.labor.totalHoursPerYear`, so an
unmigrated budget — one arriving from an old exported file — calculates
correctly even before `migrate()` touches it.

### An enterprise's name is separate from its crop

`enterpriseLabel(ent, index)` in `calc.js` resolves `name || crop || "Enterprise
N"`. The sheet's column heading *is* the crop (D2); here they are separate,
because comparing tillage systems means two enterprises both growing corn and
"Corn" twice tells a producer nothing. The crop is the fallback, so a v1 budget
reads exactly as it did — `migrate()` sets `name` to `''`, never copying the crop
into it.

### `schemaVersion` and migrations

Producers have saved work in their own browsers. When the scenario shape changes:
bump `SCHEMA_VERSION` in `calc.js` **and** add a step to `migrate()` in
`src/storage.js`. Never drop a scenario because it is old. One corrupt record is
skipped, never fatal to the list.

`storage.js` never throws — every failure path returns `{ok: false, error}`, so a
full or blocked store is reported rather than swallowed.

Two writes bypass `saveScenario()` on purpose:

- **`renameScenario(id, name)`** — the Saved tab renames inline and autosaves.
  Routing that through `saveScenario()` would write the whole *working* scenario
  over the stored one, including Budget-tab edits the producer has not saved.
- **`reorderScenarios(ids)`** — assigns `sortIndex`. Ids not in the list keep
  their place and are appended, so a reorder can never make a budget vanish
  because another tab saved one between render and drop. `listScenarios()` sorts
  by `sortIndex` when present and falls back to newest-first, which is what
  someone who has never dragged anything expects.

`duplicateScenario()` deletes `sortIndex`; a copy has never been dragged
anywhere, and inheriting the original's rank would put two budgets at the same
position. A save also returns
`{error: 'Conflict'}` when the stored record has moved on since this tab read it
(tracked in the module-level `lastKnownUpdatedAt` map). `main.js` asks the
producer before overwriting; `{force: true}` proceeds. Saving is a
read-modify-write of one key, so without that check a second tab could silently
replace the first tab's work.

### The typical-value picker knows its units

Each variable-expense spec in `data/typical-values.js` declares `appliesTo:
'perAcre' | 'unit'`. A Custom Hire list quoted in $/acre and a Hauling list
quoted in $/bushel are not interchangeable, and writing one into the box the
line happens to be showing produces a silently wrong budget — a $0.14/bu hauling
rate landing in the $/acre box is off by a factor of your yield.

`openTypical()` therefore takes the line's current mode. On a mismatch it says so
at the top of the modal and, when an option is chosen, switches the line's mode
*and* writes to the correct field. Because that swaps which inputs exist, it
needs a structural re-render — announced as a `fb:rerender` event on `document`
so `ui/modals.js` keeps no dependency on `main.js`. The `CustomEvent`
constructor comes from `document.defaultView`, not the global: Node has its own
`CustomEvent`, and a synthetic document rejects an event built in another realm.

Every picker also prints its unit (`.modal-unit`) and suffixes it onto each
option, because "$0.14" and "$0.14 /bu" are the same number but only the second
tells a producer what it is about to be multiplied by.

### Exports are handed to other people

`csvCell()` in `export.js` does RFC-4180 quoting **and** neutralises formulas: a
cell of *text* starting `=`, `+`, `-`, `@`, tab or CR is prefixed with an
apostrophe. Budget, enterprise and equipment names are free text, and these files
are made to be given to an instructor, a lender or the rest of the class — all
three major spreadsheets execute such a cell on open.

**Numbers are deliberately exempt.** Every figure arrives as a real number from
`round()`, and a negative profit of `-19140.83` must stay a summable number;
quoting it as text would break every formula the recipient writes against the
export, which is most of the reason to offer a CSV at all. The guard therefore
tests `typeof value !== 'number'`, not the leading character alone. Both halves
are asserted in `test/app.test.js` under *exports*.

### `?` explains, `use typical value` acts — never merge them

- Round `?` (`.help-btn`, `data-info`) → `openInfo()`. **Read-only.** Tapping it
  must never change a producer's number.
- Text link `use typical value` (`.tip`, `data-typical`) → `openTypical()`.
  Writes exactly one field.

Both rules are asserted in `test/app.test.js` under *help affordances stay
separate*.

### Nothing auto-fills

Every field starts blank. Typing an equipment name matches a `category`, which
**only** filters which options the useful-life picker shows. It never writes a
value. Sentinels like `=0.25*initialCost` resolve against a sibling field at
apply time (the pattern the ROI tool uses for `=40*herd`), and show a guard
message when that sibling is empty.

### No typical value without a citation

See [TYPICAL-VALUES.md](TYPICAL-VALUES.md). Where no source exists, the link does
not appear. Provisional figures are marked `status: 'provisional'` and carry a
caution in the modal. Equipment purchase prices and South Dakota land
rent/yield/price data are **deliberately absent** pending research.

### One set of components, two grid arrangements

Desktop (≥900px) lays enterprises out as parallel columns mirroring the
spreadsheet; mobile stacks the same cards as accordions. This is a media query in
`styles.css` and nothing else. **Never fork into separate mobile and desktop
components.**

### `render()` vs `updateOutputs()` — and why results must be `data-out`

`render()` replaces the DOM and is for **structural** changes only — adding an
enterprise, switching screens, toggling a line's entry mode. Typing calls
`updateOutputs()`, which refreshes `[data-out]` elements in place. Re-rendering
on keystroke would move the caret and drop the mobile keyboard.

**The corollary is load-bearing and was violated once.** `updateOutputs()` is the
*only* thing that runs on a keystroke, so anything it does not touch is frozen at
the last structural render. `ui/results.js` originally interpolated its numbers
straight from the result object — so the sticky bar (which used `data-out`)
tracked every keystroke while the KPI cards and every results table below them
sat at whatever the farm looked like when an enterprise was last added. On screen
that reads as two contradictory profit figures, and the producer has no way to
know the bottom one is right.

> **Rule: if a number can change without the DOM changing shape, it must be a
> `[data-out]` placeholder, never a template literal.** That now includes the
> warnings block (`[data-warnings]`) and the enterprise labels in the results
> table (`[data-ent-label]`), both of which appear and change as acres and names
> are typed. Asserted in `test/app.test.js` under *every figure on screen agrees*.

### UI state is not scenario state

Which cards are folded shut lives in module-level state in `main.js`
(`collapsedEnterprises`, `fixedCollapsed`), **not** in the scenario. Whether a
column is open on this phone right now is not a fact about the farm; putting it
in the scenario would mark the budget dirty on every fold and carry the flag into
the exported file. Same reasoning keeps it out of `localStorage`.

The boot block sits at the **bottom** of `main.js` on purpose: `render()` reads
`const` bindings declared above it (`FORMATTERS`), so booting from the top hits
their temporal dead zone and the app never renders. This was a real bug; the
smoke test catches it.

---

## Tests

396 tests across six files:

- `test/calc.test.js` — the model against real Excel output, plus the deliberate
  divergences and the regressions listed above.
- `test/calc-adversarial.test.js` — ~250 fuzz and edge cases. Its
  `assertAllFinite` walker recurses every numeric leaf of the result; **no
  output may ever be NaN, Infinity, undefined or null**, because these are shown
  to farmers as dollar amounts.
- `test/storage.test.js` — saving, migration, corruption, quota, cross-tab
  conflicts.
- `test/app.test.js` — boots the real app in jsdom and drives it. Now also
  covers the results/sticky-bar agreement, folding, inline rename, drag
  reordering and the unit-aware typical-value picker.
- `test/typical-values.test.js` — the shape and provenance of every shipped
  figure: a citation on everything, no negative or non-finite values, sentinels
  that `ui/modals.js` can actually resolve, and the land-rent extraction checked
  against the county list and the map legend bands.

The smoke test exists because a passing build proves the modules parse and
nothing more. It has already caught a TDZ crash on boot and a crash in the How-to
guide, either of which would have shipped.

### The golden fixture

`test/fixture.js` holds a two-enterprise farm and the spreadsheet's own answers
for it. **Those `SHEET` values came from real Excel**, not hand arithmetic: a
copy of the .xlsx was filled in via COM automation, calculated, and read back.

To regenerate after changing the fixture inputs, drive Excel from PowerShell.
Two things will bite you:

- Assigning a .NET `Double` to `.Value2` throws *"Specified cast is not valid"*
  under Windows PowerShell 5.1. Assign an invariant-culture **string** to
  `.Formula` instead and let Excel parse it.
- Excel's `#DIV/0!` reads back as `-2146826281`. If you see that, an unused
  depreciation row has a blank useful life — set the unused rows to `1` so they
  evaluate to $0 (divergence 4 above).

The fixture deliberately uses `preharvest.auto = false` mirroring the sheet's
hand-entered row 23, so it isolates one divergence at a time. Computed
preharvest interest has its own tests.

---

## Not built yet

`src/submit.js` is a **stub**. Phase 1 is local-only so the app works with no
signal, and so that collecting student data stays a deliberate decision with a
consent conversation attached. When Phase 2 lands, reuse the SDSHC-games-hub
Firebase setup and its `firestore.rules` pattern. Before enabling it, decide what
students are told and when they agree, whether anything identifying is collected
at all (default: no), and how long submissions are kept.
