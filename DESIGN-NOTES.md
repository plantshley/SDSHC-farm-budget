# Design notes

The long-form reasoning behind the rules in CLAUDE.md.

CLAUDE.md keeps the rule and the name of the thing it applies to, because it is
loaded into context on every session and length there is a running cost. This
file keeps the *why*: the failure each rule came from, the alternative that was
tried, and the detail you need before changing one. Headings here match the
headings in CLAUDE.md.

Read the matching section here before changing anything the CLAUDE.md rule
covers. A rule with its reason removed is a rule someone will "simplify" away.

Two neighbours hold their own long form:

- **[FOLDERS-PLAN.md](FOLDERS-PLAN.md)** — everything about folders on the Saved
  tab, plan and built record together.
- **[TYPICAL-VALUES.md](TYPICAL-VALUES.md)** — provenance for every shipped
  figure, and what was deliberately not shipped.

---

## Deliberate divergences from the spreadsheet

**These are corrections, not drift. Do not "fix" them back to match the
.xlsx.** Every one is asserted in `test/calc.test.js` under *deliberate
divergences*, and `src/ui/results.js` points here in its header comment.

The app used to disclose them to producers through a `showDifferences()` guide
on the results screen and a `.differs-note` that opened it; both were removed
once the corrections were signed off, because the app is not presented as a
version of a spreadsheet its users may never have opened. Nothing about the
model changed with them. If a future change to `calc.js` moves a producer's
number, that is a different question from these six and needs its own answer —
do not treat the absence of the guide as licence to diverge quietly.

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

## `src/calc.js` is pure

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

---

## Entry conveniences must not change an answer

Two v2 additions let a producer enter a figure the way they actually know it,
and both are deliberately *presentational* — they annualise on the way into the
model and change nothing else:

- `fixed.labor.hours` + `fixed.labor.hoursBasis` (year / month / week), which a
  **new** budget starts on **week**. Hired help is described weekly — "a couple
  of days a week through the season", not "312 hours a year" — and a yearly
  default puts the conversion back in the producer's head, which is the
  arithmetic this pair exists to take out of it. The v1 → v2 migration still
  writes `year` onto old budgets: they stored an annual figure, and reinterpreting
  it as weekly would multiply somebody's labour bill by fifty-two.
- `fixed.annual.<key>` + `fixed.annualBasis.<key>` (year / quarter / month / week)

`perYearFactor()` in `calc.js` resolves the basis, and **an unrecognised basis
falls back to a multiplier of 1, never 0.** A hand-edited file or a future key
must not silently erase a real cost. Asserted in `test/calc.test.js`.

**v6 added two more, on two lines, for the same reason and under the same
contract.** Both resolve to $/acre inside `linePerAcre()` and change no answer:

- **`seed` gains `population` mode** — `costPerBag × (population ÷ seedsPerBag)`.
  Producers know their planting population; almost nobody knows what fraction of
  a bag that is, and doing that division by hand is where a seed cost picks up a
  silent error. It works in any denomination, which is why seeds-per-unit is a
  field rather than a constant: $3.80 per 1,000 seeds and $304 per 80,000-seed
  bag reach the same $125.40, and both are how seed is really quoted.
- **`cropInsurance` gains `total` mode** — one premium for the crop, divided by
  **this enterprise's acres, not the farm's.** The premium is for that crop;
  spreading it over the farm would understate it on the insured enterprise and
  charge it to enterprises it never covered, and both errors look like ordinary
  numbers. This is why `linePerAcre(line, acres)` takes a second parameter. It is
  optional, so every pre-existing caller is unaffected.

**Which modes a line offers is declared on the line**, in `VARIABLE_LINES`, and
read through `lineModes()`. Only those two carry a third. A third segment on all
fifteen pills would put "population" on the hauling line, where it means nothing,
and a producer scanning fifteen expense rows should not have to read past an
option that has nothing to do with the cost in front of them.

**`resolveMode()` is why that declaration is a guard and not just markup.** A
stored mode can be wrong two ways, and the second is the one worth knowing about:

- a mode nothing recognises, from a hand-edited file — obvious;
- **a mode this app recognises but THAT LINE does not offer**, `total` on the
  nitrogen line say. Not obvious at all. The branch would run, read a `totalCost`
  the UI never writes for that line, and return **$0 while a perfectly good
  `costPerUnit × unitsPerAcre` sat in the record unread.**

Both fall back to the sheet's own `$/unit × units/acre`, never to zero — the same
rule `perYearFactor()` returns 1 for. A file the app cannot make sense of must
not be able to silently delete a real cost. `warnHalfFilled()` checks the
*resolved* mode for the same reason, or a rescued line gets checked against boxes
it is no longer reading. The `def` argument to `linePerAcre()` is optional, so
the bare arithmetic stays testable on its own.

`safeDiv()` guards both new modes, so a blank seeds-per-unit or a farm with no
acres is $0 rather than `Infinity` spreading into every total below it.

**`total` mode is the one place negative acres are NOT allowed through.**
Everywhere else they are, deliberately, so the per-acre figures still compute and
show the producer what a stray minus sign did. Here the divisor is a *quantity*
rather than a rate, so a premium over negative acres comes out negative — a cost
handed back as a credit, which is the one thing the model never does. It reads $0
and the warning says the acres are negative, rather than telling somebody who did
enter them to "enter the acres above."

---

## `schemaVersion` and migrations

Two writes bypass `saveScenario()` on purpose:

- **`renameScenario(id, name)`** — the Saved tab renames inline and autosaves.
  Routing that through `saveScenario()` would write the whole *working* scenario
  over the stored one, including Budget-tab edits the producer has not saved.
- **`reorderScenarios(ids)`** — assigns `sortIndex`. Ids not in the list keep
  their place and are appended, so a reorder can never make a budget vanish
  because another tab saved one between render and drop. `listScenarios()` sorts
  by `sortIndex` when present and falls back to newest-first, which is what
  someone who has never dragged anything expects.

`moveScenarioToFolder()` is the third and is covered in
[FOLDERS-PLAN.md](FOLDERS-PLAN.md) §15.

`duplicateScenario()` deletes `sortIndex`; a copy has never been dragged
anywhere, and inheriting the original's rank would put two budgets at the same
position. A save also returns `{error: 'Conflict'}` when the stored record has
moved on since this tab read it (tracked in the module-level `lastKnownUpdatedAt`
map). `main.js` asks the producer before overwriting; `{force: true}` proceeds.
Saving is a read-modify-write of one key, so without that check a second tab
could silently replace the first tab's work.

---

## The Saved-tab filter, and the two things it is not allowed to do

The box is present from the first saved budget onward. It was briefly gated on a
row count; a control that materialises partway down a list is one a producer has
to notice arriving, and there was no obvious number for it to arrive at.

**It filters in place and never calls `render()`.** Same rule `updateOutputs()`
exists for: replacing the DOM under the box being typed into moves the caret and
drops the mobile keyboard. It would also take every compare tick with it, so a
search made mid-selection would silently undo the selection it was helping with.
`applyScenarioFilter()` in `main.js` hides rows, rewrites the hint, and is
re-run at the end of `render()` because the list rebuilds for reasons that have
nothing to do with the filter.

**It rewrites `[data-scn-hint-text]`, not `[data-scn-hint]`, and the distinction
is load-bearing.** The hint paragraph now ends with the *upload a budget file*
offer — a button and its `?` — because that paragraph is already where a producer
reads what this screen can do, and a lone link beside `Compare selected` read as
an action of equal weight to comparing budgets. The offer sits **outside** the
span the filter rewrites. Setting `textContent` on the paragraph would delete a
control on the first character typed. `scenarioHint()` therefore returns the
sentence only, and the two forms of the offer live in `renderScenarioList()`: the
run-on clause for the populated list, and the standalone `.open-file` for the
empty state, where there is no sentence to hang it off and importing is the only
useful thing to do. Asserted under *the offer to upload a budget file rides with
the hint*.

**It also has to read as part of that sentence, not as a control parked at the
end of one.** `.tip` ships at 12px with `padding: 2px 0 0`, which is right under
a field label and wrong mid-paragraph — it sat a point small and a couple of
pixels high, and the line looked broken rather than continuous. Scoped to
`[data-scn-hint]`, both affixed controls take the hint's own `font-size` and
`line-height` and no padding, and the `?` takes `vertical-align: middle` because
it is a 22px circle. It keeps the green and the underline, which is what still
marks it as the thing to press.

**`.scn-actions` is centred on mobile** now that it holds one button. At the left
edge of a phone screen with nothing beside it, `Compare selected` read as the end
of the list rather than the thing to press next. On a computer it stays left, in
line with the rows above it.

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

---

## Dragging a row has to look like dragging a row

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

---

## The saved list is a table, not a stack of cards

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

---

## Reordering is implemented twice, and has to be

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

---

## The entry-mode control is a pill, and every option is on it

`.mode-toggle` was one button showing the mode the line was currently in — which
reads equally well as the mode it would switch you *to*. Both readings are
reasonable, which is what made it ambiguous rather than merely terse, and it is
what a teammate reported.

`modePill()` in `ui/fields.js` emits one rounded pill of `.mode-seg` buttons.
Three things about it are load-bearing:

- **Every segment carries the same `data-path` and its own `data-mode`**, and
  `set-line-mode` writes the mode named rather than flipping to "the other one".
  With three segments there is no other one. The consequence for tests:
  `querySelector('[data-path="…"]')` finds the FIRST segment, so a click has to
  name the one it wants — `[data-path="…"][data-mode="perAcre"]`.
- **The pill is pinned to `--pill-h: 23px`**, the height the single button
  occupied. There are fifteen per enterprise, so a few pixels of drift is a
  screenful; the height is declared rather than left to fall out of three
  segments plus a container border. Change the type size, change `--pill-h`.
- **The active segment fills with `--olive-soft`, a WASH, and takes `--on-olive`,
  which is NOT `--on-sky`.** At full strength the olive is the loudest thing on a
  card carrying fifteen of these and it competes with the figures — the same
  reason `--green` is reserved for a positive dollar amount rather than spent on
  chrome. A third of the way to the olive says "this one" while the pill still
  reads as one control. `--on-sky` is white, and white on any strength of olive
  is unreadable; `--brown` over the light wash is 7.6:1. Both tokens flip in the
  dark block, and the wash goes *down* there (18%, not 35%) while the ink goes
  *up* to `--text` — a tint on a light card is a bright patch on a dark one.
  Asserted against the stylesheet source, because jsdom loads no CSS.

The preharvest toggle uses the same component (`set-preharvest-mode`). One
old-style toggle beside fifteen new ones is worse than either alone. It still
stores a boolean rather than a mode string — renaming that flag would mean
migrating every saved budget for no gain.

**The labels are the short forms** — `$/ac`, `seeds/ac` — and `MODE_NAMES` in
`ui/modals.js` has to say the same words. That table is what a mismatch warning
reads from, and the sentence is telling the producer to go and look at the pill:
"$/acre" in the warning against "$/ac" on the segment is one more thing to
reconcile in the one sentence whose job is to stop a figure landing in the wrong
box. Asserted.

---

## A money box keeps its unit after the placeholder goes

A money line's placeholder carries the whole unit (`$/unit`), which is the right
thing to say while the box is empty. Fill it in and the placeholder goes, and the
unit goes with it: the box reads `285` with nothing to say whether that is per
acre, per unit, or for the whole crop.

So the unit splits and stays. `moneyBox()` in `ui/enterprise.js` wraps the input
in `.in-box` with two spans — `$` before the figure, the rest right-aligned at
the end — both dimmer than the number, because they label it rather than being
part of it.

**It is done in CSS, off `:placeholder-shown`, and that is the whole point.** The
affixes are in the markup from the start and the browser reveals them when the
box stops showing its placeholder. Nothing runs on a keystroke to keep them in
step — which matters because `updateOutputs()` is the only thing that does, and
an affix arriving one render late would be worse than no affix.

**They are styled to match `.affix` on the fixed-cost fields**, which is the same
device on the same page: the `$` and `/hr` inside the Labor rate box. Same 14px,
same `--muted`, same `left: 10px` / `right: 10px`, same 24px and 44px of padding
reserved on the input. They shipped once at 10.5px and 7/22px, which read as two
different controls doing one job an inch apart. `test/app.test.js` asserts the
pairs against the stylesheet source under *a money box wears the same affixes as
a fixed-cost field*, because jsdom loads no CSS and nothing else would notice
them drifting apart again. **Change one pair, change the other.**

The one thing that stays different is *when* they show: a fixed-cost affix is
always there, and these arrive as the placeholder goes, because the placeholder
was carrying the same words.

Three details that will bite:

- **`.in-box` is the flex child now, not the input.** The `1 1 84px` basis moved
  onto the wrapper and the input fills it. `.line-input.narrow` (preharvest rate
  and months) is still a bare input and still a direct flex child, which is why
  its rule has to sit after `.line-input` rather than being folded into it.
- **`.in-post` at `right: 10px` sits under the number input's spinner** when a
  mouse is over the box. That is deliberate and it is the same thing the
  fixed-cost suffixes have always done; matching them was worth more than
  clearing the arrows, and there is no spinner at all on the touch devices most
  of this app's use happens on.
- **A `$` goes on money and nothing else.** Units-per-acre and a planting
  population are counts; they take the trailing `/ac` and no dollar sign.
  Asserted under *a box that is not money gets no dollar sign*.

**The placeholder spells "acre" out and the affix abbreviates it, and both are
deliberate.** An empty box has its whole width to itself and no reason to make a
producer expand an abbreviation, so it says `$/acre`. Once there is a figure in
it the affix is sharing that width, so it says `/ac` — which is exactly what the
Labor rate field does with `/hr`. The pill segment abbreviates for the third
reason, in *The entry-mode control is a pill*: it is one of three sharing a row
with a label and a link at 360px. Asserted under *the pill abbreviates, the box
does not, and both are deliberate*.

**In dark mode the number inputs take `color-scheme: dark`.** The browser draws
those up/down arrows itself and draws them for a light page unless told
otherwise, which put near-white chevrons in a column of dark inputs. Scoped to
`input[type="number"]` rather than set on `:root`, so nothing else about the
page's painting changes, and declared as its own rule rather than nested inside
the `[data-theme="dark"]` token block, which would need CSS Nesting.

---

## A `$/unit` line needs both of its boxes, and says so twice

The product of a filled box and a blank one is zero, so a line with a real seed
price and no bags per acre reads **$0 while looking like a line somebody filled
in.** The arithmetic is right, and nothing about $0 says which box is empty.

Two things address it, and the second is the one that works. The hint above the
expense list says both boxes are needed — a hint is read once. `warnHalfFilled()`
in `calc.js` raises a warning naming the enterprise, the line, and **which
direction the gap runs** ("a cost per unit but no units per acre"), on every
recompute. It covers `population` (three factors) and `total` (a premium with no
acres) too, both silent by construction in exactly the same way.

**A line with nothing in it is never warned about.** Twelve untouched expense
rows are the ordinary state of a new budget, not twelve problems. And an explicit
`0` is an answer, not a blank — `isBlank()` distinguishes them, because warning
about a deliberate zero tells a producer their own entry is a mistake.

**Nor is a line whose only filled box the APP filled.** Typing "Corn" into the
crop box opens `population` mode and writes seeds-per-unit by itself, so the
`population` branch discounts a `seedsPerBag` carrying `seedsPerBagAuto` before
deciding whether anyone has started the line. Without it, the first thing a
producer types answers back with a warning about a row they have not reached —
the same rule as above, arrived at from the other direction. It takes the marker
**and** a value, never the marker alone: a hand-edited file can carry one over an
empty box, and that line still needs its warning. Asserted in
`test/calc.test.js` under *a box the APP filled is not somebody starting the
line*.

---

## The typical-value picker knows its units

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

**A spec may declare `unit` and `appliesTo` PER GROUP, and when it does, three
things move with them.** Nitrogen, phosphorus, and potassium are each published
both as a price per pound and as a cost per acre, and both are worth offering:
the per-pound figure leaves the rate to the producer's soil test, the per-acre
one answers the question in one tap. Neither is the "real" one.

- **`destination` and `needsMode` are resolved at CLICK time, from the option's
  own group** (`data-applies-to`), never once for the whole modal. This is the
  whole hazard: resolving once puts a per-acre figure into the cost-per-unit box,
  where the line then multiplies it by the rate a *second* time.
- **The mode-mismatch warning renders per group.** With the line in `$/unit`, the
  price-per-pound list needs no warning and the cost-per-acre list below it does.
  One banner could not say both.
- **The single `.modal-unit` line is replaced** by a per-group `.typ-group-unit`
  when the groups disagree, because a banner claiming one unit is false of half
  the panel.

A group that overrides `unit` **must** also declare `appliesTo` — otherwise it
prints "$/acre" over figures that land in the cost-per-unit box, which is the
exact mismatch the unit line exists to prevent. Asserted in
`test/typical-values.test.js`.

**`modeName()` names all four modes.** It was a two-way ternary and described a
line set to "population" as "$/unit × units". A warning that misnames one of the
two things it is comparing is worse than no warning, because it is the sentence a
producer would rely on to decide.

**A sentinel is a share of a sibling; `*acres` is a rate.** `formatOption()`
renders `=0.25*initialCost` as "25%" because a quarter of what you paid for a
tractor genuinely is a percentage. Applying the same rule to `=6.11*acres` put
**"611%" on the utilities button** for a $6.11/acre figure — not a cosmetic slip
but a different quantity, with nothing on the button to say so. The `acres`
branch falls through to money formatting instead. Pinned in `test/app.test.js`
under *a figure is shown in the units it is actually in*, which asserts both
halves so neither can be "simplified" back into one.

---

## A figure quoted per bushel stops being that figure when the unit changes

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

---

## Exports are handed to other people

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

---

## `?` explains, `use typical value` acts — never merge them

- Round `?` (`.help-btn`, `data-info`) → `openInfo()`. **Read-only.** Tapping it
  must never change a producer's number.
- Text link `use typical value` (`.tip`, `data-typical`) → `openTypical()`.
  Writes exactly one field.

Both rules are asserted in `test/app.test.js` under *help affordances stay
separate*.

**A modal opens folded, and folded means shut — in the typical-value picker
too.** `renderGroup()` used to leave the first group open; it no longer does, and
the rule is now the same in both kinds of modal. When a panel opens folded the
list of headings is itself the answer to "what is on offer here?", and one group
left open pushes the rest below the fold on a phone, so the list stops being a
list at exactly the width where it mattered.

A card's `?` opens several definitions at once — the fixed-costs one opens seven
— so `openInfo()` renders each as a closed `<details>` whenever there is more
than one. Flat, that is four screens of prose to scroll past to reach the term
you actually tapped for; the list of headings is itself the answer to "what is on
this card?". The how-to guide uses the same rule via
`openGuide({ collapsible: true })` with no `firstOpen`. **A single definition is
never folded** — tapping `?` and then tapping again to read the answer is not an
improvement. Asserted in `test/app.test.js` under *a card `?` is a list of terms,
not a wall of prose*.

**Both live in the label row, never under the input.** `labelRow()` in
`ui/fields.js` emits label → `?` → `use typical value`, and `renderLine()` in
`ui/enterprise.js` does the same for a variable-expense line. Under the box, the
link reads as a caption belonging to the *next* field down, and it adds a row of
height to every field that has one — across fifteen expense lines and four
equipment fields that is most of a screen. Asserted in `test/app.test.js` under
*every "use typical value" link sits in its field label row*.

---

## Where the data lives is stated, not only linked

Producers are asked to type their yields, their prices, and their land rent into
a web page, at a workshop, often on a borrowed device. The honest answer to "who
can see this?" is one tap away rather than something they have to ask a person
about, and it is in three places on purpose:

- **A sentence in the footer, on every screen** (`.footer-privacy`): *Everything
  you enter stays on this device.* This is the one that matters. A page about it
  somewhere is not the same answer as a line they cannot miss.
- **A `privacy` definition**, opened by the *Read more* link beside it. Read-only
  like every other `?` — it is not a budget term, but it is the same kind of
  thing.
- **A how-to section, *Where your budgets live***, at length. Two sentences of
  this used to live inside *Saving and comparing scenarios*, where they were
  accurate and easy to miss; they were folded into the new section rather than
  said twice.

**The sentence survives printing and the link does not.** The print block hides
`.footer button`, so a budget handed to a lender or an instructor still carries
the statement, and it is still true on paper.

This is documentation of a fact about the current build, not a promise about the
next one. `src/submit.js` is a stub and Phase 2 would change what is true here —
see *Not built yet* in CLAUDE.md. If anything is ever sent anywhere, these three
places are what has to change first, before the feature ships and not after.

---

## Prose style in every modal, hint and definition

`data/definitions.js` carries the rule at the top of the file and
`data/howto.js` follows it. In short: say what the thing is, how it is
calculated, then a worked number. **No em-dashes** (full stop, comma or colon
instead), no hedging openers, no editorialising, and **no source citations in the
prose** — a source belongs in a spec's `source` field, which the picker prints in
its footer, and in TYPICAL-VALUES.md. Same rule for group labels: a picker row
says *"Planter, drill, or sprayer"*, not *"…— Iowa State Table 1b"*. Provenance is
carried as a `table: '1a' | '1b'` flag that the tests key on instead.

**The insecticide options read *"Corn following corn, Iowa"* and that does not
break the rule.** Two states are in that one picker and they disagree: Iowa
budgets $25 an acre where corn follows corn, the North Dakota budgets carry none
on corn at all. Which state a figure is from is not a citation there; it is the
entire difference between $0 and $25, and it belongs on the row being chosen.
The rule holds where it was aimed — the **group headings** name no publication,
and a test asserts both halves so neither can be tidied into the other.

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

---

## Nothing auto-fills, with one exception that is guarded rather than trusted

Every field starts blank. Typing an equipment name matches a `category`, which
**only** filters which options the useful-life picker shows. It never writes a
value. Sentinels like `=0.25*initialCost` resolve against a sibling field at
apply time (the pattern the ROI tool uses for `=40*herd`), and show a guard
message when that sibling is empty.

**The exception is `variable.seed.seedsPerBag`, filled from the Crop field.**
It was asked for deliberately and it is the only one; do not let it become a
precedent for a second.

The reason it exists: the seed line's `population` mode divides by a
seeds-per-unit figure, and getting it wrong is not a visible error. Corn ships in
80,000-seed bags and soybeans in 140,000-seed units, so a soybean budget left on
corn's bag size is out by a factor of 1.75 with an entirely ordinary number on
the screen. That box has to be right far more often than a blank box gets filled
in correctly.

The reason it is safe is one marker. **`seedsPerBagAuto` records that the APP put
the number there**, and every guard follows from it — same idiom as
`typicalYieldUnit` and `fixed.annualTypicalBasis`, which exist so the app can
tell its own guesses from a producer's work and only ever revise the former:

- It writes **only an empty box, or one the app itself last wrote.** A figure the
  producer typed carries no marker and is never touched, however firmly the crop
  now says otherwise.
- **Typing in the box drops the marker** (`releaseSeedsPerUnit()` in `main.js`).
  From then on the crop can change freely and the number stays theirs. The
  removal is done **without a `render()`** — that would rebuild the card and take
  the focus out of the input mid-keystroke, the same rule `updateOutputs()`
  exists for, so the caption is removed from the DOM directly.
- **No match, no write.** `matchCrop()` is deliberately stricter than
  `matchCategory()`, which also matches when the *catalog entry* contains the
  query. That is right for a type-ahead offering suggestions and wrong for
  something that writes a number into a box: two characters of "co" must not
  resolve to corn and fill in 80,000.
- **A crop changed to something unrecognised clears what we put there.** A stale
  80,000 under a crop the app can no longer vouch for is worse than a blank box,
  which computes as $0 and raises a warning naming the box.
- **While the marker is set, a caption under the line says where the number came
  from.** A figure that appeared without being asked for has to explain itself,
  and has to stop explaining once the producer takes the box over.

**The caption and the OFFER look like one thing and are two.** The
`.field-note` is a sentence about a figure already in the box, and it stays a
child of `.line`, below everything: inside the row of boxes it squeezed three
number inputs into two columns' worth of width, on the one line that has three of
them.

**`seeds per unit for my crop` is a control, and it is rendered TWICE — one copy
per width.** Duplicated markup is normally a smell, so the reason is worth
stating: on a computer it belongs in the head row, right-aligned against the mode
pill, where it reads as the second of this line's two controls; on a phone that
row is already a label, a link, and a three-segment pill inside 360px, so it
drops to a line of its own between the boxes and the caption. **Those are
different parents, and no amount of `order` moves a flex item between
containers.**

The hidden copy is `display: none`, which takes it out of the accessibility tree
as well as off the screen, so exactly one offer is ever announced — the reason
this is safe rather than merely convenient. `.seeds-link-head` is the default and
`.seeds-link-row` is off; the mobile query swaps them, and a stylesheet-source
test asserts all three rules exist, because jsdom would happily let both show at
once or neither. Both copies carry the same `data-typical` and `data-target`, so
the delegated handler needs to know nothing about any of this. It sits **after**
*use typical value* in the source at both widths — that is the order a keyboard
and a screen reader follow, and only the alignment differs.

**The auto margin MOVES onto the head copy rather than being added to it.** Two
auto margins in one flex line split the free space between them, so leaving the
pill's in place would park the link halfway across the row instead of against the
control it belongs beside. `.line-head .seeds-link-head + .mode-pill` zeroes the
pill's, and the pill keeps its own on the other fourteen lines, where there is no
link to carry it.

**The mobile query then hands that margin BACK, and forgetting to shipped a
bug.** `display: none` takes the link off the screen but **not out of the sibling
chain**, so the desktop rule went on matching a hidden element and the pill
stayed stripped — parked against *use typical value* in the middle of the row, on
the one line in fifteen that has this link. Same family as `[hidden] { display:
none !important }` being load-bearing: what an element is doing visually says
nothing about whether a selector still matches it. Pinned by its own assertion
against the mobile block.

Only corn and soybeans are in `SEED_CROPS`, and the shortness of that list is a
finding rather than a gap — small grains are priced by weight and have no such
figure at all. See TYPICAL-VALUES.md. Every guard above is asserted in
`test/app.test.js` under *the one field that fills itself*.

**Naming one of those two crops also OPENS the `seeds/ac` mode**, which is a
second thing happening without being asked for and takes its own guard. The mode
is how corn and soybean seed is bought and quoted, and a producer who has to go
and find it first mostly will not — so a matched crop switches to it.

`openPopulationMode()` does it **only on a line nobody has typed in**. Once any
of the five seed boxes holds anything, the mode is a decision somebody made, and
changing it would hide the figure they entered: still stored, which makes it
worse rather than better, because nothing on screen would say where it went.
Asserted under *naming corn or soybeans opens the seeds/ac mode*.

---

## No typical value without a citation

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

**"There is no source" is a claim, and it needs looking up like any other.** Fuel
and repairs were about to ship North Dakota figures on the stated grounds that
South Dakota publishes no crop budgets — an assumption carried over from the
custom-rate work, where it is true. It is not true of crop budgets. SDSU
Extension has published them annually for years, with separate fuel and repairs
lines, N/P/K rates with per-pound prices, crop insurance, and seeding rates. That
is now the primary source for most of the variable expenses, and the near-miss is
recorded in TYPICAL-VALUES.md because it is the same failure as the FINBIN
whole-farm division: a reasonable-sounding premise nobody checked.

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

---

## One set of components, two grid arrangements

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
`.tip` and `.chev`. On screen a spinner says "you can change this"; on paper it
is ink on top of the producer's figures, and a `▾` beside a value reads as part
of it.

**Green means a positive number, not an action.** `.btn-main` (Save, Compare)
takes the logo's blue and `.kpi` takes it on the card's top edge, which leaves
green free to mean money-that-is-there and red money-that-is-not, on the KPI
cards and the sticky bar alike. Those two show the same figures and are styled by
one shared rule: they must never disagree about a colour any more than about a
number.

### The header, the year, and the save state

**`scenarioYear` lives in the header with the budget name** because it is the
same kind of thing: a label for the whole budget rather than a figure in it.
`calc.js` ignores it entirely.

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

**`.year-edit` carries `padding-left: 9px` on mobile**, which is
`.scenario-name`'s 1px transparent border plus its 8px of left padding. The
caption is not in a box, so without it the year row started 9px left of the
title above it. Change one, change both.

**The save state stands immediately left of the Save button, in the sticky
bar.** It spent a long time in `.app-head` beside the tabs, which put "Unsaved
changes" and the one control that answers it at opposite ends of a long page.
There is still exactly one of it in the DOM — `updateStatus()` and `flashSaved()`
address it by id — it has simply moved house.

- **`margin-left: auto` on `.save-state`** collapses the free space before it, so
  it and the button travel together at the right-hand end of the bar however wide
  the two figures beside them get. An auto margin absorbs the free space before
  `justify-content` runs, so the bar's `space-between` becomes a no-op rather
  than fighting it.
- **The Save button says "Save budget", and drops the second word on a phone**
  (`.btn-word`). `display: none` rather than clipping, so the accessible name
  narrows to "Save" along with the visible text instead of announcing a word
  nobody can see.
- **The state is not on screen on the Saved tab**, because the sticky bar renders
  on the Budget screen only. That is deliberate and it costs nothing: the two
  ways to discard unsaved work from there — opening another budget, and leaving
  the page — both stop and ask first.
- **It is no longer named in the `@media print` hide list.** It must not print,
  and it does not, because `.sticky-bar` is hidden two lines above. Naming it
  again would be a rule that looks load-bearing and is not. If it ever moves out
  of the bar, it goes back in the list.

Two rules in `.app-head` outlived it and are still needed for their *other*
reason:

- **`margin-left: auto` on the nav** keeps the tabs right on the Saved and
  compare screens, which render no name block at all; under `space-between` with
  one child left, the tabs would drop to the left edge and jump sideways every
  time the producer changed tab.
- **`.name-wrap { flex: 1 1 0 }` on mobile.** The zero used to be what kept the
  save state off a row of its own — **flexbox breaks lines before it shrinks
  anything**, so at `flex-basis: auto` a long budget name plus "Unsaved changes"
  overflowed and pushed the state down, with no shrink factor able to prevent a
  decision already made. Nothing shares that row now, but the zero is also what
  makes the **title** absorb the pressure by truncating with an ellipsis instead
  of shoving the tabs sideways.

---

## `render()` vs `updateOutputs()` — and why results must be `data-out`

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

**A warning is printed in the card it is about, inside that card's fold.** There
is one `[data-warnings]` holder per enterprise, one in the fixed block, and one
in the Results header, each carrying `data-warnings-for` — an enterprise index,
or `fixed`, or `farm` — and `main.js` walks them all on every keystroke. Almost
every warning names a specific box on a specific card ("Corn seed has a cost per
unit but no units per acre"), and read from anywhere but that card the box is a
scroll away.

**`farm` holds exactly one warning and it is the exception that proves the
rule.** `'Enter acres for at least one enterprise.'` names no box, and with no
acres entered it is the reason every figure on the Results card is blank — so it
is printed beside them, in the heading row rather than as a banner above the
card. A full-width red box over four blank KPI figures reads as something having
gone wrong rather than as the next thing to type.

Rendered as one pill per warning rather than one bordered block around all of
them: a producer can easily have several at once, and a single box around four
sentences reads as one large problem instead of four small ones, each pointing at
a different field.

**The model does the attributing, not the UI.** `calcEnterprise()` and
`calcFixed()` each collect into a local `own` array and empty it into the shared
one at the end, returning it as `warnings` on their own result;
`calcScenario()` keeps the whole-farm ones in `farmWarnings`. The flat
`result.warnings` is unchanged and is still what the model's own tests assert
against; the per-scope lists are a second view of the same strings, never a
second source of them. Nothing reads a warnings array, only pushes to one, which
is the whole reason collecting first costs nothing.

**The negative-acres warning moved into `calcEnterprise()`** and names one
enterprise instead of listing several. It could not stay in `calcScenario()` and
still land on the right card.

**The cost of this is that a folded card hides its own warnings**, and every
enterprise starts folded. That is what was asked for and it is the honest
trade: a warning beside the box it names is worth more than a warning always on
screen but three scrolls from the field it is about. If it ever needs mitigating,
the place is a marker on the folded `.ent-head`, driven from
`result.enterprises[i].warnings.length` — not a return to a single pile.

---

## UI state is not scenario state

**A dismissed note is the exception, and it lives in `prefs.js`.** The baseline
note on the Saved tab explains what a baseline is, which is worth saying once and
not forever: a producer who compares budgets regularly reads it every visit, and
a permanent instruction is one people stop seeing, which costs the genuinely
useful notices beside it their credibility. `isDismissed()` / `dismiss()` keep a
comma-separated list under one key, so a second dismissible note costs nothing.

It belongs beside the theme rather than in the scenario for the usual reason —
whether somebody has read a sentence about baselines says nothing about their
farm, and it would ride into an exported budget file and hide the note on
whatever device that file was opened on next. Unlike the fold state below it
**persists**: dismissing per-session would mean showing it again tomorrow, which
is the behaviour the button exists to stop. The handler removes the paragraph
from the DOM directly rather than calling `render()`, which would rebuild the
saved list and throw away every compare tick to delete one element.

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

---

## The unsaved flag gates a browser dialog, so it must be honest

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

**`test/calc-adversarial.test.js`** — its `assertAllFinite` walker recurses every
numeric leaf of the result. **No output may ever be NaN, Infinity, undefined or
null**, because these are shown to farmers as dollar amounts.

**`test/app.test.js`** — `boot()` takes an optional seed callback that runs
against the empty store just before `main.js` is imported. It is the only way to
reach a state the app cannot be driven into from its own boot, which is what a
folder created in a *previous* session is — and that is the one that starts shut.

**`test/typical-values.test.js`** — checks a citation on everything, no negative
or non-finite values, sentinels that `ui/modals.js` can actually resolve, and the
land-rent extraction against the county list and the map legend bands. It also
reconciles **the SDSU nutrient figures against the workbook's own `Fertilizer`
line**, which is the model for any future derived rate: the per-acre nutrient
costs are computed (rate × price) rather than published, so N + P₂O₅ + K₂O is
checked against a total whose right answer is already known. It agrees to the
cent in all three zones.

**The smoke test exists because a passing build proves the modules parse and
nothing more.** It has already caught a TDZ crash on boot and a crash in the
How-to guide, either of which would have shipped.

### Regenerating the golden fixture

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

The fixture deliberately uses `preharvest.auto = false`, mirroring the sheet's
hand-entered row 23, so it isolates one divergence at a time. Computed preharvest
interest has its own tests.

---

## Not built yet

`src/submit.js` is a **stub**. Phase 1 is local-only so the app works with no
signal, and so that collecting student data stays a deliberate decision with a
consent conversation attached. When Phase 2 lands, reuse the SDSHC-games-hub
Firebase setup and its `firestore.rules` pattern.

Before enabling it, decide what students are told and when they agree, whether
anything identifying is collected at all (default: no), and how long submissions
are kept.

**The app states in three places that nothing leaves the device** — see *Where
the data lives is stated, not only linked*. That is a promise made to producers
in the footer of every screen. Phase 2 cannot ship without changing all three
first, and changing them is the consent conversation, not a follow-up to it.
