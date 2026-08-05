# Plan: organising the Saved tab into folders

Status: **proposal, not built.** Nothing in `src/` implements this yet.

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
question. So the six swatches are **`--sky`, `--olive`, `--clay`, `--brown`, a
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

Roughly 45 to 55 new assertions. The existing 446 must all still pass unchanged;
if one needs editing, that is a signal something above was violated.

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

Each phase leaves the app shippable.

1. ~~**Filter box on the Saved tab.**~~ **Built.** Always present once anything
   is saved. Matches budget names, enterprise names, crops, and the year or
   month a budget was last touched. Reordering is off while it runs, and it
   clears itself whenever the list grows. See the *Saved-tab filter* section of
   CLAUDE.md. It also turned up a shipped bug it shares a mechanism with:
   `[hidden]` was being overridden by `.typ-option`'s `display: grid`, so the
   land-rent county search had never actually hidden anything. Fixed for both.
2. **Storage layer.** `listFolders`, `saveFolder`, `deleteFolder`,
   `reorderFolders`, `moveScenarioToFolder`, the `saveScenario` guard, the
   `SCHEMA_VERSION` bump, the export strip. Full test file first. No UI yet.
3. **The `mergeVisibleOrder()` fix in `commitOrder()`**, with its test. Lands
   before any section can collapse, so the bug never exists in a shipped build.
4. **Sections, read-only.** Render folders and members. No creating, no moving.
   Proves the partition, the ungrouped pile, and fold state.
5. **Move.** The row button and the modal, including `+ New folder…`. This is
   the point at which the feature is usable, with no icons and no colours.
6. **Folder editor.** Create, rename, delete, reorder by arrow.
7. **Icons and colours.** Last, and cuttable. Nothing above depends on it.
8. **Drag across sections.** The shortcut, once the primary control is proven.

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
| 2 | Ungrouped pile at the top or the bottom? | **Top.** A budget saved a moment ago lands there, and "I just saved it and it is gone" is the worst thing this feature can do. |
| 3 | Inline SVG icons, or drop icons and ship colour only? | SVG, per `prefs.js`. But colour-only is a legitimate cut and loses little. |
| 4 | Six swatches, or fewer? | Six. Four brand plus grey plus violet, with green and red withheld. |
| 5 | Should folder fold state persist across sessions? | No, per the `collapsedEnterprises` precedent. Revisit only if someone with fifteen folders complains. |
| 6 | Cap on folder count? | No cap, no counter. If someone makes thirty, the filter box from phase 1 is the answer. |

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
