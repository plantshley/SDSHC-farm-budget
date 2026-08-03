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

## How it runs

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 50 tests: the economic model + a DOM smoke test
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

### Adding an input means touching three places

Markup (`src/ui/*.js`) → the scenario shape (`src/state.js` factories) →
`src/calc.js`. Inputs declare `data-path="enterprises.0.variable.seed.costPerUnit"`
and one delegated listener in `main.js` writes by path, so a new field needs no
new handler — but it does need to exist in the state factory and be consumed by
the model.

### `schemaVersion` and migrations

Producers have saved work in their own browsers. When the scenario shape changes:
bump `SCHEMA_VERSION` in `calc.js` **and** add a step to `migrate()` in
`src/storage.js`. Never drop a scenario because it is old. One corrupt record is
skipped, never fatal to the list.

`storage.js` never throws — every failure path returns `{ok: false, error}`, so a
full or blocked store is reported rather than swallowed. A save also returns
`{error: 'Conflict'}` when the stored record has moved on since this tab read it
(tracked in the module-level `lastKnownUpdatedAt` map). `main.js` asks the
producer before overwriting; `{force: true}` proceeds. Saving is a
read-modify-write of one key, so without that check a second tab could silently
replace the first tab's work.

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

### `render()` vs `updateOutputs()`

`render()` replaces the DOM and is for **structural** changes only — adding an
enterprise, switching screens, toggling a line's entry mode. Typing calls
`updateOutputs()`, which refreshes `[data-out]` elements in place. Re-rendering
on keystroke would move the caret and drop the mobile keyboard.

The boot block sits at the **bottom** of `main.js` on purpose: `render()` reads
`const` bindings declared above it (`FORMATTERS`), so booting from the top hits
their temporal dead zone and the app never renders. This was a real bug; the
smoke test catches it.

---

## Tests

315 tests across four files:

- `test/calc.test.js` — the model against real Excel output, plus the deliberate
  divergences and the regressions listed above.
- `test/calc-adversarial.test.js` — ~250 fuzz and edge cases. Its
  `assertAllFinite` walker recurses every numeric leaf of the result; **no
  output may ever be NaN, Infinity, undefined or null**, because these are shown
  to farmers as dollar amounts.
- `test/storage.test.js` — saving, migration, corruption, quota, cross-tab
  conflicts.
- `test/app.test.js` — boots the real app in jsdom and drives it.

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
