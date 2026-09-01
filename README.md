# SDSHC Farm Plan Budget

A farm enterprise budget calculator for the **South Dakota Soil Health Coalition**.

Build a budget for each crop you grow, add the costs your whole operation
carries, and see what the farm actually makes. Then save it, change one thing,
and compare the two side by side.

Works on a phone in a pickup and on a laptop at a desk. Installs to a home
screen and runs with **no signal**.

---

## What it does

- **One budget per enterprise** — corn, silage, soybeans, grazing. As many as you
  need.
- **Every term explained** — tap the `?` beside anything confusing: gross margin,
  salvage value, why a machine costs you both depreciation *and* interest.
- **Typical values, if you want them** — some fields offer published figures.
  Nothing is ever filled in for you, and every list says where its numbers came
  from.
- **Save and compare scenarios** — Field Corn vs. Silage Corn, Tillage vs.
  No-Till. Change one thing, and see what it costs.
- **Export** — CSV, print for paper or PDF, or a budget file to move onto another
  device.

### Your budgets stay on your device

Saved budgets live in your browser. They are **not sent anywhere unless you turn
on sharing**, which is off until you choose it. That also means they won't appear
on your other phone or computer, and clearing your browsing data will delete
them. Export anything you want to keep.

### Sharing with the Coalition, if you want to

The **Share** switch beside the Budget and Saved tabs sends your saved budgets to
the South Dakota Soil Health Coalition, so it can understand what production
costs look like across the state. It is optional and off by default, and you are
asked once, the first time you save.

If you turn it on, saving a budget sends a copy: every figure you entered, the
budget name, the crop names, and the planning year. Each budget sends one record,
and saving again updates it rather than adding another. There is no account and
no name field, and nobody is asked who they are. Turning the switch off deletes
what this device has sent.

---

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173/SDSHC-farm-budget/
npm test         # the economic model + a browser smoke test
npm run build    # production build into dist/
```

Pushing to `main` deploys to GitHub Pages automatically. The tests run first, so
a broken calculation blocks the deploy.

## Repository

| Path | What it is |
|---|---|
| `src/calc.js` | The economic model. Pure — no DOM, no imports. |
| `src/state.js`, `src/storage.js` | The working budget, and saving it |
| `src/ui/` | Screens: enterprises, fixed costs, results, compare, modals |
| `src/data/` | Definitions, typical values, the how-to guide |
| `test/` | Model tests against a golden fixture, plus a DOM smoke test |
| `CLAUDE.md` | Architecture, contracts, and why the model does what it does |
| `TYPICAL-VALUES.md` | Where each suggested value came from |

---

Built for producers and students at the South Dakota Soil Health School.
