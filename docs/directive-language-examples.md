# The m2py directive language — examples

Directives are plain comments at the start of a line, understood by
`js/data-directives.js` before any script actually runs. The comment marker
can be `#`, `--`, or `//` (whichever the active mode uses) — the parser
treats them identically.

## Grammar

```
directive   := connect | read | create | add | join   (aliaser: load/require=read, import=add, create-dataset/create_dataset=create)

connect     := "connect" target ["as" alias] ["," option]*
read        := "read" (alias["/" path] | url) "as" NAME ["," option]*
require     := "require" target "as" NAME              # legacy alias for read
option      := "key(" (literal | "ask") ")"
             | "exec(" ("local" | "remote") ")"

target      := registry-id | url | anvil-name
```

`target` resolves in this order:
1. **Registry id** — an entry in `data/data-sources.json` (`ssb`, `eurostat`, `worldbank`, `oecd`, `who`, ...) → public web API, fetched with that entry's `base_url`/proxy rules.
2. **URL** (`http(s)://...`) → fetched directly. If the bytes turn out to be a `safepy-enc-v1` encrypted envelope, a key is required.
3. **Bare name that isn't a known registry id** → treated as a **registered Anvil source** (`GET /_/api/source_access?id=<name>`); the source's registered `level`/`local_mode` then decides whether it downloads locally, requires a key, or is remote-only.

---

## 1. Public registry source — no options needed

```
# ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2-beta/tables")
# ledighet = ssb.read("05839/data?outputFormat=csv")
```
`ssb` is connected as an alias for a base URL; `read` appends a path to it and binds the result into the script under the name `ledighet`.

Using the short registry id instead of the full URL works the same way:
```
# ssb = ost.connect("ssb")
# ledighet = ssb.read("tables/05839/data?outputFormat=csv")
```

## 2. Plain public URL, no `connect` needed at all

```
// co2 = ost.read("https://ourworldindata.org/grapher/co2-emissions.csv")
```
A bare URL can be `read` directly — no `connect` line required, no alias indirection.

## 3. Legacy `require` (URL-only alias for `read`)

```
# gammel = ost.read("https://x.example/gammel-data.csv")
```
`require` behaves exactly like `read` for URLs. Named (non-URL) sources still use `require` for backward compatibility but are treated specially and NOT rewritten by the client — they route straight to the server.

## 4. FRED — a registry source that needs the CORS proxy + an API key

```
# fred = ost.connect("fred")
# us = fred.read("series/observations?series_id=UNRATE&file_type=json")
```
Because the FRED registry entry declares `cors:false` and an `auth` block, the fetch is silently routed through `/api/hent` (the same-origin proxy) instead of a direct browser fetch — the script itself doesn't change.

## 5. Registered protected source — key supplied interactively

```
# h = ost.connect("helse2025", secret_key="ask")
# df = h.read()
```
`helse2025` isn't a public registry id, so it resolves as an Anvil-registered source. `key(ask)` means: don't hard-code a secret in the script — pop a password modal at run time, held in memory only for that session (never written to localStorage, never logged).

## 6. Registered source with a literal key and forced remote execution

```
# k = ost.connect("kilde2", secret_key="qL7xK2mN9pR4sT6v", exec="remote")
# df = k.read()
```
`exec(remote)` forces the whole script for this source onto the server, even if the source's policy would otherwise allow local analysis. (The reverse, `exec(local)`, is refused by the client if the source's registered level is non-public — protected/sensitive sources can never be forced local.)

## 7. Directly loading an encrypted file by URL

```
# df = ost.read("https://raw.githubusercontent.com/owner/repo/data.enc.json", secret_key="abcDEF123")
```
No `connect`/registration needed if the owner just hands you a URL and a key: the loader sniffs the `safepy-enc-v1` envelope, verifies its fingerprint, and decrypts client-side with WebCrypto using the supplied key.

## 8. Key precedence — `read`-level key overrides `connect`-level key

```
# h = ost.connect("helse2025", secret_key="K1")
# df = h.read(secret_key="K2")
```
`df` is decrypted with `K2`. A key on `connect` is just the default for everything loaded through that alias; a key on the individual `load` line wins.

## 9. Mixing several sources of different kinds in one script

```
# s = ost.connect("ssb")
# h = ost.connect("helse2025", secret_key="ask")
# offentlig = s.read("tables")
# beskyttet = h.read()
# owid = ost.read("https://ourworldindata.org/grapher/life-expectancy.csv")
```
`offentlig` comes from the public SSB registry, `beskyttet` from a key-gated Anvil source, and `owid` from a plain public URL — each resolved independently by the same script.

## 9b. API sources by kind — OECD, ECB, Norges Bank, Verdensbanken, DBnomics (2026-07-25)

The registry carries the kind, so the source name is all you need — the user
knows the source, not the protocol:

```
# o = ost.connect("oecd")
# levealder = o.read("OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE/all?startPeriod=2020")

# wb = ost.connect("worldbank")
# bnp = wb.read("country/NOR;SWE/indicator/NY.GDP.MKTP.CD?date=2015:2024")

# dbn = ost.connect("dbnomics")
# vekst = dbn.read("IMF/WEO:latest/NOR.NGDP_RPCH")
```

With a bare URL, name the kind explicitly — source names (`oecd`, `ecb`,
`norgesbank`, `imf`) are aliases for the underlying protocol (`sdmx`), and
`worldbank`/`dbnomics` are protocols of their own:

```
# ecb = ost.connect("https://data-api.ecb.europa.eu/service/data", kind="sdmx")
# kurs = ecb.read("EXR/D.USD.EUR.SP00.A?startPeriod=2026-01-01")
```

All deliver a tidy long-format frame (the API's own column names —
`REF_AREA`/`TIME_PERIOD`/`OBS_VALUE` for SDMX sources, `indicator`/`country`/
`date`/`value` for Verdensbanken, `series_code`/dimensions/`period`/`value`
for DBnomics).

## 9c. Canonical query vocabulary — translated per source (2026-07-25)

`years(a:b)`, `countries(…)`, `regions(…)`, `indicators(…)` and
`filters(k=v …)` on the `read` line are translated to each source's own
query model — and fail loudly when a field can't be translated verifiably
for that source (SDMX 2.1 APIs silently ignore unknown parameters, which
would return wrong-but-plausible data):

```
# o = ost.connect("oecd")
# le = o.read("OECD.ELS.HD,DSD_HEALTH_STAT@DF_LE", countries=["NOR", "SWE"], years="2020:2023")

# wb = ost.connect("worldbank")
# bnp = wb.read(indicators=["NY.GDP.MKTP.CD"], countries=["NOR", "SWE"], years="2015:2024")

# eu = ost.connect("eurostat")
# bnp2 = eu.read("nama_10_gdp", countries=["NO"], years="2020:", filters={"na_item": "B1GQ", "unit": "CP_MEUR"})

# ssb = ost.connect("ssb")
# bef = ssb.read("05839", years="2007:", regions=["0"], indicators=["Personer"])
```

For SDMX sources, `countries()`/`indicators()`/`filters()` build the dotted
key path automatically (one small `lastNObservations=1` probe reveals the
dataflow's dimensions); `years(a:b)` maps to `startPeriod`/`endPeriod`
(SDMX), `date=` (Verdensbanken), `sinceTimePeriod`/`untilTimePeriod`
(Eurostat) and `valueCodes[Tid]` (PxWeb). Open ends work: `years(2020:)`.

## 10. Variable-level assembly — `create` / `add` / `join`

A separate, richer directive set lets you assemble one analysis dataset out of *columns* pulled from multiple registered sources, rather than loading each source as a whole frame:

```
# p = ost.connect("people")
# s = ost.connect("sales_src")
# panel = ost.create(key="pid")
# panel.add(p, ["income", "edu"])
# panel.add(p, ["region"])
# sales = s.read()
# panel.join(sales, on="pid")
```
This declares a dataset called `panel`, keyed on `pid`; pulls the `income` and `edu` columns from source `p` (plus `region` in a second `add` line); separately reads all of `sales_src` as `sales`; then joins `sales` into `panel` on the `pid` key. `add`/`join` default to a `left` join — an explicit join type can be appended:

```
# panel.add(p, ["x"], how="inner")
# panel.join(sales, on="pid", how="outer")
```

## 11. Comment-marker flexibility (same directive, three syntaxes)

These three lines are parsed identically — only the comment marker differs, matching whichever language mode the script segment is in:
```
# ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2-beta/tables")
-- ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2-beta/tables")
// ssb = ost.connect("https://data.ssb.no/api/pxwebapi/v2-beta/tables")
```

## 12. Homomorphically-encrypted (HE) tier

HE sources (`format="he"`, Paillier-encrypted) use the **same** `connect`/`load`/`require` directives as any other registered source — there is no separate directive syntax. What's different is the *editor mode/dialect* the script runs under, and what happens on resolution: the ciphertext is useless without the authority key, so an HE source is **always executed remotely** through the HE facade, never fetched or decrypted into the browser.

Referencing a registered HE source is written exactly like a protected source (§5 above):
```
# h = ost.connect("helse_he", secret_key="ask")
# df = h.read()
```
The difference is invisible in the directive text — it's the registered source's `format` field, checked at `/source_access` resolution time, that routes it into the HE facade instead of a normal remote run.

The legacy `require` form works the same way and is the one actually wired to the "Kryptert" (HE) editor tab, whose `dialect` is fixed to `'he'` for every script run in that tab:
```
# h = helse_he.read()
```
Running that line while the active editor mode/tab is **Kryptert** sends the whole script to the server with `dialect: 'he'`; the server never decrypts the data, and only the HE facade verbs (`group_agg`, `value_counts`, `crosstab`, `ols`) are available against it.

**`exec(local)` is always refused on an HE source** — there's no plaintext to run against locally:
```
# h = ost.connect("helse_he", exec="local")
# df = h.read()
```
→ rejected with the same "cannot run locally" error protected/sensitive sources get, except here it's unconditional (HE has no local mode at all, unlike `protected`/`sensitive` which can allow `local_mode="open"`/`"strict"`).

**You cannot mix an HE (or any named) source with a plain URL source in one remote run yet:**
```
# h = helse_he.read()
# co2 = ost.read("https://ourworldindata.org/grapher/co2.csv")
```
→ refused: "Server-kjøring kan ikke kombinere navngitte kilder og URL-kilder (ennå)" (server execution can't yet combine named sources and URL sources — use only named sources).

---

**Source:** grammar and resolution order from
`docs/superpowers/specs/2026-07-05-encrypted-external-sources-design.md` §1;
parsing implemented in `js/data-directives.js`; fetch/decrypt implemented in
`js/data-loader.js`; every example above (except #9, a composite) mirrors a
case asserted in `netlify/edge-functions/_lib/data-directives.test.ts`.
