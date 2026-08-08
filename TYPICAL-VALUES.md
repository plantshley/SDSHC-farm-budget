# Typical Values — sourcing record

Every figure offered by a **use typical value** link is recorded here with its
source. This file is the reason to trust those numbers, and the rule behind it
is absolute:

> **No typical value ships without a citation in this file.**
> Where no citable source exists, the link does not appear on that field.
> A missing suggestion is honest. A fabricated one is not.

Values live in [`src/data/typical-values.js`](src/data/typical-values.js).

---

## Shipped — fully sourced

**Source:** *2026 Iowa Farm Custom Rate Survey*, Iowa State University Extension
and Outreach, Ag Decision Maker File A3-10 / FM 1698, revised March 2026.
Based on 205 responses and 4,698 rates; diesel assumed at $2.89/gal (Feb 2026).
Figures below are the survey **average**, with the survey's reported range shown
in the app as context.

| App field | Values offered | Survey section |
|---|---|---|
| Custom Hire | Complete custom farming (corn $177.85, soybeans $161.70, small grain $186.15); tillage; planting/drilling; harvest | Custom Farming; Tillage; Planting; Harvesting |
| Herbicide | Ground/aerial/drone application, $8.50–$12.50/acre | Spraying |
| Nitrogen | Anhydrous, liquid and dry application, $8.15–$15.55/acre | Fertilizer Application |
| Hauling | $0.085–$0.405/bu by distance and method | Hauling Grain |
| Drying | $0.050–$0.055 per point per bushel | Drying Corn |
| Miscellaneous | Scouting, grid soil testing, pasture mowing, stalk chopping | Miscellaneous Services |
| Labor rate | $22.95 (other operations), $24.45 (spraying/harvesting) per hour | Farm Labor Wages |

**Caveat shown in the app on every one of these:** these are **Iowa** rates, not
South Dakota. Iowa publishes an annual survey and South Dakota does not, so it is
commonly used here as a reference point — but it should be checked against local
custom operators.

Two of these carry an extra caveat in the app because the survey excludes
materials: the Herbicide and Nitrogen entries cover the **application only**.

---

## Shipped — South Dakota, fully sourced

**Land rent** (`landRent`) — 137 county figures across three land types.

**Source:** USDA National Agricultural Statistics Service, *2025 Cash Rent Paid
Per Acre — South Dakota*, county estimates, released **23 August 2025**.
Published as three county maps (non-irrigated cropland, pasture, irrigated
cropland) at
`https://www.nass.usda.gov/Statistics_by_State/South_Dakota/Publications/25SDcashrents.pdf`.

| Land type | Counties published | Range |
|---|---|---|
| Cropland, non-irrigated | 64 | $24.00 (Custer) – $251.00 (Moody) |
| Pasture | 64 | $6.80 (Oglala Lakota) – $73.00 (Lake) |
| Cropland, irrigated | 9 | $115.00 (Butte) – $281.00 (Clay) |

**Counties are absent where NASS did not publish a figure**, never filled in by
interpolation or by borrowing a neighbour. Fall River and Oglala Lakota have no
non-irrigated cropland estimate; Clark and Union have no pasture estimate; only
nine counties have enough irrigated ground to report. A county missing from the
list means NASS had too few survey responses to publish, which is information in
its own right.

**Transcription:** the figures were extracted from the PDF **programmatically**
(`scratchpad/pdftext.js` → `gen-landrent.js` during the research pass) rather than
typed by hand. 137 dollar amounts copied by eye would eventually carry a wrong one
into the app with a USDA citation attached to it. The parser was cross-checked
three ways: every county name resolves against the list of all 66 South Dakota
counties, the published + unpublished counts reconcile to 66 for each land type,
and the extracted range matches the map legend bands printed on the PDF.

> **Note on why this one is worth having.** Unlike yield or price, a producer
> budgeting ground they have not rented yet often genuinely does not know the
> going rate, and the county spread in South Dakota is more than tenfold. This is
> the field where a cited average earns its place.

---

## Shipped — South Dakota overhead (FINBIN)

**Utilities, farm insurance, dues & professional fees, miscellaneous.**

**Source:** FINBIN, Center for Farm Financial Management, University of
Minnesota. *Crop Enterprise Analysis*, South Dakota, 2025 — report **972802**
(corn) and **972803** (soybeans), retrieved 4 August 2026. Eight farms: five from
the **South Dakota Center for Farm/Ranch Management**, three from the Southwest
Minnesota Farm Business Management Association.

FINBIN aggregates completed FINPACK analyses from the state Farm Business
Management programmes; SDCFRM (Mitchell Technical College) is a contributing
programme, so this is South Dakota farm-record data rather than a convention or
an Iowa proxy.

| Line | Corn $/acre | Soybeans $/acre |
|---|---|---|
| Farm insurance | 12.49 | 9.37 |
| Utilities | 6.11 | 4.79 |
| Dues & professional fees | 4.97 | 4.29 |
| Miscellaneous | 8.07 | 6.98 |

### Why these come from the crop report and not the whole-farm one

This matters, because the whole-farm report is the one whose *units* match the
app's fields, and using it produces figures wrong by a factor of three.

FINBIN's **whole farm income statement** (report 972799, South Dakota / 2025 /
farm type Crop, 28 farms) gives overhead in whole-farm dollars, which is exactly
the shape `fixed.annual.<key>` wants. But converting it to a rate needs the
companion `Total crop acres` figure (report 972801, **457 acres**), and the two
are not divisible by each other. Dividing every line by 457 gives:

| Line | ÷ 457 acres | Plausible |
|---|---|---|
| Seed $144,568 | $316/ac | ~$120 |
| Fertilizer $133,882 | $293/ac | ~$120 |
| Crop insurance $47,168 | $103/ac | ~$35 |
| Land rent $195,942 (on 380 rented ac) | $516/ac | NASS tops out at $251 |
| Gross cash farm income $1,090,892 | $2,387/ac | corn ≈ $765 |

Five lines, all about three times too high, all in the same direction. Run
backwards, each independently implies **1,100–1,600 crop acres**. The acreage
field is under-reported in the South Dakota records — the same fault visible in
the acreage *sort*, which binned 18 of 28 farms as "less than 100 total acres"
while they averaged $944k in crop sales. The dollar lines average over all 28
farms; the acreage line averages over only those that recorded one.

The **crop enterprise report** does its per-acre division inside each farm's own
record, where the acreage belongs to the farm that spent the money. That failure
mode cannot occur. Three checks were run before shipping:

1. **Internal reconciliation.** Direct expenses summed to 511.08 against a
   printed 511.09 (corn) and 358.90 against 358.88 (soybeans); overhead summed
   to 111.54 and 93.02, both exact. Yield × price × operator share reproduced
   total product return on both.
2. **Land rent sanity.** $126.71 and $126.99/acre, comfortably inside the NASS
   county range of $24–251 shipped elsewhere in this file.
3. **Independent corroboration.** Against Minnesota crop enterprise reports
   (2022–24), six of the eight figures agree within 15%, all eight within 35%,
   and South Dakota is consistently the higher of the two — which is what a 2025
   figure should look like against a 2022–24 average.

### How they are applied

Published per acre, entered as a whole-farm total. The sentinel is
`=6.11*acres`, and **`acres` is the one sentinel base that is not a sibling
field** — `totalAcres()` in `ui/modals.js` sums every enterprise. The picker
prints the acreage before anything is chosen, so the producer sees the
multiplication rather than being surprised by the result.

Each spec also carries `basis: 'year'`, and choosing a figure moves the line's
period select to yearly. The published figure is annual; a line left on "$ /
month" would have it multiplied by twelve by `calcFixed()`.

### What is disclosed in the app

**Eight farms.** That is thin, and the modal and the citation both say so
outright rather than letting "University of Minnesota" carry more weight than
the sample deserves. The note tells producers to use these to check their own
bills rather than in place of them. FBM participants are also not a random draw
of South Dakota farms.

**Real estate and property taxes** ($4.75/acre corn, $3.25 soybeans) are a
separate FINBIN line with no field in this app. The overhead definition now says
to fold them into Miscellaneous, since land rent covers rented acres only. Worth
revisiting if a dedicated row is ever wanted.

---

## Shipped — Iowa State A3-29 (useful life and salvage value)

**Source:** Iowa State University Extension and Outreach, Ag Decision Maker
**File A3-29 / PM 710, *Estimating Farm Machinery Costs*, revised March 2026**,
together with its companion workbook `a3-29machcostcalc.xlsx` (version 1.9,
author William Edwards). Both were read directly.

### Useful life — `usefulLifeEquipment`

A3-29 states the rule in one sentence, and it is the whole published position:

> "A good rule of thumb is to use an economic life of **10 to 12 years for most
> farm machines and a 15-year life for tractors**, unless you know you will trade
> sooner."

**This corrected shipped data.** The previous entries gave 15 years to planters,
drills, tillage tools, grain handling and trucks; the source reserves 15 for
tractors alone and puts everything else at 10–12. Those are now 10 or 12.

The `status: 'provisional'` flag has been **removed** — this is a cited figure
from a current edition, not a convention.

**What the figure is not.** A3-29 is careful that *economic* life is the
ownership period, deliberately shorter than service life, "because most farmers
trade a machine for a different one before it is completely worn out". Wear-out
life is kept separate and expressed in **hours** (`HWOL` in the workbook's Data
sheet — 16,000 h for a large tractor, 3,000 h for a combine), where it drives
repair-cost estimates rather than depreciation. The app's modal says this, so
nobody reads "12 years" as a prediction that their planter stops working.

**Correcting an earlier note in this file.** A previous revision recorded that
A3-29's worked example used *15 years for a 180 hp tractor*, and built an
argument on the apparent disagreement with Purdue's 10 years. Having now read
both the PDF and the workbook: the A3-29 example is a **300 hp four-wheel-drive
tractor, $350,000 purchase against a $400,000 new list price, 12 years of
ownership remaining, 400 hours a year**. The 15-year figure comes from the prose
rule of thumb, not the example. The earlier note was wrong on the horsepower and
on which part of the document the number came from; the substantive point — that
years of life depend on the farm, not the machine — is still what A3-29 itself
says with "unless you know you will trade sooner".

### Salvage value — `salvageValue`

A3-29 **Table 1a** gives remaining value as a percent of new list price, by
machine class, age, and annual hours, "developed from published reports of used
equipment auction values". This is real market data, and it replaces the guessed
percentages that shipped before for tractors and combines.

Shipped, at moderate annual use (400 h for tractors, 300 h for combines):

| Class | 10 yr | 12 yr | 15 yr |
|---|---|---|---|
| Tractor over 150 hp | 32% | 28% | 23% |
| Tractor 80–149 hp | 37% | 34% | 29% |
| Tractor under 80 hp | 32% | 29% | 25% |
| Combine / forage harvester | 23% | 18% | 13% |

The ages match the economic lives offered on the useful-life picker, so both
fields can be filled from one assumption about how long the machine is kept.

**Caveat carried in the modal:** these are shares of the **new list price**. The
app applies them to the purchase price the producer entered. For a machine bought
new those are the same number; for one bought used at a discount, the table
understates salvage, and the note says to lean higher.

### Table 1b — machine classes other than tractors and combines

**Now shipped.** Table 1b's *values* extracted cleanly from the PDF but its
*column headings* wrap across lines and could not be ordered reliably by text
extraction, so it was held back for one pass and confirmed visually against the
printed table. The extracted order was correct:

| Machine age | Plows | Other Tillage | Planter, Drill, Sprayer | Mower, Chopper | Baler | Swather, Rake | Vehicle | Other |
|---|---|---|---|---|---|---|---|---|
| **10** | 33% | 30% | 40% | 30% | 28% | 25% | 26% | 35% |
| **12** | 32% | 26% | 38% | 27% | 25% | 23% | 24% | 31% |
| **15** | 29% | 22% | 34% | 25% | 21% | 19% | 22% | 26% |

**Table 1b is credited to ASABE**, not to auction data — unlike Table 1a. The
app's citation states both provenances separately rather than blurring them into
one "Iowa State" claim.

**Class names are A3-29's own**, kept verbatim in the picker, so a producer sees
which class they are being offered instead of trusting our mapping of it.

**Where a category spans two columns, both are offered.** A chisel plow is a
"Plow" (32% at 12 years) and a disk is "Other tillage" (26%); this app files both
under `tillage`. Choosing between them on the producer's behalf would be
inventing an answer the source does not give, so the picker shows both groups and
lets them pick. Same for hay equipment, which spans Mower/Chopper, Baler and
Swather/Rake.

**Transcription check:** the shipped figures are verified in
`test/typical-values.test.js` against the age-1 (highest) and age-20 (lowest)
rows of each printed column. A value copied from the wrong column falls outside
its own column's range and fails — which monotonicity alone would not catch.

A short uncited fallback list remains for a machine that matches no class at all.

### Useful life — buildings (`usefulLifeBuilding`) — still provisional

A3-29 covers machinery only. The building figures (machine shed/shop 30 yr, grain
bin 25 yr, livestock barn 25 yr, fencing 20 yr, water system 20 yr) have **no
source** and remain marked `status: 'provisional'` with a caution in the app.

---

## Shipped — South Dakota crop budgets (SDSU)

**Source:** SDSU Extension, *2026 Crop Production Budgets*, file `P-00138-2026.xlsx`,
Sarah Sellars, Assistant Professor and SDSU Extension Sustainable Farm and Food
Systems Specialist. Downloaded from `extension.sdstate.edu/crop-budgets`,
6 August 2026. Cost estimates are built on FINBIN trends for similar farms and
crops, adjusted for expected costs — the same body of farm records this file
already cites for overhead.

**This source was nearly missed, and the near-miss is the most useful thing in
this section.** The first pass at fuel and repairs was about to ship North Dakota
figures on the stated grounds that *"South Dakota does not publish crop budgets,
the same way it does not publish a custom rate survey."* That was an assumption
carried over from the custom-rate work, and it was wrong. SDSU has published
these annually for years.

The lesson generalises: **"there is no source" is a claim, and it needs looking
up like any other.** It is the same failure mode as the FINBIN whole-farm
division below — a reasonable-sounding premise that nobody checked.

The workbook covers three production zones and four crops. The zones are about
yield potential rather than lines on a map, so a producer picks the one their
ground behaves like:

- East & Central, high production
- East & Central, mid production
- Central & West, low production

| App field | What is offered | Workbook row |
|---|---|---|
| Fuel/Oil | $/acre, per crop per zone (corn $29–36) | `Fuel & Oil` |
| Repairs | $/acre, per crop per zone (corn $64–67) | `Repairs` |
| Crop Insurance | $/acre, per crop per zone ($18–32) | `Crop Insurance` |
| Nitrogen | $0.625/lb of N (urea), and $/acre per crop per zone | `N` rate × `$/unit` |
| Phosphorus | $0.7692/lb of P₂O₅, and $/acre per crop per zone | `P2O5` rate × `$/unit` |
| Potassium | $0.3917/lb of K₂O, and $/acre per crop per zone | `K2O` rate × `$/unit` |
| Seed | $/unit of seed, and $/acre per crop per zone | `Seed price, $/unit`, `Seed` |
| Seeds per bag or unit | 80,000 / 140,000 | `Seeding rate` denominations |

### Why fuel and repairs came from here and not from Iowa

**Iowa A1-20 cannot fill these two lines, and the reason is structural.** Its
`Estimated Machinery Costs` table reports one *"Variable Cost (fuel, oil,
repairs)"* figure per field operation. This app keeps fuel and repairs on
separate lines, and splitting a combined figure between two boxes would mean
inventing the ratio. SDSU reports them separately, so it is used.

The North Dakota budgets (Ron Haugen, NDSU) also report them separately and were
extracted before SDSU was found. They are not shipped for these two lines: with a
South Dakota source in hand, a North Dakota one is strictly worse for a South
Dakota tool.

### The per-acre nutrient figures are DERIVED, and here is the check

The workbook publishes **one `Fertilizer` line per crop**, not a cost per
nutrient. The per-acre figures offered for nitrogen, phosphorus, and potassium
are therefore derived: each zone's rate in pounds, times that nutrient's price
per pound.

TYPICAL-VALUES.md is explicit that a derived rate has to be checked against a
line whose right answer is already known. It was:

**N + P₂O₅ + K₂O, at the workbook's own rates and prices, reproduces the
published `Fertilizer` figure to the cent, for every crop that takes no sulfur,
in all three zones.**

```
East & Central high, soybeans:   0×0.625 + 47×0.769231 + 66×0.391667 = 62.0038
workbook Fertilizer:                                                    62.0038
East & Central high, spring wheat: 125×0.625 + 45×0.769231 + 60×0.391667 = 136.2404
workbook Fertilizer:                                                       136.2404
```

Corn is excluded from the reconciliation because it also takes sulfur (15 lb in
the high zone, 10 lb in the mid), and this app has no sulfur line. Its NPK
subtotal reconciles once the sulfur is added back.

The prices come from the workbook's `Input Assumptions` sheet, derived the way it
derives them — price per ton, over 2000, over the analysis:

- Urea, 46% N, $575/ton → **$0.625/lb of N**
- MAP 11-52-0, $800/ton → **$0.7692/lb of P₂O₅**
- Potash 0-0-60, $470/ton → **$0.3917/lb of K₂O**

### Four nitrogen sources, one corrected figure, and one from out of state

The nitrogen line offers a choice of product, because urea is not what everyone
buys. Three come off the same `$ per ton` column; the fourth does not exist in
any South Dakota source and is explained below.

| Product | $/ton | Analysis | $/lb of N |
|---|---|---|---|
| Urea 46-0-0 | 575 | 46% N | **0.625** |
| UAN solution 28-0-0 | 395 | 28% N | **0.705** |
| Ammonium sulfate 21-0-0-24S | 510 | 21% N | **1.214** |
| Anhydrous ammonia 82-0-0 *(Illinois)* | 786 | 82% N | **0.4793** |

**The AMS figure is a correction, and this is the record of it.** The workbook
publishes AMS nitrogen at **$2.3182/lb**, which is `0.255 ÷ 0.11` — it divides by
**11%**, the nitrogen content of the *MAP row above it*, rather than by AMS's own
21%. The sulfur figure on the same row is right (`0.255 ÷ 0.24 = 1.0625`), and its
being right is what makes this a dragged formula rather than a different
convention. Shipping the published number would price nitrogen at nearly twice
what it costs.

`test/typical-values.test.js` asserts the corrected derivation under *every
nitrogen source is priced off its own analysis*, with the discrepancy named in
the test so nobody "fixes" it back to the sheet.

**MAP 11-52-0 and 10-34-0 are in the same table and are deliberately not
offered.** Charging a whole multi-nutrient product to nitrogen prices N at $3.64
and $3.00 a pound, five times urea, because the phosphate in the bag is being
paid for on the nitrogen line. Anyone adding them has to split the cost between
the nutrients first. A test caps every offered N price below $2/lb, which is what
catches a blend arriving unsplit.

**Anhydrous ammonia comes from four states away, and the option says so.**

It was listed under *Deliberately NOT shipped* for one reason: nothing in South
Dakota publishes a price for it. That is still true, and it was checked rather
than assumed — the SDSU workbook's fertilizer price table carries MAP, urea,
potash, AMS, 28% UAN and 10-34-0 and no anhydrous under any name, the three
southern North Dakota budgets do not mention it, and Iowa A1-20 prices nitrogen
as one blended `$0.53/lb` without naming a source.

Shipping it anyway is a judgment call, and the case for it is that 82-0-0 is the
cheapest nitrogen per pound and what most corn acres in the eastern Dakotas
actually get. A picker offering urea, UAN, and ammonium sulfate and not this one
is missing the product a producer is most likely to be pricing, which is the same
complaint that added the material groups in the first place.

The figure is **$786/ton ÷ 2000 ÷ 0.82 = $0.4793/lb of N**, from *Fertilizer
Decisions for the 2026 Crop Year* (Paulson, Schnitkey, Monaco, and Zulauf,
farmdoc daily, University of Illinois, 12 August 2025) — an extension
publication, with named authors and a date, which is the bar this file set for it.

Three things make an Illinois figure tolerable here:

- **The same publication prices two products we already have, and both agree.**
  Its urea works out at $0.6457/lb of N against South Dakota's $0.625, and its
  28% at $0.7696 against $0.705. Both within a tenth. That is the evidence that a
  nitrogen price does not move much across the Corn Belt, and it is the same
  cross-check discipline the FINBIN near-miss produced.
- **The state is on the option row**, exactly as the insecticide options carry
  theirs, and the spec's note says every other price in the picker is South
  Dakota's.
- **It is listed last**, after the three South Dakota products. The first
  per-pound option is also the one the per-acre groups were computed from, which
  a test pins; an out-of-state figure at the top of that list would quietly break
  it.

The application charge is a separate cost, as it is for every product here, and
the application group below prices exactly this pass ("Anhydrous, injecting with
tool bar", $15.55/acre).

**What would replace it:** a South Dakota or upper-plains extension price series
carrying anhydrous. If one appears, drop the Illinois row rather than keeping
both.

All of this is asserted in `test/typical-values.test.js` under *South Dakota crop
budgets, as published* and *the three nutrients are offered on the same terms*,
including the reconciliation above.

### Nitrogen carries material AND application, and says they are different

The nitrogen picker previously offered Iowa custom **application** rates only,
with materials explicitly excluded in its note. That was accurate and lopsided:
a producer could pick $15.55 and book a nitrogen line with no nitrogen in it.

It now carries three kinds of group — a cost per pound, a cost per acre by zone,
and the original application rates — and its note says in as many words that a
custom-applied acre is the sum of a material figure and an application figure.

**Every picker heading says "cost", never "price".** The two words were mixed
across the fertilizer and seed groups, and a producer reading down a column of
expense lines should not have to work out whether the difference means anything.
It does not. "Price" survives only where the app genuinely means one: `Price /
unit` on the income side, which is what the crop sells for.

**The spreading charge is offered on the nitrogen line only.** It is quoted once
per pass, and repeating it under phosphorus and potassium would have it entered
three times. Both of those notes point at the nitrogen line instead. Asserted.

---

## Shipped — insecticide, from two states that disagree

**Sources:** NDSU (below) for most crops; Iowa A1-20 for corn.

SDSU reports a single `Pesticides/Herbicides` figure, which cannot fill a line
this app keeps separate from herbicide. So insecticide is the one line taken from
its neighbours, and they disagree sharply on the crop most producers here grow:

| Crop | Figure | From |
|---|---|---|
| Corn following corn | $25.00/acre | Iowa (rootworm) |
| Corn silage | $25.00/acre | Iowa |
| Soybeans | $4.00/acre | North Dakota |
| Field peas | $6.00/acre | North Dakota |
| Oil sunflower | $5.00/acre | North Dakota |
| Confection sunflower | $10.00/acre | North Dakota |

**A crop absent from that list is one whose budget carries no insecticide.** The
North Dakota budgets book none on corn, small grain, oats, or barley, and those
were briefly shipped as a second group of explicit $0 rows. That was honest and
useless: a button that fills a box with nothing is a tap to achieve what leaving
the line alone already does, and it padded a six-row picker to nine with rows
nobody would ever choose. A test now asserts every option is above zero.

The disagreement between the two states on corn is still visible, because both
corn rows are there and each names its state.

**The state is named on each OPTION, not in the group heading.** The house rule
is that group labels carry no source citations — provenance goes in the `source`
footer. Which state a figure is from is not a citation here; it is the entire
difference between $0 and $25, and it belongs on the row being chosen. Asserted
in `test/typical-values.test.js` under *insecticide, where the two states
disagree*, which checks both halves so neither can be "tidied" into the other.

---

## Shipped — seeds per bag or unit, and why the list is two crops long

**Sources:** SDSU `P-00138-2026` (seeding rates and seed prices); Iowa A1-20 for
the bag and unit sizes those prices are quoted against.

The seed line's `seeds/ac` entry mode divides by a seeds-per-unit figure. **One
denomination per crop**, and both are the bag the seed is actually bought in:

- **80,000-seed bag** — corn
- **140,000-seed bag** — soybeans ($51.00–63.10)

**Corn is PUBLISHED per thousand seeds ($3.79–3.80), and that denomination was
offered alongside the bag until it was taken out.** Two ways of quoting the same
corn seed, sitting next to each other on one list, is a choice a producer has to
work out before they can answer anything — and the two pickers fill the two
halves of one multiplication, so picking the bag in one and the thousand in the
other is wrong by a factor of eighty with nothing on screen to show it. The
published price is converted instead: $3.80 × 80 = **$304.00 a bag**. A test
asserts that conversion, and another asserts no note or label anywhere still
mentions a per-thousand price.

**Corn and soybeans are the whole list, and that is a finding rather than a gap:**

- **Wheat, oats, and barley** are priced **by weight**. SDSU quotes spring and
  winter wheat per hundredweight. A seeds-per-unit figure is not a thing they
  have, and the line's ordinary `$/unit × units per acre` mode is already the
  right shape for them.
- **Sunflower and sorghum** are absent from every source checked. The North
  Dakota budgets give a seed cost per acre with **no seeding rate behind it**,
  and SDSU does not budget them at all.

So nothing is guessed to fill the list out. `SEED_CROPS` in
`src/data/typical-values.js` is the table, and a crop not on it gets no
suggestion — the same answer this file gives everywhere it has no citation.

**This is also the one field in the app that can fill itself.** See CLAUDE.md,
*Nothing auto-fills*, for the four guards that make that safe. `matchCrop()` is
deliberately stricter than `matchCategory()`: the latter also matches when the
catalog entry contains the query, which is right for a type-ahead offering
suggestions and wrong for something that writes a number into a box. Two
characters of "co" must not resolve to corn.

---

## Deliberately NOT shipped

### Seeds per unit for sunflower, sorghum, and the small grains

**Two different reasons, and neither is "we ran out of time."**

**Small grains do not have this figure.** Wheat, oats, and barley are priced and
seeded **by weight** — SDSU quotes spring and winter wheat per hundredweight. A
seeds-per-unit denominator is not a thing that exists for them, and the line's
ordinary `$/unit × units per acre` mode is already the correct shape. Offering a
population mode there would be inventing a unit the crop is not sold in.

**Sunflower and sorghum have no published seeding rate.** The NDSU budgets carry
a seed cost per acre with no rate behind it; SDSU does not budget either crop.
Sunflower populations are widely quoted in agronomy guides, but a population
without a matching seeds-per-unit denomination from the same document is half a
figure, and pairing one source's rate with another's bag size is the same
category error as the FINBIN whole-farm division.

If this is revisited, the bar is a single document giving **both** a seeding rate
in seeds per acre **and** the denomination its seed price is quoted in.

### A *South Dakota* anhydrous ammonia price

Anhydrous itself now ships, from Illinois — see *Four nitrogen sources* above for
the figure and the argument. What is still missing is a South Dakota one, and
nothing found so far comes close: the SDSU workbook's fertilizer table lists
urea, MAP, AMS, potash, 28% UAN, and 10-34-0 and stops; the three southern North
Dakota budgets do not price it; and Iowa A1-20 quotes one blended `$0.53/lb of N`
across all sources.

A retail anhydrous price is easy to find and most of the places it is easy to
find are not surveys. The bar is unchanged: **a published price series from an
extension service or a USDA report, with a date on it.** If an upper-plains one
appears, it replaces the Illinois row rather than joining it.

### Herbicide materials

SDSU publishes a combined `Pesticides/Herbicides` figure per crop (corn $51,
soybeans $65, spring wheat $40, winter wheat $37). It is **not** shipped on the
herbicide line, because it spans herbicide *and* insecticide, and this app keeps
those on separate lines. Putting the combined figure on one of them would
double-count against the other.

The herbicide line keeps its Iowa custom-rate **application** figures, which are
what they say they are. A herbicide materials figure needs a source that reports
it separately from insecticide.

### Sulfur

SDSU budgets sulfur (15 lb on high-zone corn, 10 lb mid, at $1.0625/lb) and the
app has no sulfur line. This is a gap in the app, not in the data. Until there is
one, sulfur is part of what a producer enters under a nutrient line of their own
choosing, and the nutrient reconciliation in this file excludes corn because of
it.

### Equipment purchase prices

**Settled: there is no source, because the publisher does not have one either.**

The last open candidate was Iowa State's `a3-29machcostcalc.xlsx`. It has now
been read. The calculator does **not** contain a price table — rows 11 and 12 of
its input sheet ask the user for *"Original purchase price of machine"* and
*"Current list price of comparable new machine"*. The most authoritative
machinery-cost tool in the region treats purchase price as something only the
producer can supply, and so does this app.

The other figures reachable during the research pass were the two in Purdue's
2017 case farm — $289,381 for a 270 PTO hp tractor, $71,315 for a 44 ft field
cultivator. Those are **one farm's purchases from 2017**, not a survey, and
used-equipment values have moved violently since 2020. A citation under them
would lend authority to a number that is wrong twice over: wrong year, wrong farm.

If this is ever revisited, the bar from the original plan still stands — 
**size-scaled bands** ($/horsepower for tractors, $/row for planters, $/foot of
width for tillage), *new / good used / older*, with the source year on the modal.
No source that clears it has been found, and A3-29 is no longer a candidate.

### South Dakota yields

**Not shipped. Sources identified but not current enough to use.**

NASS county yield maps for South Dakota were last published for the **2023**
crop year (released February 2024); the county-estimate URLs for corn, soybeans
and wheat returned 404 during this pass. A three-year-old county yield is a poor
default in a tool a producer will use to budget next season, and it competes
with a number they already know better than NASS does — their own.

> **If revisited:** the argument for shipping this is the classroom, not the
> farm — a Soil Health School student with no yield history of their own needs
> somewhere to start. If it is added, label it by crop year prominently and put
> it behind wording that pushes producers to their own records first.

### Prices received

**Not shipped, and recommended against.**

This is a category difference, not a sourcing gap. Grain prices move weekly. A
typical value is baked into a PWA that is designed to work offline for a whole
season at a Soil Health School with no signal — so a shipped price would be
stale within a month, and stale in a way the producer cannot see, because the
modal would still be showing a citation.

Every other value in this file is a rate or a convention that moves slowly enough
for an annual figure to stay honest. A price is not. The right treatment for this
field is what it has now: no link, and the producer enters the bid they can
actually get.

### South Dakota land rent

**Now shipped** — see *Shipped — South Dakota, fully sourced* above.

### Overhead — utilities, farm insurance, dues & professional fees, miscellaneous

**Now shipped** — see *Shipped — South Dakota overhead* above.

---

## Source documents

Kept outside the repository:

- `SimpleFarmPlanBudget (002).xlsx` — the spreadsheet this app reproduces
- `Iowa State Custom Rates.pdf` — the 2026 custom rate survey (A3-10)

Both are in the SDSHC OneDrive under `Attachments/Received/`.

Read during the research pass and worth keeping alongside them:

- `a3-29.pdf` — *Estimating Farm Machinery Costs*, A3-29 / PM 710, rev. March 2026
  (useful life rule of thumb; Tables 1a/1b remaining value)
- `a3-29machcostcalc.xlsx` — its companion calculator, v1.9, William Edwards
  (the `Data` sheet carries repair-cost factors, wear-out hours, and the
  remaining-value regression coefficients behind Tables 1a/1b)
- `25SDcashrents.pdf` — USDA NASS South Dakota county cash rents, 23 Aug 2025

`extension.iastate.edu` returns HTTP 403 to automated fetches; the two Iowa State
files above were downloaded through a browser.

- FINBIN reports `972802` (corn) and `972803` (soybeans) — Crop Enterprise
  Analysis, South Dakota 2025, the overhead figures
- FINBIN reports `972799` / `972801` — the whole-farm route that was rejected;
  keep them, they are the evidence for why
- `P-00138-2026.xlsx` — SDSU Extension, *2026 Crop Production Budgets*, Sarah
  Sellars. From `extension.sdstate.edu/crop-budgets`, which also carries every
  year back to 2004. **The primary source for fuel, repairs, crop insurance, the
  three nutrients, and seed.** Fetches fine without a browser.
- `a1-20.pdf` — *Estimated Costs of Crop Production in Iowa 2026*, A1-20 /
  FM 1712, Chad Hart. Used for the corn insecticide charge and for the bag and
  unit sizes seed is priced against. Its `Estimated Machinery Costs` table is
  the one that combines fuel, oil, and repairs into a single figure and so
  cannot fill this app's two lines.
- NDSU *2026 Projected Crop Budgets*, Ron Haugen — `SW_26Bud.xls`,
  `SC_26Bud.xls`, `SE_26Bud.xls`, the three regions bordering South Dakota.
  From `ndsu.edu/agriculture/extension/ag-topics/farm-management/crop-economics/projected-crop-budgets`.
  Shipped for insecticide only; kept because they are the evidence behind the
  $0-on-corn figure that disagrees with Iowa.

---

## Adding a new typical value

1. Find the figure in a document you have actually read. Note its publisher,
   title, edition/year and the geography it covers.
2. Add it to `src/data/typical-values.js` with a `source` string.
3. Add a row to this file.
4. If the figure is a convention rather than a published statistic, mark it
   `status: 'provisional'` and list it under *verification outstanding*.
5. If you cannot complete step 1, **stop.** Ship the field without a link.
