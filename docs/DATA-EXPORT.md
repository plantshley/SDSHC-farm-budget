# Shared budgets: setting it up, and getting the data out

Producers can opt in to sending their budgets to the Coalition. This document
covers the one-time Firebase setup, how to get the data as a spreadsheet, and
how to read the workbook without misinterpreting it.

Written for somebody who is not the person who built it.

---

## Part 1 · What is collected, and when

Sharing is **off until a producer turns it on**. They are asked once, the first
time they save a budget, and the switch beside the Budget and Saved tabs changes
the answer at any time.

When it is on, saving a budget sends **one record per budget**: every figure
entered, the budget name, the crop names, the planning year, and the recomputed
results. Saving again **updates that record** rather than adding another, so the
number of records is the number of budgets, never the number of visits.

Nobody is asked who they are. There is no account, no email address, and no name
field. The budget name is free text and is sent as typed, which is why the
consent dialog tells producers to leave personal details out of it.

A record is also sent for a budget that arrives without a save: one opened from
the Saved tab, a duplicate, and an imported budget file. Turning the switch on
sends **every budget already saved**, not only the one on screen.

Turning the switch off **deletes the records that device has sent**, including
the ones marked deleted below. It is the only control that removes anything.

**Deleting a budget on the device does NOT delete its record.** The record is
marked with a `deletedAt` date and every figure is kept. A producer clearing out
last year's plans is tidying their own list rather than withdrawing what they
already contributed, and last year's costs are the data being gathered. The
workbook carries a **`Deleted`** column on every sheet so those rows can be told
apart. The delete dialog says this on screen when there is a record to describe.

> The exact wording shown to producers lives in `PRIVACY_BODY` in
> `src/data/definitions.js`, and it is printed in three places: the footer link,
> the how-to guide, and the consent dialog. **If what is collected ever changes,
> that text changes first.** See CLAUDE.md.

### Still to decide

`PRIVACY_BODY` says what shared budgets are used for but not **how long they are
kept**. That is a Coalition policy question, not a technical one, and the text
carries a `TODO` until it is answered.

**Restoring a backup** behaves the same way. Budgets the backup carries keep
their own records. Budgets on the device that the backup does not carry are
dropped, and their records are marked deleted and kept, exactly as if each had
been deleted by hand. **A later restore that brings one back clears the mark**,
because the producer has that budget again. So does any ordinary save of it.

Importing a **single budget file** is different and always creates a new record.
The export strips the key, so the file names no existing record — which is
deliberate: a budget file travels between devices, and a key that travelled
would have two of them writing over each other.

It also says nothing about **deleting a budget**, which now keeps the shared
copy. Nothing there is false, but a reader would reasonably assume deleting a
budget deletes the copy, and the only place the app corrects that assumption is
the delete dialog itself. One sentence in `PRIVACY_BODY` would close it.

---

## Part 2 · Firebase console setup

One time, about fifteen minutes. Steps 1 to 9 produce the config the app needs.

1. **Create the project.** [console.firebase.google.com](https://console.firebase.google.com)
   → *Add project* → `sdshc-farm-budget`. **Turn Google Analytics off** for the
   project: the site already has its own GA4 stream and the Firebase-linked one
   measures something else.

   Do **not** put this in the games-hub project. Different data, different
   sensitivity, different rules.

2. **Create the database.** *Build → Firestore Database → Create database* →
   **Production mode** (starts locked, which is what you want) → location `nam5`
   or `us-central1`. **The location is permanent.**

3. **Confirm the free plan.** *Settings → Usage and billing.* No billing account
   attached. Spark caps you at 20k writes and 50k reads a day and 1 GiB stored,
   and **cannot produce a bill** — which is also the backstop against anyone
   spamming the write endpoint.

4. **Enable sign-in.** *Build → Authentication → Get started → Sign-in method →
   Email/Password → Enable.* Leave *Email link (passwordless)* off.

5. **Disable self-serve sign-up.** *Authentication → Settings → User actions →*
   uncheck **Enable create (sign-up)**.

   > Skipping this is the one mistake with real consequences. The `apiKey` is in
   > the public bundle by design, and without this anybody holding it can
   > register their own account.

6. **Add the export account.** *Authentication → Users → Add user* →
   `budget-export@sdshc.local` and a strong unique password. Copy the **User
   UID**.

   `.local` is not a real domain, and that cuts both ways:

   - **Password reset by email can never work.** If the password is lost, reset
     it at *Authentication → Users → ⋮ → Reset password*. There is no other way
     in. Write that on the same note as the password.
   - **There is no inbox to compromise**, so email-based account takeover does
     not exist here.

   One shared password means no per-person accounts and no record of who
   exported what. Rotating it in the console cuts everybody off at once.

7. **Mark the account as an admin.** *Firestore → Start collection* → collection
   id `admins` → document id = **the UID from step 6** → one field,
   `role: "admin"`. The rules only check that the document exists.

8. **Authorize the live site.** *Authentication → Settings → Authorized domains
   → Add domain* → `plantshley.github.io`.

   > Miss this and sign-in works perfectly on localhost and fails only in
   > production, which is a confusing hour if you meet it cold.

9. **Register the web app.** *Project settings → General → Your apps →* the
   `</>` icon → nickname `farm-budget-web` → **do not** tick *Firebase Hosting*
   (this deploys to GitHub Pages). Paste the config object into
   `src/firebase-config.js`, replacing the `PASTE_FROM_FIREBASE_CONSOLE` values.

   Until you do, the app logs a warning and sends nothing. The switch and the
   consent dialog still appear, so the rest of the app can be developed and
   tested without an account.

10. **Publish the rules.** Paste `firestore.rules` into *Firestore → Rules →
    Publish*, or:

    > **Re-publish them whenever `firestore.rules` changes in the repo.** They
    > live on Google's servers, not in the bundle, so editing the file does
    > nothing until it is published. The most recent change added `deletedAt` to
    > the allowed keys; without it, deleting a shared budget fails with a
    > permission error and the record keeps saying the budget is live.

    ```bash
    npm i -g firebase-tools
    firebase login
    firebase deploy --only firestore:rules
    ```

    Then use the **Playground** on that tab to check four things:

    | Simulation | Expected |
    |---|---|
    | `get` on `budget-submissions/x`, signed out | **denied** |
    | `create` with exactly the ten allowed fields | allowed |
    | the same `create` with one extra field | **denied** |
    | `get` signed in as a non-admin | **denied** |

11. **Service-account key** (only needed for the command-line script). *Project
    settings → Service accounts → Generate new private key* → save as
    `tools/service-account.json`.

    **It is already in `.gitignore`. It bypasses every rule. Never commit it and
    never email it.**

---

## Part 3 · Getting the spreadsheet

Two ways. Both produce the identical workbook, because both call the same
builder in `src/export-workbook.js`.

### The in-app panel — no laptop setup needed

This is the everyday way, and the one to hand to somebody else.

1. Open the calculator.
2. **On a computer:** press `Ctrl` + `Alt` + `E`.
   **On a phone or tablet:** tap the "South Dakota Soil Health Coalition" line
   at the bottom of the page **five times within two seconds**.
3. Enter the password from step 6. There is no email field.
4. **Download Excel workbook**, or take individual sheets as CSV.

Escape closes the panel.

> **The gesture is not the security.** The app's code is public, so anybody can
> discover the shortcut. What actually protects the data is `firestore.rules`,
> which denies reads to everyone except the signed-in admin account and is
> enforced on Google's servers. Somebody who opens the panel without the
> password sees an empty form and gets no data. This is on purpose, and it is
> why a discoverable shortcut is acceptable here.

### Clearing the collection

```bash
npm run clear-submissions -- --project sdshc-farm-budget
```

Prints how many records there are and **deletes nothing**. Add `--yes` to go
ahead. It needs the same `tools/service-account.json` as the export script.

**This is for clearing out test data.** It deletes every record from every
device, not just this one, including budgets real people shared and cannot send
again on their own. Producers withdraw with the **Share** switch, which deletes
what their own device sent and leaves everybody else's alone.

The project id has to match the key in `tools/`, so a key from another Firebase
project stops the run instead of emptying the wrong collection. There is no flag
to skip that check.

Devices that shared still hold their keys afterwards, so those budgets send
again the next time each is opened or saved. To stop that on your own device,
turn the Share switch off.

### The command-line script — bulk and archival

```bash
npm install                 # once
npm run export-submissions
```

Writes `submissions-YYYY-MM-DD.xlsx` and a companion
`submissions-YYYY-MM-DD-all-data.csv` into the project folder. Needs
`tools/service-account.json` from step 11.

Worth keeping because it goes through the Admin SDK and bypasses the rules
entirely: it still works if Auth is misconfigured or the admin password is lost,
and it can be scheduled.

---

## Part 4 · Reading the workbook

Seven sheets. **Every one starts with `shareId` and `Budget name`**, so any of
them can be joined to any other with a pivot table or a `VLOOKUP`.

| Sheet | One row per | Use it for |
|---|---|---|
| **All data** | budget | Everything on one row. Any question, no joining. Wide. |
| **Budgets** | budget | The quick look: acres, revenue, costs, profit. |
| **Enterprises** | enterprise | Comparing one crop across farms. Narrow, pivots well. |
| **Enterprises all data** | enterprise | The same, with each budget's context repeated. |
| **Variable lines** | cost line | "What does everyone pay for seed?" |
| **Fixed costs** | budget | Land rent, labor, and overheads. |
| **Equipment and buildings** | machine or building | Machinery. A `Kind` column separates the two. |

### Five things that will trip you up

1. **A row is a budget, not a save.** Saving the same budget again updates its
   row. The row count is a count of budgets, never of visits.

2. **A repeated `shareId` is not a duplicate.** On *Enterprises*, *Enterprises
   all data*, *Variable lines*, and *Equipment and buildings*, a budget appears
   once per enterprise or item. **Count budgets on *All data*, *Budgets*, or
   *Fixed costs* only.**

3. **Do not sum a repeated column.** Land rent totalled down *Enterprises all
   data* is counted once per enterprise. Those columns are there for filtering.
   **Sum fixed costs on *Fixed costs*.**

4. **A blank cell means the box was never filled**, which is not the same as
   `0`. Averaging a column that treats them alike counts every untouched budget
   as a real zero. An explicit `0` a producer typed is exported as `0`.

5. **A `Deleted` date means the producer no longer has that budget.** Deleting a
   budget on the device marks the record and keeps the figures, so the workbook
   carries rows for plans nobody has on screen any more. The figures are the
   last ones sent and are as good as any other row; what has changed is that
   they will never be updated again. **Decide whether to include them before you
   average anything.** The column is on every sheet, so it can be filtered at
   whatever grain the question is being asked at. A blank means the budget is
   still live.

   The one thing this is not is a withdrawal. A producer who turns the **Share**
   switch off has their records deleted outright, marked ones included, and they
   leave the collection entirely.

### Where the numbers come from

Every figure is **recomputed** from the raw inputs by `src/calc.js`, the same
module the on-screen calculator uses. The `results` block stored on each record
is ignored. So the workbook always agrees with what the producer saw, even for a
record sent by an older version of the app.

The `App version` and `Schema version` columns say which build wrote each
record, which is how you tell "the model changed" from "that farm changed" when
a figure looks odd a year later.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Panel says the password was not accepted | Wrong password, or step 4 not done. Reset at *Authentication → Users → ⋮*. |
| Panel says the account is not in "admins" | Step 7. The document id must be the **UID**, not the email. |
| Sign-in works locally, fails on the live site | Step 8, authorized domains. |
| Nothing is ever sent, console warns about placeholders | Step 9, the config is not filled in. |
| Writes suddenly fail | Spark daily quota. It resets at midnight Pacific and never bills. |
| `npm run export-submissions` says no key | Step 11. |

---

## Files

| File | What it is |
|---|---|
| `src/firebase-config.js` | Project config, the export account, and the master switch |
| `src/share.js` | Sending and withdrawing. The only app module that talks to Firestore |
| `src/export-workbook.js` | The seven-sheet builder, shared by both exits |
| `src/exporter.js` | The hidden panel |
| `tools/export-submissions.mjs` | The command-line export |
| `firestore.rules` | Who can read and write. The actual security |
| `src/data/definitions.js` | `PRIVACY_BODY`, the text shown to producers |
