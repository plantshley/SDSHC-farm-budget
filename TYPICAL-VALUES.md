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

## Shipped — method, not market data

**Salvage value** (`salvageValue`) offers shares of the purchase price the
producer has already entered — 40/30/25/20/10% and $0 — resolved from the
sentinel `=0.25*initialCost` at apply time.

These are **not** presented as researched market values, and the modal says so.
Salvage value is conventionally estimated as a share of purchase price; these are
common starting points for that arithmetic. The app tells producers to use what
their machine would actually trade for if they know it.

---

## Shipped — PROVISIONAL, verification outstanding

Marked `status: 'provisional'` in the data file. The app shows a caution line on
these modals: *"These are commonly used figures, not survey data."*

- **`usefulLifeEquipment`** — tractor 12–15 yr, combine 10 yr, planter/drill 15 yr,
  tillage 15 yr, sprayer 12 yr, grain handling 15 yr, truck 15 yr, skid loader
  12 yr, haying 12 yr.
- **`usefulLifeBuilding`** — machine shed/shop 30 yr, grain bin 25 yr, livestock
  barn 25 yr, fencing 20 yr, water system 20 yr.

These are long-standing conventions in farm machinery cost estimation, but the
specific figures have **not** been checked line by line against a current
edition of a published source.

> **TO DO before wide release:** verify each against Iowa State AgDM A3-29
> *Estimating Farm Machinery Costs* and/or ASABE Standard D497, then either
> correct the figures and remove `status: 'provisional'`, or drop the entries.

---

## Deliberately NOT shipped

### Equipment purchase prices

**No source, so no link.** The custom rate survey covers services, not machinery
prices. A single "typical tractor price" would be actively misleading: new vs.
used and machine size dominate, and equipment prices have moved sharply since
2020.

If this is added later, it must be **size-scaled bands** — $/horsepower for
tractors, $/row for planters, $/foot of width for tillage — shown as
*new / good used / older* ranges with the source year stamped on the modal, and
a line telling producers to use what they actually paid. Candidate source: Iowa
State AgDM A3-29 and its `a3-29machcostcalc.xlsx` calculator, both cited inside
the custom rate survey PDF.

### South Dakota land rent, yields and prices

**Not yet researched, so no link.** These are the values that would benefit most
from being South Dakota specific, and they are the most sensitive to being wrong.

> **TO DO:** source from
> - USDA NASS *South Dakota Cash Rents* (county-level, annual)
> - USDA NASS *Prices Received* and county yield data for South Dakota
> - SDSU Extension crop budgets
> - South Dakota Farm Business Management association summaries
>
> Record each figure, its year, and its geography here before adding it to the
> app. County-level variation in South Dakota is large enough that a single
> statewide land rent number may do more harm than good — consider offering a
> range by region rather than one figure.

---

## Source documents

Kept outside the repository:

- `SimpleFarmPlanBudget (002).xlsx` — the spreadsheet this app reproduces
- `Iowa State Custom Rates.pdf` — the 2026 survey above

Both are in the SDSHC OneDrive under `Attachments/Received/`.

---

## Adding a new typical value

1. Find the figure in a document you have actually read. Note its publisher,
   title, edition/year and the geography it covers.
2. Add it to `src/data/typical-values.js` with a `source` string.
3. Add a row to this file.
4. If the figure is a convention rather than a published statistic, mark it
   `status: 'provisional'` and list it under *verification outstanding*.
5. If you cannot complete step 1, **stop.** Ship the field without a link.
