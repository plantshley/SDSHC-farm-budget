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

---

## What a review pass found, and why each one was reachable

Four defects came out of a zero-context review of the accumulated feedback work.
They are recorded here rather than only in the fix, because three of them are the
*same* mistake arrived at from three directions: a rule this codebase already
states was applied everywhere it was thought about, and the places nobody thought
about were the places it mattered.

### Preharvest interest skipped `nonNegative()`

`rate`, `months`, and `manualPerAcre` were the only rates in the model that did
not pass through it. The figure is **added** to `totalVarPerAcre`, so a negative
one lowers variable expenses, raises gross margin, and raises profit. No warning
named the field, because no warning existed to name it.

The reachability is what makes it serious rather than theoretical. The rate box
ships **pre-filled with 10**, sits on every enterprise card, and is directly
editable, so "-10" for 10% is the ordinary slip rather than an exotic one. On a
$300/acre preharvest base at 10% over eight months across 1,000 acres the swing
is roughly **$40,000 in the flattering direction**, with a perfectly ordinary
number on screen. In manual mode a "-15" is a straight $15/acre credit.

CLAUDE.md's own list of what `nonNegative()` covers did not include these three,
which is why this reads as an oversight rather than a decision — the doc and the
code agreed with each other and both were wrong. The list now says so explicitly.

### A render answering a keystroke threw the producer out of the field

`autofillSeedsPerUnit()` calls `openPopulationMode()` and then renders. The guard
above it reads `if (alreadySet && !opened) return`, and its comment claims to
avoid re-rendering under someone typing a crop name — but on the common path the
mode has just been set to `population` two lines above, so the render always ran.

`render()` had no focus preservation at all. Typing `c-o-r-n` replaced
`app.innerHTML` on the fourth keystroke, focus fell to the body, and on a phone
the keyboard closed. **"Corn silage" could not be typed in one go**, on the one
field in the app that fills another field from what you type into it.

The render is genuinely necessary — which boxes exist changes — so the fix is to
survive it rather than to avoid it. `activeField()` records the focused field's
`data-path` and caret before the replace; `restoreField()` puts it back after.

Three details are load-bearing:

- **Scoped to `INPUT` / `SELECT` / `TEXTAREA`.** The mode-pill segments carry a
  `data-path` too, and three of them share it, so restoring by path would land on
  whichever segment came first rather than the one just pressed.
- **`selectionStart` is read and written inside `try`.** A number input has no
  text selection; reading throws in some browsers and returns `null` in others.
  The focus is the point, and the caret is a bonus.
- **`restoringFocus` guards the `focusin` listener, and adding the restore
  without it broke six tests.** That listener dismisses a notice when the
  producer taps into a field the notice names. A focus the *app* moved is not
  that — so the notice explaining why a figure had just been cleared was killed
  by the same render that raised it, leaving an empty box and nothing on screen
  to say why. This is the failure mode the notices exist to prevent, reintroduced
  by the fix for something else.

### All three provenance markers leaked

The contract is that the app may only ever revise a figure **it** wrote. Each
marker was set correctly and released nowhere, so each one eventually let the app
delete a producer's work and explain it with a sentence that was not true of the
number it deleted.

- **`fixed.annualTypicalBasis.<key>`** — the most reachable of the three, because
  using a typical value as a starting point and then typing over it is ordinary
  behaviour. Take the $4,203 utilities figure, type `380` over it, move the
  period to `$ / month`: `dropStaleOverheadValue()` deleted the `380` and printed
  *"Utilities was filled in from a figure published for a full year"*, which was
  true of a number that was no longer there.
- **`typicalYieldUnit`** — the same shape one field over. Apply the $0.135/bu
  hauling rate, type `0.20` over it, switch the enterprise to tons, lose the
  `0.20`.
- **`seedsPerBagAuto`** — `releaseSeedsPerUnit()` drops it on a keystroke, but
  **`applyValue()` writes `input.value` programmatically, which fires no `input`
  event.** So choosing 140,000 from the seeds-per-unit picker left the marker
  reading `"Corn"`: the caption went on crediting the Crop field for a figure the
  producer had explicitly chosen, and the next edit to that field overwrote their
  140,000 with corn's 80,000.

The rule that generalises all three, now stated in CLAUDE.md: **release the
marker wherever the value is changed by anything other than the app's own
write.** A programmatic write is not a keystroke, which is why the seed one
needed a release inside `applyValue()` and not only in the input listener.

### Six of the seven regression tests were confirmed red first

The source was stashed and the new tests run against the unfixed code, because a
regression test that passes without the fix pins nothing. The seventh — the
notice guard — passes either way, since with no focus restore at all there is
nothing to dismiss the notice. It is kept as a guard against the *fix* being
regressed, and this note is why it looks redundant.

---

## The second feedback round on the same work

### The crop field acts on `change`, not on every keystroke

Deferring the seeds-per-unit auto-fill to the moment the producer LEAVES the box
is the real fix for something an earlier pass only patched. Restoring focus after
the render put the caret back, but the render still happened at the fourth
character of "Corn" — and "Corn silage" is a crop, so the card was being rebuilt
under somebody who had not finished typing.

`change` on a text input fires on blur, and only when the value actually moved,
which is exactly the signal wanted.

**The render is then deferred one turn of the event loop, and that is not
cosmetic.** `change` fires DURING the blur that a click causes, so a synchronous
render replaces the page between mousedown and mouseup. The element the producer
pressed is detached, no common ancestor remains for the click to be dispatched
to, and **the click never lands** — tapping Acres straight after typing a crop
would put them nowhere, and tapping Save would do nothing at all. `deferRender()`
is a `setTimeout(render, 0)` on the document's own window, and the test helper
`typeCrop()` is async for the same reason.

### A seed price is at home in either entry mode

A list quoted *per unit of seed* is quoting a cost per BAG, and `seeds/ac` mode
already has a box holding exactly that — `costPerBag`, the same number in the
same units as `costPerUnit`. Switching the line to `$/unit` to accept it was not
merely unnecessary: it hid the population the producer had already entered,
leaving a real figure stored with nothing on screen to say where it went.

`switchesMode()` and `boxFor()` in `ui/modals.js` carry this, and the exemption
is deliberately narrow — **two boxes holding the same quantity, nothing else.**
The same spec's three `$/acre` groups still warn and still switch, because a cost
per acre and a cost per bag are different figures. The test asserts both halves,
per group, on the one spec that has both.

### A folded card carries what the enterprise earns

`.ent-fold-sub` holds gross margin per acre and enterprise gross margin, shown
only while the card is SHUT — open, both are already readout rows a few inches
below, and the same number twice on one card reads as two numbers that disagree.
That is the rule `.fold-sub` follows on the fixed block.

Both are `[data-out]` with `data-tone`, so they track a keystroke like every
other figure and take the green/red of money that is or is not there. **`--fold-h`
moved 100px → 138px and the shut card 200px → 220px**, because the tile clips
rather than growing and "Gross margin $1,234.56 / ac" has to stay on one line.

### The tabs stopped moving between screens

`.app-head` used `justify-content: space-between`, and the header holds the
budget name AND the tabs on the Budget screen but only the tabs on the Saved one.
So the tabs sat at the right-hand end on one screen and hard against the left on
the other. `margin-left: auto` on `.app-nav` absorbs the free space whatever else
is on the row. The mobile query resets it, where the nav is full width anyway.

### The modal error moved into the head

It is raised in answer to a tap on an option that can be a long way down a long
list, and the head does not scroll while the body does. At the foot of the body
it was written to a part of the modal the producer was not looking at: they
tapped a figure, nothing appeared to happen, and the sentence saying why was off
the bottom of the screen. It carries `aria-live="polite"` because it appears
without the focus moving, and `openModal()` clears it on the way in — it lives in
the head now, so it outlives the body it was raised about.

### The five smaller ones

- **A `data-out` path that resolves to nothing renders `—`, not `$0.00`.** Every
  formatter turns `undefined` into a confident dollar figure, so a mistyped path
  would print a plausible number and nothing anywhere would say it was wrong.
- **The CSV uses `num()`, not `Number(x) || 0`.** A stored `"$4.25"` was exported
  as `0` in the same row as a gross revenue computed from 4.25 — a
  self-contradicting file, and it is the copy that gets handed to somebody else.
- **A rename rewrites the row's `data-scn-search`.** The filter matches on that
  baked-in field list and a rename never re-renders, so the row went on answering
  to its old name only. `searchText()` is exported and the row recomputed from
  the stored record, rather than patching the string.
- **`springOpenSection()`** opens a shut folder when a drag hovers its heading, on
  both the mouse and the touch path. A shut section hides its rows, so
  `elementFromPoint()` never returned that list — and since folders start shut,
  **a budget could not be dragged into most of them at all.** Nothing looked
  broken, because the Move button covered it; the affordance simply did not
  apply, which is worse than an error because there is nothing to report. It
  opens only, never shuts: taking a drop target away under a finger that is still
  holding a row is its own bug.
- **A duplicate expands the folder it lands in**, and `pointerdown` ignores a
  non-primary pointer, so a second finger cannot strand the first row mid-air.

**Eight of the nine new tests were confirmed red against stashed source.** The
ninth needed strengthening to be worth anything: filing a budget opens its
folder, so the duplicate test passed for a reason that had nothing to do with the
fix until the folder was explicitly shut first.

---

## Placeholders, and the fourth marker

### `unitHint` was a guess presented as a fact

The second box of a `$/unit` line asks "how many of them per acre?", and it used
to fill that placeholder from `VARIABLE_LINES[].unitHint`. That field is the
line's own idea of its unit, and on the lines that naturally quote per acre it
produced **"acre/acre"** — crop insurance, repairs, custom hire, miscellaneous
and marketing all read that way in `$/unit` mode. Seed read **"bag, unit/acre"**,
two nouns and a comma inside a placeholder.

Nothing in the app knows a line's unit until a figure has been chosen for it, so
the box now says **`unit/acre`** until one is, and the real noun afterwards.
`markQuotedUnitLabel()` takes it from the first word after the `$/` in the
**group's** unit string, because a mixed picker quotes one list per pound and the
next per acre and only the list chosen from says what is being counted:
`$/lb of N` → `lb`, `$/bu` → `bu`, `$/unit of seed` → `unit`.

`typicalUnitLabel` is the **fourth** provenance marker and the only cosmetic one:
it names a placeholder and never a value, so a stale one costs a wrong word
rather than a wrong number. It is still released when the producer types their
own cost over the top, on the same rule as the other three — the app should not
go on describing a figure that is no longer the one it wrote.

**It is not seeded in `blankVariableLines()` and did not bump `SCHEMA_VERSION`**,
following `typicalYieldUnit` rather than the v6 value keys. Its absence is the
correct state for every existing budget, a migration step would write nothing,
and it is never read as a number.

**The noun appears TWICE on the row and the two must never disagree** — as the
cost box's trailing affix (`/lb`) and as the units box's placeholder
(`lb/acre`) — because between them they are the whole sentence: dollars per
pound, times pounds per acre. `unitLabels()` in `ui/enterprise.js` owns both
strings so there is one place to change them.

**`applyUnitLabels()` writes them straight onto the boxes, in both directions**,
the way `applyValue()` writes the value. Neither moment rebuilds the card:
choosing a figure in the mode the line is already in is not a structural change,
and the release runs on a keystroke, where a render would take the caret out of
the box being typed in. Clearing the marker alone was not enough — the labels are
baked in at render time, so `lb/acre` and `/lb` stayed on screen describing a
cost the producer had just overwritten with their own, and a label that
contradicts the box beside it is worse than the stale one it replaced.

Both directions are asserted, including **deleting** the cost rather than
replacing it: an empty box is not a figure the app wrote either.

### "total premium" lives beside the line, not in the renderer

Crop insurance is the only line offering `total` mode today and "total premium"
is what a producer calls that figure — but a second line taking the mode would
not have a premium, so the noun is `def.totalHint` with a neutral fallback.

### One sentence, once

`spec.requires.message` was rendered twice: as a `.modal-warn` at the top of the
picker body, and again as the `.modal-err` in the head when a value could not be
applied. Two copies of the same sentence about the same tap. The head one is
kept, because it answers something the producer actually did and cannot scroll
away. The `.modal-note` showing the acreage a figure will be multiplied by is
unaffected — that is a different thing said for a different reason, and it only
appears when there ARE acres.

### The folded card names its figures in full

`Gross margin / ac:` and `Enterprise gross margin:`, one per line, matching the
readout rows on the open card word for word. Each `.ent-fig` is `nowrap` so money
never breaks away from its label, the key is a point smaller than the figure so
the money is what the eye lands on, and **`.ent.collapsed` went 220px → 240px**
to hold the longer of the two labels with a six-figure total beside it.

### Add opens the new card, and shuts every other one

Pressing *Add enterprise* is asking for a box to type in. Arriving shut, the new
card was a closed spine below everything already on the page and the press
looked like it had done nothing. Leaving the previous cards open is the other
half of the same problem: on a phone the new one sits below fifteen rows of the
enterprise just finished with, and on a computer every open column is squeezed
narrower to make room for an empty one.

It was shipped for one round as *hand the open card over* — fold whatever was
open, and if nothing was, add a shut card. The reasoning was that all-shut is a
budget being skimmed rather than worked on. That was wrong about what the button
is: Add is not a view control, and a producer who presses it wants to type
whatever else is on screen. The answer is the same every time.

Two details:

- **Every open card shuts, not just the last one.** Desktop lays enterprises out
  as parallel columns and several are routinely open at once. Folding one and
  leaving the rest is the same problem in a smaller size.
- **They are shut BEFORE the new one is pushed.** Afterwards the new enterprise
  is itself counted as open — it is not in `collapsedEnterprises` yet — and gets
  shut along with them.

Remove staying reachable on a folded card is unaffected and if anything firmer:
a card added by mistake now leaves the *previous* card shut, so either way round
there is a shut card to get rid of.

`scrollCardIntoView()` finishes the job on a phone, where the cards are stacked
and a new one below four others still opens off the bottom of the page. Narrow
only: a wide screen lays them out side by side and there is nothing to scroll
to. `block: 'start'` because nothing is fixed to the top of the page — the
sticky bar is at the bottom — so the card's own top edge is the right landing
place. The call is optional (`?.`) for jsdom, which has no layout and therefore
no `scrollIntoView` at all; the tests stub both it and `matchMedia`, and put
both back, because leaking either would change what `isNarrow()` answers for the
rest of the file.

### The Saved tab opens the folder you are working in

Folders start shut, which is right for eleven sections nobody has looked at yet
and wrong for the one holding the budget currently on the Budget tab. The list
already marks that row as the open one, and a marked row inside a shut section
is not on screen at all — so the producer had to remember which folder they
filed it under and open it by hand, every visit, to find the thing they were
already working on.

`revealScenarioFolder()` clears `expandedFolders` and adds exactly one id, so
arriving at the Saved tab always shows the same arrangement: one section open,
holding the budget in hand, everything else shut. Four details:

- **The ungrouped pile is shut with the folders.** It is seeded open at boot
  because it is where a budget with nowhere else to go lands, and while it is
  the only section on the device it cannot be folded at all (`bare` in
  `applySectionVisibility()`). But once folders exist it is a section like any
  other, and leaving it open while shutting the folders would put the budget the
  producer came for below a pile of ones they did not. A budget in no folder
  opens it by exactly the same rule, so `''` needs no special case — including
  for an unsaved budget, which resolves to `''` because that is the pile it
  would land in.
- **It reads the `folderId` off the STORED record, not the working copy.**
  Filing is done from the Saved tab and does not bump `updatedAt`, so the copy
  in hand can predate the move. The stored record is the one the list renders
  from, which makes it the one that decides which section the row is in.
- **It runs on every ARRIVAL at the Saved tab**, not once when a budget becomes
  the working one. The first build seeded it at the transition only, so shutting
  the section stuck for the rest of the session and the producer was back to
  hunting for the budget they had open. Every visit is a fresh look for the
  budget in hand.
- **Never from inside `render()`**, which is a different rule wearing the same
  clothes. Deleting a budget or committing a reorder re-renders the list, and
  every section the producer had opened would collapse under them without their
  having left the page. What they arrange while looking at the list has to stick
  for as long as they are looking at it, and both halves are asserted in the
  same test.

`duplicate-scenario` and the Move modal keep their own `expandedFolders.add()`
calls. Those answer a different question — *the list just changed, is what I
asked for on screen* — and fire whether or not the budget became the working
one.

The next-session case is tested by carrying the store forward into a second
`boot()`, because folders created in-session are left open by the act of
creating them and the shut state only exists on a later visit.

---

## A phone-width row of boxes

Three fixes from the same round of teammate feedback, all of them layout, all of
them a figure that was on screen and not legible.

### The seed row breaks where it is told to

`seeds/ac` mode has three factors: `$/bag × seeds/acre ÷ seeds/bag`. The row was
left to flex-wrap, on the reasoning that the browser knows the widths and would
break somewhere sensible. It does know the widths, and somewhere sensible is not
what it optimises for: it fits what it can on the first line, which at 360px was
all three boxes with the last of them about 32px of usable interior.

That is the box holding seeds-per-unit. A soybean unit is 140,000 seeds, so the
box read **1400** and scrolled the rest out of sight, with no scrollbar, no
ellipsis, and nothing to say there was more. Worse: it is the one box in the app
the app itself fills in (see *Nothing auto-fills*), so the wrong-looking number
was one the producer had not typed and had no reason to audit. A cut-off figure
that is plausible is a worse failure than a blank one.

`.line-break` is a flex item with `flex: 1 0 100%` and `height: 0`: it takes a
whole line, so everything after it starts a new one, and it takes no vertical
space of its own. `lineInputs()` emits it before the `÷`, which puts the divisor
on the new row with the box it divides — otherwise the second row opens with a
number and no sign to say what it is doing there.

`display: none` would remove it from the flex layout and take the break with it,
leaving both the bug and an element that appears to address it. That is why the
stylesheet-source test asserts `height: 0` specifically.

The break is unconditional rather than narrow-only. A wide screen lays the
enterprises out as parallel columns, and a column is not much wider than a
phone; the row was tight there too.

### Two boxes side by side start at the same height

An equipment item is four fields in a grid. Salvage value and Useful life carry
a `?` and a *use typical value* link in their label rows; Initial cost and
Interest rate carry neither. So the label above one box is a line taller than
the label above the box next to it — two lines taller on a phone, where the link
wraps under the label — and the two inputs sat at different heights with nothing
visible to explain why. It read as two unrelated controls that happened to be
adjacent.

The fix is the one `.fixed-col` already uses. Grid items stretch to their row by
default, so each field already fills the full height of its cell; making the
field a flex column and pushing `.input-wrap` down with `margin-top: auto` lands
every box on the same baseline whatever happened above it. No fixed heights, no
media query, and it holds for the three-column building grid and the four-column
equipment grid alike.

Scoped to `.item-grid`. An enterprise card's fields are a single column with
nothing beside them to line up against, and stretching them there would push
boxes away from their own labels.

### Remove belongs to the item, not to the name box

`.item-head` was a flex row: the name field, then Remove. With `align-items:
flex-end` that put a 44px underlined target immediately to the right of the text
input, level with it, reading as though it belonged to it. It removes the whole
machine, and a mis-tap costs everything typed into all four boxes below.

It moves into the name field's label row, right-aligned. `field()` gains
`o.aside`, markup pinned to the end of `.field-label`; it is the caller's own
HTML and is not escaped, so it must never carry a producer's text. Level with
the word *Equipment name* it is clear of every box and is plainly about the item
rather than about one field of it.

It keeps the full 44px, which makes that label row 44px tall and costs about
22px per item. The alternatives were shrinking the target, which the app does
not do anywhere else, or pulling the button up with a negative margin so it
overhangs the input below — which buys the height back by putting an invisible
Remove over the top corner of the name box. Neither is worth 22px.

---

## Backup and restore

### Two .json files, and the one thing they must never be confused for

A budget file holds one budget. A backup holds the entire Saved tab: every
budget, every folder, and which budget is in which folder.

`exportScenarioJSON()` strips `folderId` for a reason written down in
storage.js: a folder id is a fact about one device's list, it means nothing on
the machine the file is opened on, and an id that happened to collide with a
real folder there would file somebody else's budget into it.

`exportBackupJSON()` keeps it, and that is not an inconsistency. A backup is
restored onto the same list it came from, and every id in it resolves against
the folders in the same file. Strip it and the producer gets their budgets back
in a flat pile, having lost most of what they were backing up.

Both files end in `.json` and both came out of this app, so nothing about the
extension distinguishes them. `kind: 'sdshc-farm-budget-backup'` is the marker,
and it is checked in both directions: hand a backup to *upload a budget file*
and it says to use Restore, hand a budget file to Restore and it says to use
upload. The generic "that file is not a backup" leaves somebody staring at the
wrong control with no idea the right one is two lines up the same screen.

### The order of the two writes is the safety property

`replaceAll()` writes the budgets first and the folders second.

Budgets first: a quota failure there changes nothing at all, and the caller says
so. If the budgets land and the folders do not, the restored budgets are on
screen carrying folder ids that resolve to nothing, and `renderSections()`
already builds the ungrouped pile as *everything no section claimed* precisely so
that budget appears rather than belonging to a section nobody renders. Nothing is
lost either way.

Folders first would have the producer's existing folders holding the file's
budgets, which is a state that looks deliberate and is not.

`lastKnownUpdatedAt` is cleared. It maps an id to the `updatedAt` this tab last
saw, and after a restore every entry in it describes a budget this tab has not
read. A restored record whose timestamp is OLDER than the one remembered reads to
`saveScenario()` as "nobody has touched this since I looked", so the conflict
check passes and the next save overwrites the restored copy without asking. That
is exactly the failure the map exists to prevent, arriving through the one door
it does not watch.

### What the dialog has to say, and what a restore must not touch

"Are you sure?" is a question nobody can answer here. The dangerous case is a
file holding two budgets replacing a device holding twenty, and the only way to
see it coming is to be told both numbers. The dialog states what is arriving and
what is going, and the file is parsed BEFORE it is raised, so an unreadable file
never gets as far as asking.

An empty backup is refused outright. Restoring one is a way to delete every
budget on a device by answering a confirm dialog about a file that turned out to
hold nothing, and nobody has ever meant to do that.

The budget open on the Budget tab is left exactly as it is, unsaved edits
included. It is not part of the saved list, so a restore has no business touching
it — a producer mid-edit keeps what is in front of them, and saving afterwards
puts it back in the list. The filter is cleared, for the reason a save clears it:
the list it was describing is gone, and a restored budget filtered out of sight
reads as the restore having failed.

Placement follows the weight. Making a budget is what a producer comes to this
page to do; a backup is housekeeping a few times a year. So the two are text
links to the left of the "+" buttons, on their own centred row below them on a
phone, and Restore is deliberately not sitting inside the row of controls that
create things.

---

## Three pieces of chrome

### The top bar's title is centred by grid, not by flex

Centred has to mean centred on the page. The logo is up to 300px and the
controls are a three-segment font pill plus a 38px toggle, so in a flex row the
title sits wherever the leftovers put it — well right of centre, and moving every
time the font control changes width.

At ≥900px the bar becomes `1fr auto 1fr`. Equal outer tracks put the middle one
in the middle of the page, in the layout rather than by absolute positioning, so
the title still occupies space and cannot end up underneath the logo. Below
900px it is `display: none`: the bar there is already the logo, a font control
and a theme toggle wrapping onto two lines, and a title would push the first
thing on the page further down to repeat what the browser tab already says.

### The bar is one row, and the logo is what gives way

Adding a third font segment tipped the bar over its width on a phone, and it
wrapped: the font control and the theme toggle dropped to a line of their own,
costing about 50px above the first thing anybody came to read, on the screen with
the least of it to spare. A control bar sitting under a logo also reads as a
second header rather than as chrome.

`flex-wrap: nowrap`, and then the question is what absorbs the shortfall.

Not the controls. A squeezed font pill wraps its own segments and gets TALLER,
which is the failure being avoided wearing a different hat, and a squeezed theme
toggle stops being a target. They are `flex: 0 0 auto`.

So the logo. It needs `min-width: 0` to shrink at all: a replaced element's
automatic minimum size is its intrinsic width, so `flex-shrink` on an `<img>`
does nothing until that floor is lifted, and the row overflows instead. With
`height: auto` it scales rather than clipping, which is the same property the
44px cap was added for.

The pill also tightens at ≤899px, font size and padding only. The labels stay
words: "Br / Cl / Mo" fits anything and reads as nothing.

That got the row down to one line, at the cost of a mark squeezed to about 24px
tall on a 360px screen. The real fix came next.

### The words are what does not fit, so on a phone the words go

The first version shrank the horizontal lockup until it fitted. It fitted, and
it was a smear — the wordmark in it needs roughly 170px to be legible, and a
360px phone has not got 170px to give a header.

The mark on its own is the same identity in 42×42. It is already in the repo,
shipped as the apple-touch icon. So the bar carries both files, one per width,
the wrong one `display: none` — the idiom the seeds-per-unit offer already uses.
Both carry the same `alt`, and `display: none` takes the hidden one out of the
accessibility tree, so exactly one is ever announced. Both are precached by the
service worker either way, so nothing is downloaded twice in practice.

It takes about 130px out of the row, which is more than everything else here put
together. The ≤420px tightening added in the previous pass came back out: the
theme toggle keeps its 38px, the pill keeps its size, and the row is comfortable
at 320px rather than merely intact.

One trap. `[data-theme="dark"] .toplogo` carried `brightness(0) invert(1)`,
because the lockup is dark ink on transparent and vanishes on a dark card. The
mark is four coloured leaves, and the same filter flattens it to a solid white
blob — it is the one file in the app where "make it light" destroys the thing
being made light. The rule names `.toplogo-wide` now, and the mark keeps its own
colours, which carry on the dark background unaided.

### The filter takes several terms, and combines them with OR

A comma splits the box; a row matching any term stays.

OR makes the box a way to assemble a working set rather than a way to zero in on
one budget. "corn, soybeans" is the two crops side by side and there is no other
way to ask for it; "north, home place" is those two fields whatever is planted on
them. Somebody who wants one particular budget already has its whole name to
type, and typing more of it is how they get there — narrowing is the thing a
single term already does well.

The separator is a comma rather than whitespace because the fields hold spaces.
"North quarter" is one budget name; split on whitespace it becomes two terms and
returns every budget with *north* or *quarter* anywhere in it, which under OR is
a much louder failure than it would have been under AND. The comma also matches
how the placeholder above the box already reads, so the punctuation does what it
looks like it does.

Two consequences of OR that AND would not have had, both in the code:

Empty terms have to be dropped, and it is not a tidiness point. `''` is a
substring of every row, so a single stray comma taken as a term shows the entire
list back while the box still reads as a filter. `corn,` mid-typing therefore
changes nothing, and a box holding only commas is not a filter at all — it hides
no rows and leaves reordering on. Clear, though, follows what is IN the box
rather than what it resolved to: offering no way to empty a box full of commas is
its own trap.

And the "not filtering" case is stated rather than left to fall out of the
predicate. `[].some()` is false, so with no terms the same expression that filters
correctly would hide every row on the page.

An empty list under OR means every term failed, so the empty state says *matches
any of* once there is more than one. Without it, a producer whose second term was
a typo reads the empty list as evidence that the first one found nothing either.

Discovery is the hint line, and only while ONE term is running: the producer has
filtered and can now see whether what came back is the set they wanted. Once they
are using commas they have found it and the offer stops. A standing instruction
is one people stop seeing, which is the same reasoning behind the baseline note's
dismiss button.

### Mono, and why no webfont

The page is columns of figures. In a fixed-pitch face every digit is the same
width, so a column of dollar amounts lines up on the decimal without the
`font-variant-numeric: tabular-nums` the rest of the sheet has to ask for. That
is worth offering to anyone who wants it.

No font is fetched. This is a PWA built for a workshop with no signal, and a
webfont is a font that is not there when it matters. The stack names JetBrains
Mono first for the producer who already has it installed and falls through to
what the device ships with, ending in the `monospace` generic.

A monospaced face sets every glyph on the same advance, so at a given px size it
runs 5-10% wider and reads bigger than the proportional stack beside it. On the
figures that is the whole point. On the prose it is not: the hints, the *use
typical value* links, the notices and the footer are all deliberately quieter
than the thing they are about, and in mono they stopped being quieter — a hint
under a field read as loud as the field.

So the small prose comes down one step in mono and nothing else moves. Field
labels, readouts, headings and every figure keep their size, because the figures
are what somebody chose this face for and shrinking them would undo the choice.

Scoped by selector rather than by a scale factor on a container. `font-size` on
an ancestor cascades into the inputs and the readouts, which is exactly what must
not happen here.

The block sits last in the stylesheet, and that placement is load-bearing. Two of
its rules exist to out-rank a deeper selector further up (`.ent-add .hint` and
`.scn-btns .tip`, the second inside a media query), and equal specificity is
settled by source order. A `.something .hint { font-size }` added later would beat
a bare `[data-font="mono"] .hint`; if a size stops taking effect in mono, that is
why, and the fix is to match the depth of whatever is winning.

#### The placeholders, in em

A placeholder's `em` resolves against the input it sits in, so
`[data-font="mono"] ::placeholder { font-size: 0.9em }` scales every box in the
app proportionally from one rule. A px figure would have had to know that
`.line-input.narrow` is 12px while the money boxes are 16px — and set at
anything sensible for the money boxes it would have made the narrow ones BIGGER.

One exception is named. `.scn-filter-input::placeholder` is 12px on a phone
rather than 13px because at 13px its string truncated mid-word at 360px, which
reads as the app being broken. `0.9em` of that box's 16px is 14.4px and would
undo the fix, so the mono block names it at 11px inside the same width the
original rule lives in.

#### The 16px on `input, select` is a cliff, not a preference

It carries a one-line comment: *16px stops iOS Safari zooming on focus*. What
that means in practice is that a field under 16px causes iOS to magnify the whole
page when it takes focus, and it does not zoom back out. A producer tapping a
seed cost on a phone would be left in a magnified page scrolled sideways, having
to pinch out before the next box — on the device most of them are using, in the
app's busiest screen.

It is a threshold, not a slope: 15px triggers it exactly as hard as 12px. So
there is no version of "make the input text a bit smaller" that is safe on iOS.

The reduction is therefore scoped to `@media (hover: hover)`. iOS Safari reports
`hover: none`, so it keeps its 16px; desktop, where somebody is most likely to
have chosen a fixed-pitch face deliberately and where no browser does this, gets
15px. The media feature is already how this sheet names touch browsers.

If a phone's figure boxes should read smaller too, that is a decision to accept
the zoom, and it is made by deleting the media wrapper. It must not be made by
nudging the 16px in the base rule, which does the same thing without saying so —
and which is the shape the mistake will take, because the base rule is the
obvious place to look.

The boxes that were ALREADY under 16px come down unguarded: `.scn-name-input`
15→14, `.scenario-year` 14→13, `.period-select` 13→12, `.line-input.narrow`
12→11. They were never protected by the threshold, so nothing about how they
behave changes. `.scenario-name` is 19px and lands on 17px, which still clears
it.

`applyFont()` hard-coded `choice === 'classic' ? 'classic' : 'browser'`, which
silently swallowed a third choice. It is a named set now, and an unrecognised
value falls back to `browser` — the same rule `perYearFactor()` follows for a
basis it does not know, and for the same reason: a hand-edited or future
preference must not leave the page with no `--font` at all. A test walks every
`[data-font-choice]` button in the markup and asserts the stylesheet declares a
stack for it, because jsdom loads no CSS and a button naming a value the sheet
has never heard of would pass every DOM assertion.

### Back to Saved is shaped like a button because it leaves the page

Export CSV and Print act on the comparison in front of you. Back to Saved throws
it away and navigates. As a text link reading *Back to saved budgets* it was the
third item in a row of three and read as a third thing you might do to the table.

Outlined rather than filled: it is not the primary action on this screen either,
and filled in `--sky` it would be the loudest object on a page whose subject is a
table of money, saying "press me" about the one control that discards the
comparison.

Its box is `.btn-add-inline`'s: the 8px corner, the 36px height, the same padding
and type size as "+ New budget" and "+ New folder". It shipped first as a 34px
pill with a 17px radius, which is a perfectly good button and the wrong one — the
app now had two header-sized buttons in two different shapes, and a difference
that carries no meaning reads as one that does. They move together from here.

That leaves it below the app's usual 44px touch target, as the "+ " buttons
already are. Its neighbours in that header are text links at about the same
height, and a 44px pill among them reads as the main thing to do here. Going the
other way trades a correct touch target for a header that misstates what the
screen is for.

Changing the class from `.tip` meant it stopped being covered by the print
stylesheet's hide list, which is a navigation control printed onto a comparison.
`.btn-back` is named there now, and a test reads the print block to keep it so.

### A card was allowed to be wider than the screen

Reported as a mono bug: on a phone the enterprise cards had their right edges cut
off, folded and open alike, and the page scrolled sideways.

Mono was not the bug. `.ent-grid` was `display: grid` with no explicit template,
so its track was `1fr` — which is `minmax(auto, 1fr)`, and that `auto` minimum is
**min-content**. A track sized that way is allowed to grow to whatever its widest
unbreakable content demands, viewport or no viewport. Every card on that page has
been able to push itself off the screen since the grid was written.

Nothing quite did, in the proportional stack. The longest line a folded card
carries is "Enterprise gross margin: $172,564", and at 360px it fitted with a few
pixels in hand. A fixed-pitch face sets every glyph on the same advance and runs
5-10% wider at the same px size, which was enough to spend those pixels. The
overflow was always reachable; mono is what reached it.

`minmax(0, 1fr)` caps the track at its container, so a card is never wider than
the screen whatever it is asked to hold. `.ent` needs `min-width: 0` alongside
it, because a grid ITEM's automatic minimum size is min-content too and without
it the card refuses to shrink inside the track that now fits. Both are ignored at
≥900px, where `.ent-grid` becomes a flex row.

That fixes the page. It leaves the folded figures with less room than their line
needs, so on narrow widths `.ent-fig` drops to `white-space: normal`. It inherits
`nowrap` from `.ent-sub`, which is correct for the acreage sitting beside it and
wrong for a 33-character line. `normal` engages only when the line does not fit,
so at every width and font where it already fitted nothing moves at all; when it
does engage, the amount takes a line of its own under its label, which still
reads as that label's figure and beats a dollar amount clipped at the card edge.

Narrow-only, deliberately. At ≥900px the shut card is a fixed 240px tile of fixed
height, and its width was chosen to hold that longest line on one row — a wrapped
line there would be clipped by `--fold-h` rather than shown, which is the trade
that tile already makes.

### One name column across cards that are separate boxes

On a phone the shut cards' name and figures started at a different x on every
card. The cause is not the names: `.ent-toggle` was a flex row, the figures block
was content-sized and nowrap, and the name took whatever was left — so a card
reading "$0" gave its name more room than one reading "$109,512", and three cards
in a stack read as three layouts.

CSS cannot size a track across separate grid containers. The options were
`subgrid` — which would mean giving `.ent-grid` the card's internal columns and
restructuring a card that also has a full open state, on a feature that is
Baseline-2023 — or a measurement. This is the measurement, and it reuses the
mirror span `sizeNameInputs()` has kept for exactly this job since the budget
name box was first sized to its own text.

`sizeEntNames()` measures every shut card's name, takes the widest, clamps it
between `ENT_NAME_MIN` and `ENT_NAME_MAX`, and writes `--ent-name-w` on
`.ent-grid`. The narrow stylesheet lays the shut head out as
`auto var(--ent-name-w, 9ch) minmax(0, 1fr)`: chevron, name, everything else.

The ceiling matters. Without it one long name takes the room the figures need;
past it every name truncates, and they all truncate at the same place, which is
still the alignment this exists for. The floor stops a card holding one blank
enterprise collapsing the column and putting the chevron against the acreage.

No layout available means no write, and the `var()` fallback in the stylesheet
stands. That is a fresh boot before the first pass, and it is jsdom, which has no
layout at all. Cosmetic in both cases, and never a reason to fail.

### A measured px width goes stale when the typeface changes

Two widths in `main.js` are laid out in a mirror span and written as px. Swapping
the typeface changes every glyph advance under them, and nothing recomputed them,
because choosing a font sets an attribute on `<html>` and does not re-render.

The budget-name box had this bug before mono existed — Classic and Browser have
different metrics — it was just small enough not to be noticed. A fixed-pitch
face is not.

`applyFont()` dispatches `fb:fontchange` and `main.js` re-measures on it.

Its own event, deliberately. `fb:rerender` was sitting right there and is the
wrong tool twice over: it calls `notify()`, whose subscriber sets `dirty = true`,
so picking a typeface would arm the "are you sure you want to leave?" dialog over
a budget nobody had edited; and it calls `render()`, which would take the caret
out of whatever box somebody was typing in. Nothing about a font change is
structural. The `Event` constructor is taken off `document.defaultView` rather
than the global, because an Event built from another realm's class is rejected by
`dispatchEvent` — which is exactly the situation the smoke tests boot into.

### The shut tile's 240px was a measurement of one typeface

240px was chosen so "Enterprise gross margin: $123,456" stays on one line, and
the tile CLIPS rather than growing, which is what keeps a row of shut cards a row
instead of one tall box. In mono the line runs past it and the amount is
truncated to "$109," — a dollar figure that still looks like a dollar figure,
which is the worst thing this card can show.

The tile widens to 288px in mono, so the ordinary case reads exactly as it does
in the other faces.

That alone would be another guess, though, because a monospaced stack resolves to
whatever the device has and Consolas, Menlo and JetBrains Mono do not share an
advance. So `.ent-fig` is also allowed to wrap in mono: no width can be right
everywhere, and the failure has to be a wrapped line rather than a clipped
number.

`--fold-h` goes up a few pixels rather than a whole line, and that is measured
rather than cautious. At 288px the wrap was tested and does not engage until the
amount passes nine figures. The few pixels are there so a wrapped line's
descenders would not be shaved if it ever happened; a full line of headroom would
have been empty space at the foot of every shut tile on the page, paid every day
against a case nobody will meet.

### The definition modal said the term twice

Tap the `?` beside Land rent / acre and the panel opened with "Land rent" in the
head, then "Land rent" again as the first line of the body, then the sentence you
wanted.

The two came from the same string. `openInfo(keys, title)` falls back to
`entries[0].title` when no title is passed, and a field's `?` never passes one —
`infoButton()` has only the key. So the modal named itself after the definition,
and the body printed a heading for it as well.

Read on a phone it is worse than redundant. A heading directly under a heading
reads as the start of something new rather than as a repeat, so the eye looks for
what changed before giving up and reading on; and it spends a row of the small
panel above the sentence somebody tapped to see.

The `<h3>` is now rendered only when the modal is called something OTHER than the
definition. That is not a hypothetical branch kept for tidiness: a card's `?`
passes its own heading — "Fixed costs" over seven terms — and if it ever names a
single one, the panel title and the term are different words and both are worth
having.

Nothing changes for the folded case. Several definitions are `<details>` with the
term in the `<summary>`, which is the control you pick from rather than a
restatement of the panel's name.

### Mono in the modal body

The modal body is the longest continuous prose in the app: a definition runs to
five paragraphs, the guide to several screens. It is where a fixed-pitch face
costs the most, because there is nothing beside it to be quieter than — the whole
panel is text, so at the proportional sizes it reads as a wall rather than as an
answer.

The paragraphs, the list items and the fold summaries come down together, and the
heading keeps the half pixel it already had over the paragraphs. These are the
modal's existing relationships moved down, not a new hierarchy: the summaries are
the same size as the prose in both faces, their WEIGHT being what makes a list of
terms read as a list.
