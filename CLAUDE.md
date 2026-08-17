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
npm test           # 828 tests: the economic model, storage, data, and a DOM smoke test
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

**`normalizeShape()` runs OUTSIDE the version gates, before every step.** Two
failures, one fix. Every step is `if (version < N)`, so a record claiming a
version **above** all of them skips the lot and reached the app with no
`enterprises` array at all. And `??=` replaces only null and undefined, so a
`"fixed": "x"` left the string standing and the next line assigned a property
onto a primitive — a `TypeError` out of a module that promises not to throw.
Replacing an unusable value is not dropping work: a number where the enterprise
list belongs is not recoverable data, and the record keeps its name, year and
fixed costs, where the caller's `catch` would lose the whole budget.

**`storage.js` never throws** — every failure path returns `{ok: false, error}`,
so a full or blocked store is reported rather than swallowed. **The
`JSON.stringify` lives inside `writeKey()`'s guard**, not at the eight call
sites, or a self-referencing object throws past every one of them.
`saveScenario()`'s `NotSerializable` check does not cover this and cannot:
`structuredClone()` **supports cycles**, so it accepts the record and the throw
lands one layer further in.

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

**Moved on means DIFFERENT, not later.** The comparison is `!==` and was once
`>`. A record can move backwards: a restore puts an older timestamp on an id this
tab is holding a newer copy of, and under `>` that read as untouched, so the next
save went through and took the restored budget with it. Every writer sets the map
on success, so an ordinary read-edit-save still compares equal.

### A backup is the whole tab; a budget file is one budget

Two .json files, both written by this app, and the difference between them is the
one thing this format has to make impossible to get wrong. *Reasoning in
[DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **`exportBackupJSON()` KEEPS `folderId`, and carries the folders with it.** A
  budget file is stripped because a folder id means nothing on the device it
  lands on; a backup restores a list onto itself, so every id resolves against
  the folders in the same file and stripping it would lose the arrangement.
- **`kind: 'sdshc-farm-budget-backup'` is checked on the way in, both ways.**
  Each control names the other one when handed the wrong file rather than
  refusing it as unreadable — the extension distinguishes nothing.
- **`replaceAll()` is the only destructive write in the app.** Budgets first,
  then folders: a budgets failure changes nothing at all, and a folders failure
  leaves every restored budget on screen in the ungrouped pile. The other order
  would leave the producer's own folders holding the file's budgets. **A total
  failure returns before the caller navigates** — saying "nothing was changed"
  and then switching tab reads as a restore that happened anyway.
- **`replaceAll()` deliberately does NOT clear `lastKnownUpdatedAt`, and used
  to.** The map holds what THIS tab last saw, which a restore does not change.
  Emptying it did not reset the conflict check, it switched it off: the check is
  guarded on `seen` being truthy. The older-record case came out the same either
  way and the newer-record case came out worse, its prompt suppressed. The fix
  was `>` → `!==` above, not the clear.
- **A backup's scenario ids are coerced to strings, and a repeated one is
  re-issued.** `listFolders()` always coerced; this side never did. Every action
  on the Saved tab compares against a `data-id` read off the DOM, so a number
  matches nothing under `===` — the row renders and is counted while Open,
  Delete, Duplicate, Move and the arrows all quietly do nothing to it, with no
  way to be rid of it short of clearing the browser's storage. A duplicate is
  **re-issued rather than dropped**: `.find()` resolves the first every time, so
  left alone the second row opens the first record and saving it overwrites the
  first budget, and dropping it would honour the file and lose somebody's work.
- **An empty backup is refused**, or it is a way to delete every budget on the
  device by answering a confirm dialog about a file that held nothing.
- **The confirm dialog states BOTH counts**, arriving and going. "Are you sure?"
  is unanswerable without them, and the dangerous case is two budgets replacing
  twenty. The file is parsed before the dialog is raised.
- **A restore does not touch the budget open on the Budget tab**, unsaved edits
  included. It is not part of the saved list. It does clear the filter, same rule
  a save follows.
- **A restore runs behind `withBusy()`, in TWO passes, and the veil yields
  before the work.** `replaceAll()` and `render()` are synchronous, so appending
  a veil and calling them in one task paints nothing: the browser's first chance
  to draw comes after the work has already finished. The veil also **fades in on
  a delay**, so a small backup removes something nobody saw rather than flashing
  a spinner for one frame, which reads as an error. Two passes because the
  confirm dialog sits between the read and the write, and **both `alert()`s are
  raised with the veil already down** — a question asked over a picture of the
  app still working is not answerable. It is **not** the modal overlay and must
  not become one: Escape there would take the picture away without stopping the
  restore. *See [DESIGN-NOTES.md](DESIGN-NOTES.md).*

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

**A comma splits the box into terms and a row matching ANY of them stays — OR,
never AND.** The box assembles a working set: "corn, soybeans" is the two crops
side by side, which cannot be asked any other way. Somebody after one budget
already has its whole name to type. **The separator is a comma and not
whitespace** because the fields hold spaces — "north quarter" split on
whitespace matches every budget with *north* OR *quarter* in it. **Empty terms
are dropped**, which matters more under OR than it would under AND: `''` is a
substring of every row, so one stray comma would show the whole list back. **The
"not filtering" case is stated explicitly**, because `some()` over no terms is
false and would hide every row. **Clear follows what is IN the box**, or there is
no way out of one full of commas. The empty state says *matches any of* once
there is more than one term, so a typo in the second one does not read as the
first having failed too. `scenarioHint()` offers the comma **only while one term
is running**.

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
  `folderId` win. `folderId` is stripped on a single-budget export and import,
  and deliberately **kept** in a backup — see *A backup is the whole tab*.
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

**"Open Budget" is "Open" below 900px**, where four text links share a row with a
phone's width. It is **one button with a `.scn-open-word` span inside it**, never
two buttons: `display: none` takes the word out of the **accessible name** as
well as off the page, so a phone hears "Open" and finds no duplicate control to
walk past — which is why this is not the two-copy idiom the logos and the
seeds-per-unit offer use. The rule is **narrow-only**; at 900px and up the fuller
label is the better one, and an unscoped rule would make "Open" the only form
there is. Both halves are asserted against the stylesheet source, since jsdom
loads no CSS.

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

### A row's Export is not the footer's own actions with an id bolted on

`Export` sits between Duplicate and Delete on every saved row and opens
`openExportDialog()` — one menu of four, in `ui/scenarios.js`, wearing the same
`.save-as` component as the grazing calculator. *Detail in
[DESIGN-NOTES.md](DESIGN-NOTES.md).*

- **The component is shared with the grazing calculator and the WORDING is
  too** — the modal title, the headings and the sentences are that tool's, with
  "calculation" swapped for "budget". So are the type sizes, including
  `.save-as-body`'s mono step at **11.5px**, which is its figure and not one
  chosen here. Somebody at a Soil Health School uses both tools in an afternoon;
  two ways of saying the same things reads as two different features. **Change
  one, change the other.** One sentence is not a word-for-word lift and says so
  in the code: that tool offers *the calculation answers*, and this one has
  results rather than answers.
- **Image is LAST here and FIRST there, on purpose.** In the grazing calculator
  a calculation *is* a handful of answers, so a picture of them is the whole
  thing. A budget is not: the picture is the Results section, and every other
  choice in this menu carries the enterprises and the fixed costs behind it.
  Asserted as an ordered list in `test/app.test.js`, not as a set.
- **`save-as-json` / `save-as-csv` / `save-as-png` / `save-as-print` read the
  STORED record**, through `getScenarioById(data-id)`. The footer's
  `export-csv`, `export-json` and `print` act on the working scenario and always
  will, and so does the Results header's `export-png`; a producer choosing
  Export on a row has named which budget they mean, and it is routinely not the
  one they are editing.
- **The menu is shut before any of the four run.** Printing renders the page
  the sheet is taken from and the modal is part of it, so an open menu prints as
  a grey veil over the budget.

### The PNG is drawn, not screenshotted

`downloadPNG()` in `export.js` paints the Results section onto a canvas: the
four KPIs, the two whole-farm tables, the enterprise breakdown, the fixed-cost
breakdown. No html2canvas — the section has a known shape, and a PWA that has
to work with no signal is not precaching a library and a webfont to photograph
a page that reflows at every width.

- **The palette is hard-coded light and must stay that way.** The image leaves
  the app for a text message or a printout, where the reader's theme is not ours
  to guess, and reading the tokens off the page would hand a dark-theme producer
  a white-on-white PNG. Colour still follows the **sign**, same rule as the
  screen.
- **The height is measured from the content before anything is drawn**
  (`imageModel()` then `imageHeight()`). A canvas has no overflow: a budget with
  nine enterprises has to make the picture taller, not run off the bottom of it.
  `fitText()` ellipsises anything that will not fit its column.
- **Figures are recomputed through `calcScenario()`**, never read from a stored
  `results`. Same rule the screen and the CSV follow.
- **The whole-farm warning travels with the figures**; the per-card ones name a
  box that is not in the picture and are deliberately left behind.
- **On screen the last two tables are a second column; in the image they run on
  down the page.** Two columns of 14px figures at 1080px wide is the layout that
  fails first on a phone.
- **`Save results as image` in the Results header wears `.btn-remove` plus
  `.btn-quiet`.** The box comes from `.btn-remove` alone — padding, the 44px
  target, the mono step, and the `@media print` hide — so `.btn-quiet` carries
  the hover colour and nothing else. It must not become a second box: red on
  hover means a loss on every other row of this page.
- **Printing a row BORROWS the working scenario and puts it back**, because
  `window.print()` prints the page and the page is the saved list. A **clone**
  goes in, and `printSavedBudget()` in `main.js` restores three things, not one:
  the scenario object, **its `updatedAt`**, and **`dirty`** — `setScenario()`
  calls `notify()`, which stamps whatever it is handed and sets `dirty` through
  the subscriber, so the restoring call would otherwise leave a budget nobody
  touched claiming unsaved changes and raising `beforeunload` on the way out.
  Fold state is deliberately **not** saved: `@media print` opens every collapsed
  card, so it changes nothing on paper.
- The swap back runs on **`afterprint`**, never off `print()` returning — on a
  phone that can hand back before the sheet appears. A browser with no such
  event gets the synchronous path, which is what it behaves like.
- **`--olive-ink` is a separate token from `--olive` and must stay one.**
  `--olive` is a fill, read against the ink placed on top of it; as text on the
  page background it is 2.0:1 and fails AA at any size. The light theme darkens
  it to `#6b7a1f` (4.7:1) and the dark theme, where `--olive` lightens, points
  the ink straight at it. Asserted in `test/app.test.js`.

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

**A definition never prints its own title under the title.** A field's `?` passes
no title of its own, so the term is already in `.modal-head`; the `<h3>` is
rendered only when the modal is called something else, which is a card `?`
passing its own heading. Repeated it read as a second heading for something new,
and cost a phone a row above the sentence it was tapped to read.

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

- **`.ent-grid` is `minmax(0, 1fr)`, never `1fr`.** A `1fr` track is
  `minmax(auto, 1fr)` and that `auto` is **min-content**, so one unbreakable
  string let a card push its own track past the viewport — the page scrolled
  sideways with the card's right edge cut off. `.ent` takes `min-width: 0` for
  the same reason a layer down. **Narrow-only, `.ent-fig` drops to
  `white-space: normal`**, which engages only when the line does not fit; at
  ≥900px the shut tile is a fixed 240px chosen to hold it on one row.
- **On a phone every shut card shares one name column**, `--ent-name-w`, measured
  in `sizeEntNames()` as the widest name on the page and clamped between
  `ENT_NAME_MIN` and `ENT_NAME_MAX`. A flex row gave the name whatever the
  figures beside it did not want, and those differ per card ("$0" against
  "$109,512"), so three cards read as three layouts. CSS cannot size a track
  across separate boxes without `subgrid`; this reuses the mirror span
  `sizeNameInputs()` already keeps. **No layout available means no write** and
  the `var()` fallback stands — which is jsdom, and is cosmetic everywhere.
- **`--fold-h` and the shut tile's 240px were measured against the proportional
  face**, so `[data-font="mono"]` widens the tile at ≥900px and lets `.ent-fig`
  wrap. A mono stack resolves to whatever the device has and Consolas, Menlo and
  JetBrains Mono do not share an advance, so **no width is right everywhere and
  the failure has to be a wrapped line, never a clipped dollar amount.**
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
- **The top bar becomes a 3-track grid at ≥900px** so `.topbar-title` is centred
  on the PAGE. The logo and the controls are nowhere near equal widths, so a flex
  row put it well right of centre and moved it whenever the font control resized.
  It is `display: none` below that.
- **The top bar is ONE row at every width.** `flex-wrap: nowrap`, and
  `.topbar-controls` at `flex: 0 0 auto` — a squeezed font pill wraps its own
  segments and gets *taller*, which is the failure being avoided. `min-width: 0`
  on `.toplogo` is what lets an `<img>` shrink at all (a replaced element's
  automatic minimum size is its intrinsic width, so the row overflows without
  it). The pill also tightens at ≤899px, which is what holds the row at 320px.
- **`.topband` is a WRAPPER in `index.html`, not a background on `.topbar`.**
  The bar is capped at `--maxw` and centred, so a background on it stops at the
  content edge and leaves a strip of plain page either side. **Its negative side
  margins must equal `body`'s padding** — `-16px`, and `-12px` under 900px —
  which is the one pair here that is not free-standing: undershoot and the band
  stops short of an edge, overshoot and the page scrolls sideways. The gradient
  is derived from `--sky` and `--olive-bg` rather than written as hex, so one
  set of values follows both themes, and the sky is mixed **into** the page
  background rather than used at strength. It is **hidden in `@media print`**,
  side margins included. Shared with the grazing calculator, where the same
  rules and the same reasons apply.
- **An `infinite` animation has to be stopped BY NAME for reduced motion.** The
  blanket rule at the foot of the sheet cuts every animation to `0.01ms`, which
  leaves an infinite one restarting thousands of times a second rather than
  stopping. `.topband` and `.busy-spinner` each carry their own
  `prefers-reduced-motion` override, and a test asserts both.
- **Two logo files, one per width, the wrong one `display: none`** — the
  horizontal lockup ≥900px, the **square mark** below, where the wordmark needs
  about 170px the phone has not got. Same idiom as the two copies of the
  seeds-per-unit offer: same `alt`, exactly one displayed, so exactly one is
  announced. **The dark-mode `brightness(0) invert(1)` names `.toplogo-wide`
  only** — on the lockup's dark ink it lifts the wordmark out, on the mark's four
  coloured leaves it makes a white blob.
- **`.btn-back` takes `.btn-add-inline`'s box** — 8px corner, 36px tall, same
  padding and type size. They are the app's two header-sized buttons and two
  shapes would read as two kinds of control. **Change one, change the other.**
  It is outlined rather than filled: it is the one control in the compare header
  that LEAVES the page, which is why it is a button at all, but its neighbours
  are text links and a filled pill among them would read as the main thing to do
  to a comparison. It is named in the `@media print` hide list, which `.tip` used
  to cover for it.
- **The font toggle's choices are a named set** (`FONTS` in `prefs.js`) and an
  unrecognised one falls back to `browser`, never to no `--font` at all. **`mono`
  loads no webfont** — this is a PWA that has to work with no signal, so the
  stack is fonts the device already has, JetBrains Mono first for anyone who has
  it. A test walks every `[data-font-choice]` button and asserts the stylesheet
  declares a stack for it.
- **`mono` also drops the small prose one step** — hints, tips, notices, the
  footer, the modal notes, `.btn-remove`, the placeholders and most of the text
  boxes. A monospaced face runs wider at the same px size, so they stopped being
  quieter than what they are about. **Readouts and KPI figures do not move**:
  they are what somebody chose the face for. Scoped by selector, never a scale
  on a container. **The block sits LAST in the sheet on purpose** — two of its
  rules exist to out-rank a deeper selector elsewhere (`.ent-add .hint`,
  `.scn-btns .tip`), and a new `.something .hint { font-size }` added later would
  beat a short selector in it.
- **`.line-input.narrow` goes UP in mono, 12px → 13px**, alone among the boxes,
  and is not a slip. It holds a seeds-per-unit or a population — six digits
  somebody is checking against a bag tag, which is the reading the face is
  chosen for, so it follows the readouts rather than the prose. **The 16px
  threshold is a cliff, not a direction**: below it these boxes are equally
  safe, and what must never happen is one crossing DOWN through it. The test
  asserts that and nothing more; it used to assert "smaller", which is not the
  safety property and made a deliberate change read as a regression.
- **Placeholders scale in `em`, never px.** An `em` on `::placeholder` resolves
  against the input it sits in, so one rule covers every box; a px figure would
  have made `.line-input.narrow`'s 12px box *bigger*. The mobile
  `.scn-filter-input::placeholder` is named explicitly, or `0.9em` of 16px puts
  it back over the width that truncated it.
- **The `input, select` reduction is behind `@media (hover: hover)`, and that is
  not decoration.** The 16px there is what stops **iOS Safari zooming the page
  when a field takes focus**, and it does not zoom back out. The threshold is a
  cliff — 15px is as bad as 12px. iOS reports `hover: none` and keeps its 16px.
  **Taking a phone's boxes below 16px is a decision to accept the zoom**, made by
  deleting that wrapper, never by nudging the 16px. Boxes already under 16px
  (`.scn-name-input`, `.scenario-year`, `.period-select`, `.line-input.narrow`)
  were never protected by it and come down unguarded.

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

### Two widths are measured, so a font change has to be announced

`sizeNameInputs()` and `sizeEntNames()` lay text out in an off-screen mirror span
and write the result as **px**. Swapping the typeface changes every glyph advance
underneath them and nothing else recomputes them, because choosing a font does
not re-render the app.

`applyFont()` in `prefs.js` therefore dispatches **`fb:fontchange`**, and
`main.js` re-measures on it. **Its own event and NOT `fb:rerender`**, which
`notify()`s as it goes and would mark the budget unsaved — picking a typeface is
not an edit to a farm. It is also not a `render()`: no structure changes, and a
render would take the caret out of whatever box somebody was typing in. The
`Event` constructor comes off `document.defaultView`, never the global, for the
reason `openTypical()` does the same.

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

828 tests across seven files. `npm test` runs them, and so does the deploy
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
- `test/themelab.test.js` — the author-only palette editor: the light-to-dark
  mirror's arithmetic against the shipped pairs **parsed out of `styles.css`**,
  and the rules about what the shelf of saved themes must survive. Not a
  producer feature; tested because neither part can be checked by eye.

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
