/**
 * Firebase project settings, and the two switches that gate the whole feature.
 *
 * THESE VALUES ARE PUBLIC AND ARE MEANT TO BE. A web app's Firebase config is
 * an address, not a credential: it names the project every client has to reach
 * and is readable in the bundle of any Firebase site on the internet. What
 * stops a stranger writing whatever they like is firestore.rules, which is
 * enforced on Google's servers and cannot be edited from a browser. Hiding this
 * object would buy nothing and would break the build for the next person.
 *
 * The one thing that must never appear in this file is the service-account key
 * from the Firebase console. That one IS a credential, it bypasses every rule,
 * and it belongs in tools/service-account.json, which is gitignored.
 *
 * SETTING THIS UP: docs/DATA-EXPORT.md walks the console steps in order and
 * says which screen each field below comes from.
 */

/**
 * Paste the config object from the Firebase console here.
 * Project settings → General → Your apps → the web app → Config.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAI4_dbVGaJbzws21iAYjh3qhCRaTX7eBo',
  authDomain: 'sdshc-farm-budget.firebaseapp.com',
  projectId: 'sdshc-farm-budget',
  storageBucket: 'sdshc-farm-budget.firebasestorage.app',
  messagingSenderId: '1032552600896',
  appId: '1:1032552600896:web:30e0dea6bf436e0ae316a5',
}

/**
 * The account the hidden exporter panel signs in as.
 *
 * A dummy address on purpose, the same idiom as SDSHC-games-hub's
 * `admin@sdshc.local` and SDSHC-master-dashboard's `dashboard@sdshc.local`.
 * There is one shared password rather than an account per person, so the panel
 * asks for a password and nothing else.
 *
 * `.local` is not a routable domain, and both consequences are on balance good:
 * there is no inbox to compromise, so the usual email-based account takeover
 * does not exist here — and Firebase's own "forgot password" email can never
 * arrive, so a lost password is reset from the console (Authentication → Users
 * → Reset password) and there is no other way in.
 */
export const EXPORT_EMAIL = 'budget-export@sdshc.local'

/** The one collection. One document per budget, keyed by its `shareId`. */
export const SUBMISSIONS = 'budget-submissions'

/**
 * The master switch, so the whole feature can be turned off without a revert.
 *
 * Set false and the switch disappears from the header, the consent modal never
 * opens, and nothing is sent — while every budget keeps the `shareId` it
 * already has, so turning it back on resumes updating the same records rather
 * than minting a second set.
 *
 * THIS, AND NOT FIREBASE_CONFIGURED, IS WHAT GATES THE INTERFACE. See below.
 */
export const SHARING_ENABLED = true

/**
 * Whether the config above has actually been filled in.
 *
 * Checked before anything reaches the network, so a fresh clone with the
 * placeholders still in place cannot throw on boot or hang a save: `npm run
 * dev` works for somebody who has never touched Firebase, and the test suite
 * runs without an account.
 *
 * IT DELIBERATELY DOES NOT HIDE THE SWITCH, and the reason is worth stating
 * because the opposite looks tidier. Hiding the interface would make the app
 * behave differently in the two places it runs — the switch and the consent
 * dialog would be untestable, invisible in development, and appear for the
 * first time in production, which is the one place nobody wants to meet a
 * control for the first time. So the interface follows SHARING_ENABLED and only
 * the send follows this. The window in which they disagree belongs to whoever
 * is setting the project up, lasts as long as the console steps in
 * docs/DATA-EXPORT.md, and says so loudly in the console.
 */
export const FIREBASE_CONFIGURED =
  !Object.values(firebaseConfig).some((v) => String(v).startsWith('PASTE_'))

/** A send is possible only when sharing is switched on AND configured. */
export const SHARING_AVAILABLE = SHARING_ENABLED && FIREBASE_CONFIGURED

if (SHARING_ENABLED && !FIREBASE_CONFIGURED && typeof console !== 'undefined') {
  console.warn(
    '[sdshc] Sharing is switched on but src/firebase-config.js still has placeholder ' +
      'values, so nothing will be sent. See docs/DATA-EXPORT.md.'
  )
}
