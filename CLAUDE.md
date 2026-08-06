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
npm test           # 505 tests: the economic model, storage, data, and a DOM smoke test
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
skipped, never fatal to the list. Currently at **5**; the tests assert against the
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

### The Saved-tab filter, and the two things it is not allowed to do

A filter box sits above the saved list from the **first saved budget onward**,
and is absent only on the empty state, where there is nothing to filter. It was
briefly gated on a row count; a control that materialises partway down a list is
one a producer has to notice arriving, and there was no obvious number for it to
arrive at.

**It filters in place and never calls `render()`.** Same rule `updateOutputs()`
exists for: replacing the DOM under the box being typed into moves the caret and
drops the mobile keyboard. It would also take every compare tick with it, so a
search made mid-selection would silently undo the selection it was helping with.
`applyScenarioFilter()` in `main.js` hides rows, rewrites the hint, and is
re-run at the end of `render()` because the list rebuilds for reasons that have
nothing to do with the filter.

**Matching is on `data-scn-search`, a named field list baked into the row, never
on its rendered text.** The row also prints an acreage and a profit figure, so
matching what is on screen would have "acres" return every budget and a digit
return whichever ones have it somewhere in a dollar amount. `searchText()` reads
enterprise names and crops **off the scenario, not through
`enterpriseLabel()`** — that falls back to "Enterprise 1", and a filter of
"enterprise" matching every budget on the device is worse than no filter.

**Two different years are searchable and they are not interchangeable.**
`scenarioYear` is the crop year the budget is FOR, stated by the producer;
`updatedAt` is when they were last at the keyboard. For a 2027 plan written in
2026 those are different numbers, and both are things somebody reaches for. Both
are printed on the row, so a filter can never match something invisible.

**The saved date contributes its year and month name, never the slashed form the
row prints.** "2026" and "august" are how a producer says a date out loud.
Feeding in "8/5/2026" digit by digit would have a filter of "5" return every
budget touched on the fifth of a month, which is the same spurious-digit problem
one field over.

### `scenarioYear` is stated, never inferred

The crop year a budget is for is a fact about the plan, and **nothing derives it
from a timestamp.** A 2027 budget is routinely built in 2026, so `createdAt` is
evidence of when someone was at the keyboard and no evidence at all of what they
were planning for. It starts blank like every other field (see *Nothing
auto-fills*), with the current year only as a placeholder, and the **v3 → v4
migration deliberately writes nothing** — backfilling from `createdAt` would put
a year on the budget the producer never chose and then let the filter find it
under that year. Asserted in `test/storage.test.js` under *v4 migration*.

It lives in the header with the budget name because it is the same kind of
thing: a label for the whole budget rather than a figure in it. `calc.js`
ignores it entirely.

**`.name-wrap` is a row on a computer and a column on a phone**, which is why
the name has a `.title-row` wrapper of its own rather than sitting directly in
it. On a 360px screen the year beside the title left the name about half the
width, so "Corn, no-till, north quarter" showed as "Corn, no-t". The mobile rule
widens the *row*, not the box: `sizeNameInput()` still sizes the input to its
text, because an empty input spanning the screen reads as a form field you must
fill in, which is the thing that content sizing exists to avoid.

**`.scenario-year` is `8ch` wide and that is not slack.** `*` sets
`box-sizing: border-box`, so the width has to cover the padding and the border
as well as four bold digits. At `5.5ch` it resolved to about thirty pixels of
content and cut the year off. Same failure as `.sub-title`'s `min-height`, one
element over.

**The save state lands in a different place at each width, and it is one element
in one place in the DOM.** Left of the Budget tab on a computer; on the end of
the title row on a phone. It cannot be rendered twice — `updateStatus()` and
`flashSaved()` address it by id — so it is a direct child of `.app-head`,
between the name block and the nav, and the flex rules do the moving:

- **`margin-left: auto` on `.save-state`** collapses the free space *before* it,
  so it and the tabs travel together at the right edge. That also keeps the tabs
  right on the Saved and compare screens, which render no name block at all;
  under `space-between` with one child left, the tabs would drop to the left
  edge and jump sideways every time the producer changed tab.
- **On mobile, `.name-wrap` and `.save-state` both take `align-self: baseline`,
  and both halves are needed.** A baseline group of one is placed at the start
  of its line, so setting it on the save state alone would leave it at the top
  of a 37px title box instead of on the title's line. With `.name-wrap` in the
  group its baseline resolves through `.title-row` to the name input's text, and
  the two align as text. `.name-wrap` is `flex: 1 1 auto` rather than
  `width: 100%` for the same reason: full width would push the save state onto
  its own row.
- **On mobile it is flush with the enterprise card's outer edge**, not with the
  "Remove" link 15px inside it. The header and the cards are both children of
  `<main>` and neither is inset, so those are the same line and a right margin
  of zero is what lands on it.
- **It never moves to a row of its own, and `.name-wrap { flex: 1 1 0 }` on
  mobile is what guarantees that.** The zero is the trick, and no shrink factor
  can substitute for it. **Flexbox breaks lines before it shrinks anything:** an
  item is placed on a line by its *hypothetical* main size, and only once the
  lines exist does shrinking happen. At `flex-basis: auto` the name block's
  hypothetical size is its full content width, so a long budget name plus
  "Unsaved changes" (three times the width of "✓ Saved") overflowed the
  container and the state was pushed down — the decision having been made
  before any shrink factor was consulted. A basis of zero puts both on one line
  always; `flex-grow` then gives the name block whatever the state does not
  need. The **title** absorbs it, by truncating with an ellipsis.
- **`.year-edit` carries `padding-left: 9px` on mobile**, which is
  `.scenario-name`'s 1px transparent border plus its 8px of left padding. The
  caption is not in a box, so without it the year row started 9px left of the
  title above it. Change one, change both.

It is hidden in print: app state, not budget data.

**Reordering is off while a filter is running** (`setReorderEnabled()`, plus a
guard in both drag paths). A manual arrangement is an arrangement of the whole
list, and moving a row while most of it is hidden is an operation whose result
the producer cannot see: ▲ swaps the row past a budget that is not on screen and
appears to do nothing at all. The hint says so, and clearing the box restores
the arrows by recomputing first-and-last from the full row list.

**The filter is cleared whenever the set of saved budgets grows** — on a
successful save, a duplicate, and an import. A newly saved budget arriving
filtered out of sight reads as the save having failed. It is otherwise UI state
like `collapsedEnterprises`: not in the scenario, not in `localStorage`, and it
deliberately survives a render.

**A hidden row keeps its compare tick, and the discrepancy is named on screen.**
"Select two corn budgets, filter to soybeans, select two more" is a real way to
build a comparison, so unticking on hide would destroy work to answer a lookup.
But a comparison quietly containing budgets nobody can see is the failure this
app is careful about, so `refreshCompareButton()` writes a
`[data-scn-hidden-note]` line saying how many of the selected budgets are off
screen.

**`[hidden] { display: none !important }` is load-bearing, and its absence was a
shipped bug.** The browser's own `[hidden]` rule is in the UA stylesheet, and
any author rule setting a display beats it — the cascade ranks author sheets
above UA sheets before specificity is considered. `.scn` is `display: flex` and
`.typ-option` is `display: grid`, so **the land-rent county search had been
setting `hidden` on non-matching options and leaving them all on screen.**
jsdom cannot catch this, because it loads no CSS and `el.hidden` reads true
there whatever the stylesheet says. Pinned by an assertion against the
stylesheet source in `test/app.test.js` under *hiding a row actually hides it*.

### Folders are sections on one page, never a screen you navigate into

Built on the `opal` branch from FOLDERS-PLAN.md, which still holds the long
argument for each decision. Membership is one `folderId` on the budget; the
folders themselves live in their own `sdshc-fb-folders` key.

**There is no "inside a folder".** The decisive reason is Compare:
`compare-selected` reads `[data-compare-id]:checked` off the document, so the
selection lives in the DOM and navigating away throws it out. "Compare my 2025
corn against my 2026 corn" is the most valuable thing the Saved tab does and it
has to keep working across folders. The other two reasons: with every row on one
page the visible top-to-bottom order is still a valid global order, so the
reorder code survives; and folding is the idiom the app already uses everywhere.

**Every invariant is a variation on one rule: an organising feature must never
be able to lose a budget.**

- **`deleteFolder()` never deletes a budget.** Members are un-filed first, and a
  failure there abandons the whole operation with nothing changed. The
  confirmation says so in as many words, including the count. There is no
  cascade delete and no configuration that produces one.
- **The ungrouped pile is built as "everything no section claimed", not
  "everything with no `folderId`".** Those differ in exactly one case and it is
  the one that matters: a budget naming a folder that has been deleted — here, in
  another tab, or by a partial write. Defined this way it lands in the pile and
  is on screen; defined the other way it would belong to a section that is never
  rendered, and it would be gone. `sectionOf()` in `main.js` resolves it the same
  way, because the arrows would otherwise hunt for section-mates in a section
  that is nowhere on screen.
- **A corrupt folders key costs the folders, never the budgets.** They are
  separate localStorage keys precisely so that can be true. `listFolders()`
  returns `[]` on a parse failure and skips individual malformed entries; with no
  folders the Saved tab is the flat list it was before, still holding everything.
- **`icon` and `color` are token keys, never a glyph and never a hex.** A stored
  `#2e7d32` cannot be re-rendered for dark mode. An unrecognised key falls back
  to the plain folder and the neutral swatch — same rule as `perYearFactor()`
  returning 1 for a basis it does not know.

**`moveScenarioToFolder()` is modelled on `renameScenario()`, not
`saveScenario()`** — the Saved tab files a row that may not be the budget open on
the Budget tab. It differs in one way: **it does not bump `updatedAt`.** Filing
is not editing. The date on the row is when the producer last worked on that
farm, so filing never resets it, never disturbs the newest-first fallback, and
never manufactures a save conflict in another tab.

**`saveScenario()` lets the stored `folderId` win, in both directions.** Open a
budget, go to Saved, file it, come back and save: the working copy was read
before the move and would un-file it. The `else delete record.folderId` half is
the same hazard run backwards, after a move *out*. Identical to the trap
`sortIndex` already guards against, one field over.

**`folderId` is stripped on export and on import.** A folder organises one
device's list; an id from another device means nothing here except by an unlucky
collision.

#### What the arrows and the drag each had to change

**▲▼ swap a budget with its neighbour IN ITS OWN SECTION.** `sortIndex` is still
one global rank shared by every budget, so the row above this one on screen can
belong to another folder — trading ranks with it moves nothing anybody can see
and changes neither budget's folder. That is the same "appears to do nothing"
failure that turns reordering off while a filter is running. A swap, not a
splice-move: the two rows trade places and nothing else shifts.

**A shut folder still renders its rows and hides them with CSS, and that is
load-bearing.** `commitOrder()` sends every row on the page as a complete global
order. `reorderScenarios()` appends ids it was not given, so a partial list would
rewrite the rank of every budget the producer cannot see, with nothing on screen
to say so. FOLDERS-PLAN §5 proposes a `mergeVisibleOrder()` for this; it is
**not** needed here, and the only reason is that the rows never leave the DOM. If
a future change stops rendering a shut folder's contents, the bug is back and the
merge becomes mandatory.

**A drop across a section does `moveScenarioToFolder()` first, then the
reorder**, so a failed reorder can never leave a row drawn in a folder it is not
in. A drop *within* a section refreshes in place (compare ticks survive, same
rule as the filter box); a drop *across* one takes the full `render()` — not for
the counts, which update in place perfectly well, but for the drop targets.

**The ungrouped pile is drawn whenever it has members and whenever any folder
exists.** Left to hide when empty it disappeared exactly when every budget had
been filed, taking the drop target for "drag one back out" with it — a shortcut
that works until the moment you need it.

**With no folders at all it gets no heading**, just the rows: "Not in a folder"
over the entire list, with nothing to contrast it against, is a fold to open and
a label answering a question nobody asked, and that is the state most producers
here will be in permanently. The `<section>` and the `.scn-list` stay, so the
drag, filter and reorder code all see the structure they always see — only the
`<header>` is missing, and `.scn-section-bare` drops the indent and left rule
that exist to tie a list to a heading.

**A headless section is always open, and that is a guard rather than a
detail.** `applySectionVisibility()` checks for the class before consulting
`expandedFolders`. Without it: shut the ungrouped pile while a folder exists,
then delete that folder, and the pile returns headless *and* still marked shut —
every budget on the device behind a control that is no longer on the page. Pinned
by *deleting the last folder cannot leave the budgets folded out of sight*.

#### Folders start shut, and the filter has to reach inside them

This is the **opposite of FOLDERS-PLAN §9**, which argued for open. Shut is what
was asked for, and it makes two other things load-bearing:

- **`expandedFolders` is a set of OPEN ids, not closed ones.** With shut as the
  resting state, "not in the set" is the default and a folder the app forgot to
  seed cannot spring open. The ungrouped pile is seeded open at module level
  because it is not a folder: it is where a budget saved a moment ago lands.
- **A filter forces a section holding a match open, and hides one holding
  none.** Without it a search reports nothing while the row sits in a closed
  fold — the exact failure `wireSearch()` already fixed for the land-rent county
  list. None of it touches `expandedFolders`: a search is a question, not a
  decision about how the list should sit, so clearing the box restores the
  producer's own arrangement. The per-folder count is rewritten to "2 of 3
  budgets" for the same reason the hint line is.
- **A budget can now be off screen two ways** — filtered out, or folded away —
  and `refreshCompareButton()` counts both into `[data-scn-hidden-note]`. Folding
  is deliberately *in place*, never a `render()`, so ticks survive it, which is
  what makes the note necessary rather than decorative.

Fold state is UI state, like `collapsedEnterprises`: module-level in `main.js`,
not in the scenario, not in `localStorage`.

#### The palette, and the one colour that is not on offer

**Twelve glyphs and twelve swatches, and the counts must stay equal.** The editor
lays them out as two rows of the same width and they read as a matched pair;
twelve and nine would look like one of them had failed to load. Pinned by a test.

To change either, there is a **header comment at the top of `ui/folders.js`**
that names every place involved. In short: a glyph is one entry in `PATHS` and
one in `ICON_LABELS`; a colour is one entry in `FOLDER_COLORS` and `COLOR_LABELS`
**plus three things in `styles.css`** — the `--fld-<key>` / `--fld-<key>-bg` pair
in `:root`, the same pair under `[data-theme="dark"]`, and a `.fld-c-<key>` class
mapping them onto `--fld-ink` / `--fld-wash`.

**A colour key with no `.fld-c-` class renders with no colour at all** — no
error, no fallback, just a chip the same shade as the card. It is the one failure
in this feature nothing warns you about, so a test walks `FOLDER_COLORS` against
the stylesheet source and asserts all four pieces exist. jsdom loads no CSS, so
that check has nowhere else to live.

Icons are **inline SVG, never emoji** — `prefs.js` already rejected emoji for the
theme toggle, and a row of twelve emoji folder icons across Windows, Android and
iOS is three different-looking apps. They are stroke-only on a 24-unit box and
tinted through `currentColor`, so one glyph carries any colour and there is no
per-colour asset.

The swatches walk the wheel with **pink where red would be**, closing on slate
and grey. Red is the omission and it is not squeamishness: `--green` means a
positive dollar figure and `--cost` a negative one, and a red folder mark on a
page whose every row prints a profit or a loss re-opens the question the palette
exists to settle. A test asserts red is absent under four of its names.

**Every swatch is its own value, the blue and the green included.** They began as
`--sky` and `--olive`, which cost no new tokens but tied a folder's colour to the
app's chrome: a "blue" folder was the same blue as every `?` button and every KPI
edge, an "olive" one the same as every section rule. A folder colour is a label
the producer chose. It should not read as furniture, and it should not move if
the brand ever does.

**The ink is the same in both themes; only the wash flips.** Every other colour
token in `styles.css` has a `[data-theme="dark"]` override, and these twelve
deliberately do not — a producer who made the pink folder should find a pink
folder in either theme, because the colour is a label they chose rather than
part of the furniture. The dark block carries the twelve `-bg` washes and no
inks, and a test asserts the absence rather than trusting it to stay absent.

The constraint that follows: each ink has to carry on a white card **and** on a
dark one, so they run mid-tone rather than the darker shades a light theme alone
would pick. They are stroked glyphs and filled dots with the folder's name in
ordinary text beside them, never text themselves, so a mid-tone reads fine on
both — but change one and check it against both washes.

**Colour appears on the section header and nowhere else.** Tinting fifteen rows
by folder next to fifteen profit figures is the same collision by another route.
And **colour is never the only signal**: the folder's name is always beside it in
ordinary text, so a producer who cannot tell the swatches apart loses decoration
and no information — which is the whole test of whether colour was doing a job it
should not have been.

**The fold caret is drawn, never typed.** `.chev` builds it from two borders of a
box rotated 45 degrees, so the span takes **no text** — a `▾` placed inside it as
well renders a second caret about twice the size underneath the real one, which
shipped once and read as a broken font. Which way it points comes off
`aria-expanded` in CSS, so there is one source of truth and nothing for JS to
keep in step. ### A backtick in an HTML comment ends the template literal it sits in

Every screen here is a template literal, and the comments explaining the awkward
bits are HTML comments *inside* those literals. A backtick in one closes the
literal early and everything after it is parsed as JavaScript. This has taken the
whole saved list down twice — once from a comment about `.chev`, once from a
comment about `.block-head` — and both times the smoke tests caught it as a
hundred and twenty failures saying nothing about the cause.

`no HTML comment carries a backtick` in `test/app.test.js` scans every module in
`src/` and `src/ui/` and names it instead. Say it without the backticks, or put
the comment in JS above the template.

#### Move is offered only once there is somewhere to move to

A deliberate departure from FOLDERS-PLAN §6, which put the button on every row
unconditionally. Most producers here keep three to eight budgets and will never
make a folder, and a fourth button on every row opening a modal that offers only
"Not in a folder" costs all of them and pays none. The first folder is made from
"+ New folder" in the header; from then on every filing is one trip, because the
Move modal carries its own `+ New folder…` that creates and selects in one pass.

**A shut folder prints expanded.** `@media print` sets `.scn-list[hidden] {
display: grid !important }`, which has to out-specify the global `[hidden] {
display: none !important }` — both author-origin and both `!important`, so it is
decided on specificity, (0,2,0) against (0,1,0). Dropping either the attribute
selector or the `!important` puts the folds back on paper. It is scoped to
`.scn-list` on purpose: a row hidden by the *filter* stays hidden, where the hint
line reads "Showing 3 of 12 budgets" and is the only thing explaining why nine
are missing.

### Dragging a row has to look like dragging a row

Two problems, and neither was the drag logic being wrong.

**The lifted row did not move.** It stayed exactly where it was until the finger
crossed a neighbour's midpoint and then teleported a whole row, so the one thing
on screen not moving was the thing being dragged — and a gesture that has not
taken yet is indistinguishable from one that failed. `.scn.dragging` now carries
`transform: translateY(var(--lift)) …`, and `main.js` writes nothing but the
number. What a lifted row *looks* like stays in CSS with the border and the
shadow it belongs with. It is never transitioned: the lift **is** the finger's
position, so easing it puts the row behind the finger by the length of the ease.
`--lift` stays 0 on the mouse path, where the browser draws its own drag image
and translating the original as well would show the row in two places.

**Everything else teleported too.** Reordering is a DOM move and a DOM move
cannot be transitioned — the browser lays out the new order in one frame. So
`slideRows()` does FLIP: measure every row, do the move, measure again, put each
shifted row back where it was with a transform, force one reflow for the whole
batch, then clear the transforms and let CSS carry them. The layout still happens
once; what the eye follows is a compositor animation of a transform, which is the
one thing a phone animates at frame rate without touching layout. **The
transition lives on `.scn-list.dragging-active .scn:not(.dragging)`** — without
it, `slideRows()` sets an offset and clears it in the same frame, which is an
expensive way to draw nothing.

**`pointermove` is coalesced to one update per frame.** A 120Hz panel reports at
120Hz, and the old code did a hit test, a `getBoundingClientRect` and a DOM
insertion on every event — several forced layouts per frame, on the device least
able to afford them. The handler now records a coordinate; `dragFrame()` does the
work. `endTouchDrag()` cancels any pending frame and runs it **synchronously**
first, because the finger's last position before it lifted is usually the one
that decides where the row lands.

**A long list scrolls under the drag.** Without it a budget can only be moved as
far as the screen already shows, and getting one from the bottom of thirty to the
top means drop, scroll, pick up, repeat — not a worse version of dragging but a
different and much worse operation. `edgeScroll()` ramps the speed with how far
into the 76px margin the finger is, so resting just inside it creeps and pushing
to the very edge moves quickly; a fixed speed makes the only usable choice a slow
one. Two details are load-bearing:

- **It returns what the page ACTUALLY scrolled, not what was asked for.** At the
  top or bottom of the document it moves less than requested, or not at all, and
  `grabY` is corrected by the real figure — otherwise the row drifts away from
  the finger every frame the page refuses to move.
- **It does not start until the finger has moved.** Rows are picked up near the
  bottom of the screen all the time, because that is where the end of a list is,
  and a grab that starts scrolling before the producer has moved at all reads as
  the app taking the gesture away from them.

Only the touch path needs it: native HTML5 drag-and-drop scrolls at the edges by
itself, so the mouse has had this all along.

**This is why the frame loop runs for the whole gesture** rather than being
scheduled by movement. A held finger fires no events, and auto-scroll has to keep
happening while it sits still. The loop skips its own work when neither the
pointer nor the scroll position has changed since the last frame, so a stationary
finger does not pay for a hit test sixty times a second.

Two consequences worth knowing before touching this again. **`view()` reads the
window through `app.ownerDocument.defaultView`**, not off `globalThis` — booted
into a synthetic document the window globals are not aliased, so
`globalThis.innerHeight` is `undefined` and every viewport measurement silently
answers zero. Same reason `sizeNameInput()` does it. And **a drag left open keeps
Node alive**: the loop reschedules itself, so a test that throws mid-gesture hung
the whole suite for five minutes. `boot()` now calls `dom.window.close()` on the
previous DOM, and `tick` stops itself if the row is no longer connected.

`dragFrame()` also re-bases `grabY` after a reinsertion. The row's layout box has
just moved by a full row height, and the lift is measured from where the finger
grabbed it — without the correction the row jumps by exactly that amount at the
one instant it most needs to look continuous.

**The lift broke the hit test, and the fix is not optional.** Once the row
follows the finger at `z-index: 2` it is the topmost element at those coordinates
*every time*, so `document.elementFromPoint()` answers "the row you are already
dragging", the target search returns early, and the drop lands the row exactly
where it started. `dragFrame()` therefore sets `pointer-events: none` on the row
around that one call and restores it immediately — toggled in JS rather than set
in CSS, because `setPointerCapture` here is best-effort (it is in a `try`) and a
row permanently transparent to pointers would end the gesture whenever capture
was refused.

This shipped once, and the reason the tests missed it is worth keeping: jsdom has
no layout, so `elementFromPoint` is supplied by the test, and a stub that always
names some *other* row cannot fail the way a browser does. It now returns the
dragged row unless `pointer-events` says otherwise, which makes the test go red
if the toggle is removed.

### The saved list is a table, not a stack of cards

Rows were mostly padding around controls. Every figure a producer scans down —
acreage, profit, the year — compares better when the rows are close enough to
read as a column, so `.scn` padding, `.scn-main` gap, the name box's height and
the meta line all came in, and the compare tick went from 22px to 18px (a tick in
a column of ticks, not a form control; the label around it keeps the tap target
the full height of the row).

**`.scn-order` stays at the far left, beside the tick, at every width.** It was
briefly moved onto the actions line with `order: 3` to buy height back; it saved
about thirty pixels and cost the row its shape, because the handle you grab to
move a row belongs at the edge you drag from and not in among four text links.
Being the first flex child is also what stops it wrapping at all.

The height comes out of the controls instead: on touch the arrows are **44 wide
by 30 tall**, not 44 square. Width is what a thumb misses on, so width is what is
kept, and 30px is still comfortably past the 24px minimum.

**On mobile the row is a GRID, and that is what centres the handle.** Under
`flex-wrap` the controls were centred on their own wrapped line — the one holding
the tick and the name — which sat noticeably above the middle of a row whose
actions were on a second line below. As a two-row grid the column spans both, so
`align-items: center` centres it on the whole row, which is where a thumb
reaching for the handle expects it:

```
"order pick main"
"order pick btns"
```

**Both left-hand columns span both rows**, so the tick centres the same way the
handle does — they are the two things a finger goes for without reading. The
actions sit under the name rather than under the tick as well, which lines them
up with the text they belong to; they are right-aligned either way, so the far
end does not move. The grid also removes the guesswork the flex version needed:
the column no longer has to be shorter than the content to avoid setting the
row's height, because grid rows grow to whichever is taller.

**The handle gets more room than either arrow, and 8px of clear space either
side.** It is the one control aimed at with a *moving* thumb rather than a
settled one, and it was the smallest. The gap matters more than the size: a
missed grip that finds nothing is a gesture that did not start, where a missed
grip that finds ▲ is a reorder the producer never asked for.

Mobile also steps the type down — the name to 14px, the meta line to 11.5px, the
row's links to 11.5px — with the name still bold and still the largest thing on
the row, so the hierarchy is unchanged and every line takes less room. **The
links get vertical padding as they shrink**, which is not decoration: `.tip`
ships with `padding: 2px 0 0`, so its tap target is its text and nothing else,
and taking the type down without that would have left about fourteen pixels of
height on the control that deletes a budget.

**The folder heading carries a 2px rule in the folder's own colour**, the full
width of the row. The chip is 26px of colour and easy to miss down a long list; a
rule under the whole heading is what actually separates one section from the next
when several are open. It reads `--fld-ink` off the `.fld-c-*` class on the
section, and the ungrouped pile has no folder and therefore no class, so it falls
back to the plain border — which is right, since giving it a colour would make it
look like one more folder. Same 2px idiom as `.sub-title`, so a folder heading
and a card heading read as the same kind of thing.

**The folder header is one row too, `flex-wrap: nowrap`.** Edit and the ▲▼ belong
*to* the heading they sit on; dropped onto a line of their own they read as
controls for the budgets underneath, which is the one thing they are not. The
folder name is what gives way, truncating with an ellipsis — the count keeps its
width, which falls out of `flex: 0 0 auto` and is also right, since "2 budgets"
never grows and a folder name has no upper bound.

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

505 tests across six files:

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
  reordering, the unit-aware typical-value picker, the Saved-tab filter, and
  folders. `boot()` takes an optional seed callback that runs against the empty
  store just before `main.js` is imported — the only way to reach a state the app
  cannot be driven into from its own boot, which is what a folder created in a
  *previous* session is, and that is the one that starts shut.
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
