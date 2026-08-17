/**
 * Getting numbers out: a CSV for a spreadsheet, a JSON file to move a budget
 * between devices, a PNG of the Results section, and the browser's own print
 * dialog for paper or PDF.
 */

import { calcScenario, VARIABLE_LINES, enterpriseLabel, num } from './calc.js'
import { exportScenarioJSON, exportBackupJSON } from './storage.js'
import { usd, usdCents, number } from './ui/format.js'
// The comparison table's own row list, so the CSV cannot list a different set of
// figures from the screen it was exported from. See the note beside it.
import { COMPARE_ROWS } from './ui/scenarios.js'

/**
 * RFC-4180 quoting, plus formula neutralisation.
 *
 * Budget names, enterprise names and equipment names are free text, and these
 * files are made to be handed to somebody — an instructor, a lender, the rest of
 * the class. Excel, Sheets and LibreOffice all execute a cell that begins with
 * `=`, `+`, `-` or `@`, so a budget named "=HYPERLINK(...)" becomes a live
 * formula the moment the recipient opens it. Prefixing an apostrophe forces it
 * back to text; spreadsheets hide the apostrophe on display.
 *
 * NUMBERS ARE NOT TOUCHED. Every figure here arrives as a real number from
 * round(), and a negative profit of -19140.83 must stay a negative number that
 * the recipient can sum — quoting it as text would break every formula they
 * write against the export, which is most of the point of a CSV.
 */
function csvCell(value) {
  const isText = typeof value !== 'number'
  let s = String(value ?? '')
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRows(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)

export function scenarioToCSV(scenario) {
  const r = calcScenario(scenario)
  const rows = []

  rows.push(['SDSHC Farm Plan Budget'])
  rows.push(['Budget name', scenario.name])
  // The crop year the plan is FOR, which the export date below does not imply.
  if (scenario.scenarioYear) rows.push(['Scenario year', scenario.scenarioYear])
  rows.push(['Exported', new Date().toLocaleString()])
  rows.push([])

  rows.push(['WHOLE FARM'])
  rows.push(['Total acres', round(r.totalAcres)])
  rows.push(['Total revenue', round(r.totals.totalRevenue)])
  rows.push(['Total variable expenses', round(r.totals.totalVariable)])
  rows.push(['Total gross margin', round(r.totals.totalGrossMargin)])
  rows.push(['Total fixed costs', round(r.totals.totalFixed)])
  rows.push(['Total profit', round(r.totals.totalProfit)])
  rows.push(['Profit per acre (weighted)', round(r.totals.profitPerAcre)])
  rows.push([])

  rows.push(['ENTERPRISES'])
  rows.push([
    'Enterprise',
    'Crop',
    'Acres',
    'Yield/acre',
    'Unit',
    'Price/unit',
    'Misc income/acre',
    'Gross revenue/acre',
    ...VARIABLE_LINES.map((d) => `${d.label} $/acre`),
    'Preharvest interest $/acre',
    'Total variable/acre',
    'Gross margin/acre',
    'Enterprise gross margin',
  ])
  for (const [i, e] of r.enterprises.entries()) {
    const src = scenario.enterprises[i] ?? {}
    rows.push([
      // The label, then the crop: two enterprises can share a crop, and the
      // exported sheet has to be able to tell them apart the same way the app does.
      e.label,
      e.crop,
      round(e.acres),
      // num(), not `Number(x) || 0`. The stored value can still carry the "$" and
      // thousands separators a producer pasted in, which Number() reads as NaN and
      // `|| 0` turns into a confident zero -- sitting in the same row as a gross
      // revenue the model computed from the real figure. The export would then
      // contradict itself, and it is the copy that gets handed to somebody else.
      round(num(src.yieldPerAcre)),
      src.yieldUnit ?? '',
      round(num(src.pricePerUnit)),
      round(e.miscIncomePerAcre),
      round(e.grossRevPerAcre),
      ...VARIABLE_LINES.map((d) => round(e.lines[d.key])),
      round(e.preharvestInterestPerAcre),
      round(e.totalVarPerAcre),
      round(e.grossMarginPerAcre),
      round(e.enterpriseGrossMargin),
    ])
  }
  rows.push([])

  rows.push(['FIXED COSTS', 'Per acre', 'Per year'])
  rows.push(['Land rent', round(r.fixed.landRentPerAcre), round(r.fixed.landRentTotal)])
  rows.push(['Labor', round(r.fixed.laborPerAcre), round(r.fixed.laborTotal)])
  // Annualised, so a figure entered as hours-per-week is not mistaken for a
  // yearly total by whoever opens this in a spreadsheet.
  rows.push(['Labor hours per year', '', round(r.fixed.totalHoursPerYear)])
  rows.push(['Equipment depreciation', round(r.fixed.equipDepPerAcre), round(r.fixed.equipDepTotal)])
  rows.push(['Equipment interest', round(r.fixed.equipIntPerAcre), round(r.fixed.equipIntTotal)])
  rows.push(['Building depreciation', round(r.fixed.bldgDepPerAcre), round(r.fixed.bldgDepTotal)])
  rows.push(['Building interest', round(r.fixed.bldgIntPerAcre), round(r.fixed.bldgIntTotal)])
  rows.push(['Annual overhead', round(r.fixed.annualPerAcre), round(r.fixed.annualTotal)])
  rows.push(['Total fixed costs', round(r.fixed.totalFixedPerAcre), round(r.fixed.totalFixedAnnual)])
  rows.push([])

  if (r.fixed.equipment.length) {
    rows.push(['EQUIPMENT', 'Initial cost', 'Salvage', 'Useful life', 'Depreciation/yr', 'Interest/yr'])
    for (const item of r.fixed.equipment) {
      rows.push([
        item.name,
        round(item.initialCost),
        round(item.salvageValue),
        round(item.usefulLife),
        round(item.annualDep),
        round(item.annualInt),
      ])
    }
    rows.push([])
  }

  if (r.fixed.buildings.length) {
    rows.push(['BUILDINGS', 'Initial cost', 'Useful life', 'Depreciation/yr', 'Interest/yr'])
    for (const item of r.fixed.buildings) {
      rows.push([
        item.name,
        round(item.initialCost),
        round(item.usefulLife),
        round(item.annualDep),
        round(item.annualInt),
      ])
    }
    rows.push([])
  }

  rows.push([
    'Note: profit per acre is weighted by acres, and equipment interest is included in total profit.',
  ])

  return csvRows(rows)
}

/**
 * The side-by-side comparison, as a spreadsheet.
 *
 * Every figure goes out as a raw number, including the differences, so the
 * recipient can sort, chart and write formulas against it. The first budget is
 * the baseline, exactly as on screen, and each other column is followed by its
 * difference from that baseline in its own column — a merged "value (+123)"
 * cell would read correctly and compute as nothing.
 */
export function compareToCSV(scenarios) {
  const results = scenarios.map((s) => ({ scenario: s, r: calcScenario(s) }))
  const rows = []

  rows.push(['SDSHC Farm Plan Budget — comparison'])
  rows.push(['Exported', new Date().toLocaleString()])
  rows.push(['Baseline', results[0].scenario.name])
  rows.push([])

  const header = ['Figure']
  for (const [i, x] of results.entries()) {
    header.push(x.scenario.name)
    if (i > 0) header.push(`${x.scenario.name} — difference from baseline`)
  }
  rows.push(header)

  for (const row of COMPARE_ROWS) {
    const baseValue = row.get(results[0].r)
    const line = [row.label]
    for (const [i, x] of results.entries()) {
      const value = row.get(x.r)
      line.push(round(value))
      if (i > 0) line.push(round(value - baseValue))
    }
    rows.push(line)
  }
  rows.push([])

  rows.push(['ENTERPRISES IN EACH BUDGET'])
  rows.push(['Budget', 'Enterprise', 'Crop', 'Acres', 'Gross margin/acre', 'Gross margin'])
  for (const x of results) {
    for (const [i, e] of x.r.enterprises.entries()) {
      rows.push([
        x.scenario.name,
        e.label || enterpriseLabel(x.scenario.enterprises[i], i),
        e.crop,
        round(e.acres),
        round(e.grossMarginPerAcre),
        round(e.enterpriseGrossMargin),
      ])
    }
  }
  rows.push([])
  rows.push([
    'Note: profit per acre is weighted by acres, and equipment interest is included in total profit.',
  ])

  return csvRows(rows)
}

function safeFilename(name, ext) {
  const base =
    String(name || 'farm-budget')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'farm-budget'
  return `${base}.${ext}`
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The text exports all build their own Blob from a string. The PNG cannot —
 * canvas hands back a Blob already — so the anchor half lives in downloadBlob()
 * and this wraps it. Every caller below is unchanged.
 */
function download(filename, text, mime) {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

export function downloadCSV(scenario) {
  // The BOM makes Excel open UTF-8 correctly on Windows.
  download(safeFilename(scenario.name, 'csv'), '﻿' + scenarioToCSV(scenario), 'text/csv')
}

export function downloadCompareCSV(scenarios) {
  if (!scenarios?.length) return
  download(
    safeFilename(`${scenarios[0].name}-comparison`, 'csv'),
    '﻿' + compareToCSV(scenarios),
    'text/csv'
  )
}

export function downloadJSON(scenario) {
  download(safeFilename(scenario.name, 'json'), exportScenarioJSON(scenario), 'application/json')
}

/**
 * The whole Saved tab in one file.
 *
 * Named for the day it was taken rather than for a budget, because it is not
 * about any one of them, and a producer who backs up every few months ends up
 * with a folder of files that sort into the order they were made. A fixed name
 * would have each download land as "(1)", "(2)" beside the last, which is the
 * same list with the dates thrown away.
 */
export function downloadBackup() {
  const day = new Date().toISOString().slice(0, 10)
  download(`sdshc-farm-budgets-${day}.json`, exportBackupJSON(), 'application/json')
}

/** Paper or PDF, via the browser's own print dialog. See @media print in styles.css. */
export function printResults() {
  window.print()
}

/* ────────────────────────────── PNG image ──────────────────────────────── */

const W = 1080
const PAD = 56
const HEADER_H = 142
const CARD_H = 128
const CARD_GAP = 18
const TITLE_H = 42
const HEAD_H = 30
const ROW_H = 38
const SECTION_GAP = 22
const WARN_H = 34
const FOOT_H = 36

/**
 * The Results section as a picture.
 *
 * Drawn on a canvas rather than screenshotted, for the reasons the grazing
 * calculator's version gives: the section has a known shape, the drawn version
 * is cleaner than a capture of a page that reflows at every width, and neither
 * html2canvas nor a webfont has to be precached by a tool that has to work with
 * no signal.
 *
 * It carries what ui/results.js carries, in that order: the four KPIs, the two
 * whole-farm tables, the enterprise breakdown and the fixed-cost breakdown.
 * Both are drawn from the SAME calcScenario() call shape, so a figure cannot
 * differ between the screen and the image without differing in the model.
 *
 * On screen the last two tables sit in a second column beside the first two.
 * Here they run on down the page: this image is read on a phone or pasted into
 * a message, where two columns of 14px figures at 1080px wide is the layout
 * that fails first.
 */
export function downloadPNG(scenario) {
  const model = imageModel(scenario)
  const height = imageHeight(model)

  const canvas = document.createElement('canvas')
  // Drawn at 2x and scaled, so the figures are sharp on a phone screen and on
  // paper. Everything below is written in CSS pixels.
  const dpr = 2
  canvas.width = W * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  // Refused by the browser under some privacy settings, and on a device that
  // has run out of GPU memory. Saying so beats a button that does nothing.
  if (!ctx) {
    alert('This browser would not let the image be drawn. Try Print or PDF instead.')
    return
  }
  ctx.scale(dpr, dpr)

  // Always the light palette, and hard-coded rather than read off the page.
  // The image leaves the app and lands in a text message or a printout, where
  // the reader's theme is not ours to guess — and getComputedStyle would hand
  // back the dark tokens for a producer who has the dark theme on, which is a
  // white-on-white PNG.
  const ink = '#222222'
  const muted = '#5a625a'
  const brand = '#4e413a'
  const border = '#d7ddd7'
  const olive = '#afbf42'
  const sky = '#0fb2e2'
  const green = '#2e7d32'
  const cost = '#c0392b'

  // Green for money that is there, red for money that is not. Same rule as the
  // screen: colour follows the SIGN, and a figure with no tone stays ink.
  const toneColor = (n) => {
    if (!Number.isFinite(n) || n === 0) return ink
    return n > 0 ? green : cost
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)

  let y = PAD

  ctx.fillStyle = brand
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.fillText('SDSHC Farm Plan Budget', PAD, y + 30)
  y += 52

  ctx.fillStyle = muted
  ctx.font = '20px system-ui, sans-serif'
  fitText(ctx, model.subtitle, PAD, y + 18, W - PAD * 2)
  y += 48

  ctx.strokeStyle = olive
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += 42

  // The four KPIs, one row, equal shares. Four is fixed here, unlike the
  // grazing calculator's band, where the producer chooses which answers they
  // asked for and the card can be a third of the width or all of it.
  const cardW = (W - PAD * 2 - CARD_GAP * 3) / 4
  model.kpis.forEach((k, i) => {
    const x = PAD + i * (cardW + CARD_GAP)
    ctx.fillStyle = '#e6f7fd'
    roundRect(ctx, x, y, cardW, CARD_H, 10)
    ctx.fill()
    ctx.fillStyle = sky
    ctx.fillRect(x, y, cardW, 4)

    ctx.fillStyle = muted
    ctx.font = '17px system-ui, sans-serif'
    fitText(ctx, k.label, x + 18, y + 40, cardW - 36)

    ctx.fillStyle = 'tone' in k ? toneColor(k.tone) : ink
    ctx.font = 'bold 26px system-ui, sans-serif'
    fitText(ctx, k.value, x + 18, y + 84, cardW - 36)
  })
  y += CARD_H + 30

  // The one warning that belongs to the whole farm rather than to a card. With
  // no acres entered it is the reason every figure above is $0, so it travels
  // with them — the per-card warnings name a box that is not in this picture
  // and are deliberately left behind.
  if (model.warnings.length) {
    ctx.fillStyle = cost
    ctx.font = '18px system-ui, sans-serif'
    for (const w of model.warnings) {
      fitText(ctx, w, PAD, y + 14, W - PAD * 2)
      y += WARN_H
    }
  }

  for (const section of model.sections) {
    ctx.fillStyle = brand
    ctx.font = 'bold 22px system-ui, sans-serif'
    const titleW = ctx.measureText(section.title).width
    ctx.fillText(section.title, PAD, y + 20)
    if (section.note) {
      ctx.fillStyle = muted
      ctx.font = '16px system-ui, sans-serif'
      fitText(ctx, section.note, PAD + titleW + 10, y + 20, W - PAD * 2 - titleW - 10)
    }
    ctx.strokeStyle = olive
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD, y + 31)
    ctx.lineTo(W - PAD, y + 31)
    ctx.stroke()
    y += TITLE_H

    if (section.head) {
      ctx.fillStyle = muted
      ctx.font = 'bold 15px system-ui, sans-serif'
      ctx.fillText(section.head[0], PAD, y + 16)
      ctx.textAlign = 'right'
      section.grid.forEach((x, i) => ctx.fillText(section.head[i + 1], x, y + 16))
      ctx.textAlign = 'left'
      y += HEAD_H
    }

    for (const row of section.rows) {
      // The figures are drawn first and their widths reserved, so a long
      // enterprise name is what gets shortened. The numbers are the point.
      let labelMax = W - PAD * 2
      if (row.cells.length) {
        ctx.textAlign = 'right'
        row.cells.forEach((cell, i) => {
          ctx.font = `${row.strong ? 'bold ' : ''}17px system-ui, sans-serif`
          ctx.fillStyle = 'tone' in cell ? toneColor(cell.tone) : ink
          ctx.fillText(cell.text, section.grid[i], y + 22)
          if (i === 0) {
            labelMax = section.grid[0] - PAD - ctx.measureText(cell.text).width - 16
          }
        })
        ctx.textAlign = 'left'
      }

      ctx.font = `${row.strong ? 'bold ' : ''}17px system-ui, sans-serif`
      ctx.fillStyle = row.cells.length ? ink : muted
      fitText(ctx, row.label, PAD, y + 22, labelMax)

      ctx.strokeStyle = border
      ctx.lineWidth = 1
      ctx.beginPath()
      // Half a pixel, so a 1px rule lands on the pixel rather than across two
      // and comes out grey at 2x.
      ctx.moveTo(PAD, y + ROW_H - 0.5)
      ctx.lineTo(W - PAD, y + ROW_H - 0.5)
      ctx.stroke()
      y += ROW_H
    }
    y += SECTION_GAP
  }

  y += 8
  ctx.fillStyle = muted
  ctx.font = '16px system-ui, sans-serif'
  // The same sentence the CSV ends with. Both are handed to somebody who was
  // not at the keyboard, and the two divergences it names are the ones that
  // make a figure here differ from one they may work out by hand.
  fitText(
    ctx,
    'Profit per acre is weighted by acres, and equipment interest is included in total profit.',
    PAD,
    y,
    W - PAD * 2
  )

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(safeFilename(scenario.name, 'png'), blob)
    else alert('The image could not be created. Try Print or PDF instead.')
  }, 'image/png')
}

/**
 * Everything the image says, worked out before anything is drawn, so the
 * height can be measured from the content rather than guessed at. A canvas has
 * no overflow: a budget with nine enterprises has to make the picture taller,
 * not run off the bottom of it.
 */
function imageModel(scenario) {
  const r = calcScenario(scenario)
  const t = r.totals

  const kpis = [
    { label: 'Total profit', value: usd(t.totalProfit), tone: t.totalProfit },
    { label: 'Profit / acre', value: usdCents(t.profitPerAcre), tone: t.profitPerAcre },
    { label: 'Total gross margin', value: usd(t.totalGrossMargin), tone: t.totalGrossMargin },
    { label: 'Total acres', value: number(r.totalAcres) },
  ]

  // `− ` before an expense, the same U+2212 the .minus rows print on screen. It
  // is on the figure rather than in the label because that is where the reader
  // running down the column needs it.
  const minus = (text) => `− ${text}`

  const sections = [
    {
      title: 'Whole farm',
      grid: [W - PAD],
      rows: [
        { label: 'Total revenue', cells: [{ text: usd(t.totalRevenue) }] },
        { label: 'Total variable expenses', cells: [{ text: minus(usd(t.totalVariable)) }] },
        {
          label: 'Total gross margin',
          cells: [{ text: usd(t.totalGrossMargin) }],
          strong: true,
        },
        { label: 'Total fixed costs', cells: [{ text: minus(usd(t.totalFixed)) }] },
        {
          label: 'Total profit',
          cells: [{ text: usd(t.totalProfit), tone: t.totalProfit }],
          strong: true,
        },
      ],
    },
    {
      title: 'Per acre',
      note: `weighted across ${number(r.totalAcres)} acres`,
      grid: [W - PAD],
      rows: [
        { label: 'Revenue / acre', cells: [{ text: usdCents(t.revenuePerAcre) }] },
        {
          label: 'Variable expenses / acre',
          cells: [{ text: minus(usdCents(t.variablePerAcre)) }],
        },
        {
          label: 'Gross margin / acre',
          cells: [{ text: usdCents(t.grossMarginPerAcre) }],
          strong: true,
        },
        {
          label: 'Fixed costs / acre',
          cells: [{ text: minus(usdCents(r.fixed.totalFixedPerAcre)) }],
        },
        {
          label: 'Profit / acre',
          cells: [{ text: usdCents(t.profitPerAcre), tone: t.profitPerAcre }],
          strong: true,
        },
      ],
    },
  ]

  if (r.enterprises.length) {
    sections.push({
      title: 'By enterprise',
      head: ['Enterprise', 'Acres', 'Gross margin / acre', 'Gross margin'],
      grid: [620, 822, W - PAD],
      rows: r.enterprises.map((e, i) => ({
        // The same fallback compareToCSV() uses. A blank name is "Enterprise 2"
        // on screen and has to be that here, not an empty cell.
        label: e.label || enterpriseLabel(scenario?.enterprises?.[i], i),
        cells: [
          { text: number(e.acres) },
          { text: usdCents(e.grossMarginPerAcre), tone: e.grossMarginPerAcre },
          { text: usd(e.enterpriseGrossMargin), tone: e.enterpriseGrossMargin },
        ],
      })),
    })
  } else {
    // Matches the screen's own empty state rather than printing an empty table
    // with a header row over nothing.
    sections.push({
      title: 'By enterprise',
      grid: [W - PAD],
      rows: [{ label: 'No enterprises yet.', cells: [] }],
    })
  }

  const f = r.fixed
  sections.push({
    title: 'Fixed cost breakdown',
    head: ['Item', 'Per acre', 'Per year'],
    grid: [820, W - PAD],
    rows: [
      fixedRow('Land rent', f.landRentPerAcre, f.landRentTotal),
      fixedRow('Labor', f.laborPerAcre, f.laborTotal),
      fixedRow('Equipment depreciation', f.equipDepPerAcre, f.equipDepTotal),
      fixedRow('Equipment interest', f.equipIntPerAcre, f.equipIntTotal),
      fixedRow('Building depreciation', f.bldgDepPerAcre, f.bldgDepTotal),
      fixedRow('Building interest', f.bldgIntPerAcre, f.bldgIntTotal),
      fixedRow('Annual overhead', f.annualPerAcre, f.annualTotal),
      { ...fixedRow('Total fixed costs', f.totalFixedPerAcre, f.totalFixedAnnual), strong: true },
    ],
  })

  const parts = [
    scenario?.name,
    scenario?.scenarioYear ? `${scenario.scenarioYear} crop year` : '',
    new Date().toLocaleDateString(),
  ].filter(Boolean)

  return { kpis, sections, warnings: r.farmWarnings, subtitle: parts.join('  ·  ') }
}

function fixedRow(label, perAcre, perYear) {
  return { label, cells: [{ text: usdCents(perAcre) }, { text: usd(perYear) }] }
}

function imageHeight(model) {
  let h = PAD + HEADER_H + CARD_H + 30 + model.warnings.length * WARN_H
  for (const s of model.sections) {
    h += TITLE_H + (s.head ? HEAD_H : 0) + s.rows.length * ROW_H + SECTION_GAP
  }
  return h + FOOT_H + PAD
}

/**
 * Draw text, shortened with an ellipsis if it will not fit.
 *
 * A budget called "North half, rented from the Andersons, no-till trial" would
 * otherwise run off the fixed-width canvas and be cut mid-word with nothing to
 * show it had been.
 */
function fitText(ctx, text, x, y, maxWidth) {
  let s = String(text ?? '')
  if (ctx.measureText(s).width <= maxWidth) {
    ctx.fillText(s, x, y)
    return
  }
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) {
    s = s.slice(0, -1)
  }
  ctx.fillText(`${s}...`, x, y)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
