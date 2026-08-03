/**
 * PHASE 2 STUB — sending budgets back to SDSHC.
 *
 * Nothing here talks to a network yet, by design. Phase 1 ships local-only so
 * the app works with no signal at the Soil Health School, and so that collecting
 * student data is a deliberate decision with a consent conversation attached —
 * not something that quietly starts happening.
 *
 * When Phase 2 lands, the shape below is what Firestore receives. Reuse the
 * SDSHC-games-hub Firebase setup and its firestore.rules pattern.
 *
 * BEFORE ENABLING THIS, decide:
 *   - What students are told, and when they agree to it
 *   - Whether anything identifying is collected at all (default: no)
 *   - How long submissions are kept
 */

import { calcScenario } from './calc.js'

const QUEUE_KEY = 'sdshc-fb-submit-queue'

/**
 * The document that would be sent: inputs plus computed results, and no
 * identity. `name` is the producer's own label for the budget and may contain
 * anything they typed, so it is deliberately excluded.
 */
export function buildSubmission(scenario) {
  const r = calcScenario(scenario)
  return {
    schemaVersion: scenario.schemaVersion,
    submittedAt: new Date().toISOString(),
    enterprises: scenario.enterprises.map((e) => ({
      crop: e.crop,
      acres: Number(e.acres) || 0,
      yieldPerAcre: Number(e.yieldPerAcre) || 0,
      yieldUnit: e.yieldUnit,
      pricePerUnit: Number(e.pricePerUnit) || 0,
      variable: e.variable,
      preharvest: e.preharvest,
    })),
    fixed: scenario.fixed,
    results: {
      totalAcres: r.totalAcres,
      totalRevenue: r.totals.totalRevenue,
      totalVariable: r.totals.totalVariable,
      totalGrossMargin: r.totals.totalGrossMargin,
      totalFixed: r.totals.totalFixed,
      totalProfit: r.totals.totalProfit,
      profitPerAcre: r.totals.profitPerAcre,
    },
  }
}

/** Queues locally. Phase 2 flushes this queue when a connection is available. */
export function queueSubmission(scenario) {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    queue.push(buildSubmission(scenario))
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    return { ok: true, queued: queue.length }
  } catch (err) {
    return { ok: false, error: err?.name || 'StorageError' }
  }
}

export function pendingSubmissions() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}
