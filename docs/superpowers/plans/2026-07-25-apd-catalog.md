# APD-katalog (langhale-oppdagelse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en selv-høstet, statisk, søkbar katalog av de 868 datasettene i awesome-public-datasets' `apd-core`, koblet inn i openstats eksisterende `search_catalog`-verktøy slik at data-svar-AI-en kan oppdage dem uten noe live GitHub-kall ved spørretidspunkt.

**Architecture:** Et manuelt kjørt Python-script laster ned `apd-core` som ÉN tarball, normaliserer hver datasett-YAML til en kompakt schema.org/Dataset-formet JSON-post, og skriver `data/apd-catalog.json`. En ny `apd`-registeroppføring pluss en ny dispatch-gren i `search-catalog.ts` lar det eksisterende `search_catalog`-verktøyet gjøre lokalt, in-memory nøkkelordsøk over den filen — ingen ny infrastruktur, gjenbruker nøyaktig samme `CatalogHit`/register-mønster som SSBs pxweb-adapter allerede har etablert.

**Tech Stack:** Python 3 stdlib (`urllib.request`, `tarfile`, `json`) + PyYAML for høsteren; Deno/TypeScript for `search_catalog`-dispatchen (matcher eksisterende `netlify/edge-functions/_lib/tools/`-kode).

## Global Constraints

- Katalogfil: `data/apd-catalog.json` (IKKE `static_data/` — den mappen er for demo-datasett).
- Feltskjema: schema.org/Dataset-vokabular + 2 lokale tillegg (`category`, `access_level`) + 2 drift-felt (`reachable`, `checked_at`) — eksakt tabell i spec §3 (`docs/superpowers/specs/2026-07-25-apd-catalog-design.md`).
- `MAX_HITS = 20` på søketreff (matcher konstanten som allerede finnes i `search-catalog.ts`).
- Beskrivelser kuttes til ~200 tegn (matcher `cleanDescription`-konvensjonen i `catalog-format.ts`).
- ALDRI live nettverk i automatiske tester — mock `fetch`/`urlopen` overalt.
- Høsteren henter HELE `apd-core`-repoet som ÉN tarball — ALDRI 868 enkelt-fetches mot `raw.githubusercontent.com`.
- Livstegn-sjekken (HEAD, GET-fallback ved 405/501) er kun informativ (`reachable`/`checked_at`) — ALDRI en erstatning for `probe`-verktøyets faktiske verifisering ved bruk.
- Manuell re-høste-kadens (ingen cron/CI) — matcher `tools/build_norge_geojson.py`-konvensjonen.
- Denne planen er UAVHENGIG av `2026-07-25-source-catalog-adapters-design.md` — kun det minimale to-nivås dispatch-skjelettet som trengs for `apd`-grenen innføres her.
- Test-kommandoer: `cd netlify/edge-functions && deno test --allow-all _lib/` (TS), `python3 -m pytest tests/ -q` (Python), begge fra repo-roten `/Users/hom/Documents/GitHub/openstat`.

---

### Task 1: Python — normaliser én apd-core-YAML til schema.org/Dataset-skjemaet

**Files:**
- Create: `tools/harvest_apd_catalog.py`
- Test: `tests/test_harvest_apd_catalog.py`

**Interfaces:**
- Produces: `normalize_entry(category: str, slug: str, raw: dict) -> dict` med nøklene
  `identifier, name, description, url, distributionUrl, keywords, license,
  inLanguage, creator, category, access_level` (se spec §3-tabellen). Brukes
  av Task 2s `harvest()`.

- [ ] **Step 1: Opprett `tools/harvest_apd_catalog.py` med docstring + imports + `normalize_entry`**

```python
"""Høst awesome-public-datasets' maskinlesbare kilde (apd-core, én YAML per
datasett) til data/apd-catalog.json — søkbar lokalt av search_catalog(apd, …)
uten live GitHub-kall ved spørretidspunkt.

Kjøres manuelt fra repo-roten når katalogen skal oppdateres:
    python3 tools/harvest_apd_catalog.py
Skjema og beslutninger: docs/superpowers/specs/2026-07-25-apd-catalog-design.md §3.
"""
import io
import json
import os
import tarfile
import urllib.error
import urllib.request

import yaml

TARBALL_URL = "https://github.com/awesomedata/apd-core/archive/refs/heads/master.tar.gz"
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'apd-catalog.json')
DESCRIPTION_MAX = 200
HEAD_TIMEOUT_S = 5


def normalize_entry(category, slug, raw):
    """Map én apd-core-YAML (rå dict fra yaml.safe_load) til
    schema.org/Dataset-feltskjemaet (spec §3). `raw` kan mangle alle felt
    utenom title/homepage/category."""
    keywords_raw = raw.get('keywords') or ''
    keywords = (
        [k.strip() for k in keywords_raw.split(',') if k.strip()]
        if isinstance(keywords_raw, str) else []
    )

    org = raw.get('organization')
    if isinstance(org, list) and org and isinstance(org[0], dict):
        creator = org[0].get('name')
    elif isinstance(org, str):
        creator = org
    else:
        creator = raw.get('publisher')

    description = (raw.get('description') or '').strip()
    if len(description) > DESCRIPTION_MAX:
        description = description[:DESCRIPTION_MAX - 3] + '...'

    return {
        'identifier': f"{category}/{slug}",
        'name': raw.get('title') or slug,
        'description': description,
        'url': raw.get('homepage') or '',
        'distributionUrl': raw.get('specification') or raw.get('data_dictionary') or None,
        'keywords': keywords,
        'license': raw.get('license'),
        'inLanguage': raw.get('language'),
        'creator': creator,
        'category': category,
        'access_level': raw.get('access_level'),
    }
```

- [ ] **Step 2: Skriv `tests/test_harvest_apd_catalog.py` med feilende tester for `normalize_entry`**

```python
"""Tester for tools/harvest_apd_catalog.py — YAML-normalisering, tarball-
utpakking og livstegn-sjekk. Ingen live nettverk (fetch/reachable_check
injiseres/mockes), jf. prosjektets "aldri live HTTP i tester"-konvensjon."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import harvest_apd_catalog as apd

FULL_YAML = b"""\
title: Lemons quality control dataset
homepage: https://github.com/softwaremill/lemon-dataset
category: Agriculture
description: Lemon dataset has been prepared to investigate the possibilities to tackle the issue of fruit quality control. It contains 2690 annotated images.
keywords: fruit, quality, lemon, segmentation
access_level: public
language: en
license: MIT
organization:
  - name: SoftwareMill
    web: https://softwaremill.com/
issued_time: 2020.07
"""

MINIMAL_YAML = b"""\
title: Open Food Facts
homepage: https://world.openfoodfacts.org/
category: Agriculture
"""


def test_normalize_entry_full():
    raw = apd.yaml.safe_load(FULL_YAML)
    entry = apd.normalize_entry("Agriculture", "Lemon-Dataset", raw)
    assert entry["identifier"] == "Agriculture/Lemon-Dataset"
    assert entry["name"] == "Lemons quality control dataset"
    assert entry["url"] == "https://github.com/softwaremill/lemon-dataset"
    assert entry["keywords"] == ["fruit", "quality", "lemon", "segmentation"]
    assert entry["license"] == "MIT"
    assert entry["inLanguage"] == "en"
    assert entry["creator"] == "SoftwareMill"
    assert entry["category"] == "Agriculture"
    assert entry["access_level"] == "public"
    assert entry["distributionUrl"] is None


def test_normalize_entry_minimal_fields_absent_not_crash():
    raw = apd.yaml.safe_load(MINIMAL_YAML)
    entry = apd.normalize_entry("Agriculture", "OpenFoodFacts", raw)
    assert entry["identifier"] == "Agriculture/OpenFoodFacts"
    assert entry["name"] == "Open Food Facts"
    assert entry["keywords"] == []
    assert entry["license"] is None
    assert entry["creator"] is None


def test_description_truncated_at_200_chars():
    long_desc = "x" * 300
    raw = {"title": "T", "homepage": "https://example.com", "category": "Agriculture",
           "description": long_desc}
    entry = apd.normalize_entry("Agriculture", "T", raw)
    assert len(entry["description"]) == 200
    assert entry["description"].endswith("...")
```

- [ ] **Step 3: Kjør testene, bekreft at de bygger og passerer**

Run: `python3 -m pytest tests/test_harvest_apd_catalog.py -v`
Expected: 3 tester PASS (`test_normalize_entry_full`,
`test_normalize_entry_minimal_fields_absent_not_crash`,
`test_description_truncated_at_200_chars`). Hvis PyYAML mangler lokalt:
`pip install pyyaml` (samme underforståtte avhengighet som
`tools/gen_jmv_specs.py` allerede har — ingen requirements-fil i repoet å
oppdatere, ingen nye konvensjoner innført).

- [ ] **Step 4: Commit**

```bash
git add tools/harvest_apd_catalog.py tests/test_harvest_apd_catalog.py
git commit -m "$(cat <<'EOF'
feat: normaliser apd-core-YAML til schema.org/Dataset-skjema

normalize_entry() er kjernen i høsteren for apd-katalogen (spec
2026-07-25-apd-catalog-design.md §3) — ren funksjon, ingen nettverk,
testet mot ekte YAML-eksempler fra apd-core (Lemon-Dataset/OpenFoodFacts).
EOF
)"
```

---

### Task 2: Python — tarball-henting, utpakking, livstegn-sjekk og full pipeline

**Files:**
- Modify: `tools/harvest_apd_catalog.py`
- Modify: `tests/test_harvest_apd_catalog.py`

**Interfaces:**
- Consumes: `normalize_entry(category, slug, raw) -> dict` (Task 1).
- Produces: `fetch_tarball_bytes(url=TARBALL_URL) -> bytes`,
  `extract_yaml_entries(tarball_bytes: bytes) -> list[tuple[str, str, dict]]`,
  `check_reachable(url: str, timeout=5) -> bool`,
  `harvest(fetch=fetch_tarball_bytes, reachable_check=check_reachable, today=None) -> list[dict]`,
  `main() -> None` (skriver `data/apd-catalog.json`). Brukes av Task 6 (reell kjøring).

- [ ] **Step 1: Skriv feilende tester for tarball-utpakking og livstegn-sjekk**

Legg til i `tests/test_harvest_apd_catalog.py` (etter eksisterende tester):

```python
import io
import tarfile


def make_tarball(files):
    """files: {"Agriculture/Lemon-Dataset.yml": b"...yaml bytes..."}"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for path, content in files.items():
            info = tarfile.TarInfo(name=f"apd-core-master/core/{path}")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def test_extract_yaml_entries_from_tarball():
    tb = make_tarball({
        "Agriculture/Lemon-Dataset.yml": FULL_YAML,
        "Agriculture/OpenFoodFacts.yml": MINIMAL_YAML,
    })
    entries = apd.extract_yaml_entries(tb)
    assert len(entries) == 2
    cats_slugs = {(c, s) for c, s, _ in entries}
    assert ("Agriculture", "Lemon-Dataset") in cats_slugs
    assert ("Agriculture", "OpenFoodFacts") in cats_slugs


def test_extract_yaml_entries_ignores_non_core_files():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        info1 = tarfile.TarInfo(name="apd-core-master/core/Agriculture/Lemon-Dataset.yml")
        info1.size = len(FULL_YAML)
        tar.addfile(info1, io.BytesIO(FULL_YAML))
        # toppnivå-fil utenfor core/ — skal IKKE plukkes opp (kun 2 path-deler)
        readme = b"not yaml"
        info2 = tarfile.TarInfo(name="apd-core-master/README.rst")
        info2.size = len(readme)
        tar.addfile(info2, io.BytesIO(readme))
    entries = apd.extract_yaml_entries(buf.getvalue())
    assert len(entries) == 1
    assert entries[0][:2] == ("Agriculture", "Lemon-Dataset")


def test_check_reachable_ok(monkeypatch):
    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
    monkeypatch.setattr(apd.urllib.request, "urlopen", lambda req, timeout=5: FakeResp())
    assert apd.check_reachable("https://example.com") is True


def test_check_reachable_head_405_falls_back_to_get(monkeypatch):
    calls = []
    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake_urlopen(req, timeout=5):
        calls.append(req.get_method())
        if req.get_method() == "HEAD":
            raise apd.urllib.error.HTTPError(req.full_url, 405, "Method Not Allowed", None, None)
        return FakeResp()
    monkeypatch.setattr(apd.urllib.request, "urlopen", fake_urlopen)
    assert apd.check_reachable("https://example.com") is True
    assert calls == ["HEAD", "GET"]


def test_check_reachable_unreachable_returns_false(monkeypatch):
    def fake_urlopen(req, timeout=5):
        raise OSError("timed out")
    monkeypatch.setattr(apd.urllib.request, "urlopen", fake_urlopen)
    assert apd.check_reachable("https://example.com") is False


def test_check_reachable_empty_url_returns_false():
    assert apd.check_reachable("") is False


def test_harvest_full_pipeline_injected_fetch_and_reachable():
    tb = make_tarball({"Agriculture/Lemon-Dataset.yml": FULL_YAML})
    catalog = apd.harvest(fetch=lambda: tb, reachable_check=lambda url: True, today="2026-07-25")
    assert len(catalog) == 1
    assert catalog[0]["identifier"] == "Agriculture/Lemon-Dataset"
    assert catalog[0]["reachable"] is True
    assert catalog[0]["checked_at"] == "2026-07-25"
```

- [ ] **Step 2: Kjør testene, bekreft at de feiler (funksjonene finnes ikke ennå)**

Run: `python3 -m pytest tests/test_harvest_apd_catalog.py -v`
Expected: FAIL med `AttributeError: module 'harvest_apd_catalog' has no
attribute 'extract_yaml_entries'` (og tilsvarende for `check_reachable`,
`harvest`).

- [ ] **Step 3: Implementer `fetch_tarball_bytes`, `extract_yaml_entries`, `check_reachable`, `harvest`, `main`**

Legg til i `tools/harvest_apd_catalog.py` (etter `normalize_entry`):

```python
def fetch_tarball_bytes(url=TARBALL_URL):
    """Last ned HELE apd-core-repoet som ett kall — ikke 868 enkelt-fetches
    mot raw.githubusercontent.com (unngår rate-limiting, høflig mot GitHub)."""
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read()


def extract_yaml_entries(tarball_bytes):
    """Pakk ut tarballen i minnet, returner [(kategori, slug, rå_yaml_dict), ...]
    for hver fil under core/<Kategori>/<slug>.yml (nøyaktig to nivåer —
    verifisert live mot repoet 2026-07-25: ingen dypere nesting finnes)."""
    entries = []
    with tarfile.open(fileobj=io.BytesIO(tarball_bytes), mode='r:gz') as tar:
        for member in tar.getmembers():
            # medlemsnavn: apd-core-master/core/<Kategori>/<slug>.yml
            parts = member.name.split('/')
            if len(parts) != 4 or parts[1] != 'core' or not parts[3].endswith('.yml'):
                continue
            category = parts[2]
            slug = parts[3][:-4]  # fjern .yml
            f = tar.extractfile(member)
            if f is None:
                continue
            raw = yaml.safe_load(f.read())
            if isinstance(raw, dict):
                entries.append((category, slug, raw))
    return entries


def check_reachable(url, timeout=HEAD_TIMEOUT_S):
    """Lett livstegn-sjekk: HEAD, fallback GET ved 405/501. IKKE en full
    nedlasting, og IKKE en erstatning for probe-verktøyet ved faktisk bruk
    (jf. DELIVERY-blokkens "ALDRI lever en uprobet URL")."""
    if not url:
        return False
    for method in ('HEAD', 'GET'):
        try:
            req = urllib.request.Request(url, method=method, headers={'User-Agent': 'openstat-harvester'})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return 200 <= resp.status < 400
        except urllib.error.HTTPError as e:
            if e.code in (405, 501) and method == 'HEAD':
                continue
            return False
        except Exception:
            return False
    return False


def harvest(fetch=fetch_tarball_bytes, reachable_check=check_reachable, today=None):
    """Full pipeline: hent → pars → normaliser → livstegn-sjekk. `today` som
    parameter (ikke datetime.date.today() inni funksjonen) holder pipelinen
    testbar og deterministisk."""
    raw_entries = extract_yaml_entries(fetch())
    catalog = []
    for category, slug, raw in raw_entries:
        entry = normalize_entry(category, slug, raw)
        entry['reachable'] = reachable_check(entry['url'])
        entry['checked_at'] = today
        catalog.append(entry)
    return catalog


def main():
    import datetime
    today = datetime.date.today().isoformat()
    catalog = harvest(today=today)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    reachable_n = sum(1 for e in catalog if e['reachable'])
    by_category = {}
    for e in catalog:
        by_category[e['category']] = by_category.get(e['category'], 0) + 1
    print(f"Høstet {len(catalog)} datasett-oppføringer -> {OUT}")
    print(f"Nåbare (HEAD/GET ok): {reachable_n}/{len(catalog)}")
    print(f"Kategorier ({len(by_category)}):")
    for cat, n in sorted(by_category.items()):
        print(f"  {cat}: {n}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Kjør testene på nytt, bekreft at alt passerer**

Run: `python3 -m pytest tests/test_harvest_apd_catalog.py -v`
Expected: alle 10 tester PASS (3 fra Task 1 + 7 nye).

- [ ] **Step 5: Commit**

```bash
git add tools/harvest_apd_catalog.py tests/test_harvest_apd_catalog.py
git commit -m "$(cat <<'EOF'
feat: full apd-catalog-høstepipeline (tarball, livstegn-sjekk, harvest())

Én tarball-nedlasting (ikke 868 enkelt-fetches), lokal utpakking,
lett HEAD/GET-livstegn-sjekk (informativ, aldri erstatning for probe).
Ingen live nettverk i testene — fetch/urlopen injiseres/mockes.
EOF
)"
```

---

### Task 3: Register — `apd`-kilde i `data/data-sources.json` + `kind`-felt i `DataSource`

**Files:**
- Modify: `netlify/edge-functions/_lib/registry.ts`
- Modify: `data/data-sources.json`
- Modify: `netlify/edge-functions/_lib/registry.test.ts`

**Interfaces:**
- Produces: `DataSource.kind?: string` (nytt felt på interfacet — brukes av
  Task 4s dispatch-kode); `renderRegistryBlock` markerer `kind==="apd"`-kilder
  som søkbare selv uten `sok_endepunkt`.

- [ ] **Step 1: Skriv feilende test for at `apd`-kilden markeres søkbar**

Legg til i `netlify/edge-functions/_lib/registry.test.ts`:

```ts
Deno.test("renderRegistryBlock marks kind=apd as søkbar even without sok_endepunkt", () => {
  const reg = parseRegistry([{
    id: "apd", navn: "APD", utgiver: "apd-core", tillit: "funnet", tilgang: "fil",
    kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false,
  }]);
  const block = renderRegistryBlock(reg);
  if (!block.includes("søkbar via search_catalog")) throw new Error("apd skal markeres søkbar:\n" + block);
});
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: FAIL — enten kompileringsfeil (`kind` finnes ikke på
`DataSource`-typen som brukes i `parseRegistry([{ ..., kind: "apd", ... }])`,
siden TS strukturelt sjekker literalen mot forventet input) eller (hvis det
kompilerer) assert-feil fordi `apd` ikke markeres søkbar ennå.

- [ ] **Step 3: Legg til `kind`-felt på `DataSource` og utvid søkbar-sjekken**

I `netlify/edge-functions/_lib/registry.ts`, i `DataSource`-interfacet, legg
til feltet (etter `tilgang`):

```ts
export interface DataSource {
  id: string;
  navn: string;
  utgiver: string;
  tillit: "offisiell" | "etablert" | "funnet";
  tilgang: "pxweb" | "sdmx" | "rest" | "ckan" | "fil";
  kind?: string;
  base_url: string;
  sok_endepunkt?: string;
  cors: boolean;
  join_nokler?: string[];
  oppskrift?: Record<string, string>;
  sporrings_url_mal?: string;
  auth?: SourceAuth;
  nokkel_hint?: string;
  quirks?: string;
}
```

I `renderRegistryBlock`, endre søkbar-sjekken fra:

```ts
    if (s.sok_endepunkt) bits.push("søkbar via search_catalog");
```

til:

```ts
    if (s.sok_endepunkt || s.kind === "apd") bits.push("søkbar via search_catalog");
```

- [ ] **Step 4: Kjør testen på nytt, bekreft at den passerer**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: alle tester i filen PASS (inkludert den nye).

- [ ] **Step 5: Legg til `apd`-oppføringen i `data/data-sources.json`**

Åpne `data/data-sources.json`, legg til som nytt element i JSON-arrayet (etter
siste eksisterende oppføring, `dbnomics`):

```json
  {
    "id": "apd",
    "navn": "Awesome Public Datasets (fellesskapskatalog)",
    "utgiver": "awesomedata/apd-core (GitHub-fellesskap)",
    "tillit": "funnet",
    "tilgang": "fil",
    "kind": "apd",
    "base_url": "https://github.com/awesomedata/apd-core",
    "cors": false,
    "quirks": "868 datasett-oppføringer (35 kategorier), datasett-nivå kun — ingen kolonneskjema. homepage er ofte en landingsside, ikke en direkte data-URL. Søkes LOKALT mot en forhåndshøstet katalog (data/apd-catalog.json), ingen live GitHub-kall."
  }
```

- [ ] **Step 6: Bekreft at den shippede registerfilen fortsatt validerer**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/registry.test.ts`
Expected: `shipped data/data-sources.json parses against the schema`-testen
PASS (den sjekker kun `reg.length >= 11`, som fortsatt stemmer med 19 kilder).

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/registry.ts netlify/edge-functions/_lib/registry.test.ts data/data-sources.json
git commit -m "$(cat <<'EOF'
feat: apd-kilde i registeret + kind-felt på DataSource

kind?: string lar renderRegistryBlock markere apd som søkbar via
search_catalog selv uten et live sok_endepunkt (søket er lokalt, se
Task 4). Samme kind-felt gjenbrukes senere av kildekatalog-adapterne
(egen, uavhengig spec).
EOF
)"
```

---

### Task 4: `search_catalog` — `apdSearch`-adapter + to-nivås dispatch

**Files:**
- Modify: `netlify/edge-functions/_lib/tools/search-catalog.ts`
- Modify: `netlify/edge-functions/data-svar.ts`
- Create: `netlify/edge-functions/_lib/tools/search-catalog.test.ts`

**Interfaces:**
- Consumes: `DataSource.kind` (Task 3), `findSource` fra `registry.ts`
  (uendret).
- Produces: `CatalogDeps` gets et nytt påkrevd felt `origin: string`;
  `clearApdCatalogCache()` (test-hjelper, samme mønster som
  `clearRegistryCache()`). `data/apd-catalog.json` (Task 2s output) må ligge
  i repoet for at produksjonskoden faktisk skal returnere treff — testene i
  denne oppgaven bruker en injisert fixture, ikke den ekte filen.

- [ ] **Step 1: Skriv feilende tester i en ny `search-catalog.test.ts`**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { searchCatalog, clearApdCatalogCache } from "./search-catalog.ts";
import { parseRegistry } from "../registry.ts";

const REG = parseRegistry([
  { id: "apd", navn: "Awesome Public Datasets", utgiver: "apd-core", tillit: "funnet",
    tilgang: "fil", kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false },
  { id: "owid", navn: "OWID", utgiver: "OWID", tillit: "etablert", tilgang: "fil",
    base_url: "https://ourworldindata.org/grapher/", cors: true },
]);

function fakeCatalogFetch(entries: unknown[]): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(entries), { status: 200 }))) as typeof fetch;
}

const FIXTURE = [
  { identifier: "Agriculture/Lemon-Dataset", name: "Lemons quality control dataset",
    description: "Fruit quality control dataset with annotated images.",
    url: "https://github.com/softwaremill/lemon-dataset", keywords: ["fruit", "quality"], category: "Agriculture" },
  { identifier: "Economics/GDP-Panel", name: "Global GDP panel",
    description: "Country-year GDP series.", url: "https://example.com/gdp",
    keywords: ["gdp", "economics"], category: "Economics" },
];

Deno.test("apdSearch: matches by name/description/keywords/category, case-insensitive", async () => {
  clearApdCatalogCache();
  const hits = await searchCatalog("apd", "FRUIT", { registry: REG, origin: "https://app.test", fetchImpl: fakeCatalogFetch(FIXTURE) });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].id, "Agriculture/Lemon-Dataset");
  assertEquals(hits[0].source, "apd");
  assertEquals(hits[0].url, "https://github.com/softwaremill/lemon-dataset");
  clearApdCatalogCache();
});

Deno.test("apdSearch: no match returns empty array", async () => {
  clearApdCatalogCache();
  const hits = await searchCatalog("apd", "zzznomatch", { registry: REG, origin: "https://app.test", fetchImpl: fakeCatalogFetch(FIXTURE) });
  assertEquals(hits, []);
  clearApdCatalogCache();
});

Deno.test("apdSearch: caps at 20 hits", async () => {
  clearApdCatalogCache();
  const many = Array.from({ length: 25 }, (_, i) => ({
    identifier: `Cat/item-${i}`, name: `Matching item ${i}`, description: "", url: "https://x", keywords: [], category: "Cat",
  }));
  const hits = await searchCatalog("apd", "matching", { registry: REG, origin: "https://app.test", fetchImpl: fakeCatalogFetch(many) });
  assertEquals(hits.length, 20);
  clearApdCatalogCache();
});

Deno.test("source without sok_endepunkt or apd-kind is not searchable", async () => {
  let threw = "";
  try { await searchCatalog("owid", "co2", { registry: REG, origin: "https://app.test" }); } catch (e) { threw = String(e); }
  if (!threw.includes("ikke søkbar")) throw new Error("ventet 'ikke søkbar': " + threw);
});
```

- [ ] **Step 2: Kjør testene, bekreft at de feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/tools/search-catalog.test.ts`
Expected: kompileringsfeil — `clearApdCatalogCache` finnes ikke,
`CatalogDeps` mangler `origin`.

- [ ] **Step 3: Implementer `apdSearch` + to-nivås dispatch i `search-catalog.ts`**

Full ny versjon av `netlify/edge-functions/_lib/tools/search-catalog.ts`:

```ts
// search_catalog tool: per-source-type adapters over live catalog APIs.
// Adapters exist for pxweb (SSB & friends), ckan (Felles datakatalog), og
// apd (lokal, forhåndshøstet katalog — se
// docs/superpowers/specs/2026-07-25-apd-catalog-design.md). Andre tilgang-
// verdier nås via web_search + probe (prompt-regel).
import { findSource, type DataSource } from "../registry.ts";

export interface CatalogHit {
  source: string;
  id: string;
  title: string;
  period?: string;
  url: string;
}

export interface CatalogDeps {
  registry: DataSource[];
  origin: string;
  fetchImpl?: typeof fetch;
}

const MAX_HITS = 20;

export async function searchCatalog(
  sourceId: string,
  query: string,
  deps: CatalogDeps,
): Promise<CatalogHit[]> {
  const src = findSource(deps.registry, sourceId);
  if (!src) throw new Error(`ukjent kilde '${sourceId}' — bruk en id fra kilderegisteret`);
  const f = deps.fetchImpl ?? fetch;
  if (!src.sok_endepunkt && src.kind !== "apd") {
    throw new Error(`kilden '${sourceId}' er ikke søkbar — bruk web_search + probe i stedet`);
  }
  switch (src.tilgang) {
    case "pxweb": return pxwebSearch(src, query, f);
    case "ckan": return fdkSearch(src, query, f);
    default:
      if (src.kind === "apd") return apdSearch(query, deps.origin, f);
      throw new Error(`ingen søkeadapter for tilgang='${src.tilgang}' (kilde '${sourceId}') — bruk web_search + probe`);
  }
}

async function pxwebSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  const url = src.sok_endepunkt!.replace("{q}", encodeURIComponent(query));
  const res = await f(url);
  if (!res.ok) throw new Error(`katalogsøk mot ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const tables = Array.isArray(json?.tables) ? json.tables : [];
  return tables.slice(0, MAX_HITS).map((t: Record<string, unknown>) => ({
    source: src.id,
    id: String(t.id ?? ""),
    title: String(t.label ?? ""),
    period: t.firstPeriod ? `${t.firstPeriod}–${t.lastPeriod ?? ""}` : undefined,
    url: new URL(`tables/${t.id}`, src.base_url).toString(),
  }));
}

async function fdkSearch(src: DataSource, query: string, f: typeof fetch): Promise<CatalogHit[]> {
  // Live API quirk (verified 2026-07-03): the query param is "q" (not "query"),
  // and without filters.type the search spans concepts/informationmodels/services
  // too — restrict to datasets or hits are dominated by CONCEPT entries.
  const res = await f(src.sok_endepunkt!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: query, filters: { type: { value: "datasets" } } }),
  });
  if (!res.ok) throw new Error(`katalogsøk mot ${src.id} feilet: HTTP ${res.status}`);
  const json = await res.json();
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  return hits.slice(0, MAX_HITS).map((h: Record<string, unknown>) => {
    const title = h.title as Record<string, string> | string | undefined;
    return {
      source: src.id,
      id: String(h.id ?? ""),
      title: typeof title === "object" ? (title?.nb ?? Object.values(title ?? {})[0] ?? "") : String(title ?? ""),
      url: String(h.uri ?? ""),
    };
  });
}

interface ApdCatalogEntry {
  identifier: string;
  name: string;
  description: string;
  url: string;
  keywords: string[];
  category: string;
}

let _apdCache: ApdCatalogEntry[] | null = null;
export function clearApdCatalogCache(): void { _apdCache = null; }

async function loadApdCatalog(origin: string, f: typeof fetch): Promise<ApdCatalogEntry[]> {
  if (_apdCache) return _apdCache;
  const res = await f(new URL("/data/apd-catalog.json", origin).toString());
  if (!res.ok) throw new Error(`kunne ikke hente apd-katalog: HTTP ${res.status}`);
  _apdCache = await res.json() as ApdCatalogEntry[];
  return _apdCache;
}

async function apdSearch(query: string, origin: string, f: typeof fetch): Promise<CatalogHit[]> {
  const catalog = await loadApdCatalog(origin, f);
  const q = query.toLowerCase();
  const hits = catalog.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.category.toLowerCase().includes(q) ||
    e.keywords.some((k) => k.toLowerCase().includes(q))
  );
  return hits.slice(0, MAX_HITS).map((e) => ({
    source: "apd",
    id: e.identifier,
    title: e.name,
    url: e.url,
  }));
}
```

- [ ] **Step 4: Tre origin` inn i kallstedet i `data-svar.ts`**

I `netlify/edge-functions/data-svar.ts`, finn `executeTool`-funksjonen
(rundt linje 130) og endre `search_catalog`-grenen fra:

```ts
    if (name === "search_catalog") {
      return JSON.stringify(await searchCatalog(String(input.source ?? ""), String(input.query ?? ""), { registry }));
    }
```

til:

```ts
    if (name === "search_catalog") {
      return JSON.stringify(await searchCatalog(String(input.source ?? ""), String(input.query ?? ""), { registry, origin }));
    }
```

(`origin` er allerede beregnet lenger opp i filen: `const origin = new URL(request.url).origin;`.)

- [ ] **Step 5: Kjør testene på nytt, bekreft at alt passerer**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: alle tester i `_lib/` PASS, inkludert de 4 nye i
`search-catalog.test.ts`.

- [ ] **Step 6: Type-sjekk**

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts`
Expected: ingen feil.

- [ ] **Step 7: Commit**

```bash
git add netlify/edge-functions/_lib/tools/search-catalog.ts netlify/edge-functions/_lib/tools/search-catalog.test.ts netlify/edge-functions/data-svar.ts
git commit -m "$(cat <<'EOF'
feat: apdSearch — lokalt søk i den forhåndshøstede apd-katalogen

search_catalog(apd, query) leser data/apd-catalog.json én gang (modul-
cache, samme mønster som registry.ts), filtrerer lokalt på navn/
beskrivelse/nøkkelord/kategori — null nettverkskall i selve verktøyet.
CatalogDeps får et nytt origin-felt for å bygge den relative URL-en.
EOF
)"
```

---

### Task 5: Prompt — fjern awesome-public-datasets fra web_search-tipsene

**Files:**
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.ts`
- Modify: `netlify/edge-functions/_lib/data-svar-prompt.test.ts`
- Modify: `netlify/edge-functions/prompts/data-svar.md` (kildedokument/endringslogg — se filens egen header)

**Interfaces:**
- Ingen nye — ren tekstendring i en eksisterende eksportert konstant
  (`SEARCH_HINTS`, konsumert av `buildDataSvarSystem`, uendret signatur).

- [ ] **Step 1: Oppdater den feilende needle-testen først**

I `netlify/edge-functions/_lib/data-svar-prompt.test.ts`, i testen
`"system prompt: byte-stable, mode-specific, carries core rules"`, endre
needle-listen fra:

```ts
    "Søketips", "awesome-public-datasets",
```

til:

```ts
    "Søketips", "data.europa.eu",
```

- [ ] **Step 2: Kjør testen, bekreft at den feiler**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/data-svar-prompt.test.ts`
Expected: FAIL — `mangler: data.europa.eu` (teksten inneholder fortsatt
`awesome-public-datasets`, ikke ordlyden vi vil ha).

- [ ] **Step 3: Oppdater `SEARCH_HINTS` i `data-svar-prompt.ts`**

Endre fra:

```ts
const SEARCH_HINTS = `\
## Søketips utenfor registeret

Når registeret og search_catalog ikke dekker temaet, er gode startpunkter for
web_search/web_fetch: awesome-public-datasets
(github.com/awesomedata/awesome-public-datasets — kategorisert lenkeliste, en
del døde lenker), data.europa.eu (EU-landenes offisielle datasett) og Google
Dataset Search (datasetsearch.research.google.com). Alt funnet denne veien er
tillit=funnet: probe URL-en før bruk (som alltid), og foretrekk registerkilder
når de dekker spørsmålet.`;
```

til:

```ts
const SEARCH_HINTS = `\
## Søketips utenfor registeret

awesome-public-datasets er en registerkilde (\`search_catalog(apd, …)\`),
IKKE et web_search-mål lenger. Når registeret og search_catalog likevel ikke
dekker temaet, er gode startpunkter for web_search/web_fetch: data.europa.eu
(EU-landenes offisielle datasett) og Google Dataset Search
(datasetsearch.research.google.com). Alt funnet denne veien er tillit=funnet:
probe URL-en før bruk (som alltid), og foretrekk registerkilder når de
dekker spørsmålet.`;
```

- [ ] **Step 4: Kjør testene på nytt, bekreft at alt passerer**

Run: `cd netlify/edge-functions && deno test --allow-all _lib/`
Expected: alle tester PASS.

- [ ] **Step 5: Oppdater kildedokumentets endringslogg**

I `netlify/edge-functions/prompts/data-svar.md`, legg til en ny linje i
ENDRINGSLOGG-listen (etter siste oppføring, `2026-07-23 (2)`):

```
- 2026-07-25: SEARCH_HINTS peker ikke lenger på awesome-public-datasets som
  web_search-mål — den er nå en registerkilde (search_catalog(apd, …), se
  docs/superpowers/specs/2026-07-25-apd-catalog-design.md).
```

- [ ] **Step 6: Commit**

```bash
git add netlify/edge-functions/_lib/data-svar-prompt.ts netlify/edge-functions/_lib/data-svar-prompt.test.ts netlify/edge-functions/prompts/data-svar.md
git commit -m "$(cat <<'EOF'
docs: SEARCH_HINTS peker på search_catalog(apd) i stedet for web_search

awesome-public-datasets er nå en registerkilde (Task 4) — modellen skal
ikke lenger web_search'e README-en for den.
EOF
)"
```

---

### Task 6: Reell høsting + full-suite-verifisering

**Files:**
- Create: `data/apd-catalog.json` (generert, ikke håndskrevet)

**Interfaces:**
- Ingen nye — dette er integrasjonssteget som produserer den ekte
  artefakten Task 4s produksjonskode (`loadApdCatalog`) faktisk leser.

- [ ] **Step 1: Kjør høsteren mot det ekte apd-core-repoet**

Run: `python3 tools/harvest_apd_catalog.py`

Dette gjør 868 HEAD/GET-livstegn-sjekker sekvensielt (§4 i spec-en aksepterer
dette som greit for en manuell, sjelden jobb) — forvent flere minutter,
potensielt opp mot 10-15 minutter hvis flere lenker timer ut (5s tak per
url). IKKE avbryt tidlig; scriptet skriver først til fil når HELE
pipelinen er ferdig.

Expected stdout (omtrentlig, tallene kan avvike noe fra en re-høsting):
```
Høstet 868 datasett-oppføringer -> .../data/apd-catalog.json
Nåbare (HEAD/GET ok): <N>/868
Kategorier (35):
  Agriculture: <n>
  ...
```

- [ ] **Step 2: Stikkprøve på output**

Run: `python3 -c "
import json
d = json.load(open('data/apd-catalog.json'))
print(len(d), 'oppføringer')
print(d[0])
assert all('identifier' in e and 'name' in e and 'category' in e for e in d)
print('OK: alle poster har identifier/name/category')
"`
Expected: `868 oppføringer` (eller nært, avhengig av apd-cores tilstand ved
høstetidspunkt), en eksempelpost trykt, og `OK: alle poster har
identifier/name/category`.

- [ ] **Step 3: Kjør HELE test-suiten (Python + Deno)**

Run: `python3 -m pytest tests/ -q`
Expected: alle tester PASS, ingen nye feil.

Run: `cd netlify/edge-functions && deno check *.ts _lib/*.ts _lib/tools/*.ts && deno test --allow-all _lib/`
Expected: type-sjekk ren, alle tester PASS.

- [ ] **Step 4: Manuell smoke-test mot lokal dev-server (valgfritt, men anbefalt)**

Run: `netlify dev` (fra repo-roten, krever `.env` med `ANTHROPIC_API_KEY` —
se `netlify/edge-functions/README.md`), still et spørsmål i Web-modus som
IKKE dekkes av de 18 opprinnelige registerkildene (f.eks. et nisje-tema fra
en av de 35 apd-kategoriene), og bekreft i progress-loggen at
`search_catalog`-kallet mot `apd` returnerer treff.

- [ ] **Step 5: Commit den genererte katalogen**

```bash
git add data/apd-catalog.json
git commit -m "$(cat <<'EOF'
data: første høsting av apd-katalogen (868 datasett, 35 kategorier)

Generert av tools/harvest_apd_catalog.py mot awesomedata/apd-core.
Re-høst manuelt ved behov (ingen cron) — se spec §4.
EOF
)"
```

---

## Selvgjennomgang (utført før planen ble levert)

- **Spec-dekning:** §1 (omfang) → Task 3-4; §2 (arkitektur/dispatch) →
  Task 3-4; §3 (metadatastandard/feltskjema) → Task 1; §4 (høster) →
  Task 1-2, 6; §5 (skala/tokenkostnad) → oppfylt av design i Task 4 (kun
  treff returneres, ikke hele katalogen); §6 (testing) → Task 1-2, 4;
  §7 (bevisst utenfor) → ingen tasks trengs (korrekt, det er eksklusjoner).
- **Plassholder-skann:** ingen TBD/TODO; alle steg har komplett kode.
- **Type-konsistens sjekket:** `CatalogDeps.origin` (Task 4) brukes
  konsekvent i alle nye tester og i `data-svar.ts`-kallstedet;
  `DataSource.kind` (Task 3) brukes konsekvent i Task 3 og 4;
  `ApdCatalogEntry`-feltene i `search-catalog.ts` (Task 4) matcher
  nøyaktig nøklene `normalize_entry` (Task 1) produserer minus drift-felt
  (`reachable`/`checked_at`/`license`/`inLanguage`/`creator`/
  `distributionUrl`/`access_level` trengs ikke av søkefilteret/CatalogHit
  og er bevisst utelatt fra det TS-interfacet — ikke et avvik).
