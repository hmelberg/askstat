# Community source packs

A **source pack** is a markdown text that AskStat adds to the answer prompt
when the user selects it — describing preferred data sources for a country
or a topic (e.g. a national statistical agency, or a survey family like the
NHIS). Users import packs as **copies**: once imported, your later edits do
not change their copy.

## Contributing a pack (pull request)

1. Add `data/packs/community/<id>.md` — lowercase id, `a-z0-9-` only.
2. Add an entry to `data/packs/index.json` under `packs`:

```json
{
  "id": "my-pack",
  "name": "My pack",
  "description": "One sentence on what it covers.",
  "summary": "≤1500 characters, listing every source the pack covers — used as the short-form version when the model's budget is tight.",
  "file": "community/my-pack.md",
  "community": true,
  "kind": "source",
  "author": "your-github-handle",
  "updated": "2026-08-05"
}
```

   `kind` is required — `"source"` for a single-source pack (id prefixed
   `src-`) or `"overview"` for a multi-source topic pack; see below.

3. Open a pull request. CI lints format, size and links; a maintainer
   reviews the content before merge.

## `kind`: source packs vs. overview packs

Every community pack entry in `index.json` needs a `kind` field — the lint
enforces this. There are two values:

- **`"source"`** — a single-source pack, one source per pack. Its id is
  prefixed `src-` (e.g. `src-fars`, `src-gss`, `src-share`) to keep it
  unambiguous from registry-source ids in `get_pack` calls, logs and PRs.
  Content is written YAML-tight and byte-faithful to the source's own
  wording where a YAML block already existed for it; otherwise it's
  prose covering the same ground: what the source is, unit/coverage,
  honest access status, gotchas, concrete URLs/load examples.
- **`"overview"`** — a topic pack covering several sources. Its body is a
  cross-cutting narrative (comparisons, fallback advice) plus one line per
  source using the notation `**Name** (id: src-name) — one-line summary`.
  A drift lint checks that every `(id: …)` reference in an overview pack
  resolves to a real id in `index.json`.

Registry sources (`ssb`, `hf`, `cessda`, `census`, …) never get their own
`src-` pack — the built-in adapter and, where one exists, the source guide
already cover them. In pack prose, refer to them as a **"registry
source"**, and add "see the X source guide" only when
`data/source-guides/<id>.md` actually exists for that id.

A source shared by multiple overview packs (e.g. `cessda`, `src-hfcs`) is
written once and referenced from each overview that needs it — never
duplicated into two packs.

Overview packs that mention a source too small to warrant its own pack
list it under an **"Other sources"** heading instead — no `(id: …)`
reference, just 1-2 sentences covering access level and the main caveat.

## Writing a good pack

- **English, markdown.** Full text is capped at 40,000 characters (a summary
  field, ≤1,500 characters, is used when the model gets a short-form
  budget) — the text is injected into the model's prompt verbatim (headings
  are demoted automatically). Keep single-source packs well under the cap;
  broader topic packs may use more of it.
- **Point at sources the engine can reach**: registry sources by id
  (`ssb`, `statfin`, `eurostat`, `dbnomics`, …), or plain `https://` URLs
  the model can probe/fetch. Landing pages are fine; direct data URLs are
  better.
- **Quote the load-bearing facts** instead of attaching documents: missing-
  value codes, weight variables, table ids that work. Link to the full
  questionnaire or codebook by URL.
- **Be honest about coverage**: if a source has no adapter, say so and name
  the fallback (eurostat/dbnomics/web_fetch). Never promise access the
  engine does not have.
- **Never include secrets or API keys.** Refer to stored keys as
  `key(name)` if a source needs one.

Packs steer *preferences*, never rules: they cannot override the engine's
honesty guarantees (probing, fabrication guards, budgets).
