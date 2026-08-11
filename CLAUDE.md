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

## How it runs

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 747 tests: the economic model, storage, data, and a DOM smoke test
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

## Where the detail lives

**This file is the rules.** The reasoning behind each one, the failure it came
from, and the detail you need before changing it live in three companion docs.
Read the matching section there before touching what a rule covers — a rule with
its reason removed is a rule somebody will "simplify" away.

- **[DESIGN-NOTES.md](DESIGN-NOTES.md)** — long form for every section below
  that says *see DESIGN-NOTES*, plus the six **deliberate divergences from the
  spreadsheet**, which are still asserted in `test/calc.test.js` and pointed at
  from `src/ui/results.js`.
- **[FOLDERS-PLAN.md](FOLDERS-PLAN.md)** — folders on the Saved tab: the plan,
  and §15 the built record.
- **[TYPICAL-VALUES.md](TYPICAL-VALUES.md)** — provenance for every shipped
  figure, and what was deliberately not shipped.

---

## Critical contracts

### `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. It is the only place economics live,
and its purity is the only reason the model can be tested against the spreadsheet
independently of the UI. **Do not add a DOM reference here**, however convenient.

Every rule below came from a bug that **inflated a producer's profit** with an
ordinary-looking figure on screen. *See [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **Every arithmetic result must pass through `num()`, `finite()` or
  `safeDiv()`.** Two finite inputs can multiply past `Number.MAX_VALUE`, and the
  `Infinity` spreads until it meets `× 0` and renders as "NaN" on a producer's
  screen. An overflow collapses to 0.
- **`num()` rejects `Infinity` as well as `NaN`** — `Number(x) || 0` lets it
  through — and strips `$`, spaces and thousands separators.
- **`safeDiv()` only guards a divisor of exactly zero.** Negative divisors pass
  straight through, which is why depreciation clamps with
  `usefulLife > 0 ? usefulLife : 0`.
- **Every cost and rate goes through `nonNegative(value, label, warnings)`.** A
  finite number is not a correct one: a "-7" typed for a 7% interest rate is
  *subtracted* from fixed costs. Every finiteness assertion in
  `calc-adversarial.test.js` passes straight over this.
- **Two deliberate exceptions**, both warned about and both left alone: negative
  acres, and salvage above initial cost.
- **"Every" includes the three preharvest-interest fields**, which it did not
  until a review caught them: `rate`, `months`, and `manualPerAcre`. That figure
  is *added* to total variable costs, so a negative one is a credit. See
  DESIGN-NOTES.

The invariant the tests assert is *not* "profit can never rise" — treating a typo
as $0 removes a real cost, so it can. It is that **a negative figure is worth the
same as zero, never handed back as a credit.**

### Adding an input means touching three places

Markup (`src/ui/*.js`) → the scenario shape (`src/state.js` factories) →
`src/calc.js`. Inputs declare `data-path="enterprises.0.variable.seed.costPerUnit"`
and one delegated listener in `main.js` writes by path, so a new field needs no
new handler — but it does need to exist in the state factory and be consumed by
the model.

**A new expense-line entry MODE is four places**, because the mode decides which
inputs exist: `VARIABLE_LINES[].modes` in `calc.js` (which lines offer it) →
`linePerAcre()` (what it resolves to) → `MODE_LABELS` and `lineInputs()` in
`ui/enterprise.js` (its segment and its boxes) → `blankVariableLines()` in
`state.js` (its keys). Add a `warnHalfFilled()` branch too if the mode has more
than one box, or it can read $0 with no way to see which one is empty.

### Entry conveniences must not change an answer

Four fields let a producer enter a figure the way they actually know it. All are
deliberately **presentational**: they resolve on the way into the model and
change no answer. *Why each one exists, in [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **v2** — `fixed.labor.hours` + `hoursBasis` (a **new** budget starts on
  **week**; the v1 → v2 migration writes `year` onto old ones, which stored an
  annual figure), and `fixed.annual.<key>` + `fixed.annualBasis.<key>`.
  `perYearFactor()` resolves the basis and **an unrecognised basis falls back to
  a multiplier of 1, never 0** — a hand-edited file must not silently erase a
  real cost.
- **v6** — `seed` gains **`population`** mode
  (`costPerBag × population ÷ seedsPerBag`, with seeds-per-unit a field rather
  than a constant because seed is quoted both ways), and `cropInsurance` gains
  **`total`** mode, divided by **this enterprise's acres, not the farm's**. That
  is why `linePerAcre(line, acres)` takes a second parameter; it is optional, so
  pre-existing callers are unaffected.

**Which modes a line offers is declared on the line** in `VARIABLE_LINES`, read
through `lineModes()`, and enforced by **`resolveMode()`** — which catches a mode
nothing recognises *and* a mode this app knows that THAT LINE does not offer. The
second is the dangerous one: the branch would run, read a field the UI never
writes for that line, and return **$0 while a good `costPerUnit × unitsPerAcre`
sat in the record unread.** Both fall back to `$/unit × units/acre`, never to
zero. `warnHalfFilled()` checks the **resolved** mode for the same reason.

**`total` mode is the one place negative acres are NOT allowed through** — the
divisor is a *quantity* rather than a rate, so it would hand a cost back as a
credit. `safeDiv()` guards both new modes.

`calcFixed()` still reads the pre-v2 `fixed.labor.totalHoursPerYear`, so a budget
arriving from an old exported file calculates correctly before `migrate()`
touches it.

### An enterprise's name is separate from its crop

`enterpriseLabel(ent, index)` in `calc.js` resolves `name || crop || "Enterprise
N"`. They are separate because comparing tillage systems means two enterprises
both growing corn, and "Corn" twice tells a producer nothing. The crop is the
fallback, so a v1 budget reads exactly as it did — `migrate()` sets `name` to
`''`, never copying the crop into it.

### `schemaVersion` and migrations

Producers have saved work in their own browsers. When the scenario shape changes:
bump `SCHEMA_VERSION` in `calc.js` **and** add a step to `migrate()` in
`src/storage.js`. **Never drop a scenario because it is old.** One corrupt record
is skipped, never fatal to the list. Currently at **6**, and the tests assert
against the exported constant rather than a literal.

**A step that writes nothing is still a step worth adding** — see v2 → v3, where
the absence of the new key is the correct state and backfilling it would be
destructive.

**`storage.js` never throws** — every failure path returns `{ok: false, error}`,
so a full or blocked store is reported rather than swallowed.

**Three writes deliberately bypass `saveScenario()`**, all for one reason: the
Saved tab acts on a row that may not be the budget open on the Budget tab, so
writing the whole working scenario over it would carry unsaved edits with it.
*Detail in [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **`renameScenario(id, name)`** — inline rename, autosaved.
- **`reorderScenarios(ids)`** — assigns `sortIndex`; ids it was not given keep
  their place and are appended, so a reorder can never lose a budget.
  `listScenarios()` falls back to newest-first.
- **`moveScenarioToFolder()`** — see [FOLDERS-PLAN.md](FOLDERS-PLAN.md) §15.

`duplicateScenario()` deletes `sortIndex`. A save returns `{error: 'Conflict'}`
when the stored record has moved on since this tab read it (`lastKnownUpdatedAt`);
`main.js` asks the producer before overwriting, and `{force: true}` proceeds.

### The Saved-tab filter, and the two things it is not allowed to do

A filter box sits above the saved list from the **first saved budget onward**,
absent only on the empty state. *Full reasoning in
[DESIGN-NOTES.md](DESIGN-NOTES.md).*

**It filters in place and never calls `render()`.** Same rule `updateOutputs()`
exists for — replacing the DOM under the box being typed into moves the caret and
drops the mobile keyboard — and it would take every compare tick with it.
`applyScenarioFilter()` in `main.js` hides rows, rewrites the hint, and is re-run
at the end of `render()`.

**It rewrites `[data-scn-hint-text]`, not `[data-scn-hint]`.** The hint paragraph
ends with the *upload a budget file* offer, which sits **outside** the span the
filter rewrites; setting `textContent` on the paragraph would delete a control on
the first character typed.

**Matching is on `data-scn-search`, a named field list baked into the row, never
on its rendered text.** The row prints an acreage and a profit, so matching what
is on screen would have a digit return half the list. `searchText()` reads
enterprise names and crops **off the scenario, not through `enterpriseLabel()`**,
which falls back to "Enterprise 1". **Both years are searchable and are not
interchangeable** — `scenarioYear` is the crop year the budget is FOR,
`updatedAt` is when they were last at the keyboard — and the saved date
contributes its **year and month name**, never the slashed form the row prints.

Three consequences:

- **Reordering is off while a filter is running** (`setReorderEnabled()`, plus a
  guard in both drag paths). Moving a row past budgets nobody can see appears to
  do nothing at all.
- **The filter is cleared whenever the set of saved budgets grows** — a save, a
  duplicate, an import. A new budget arriving filtered out of sight reads as the
  save having failed. Otherwise it is UI state and survives a render.
- **A hidden row keeps its compare tick**, and `refreshCompareButton()` writes a
  `[data-scn-hidden-note]` line saying how many selected budgets are off screen.

**`[hidden] { display: none !important }` is load-bearing, and its absence was a
shipped bug.** Any author rule setting a display beats the UA stylesheet's
`[hidden]`, and `.scn` is `display: flex` while `.typ-option` is `display: grid`
— so the land-rent county search had never actually hidden anything. jsdom loads
no CSS and cannot catch it; a stylesheet-source assertion does.

### `scenarioYear` is stated, never inferred

The crop year a budget is for is a fact about the plan, and **nothing derives it
from a timestamp** — a 2027 budget is routinely built in 2026, so `createdAt` is
evidence of when someone was at the keyboard and none at all of what they were
planning for. It starts blank like every other field (see *Nothing auto-fills*),
with the current year as a placeholder only, and the **v3 → v4 migration
deliberately writes nothing**: backfilling would put a year on the budget the
producer never chose and then let the filter find it under that year. Asserted in
`test/storage.test.js`.

It lives in the header with the budget name because it is the same kind of thing:
a label for the whole budget rather than a figure in it. `calc.js` ignores it
entirely. The layout rules that follow — `.name-wrap`, `.scenario-year` at `8ch`,
`.year-edit`'s 9px, and the save state's move into the sticky bar — are in
[DESIGN-NOTES.md](DESIGN-NOTES.md).

### Folders are sections on one page, never a screen you navigate into

**Full detail is [FOLDERS-PLAN.md](FOLDERS-PLAN.md) §15** — every invariant, the
drag and arrow behaviour, the palette, and why each one is the way it is. Read it
before changing anything here. The rules that must not be broken by accident:

- Membership is one `folderId` on the budget; the folders live in their own
  `sdshc-fb-folders` key. `icon` and `color` are **token keys**, never a glyph
  and never a hex, and an unrecognised key falls back rather than failing.
- **There is no "inside a folder".** Compare reads `[data-compare-id]:checked`
  off the document, so the selection lives in the DOM and navigating away would
  throw it out.
- **An organising feature must never be able to lose a budget.**
  `deleteFolder()` un-files its members and deletes none of them; the ungrouped
  pile is *"everything no section claimed"*, so a budget naming a deleted folder
  still lands on screen; a corrupt folders key costs the folders, never the
  budgets.
- **A shut folder still renders its rows and hides them with CSS.**
  `commitOrder()` sends every row on the page as one complete global order, so
  dropping those rows would silently rewrite the rank of every budget nobody can
  see.
- **▲▼ swap with the neighbour in the same SECTION**, never the row above on
  screen. A drop across a section files first, then reorders.
- **Hovering a shut folder during a drag OPENS it** (`springOpenSection()`, both
  drag paths). A shut section hides its rows, so nothing could be dragged into
  one — and folders start shut. It opens only, never shuts: taking a drop target
  away under a held finger is its own bug.
- **Arriving at the Saved tab opens exactly one section: the one holding the
  budget that is open on the Budget tab.** `revealScenarioFolder()` clears
  `expandedFolders` and adds that one, on **every arrival** — `go-scenarios`,
  `back-to-scenarios`, and boot. **The ungrouped pile is shut with the rest**,
  and is opened by the same rule when the budget is in no folder, so `''` is a
  section id here like any other. `folderId` is read off the **stored** record,
  not the working copy, which can predate a filing. **Never from inside
  `render()`**: a delete or a reorder re-renders the list, and every section the
  producer had opened would collapse under them without their leaving the page.
- **Folders otherwise start shut**, including on a first visit with nothing
  saved, where `expandedFolders` is seeded with `''` alone.
- `expandedFolders` is a set of OPEN ids, and a filter forces a section holding
  a match open without touching it. Fold state is UI state: module-level in
  `main.js`, not in the scenario, not in `localStorage`.
- `moveScenarioToFolder()` is modelled on `renameScenario()` and **does not bump
  `updatedAt`** — filing is not editing. `saveScenario()` lets the stored
  `folderId` win. `folderId` is stripped on export and on import.
- Twelve glyphs and twelve swatches, counts equal, and **no red** — red means a
  loss on every row of this page. A colour needs four pieces or it renders with
  no colour at all and no error; the header comment in `ui/folders.js` names
  them.

### A backtick in an HTML comment ends the template literal it sits in

Every screen here is a template literal, and the comments explaining the awkward
bits are HTML comments *inside* those literals. A backtick in one closes the
literal early and everything after it is parsed as JavaScript. This has taken the
whole saved list down twice, and both times the smoke tests reported it as a
hundred and twenty failures saying nothing about the cause.

`no HTML comment carries a backtick` in `test/app.test.js` scans every module in
`src/` and `src/ui/` and names it instead. Say it without the backticks, or put
the comment in JS above the template.

### Dragging a row has to look like dragging a row

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- `.scn.dragging` carries `transform: translateY(var(--lift))` and `main.js`
  writes nothing but the number. **Never transition it** — the lift *is* the
  finger's position. `--lift` stays 0 on the mouse path.
- `slideRows()` does FLIP so a DOM reorder animates; the transition lives on
  `.scn-list.dragging-active .scn:not(.dragging)`.
- `pointermove` only records a coordinate; `dragFrame()` does the work, once per
  frame. The loop runs for the **whole gesture**, because a held finger fires no
  events and `edgeScroll()` has to keep going.
- `edgeScroll()` corrects `grabY` by what the page **actually** scrolled, and
  does not start until the finger has moved.
- `dragFrame()` sets `pointer-events: none` around its one
  `elementFromPoint()` call. Without it the lifted row is always the hit and
  every drop lands where it started.
- `view()` reads the window off `app.ownerDocument.defaultView`, never
  `globalThis`. A drag left open keeps Node alive, so `tick` stops itself once
  the row is disconnected.

### The saved list is a table, not a stack of cards

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* Rows are tight enough that a column of
figures reads as a column. `.scn-order` stays at the far left beside the tick at
every width; on touch the arrows are **44 wide by 30 tall** and the handle gets
more room than either, with 8px of clear space. On mobile the row is a **grid**,
both left-hand columns spanning both rows, which is what centres the handle and
the tick on the whole row. The folder heading is one `nowrap` row with a 2px rule
in the folder's own ink.

### Reordering is implemented twice, and has to be

HTML5 drag-and-drop does not exist on touch, so `main.js` carries a
`dragstart`/`dragover`/`dragend` path for a mouse and a
`pointerdown`/`pointermove`/`pointerup` path for touch, gated on
`e.pointerType === 'mouse'`. Both finish through `commitOrder()`.

**`touch-action: none` on `.scn-grip` is load-bearing** — a touch the browser may
read as a scroll fires `pointercancel` and cannot be claimed back. It must be
declared up front, scoped to the handle, with `preventDefault()` on
`pointerdown`. A captured pointer reports the handle as its target, so the row
under the finger comes from `document.elementFromPoint()`, which jsdom supplies.

**The arrows are the primary control** — keyboard, screen reader, unsteady hand —
and keep the full 44px on touch. The handle is the shortcut, visible on touch too.

### The entry-mode control is a pill, and every option is on it

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* `modePill()` in `ui/fields.js` emits one
pill of `.mode-seg` buttons; the preharvest toggle uses the same component.

- **Every segment carries the same `data-path` and its own `data-mode`**, so a
  test must name the one it wants: `[data-path="…"][data-mode="perAcre"]`.
- **`--pill-h: 23px` is declared, not derived.** Change the type size, change it.
- **The active segment is the `--olive-soft` WASH with `--on-olive`**, never
  `--on-sky` (white on olive is unreadable). Both flip in the dark block.
- **Labels are the short forms** (`$/ac`, `seeds/ac`) and `MODE_NAMES` in
  `ui/modals.js` must say the same words, because a mismatch warning reads from
  it.

### A money box keeps its unit after the placeholder goes

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* `moneyBox()` in `ui/enterprise.js` wraps
the input in `.in-box` with a `$` before and the unit after.

- **The affixes are revealed by CSS off `:placeholder-shown`**, never by JS.
  Nothing runs on a keystroke but `updateOutputs()`, and an affix arriving a
  render late is worse than none.
- **They must match `.affix` on the fixed-cost fields exactly** — 14px,
  `--muted`, `left: 10px` / `right: 10px`, 24px and 44px of input padding.
  **Change one pair, change the other**; a stylesheet-source test asserts it.
- `.in-box` is the flex child now, not the input, which is why
  `.line-input.narrow` has to keep its own rule after `.line-input`.
- **A `$` goes on money and nothing else.** Counts take the trailing `/ac` only.
- The placeholder spells `$/acre` out and the affix abbreviates to `/ac`. Both
  are deliberate and both are asserted.
- Dark mode sets `color-scheme: dark` on `input[type="number"]` so the browser's
  own spinners are drawn dark.
- **`seeds/ac` mode breaks its row where it is told to**, not where flex-wrap
  runs out. `.line-break` is a full-width flex item of no height, emitted before
  the `÷`, so seeds-per-unit and its divisor get a row wide enough for six
  digits and a `/bag` affix. `height: 0`, never `display: none`, which would
  take it out of the layout and the break with it.

### A `$/unit` line needs both of its boxes, and says so twice

A filled box times a blank one is $0 on a line that looks filled in, and nothing
about $0 says which box is empty. `warnHalfFilled()` in `calc.js` names the
enterprise, the line, and **which direction the gap runs**, on every recompute,
covering `population` (three factors) and `total` (a premium with no acres) too.

- **A line with nothing in it is never warned about** — twelve untouched rows are
  the ordinary state of a new budget.
- **An explicit `0` is an answer, not a blank** (`isBlank()` distinguishes them).
- **Nor is a line whose only filled box the APP filled**: the `population` branch
  discounts a `seedsPerBag` carrying `seedsPerBagAuto`, and takes the marker
  **and** a value, never the marker alone.

### The typical-value picker knows its units

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* Each spec declares
`appliesTo: 'perAcre' | 'unit'`; writing a $/bushel figure into a $/acre box is
wrong by a factor of the yield with an ordinary-looking number on screen.

- On a mismatch `openTypical()` says so and, when an option is chosen, switches
  the line's mode *and* writes the correct field. That is structural, so it
  announces `fb:rerender` on `document` — with the `CustomEvent` constructor
  taken from `document.defaultView`, never the global.
- **A spec may declare `unit` and `appliesTo` PER GROUP.** When it does,
  `destination` and `needsMode` are resolved at **click** time from the option's
  own group, the mismatch warning renders per group, and `.modal-unit` is
  replaced by a per-group `.typ-group-unit`. A group overriding `unit` **must**
  also declare `appliesTo`.
- **A figure is not always a mismatch just because the modes differ.**
  `switchesMode()` exempts exactly one pair — a `unit` list against a
  `population` line — because `costPerBag` and `costPerUnit` hold the SAME
  quantity, and switching would hide a population already entered. The exemption
  is that narrow on purpose; the same spec's `$/acre` groups still switch.
- **A message the picker raises lives in `.modal-head`**, which does not scroll,
  and is cleared by `openModal()`. At the foot of the body it was written where
  the producer was not looking. **It is said there and nowhere else** —
  `spec.requires.message` used to be rendered at the top of the body too, so the
  same sentence was on screen twice about the same tap.
- **`markQuotedUnitLabel()` names BOTH labels on a `$/unit` row** from the chosen
  GROUP's unit — the cost box's affix (`/lb`) and the units box's placeholder
  (`lb/acre`). They are one sentence and must never disagree, so `unitLabels()`
  in `ui/enterprise.js` owns both. Cosmetic, unlike the other three markers.
- **`applyUnitLabels()` writes them in place, both ways.** Choosing in the mode
  the line is already in does not re-render, and the release runs on a keystroke
  — so clearing the marker alone left the old noun on screen describing a cost
  the producer had just overwritten.
- `modeName()` names all four modes.
- **A sentinel is a share of a sibling; `*acres` is a rate.** `=0.25*initialCost`
  prints "25%", `=6.11*acres` must print money, not "611%".

### A figure quoted per bushel stops being that figure when the unit changes

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* Two provenance markers exist so the app
can tell its own writes from a producer's:

- **`typicalYieldUnit`** on the line, written by `markQuotedUnit()` from a spec's
  `quotedPerYieldUnit`. `dropStaleTypicalValues()` in `main.js` clears the figure
  when the enterprise's `yieldUnit` moves off it, and says so.
- **`fixed.annualTypicalBasis.<key>`** beside `fixed.annualBasis.<key>` — what
  the figure was published for, against what the line is set to. Two paths, not
  one; the difference between them is the entire signal.
  `dropStaleOverheadValue()` clears the line when they disagree.

**Only figures the picker wrote are cleared.** A typed number carries no marker
and is never touched. The notices live in `unitNotices` / `fixedNotice` in
`main.js`, are cleared at the end of the render that shows them, and are removed
from the DOM on `focusin` of a field they name.

> **A marker MUST be released wherever the value changes by anything other than
> the app's own write**, or the app revises work that is not its own and explains
> it with a sentence that is false of the number it just deleted. All three
> markers leaked this way until a review caught them; `seedsPerBagAuto` also
> needed releasing in `applyValue()`, because a programmatic `.value` write fires
> no `input` event. See DESIGN-NOTES.

### Exports are handed to other people

`csvCell()` in `export.js` does RFC-4180 quoting **and** neutralises formulas: a
cell of *text* starting `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe.
Names are free text and all three major spreadsheets execute such a cell on open.

**Numbers are deliberately exempt** — the guard tests `typeof value !== 'number'`,
not the leading character, because a negative profit must stay a summable number
for the formulas the recipient writes. Both halves are asserted.

`compareToCSV()` imports `COMPARE_ROWS` from `ui/scenarios.js` rather than
keeping a second copy. Differences get **their own column**, never a merged
`value (+123)` cell.

### `?` explains, `use typical value` acts — never merge them

- Round `?` (`.help-btn`, `data-info`) → `openInfo()`. **Read-only.** Tapping it
  must never change a producer's number.
- Text link `use typical value` (`.tip`, `data-typical`) → `openTypical()`.
  Writes exactly one field.

**A modal opens folded, in the typical-value picker too.** A card `?` opening
more than one definition renders each as a closed `<details>`; **a single
definition is never folded.** Both controls live in the **label row**, never
under the input, which would read as a caption for the next field down and add a
row of height to every field that has one. All asserted in `test/app.test.js`.

### Where the data lives is stated, not only linked

The app says in **three places** that nothing leaves the device: a sentence in
the footer of every screen (`.footer-privacy`), a `privacy` definition behind the
*Read more* link, and a how-to section *Where your budgets live*. The footer
sentence survives printing; the link does not.

This documents the current build, not a promise about the next one. **If anything
is ever sent anywhere, these three change first** — see *Not built yet*.

### Prose style in every modal, hint and definition

`data/definitions.js` carries the rule at the top of the file and `data/howto.js`
follows it: say what the thing is, how it is calculated, then a worked number.
**No em-dashes**, no hedging openers, no editorialising, and **no source
citations in the prose** — a source belongs in a spec's `source` field and in
TYPICAL-VALUES.md, carried in tests as a `table: '1a' | '1b'` flag.

**The serial comma is required** on any list ending in "and" or "or". A list with
no final conjunction is a different construction and takes no extra comma.

**The app does not mention the spreadsheet at all** — not on screen, in a modal,
in the guide, in an export, or in README.md. The cell references in `calc.js`
comments stay; nobody reads them but us. (One apparent exception, the
insecticide options naming a state, is explained in
[DESIGN-NOTES.md](DESIGN-NOTES.md) and asserted both ways.)

### Nothing auto-fills, with one exception that is guarded rather than trusted

*See [DESIGN-NOTES.md](DESIGN-NOTES.md).* Every field starts blank. An equipment
name matches a `category`, which **only** filters which options a picker shows,
and never writes a value.

**The exception is `variable.seed.seedsPerBag`, filled from the Crop field.** It
is the only one; do not let it become a precedent for a second. Every guard hangs
off the `seedsPerBagAuto` marker, which records that the **app** put the number
there — the same idiom as `typicalYieldUnit`:

- **acts on `change`, not on every keystroke** — the producer leaves the box
  first, or the card is rebuilt under somebody typing "Corn silage";
- **and the render is deferred one turn of the loop** (`deferRender()`), because
  `change` fires during the blur a CLICK causes: a synchronous render there
  detaches the element being pressed and **the click never lands**;
- writes **only an empty box, or one the app itself last wrote**;
- **typing in the box drops the marker**, without a `render()`;
- **no match, no write** — `matchCrop()` is stricter than `matchCategory()`;
- **an unrecognised crop clears what we put there**;
- **a caption explains the figure while the marker is set**, and stops once the
  producer takes the box over.

A matched crop **also opens `seeds/ac` mode**, but `openPopulationMode()` does it
only on a line nobody has typed in. The `seeds per unit for my crop` offer is
rendered **twice, one copy per width**, the hidden one `display: none` so exactly
one is ever announced.

### No typical value without a citation

See [TYPICAL-VALUES.md](TYPICAL-VALUES.md). Where no source exists, the link does
not appear. Provisional figures carry `status: 'provisional'` and a caution.
Equipment purchase prices and South Dakota yields and prices are **deliberately
absent**.

Three findings that cost real time, in full in [DESIGN-NOTES.md](DESIGN-NOTES.md):

- **Aggregates from one report are not always divisible by aggregates from
  another.** Sanity-check a derived rate against lines whose right answer you
  already know, before trusting the one you don't.
- **A web-search summary is not a source.** Every figure shipped so far was
  extracted from the primary document by script. Keep it that way.
- **"There is no source" is a claim** and needs looking up like any other.

**`acres` is the one sentinel base that is not a sibling field** — the four
overhead specs use `=6.11*acres`, summed by `totalAcres()` in `ui/modals.js`, and
carry `basis: 'year'` so applying one also moves the period select.
`searchPlaceholder` gives a spec's picker a filter box, which forces open a
`<details>` holding a match.

### One set of components, two grid arrangements

Desktop (≥900px) lays enterprises out as parallel columns; mobile stacks the same
cards as accordions. This is a media query in `styles.css` and nothing else.
**Never fork into separate mobile and desktop components.** *Full list, plus the
header, year and save-state rules, in [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **A folded card is `align-self: flex-start`, never `stretch`**, or it grows to
  match the tallest open column beside it.
- **A shut card carries its gross margin per acre and in total**
  (`.ent-fold-sub`), hidden while the card is open, where both are already
  readout rows on it. Changing them means moving `--fold-h` and the card's width
  together; the tile clips rather than growing.
- **Remove stays on a folded card** — adding an enterprise folds a card either
  way round, so a card added by mistake always leaves a shut one on screen.
- **`.fixed-col` is a flex column with `.col-foot` pinned by `margin-top: auto`**,
  and `.col-body` exists only to stop the fields' margins collapsing.
- **A field in `.item-grid` hangs its box from the foot of its cell**, by the
  same `margin-top: auto`. Two of an equipment item's four labels carry a `?`
  and a *use typical value* link and two carry neither, so left to flow the
  boxes in one row started at different heights and stopped reading as a row.
- **Remove lives in the name field's label row** (`o.aside` on `field()`,
  `.field-aside`, right-aligned), not beside the input, where a full-height
  target sat against the text box and a mis-tap cost a filled-in machine. It
  keeps its 44px, which is what makes that row 44px tall.
- **`--fold-h` on `.ent-grid` is the one number for the row of shut cards.**
- **`.sub-title` needs `min-height: 29px`, not 22px** — `box-sizing: border-box`
  means it has to cover the padding and the 2px rule. Shipped once at 22px and
  did nothing.
- **`.fold-sub` shows only while the fixed block is shut**, or one number is on
  the card twice.
- **Every editable budget name is sized to its own text** (`sizeNameInputs()`).
- **Print strips browser chrome, not just buttons** — spinners and the select `▾`
  as well as `.help-btn`, `.tip` and `.chev`.
- **Green means a positive number, not an action.** `.btn-main` and `.kpi` take
  the logo's blue, leaving green for money-that-is-there and red for
  money-that-is-not.

### `render()` vs `updateOutputs()` — and why results must be `data-out`

`render()` replaces the DOM and is for **structural** changes only. Typing calls
`updateOutputs()`, which refreshes `[data-out]` elements in place; re-rendering on
keystroke would move the caret and drop the mobile keyboard.

> **Rule: if a number can change without the DOM changing shape, it must be a
> `[data-out]` placeholder, never a template literal.** That includes the warnings
> block (`[data-warnings]`) and the enterprise labels (`[data-ent-label]`).
> Asserted in `test/app.test.js` under *every figure on screen agrees*.

This was violated once: the sticky bar tracked every keystroke while the KPI cards
below it sat frozen at the last structural render, showing two contradictory
profit figures.

**A `[data-out]` path that resolves to nothing renders `—`, never `$0.00`.**
Every formatter turns `undefined` into a confident dollar figure, so a mistyped
path would print a plausible number with nothing to say it was wrong.

**A few renders answer a keystroke anyway, so `render()` restores focus.**
Naming a crop opens the `seeds/ac` mode, which changes which boxes exist and
therefore *cannot* be an `updateOutputs()`. `activeField()` / `restoreField()`
put the producer back in the box with their caret. **The `focusin` listener
guards on `restoringFocus`**, or the render that raises a notice dismisses it in
the same breath. See DESIGN-NOTES.

**A warning is printed in the card it is about, inside that card's fold.** One
`[data-warnings]` holder per enterprise, one in the fixed block, one in the
Results header, each carrying `data-warnings-for` (an index, `fixed`, or `farm`).
`farm` holds exactly one — *'Enter acres for at least one enterprise.'* — because
it names no box. One pill per warning, never one box around several.

**The model does the attributing, not the UI.** `calcEnterprise()` and
`calcFixed()` return their own `warnings`; `calcScenario()` keeps whole-farm ones
in `farmWarnings`. The flat `result.warnings` is unchanged and is still what the
model's tests assert against. *Why, and the cost, in
[DESIGN-NOTES.md](DESIGN-NOTES.md).*

### UI state is not scenario state

Fold state (`collapsedEnterprises`, `fixedCollapsed`) and `unitNotices` are
module-level in `main.js` — **not** in the scenario and not in `localStorage`.
Whether a column is open on this phone right now is not a fact about the farm,
and putting it in the scenario would mark the budget dirty on every fold and ride
into the exported file. `unitNotices` is additionally cleared at the end of
`render()`.

**A dismissed note is the exception and lives in `prefs.js`**, where it
*persists* — dismissing per-session would show it again tomorrow, which is the
behaviour the button exists to stop.

**Every enterprise starts folded, at every width** (`applyCollapseDefaults()`).
The one exception is a brand-new budget's single enterprise, tracked by
`scenarioIsNew`, which is set false wherever a stored budget becomes the working
one. *Reasoning in [DESIGN-NOTES.md](DESIGN-NOTES.md).*

**Add opens the new card and shuts every other one**, whatever the page looked
like beforehand. Pressing Add is asking for a box to type in. Shut them
**before** pushing the new enterprise, or it is counted as open and shut with
them. On a phone `scrollCardIntoView()` puts its top edge at the top of the
screen; nothing is fixed to the top of the page, and it is narrow-only because
a wide screen lays the cards out as columns. **Remove stays reachable on a
folded card**, since the previous card is now the one left shut.

### The unsaved flag gates a browser dialog, so it must be honest

`dirty` is what makes `beforeunload` ask *"are you sure you want to leave?"*, so
the delegated `input` listener **returns early when the new value equals the old
one** — a focus or an arrow key is not an edit. The stored value may be a number
while the input reports a string, so the comparison is `String(a) === String(b)`.

The boot block sits at the **bottom** of `main.js` on purpose: `render()` reads
`const` bindings declared above it, so booting from the top hits their temporal
dead zone and the app never renders. This was a real bug; the smoke test catches
it.

---

## Tests

747 tests across six files. `npm test` runs them, and so does the deploy
workflow before it builds. *Detail in [DESIGN-NOTES.md](DESIGN-NOTES.md).*

- `test/calc.test.js` — the model against real Excel output, plus the deliberate
  divergences and the regressions recorded above.
- `test/calc-adversarial.test.js` — ~250 fuzz and edge cases. **No output may
  ever be NaN, Infinity, undefined or null**, walked by `assertAllFinite`.
- `test/storage.test.js` — saving, migration, corruption, quota, cross-tab
  conflicts.
- `test/app.test.js` — boots the real app in jsdom and drives it: the
  results/sticky-bar agreement, folding, inline rename, drag reordering, the
  unit-aware picker, the Saved-tab filter, folders, the mode pill, and the
  seeds-per-unit auto-fill.
- `test/typical-values.test.js` — the shape and provenance of every shipped
  figure, including the SDSU nutrient costs reconciled against a total whose
  right answer is already known.

**The smoke test exists because a passing build proves the modules parse and
nothing more.** It has already caught a TDZ crash on boot and a crash in the
How-to guide, either of which would have shipped.

**The golden fixture** (`test/fixture.js`) holds a two-enterprise farm and the
spreadsheet's own answers for it, read back from real Excel via COM automation
rather than worked out by hand. Regenerating it has two traps that will cost you
an afternoon — see [DESIGN-NOTES.md](DESIGN-NOTES.md).

---

## Not built yet

`src/submit.js` is a **stub**, and Phase 1 is local-only so the app works with no
signal. **The app states in three places that nothing leaves the device** (see
*Where the data lives is stated, not only linked*), so Phase 2 cannot ship
without changing all three first — and changing them is the consent
conversation, not a follow-up to it. What has to be decided before enabling it is
in [DESIGN-NOTES.md](DESIGN-NOTES.md).
