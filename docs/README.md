# AskStat docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)**: the Ask flow end to end (router →
  `/api/svar` → client `run_code` → answer), the source registry, the
  kilde-forslag/kilde-pr flow, telemetry, the eval harness, and known
  performance/structure debt.
- **[ROADMAP.md](ROADMAP.md)**: open items and decisions.
- **`superpowers/specs/`, `superpowers/plans/`**: dated design specs and
  implementation plans (one per feature round).
- **`eval/`**: Ask eval sets and harness round reports (see
  `tools/harness/evalrun.md`).
- **`directive-language-examples.md` / `.html`**: reference for the
  `ost.read` / `ost.connect` / `ost.use` directive language.
- **`portable-export-examples/`**: example output of the portable export.
- **`lovverk/`**: privacy-law background notes (data minimisation and related
  topics).
- **`archive/`**: finished or obsolete plans, kept for history. This
  includes the old root `PLAN.md` and the engine and microdata removal
  plans.

The other files here (`*-validation.md`, `polars-offline-backend.md`,
`extended-mode-architecture.md`, research notes) are point-in-time analyses.
Some predate the fork from openstat and still mention the removed microdata
engine.
