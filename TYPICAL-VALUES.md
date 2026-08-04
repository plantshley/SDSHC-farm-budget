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

## Deliberately NOT shipped

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

---

## Adding a new typical value

1. Find the figure in a document you have actually read. Note its publisher,
   title, edition/year and the geography it covers.
2. Add it to `src/data/typical-values.js` with a `source` string.
3. Add a row to this file.
4. If the figure is a convention rather than a published statistic, mark it
   `status: 'provisional'` and list it under *verification outstanding*.
5. If you cannot complete step 1, **stop.** Ship the field without a link.
