# Mini-knippet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire mini-oppfølginger: sort_values/kategoriorden, dtype-kwarg + 0301-vern, panel-typemeta via ost_url-attrs, dict-meta i convert_dtypes.

**Architecture:** Spec: docs/superpowers/specs/2026-07-28-mini-knippet-design.md — les den FØRST, den er kravdokumentet; denne planen gir filpunkter og rekkefølge, ikke ferdig kode (mini-pandas-interne API-er varierer — mål før du skriver, r-factor-lærdommen).

**Tech Stack:** brython/pandas_brython.py (Series.sort_values:1828, DataFrame.sort_values:3738, read_csv:4897, CategoricalDtype:272, _cats-mekanikken), micropython/pandas_mpy.py (2049/3975/5170/473 — tvilling: endres den ene, endres den andre), shared/ost_core.py, brython/brython_runner.py + micropython/micropython_runner.py (_dataset_info), index.html:8681 (refreshDatasetSidebarFromEngineInfo), brython/tests/ + micropython/tests/ (per-tvilling-mønsteret), examples/brython/bry09 + examples/micropython/12, hjelp.html/hjelp.en.html.

## Global Constraints

- ALDRI push; gren `mini-knippet` fra main; ALDRI git add under .superpowers/.
- Verdier endres ALDRI av typing/sortering — kun rekkefølge/dtype-metadata.
- Nye mini-pandas-features speiler EKTE pandas-semantikk — PARITETSTESTER mot ekte pandas i pytest der det er billig (CPython har begge).
- Ukjent/ustøttet input → HØYLYTT ValueError, aldri stille ignorering.
- Tvilling-disiplin: hver kjerneendring i BEGGE mini-pandas m/ speilede tester.
- Suiter ved hver task-slutt: `python3 -m pytest -q` (1448/0 ved start), `node --test "tests/js/"*.test.js` (1070/0). deno urørt.
- TDD: rød først, målt — mini-API-ene skal MÅLES (r-factor-lærdommen: df[col]= oppdaterer ikke _cats; code_of er typefølsom).

---

### Task 1: sort_values respekterer _cats (spec §1)

- [ ] Røde pytest-tester i brython/tests + micropython/tests: category-kolonne m/ kildeorden ulik alfabetisk → sort_values følger kategoriorden; PARITET: samme input gjennom ekte pandas gir samme rekkefølge; ascending=False; ikke-kategori-kolonner uendret oppførsel.
- [ ] Implementer i begge tvillinger (DataFrame.sort_values + Series.sort_values): kategoriindeks som sorteringsnøkkel når dtype-metadata finnes; verdi utenfor kategoriene → sist (na_position-semantikk).
- [ ] Oppgrader r-factor-låsetesten (brython/tests/test_ost_core.py::test_read_csv_time_kvartalskoder…): sort_values-asserten inn igjen (kommentaren om kø-begrensningen ut).
- [ ] Suiter grønne; commit `feat(mini-pandas): sort_values følger kategoriorden (paritet m/ ekte pandas) — begge tvillinger (mini-knippet §1)`.

### Task 2: dtype-kwarg + 0301-vern + dict-meta + dok (spec §2+§4)

- [ ] Røde tester: read_csv dtype-dict (0301 forblir "0301"), skalar str, ukjent verdi → ValueError (begge tvillinger); ost_core-vernet (dims → category m/ ledende nuller intakt; bruker-dtype vinner); dict-meta i convert_dtypes; URL-form uendret.
- [ ] Implementer: dtype= i begge read_csv (kolonnevis inferens-skip); ost_core.read_csv rekkefølgeflipp (typemeta før parse) + vern m/ bruker-vinner; convert_dtypes dict-grenen (lokal entries-konvertering, ingen PxWeb).
- [ ] Dok: ost_core-docstring (begrensning ut), bry09/mpy12-eksemplene (forvent category på Alder nå), hjelp.html + hjelp.en.html (parentes-forbeholdet ut).
- [ ] Suiter grønne; commit `feat(mini-ost): dtype-kwarg i mini-read_csv + 0301-vern ved parse; dict-meta i convert_dtypes (mini-knippet §2+§4)`.

### Task 3: panel-typemeta for mini-rammer (spec §3)

- [ ] Røde pytest-tester: ost_core setter attrs["ost_url"] (gjenkjent kilde, begge convert-verdier; ukjent kilde → ingen attr); runner-_dataset_info inkluderer ost_url (test-mønsteret i brython/tests for runneren).
- [ ] Implementer: attrs-settingen i ost_core; _dataset_info i BEGGE runnere; index.html:8681 fire-and-forget-berikelse (typemetaForUrl → ny updateSidebarDatasets; aldri blokkerende, warn ved feil — R-sveipens mønster, men uten å endre funksjonens sync-signatur).
- [ ] Suiter grønne; commit `feat(mini-panel): ost_url-attrs → typemeta-berikelse i sidepanelet for brython/mpy (mini-knippet §3)`.

---

## Kontrollørens sluttsteg

Slutt-review (fable, hele diffen — spesielt tvilling-pariteten og sort_values-semantikken mot ekte pandas), live-smoke i brython-modus (bry09: Alder → category; panelet viser etiketter/nivåliste) + mpy stikkprøve, merge+push+ledger.
