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
npm test           # 446 tests: the economic model, storage, data, and a DOM smoke test
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
divergences*.

**This section is now the only record of them.** The app used to disclose them to
producers through a `showDifferences()` guide on the results screen and a
`.differs-note` that opened it; both were removed once the corrections were
signed off, because the app is not presented as a version of a spreadsheet its
users may never have opened. Nothing about the model changed with them. If a
future change to `calc.js` moves a producer's number, that is a different
question from these six and needs its own answer — do not treat the absence of
the guide as licence to diverge quietly.

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
skipped, never fatal to the list. Currently at **3**; the tests assert against the
exported constant, not a literal, so a bump does not break three of them.

A step that writes nothing is still a step worth adding — see v2 → v3, where the
absence of the new key is the correct state and backfilling it would be
destructive.

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

### Reordering is implemented twice, and has to be

HTML5 drag-and-drop does not exist on touch, and these budgets are mostly
reordered on a phone. `main.js` therefore carries a native `dragstart`/`dragover`
/`dragend` path for a mouse and a `pointerdown`/`pointermove`/`pointerup` path
for touch, gated on `e.pointerType === 'mouse'` so one gesture never starts both.
Both finish through `commitOrder()`.

**`touch-action: none` on `.scn-grip` is load-bearing.** A touch the browser is
allowed to interpret as a scroll is gone: it fires `pointercancel` and there is
no way to claim it back, which is why the handle previously did nothing on a
phone but scroll the page. The property has to be declared on the element up
front, not decided when the gesture starts, and it is scoped to the handle alone
so the rest of the list still scrolls. `preventDefault()` on `pointerdown` is the
other half.

A captured pointer reports the *handle* as its target for the whole gesture, so
`pointermove` finds the row under the finger with `document.elementFromPoint()`
rather than `e.target`. jsdom has no layout and no `elementFromPoint`, so the
test supplies one; everything either side of that is the real code path.

The **arrows are still the primary control** — they work from a keyboard, from a
screen reader, and without a steady hand, and they keep the full 44px on touch.
The handle is the shortcut. It is now visible on touch too, which costs the row
about 30px of height; a hidden control cannot be the one people ask for.

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

**A sentinel is a share of a sibling; `*acres` is a rate.** `formatOption()`
renders `=0.25*initialCost` as "25%" because a quarter of what you paid for a
tractor genuinely is a percentage. Applying the same rule to `=6.11*acres` put
**"611%" on the utilities button** for a $6.11/acre figure — not a cosmetic slip
but a different quantity, with nothing on the button to say so. The `acres`
branch falls through to money formatting instead. Pinned in `test/app.test.js`
under *a figure is shown in the units it is actually in*, which asserts both
halves so neither can be "simplified" back into one.

### A figure quoted per bushel stops being that figure when the unit changes

Hauling is published in $/bushel and drying in $/point per bushel. Switch an
enterprise from bushels to tons and $0.135 a bushel silently becomes $0.135 a
ton — off by roughly the weight of a ton of corn, in the flattering direction,
with a number on screen that looks exactly as reasonable as it did before.
Nothing downstream can detect it, because $0.135 is an ordinary cost per unit.

The two specs declare `quotedPerYieldUnit: 'bu'`. `markQuotedUnit()` in
`ui/modals.js` records it on the line as `typicalYieldUnit` when a figure is
applied; `dropStaleTypicalValues()` in `main.js` clears the figure when the
enterprise's `yieldUnit` moves off it, and says so.

**Overhead has the same hole one field over, and it is worse.** A FINBIN rate is
a published *annual* figure, and the picker moves the line's period select to
"$ / year" to say so. Move it to "$ / month" afterwards and `calcFixed()`
multiplies an already-annual figure by twelve: $3,055 of utilities becomes
$36,660. So `openTypical()` also writes `fixed.annualTypicalBasis.<key>`
alongside the select it just moved, and `dropStaleOverheadValue()` clears the
line when the two disagree. The provenance path is passed in explicitly
(`data-typical-basis-path`, set by `periodField()`) rather than derived from the
basis path by string surgery.

**Two paths, not one, and that is the point.** `fixed.annualBasis.<key>` is what
the producer has the line set to; `fixed.annualTypicalBasis.<key>` is what the
figure in it was published for. A single field could not tell the two apart, and
the difference between them is the entire signal.

**Only figures the picker wrote are cleared.** A number the producer typed
carries no marker and is left alone, however unlikely it looks: the app knows the
unit changed, not what they meant by it, and deleting typed work on a guess is
worse than the error it would prevent. Asserted in `test/app.test.js` under
*changing a yield unit does not silently reinterpret a figure*.

The marker is persisted rather than held in memory because the mismatch outlives
the session — a budget saved in bushels and reopened next week can still have its
unit changed. That made it a scenario-shape change, hence `SCHEMA_VERSION = 3`
and a v2 → v3 step in `migrate()`. **That step deliberately writes nothing:** a v2
budget has no picker provenance, and the absence is the correct state, not a gap
to backfill. Backfilling would mark figures the producer typed and hand them to
the clearing logic.

The message lives in `unitNotices` (a `Map` by enterprise index) and
`fixedNotice` (a string, since the shared block has no index), both in `main.js`,
consumed by the render that answers the change and cleared at the end of it. Same
reasoning as `collapsedEnterprises`: not a fact about the farm, so not in the
scenario and not in `localStorage`. A figure vanishing from a card with nothing on
screen to explain it reads as the app losing work, so the notice is not garnish —
it is what makes clearing the field safe to do at all.

Each notice is `{ text, paths }`, and `unitNotice()` in `ui/fields.js` writes the
paths into `data-notice-for`. A `focusin` listener in `main.js` **removes the
paragraph when the producer taps into one of the fields it names** — it explains
an empty box, and once they are filling that box in it has said everything it has
to say. Only the named fields dismiss it; tabbing past a neighbour is not reading
it. Removed from the DOM directly rather than through `render()`, which would take
the focus they just gave the input.

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

**The comparison exports too, from the table's own row list.** `compareToCSV()`
imports `COMPARE_ROWS` from `ui/scenarios.js` rather than keeping its own copy —
a second list is two things to keep in step, and the failure is a producer
handing an instructor a file that quietly disagrees with the screen it came from.
Differences get **their own column**, not a merged `value (+123)` cell: that
reads correctly and computes as nothing.

### `?` explains, `use typical value` acts — never merge them

- Round `?` (`.help-btn`, `data-info`) → `openInfo()`. **Read-only.** Tapping it
  must never change a producer's number.
- Text link `use typical value` (`.tip`, `data-typical`) → `openTypical()`.
  Writes exactly one field.

Both rules are asserted in `test/app.test.js` under *help affordances stay
separate*.

**A modal opens folded, and folded means shut.** A card's `?` opens several
definitions at once — the fixed-costs one opens seven — so `openInfo()` renders
each as a closed `<details>` whenever there is more than one. Flat, that is four
screens of prose to scroll past to reach the term you actually tapped for; the
list of headings is itself the answer to "what is on this card?". The how-to
guide uses the same rule via `openGuide({ collapsible: true })` with no
`firstOpen`. **A single definition is never folded** — tapping `?` and
then tapping again to read the answer is not an improvement. Asserted in
`test/app.test.js` under *a card `?` is a list of terms, not a wall of prose*.

**Both live in the label row, never under the input.** `labelRow()` in
`ui/fields.js` emits label → `?` → `use typical value`, and `renderLine()` in
`ui/enterprise.js` does the same for a variable-expense line. Under the box, the
link reads as a caption belonging to the *next* field down, and it adds a row of
height to every field that has one — across fifteen expense lines and four
equipment fields that is most of a screen. Asserted in `test/app.test.js` under
*every "use typical value" link sits in its field label row*.

### Prose style in every modal, hint and definition

`data/definitions.js` carries the rule at the top of the file and
`data/howto.js` follows it. In short: say what the thing is, how it is
calculated, then a worked number. **No em-dashes** (full stop, comma or colon
instead), no hedging openers, no editorialising, and **no source citations in the
prose** — a source belongs in a spec's `source` field, which the picker prints in
its footer, and in TYPICAL-VALUES.md. Same rule for group labels: a picker row
says *"Planter, drill, or sprayer"*, not *"…— Iowa State Table 1b"*. Provenance is
carried as a `table: '1a' | '1b'` flag that the tests key on instead.

**The serial comma is required** on any list ending in "and" or "or":
*"hauling, drying, and marketing"*. A list written without a final conjunction
(*"seed, fertilizer, chemicals, fuel"*) is a different construction and takes no
extra comma — don't add an "and" to make one fit the rule.

**The app does not mention the spreadsheet at all.** Producers here have not
necessarily seen the .xlsx, and a definition that explains itself by contrast
with a document you have never opened explains nothing. Nothing on screen, in a
modal, in the how-to guide, in an export, or in README.md names it. The cell
references in `calc.js` comments stay: they are how a future change is checked
against the source, and nobody reads them but us.

### Nothing auto-fills

Every field starts blank. Typing an equipment name matches a `category`, which
**only** filters which options the useful-life picker shows. It never writes a
value. Sentinels like `=0.25*initialCost` resolve against a sibling field at
apply time (the pattern the ROI tool uses for `=40*herd`), and show a guard
message when that sibling is empty.

### No typical value without a citation

See [TYPICAL-VALUES.md](TYPICAL-VALUES.md). Where no source exists, the link does
not appear. Provisional figures are marked `status: 'provisional'` and carry a
caution in the modal. Equipment purchase prices and South Dakota yields and
prices are **deliberately absent**; that file records what each one is blocked
on.

**Aggregates from one report are not always divisible by aggregates from
another.** The overhead figures nearly shipped from FINBIN's whole-farm income
statement divided by its `Total crop acres`, which would have been wrong by a
factor of three: the dollar lines average over all 28 farms while the acreage
line averages over only those that recorded one. It was caught by dividing five
*other* lines the same way and finding seed at $316/acre and land rent at
$516/acre against our own NASS ceiling of $251. **Sanity-check a derived rate
against lines you already know the right answer for**, before trusting the one
you don't. The full account is in TYPICAL-VALUES.md.

**A web-search summary is not a source.** Two searches in one session returned
$3.75/acre and $0.90/acre for the same FINBIN line item, and an earlier one
reported South Dakota *pasture* rents as cropland rents. Every figure shipped so
far was extracted from the primary document by script. Keep it that way.

**`acres` is the one sentinel base that is not a sibling field.** Every other
sentinel (`=0.25*initialCost`) resolves against a field in the same object. The
four overhead specs use `=6.11*acres`, which `totalAcres()` in `ui/modals.js`
sums from every enterprise — overhead is published per acre and entered here as a
whole-farm total, so the multiplier lives across the farm, not beside the field.
Those specs also carry `basis: 'year'`, and applying one moves the line's period
select to match: the figure is annual by construction, and a line left on
"$ / month" would have it multiplied by twelve by `calcFixed()`.

A spec may set `searchPlaceholder` to get a filter box at the top of its picker.
Land rent uses it: 137 counties across three land types is not a list anyone
should have to scroll. The filter matches the option label, hides groups with no
match, and forces open a `<details>` holding one — otherwise a search appears to
find nothing while the row sits inside a closed fold.

### One set of components, two grid arrangements

Desktop (≥900px) lays enterprises out as parallel columns mirroring the
spreadsheet; mobile stacks the same cards as accordions. This is a media query in
`styles.css` and nothing else. **Never fork into separate mobile and desktop
components.**

Three rules in that media query are load-bearing rather than decorative:

- **A folded card is `align-self: flex-start`, never `stretch`.** Stretched, it
  grew to match the tallest open column beside it, so the same folded card was
  90px tall next to a short enterprise and 900px next to a full one — a
  900px-tall box holding two lines of text.
- **Remove stays on a folded card.** A new enterprise arrives folded, so the card
  you are most likely to want rid of was the one you had to open first to reach
  the button. It wraps onto its own line rather than competing with the name for
  the 200px of width.
- **`.fixed-col` is a flex column with a `.col-foot` pinned by `margin-top:
  auto`,** so the readouts at the foot of Land & labor line up with the one at
  the foot of Overhead instead of finishing a field and a half above it.
  `.col-body` wraps the fields for one reason only: as direct flex children their
  9px margins stop collapsing and every field in the block gains a row of space.

- **`--fold-h` on `.ent-grid` is the one number for the row of shut cards.** The
  folded enterprises and the "+ Add enterprise" tile both take it, so the row
  reads as a rank of equal tiles. Change it in one place.

`.sub-title` carries a `min-height` for the same reason as the columns. A `?` is
22px tall and a line of 15px text is not, so "Overhead ?" sat taller than "Land &
labor" and its underline finished a few pixels lower — one rule, visibly not the
same rule. **It is 29px, not 22px**, and that is the whole fix: `*` sets
`box-sizing: border-box`, so `min-height` covers the 5px padding and the 2px rule
as well. At 22px it resolved to 15px of content, under the natural height of both
variants, and did nothing at all. This was shipped once and did not work.

**The fixed block's `.fold-sub` shows only while the block is shut.** Open, the
same total is on the last row of the block a few inches below, and two copies of
one number in one card is a thing to reconcile rather than a thing to read.

**Every editable budget name is sized to its own text.** `sizeNameInputs()` in
`main.js` measures the header name and every `.scn-name-input` against one
off-screen mirror span, and the rows re-measure on each keystroke. `field-sizing:
content` does it natively where supported; the JS covers everywhere else and wins
when both apply. The point on the Saved tab is that the pencil sits at the end of
the *name* and the "open" tag immediately after it — left to flex, the three
scattered across the row and stopped reading as one title with two marks. jsdom
has no layout, so the test can only prove the boxes are measured at all.

**Print strips browser chrome, not just buttons.** The `@media print` block
disables number-input spinners and the select `▾` as well as hiding `.help-btn`,
`.tip` and `.chev`. On screen a spinner says "you can change
this"; on paper it is ink on top of the producer's figures, and a `▾` beside a
value reads as part of it.

**Green means a positive number, not an action.** `.btn-main` (Save, Compare)
takes the logo's blue and `.kpi` takes it on the card's top edge, which leaves
green free to mean money-that-is-there and red money-that-is-not, on the KPI
cards and the sticky bar alike. Those two show the same figures and are styled by
one shared rule: they must never disagree about a colour any more than about a
number.

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
the exported file. Same reasoning keeps it out of `localStorage`. `unitNotices`
lives there too, and is additionally cleared at the end of `render()`: it is a
message about something that just happened, and repeating it on the next
structural render would make it read as a live problem.

**Every enterprise starts folded, at every width.** `applyCollapseDefaults()`
folds all of them, once per budget. Opening a card is a decision to work on that
enterprise and should be the producer's, not a side effect of the budget having
loaded. The width no longer matters: on a phone the alternative is scrolling past
a whole enterprise to reach the second, on a computer it is columns squeezed
narrow to fit contents nobody is reading yet.

**The one exception is a brand-new budget's single enterprise**, which stays
open — there is nothing to choose between, nothing to come back to, and no other
place to begin typing. `scenarioIsNew` tracks that, and is set false wherever a
stored budget becomes the working one: `open-scenario`, `duplicate-scenario`,
file import, and boot when `getLastOpened()` finds something. A duplicate counts
as a farm already built.

A **newly added enterprise also arrives collapsed** (`add-enterprise`), and its
Remove button stays reachable on the folded card for exactly that reason.

### The unsaved flag gates a browser dialog, so it must be honest

`dirty` is what makes `beforeunload` ask *"are you sure you want to leave?"*. The
delegated `input` listener therefore **returns early when the new value equals the
old one** — a focus, a tab, or an arrow key on a number box is not an edit, and
raising the flag over one means asking the producer to confirm losing work they
never did. The stored value may be a number while the input reports a string, so
the comparison is `String(a) === String(b)`. Asserted in `test/app.test.js` under
*only a real change marks a budget unsaved*.

The boot block sits at the **bottom** of `main.js` on purpose: `render()` reads
`const` bindings declared above it (`FORMATTERS`), so booting from the top hits
their temporal dead zone and the app never renders. This was a real bug; the
smoke test catches it.

---

## Tests

446 tests across six files:

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
