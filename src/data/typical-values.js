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

const IOWA_NOTE =
  'These are Iowa rates, not South Dakota. Iowa publishes an annual survey and South Dakota does not, so producers here often use it as a reference point — but check it against local custom operators.'

/**
 * Build one salvage group per A3-29 Table 1b machine class.
 *
 * The three ages are the same ones the useful-life picker offers, so a producer
 * who has said "I keep a planter twelve years" can answer both questions from
 * that one decision instead of guessing a percentage separately.
 */
function tableOneB(classes) {
  return classes.map(({ label, cats, ten, twelve, fifteen }) => ({
    label: `${label} — Iowa State Table 1b`,
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

  nitrogen: {
    title: 'Nitrogen application',
    unit: '$/acre (application only — materials not included)',
    appliesTo: 'perAcre',
    source: IOWA_2026,
    note: `${IOWA_NOTE} These cover the APPLICATION only; the fertilizer itself is extra.`,
    groups: [
      {
        label: 'Fertilizer application',
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

  hauling: {
    title: 'Hauling grain',
    unit: '$/bushel',
    appliesTo: 'unit',
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
    unit: '$/point per bushel',
    appliesTo: 'unit',
    source: IOWA_2026,
    note: `${IOWA_NOTE} Charged per POINT of moisture removed per bushel — multiply by the points you expect to remove.`,
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
  landRent: {
    title: 'Land rent — South Dakota county averages',
    unit: '$/acre',
    source:
      'USDA National Agricultural Statistics Service, 2025 Cash Rent Paid Per Acre, South Dakota county estimates, released 23 August 2025.',
    note:
      'County averages of what was actually paid in 2025, from the USDA cash rent survey. Your own lease beats any average — use these when you are budgeting ground you have not rented yet, or checking whether an asking rate is in line.',
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
    note: 'These percentages are shares of the NEW LIST PRICE. If you bought the machine new they are also shares of what you paid; if you bought it used at a discount they will understate what it is worth, so lean higher. The class names are Iowa State’s own — pick the one your machine belongs to. And if you know what it would actually trade for, that beats any table.',
    requires: {
      field: 'initialCost',
      message: 'Enter the initial cost first, then pick a share of it.',
    },
    groups: [
      // Ages match the economic lives offered on the useful-life picker, so the
      // two fields can be filled from the same assumption about how long the
      // machine is kept rather than from two unrelated guesses.
      {
        label: 'Tractor over 150 hp — Iowa State auction data',
        options: [
          { label: 'Kept 10 years — 32%', value: '=0.32*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 28%', value: '=0.28*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 23%', value: '=0.23*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Tractor 80–149 hp — Iowa State auction data',
        options: [
          { label: 'Kept 10 years — 37%', value: '=0.37*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 34%', value: '=0.34*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 29%', value: '=0.29*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Tractor under 80 hp — Iowa State auction data',
        options: [
          { label: 'Kept 10 years — 32%', value: '=0.32*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 12 years — 29%', value: '=0.29*initialCost', desc: '', categories: ['tractor'] },
          { label: 'Kept 15 years — 25%', value: '=0.25*initialCost', desc: '', categories: ['tractor'] },
        ],
      },
      {
        label: 'Combine or forage harvester — Iowa State auction data',
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
          label: 'Planter, drill or sprayer',
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
        label: 'None of these — common shares of purchase price',
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
    note: 'This is your ECONOMIC life — how long you expect to OWN it, not how long it would last. A3-29 is explicit that the two differ, because most farmers trade before a machine is worn out. If you know you will trade sooner, use that number instead.',
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
      'Conventional depreciation periods for farm structures. No survey source was found for these; see TYPICAL-VALUES.md.',
    note: 'Buildings are assumed to depreciate all the way to zero in this calculator, so no salvage value is entered. These are ordinary depreciation periods, not measured service lives — a well-kept machine shed outlasts thirty years, and a bin you plan to replace in fifteen should say fifteen.',
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
