import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped onto every shared budget so a record can be traced to the build that
// wrote it, which is the difference between "the model changed" and "that farm
// changed" when a figure looks wrong six months from now. Read from
// package.json rather than duplicated, and guarded with `typeof` at the one
// place it is used (share.js) because `node --test` does no define
// substitution.
const APP_VERSION = JSON.parse(readFileSync('./package.json', 'utf8')).version

// GitHub Pages serves this repo at /SDSHC-farm-budget/, so every asset URL needs
// that prefix. Vite handles it for imported assets and for public/ files
// referenced through import.meta.env.BASE_URL — hardcoded "/assets/..." strings
// would break. See CLAUDE.md.
const BASE = '/SDSHC-farm-budget/'

export default defineConfig({
  base: BASE,
  root: '.',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Firebase is split by product and given STABLE names, because the
        // service worker below has to be able to name one of them. Left to
        // Rollup they all come out as `index.esm-<hash>.js` and are
        // indistinguishable, so the auth bundle could not be kept out of the
        // precache without keeping Firestore out with it.
        //
        // THE UMBRELLA ENTRIES MUST GO WITH THEIR PRODUCT, AND THIS IS WHAT
        // MAKES THE SPLIT SAFE. Two package layouts carry the same code:
        // `@firebase/auth` is the implementation, and `firebase/auth` is a thin
        // file that re-exports it. Matching only the scoped name sent that
        // second file to `firebase-core` while its implementation went to
        // `firebase-auth` — so core imported auth, auth imported core, and the
        // two chunks formed a CYCLE. Rollup cannot order a cycle, so whichever
        // was evaluated second read a `const` from the other before it had been
        // initialised:
        //
        //     ReferenceError: can't access lexical declaration 'Ze'
        //     before initialization
        //
        // It shipped, and it only ever appeared in a BUILD. `npm run dev`
        // serves the modules unbundled, so there are no chunks to make a cycle
        // out of and the whole feature works perfectly on localhost. The build
        // reported nothing either. What it cost was every share on the live
        // site: the send failed, was caught, and logged, and the app carried on
        // as if a producer had simply not opted in.
        //
        // ORDER IS THE WHOLE MECHANISM HERE. The product tests run before the
        // catch-all, so anything that names a product lands with that product,
        // and only the genuinely shared packages — app, component, util,
        // logger — reach `firebase-core`. Adding a product means adding its
        // pair of tests ABOVE the last line, never below it.
        //
        // Asserted by `npm run build` plus test/build.test.js, which reads the
        // chunks back and fails on a cycle. A comment would not have caught
        // this one, because the config looked right.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Rollup gives POSIX ids, but a Windows path can still reach here
          // through a symlinked or hoisted install. Normalising costs nothing
          // and a missed match is a silent cycle rather than an error.
          const path = id.replace(/\\/g, '/')
          if (path.includes('@firebase/auth') || path.includes('/firebase/auth/')) {
            return 'firebase-auth'
          }
          if (path.includes('@firebase/firestore') || path.includes('/firebase/firestore/')) {
            return 'firebase-firestore'
          }
          if (path.includes('@firebase/') || path.includes('/firebase/')) return 'firebase-core'
        },
      },
    },
  },
  server: {
    open: true,
    port: 5173,
    strictPort: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      workbox: {
        // The whole app is code + a couple of logos, so precaching everything is
        // cheap and gives a hard offline guarantee: producers open this at the
        // Soil Health School where there may be no signal at all.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Firebase Auth is used by ONE thing: the hidden exporter panel, which
        // is reading Firestore and is therefore online by definition. Precaching
        // it would put 125 KB into every producer's install to support a screen
        // they will never open. It is fetched from the network when the panel
        // asks for it.
        //
        // Firestore itself is NOT excluded and must not be. It is what queues a
        // shared budget in IndexedDB when there is no signal and flushes it when
        // the connection returns, so a producer who has opted in needs it
        // cached — the Soil Health School is the case the offline story exists
        // for, and a share that silently failed there would be the worst
        // possible place to find out.
        globIgnores: ['**/firebase-auth-*.js'],
        cleanupOutdatedCaches: true,
        // Firebase is bigger than Workbox's default 2 MiB per-file precache
        // ceiling is comfortable with once it is in one chunk. A file over the
        // limit is dropped from the manifest SILENTLY, with only a build log
        // line to say so, which would quietly cost the offline guarantee the
        // comment above is protecting. Raised rather than discovered later.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'SDSHC Farm Plan Budget',
        short_name: 'Farm Budget',
        description:
          'Build enterprise budgets, then save and compare scenarios — South Dakota Soil Health Coalition.',
        theme_color: '#afbf42',
        background_color: '#f7f9f7',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: 'sdshc-logo.png', sizes: '179x181', type: 'image/png' },
          { src: 'sdshc-logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'sdshc-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
})
