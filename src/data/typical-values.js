/**
 * Typical values offered by the "use typical value" links.
 *
 * RULE: nothing in this file may be invented. Every entry carries a `source`
 * that names where the figure came from, and that source is recorded in
 * TYPICAL-VALUES.md. Where no citable source exists, there is NO entry — the
 * link simply does not appear on that field. A missing suggestion is honest;
 * a fabricated one is not.
 *
 * `status: 'provisional'` marks entries whose figures are widely-used
 * engineering conventions rather than a document we have read end to end. They
 * are shown with a caution line and are listed for verification in
 * TYPICAL-VALUES.md.
 *
 * SENTINELS: a value of the form '=0.25*initialCost' is resolved against
 * another field at apply time (see ui/modals.js), following the pattern the
 * Virtual Fence ROI tool uses for '=40*herd'.
 */

const IOWA_2026 =
  'Iowa Farm Custom Rate Survey 2026 (Iowa State University Extension, Ag Decision Maker File A3-10, revised March 2026)'

/**
 * Iowa's crop budgets, as distinct from its custom rate survey above.
 *
 * Used for two things only, both of which South Dakota's own budgets cannot
 * supply: the insecticide charge on continuous corn, and the bag and unit sizes
 * corn and soybean seed are sold in.
 */
const IOWA_A120 =
  'Estimated Costs of Crop Production in Iowa 2026 (Iowa State University Extension, Ag Decision Maker File A1-20, FM 1712, revised January 2026), Chad Hart, extension economist'

/**
 * North Dakota's crop budgets. Present for one line: insecticide, which the
 * South Dakota budgets fold into a single pesticides figure and so cannot fill.
 */
const NDSU_2026 =
  'North Dakota 2026 Projected Crop Budgets, Ron Haugen, NDSU Extension Service. South West (EC1652), South Central (EC1653) and South East (EC1659), the three regions bordering South Dakota. Retrieved 6 August 2026.'

/**
 * Anhydrous ammonia, and the reason it comes from four states away.
 *
 * It is the cheapest nitrogen per pound and the one most corn acres in the
 * eastern Dakotas actually get, so a nitrogen picker offering urea, UAN and
 * ammonium sulfate and not this one is missing the product a producer is most
 * likely to be pricing. It was listed under "deliberately NOT shipped" for one
 * reason: nothing in South Dakota publishes a price for it.
 *
 * That is still true and it was checked rather than assumed. The SDSU budget
 * workbook's fertilizer price table carries MAP, urea, potash, AMS, and 28%
 * UAN, and no anhydrous under any name. Neither do the three southern North
 * Dakota budgets, and neither does Iowa A1-20, which prices nitrogen as one
 * generic $0.53 a pound without naming a source.
 *
 * So the figure is an Illinois one, and the option says so on the row the same
 * way the insecticide options name their state. Cross-checking the other two
 * products in the same publication is what makes that tolerable: its urea works
 * out at $0.65 a pound of N against South Dakota's $0.625, and its 28% at $0.77
 * against $0.705. Both are within a tenth, which is the evidence that a nitrogen
 * price does not change much across the Corn Belt.
 *
 * Anhydrous needs a toolbar and nurse tanks or a custom operator, and that
 * charge is a separate cost. The spec's note already says so for every product
 * here, and the application group below prices exactly this pass.
 */
const FARMDOC_N_2026 =
  'Fertilizer Decisions for the 2026 Crop Year, Nick Paulson, Gary Schnitkey and Henrique Monaco (University of Illinois) and Carl Zulauf (Ohio State University), farmdoc daily, Department of Agricultural and Consumer Economics, University of Illinois at Urbana-Champaign, 12 August 2025. Illinois prices. Retrieved 7 August 2026.'

/**
 * Overhead, from South Dakota farm records.
 *
 * The route to these was not obvious and is worth recording, because the
 * obvious route produces numbers that are wrong by a factor of three.
 *
 * FINBIN's WHOLE FARM income statement reports overhead in whole-farm dollars,
 * which is the shape these fields want. It cannot be used. Its companion
 * `Total crop acres` figure is populated for only some of the farms in the
 * sample while every dollar figure averages over all of them, so the two are not
 * divisible by each other: dividing gives $316/acre of seed and $516/acre of
 * land rent, against a NASS county range that tops out at $251.
 *
 * The CROP ENTERPRISE report does the per-acre division inside each farm's own
 * record, where the acreage is attached to the farm that spent the money. Its
 * subtotals reconcile exactly, its land rent lands at $126.71, and its four
 * overhead lines agree with a separate Minnesota sample to within 15% on six of
 * eight figures. That is what is shipped here.
 */
const FINBIN_2025 =
  'FINBIN, Center for Farm Financial Management, University of Minnesota. Crop Enterprise Analysis, South Dakota, 2025 (reports 972802 and 972803, retrieved 4 August 2026). Eight farms: five from the South Dakota Center for Farm/Ranch Management, three from the Southwest Minnesota Farm Business Management Association.'

const FINBIN_NOTE =
  'Overhead the whole farm carries, spread across its crop acres, taken from farm business records. Choosing a figure multiplies it by the acres you have entered and fills in a yearly total. This is eight farms, so use it to check your own bills rather than in place of them.'

/**
 * One overhead picker.
 *
 * The sentinel multiplies against total farm acres rather than a sibling field,
 * which is what `acres` resolves to in ui/modals.js. `basis: 'year'` is not
 * decoration: the figure produced is annual, and a line left set to "$ / month"
 * would multiply it by twelve on the way into the model.
 */
function overhead(title, corn, soybeans) {
  return {
    title,
    unit: '$/acre × your acres',
    source: FINBIN_2025,
    note: FINBIN_NOTE,
    basis: 'year',
    requires: {
      field: 'acres',
      message: 'Enter your acres on an enterprise above first, then pick a figure.',
    },
    groups: [
      {
        label: 'South Dakota farm records, 2025',
        // No `desc`. The rate itself is now printed on the button as "$6.11
        // /acre", so a caption repeating it in words is a second copy of the
        // same figure to keep in step with the first.
        options: [
          { label: 'Corn farms', value: `=${corn}*acres` },
          { label: 'Soybean farms', value: `=${soybeans}*acres` },
        ],
      },
    ],
  }
}

const IOWA_NOTE =
  'These are Iowa rates, not South Dakota. South Dakota does not publish a custom rate survey. Check these against what local custom operators charge.'

/**
 * South Dakota crop budgets. The primary source for everything below that is
 * not a custom rate.
 *
 * This one was nearly missed, and the near-miss is worth recording. The first
 * pass at fuel and repairs was about to ship North Dakota figures on the
 * assumption that South Dakota publishes no crop budgets, the same way it
 * publishes no custom rate survey. It does. SDSU Extension has published them
 * annually for years, and they carry separate FUEL & OIL and REPAIRS lines,
 * separate N, P2O5 and K2O rates with a price per pound of nutrient, crop
 * insurance, and a seeding rate with a seed price per unit. They are built on
 * FINBIN trends, which this file already cites for overhead.
 *
 * The lesson is the one in TYPICAL-VALUES.md about derived rates: check the
 * assumption before building on it. "There is no source" is a claim, and it
 * needs looking up like any other.
 *
 * Three production zones, four crops. The zones are SDSU's own and are about
 * yield potential rather than lines on a map, so a producer picks the one their
 * ground behaves like.
 */
const SDSU_2026 =
  'SDSU Extension, 2026 Crop Production Budgets (P-00138-2026), Sarah Sellars, Assistant Professor and SDSU Extension Sustainable Farm and Food Systems Specialist. Retrieved 6 August 2026. Cost estimates are built on FINBIN trends for similar farms and crops, adjusted for expected costs.'

const SDSU_NOTE =
  'South Dakota figures, from budgets built on farm business records. The three zones are about yield potential rather than location, so pick the one your ground behaves like. These are a starting point to check your own records against, not a replacement for them.'

/** SDSU's three production zones, in the order the workbook lists them. */
const SDSU_ZONES = ['East and Central, high production', 'East and Central, mid production', 'Central and West, low production']

/**
 * One SDSU picker: a group per zone, an option per crop.
 *
 * `values` is [corn, soybeans, spring wheat, winter wheat] per zone, in the
 * workbook's own column order. A null drops that crop from that zone rather
 * than printing a $0 the budget never claimed.
 */
function sdsuByZone(title, unit, values, extra = {}) {
  const crops = ['Corn', 'Soybeans', 'Spring wheat', 'Winter wheat']
  return {
    title,
    unit,
    appliesTo: 'perAcre',
    source: SDSU_2026,
    note: SDSU_NOTE,
    ...extra,
    groups: SDSU_ZONES.map((label, z) => ({
      label,
      options: crops
        .map((crop, c) => ({ label: crop, value: values[z][c] }))
        .filter((o) => o.value != null),
    })),
  }
}

/**
 * Build one salvage group per A3-29 Table 1b machine class.
 *
 * The three ages are the same ones the useful-life picker offers, so a producer
 * who has said "I keep a planter twelve years" can answer both questions from
 * that one decision instead of guessing a percentage separately.
 */
function tableOneB(classes) {
  return classes.map(({ label, cats, ten, twelve, fifteen }) => ({
    label,
    table: '1b',
    options: [
      [10, ten],
      [12, twelve],
      [15, fifteen],
    ].map(([years, share]) => ({
      label: `Kept ${years} years — ${Math.round(share * 100)}%`,
      value: `=${share.toFixed(2)}*initialCost`,
      desc: '',
      categories: cats,
    })),
  }))
}

export const TYPICAL_VALUES = {
  /* ── Variable expenses ────────────────────────────────────────────────── */

  customHire: {
    title: 'Custom Hire',
    unit: '$/acre',
    appliesTo: 'perAcre',
    source: IOWA_2026,
    note: IOWA_NOTE,
    groups: [
      {
        label: 'Complete custom farming (tillage through hauling)',
        options: [
          { label: 'Corn', value: 177.85, desc: 'average; typical range $74.50–$375' },
          { label: 'Soybeans', value: 161.7, desc: 'average; typical range $65–$353' },
          { label: 'Small grain', value: 186.15, desc: 'average; typical range $70–$290' },
        ],
      },
      {
        label: 'Tillage',
        options: [
          { label: 'Vertical tillage', value: 22.15, desc: 'average; range $12–$30' },
          { label: 'Chisel plowing', value: 20.75, desc: 'average; range $10–$28' },
          { label: 'Disk/chiseling', value: 23.0, desc: 'average; range $10–$34' },
          { label: 'Field cultivating', value: 19.2, desc: 'average; range $7.60–$32' },
          { label: 'Strip tillage, no fertilizer', value: 23.2, desc: 'average; range $15–$30' },
        ],
      },
      {
        label: 'Planting & drilling',
        options: [
          { label: 'No-till planter', value: 29.1, desc: 'average; range $15–$46' },
          { label: 'Planter, no attachments', value: 26.5, desc: 'average; range $15–$38' },
          { label: 'Planter with fertilizer & insecticide', value: 29.6, desc: 'average; range $16–$50' },
          { label: 'Drilling soybeans, no-till', value: 24.15, desc: 'average; range $15–$32' },
          { label: 'Drilling small grain', value: 19.45, desc: 'average; range $10–$27' },
        ],
      },
      {
        label: 'Harvest',
        options: [
          { label: 'Corn combining', value: 46.05, desc: 'average; range $25–$80' },
          { label: 'Soybean combining', value: 43.05, desc: 'average; range $24–$70' },
          { label: 'Small grain combining', value: 47.0, desc: 'average; range $35–$65' },
          { label: 'Corn, combine + cart + haul to farm', value: 82.0, desc: 'average; range $40–$175' },
          { label: 'Soybeans, combine + cart + haul to farm', value: 77.4, desc: 'average; range $32–$175' },
        ],
      },
    ],
  },

  herbicide: {
    title: 'Herbicide application',
    unit: '$/acre (application only — materials not included)',
    appliesTo: 'perAcre',
    source: IOWA_2026,
    note: `${IOWA_NOTE} These cover the APPLICATION only; the chemical itself is extra.`,
    groups: [
      {
        label: 'Spraying',
        options: [
          { label: 'Ground, self-propelled, broadcast', value: 9.35, desc: 'average; range $5–$18' },
          { label: 'Ground, tractor, broadcast', value: 8.5, desc: 'average; range $5–$14' },
          { label: 'Ground, self-propelled, tall crop', value: 11.15, desc: 'average; range $6–$20' },
          { label: 'Aerial', value: 12.0, desc: 'average; range $9–$18' },
          { label: 'Drone', value: 12.5, desc: 'average; range $8–$16' },
        ],
      },
    ],
  },

  /* ── Fertilizer ────────────────────────────────────────────────────────
     All three nutrients offer the same two things, and that symmetry is the
     point: a picker that quotes a price per pound for potash and nothing at all
     for nitrogen invites a budget with two nutrients costed and one left blank.

     Nitrogen carries a third group the other two do not, because it is the only
     one the Iowa custom rate survey prices an APPLICATION for. That group is
     the pre-existing content of this spec and it is a different quantity from
     the two above it: the charge for putting fertilizer on, with no fertilizer
     in it. A custom-applied acre is the sum of a material figure and an
     application figure, which the note says in as many words, because picking
     $15.55 and stopping books a nitrogen line with no nitrogen in it.

     The spreading charge is quoted ONCE per pass and belongs on one line. It is
     offered here and deliberately not repeated under phosphorus and potassium,
     where three copies of it would be entered three times. */
  nitrogen: {
    title: 'Nitrogen',
    unit: '$/lb of N',
    appliesTo: 'unit',
    source: `${SDSU_2026} Anhydrous ammonia: ${FARMDOC_N_2026} Application rates: ${IOWA_2026}`,
    note: 'Material and application are two separate costs. If someone else applies your fertilizer, your total for this line is a material figure plus an application figure. Picking an application rate on its own books a nitrogen line with no nitrogen in it. Every price below is South Dakota except anhydrous ammonia, which is an Illinois figure and is marked as one.',
    groups: [
      // One entry per N source. Three of the four are priced off the same SDSU
      // $/ton table; anhydrous is not in it, or in any South Dakota source, and
      // comes from Illinois with the state on its own row — see
      // FARMDOC_N_2026 above for why that is worth doing anyway.
      //
      // Only SINGLE-nitrogen products are here. MAP 11-52-0 and 10-34-0 are in
      // the same table and are deliberately left out: charging a whole
      // multi-nutrient product to nitrogen prices N at $3.64 and $3.00 a pound,
      // five times urea, because the phosphate in the bag is being paid for on
      // the nitrogen line. Whoever ships those has to split them first.
      //
      // AMS is the borderline case and it is shipped with the split stated: it
      // supplies sulfur as well, and this app has no sulfur line, so its whole
      // cost lands on nitrogen. Its figure is ALSO a correction — see
      // TYPICAL-VALUES.md. The workbook divides AMS by 11% nitrogen rather than
      // its actual 21%, a formula dragged down from the MAP row above it, which
      // puts its published N price at $2.32 instead of $1.21. The sulfur figure
      // on the same row is right, which is what makes the slip visible.
      {
        label: 'Cost per pound of nitrogen',
        options: [
          { label: 'Urea, 46-0-0', value: 0.625, desc: '$575 a ton' },
          { label: 'UAN solution, 28-0-0', value: 0.705, desc: '$395 a ton' },
          {
            label: 'Ammonium sulfate, 21-0-0-24S',
            value: 1.214,
            desc: '$510 a ton, and it supplies sulfur as well',
          },
          // Last, after the three South Dakota ones, because it is the odd one
          // out and the block above it should read as a single set. The first
          // option is also the price the per-acre groups below were computed
          // from, which a test pins; an out-of-state figure at the top of the
          // list would quietly break that.
          {
            label: 'Anhydrous ammonia, 82-0-0, Illinois',
            value: 0.4793,
            desc: '$786 a ton; the state is on this row because South Dakota publishes no anhydrous price',
          },
        ],
      },
      {
        label: 'Cost per acre, East and Central high production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 93.75, desc: '150 lb of N per acre' },
          { label: 'Spring wheat', value: 78.13, desc: '125 lb of N per acre' },
          { label: 'Winter wheat', value: 101.25, desc: '162 lb of N per acre' },
        ],
      },
      {
        label: 'Cost per acre, East and Central mid production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 68.75, desc: '110 lb of N per acre' },
          { label: 'Spring wheat', value: 56.25, desc: '90 lb of N per acre' },
          { label: 'Winter wheat', value: 68.75, desc: '110 lb of N per acre' },
        ],
      },
      {
        label: 'Cost per acre, Central and West low production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 50.0, desc: '80 lb of N per acre' },
          { label: 'Spring wheat', value: 31.25, desc: '50 lb of N per acre' },
          { label: 'Winter wheat', value: 53.13, desc: '85 lb of N per acre' },
        ],
      },
      {
        label: 'Application only, fertilizer not included',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Anhydrous, injecting with tool bar', value: 15.55, desc: 'average; range $7–$28' },
          { label: 'Anhydrous, injecting without tool bar', value: 13.45, desc: 'average; range $8–$20' },
          { label: 'Liquid, side dressing', value: 14.1, desc: 'average; range $9–$20' },
          { label: 'Liquid, spraying', value: 9.45, desc: 'average; range $5–$15' },
          { label: 'Dry bulk, applied', value: 8.15, desc: 'average; range $4–$13.50' },
        ],
      },
    ],
  },

  phosphorus: {
    title: 'Phosphorus',
    unit: '$/lb of P2O5',
    appliesTo: 'unit',
    source: SDSU_2026,
    note: 'The pounds per acre are your soil test, not ours, so the cost per pound leaves that box to you. The per-acre figures below use the rate the South Dakota budgets assume for that zone. Spreading is charged once per pass and is offered on the nitrogen line.',
    groups: [
      {
        label: 'Cost per pound of phosphate',
        options: [{ label: 'MAP 11-52-0, South Dakota', value: 0.7692 }],
      },
      {
        label: 'Cost per acre, East and Central high production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 47.69, desc: '62 lb of P2O5 per acre' },
          { label: 'Soybeans', value: 36.15, desc: '47 lb of P2O5 per acre' },
          { label: 'Spring wheat', value: 34.62, desc: '45 lb of P2O5 per acre' },
          { label: 'Winter wheat', value: 34.62, desc: '45 lb of P2O5 per acre' },
        ],
      },
      {
        label: 'Cost per acre, East and Central mid production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 34.62, desc: '45 lb of P2O5 per acre' },
          { label: 'Soybeans', value: 26.92, desc: '35 lb of P2O5 per acre' },
          { label: 'Spring wheat', value: 26.92, desc: '35 lb of P2O5 per acre' },
          { label: 'Winter wheat', value: 26.92, desc: '35 lb of P2O5 per acre' },
        ],
      },
      {
        label: 'Cost per acre, Central and West low production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 26.92, desc: '35 lb of P2O5 per acre' },
          { label: 'Soybeans', value: 19.23, desc: '25 lb of P2O5 per acre' },
          { label: 'Spring wheat', value: 15.38, desc: '20 lb of P2O5 per acre' },
          { label: 'Winter wheat', value: 23.08, desc: '30 lb of P2O5 per acre' },
        ],
      },
    ],
  },

  potassium: {
    title: 'Potassium',
    unit: '$/lb of K2O',
    appliesTo: 'unit',
    source: SDSU_2026,
    note: 'The pounds per acre are your soil test, not ours, so the cost per pound leaves that box to you. The per-acre figures below use the rate the South Dakota budgets assume for that zone. Spreading is charged once per pass and is offered on the nitrogen line.',
    groups: [
      {
        label: 'Cost per pound of potash',
        options: [{ label: 'Potash 0-0-60, South Dakota', value: 0.3917 }],
      },
      {
        label: 'Cost per acre, East and Central high production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 37.21, desc: '95 lb of K2O per acre' },
          { label: 'Soybeans', value: 25.85, desc: '66 lb of K2O per acre' },
          { label: 'Spring wheat', value: 23.5, desc: '60 lb of K2O per acre' },
          { label: 'Winter wheat', value: 23.5, desc: '60 lb of K2O per acre' },
        ],
      },
      {
        label: 'Cost per acre, East and Central mid production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 23.5, desc: '60 lb of K2O per acre' },
          { label: 'Soybeans', value: 15.67, desc: '40 lb of K2O per acre' },
          { label: 'Spring wheat', value: 19.58, desc: '50 lb of K2O per acre' },
          { label: 'Winter wheat', value: 19.58, desc: '50 lb of K2O per acre' },
        ],
      },
      {
        label: 'Cost per acre, Central and West low production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 19.58, desc: '50 lb of K2O per acre' },
          { label: 'Soybeans', value: 3.92, desc: '10 lb of K2O per acre' },
          { label: 'Spring wheat', value: 11.75, desc: '30 lb of K2O per acre' },
          { label: 'Winter wheat', value: 15.67, desc: '40 lb of K2O per acre' },
        ],
      },
    ],
  },

  hauling: {
    title: 'Hauling grain',
    unit: '$/bu',
    appliesTo: 'unit',
    // These are dollars per BUSHEL, so they only mean anything while the
    // enterprise is measured in bushels. Applying one records that on the line;
    // changing the yield unit afterwards clears the figure rather than letting
    // $0.135 a bushel quietly become $0.135 a ton. See markQuotedUnit() in
    // ui/modals.js and the yield-unit handler in main.js.
    quotedPerYieldUnit: 'bu',
    source: IOWA_2026,
    note: IOWA_NOTE,
    groups: [
      {
        label: 'To market by truck',
        options: [
          { label: '5 miles, one way', value: 0.135, desc: 'average; range $0.06–$0.50' },
          { label: '25 miles, one way', value: 0.2, desc: 'average; range $0.09–$0.35' },
          { label: '100 miles, one way', value: 0.405, desc: 'average; range $0.18–$0.65' },
        ],
      },
      {
        label: 'To and from farm storage',
        options: [
          { label: 'To farm storage, wagon', value: 0.095, desc: 'average; range $0.04–$0.15' },
          { label: 'Farm storage to market, wagon', value: 0.125, desc: 'average; range $0.05–$0.24' },
          { label: 'Handling by auger', value: 0.085, desc: 'average; range $0.02–$0.16' },
        ],
      },
    ],
  },

  drying: {
    title: 'Drying corn',
    unit: '$/point per bu',
    appliesTo: 'unit',
    quotedPerYieldUnit: 'bu',
    source: IOWA_2026,
    note: `${IOWA_NOTE} Charged per POINT of moisture removed, per bu. Multiply by the points you expect to remove.`,
    groups: [
      {
        label: 'Drying (includes fuel, electricity, labor)',
        options: [
          { label: 'Continuous flow dryer', value: 0.055, desc: 'average; range $0.025–$0.090' },
          { label: 'Bin dryer', value: 0.05, desc: 'average; range $0.025–$0.060' },
        ],
      },
    ],
  },

  /* ── Fuel and repairs ──────────────────────────────────────────────────
     Both were asked for on the grounds that a season's fuel is genuinely hard
     to estimate: it spans tillage, planting, spraying, harvest and trucking,
     across machinery that reports nothing about what it burns.

     SDSU is the only source checked that reports the two SEPARATELY, which is
     what the app needs, because it keeps them on separate lines. The Iowa
     machinery table lumps fuel, oil AND repairs into a single "variable cost"
     per operation, and splitting that between two boxes would mean inventing
     the ratio. */
  fuelOil: sdsuByZone(
    'Fuel and oil',
    '$/acre',
    [
      [36, 22, 20, 20],
      [36, 23, 26, 21],
      [29, 27, 20, 20],
    ],
    {
      note: `${SDSU_NOTE} This covers a season of field operations for the crop: tillage, planting, spraying, and harvest. Trucking beyond the farm is on the hauling line.`,
    }
  ),

  repairs: sdsuByZone(
    'Repairs',
    '$/acre',
    [
      [66, 41, 36, 36],
      [67, 41, 36, 34],
      [64, 36, 33, 34],
    ],
    {
      note: `${SDSU_NOTE} Machinery repairs and maintenance for the crop's field operations. What you paid to own the machine is a fixed cost and belongs in the equipment block below.`,
    }
  ),

  cropInsurance: sdsuByZone('Crop insurance', '$/acre', [
    [32, 26, 22, 22],
    [31, 27, 21, 22],
    [27, 23, 19, 18],
  ]),

  /* Insecticide is the one line SDSU cannot fill: it reports a single
     "Pesticides/Herbicides" figure, and this app keeps insecticide separate
     from herbicide. So it takes both neighbours, and they disagree — sharply,
     on the crop most people here grow. Iowa budgets $25 an acre where corn
     follows corn; the North Dakota budgets carry no insecticide on corn at all.

     Both are shown, with the state named on each OPTION rather than in the
     group headings. Which state a figure is from is a fact about that option,
     not a citation, and it is the whole difference between $0 and $25. The $0
     rows stay for the same reason: that is what the budget says, and dropping
     them would show the disagreement as a gap. */
  insecticide: {
    title: 'Insecticide',
    unit: '$/acre',
    appliesTo: 'perAcre',
    source: `${NDSU_2026} Corn and corn silage: ${IOWA_A120}`,
    // A crop absent from this list is one whose budget carries no insecticide.
    // That used to be spelled out as a second group of $0 rows, which was
    // honest and useless: a button that fills a box with nothing is a tap to
    // achieve what leaving the line alone already does.
    groups: [
      {
        label: 'Row crops',
        options: [
          { label: 'Corn following corn, Iowa', value: 25.0, desc: 'rootworm' },
          { label: 'Corn silage, Iowa', value: 25.0, desc: 'rootworm' },
          { label: 'Soybeans, North Dakota', value: 4.0 },
          { label: 'Field peas, North Dakota', value: 6.0 },
          { label: 'Oil sunflower, North Dakota', value: 5.0 },
          { label: 'Confection sunflower, North Dakota', value: 10.0 },
        ],
      },
    ],
  },

  /* ── Seed ──────────────────────────────────────────────────────────────
     Two pickers, because the seed line asks two different questions.

     `seed` fills a price. `seedsPerBag` fills the denominator of the population
     mode, and is also the one figure in this app that can arrive without being
     asked for — see autofillSeedsPerUnit() in main.js and the SEED_CROPS table
     below. */
  seed: {
    title: 'Seed',
    unit: '$/unit of seed',
    appliesTo: 'unit',
    source: SDSU_2026,
    note: 'Corn and soybeans are priced per bag, wheat by weight. Switch the line to "seeds/ac" if you would rather enter the population you plant at than work out units per acre.',
    groups: [
      {
        // Corn is published per THOUSAND seeds ($3.80) and is converted here to
        // the 80,000-seed bag it is actually bought in, x80. One denomination
        // per crop: two ways of quoting the same corn seed, sitting next to each
        // other on a list, is a choice a producer has to work out before they
        // can answer, and picking the wrong one is off by a factor of eighty.
        label: 'Cost per bag or unit of seed',
        options: [
          { label: 'Corn, per 80,000-seed bag', value: 304.0 },
          { label: 'Soybeans, per 140,000-seed bag', value: 51.0 },
          { label: 'Spring wheat, per hundredweight', value: 21.0 },
          { label: 'Winter wheat, per hundredweight', value: 20.0 },
        ],
      },
      {
        label: 'Cost per acre, East and Central high production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 125.4, desc: '33,000 seeds per acre' },
          { label: 'Soybeans', value: 71.4, desc: '1.4 units per acre' },
          { label: 'Spring wheat', value: 25.2 },
          { label: 'Winter wheat', value: 19.2 },
        ],
      },
      {
        label: 'Cost per acre, East and Central mid production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 117.8, desc: '31,000 seeds per acre' },
          { label: 'Soybeans', value: 61.2, desc: '1.2 units per acre' },
          { label: 'Spring wheat', value: 25.2 },
          { label: 'Winter wheat', value: 19.2 },
        ],
      },
      {
        label: 'Cost per acre, Central and West low production',
        unit: '$/acre',
        appliesTo: 'perAcre',
        options: [
          { label: 'Corn', value: 87.4, desc: '23,000 seeds per acre' },
          { label: 'Soybeans', value: 61.2, desc: '1.2 units per acre' },
          { label: 'Spring wheat', value: 25.2 },
          { label: 'Winter wheat', value: 19.2 },
        ],
      },
    ],
  },

  seedsPerBag: {
    title: 'Seeds per bag or unit',
    unit: 'seeds',
    source: `${SDSU_2026} Bag and unit sizes: ${IOWA_A120}`,
    note: 'The size of one bag or unit of seed. Use the price you pay for that same bag in the first box.',
    groups: [
      {
        label: 'Standard bag or unit',
        options: [
          { label: 'Corn', value: 80000 },
          { label: 'Soybeans', value: 140000 },
        ],
      },
    ],
  },

  miscellaneous: {
    title: 'Miscellaneous field services',
    unit: '$/acre',
    appliesTo: 'perAcre',
    source: IOWA_2026,
    note: IOWA_NOTE,
    groups: [
      {
        label: 'Common services',
        options: [
          { label: 'Scouting crops', value: 6.65, desc: 'average; range $4–$9.50' },
          { label: 'GPS grid soil testing', value: 7.95, desc: 'average; range $3–$12.50' },
          { label: 'Mowing CRP or pasture', value: 27.05, desc: 'average; range $12–$50' },
          { label: 'Chopping cornstalks', value: 14.55, desc: 'average; range $8–$20' },
        ],
      },
    ],
  },

  /* ── Fixed costs ──────────────────────────────────────────────────────── */

  laborRate: {
    title: 'Farm labor wage',
    unit: '$/hour',
    source: IOWA_2026,
    note: `${IOWA_NOTE} Wages for hired labor operating machinery.`,
    groups: [
      {
        label: 'Operating machinery',
        options: [
          { label: 'Spraying or harvesting', value: 24.45, desc: 'average; range $15–$40' },
          { label: 'Other operations', value: 22.95, desc: 'average; range $15–$40' },
        ],
      },
    ],
  },

  /**
   * The one typical value in this file that is actually South Dakota data.
   *
   * NASS publishes these as county maps rather than a table, so the figures
   * were read out of the PDF programmatically rather than typed in by hand:
   * 137 dollar amounts transcribed by eye would eventually carry a wrong one
   * with a USDA citation attached to it.
   *
   * Counties NASS did not publish are absent, not guessed. Fall River and
   * Oglala Lakota have no non-irrigated cropland figure; Clark and Union have
   * no pasture figure; only nine counties have enough irrigated ground to
   * report. A missing county means NASS had too few responses to publish one.
   */
  /* ── Overhead ─────────────────────────────────────────────────────────── */

  overheadUtilities: overhead('Utilities', 6.11, 4.79),
  overheadInsurance: overhead('Farm insurance', 12.49, 9.37),
  overheadDues: overhead('Dues & professional fees', 4.97, 4.29),
  overheadMisc: overhead('Miscellaneous overhead', 8.07, 6.98),

  landRent: {
    title: 'Land rent — South Dakota county averages',
    unit: '$/acre',
    searchPlaceholder: 'Search counties',
    source:
      'USDA National Agricultural Statistics Service, 2025 Cash Rent Paid Per Acre, South Dakota county estimates, released 23 August 2025.',
    note:
      'County averages of what was actually paid for rented ground in 2025. Use your own lease rate where you have one. These are for budgeting ground you have not rented yet, or for checking whether an asking rate is in line.',
    groups: [
      {
        label: 'Cropland, non-irrigated',
        options: [
          { label: 'Aurora County', value: 127 },
          { label: 'Beadle County', value: 128 },
          { label: 'Bennett County', value: 34 },
          { label: 'Bon Homme County', value: 164 },
          { label: 'Brookings County', value: 207 },
          { label: 'Brown County', value: 165 },
          { label: 'Brule County', value: 114 },
          { label: 'Buffalo County', value: 75 },
          { label: 'Butte County', value: 56.5 },
          { label: 'Campbell County', value: 85 },
          { label: 'Charles Mix County', value: 145 },
          { label: 'Clark County', value: 151 },
          { label: 'Clay County', value: 213 },
          { label: 'Codington County', value: 176 },
          { label: 'Corson County', value: 46 },
          { label: 'Custer County', value: 24 },
          { label: 'Davison County', value: 159 },
          { label: 'Day County', value: 149 },
          { label: 'Deuel County', value: 182 },
          { label: 'Dewey County', value: 50 },
          { label: 'Douglas County', value: 144 },
          { label: 'Edmunds County', value: 119 },
          { label: 'Faulk County', value: 111 },
          { label: 'Grant County', value: 157 },
          { label: 'Gregory County', value: 80 },
          { label: 'Haakon County', value: 50 },
          { label: 'Hamlin County', value: 194 },
          { label: 'Hand County', value: 103 },
          { label: 'Hanson County', value: 184 },
          { label: 'Harding County', value: 32.5 },
          { label: 'Hughes County', value: 77 },
          { label: 'Hutchinson County', value: 172 },
          { label: 'Hyde County', value: 76.5 },
          { label: 'Jackson County', value: 47.5 },
          { label: 'Jerauld County', value: 112 },
          { label: 'Jones County', value: 33 },
          { label: 'Kingsbury County', value: 162 },
          { label: 'Lake County', value: 183 },
          { label: 'Lawrence County', value: 29 },
          { label: 'Lincoln County', value: 232 },
          { label: 'Lyman County', value: 94 },
          { label: 'Marshall County', value: 149 },
          { label: 'McCook County', value: 193 },
          { label: 'McPherson County', value: 105 },
          { label: 'Meade County', value: 34 },
          { label: 'Mellette County', value: 43 },
          { label: 'Miner County', value: 146 },
          { label: 'Minnehaha County', value: 212 },
          { label: 'Moody County', value: 251 },
          { label: 'Pennington County', value: 37.5 },
          { label: 'Perkins County', value: 41.5 },
          { label: 'Potter County', value: 97.5 },
          { label: 'Roberts County', value: 174 },
          { label: 'Sanborn County', value: 129 },
          { label: 'Spink County', value: 126 },
          { label: 'Stanley County', value: 42.5 },
          { label: 'Sully County', value: 97 },
          { label: 'Todd County', value: 35.5 },
          { label: 'Tripp County', value: 72 },
          { label: 'Turner County', value: 198 },
          { label: 'Union County', value: 235 },
          { label: 'Walworth County', value: 97.5 },
          { label: 'Yankton County', value: 194 },
          { label: 'Ziebach County', value: 45.5 },
        ],
      },
      {
        label: 'Pasture',
        options: [
          { label: 'Aurora County', value: 59 },
          { label: 'Beadle County', value: 55.5 },
          { label: 'Bennett County', value: 12.5 },
          { label: 'Bon Homme County', value: 53.5 },
          { label: 'Brookings County', value: 65 },
          { label: 'Brown County', value: 49.5 },
          { label: 'Brule County', value: 40 },
          { label: 'Buffalo County', value: 41.5 },
          { label: 'Butte County', value: 13.5 },
          { label: 'Campbell County', value: 37.5 },
          { label: 'Charles Mix County', value: 52 },
          { label: 'Clay County', value: 61 },
          { label: 'Codington County', value: 61.5 },
          { label: 'Corson County', value: 18 },
          { label: 'Custer County', value: 13 },
          { label: 'Davison County', value: 63.5 },
          { label: 'Day County', value: 51 },
          { label: 'Deuel County', value: 62 },
          { label: 'Dewey County', value: 11.5 },
          { label: 'Douglas County', value: 52 },
          { label: 'Edmunds County', value: 50.5 },
          { label: 'Fall River County', value: 13.5 },
          { label: 'Faulk County', value: 44 },
          { label: 'Grant County', value: 58.5 },
          { label: 'Gregory County', value: 37 },
          { label: 'Haakon County', value: 16.5 },
          { label: 'Hamlin County', value: 63.5 },
          { label: 'Hand County', value: 54 },
          { label: 'Hanson County', value: 58.5 },
          { label: 'Harding County', value: 11.5 },
          { label: 'Hughes County', value: 38.5 },
          { label: 'Hutchinson County', value: 55 },
          { label: 'Hyde County', value: 45 },
          { label: 'Jackson County', value: 18.5 },
          { label: 'Jerauld County', value: 50.5 },
          { label: 'Jones County', value: 20 },
          { label: 'Kingsbury County', value: 60.5 },
          { label: 'Lake County', value: 73 },
          { label: 'Lawrence County', value: 15 },
          { label: 'Lincoln County', value: 66.5 },
          { label: 'Lyman County', value: 30.5 },
          { label: 'Marshall County', value: 45.5 },
          { label: 'McCook County', value: 64.5 },
          { label: 'McPherson County', value: 46 },
          { label: 'Meade County', value: 18 },
          { label: 'Mellette County', value: 20.5 },
          { label: 'Miner County', value: 69.5 },
          { label: 'Minnehaha County', value: 64 },
          { label: 'Moody County', value: 65.5 },
          { label: 'Oglala Lakota County', value: 6.8 },
          { label: 'Pennington County', value: 16.5 },
          { label: 'Perkins County', value: 15 },
          { label: 'Potter County', value: 38.5 },
          { label: 'Roberts County', value: 42 },
          { label: 'Sanborn County', value: 61 },
          { label: 'Spink County', value: 55 },
          { label: 'Stanley County', value: 25.5 },
          { label: 'Sully County', value: 27 },
          { label: 'Todd County', value: 17 },
          { label: 'Tripp County', value: 36 },
          { label: 'Turner County', value: 59 },
          { label: 'Walworth County', value: 31 },
          { label: 'Yankton County', value: 60.5 },
          { label: 'Ziebach County', value: 12 },
        ],
      },
      {
        label: 'Cropland, irrigated',
        options: [
          { label: 'Beadle County', value: 255 },
          { label: 'Brookings County', value: 231 },
          { label: 'Butte County', value: 115 },
          { label: 'Clay County', value: 281 },
          { label: 'Lake County', value: 232 },
          { label: 'Lincoln County', value: 260 },
          { label: 'Spink County', value: 179 },
          { label: 'Turner County', value: 267 },
          { label: 'Union County', value: 252 },
        ],
      },
    ],
  },

  /**
   * Salvage value is offered as a SHARE of the purchase price the producer has
   * already entered, resolved from the sentinel at apply time. These are common
   * choices for splitting up a purchase price, not a claim about any particular
   * machine's resale market — which is why they carry no research citation.
   */
  salvageValue: {
    title: 'Salvage value',
    unit: 'share of what you paid',
    source:
      'Iowa State University Extension and Outreach, Ag Decision Maker File A3-29 / PM 710, "Estimating Farm Machinery Costs", revised March 2026. Table 1a (tractors, combines) was developed from published reports of used equipment auction values; Table 1b (everything else) is credited to the American Society of Agricultural and Biological Engineers. Tractor and combine percentages are at moderate annual use — 400 hours a year for tractors, 300 for combines.',
    note: 'These percentages are shares of the NEW LIST PRICE. On a machine bought new they are also shares of what you paid. On a machine bought used at a discount they understate what it is worth, so choose a higher share. Where you know what the machine would actually trade for, enter that instead.',
    requires: {
      field: 'initialCost',
      message: 'Enter the initial cost first, then pick a share of it.',
    },
    groups: [
      // Ages match the economic lives offered on the useful-life picker, so the
      // two fields can be filled from the same assumption about how long the
      // machine is kept rather than from two unrelated guesses.
      {
        label: 'Tractor over 150 hp',
        table: '1a',
        options: [
          { label: 'Kept 10 years — 32%', value: '=0.32*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 28%', value: '=0.28*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 23%', value: '=0.23*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Tractor 80–149 hp',
        table: '1a',
        options: [
          { label: 'Kept 10 years — 37%', value: '=0.37*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 34%', value: '=0.34*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 29%', value: '=0.29*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Tractor under 80 hp',
        table: '1a',
        options: [
          { label: 'Kept 10 years — 32%', value: '=0.32*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 29%', value: '=0.29*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 25%', value: '=0.25*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Combine or forage harvester',
        table: '1a',
        options: [
          { label: 'Kept 10 years — 23%', value: '=0.23*initialCost', desc: '', categories: ['harvest'] },
          { label: 'Kept 12 years — 18%', value: '=0.18*initialCost', desc: '', categories: ['harvest'] },
          { label: 'Kept 15 years — 13%', value: '=0.13*initialCost', desc: '', categories: ['harvest'] },
        ],
      },
      // ── Table 1b ─────────────────────────────────────────────────────────
      // Eight machine classes, ASABE-credited. The class names below are A3-29's
      // own column headings, kept verbatim so a producer can see which class
      // they are being offered rather than trusting our mapping of it.
      //
      // Where a category spans two of A3-29's columns, BOTH are offered rather
      // than one being picked silently: a chisel plow belongs to "Plows" and a
      // disk to "Other tillage", but this app files both under `tillage`, and
      // guessing between a 32% and a 26% for the producer would be inventing an
      // answer the source does not give.
      ...tableOneB([
        { label: 'Plows and subsoilers', cats: ['tillage'], ten: 0.33, twelve: 0.32, fifteen: 0.29 },
        { label: 'Other tillage', cats: ['tillage'], ten: 0.3, twelve: 0.26, fifteen: 0.22 },
        {
          label: 'Planter, drill, or sprayer',
          cats: ['planting', 'spraying'],
          ten: 0.4,
          twelve: 0.38,
          fifteen: 0.34,
        },
        { label: 'Mower or chopper', cats: ['hay', 'harvest'], ten: 0.3, twelve: 0.27, fifteen: 0.25 },
        { label: 'Baler', cats: ['hay'], ten: 0.28, twelve: 0.25, fifteen: 0.21 },
        { label: 'Swather or rake', cats: ['hay'], ten: 0.25, twelve: 0.23, fifteen: 0.19 },
        { label: 'Vehicle', cats: ['transport', 'loader'], ten: 0.26, twelve: 0.24, fifteen: 0.22 },
        { label: 'Other machinery', cats: ['grain', 'other'], ten: 0.35, twelve: 0.31, fifteen: 0.26 },
      ]),
      {
        // Last resort, for a machine that matched no class at all. Uncited, and
        // the modal's source line makes the difference visible.
        label: 'None of these: common shares of purchase price',
        options: [
          { label: '40% — newer machine, short ownership', value: '=0.40*initialCost', desc: 'kept only a few years' },
          { label: '30% — typical for well-kept equipment', value: '=0.30*initialCost', desc: '' },
          { label: '25% — common default', value: '=0.25*initialCost', desc: '' },
          { label: '20% — long ownership, hard use', value: '=0.20*initialCost', desc: '' },
          { label: '10% — run until nearly worn out', value: '=0.10*initialCost', desc: '' },
          { label: '$0 — no resale value left', value: 0, desc: 'depreciates to nothing' },
        ],
      },
    ],
  },

  /**
   * NO LONGER PROVISIONAL. A3-29 states the rule directly, in one sentence:
   *
   *   "A good rule of thumb is to use an economic life of 10 to 12 years for
   *    most farm machines and a 15-year life for tractors, unless you know you
   *    will trade sooner."
   *
   * That is the whole published position, and it corrects what shipped before:
   * planters, tillage tools, grain handling and trucks all carried 15 years
   * here, which the source reserves for tractors alone.
   *
   * Note what the source is careful to say and this modal repeats: ECONOMIC life
   * is the ownership period, deliberately shorter than service life, "because
   * most farmers trade a machine for a different one before it is completely
   * worn out". The figures are not a claim about when a machine wears out —
   * A3-29 keeps that separate, in hours, as the wear-out life used for repair
   * costs. Nothing here should be read as "your planter dies at twelve".
   */
  usefulLifeEquipment: {
    title: 'Useful life — equipment',
    unit: 'years',
    source:
      'Iowa State University Extension and Outreach, Ag Decision Maker File A3-29 / PM 710, "Estimating Farm Machinery Costs", revised March 2026.',
    note: 'This is ECONOMIC life: how long you expect to own the machine, not how long it would last. The two differ, because most machines are traded before they are worn out. If you know you will trade sooner, enter that number.',
    byCategory: true,
    groups: [
      {
        label: 'Iowa State rule of thumb',
        options: [
          {
            label: 'Tractor — 15 years',
            value: 15,
            desc: 'A3-29 gives tractors their own, longer figure',
            categories: ['tractor'],
          },
          {
            label: 'Tractor, traded sooner — 12 years',
            value: 12,
            desc: 'if you replace on a shorter cycle',
            categories: ['tractor'],
          },
          {
            label: 'Combine — 12 years',
            value: 12,
            desc: '"most farm machines": 10 to 12',
            categories: ['harvest'],
          },
          { label: 'Combine — 10 years', value: 10, desc: 'heavier annual use', categories: ['harvest'] },
          { label: 'Planter or drill — 12 years', value: 12, desc: '', categories: ['planting'] },
          { label: 'Planter or drill — 10 years', value: 10, desc: '', categories: ['planting'] },
          { label: 'Tillage tool — 12 years', value: 12, desc: '', categories: ['tillage'] },
          { label: 'Tillage tool — 10 years', value: 10, desc: '', categories: ['tillage'] },
          { label: 'Sprayer — 12 years', value: 12, desc: '', categories: ['spraying'] },
          { label: 'Sprayer — 10 years', value: 10, desc: '', categories: ['spraying'] },
          { label: 'Grain cart, auger, handling — 12 years', value: 12, desc: '', categories: ['grain'] },
          { label: 'Truck or trailer — 12 years', value: 12, desc: '', categories: ['transport'] },
          { label: 'Skid loader — 10 years', value: 10, desc: '', categories: ['loader'] },
          { label: 'Haying equipment — 12 years', value: 12, desc: '', categories: ['hay'] },
          { label: 'Haying equipment — 10 years', value: 10, desc: '', categories: ['hay'] },
        ],
      },
    ],
  },

  usefulLifeBuilding: {
    title: 'Useful life — buildings',
    unit: 'years',
    status: 'provisional',
    source:
      'Conventional depreciation periods for farm structures. No published survey covers these.',
    note: 'Buildings depreciate to zero in this calculator, so there is no salvage value to enter. These are ordinary depreciation periods rather than measured service lives. A well-kept machine shed outlasts thirty years, and a bin you plan to replace in fifteen should say fifteen.',
    groups: [
      {
        label: 'Common service lives',
        options: [
          { label: 'Machine shed or shop — 30 years', value: 30, desc: '' },
          { label: 'Grain bin — 25 years', value: 25, desc: '' },
          { label: 'Livestock barn — 25 years', value: 25, desc: '' },
          { label: 'Fencing — 20 years', value: 20, desc: '' },
          { label: 'Permanent water system — 20 years', value: 20, desc: '' },
        ],
      },
    ],
  },
}

/**
 * Equipment name type-ahead.
 *
 * Matching a suggestion sets the item's `category`, which ONLY filters what the
 * useful-life picker offers. It never fills a field and never changes a number
 * already on screen. Typing something not in this list is completely fine.
 */
export const EQUIPMENT_CATALOG = [
  { name: 'Tractor', category: 'tractor' },
  { name: 'Tractor, row crop', category: 'tractor' },
  { name: 'Tractor, utility', category: 'tractor' },
  { name: 'Combine', category: 'harvest' },
  { name: 'Corn head', category: 'harvest' },
  { name: 'Soybean head', category: 'harvest' },
  { name: 'Draper head', category: 'harvest' },
  { name: 'Forage harvester', category: 'harvest' },
  { name: 'Planter', category: 'planting' },
  { name: 'Planter, no-till', category: 'planting' },
  { name: 'Grain drill', category: 'planting' },
  { name: 'No-till drill', category: 'planting' },
  { name: 'Air seeder', category: 'planting' },
  { name: 'Field cultivator', category: 'tillage' },
  { name: 'Chisel plow', category: 'tillage' },
  { name: 'Disk', category: 'tillage' },
  { name: 'Vertical tillage tool', category: 'tillage' },
  { name: 'Strip-till bar', category: 'tillage' },
  { name: 'Ripper', category: 'tillage' },
  { name: 'Land roller', category: 'tillage' },
  { name: 'Sprayer, self-propelled', category: 'spraying' },
  { name: 'Sprayer, pull-type', category: 'spraying' },
  { name: 'Anhydrous applicator', category: 'spraying' },
  { name: 'Dry fertilizer spreader', category: 'spraying' },
  { name: 'Grain cart', category: 'grain' },
  { name: 'Grain auger', category: 'grain' },
  { name: 'Grain vacuum', category: 'grain' },
  { name: 'Grain truck', category: 'transport' },
  { name: 'Semi truck', category: 'transport' },
  { name: 'Grain trailer', category: 'transport' },
  { name: 'Pickup', category: 'transport' },
  { name: 'Skid loader', category: 'loader' },
  { name: 'Payloader', category: 'loader' },
  { name: 'Telehandler', category: 'loader' },
  { name: 'Mower conditioner', category: 'hay' },
  { name: 'Baler, round', category: 'hay' },
  { name: 'Baler, square', category: 'hay' },
  { name: 'Rake', category: 'hay' },
  { name: 'Bale mover', category: 'hay' },
  { name: 'Manure spreader', category: 'other' },
  { name: 'Rock picker', category: 'other' },
]

export const BUILDING_CATALOG = [
  { name: 'Machine shed', category: 'building' },
  { name: 'Shop', category: 'building' },
  { name: 'Grain bin', category: 'building' },
  { name: 'Livestock barn', category: 'building' },
  { name: 'Calving shed', category: 'building' },
  { name: 'Fencing', category: 'building' },
  { name: 'Livestock water system', category: 'building' },
  { name: 'Commodity shed', category: 'building' },
]

/**
 * Crops whose seed is sold BY SEED COUNT, and the size of one unit.
 *
 * Two entries, and the shortness of the list is a finding rather than a gap.
 * Corn and soybeans are sold by seed count, so a planting population divides
 * cleanly into a cost. (Both state budgets happen to PRICE corn per thousand
 * seeds; the pickers convert that to the 80,000-seed bag it is bought in, so
 * one denomination is offered per crop rather than two. See TYPICAL-VALUES.md.)
 * Wheat, oats and barley are priced BY WEIGHT — the South Dakota
 * budgets quote them per hundredweight — so a seeds-per-unit figure is not a
 * thing they have, and the line's ordinary $/unit × units per acre mode is
 * already the right shape for them. Sunflower and sorghum are absent from every
 * source checked: the North Dakota budgets give a seed cost per acre with no
 * seeding rate behind it, and South Dakota does not budget them at all.
 *
 * So nothing is guessed here. A crop not on this list gets no suggestion, which
 * is the same answer this file gives everywhere it has no citation.
 *
 * `terms` are matched against whatever the producer typed in the Crop box.
 * "Corn silage" and "seed corn" both land on corn, which is right: they are
 * bought in the same bags.
 */
export const SEED_CROPS = [
  { label: 'Corn', seedsPerUnit: 80000, terms: ['corn', 'maize'] },
  { label: 'Soybeans', seedsPerUnit: 140000, terms: ['soybean', 'soy bean', 'soybeans', 'soy'] },
]

/**
 * The seed crop a free-typed crop name names, or null when nothing matches.
 *
 * Deliberately stricter than matchCategory(), which also matches when the
 * CATALOG entry contains the query — that is right for a type-ahead offering
 * suggestions, and wrong here, where a match writes a number into a box. Two
 * characters of "co" must not resolve to corn and fill in 80,000.
 */
export function matchCrop(text) {
  const q = String(text || '').trim().toLowerCase()
  if (q.length < 3) return null
  let best = null
  let bestLength = 0
  for (const crop of SEED_CROPS) {
    for (const term of crop.terms) {
      if (term.length > bestLength && q.includes(term)) {
        best = crop
        bestLength = term.length
      }
    }
  }
  return best
}

/** Best category match for a free-typed name, or '' when nothing matches. */
export function matchCategory(name, catalog = EQUIPMENT_CATALOG) {
  const q = String(name || '').trim().toLowerCase()
  if (q.length < 3) return ''
  // Longest catalog entry contained in the typed name wins, so "John Deere
  // 1770 planter" matches "planter" and "no-till drill" beats "drill".
  let best = ''
  let bestLength = 0
  for (const item of catalog) {
    const key = item.name.toLowerCase()
    const bare = key.split(',')[0].trim()
    for (const candidate of new Set([key, bare])) {
      if (candidate.length > bestLength && (q.includes(candidate) || candidate.includes(q))) {
        best = item.category
        bestLength = candidate.length
      }
    }
  }
  return best
}

/** Suggestions for the type-ahead datalist. */
export function suggestNames(query, catalog = EQUIPMENT_CATALOG, limit = 8) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return catalog.slice(0, limit).map((c) => c.name)
  return catalog
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((c) => c.name)
}
