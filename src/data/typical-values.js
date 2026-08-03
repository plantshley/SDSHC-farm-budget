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

export const TYPICAL_VALUES = {
  /* ── Variable expenses ────────────────────────────────────────────────── */

  customHire: {
    title: 'Custom Hire',
    unit: '$/acre',
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
   * Salvage value is offered as a SHARE of the purchase price the producer has
   * already entered, resolved from the sentinel at apply time. These are common
   * choices for splitting up a purchase price, not a claim about any particular
   * machine's resale market — which is why they carry no research citation.
   */
  salvageValue: {
    title: 'Salvage value',
    unit: 'share of what you paid',
    source: null,
    note: 'Salvage value is usually estimated as a share of the purchase price. These are common starting points, not market data — if you know what your machine would actually trade for, use that instead.',
    requires: { field: 'initialCost', message: 'Enter the initial cost first, then pick a share of it.' },
    groups: [
      {
        label: 'Share of purchase price',
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
   * PROVISIONAL. Service lives of this kind are long-standing conventions in
   * machinery cost work (ASABE D497 / Iowa State AgDM A3-29), but the exact
   * figures below have not been checked line by line against a current edition.
   * Flagged for verification in TYPICAL-VALUES.md and shown with a caution.
   */
  usefulLifeEquipment: {
    title: 'Useful life — equipment',
    unit: 'years',
    status: 'provisional',
    source:
      'Conventional service lives used in farm machinery cost estimation (see Iowa State AgDM A3-29, Estimating Farm Machinery Costs). Pending line-by-line verification.',
    note: 'How long you expect to USE it, not how long it could last. Your own replacement pattern beats any published figure.',
    byCategory: true,
    groups: [
      {
        label: 'Common service lives',
        options: [
          { label: 'Tractor — 15 years', value: 15, desc: 'commonly 12–15', categories: ['tractor'] },
          { label: 'Tractor — 12 years', value: 12, desc: 'heavier annual use', categories: ['tractor'] },
          { label: 'Combine — 10 years', value: 10, desc: 'commonly 10–12', categories: ['harvest'] },
          { label: 'Combine head — 12 years', value: 12, desc: '', categories: ['harvest'] },
          { label: 'Planter or drill — 15 years', value: 15, desc: '', categories: ['planting'] },
          { label: 'Tillage tool — 15 years', value: 15, desc: '', categories: ['tillage'] },
          { label: 'Sprayer — 12 years', value: 12, desc: '', categories: ['spraying'] },
          { label: 'Grain cart, auger, handling — 15 years', value: 15, desc: '', categories: ['grain'] },
          { label: 'Truck or trailer — 15 years', value: 15, desc: '', categories: ['transport'] },
          { label: 'Skid loader — 12 years', value: 12, desc: '', categories: ['loader'] },
          { label: 'Haying equipment — 12 years', value: 12, desc: '', categories: ['hay'] },
        ],
      },
    ],
  },

  usefulLifeBuilding: {
    title: 'Useful life — buildings',
    unit: 'years',
    status: 'provisional',
    source:
      'Conventional service lives used in farm building cost estimation. Pending line-by-line verification.',
    note: 'Buildings are assumed to depreciate all the way to zero in this calculator, so no salvage value is entered.',
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
