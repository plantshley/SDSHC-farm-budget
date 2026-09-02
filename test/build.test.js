/**
 * The production bundle, which is a different program from the one dev serves.
 *
 * `npm run dev` hands the browser the modules unbundled, so nothing about how
 * they are grouped into chunks is exercised until a build runs — and a build
 * that succeeds proves the modules parse and the chunks were written, not that
 * they can be evaluated in an order that works.
 *
 * THIS FILE EXISTS BECAUSE A CHUNK CYCLE SHIPPED. `manualChunks` matched
 * `@firebase/auth` but not `firebase/auth`, so the thin re-export file landed in
 * `firebase-core` while the code it re-exports landed in `firebase-auth`. Core
 * imported auth, auth imported core, and Rollup cannot order a cycle — so the
 * chunk evaluated second read a `const` from the other before it existed:
 *
 *     ReferenceError: can't access lexical declaration 'Ze' before initialization
 *
 * Every share on the live site failed. Locally everything worked, the build
 * printed no warning, and the app caught the error and carried on exactly as it
 * does for a producer who never opted in. Nothing anywhere said the feature was
 * broken.
 *
 * So the assertion is on the SHAPE OF THE GRAPH rather than on the names in the
 * config. A config test would only prove the routing somebody already thought
 * of; this fails for a product nobody has added yet.
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'vite'

/** The chunks of one real production build, by file name. */
let chunks = []

describe('the production bundle can actually be evaluated', () => {
  before(async () => {
    // `write: false` keeps this out of dist/, so running the suite never leaves
    // a half-built deploy behind or clobbers one somebody is serving.
    const result = await build({
      logLevel: 'silent',
      build: { write: false },
    })
    const output = Array.isArray(result) ? result[0].output : result.output
    chunks = output.filter((o) => o.type === 'chunk')
  }, { timeout: 120000 })

  test('no two chunks import each other, directly or through a third', () => {
    // A cycle between chunks is not a warning and not an error. It is a working
    // build that throws in the browser, on the one path that the test suite
    // cannot reach because jsdom never loads a bundle.
    const graph = new Map(chunks.map((c) => [c.fileName, c.imports ?? []]))
    const state = new Map() // unvisited | 'open' | 'done'
    const trail = []

    const walk = (name) => {
      if (state.get(name) === 'done') return null
      if (state.get(name) === 'open') return [...trail.slice(trail.indexOf(name)), name]
      state.set(name, 'open')
      trail.push(name)
      for (const next of graph.get(name) ?? []) {
        if (!graph.has(next)) continue
        const cycle = walk(next)
        if (cycle) return cycle
      }
      trail.pop()
      state.set(name, 'done')
      return null
    }

    for (const name of graph.keys()) {
      const cycle = walk(name)
      assert.equal(cycle, null, cycle ? `chunks import in a circle: ${cycle.join(' -> ')}` : '')
    }
  })

  test('firebase is split by product, with the shared half depending on nobody', () => {
    // The split is what lets the service worker precache Firestore and leave
    // Auth out, so the names have to stay stable and the direction has to stay
    // one way: products depend on core, core depends on neither. Core importing
    // a product is the exact shape the cycle above took.
    const named = (prefix) => chunks.find((c) => c.fileName.includes(prefix))
    const core = named('firebase-core')
    const auth = named('firebase-auth')
    const store = named('firebase-firestore')
    assert.ok(core && auth && store, 'all three chunks exist')

    for (const dep of core.imports ?? []) {
      assert.ok(
        !dep.includes('firebase-auth') && !dep.includes('firebase-firestore'),
        `firebase-core must not import ${dep}`
      )
    }
    assert.ok(
      (auth.imports ?? []).some((d) => d.includes('firebase-core')),
      'auth depends on core, which is the direction that is allowed'
    )
  })

  test('the entry chunk pulls in no firebase at all', () => {
    // Firebase reaches the app through a dynamic import in share.js and
    // exporter.js and nowhere else — a static one would put the SDK in front of
    // every producer who never shares, and would drag it into the jsdom smoke
    // tests, which have no IndexedDB. test/app.test.js scans the source for
    // this; here it is checked against what was actually emitted.
    const entry = chunks.find((c) => c.isEntry)
    assert.ok(entry, 'there is an entry chunk')
    for (const dep of entry.imports ?? []) {
      assert.ok(!dep.includes('firebase'), `the entry chunk must not import ${dep}`)
    }
  })
})
