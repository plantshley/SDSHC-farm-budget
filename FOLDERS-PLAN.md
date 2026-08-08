# Plan: organising the Saved tab into folders

Status: **built**, on the `opal` branch. Every phase in section 12 is done.

This document is kept as written, because the argument for each decision is
worth more than a tidy record of what shipped. Where the build departed from the
plan it is marked **BUILT DIFFERENTLY** in place, with the reason. The short
version:

| | Planned | Built |
|---|---|---|
| Fold state (9) | folders default **open** | folders default **shut**, which makes the filter's reach into them load-bearing |
| Colours (7) | six swatches: four brand, grey, violet | **twelve**, all their own values, matching twelve glyphs one for one |
| Move button (6) | on every row | only once **one folder exists** |
| Ungrouped pile (1) | hides when empty | stays once any folder exists, so there is somewhere to drag back out to |
| `mergeVisibleOrder()` (5) | required | **not needed**, because a shut folder still renders its rows |

**Section 15 is the running record of how it all fits together**, and it is the
one to read before changing anything here. CLAUDE.md keeps only the short rule
and a pointer back to this file.

The ask: on the Saved tab, let a producer create folders, move budgets into
them, and give each folder an icon and a colour. Must work on a phone and on a
computer.

---

## 0. First, the argument against building it

Worth reading before the rest, because it changes what "done" looks like.

The Saved tab already has a manual arrangement: drag the handle or press ▲▼ and
the order sticks (`sortIndex`, `reorderScenarios()`). For a producer with five
budgets, a folder is a box you have to open to find the thing you could already
see. Folders only start paying for themselves somewhere north of eight or ten
saved budgets, and they cost a level of hiding on every one below that.

There are two populations here and they are not the same:

- **A producer on their own phone.** Likely 3 to 8 budgets. Sorting already
  covers them. Folders are net negative until they aren't.
- **A Soil Health School instructor, or a student across a season.** "2025",
  "2026", "Corn trials", "What I showed the class". This is a real need and it
  is the one that justifies the feature.

Two lighter designs would serve the first population better and the second
almost as well:

1. **A filter box.** The land-rent picker already ships one
   (`searchPlaceholder` in `data/typical-values.js`, `wireSearch()` in
   `ui/modals.js`). Typing "corn" over a list of thirty budgets finds them all
   in one gesture, with no filing, no empty folders, and no budget hidden
   behind a fold. Roughly a tenth of the work below.
2. **A single free-text group field per budget**, rendered as headed sections.
   Same visual result as folders, no folder records to create, rename, delete,
   orphan, or migrate, and no second storage key. Loses the icon and colour.

**My recommendation: build the filter box first regardless** (it is small, it
helps immediately, and it keeps helping once folders exist), then build folders
as specified below. The icon-and-colour part is the weakest link in the chain
by value per line of code, and it is the part with the most ways to look wrong
in dark mode, so it is staged last and can be cut without stranding anything.

That said: this is a call about your users, not about the code, and you have met
them. The rest of this document assumes folders are being built.

---

## 1. Shape: sections on one page, not a folder you navigate into

**Decision: folders are collapsible sections in the existing Saved list.** There
is no "inside a folder" screen and no back button.

The alternative (tap a folder, the list is replaced by its contents) is the
familiar one, and it is wrong here for three reasons:

- **Compare would break.** `compare-selected` reads
  `[data-compare-id]:checked` from the document. Selection lives in the DOM, so
  navigating into a folder throws it away. "Compare my 2025 corn against my 2026
  corn" is the single most valuable thing the Saved tab does, and it must keep
  working across folders. A navigated design would need selection lifted into
  module state and a running "3 selected" indicator, which is a second feature.
- **The reorder code stays as it is.** With every row on one page, the visible
  DOM order is still a total order, so `commitOrder()` and both drag paths keep
  working with one change (§5).
- **It is the idiom the app already uses.** Enterprise cards fold, the fixed
  block folds, `?` modals fold. A producer who has used the Budget tab already
  knows what a chevron does here.

Layout, top to bottom:

```
Saved scenarios                                   [+ New budget]
Saved on this device only. Tap a name to rename it.        [+ New folder]

  ▸ Not in a folder · 2 budgets            ← only when non-empty, no controls
      [budget row] [budget row]

  ▾ ▣ Corn trials · 3 budgets              [Edit] [▲] [▼]
      [budget row] [budget row] [budget row]

  ▾ ▣ 2025 season · 0 budgets              [Edit] [▲] [▼]
      No budgets in this folder yet. Use Move on any budget to file it here.

Select two or more to compare them...
[Compare selected]  [Upload a budget file]
```

The budget row itself is unchanged apart from one added button (§6).

---

## 2. Data model

### Membership lives on the budget, not on the folder

```js
// a scenario record in `sdshc-fb-scenarios`
{ id: 'scn-…', name: '…', sortIndex: 3, folderId: 'fld-…', /* …the budget… */ }
```

A folder holding an array of budget ids can go stale in every direction:
delete a budget and a folder still names it, and one budget can end up listed in
two folders with no rule for which wins. A single `folderId` on the child cannot
represent either of those states. Absent, `null`, or pointing at a folder that
no longer exists all mean the same thing: **not in a folder**, which is the
correct reading of every one of them.

### Folders are their own storage key

```js
// `sdshc-fb-folders`
[{ id: 'fld-…', name: 'Corn trials', icon: 'sprout', color: 'olive',
   sortIndex: 0, createdAt: '2026-…' }]
```

Folder metadata is not budget data. It never belongs in the exported budget
file, it must not mark a budget dirty, and the folders list must be readable
and writable without touching the scenarios key.

**`icon` and `color` are token keys, never a glyph or a hex.** A stored
`#2e7d32` cannot be re-rendered for dark mode and strands the record if the
palette ever changes; `'olive'` resolves through the same custom properties as
the rest of the app, in whichever theme is on. **An unrecognised key falls back
to the default folder glyph and the neutral swatch, never to nothing and never
to a crash** — the same rule as `perYearFactor()` returning 1 for a basis it
does not know.

### Schema version

Add `folderId` to the scenario record, so per CLAUDE.md: **bump
`SCHEMA_VERSION` to 5 and add a v4 → v5 step to `migrate()`.**

**That step writes nothing**, for the same reason the v2 → v3 and v3 → v4 steps
write nothing: a v4 budget is in no folder, absence is already the correct
representation of that, and writing `folderId: null` across every stored record
would be a full rewrite of the store to say what it already said. The step
exists so the version stays monotonic and a later migration knows what it is
looking at.

The folders key needs no migration of its own; it either parses to an array or
it is treated as empty (§4).

---

## 3. Storage API (`src/storage.js`)

Every one of these follows the module's existing promise: **never throw, always
return `{ok, error}`.**

```js
export function listFolders()                        // sorted, corrupt entries skipped
export function saveFolder(folder)                   // create or update by id
export function deleteFolder(id)                     // budgets survive, see §4
export function reorderFolders(idsInOrder)           // mirrors reorderScenarios
export function moveScenarioToFolder(id, folderId)   // targeted write, see below
```

`moveScenarioToFolder()` is modelled on **`renameScenario()`, not
`saveScenario()`**, and for exactly the same reason: the Saved tab is filing a
row that may not be the budget currently open on the Budget tab, and routing it
through `saveScenario()` would write the whole working scenario over the stored
one, including Budget-tab edits the producer has not saved.

It differs from `renameScenario()` in one way: **it does not bump `updatedAt`.**
Filing a budget is not editing it. The date in the row meta is the producer's
record of when they last worked on that farm, and moving it between folders must
not reset it. As a side effect the newest-first fallback order is undisturbed by
filing, which is what you want.

### One line in `saveScenario()` that is not optional

```js
if (existing.sortIndex != null) record.sortIndex = existing.sortIndex
if (existing.folderId != null) record.folderId = existing.folderId   // ← add this
```

Without it: open a budget, go to Saved, file it into a folder, go back to the
Budget tab, save. The in-memory working scenario was read before the move and
still carries the old `folderId`, so the save un-files the budget with nothing
on screen to say so. It is the identical hazard `sortIndex` already guards
against, one field over.

---

## 4. The invariants. These are the whole feature.

This app holds producers' saved work in one browser's localStorage with no
server behind it. Everything below is a variation on one rule: **an
organisational feature must never be able to lose a budget.**

1. **Deleting a folder never deletes a budget.** `deleteFolder()` clears
   `folderId` on its members and removes only the folder record. The
   confirmation says so in as many words: *"Delete the folder "Corn trials"?
   The 3 budgets in it move back to Not in a folder. No budget is deleted."*
   There is no cascade delete, no "also delete contents" checkbox, and no
   configuration that produces one.
2. **A `folderId` with no matching folder renders as Not in a folder.** Never as
   a hidden row, never as an empty phantom section. This is the state after a
   folder is deleted in another tab, and after an unlucky partial write.
3. **A corrupt or unreadable folders key costs you the folders, never the
   budgets.** `listFolders()` returns `[]` on a parse failure and skips
   individual malformed entries, mirroring `listScenarios()`. With no folders,
   the Saved tab is exactly the flat list it is today, holding every budget.
4. **Every budget appears in exactly one section, always.** The render is
   `[…folders in order, each with its members] + […everything left over]`,
   built by partitioning the full `listScenarios()` result. A budget cannot fall
   between two sections because the leftover pile is defined as "not claimed by
   a section", not as "has no folderId".
5. **A folder write that fails is reported.** Same `alert()` treatment as a
   failed reorder or rename. A silent failure lets someone keep filing into a
   folder that is not being stored.
6. **Collapsing a folder hides rows; it never changes their order.** See §5,
   which is the one place this is easy to get wrong.
7. **BUILT, not planned: the ungrouped pile stays on screen once any folder
   exists**, even with nothing in it. It was written to hide when empty, which
   meant it disappeared at exactly the moment every budget had been filed,
   taking the drop target for "drag one back out" with it and leaving a shortcut
   that works right up until you need it. On a device with no folders it cannot
   be empty, so this never puts a heading over nothing.

---

## 5. Reorder and folders: the bug this would otherwise ship with

`sortIndex` stays a **single global rank** across all budgets. Each section
sorts its members by the existing `byListOrder()` comparator, so a budget's
global rank decides where it sits inside its section, and folder order decides
which section comes first. No per-folder rank, no second ordering concept.

That works because every row is on one page (§1): the visible top-to-bottom DOM
order *is* a valid global order, so a drop across a section boundary lands the
row exactly where it was dropped and files it at the same time.

**The trap:** `commitOrder()` currently passes the ids it finds in the DOM
straight to `reorderScenarios()`, and that function's documented contract is
that ids it was not given "keep whatever order they had, **appended after** the
arranged ones". With a collapsed folder, its members are not in the DOM, so a
single drag anywhere on the page silently rewrites the rank of every budget the
producer cannot currently see. Their arrangement inside that folder is gone, and
nothing on screen changed.

**Fix in `main.js`, not in `storage.js`.** `reorderScenarios()`'s append
behaviour is deliberate and protects against a different failure (a budget saved
by another tab between render and drop), so leave its contract alone. Instead
`commitOrder()` sends a *complete* order, built by merging:

```js
// Walk the stored order. Where a position holds a row that is currently
// visible, take the next id from the visible sequence instead. Budgets in
// collapsed folders keep their absolute positions; only visible rows permute.
function mergeVisibleOrder(storedIds, visibleIds) {
  const visible = new Set(visibleIds)
  let next = 0
  return storedIds.map((id) => (visible.has(id) ? visibleIds[next++] : id))
}
```

Both drag paths and both ▲▼ handlers already funnel through `commitOrder()` /
`reorderScenarios()`, so this is one function and two call sites.

> **BUILT DIFFERENTLY: the merge was not needed, and the reason is a rule to
> keep.** This section assumes a collapsed folder's rows are absent from the DOM.
> They are not: collapsing sets `hidden` on the `.scn-list` and CSS does the
> rest, so `commitOrder()` reading every `.scn` on the page already has a
> complete global order. `mergeVisibleOrder()` was written, found to be a no-op
> against the actual markup, and dropped rather than kept as decoration.
>
> **That makes "a shut folder still renders its rows" load-bearing.** If a future
> change ever stops rendering them, as an optimisation say, this bug is back
> exactly as described above and the merge becomes mandatory. The test *a drag
> with a shut folder present does not disturb what is inside it* is what would
> catch it.
>
> The ▲▼ handlers needed a change of their own that this section did not
> anticipate: they had to become a **swap with the neighbour in the same
> section**. Left as a global splice, pressing ▲ on the first budget in a folder
> traded ranks with a budget in another section and moved nothing anybody could
> see, which is the same failure that turns reordering off while a filter runs.

A cross-section drop needs one extra step after the merge: read the section the
row landed in and call `moveScenarioToFolder()`. Order and membership are two
writes, and the move goes **first** so that a failed reorder cannot leave a row
drawn in a folder it is not in.

**Folder order is arrows-only in v1.** ▲▼ on the folder header, through
`reorderFolders()`. Dragging folders themselves is a third drag implementation
on a page that already carries two, for a list that is five items long.

---

## 6. Controls, and which one is primary

The codebase already settled this argument for row reordering: *"The arrows are
still the primary control. They work from a keyboard, from a screen reader, and
without a steady hand. The handle is the shortcut."* Filing gets the same
treatment.

**Primary: a `Move` button on every budget row**, alongside Open / Duplicate /
Delete in `.scn-btns`. It opens a modal:

> **BUILT DIFFERENTLY: the button appears only once one folder exists.** Section
> 0 is explicit that folders are net negative for a producer with five budgets,
> and a fourth button on every row opening a modal that offers nothing but "Not
> in a folder" is precisely that cost. The first folder is made from "+ New
> folder" in the header, so the trip out and back is paid exactly once. Every
> filing after that is one gesture, because the modal carries its own
> `+ New folder…`.

```
Move "2026 Corn, no-till" to a folder

  ( ) Not in a folder
  (•) ▣ Corn trials
  ( ) ▣ 2025 season
  ( ) ▣ Pasture

  + New folder…                          [Cancel] [Move]
```

A radio list, because a budget is in one folder. `+ New folder…` creates one and
selects it in the same pass, so filing into a folder that does not exist yet is
one trip rather than two. This works by finger, by mouse, by keyboard, and by
screen reader, with no gesture and no precision required.

**Shortcut: drag the existing handle across a section boundary.** No new
affordance, and it falls out of §5 for free.

**Folder editor**, from `+ New folder` in the header or `Edit` on a folder:

```
Folder

  Name   [ Corn trials            ]
  Icon   [▣][▤][◈][◆][●][★][▲][■]      ← 8 inline SVG glyphs
  Colour [○][○][○][○][○][○]            ← 6 swatches

  [Delete folder]              [Cancel] [Save]
```

Built on the existing `openModal()` in `ui/modals.js`. Icon and colour are
button grids with `aria-pressed`, matching how `[data-font-choice]` already
works in `prefs.js`, not a native `<select>` and not a colour input.

`Delete folder` sits bottom-left, away from `Save`, and confirms with the copy
in §4.1.

---

## 7. Icons and colours

### Icons are inline SVG, not emoji

Emoji is the cheap answer and this codebase has already rejected it, in
`prefs.js`: *"emoji render at wildly different sizes and colours across
platforms, and on Windows the moon comes out as a flat monochrome glyph that
reads as a smudge"*. A row of eight emoji folder icons on Windows, Android and
iOS is three different-looking apps, and one of them is worse.

Eight glyphs, in the `SUN`/`MOON` pattern already in `prefs.js`
(`stroke="currentColor"`, 16px, `aria-hidden`): **folder, sprout, wheat,
tractor, barn, cow, dollar, star.** They live in one `ICONS` map in a new
`src/ui/folders.js`; `color` tints them via `currentColor`, so there is one
place a glyph is defined and no per-colour asset.

Cost is maybe 60 lines of path data. If that is not worth it, the fallback is
**colour only, no icons**, which loses less than it sounds like: on a row that
already shows the folder's name, the icon is the least informative thing on it.

### Colours must not collide with what colour already means here

The palette is load-bearing and semantic, and CLAUDE.md is explicit: *"green is
left to mean a positive dollar figure, and `--cost` a negative one… a producer
reading a red loss and a green profit must not have to work out which of four
browns means bad."*

A green folder chip on the same row as a red profit figure re-opens exactly that
question.

> **BUILT DIFFERENTLY: eight swatches, a rainbow with pink where red would be,
> plus a neutral grey.** Eight rather than six so the colour row and the glyph
> row line up one for one in the editor. Everything below survives intact and is
> the reason **red is the one colour not on offer**: pink sits beside it on the
> wheel and carries none of the meaning. Blue is `--sky` and green is `--olive`,
> so two of the eight cost no new tokens and are theme-aware for free. `--clay`
> and `--brown` were dropped, being the two hardest to tell from each other and
> from the headings they already colour. The order is the rainbow's, so the row
> reads as a spectrum rather than an arbitrary set, and grey sits at the end
> because it is the opt-out.

The six originally planned were **`--sky`, `--olive`, `--clay`, `--brown`, a
neutral grey, and a violet added for the sixth**, and `--green` and `--cost` are
deliberately not offered. Every one already has a dark-theme value, so folder
colour is theme-aware for free and the "add a violet" step is the only new token
pair to check in both themes.

**Colour is never the only signal.** The folder name is always rendered next to
it. A producer who cannot distinguish the swatches loses nothing but decoration,
which is the whole test for whether colour was doing a job it should not have
been.

---

## 8. Desktop and mobile

Per CLAUDE.md: **one set of components, two grid arrangements, never a fork.**
Sections are a `<details>`-shaped block in one markup path, and the media query
does the rest.

- **Phone (< 900px).** Sections stack. The folder header is a full-width tap
  target at the 44px minimum. `Move` joins the existing `.scn-btns` wrap, which
  already reflows at `@media` line 2144. Drag between sections works but is not
  the point; the Move modal is.
- **Desktop (≥ 900px).** Same stack. Folders do not become a sidebar or a column
  layout, because that is the fork the rule prohibits and because the compare
  checkboxes need to stay in one scan path.
- **Print.** Folder headers print (they are structure), the `Edit`, `▲▼` and
  `Move` controls do not, joining `.help-btn`, `.tip`, `.chev` and
  `.differs-note` in the existing `@media print` block. A collapsed folder
  **prints expanded**: paper has no chevron to tap, so a printed list that
  silently omits half the budgets is a wrong document.

---

## 9. Fold state is UI state

`collapsedFolders` is a module-level `Set` in `main.js`, next to
`collapsedEnterprises` and `fixedCollapsed`. Not in the scenario, not in
localStorage, for the reason already written down: whether a section is open on
this phone right now is not a fact about the farm.

**Folders default open**, which is the opposite of enterprise cards, and the
difference is real. Enterprises fold by default because an open one is a whole
screen of inputs and the alternative is scrolling past a farm to reach the
second. A folder is one line per budget, and a Saved tab that opens as five shut
boxes has hidden every piece of work the producer came to find.

> **BUILT DIFFERENTLY: folders default SHUT.** The objection above is real, and
> three things answer it. All three had to be built because of this choice:
>
> - **The ungrouped pile is not a folder and starts open.** It is where a budget
>   saved a moment ago lands, so the "I just saved it and it is gone" failure the
>   pile's position guards against (14.2) is guarded here too.
> - **Every header carries its count**, so a shut folder says how many budgets
>   are inside rather than hiding that there are any.
> - **The filter reaches inside a shut folder**, forcing open any section holding
>   a match and hiding one holding none. Without that, a search reports nothing
>   while the row sits in a closed fold, which is the exact bug `wireSearch()`
>   already fixed for the land-rent county list. Default-shut is only safe with
>   phase 1 already in place.
>
> The state is a set of **open** ids rather than closed ones. With shut as the
> resting state, "not in the set" is the default, and a folder the app forgot to
> seed cannot spring open.

---

## 10. What this touches elsewhere

| Feature | Behaviour | Why |
|---|---|---|
| **Compare** | Unchanged, across folders. Checkboxes stay global. | The reason for §1. Never scope compare to a folder. |
| **Duplicate** | Copy lands in the source's folder. | `getScenarioById()` returns the stored record, `structuredClone` carries `folderId`, `saveScenario` writes it for a new id. Already correct; needs a test so it stays that way. `sortIndex` is still deleted. |
| **Import a budget file** | Lands in no folder. | An exported file carries no folder, and inventing one for it would be a guess. |
| **Export JSON / CSV** | No folder data, in or out. | Folders organise a device's list; they are not part of a budget. `exportScenarioJSON` spreads the whole scenario, so `folderId` would leak in. Strip it there, alongside the same problem `sortIndex` already has. |
| **Inline rename** | Unchanged. | `renameScenario()` is a targeted write and does not touch `folderId`. |
| **Save conflict** | Unchanged. | A move does not bump `updatedAt` (§3), so filing never manufactures a conflict in another tab. |
| **Budget tab header** | Unchanged in v1. | A folder chip next to the open budget's name is defensible and is scope creep. Later. |
| **`calc.js`** | Untouched. | Folders are not economics. |

---

## 11. Tests

**Built: 38 new assertions**, and the existing 460 all still pass. Two needed
editing, and both are recorded where they are rather than quietly adjusted:

- the compare note now reads "not on screen" instead of "hidden by this filter",
  because a ticked row can be folded away as well as filtered out;
- one selector moved from `.scn:last-child` to `div.scn:last-of-type`, because a
  section's list also holds its own empty-state hint.

Neither is a rule from sections 1 to 8 being violated. Both are the markup
genuinely changing shape, which is what the "if one needs editing, that is a
signal" rule is there to make you stop and check.

The original estimate was 45 to 55. The gap is the `mergeVisibleOrder()` tests
that section 5 turned out not to need, and the storage tests that folded together
once every write path could be checked for a full store in one loop.

**`test/storage.test.js`**
- create, rename, re-colour, reorder, and delete a folder
- **deleting a folder leaves every budget in it intact and un-filed** (the one
  that matters most)
- a `folderId` pointing at a deleted folder reads as ungrouped
- a corrupt folders key returns `[]` and leaves `listScenarios()` whole
- a malformed entry inside a valid folders array is skipped, not fatal
- quota failure on every folder write returns `{ok: false}` and never throws
- `moveScenarioToFolder()` does not change `updatedAt`
- `moveScenarioToFolder()` does not write the working scenario over the stored one
- `saveScenario()` preserves `existing.folderId` (§3)
- `migrate()` v4 → v5 sets the version and writes no `folderId`
- `SCHEMA_VERSION` is read from the export, not a literal

**`test/app.test.js`** (jsdom, drives the real app)
- sections render in folder order with the ungrouped pile placed per §1
- an empty folder renders its hint, and the ungrouped section hides when empty
- Move modal files a budget and the row appears under the new section
- `+ New folder…` from inside the Move modal creates and selects in one pass
- **a drag with a collapsed folder present does not disturb that folder's
  internal order** (§5, the merge)
- a drag across a section boundary both reorders and re-files
- compare still selects across two folders and exports the same rows
- duplicate lands in the source's folder
- an unknown `icon` or `color` token renders the fallback rather than throwing
- delete-folder confirmation text names the count and says no budget is deleted

**`test/typical-values.test.js`, `calc.test.js`, `calc-adversarial.test.js`**
- untouched. If a folder change reaches any of these, it went somewhere it
  should not have.

---

## 12. Build order

Each phase leaves the app shippable. **All eight are built**: phase 1 shipped on
`main`, phases 2 to 8 on `opal`.

1. ~~**Filter box on the Saved tab.**~~ **Built.** Always present once anything
   is saved. Matches budget names, enterprise names, crops, and the year or
   month a budget was last touched. Reordering is off while it runs, and it
   clears itself whenever the list grows. See the *Saved-tab filter* section of
   CLAUDE.md. It also turned up a shipped bug it shares a mechanism with:
   `[hidden]` was being overridden by `.typ-option`'s `display: grid`, so the
   land-rent county search had never actually hidden anything. Fixed for both.
2. ~~**Storage layer.**~~ **Built.** `listFolders`, `saveFolder`, `deleteFolder`,
   `reorderFolders`, `moveScenarioToFolder`, the `saveScenario` guard, the
   `SCHEMA_VERSION` bump, the export strip. Full test file first. No UI yet.
3. ~~**The `mergeVisibleOrder()` fix in `commitOrder()`**, with its test. Lands
   before any section can collapse, so the bug never exists in a shipped
   build.~~ **Built as a section-aware `commitOrder()`. The merge itself turned
   out to be unnecessary — see section 5 — and the test that would have covered
   it covers the reason instead.**
4. ~~**Sections, read-only.**~~ **Built.** Render folders and members. No creating, no moving.
   Proves the partition, the ungrouped pile, and fold state.
5. ~~**Move.**~~ **Built.** The row button and the modal, including `+ New folder…`. This is
   the point at which the feature is usable, with no icons and no colours.
6. ~~**Folder editor.**~~ **Built.** Create, rename, delete, reorder by arrow.
7. ~~**Icons and colours.**~~ **Built.** Last, and cuttable. Nothing above depends on it.
8. ~~**Drag across sections.**~~ **Built.** The shortcut, once the primary control is proven.

Phases 1 to 5 are the feature. 6 to 8 are the finish.

---

## 13. Deliberately out of scope

- **Nested folders.** A folder inside a folder needs a tree, a breadcrumb, and a
  move target picker that is itself a tree. For this many budgets, no.
- **A budget in two folders.** That is tags, and tags are a different feature
  with a different UI. `folderId` is singular on purpose.
- **Syncing folders between devices.** Everything here is localStorage, like the
  rest of Phase 1. `src/submit.js` is still a stub and this does not change
  that.
- **"Compare everything in this folder".** Genuinely useful, genuinely a
  follow-up. One button in the folder header that ticks its members.
- **Colour-coding budget rows by folder.** The section header carries it. Tinting
  fifteen rows re-opens the green-means-profit collision the palette is built to
  avoid.
- **A folder for the currently open budget in the Budget tab header.**

---

## 14. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | ~~Build the filter box first?~~ | **Settled: built.** See phase 1. |
| 2 | Ungrouped pile at the top or the bottom? | ~~**Top.**~~ **Settled: top**, and it stays on screen once any folder exists. |
| 3 | Inline SVG icons, or drop icons and ship colour only? | ~~SVG, per `prefs.js`.~~ **Settled: eight inline SVG glyphs.** |
| 4 | Six swatches, or fewer? | ~~Six.~~ **Settled: eight** — a rainbow with pink for red, plus grey. Red withheld; green is `--olive`, blue is `--sky`. |
| 5 | Should folder fold state persist across sessions? | ~~No~~ **Settled: no**, per the `collapsedEnterprises` precedent. Sharper now that folders start shut: a producer who opens one is answering a question about right now. Revisit only if someone with fifteen folders complains. |
| 6 | Cap on folder count? | ~~No cap, no counter.~~ **Settled: no cap.** If someone makes thirty, the filter box from phase 1 is the answer. |

---

## 15. The built record: what the code actually does

Sections 1 to 14 are the plan and the argument. This section is the state of the
shipped code, moved here out of CLAUDE.md so that file stays short. **Read it
before changing folders.**

### Shape and storage

Membership is one `folderId` on the budget; the folders themselves live in their
own `sdshc-fb-folders` key.

**There is no "inside a folder".** The decisive reason is Compare:
`compare-selected` reads `[data-compare-id]:checked` off the document, so the
selection lives in the DOM and navigating away throws it out. "Compare my 2025
corn against my 2026 corn" is the most valuable thing the Saved tab does and it
has to keep working across folders. The other two reasons: with every row on one
page the visible top-to-bottom order is still a valid global order, so the
reorder code survives; and folding is the idiom the app already uses everywhere.

### Every invariant is a variation on one rule: an organising feature must never be able to lose a budget

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

### What the arrows and the drag each had to change

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
to say so. Section 5 proposes a `mergeVisibleOrder()` for this; it is **not**
needed here, and the only reason is that the rows never leave the DOM. If a
future change stops rendering a shut folder's contents, the bug is back and the
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

**A headless section is always open, and that is a guard rather than a detail.**
`applySectionVisibility()` checks for the class before consulting
`expandedFolders`. Without it: shut the ungrouped pile while a folder exists,
then delete that folder, and the pile returns headless *and* still marked shut —
every budget on the device behind a control that is no longer on the page. Pinned
by *deleting the last folder cannot leave the budgets folded out of sight*.

### Folders start shut, and the filter has to reach inside them

This is the **opposite of section 9**, which argued for open. Shut is what was
asked for, and it makes two other things load-bearing:

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

### Move is offered only once there is somewhere to move to

A deliberate departure from section 6, which put the button on every row
unconditionally. Most producers here keep three to eight budgets and will never
make a folder, and a fourth button on every row opening a modal that offers only
"Not in a folder" costs all of them and pays none. The first folder is made from
"+ New folder" in the header; from then on every filing is one trip, because the
Move modal carries its own `+ New folder…` that creates and selects in one pass.

**A shut folder prints expanded.** `@media print` sets
`.scn-list[hidden] { display: grid !important }`, which has to out-specify the
global `[hidden] { display: none !important }` — both author-origin and both
`!important`, so it is decided on specificity, (0,2,0) against (0,1,0). Dropping
either the attribute selector or the `!important` puts the folds back on paper.
It is scoped to `.scn-list` on purpose: a row hidden by the *filter* stays
hidden, where the hint line reads "Showing 3 of 12 budgets" and is the only thing
explaining why nine are missing.

### The palette, and the one colour that is not on offer

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
box rotated 45 degrees, so the span takes **no text** — a caret character placed
inside it as well renders a second caret about twice the size underneath the real
one, which shipped once and read as a broken font. Which way it points comes off
`aria-expanded` in CSS, so there is one source of truth and nothing for JS to
keep in step.

### How the row itself is laid out

The saved row is a table rather than a card, and the folder heading is styled to
match. That detail lives in **[DESIGN-NOTES.md](DESIGN-NOTES.md)** under *The
saved list is a table, not a stack of cards*, because it is as much about the
budget rows as about the folders over them.

---

## Appendix: the free-text group field, spelled out

The lighter design mentioned in §0.2, against the same section numbers.

**The idea.** No folder records at all. Each budget carries one string,
`group: 'Corn trials'`. The Saved tab groups rows by distinct value and renders
a headed section per value. A group exists exactly as long as something is in
it.

| | Folders (§1–8) | Free-text group |
|---|---|---|
| **§2 Data** | `folderId` on the budget **and** a `sdshc-fb-folders` key holding records | one string on the budget, no second key |
| **§3 Storage** | `listFolders`, `saveFolder`, `deleteFolder`, `reorderFolders`, `moveScenarioToFolder` | `setScenarioGroup(id, name)` |
| **§4 Invariants** | six, four of them about folder lifecycle | two: every budget in one section, collapsing never reorders |
| **§5 Reorder** | `mergeVisibleOrder()` fix required | identical, still required |
| **§6 Filing** | Move button, radio modal, `+ New folder…` | one text input with a `<datalist>` of existing groups, no modal |
| **§7 Icon, colour** | 8 SVG glyphs, 6 swatches | **not possible**, there is no record to hang them on |
| **§8 Layout** | identical | identical |
| **§11 Tests** | 45 to 55 | 15 to 20 |
| **Section order** | `sortIndex` on the folder, ▲▼ on the header | alphabetical, with the ungrouped pile first |

**What the string version cannot do.**

1. **Icons and colours.** The thing that was actually asked for. Deriving a
   colour by hashing the name is possible and is a bad idea: it is arbitrary,
   it changes when the group is renamed, and it can hand out the green that
   `--green` reserves for a positive dollar figure.
2. **Survive a typo.** "Corn trials" and "Corn Trails" are two sections, and the
   producer's budget is in the wrong one with no way to see why. A `<datalist>`
   and case-insensitive grouping cover most of it, not all.
3. **Hold a name of its own.** Renaming a group is a rewrite of the string on
   every member, so a group can in principle be half-renamed by a failed write
   and split in two. Folders rename one record.
4. **Exist while empty.** You cannot make "2027 season" now and file into it
   later. The flow is "file this budget under 2027 season", which creates it.
   For this app that is arguably the better flow, and it is a real difference.

**What it buys.** Roughly half the code, a third of the tests, filing in one
gesture instead of three, and the entire folder-lifecycle failure surface gone:
nothing to orphan, nothing to cascade-delete, no second key to corrupt.

**Migrating string → folders later is possible but not free**: create a folder
record per distinct string and rewrite each budget's field to its id. One
migration step, and it has to pick a winner for names that differ only by case.

**Recommendation.** If the icons and colours are the point, build folders. If
the point is "stop scrolling past budgets that are not this year's", the string
version does that for half the price, and the filter box from phase 1 already
does a good deal of it for a tenth.
