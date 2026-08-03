/**
 * Getting numbers out: a CSV for a spreadsheet, a JSON file to move a budget
 * between devices, and the browser's own print dialog for paper or PDF.
 */

import { calcScenario, VARIABLE_LINES } from './calc.js'
import { exportScenarioJSON } from './storage.js'

/** RFC-4180 quoting: anything with a comma, quote or newline gets wrapped. */
function csvCell(value) {
  const s = String(value ?? '')
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
      e.crop,
      round(e.acres),
      round(Number(src.yieldPerAcre) || 0),
      src.yieldUnit ?? '',
      round(Number(src.pricePerUnit) || 0),
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
  rows.push(['These differ from the original spreadsheet — see "How this differs" in the app.'])

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

function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
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

export function downloadCSV(scenario) {
  // The BOM makes Excel open UTF-8 correctly on Windows.
  download(safeFilename(scenario.name, 'csv'), '﻿' + scenarioToCSV(scenario), 'text/csv')
}

export function downloadJSON(scenario) {
  download(safeFilename(scenario.name, 'json'), exportScenarioJSON(scenario), 'application/json')
}

/** Paper or PDF, via the browser's own print dialog. See @media print in styles.css. */
export function printResults() {
  window.print()
}
