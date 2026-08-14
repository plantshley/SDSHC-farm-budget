import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo at /SDSHC-farm-budget/, so every asset URL needs
// that prefix. Vite handles it for imported assets and for public/ files
// referenced through import.meta.env.BASE_URL — hardcoded "/assets/..." strings
// would break. See CLAUDE.md.
const BASE = '/SDSHC-farm-budget/'

export default defineConfig({
  base: BASE,
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
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
        cleanupOutdatedCaches: true,
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
