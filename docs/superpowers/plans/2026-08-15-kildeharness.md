# Kildeharnessen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frittstående utprøvings- og forbedringsharness i `tools/harness/`: spørsmålssett, kildeutforsker som lager kildedokument-utkast fra ekte API-kjøringer, og dokumentert eval-prosedyre.

**Architecture:** Alt bor i `tools/harness/` (+ rapporter i `docs/eval/` senere). Ingen endringer i appen, prompts eller data/sources. Kildeutforskeren bruker openstat.py direkte i CPython (feilkropper virker per 26d1692). Ingen tester i repoets testkataloger — slettbarhets-kontrakten (`rm -rf tools/harness` etterlater appen urørt) betyr at harnessen validerer sine egne inputs ved kjøring.

**Tech Stack:** Python 3 (stdlib + pandas via openstat.py), JSON, Markdown. Ingen nye avhengigheter.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-15-kildeharness-design.md` — les den først.
- ALDRI Claude-API-kall i noen task (kildeutforskeren er gratis-laget; flyt-eval-runden bestilles separat av kontrolleren senere).
- Ingen filer utenfor `tools/harness/` (unntak: ingen i denne planen).
- Ingen endringer i eksisterende filer.
- Repoets suiter skal være UENDRET grønne: `node --test 'tests/js/*.test.js'` (med anførselstegn), `python3 -m pytest tests/test_openstat.py -q` — kjøres som regresjonssjekk i hver task, ikke fordi tasken rører dem.
- Norske kommentarer/tekster; utkast-formatet følger todelingen Kort/Guide fra kort/lang-arkitekturen.
- Live API-kall mot statistikk-kildene er LOV og forventet (gratis) — vær høflig: maks ~15 kall per kilde per kjøring, ingen løkker uten tak.
- Commit-meldinger: norsk, imperativ, med Co-Authored-By: Claude Fable 5 <noreply@anthropic.com> og Claude-Session: https://claude.ai/code/session_012djYDZPEB3YPGkECwgnmLi

---

### Task 1: Spørsmålssettet

**Files:**
- Create: `tools/harness/sporsmal.json`

**Interfaces:**
- Produces: JSON-fila kildeutforskeren (Task 2) leser `tema`-feltene fra, og eval-prosedyren (Task 3) refererer.

- [ ] **Step 1: Skriv fila**

`tools/harness/sporsmal.json` (hele fila — juster INGEN verdier):

```json
{
  "kommentar": "Kildeharnessens spørsmålssett (spec 2026-08-15-kildeharness §3). Gjenbruker docs/eval/ask-evalsett.md-kjernen + ukens målte eksempler + tre nye mønstre. fasit.sjekker er MEKANISKE der det går: tall_i_intervall sjekkes mot svarets tall, kilde_i_spor mot prosesslinjene, aldri_raa_host mot hele sporet.",
  "budsjett": { "ramme_totalt": 30, "brukt": 0, "maks_per_runde": 8, "maks_runder_per_okt": 2 },
  "sporsmal": [
    { "id": "oslo-folketall", "sporsmal": "Hvordan har folketallet i Oslo utviklet seg siste ti år?",
      "rute": "data", "kilder": ["ssb"], "tema": ["folkemengde", "befolkning", "kommune"],
      "fasit": { "tall_i_intervall": { "verdi": "siste folketall Oslo", "min": 650000, "maks": 800000 },
                 "kilde_i_spor": "ssb", "aldri_raa_host": ["data.ssb.no"], "figur": true } },
    { "id": "norden-ledighet", "sporsmal": "Hvilke nordiske land har høyest arbeidsledighet nå?",
      "rute": "data", "kilder": ["eurostat", "dbnomics"], "tema": ["unemployment", "arbeidsledighet", "harmonized"],
      "fasit": { "kilde_i_spor": "eurostat|dbnomics", "aldri_raa_host": ["ec.europa.eu"],
                 "minst_land": 4, "samme_periode": true } },
    { "id": "inflasjon-no-euro", "sporsmal": "Hvordan har inflasjonen i Norge vært sammenlignet med eurosonen de siste to årene?",
      "rute": "data", "kilder": ["ssb", "eurostat"], "tema": ["konsumprisindeks", "KPI", "HICP", "inflasjon"],
      "fasit": { "kilde_i_spor": "ssb.*eurostat|eurostat.*ssb", "aldri_raa_host": ["data.ssb.no", "ec.europa.eu"],
                 "merknad": "SSB 14706 (Tolvmanedersendring), IKKE 14710 (indeksnivå) — målt felle inflasjons-runden 2026-08-15" } },
    { "id": "helse-bnp", "sporsmal": "Hvor stor andel av BNP bruker Norge på helse, sammenlignet med nabolandene?",
      "rute": "data", "kilder": ["oecd", "worldbank"], "tema": ["health expenditure", "helseutgifter", "SHA"],
      "fasit": { "tall_i_intervall": { "verdi": "Norge helse %BNP", "min": 7, "maks": 13 },
                 "kilde_i_spor": "oecd|worldbank" } },
    { "id": "lykke-no-de", "sporsmal": "Er folk lykkeligere i Norge enn i Tyskland?",
      "rute": "data", "kilder": ["ess"], "tema": ["happiness", "lykke", "well-being", "survey"],
      "fasit": { "kilde_i_spor": "ess", "vekter_i_spor": "anweight|dweight",
                 "merknad": "e01 mangler anweight → dweight×pweight-fallback (målt 2026-08-06)" } },
    { "id": "nb-styringsrente", "sporsmal": "Hvordan har Norges Banks styringsrente utviklet seg siste fem år?",
      "rute": "data", "kilder": ["norgesbank"], "tema": ["styringsrente", "policy rate", "IR"],
      "fasit": { "kilde_i_spor": "norgesbank", "aldri_raa_host": ["data.norges-bank.no"], "nytt_monster": "sdmx enkeltkilde" } },
    { "id": "imf-weo-norge", "sporsmal": "Hvordan har IMFs vekstanslag for Norge endret seg i de siste WEO-rundene?",
      "rute": "data", "kilder": ["dbnomics"], "tema": ["WEO", "NGDP_RPCH", "forecast"],
      "fasit": { "kilde_i_spor": "dbnomics", "nytt_monster": "dbnomics serie-maske" } },
    { "id": "fhi-vaksinasjon", "sporsmal": "Hvor høy er barnevaksinasjonsdekningen i Norge, og varierer den mellom fylker?",
      "rute": "data", "kilder": ["fhi"], "tema": ["vaksinasjon", "barnevaksinasjon", "dekning"],
      "fasit": { "kilde_i_spor": "fhi", "nytt_monster": "fhi norsk helsestatistikk" } }
  ]
}
```

- [ ] **Step 2: Valider JSON**

Run: `python3 -c "import json; d=json.load(open('tools/harness/sporsmal.json')); print(len(d['sporsmal']), 'sporsmal ok')"`
Expected: `8 sporsmal ok`

- [ ] **Step 3: Regresjonssjekk + commit**

Run: `python3 -m pytest tests/test_openstat.py -q` → grønt (uendret).

```bash
git add tools/harness/sporsmal.json
git commit -m "harness: spørsmålssettet (spec §3) — 8 spørsmål m/mekaniske fasit-sjekker"
```

---

### Task 2: Kildeutforskeren

**Files:**
- Create: `tools/harness/utforsk.py`

**Interfaces:**
- Consumes: `data/data-sources.json` (registeret: id, base_url, kind, tilgang, sok_endepunkt, cors), `openstat.py` (`ost.connect(base_url, kind=...)`, `_translate_canonical`-vokabularet via `.read()`-kwargs), `tools/harness/sporsmal.json` (`tema`-ordene per kilde).
- Produces: `tools/harness/utkast/<kilde>.md` per utforsket kilde; CLI: `python3 tools/harness/utforsk.py ssb eurostat norgesbank`.

- [ ] **Step 1: Skriv utforsk.py**

Krav (implementér med reell kode, ingen placeholder — fila blir ~200–300 linjer):

1. **Oppstart:** `sys.path.insert` til repo-rot; les registeret og sporsmal.json; CLI-argumenter = kilde-id-er; ukjent id → listet gyldige og exit 1.
2. **Søkefasen** (kun kilder med `sok_endepunkt`): for hver av kildens tema-fraser (fra sporsmal.json-spørsmål der kilden står i `kilder`, maks 5 fraser): kall endepunktet (urllib, {q}-substitusjon, 10 s timeout), noter antall treff + topp-3 (id + tittel). Feil noteres som funn («søk feilet: <feilkropp>»), aldri crash.
3. **Metadatafasen:** velg 2–3 tabell-id-er fra søketreffene (eller fra en innebygd fallback-liste per kilde: ssb → 07459/14706, eurostat → ei_lmhr_m/prc_hicp_manr, norgesbank → EXR/IR). For pxweb: hent `<base>/<id>/metadata?lang=no`, trekk ut dimensjonene (navn, antall koder, 5 eksempel-koder m/etiketter, elimination-status). For sdmx/eurostat: hent det som er praktisk mulig via kjente endepunktsformer — der metadata ikke lar seg hente enkelt, noter det ærlig i utkastet i stedet for å gjette.
4. **Hentefasen:** kjør de spørringsmønstrene som gjelder kilden via `ost.connect(...).read(...)`: enkeltvalg (én region/ett land), flervalg (liste), aggregat-via-utelatelse (pxweb), tidsvindu (`years=`). Hver kjøring: noter EKSAKT read-linje, radtall, kolonnenavn — eller feilen (kroppen er med nå) og hva som evt. reparerte den (prøv maks én reparasjon per mønster, f.eks. bytt kode fra metadataen).
5. **Utkast-generering:** skriv `tools/harness/utkast/<kilde>.md`:

```markdown
# UTKAST: <kilde> (generert av tools/harness/utforsk.py <dato>)
> Råmateriale for data/sources/<kilde>.md — Hans/senere runde fletter.
> Alt under er KJØRT og verifisert <dato>, ingenting antatt.

## Kort (innholdslaget — det man velger kilde på)
<temaer/variabler/nivåer/tidsspenn destillert fra metadata + søk>

## Guide (hentelaget — eksempel først)
<de verifiserte read-linjene m/én linje kontekst + radtall>

## Kjente feller (målt i denne utforskningen)
<feil + reparasjon, med feilkroppene>

## Søkenotater
<fraser som virket/feilet, treffkvalitet>
```

6. **Høflighet:** global teller, maks 15 HTTP-kall per kilde; `time.sleep(0.5)` mellom kall.
7. **Dato:** `datetime.date.today().isoformat()` (CPython — ingen pyodide-begrensning her).

- [ ] **Step 2: Kjør mot én kilde og iterér**

Run: `python3 tools/harness/utforsk.py ssb`
Expected: `tools/harness/utkast/ssb.md` med ekte innhold (verifiserte read-linjer med radtall). Les utkastet kritisk — er Kort-delen faktisk innholdsbeskrivende og Guide-delen faktisk kjørbar? Iterér til ja.

- [ ] **Step 3: Regresjonssjekk + commit**

Run: `python3 -m pytest tests/test_openstat.py -q` og `node --test 'tests/js/*.test.js'` → uendret grønne.

```bash
git add tools/harness/utforsk.py
git commit -m "harness: kildeutforskeren (spec §1) — søk/metadata/verifiserte lesinger → utkast"
```

---

### Task 3: Eval-prosedyren

**Files:**
- Create: `tools/harness/evalrun.md`

**Interfaces:**
- Consumes: `tools/harness/sporsmal.json` (spørsmål + budsjettregler), `docs/eval/2026-08-baseline.md` (rapportformatet), `docs/eval/ask-evalsett.md` (suksesskriterie-stilen).
- Produces: dokumentert, kjørbar prosedyre for kontrolleren; rapporter havner i `docs/eval/<dato>-harness.md`.

- [ ] **Step 1: Skriv evalrun.md**

Innhold (fullstendig prosedyre, ingen TBD):

1. **Forutsetninger:** ANTHROPIC_API_KEY i .env (BYOK); `netlify dev` fra repo-rot; de MÅLTE fellene ordrett: netlify dev cacher edge-TS-moduler → restart + 400-smoke (`curl -s -o /dev/null -w "%{http_code}" localhost:8888/api/svar` forventer 400/405, aldri 500) før eval; Chrome HTTP-cacher js/ → hard reload m/ignoreCache; Hans' Firefox blokkerer localhost-cross-origin (bruk Chromium).
2. **Kjøring per spørsmål:** åpne appen (Playwright/Chromium eller manuelt), lim spørsmålet i ask-feltet, send, vent på ferdig svar-kort (maks 5 min); høst: prosesslinjene (hele ⏳/📝/⚠️-sporet), svar-kortet, tid, tur-tall.
3. **Scoring mot fasit:** per sjekk-type i sporsmal.json: `tall_i_intervall` (tallet finnes i svaret og ligger i [min,maks]), `kilde_i_spor` (regex mot sporet), `aldri_raa_host` (hosten forekommer ALDRI i en Sjekker/Kjører-linje utenom adaptervei), `figur`, `minst_land`, `vekter_i_spor`. Utfall: PASS / PASS m/slitasje / ÆRLIG FEIL / FEIL (baseline-vokabularet).
4. **Rapport:** `docs/eval/<dato>-harness.md` i baseline-tabellformatet + kolonnene ⚠️-linjer og rå-URL-forsøk + «Hovedfunn» + budsjett-linja («kjøring N av rammen på 30» — oppdater også `brukt`-telleren i sporsmal.json i samme commit).
5. **Budsjettreglene** fra spec §2 ordrett: aldri uten eksplisitt bestilling; maks 8 per runde; maks 2 runder per økt; spør Hans før ramma overskrides.
6. **Syntesefasen** (spec §4): destiller funn → utkast-oppdateringer i tools/harness/utkast/, logikkforslag i rapporten, kodesaker via issue-kanalen. Aldri auto-apply.

- [ ] **Step 2: Selvsjekk + commit**

Les prosedyren som om du skulle kjøre den kald: er hvert steg utførbart uten annen kontekst? Fiks hullene.

```bash
git add tools/harness/evalrun.md
git commit -m "harness: eval-prosedyren (spec §2+§4) — kjøring, scoring, rapport, budsjettregler"
```

---

### Task 4: Kjør kildeutforskeren mot tre kilder

**Files:**
- Create: `tools/harness/utkast/ssb.md`, `tools/harness/utkast/eurostat.md`, `tools/harness/utkast/norgesbank.md` (generert + kvalitetssikret)

**Interfaces:**
- Consumes: `tools/harness/utforsk.py` (Task 2).
- Produces: tre utkast-filer som består spec §Verifisering-kravet.

- [ ] **Step 1: Kjør**

Run: `python3 tools/harness/utforsk.py ssb eurostat norgesbank`
Expected: tre utkast-filer.

- [ ] **Step 2: Kvalitetssikring**

Les hver fil mot spec §1-kravene: Kort-delen innholdsbeskrivende (ikke API-prosa), Guide-delen kun KJØRTE linjer m/radtall, feller m/faktiske feilkropper, ingenting antatt. Sammenlign ssb-utkastet mot data/sources/ssb.md — noter i utkastets topp hva utforskeren fant som guiden IKKE har (og motsatt). Mangler noe → forbedre utforsk.py og kjør på nytt (commit skriptendringen separat med begrunnelse).

- [ ] **Step 3: Slettbarhets-verifisering + commit**

Run: `git stash -u && git status --short` → tom (appen urørt uten harness-filene); `git stash pop`.

```bash
git add tools/harness/utkast/
git commit -m "harness: utkast for ssb/eurostat/norgesbank fra live utforskning (spec §Verifisering)"
```
