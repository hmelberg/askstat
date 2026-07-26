# `all()`-direktiv for pxweb-tabeller — design

**Dato:** 2026-07-26
**Status:** Ny liten funksjon. Bygger på pxweb-kilde-mekanikken (`js/data-directives.js` resolve, `js/pxweb.js`, `js/data-loader.js`) og det kanoniske vokabularet (`2026-07-25-api-kinds-design`). Ingen endring i eksisterende direktiver.

## Bakgrunn

En pxweb-tabell (SSB/SCB/StatFin) har flere dimensjoner. Velger man ikke verdier for en dimensjon, eliminerer SSB den automatisk (derfor endte `bef` med bare `ContentsCode/Tid/value`). Å laste «alt» krever i dag `filters(Dim=* …)` per dimensjon — tungvint. Hans vil ha en enkel «last alt når det er mulig»-vei, med en høy størrelsesgrense.

## §1 Direktivet

`all()` i en `# load`/`# read`-linje for en pxweb-kilde velger **alle verdier av hver dimensjon som ikke er eksplisitt spesifisert**.

- `# load ssb/05839 as bef, all()` → hele tabellen.
- Kombinerbart — eksplisitte selektorer overstyrer for sine dimensjoner:
  `# load ssb/05839 as bef, all(), years(2000:2009)` → alle aldre/kjønn, men bare 2000–2009.
- Semantikk: `all()` fyller `valueCodes[Dim]=*` for hver dimensjon som IKKE allerede har et valg fra `years()/regions()/indicators()/filters()/valueCodes[...]`.

## §2 Format

json-stat2 — uendret. Appens pxweb-lastespor tvinger allerede `outputFormat=json-stat2` (`js/pxweb.js`): UTF-8, bærer dimensjonsstrukturen, konverteres til tidy long-form. SSBs rå CSV er bred/pivotert + latin-1 og ville krevd av-pivotering — ikke brukt.

## §3 Mekanikk

Resolve er synkron og kan ikke hente metadata; all-ekspansjonen skjer i lasteren (async).

1. **Parser** (`js/data-directives.js`): `all()` → `canon().all = true` (regexen matcher `all()` med tom parentes).
2. **Resolve** (pxweb-grenen): når `c.all`, sett `out.all = true`. Behold de eksplisitte valueCodes den bygger fra years/regions/indicators/filters. Elementet bærer `all: true` + base-URL m/ ev. eksplisitte valueCodes + tabell-id.
3. **Laster** (`js/data-loader.js` pxweb-sti; ren ekspansjonshjelper i `js/pxweb.js` for testbarhet):
   a. Hent tabellens metadata (`PxWeb.metadataUrl` — /metadata-endepunktet gir dimensjons-id-ene + verditall; cachet der det er mulig).
   b. Les hvilke dimensjoner som ALLEREDE har `valueCodes[Dim]=` i base-URL-en (eksplisitt satt).
   c. **Cellevakt:** anslå celleantall = produkt over dimensjoner: `*`-fylte dims teller sitt fulle metadata-antall; eksplisitt satte dims med komma-liste teller listelengden; eksplisitte med uttrykk (`from()/top()/*`) som ikke lar seg telle billig → tell fullt (konservativt). Er anslaget > grensen → kast tydelig feil (§4). SSBs egen 800k-vakt er backstop for underestimater.
   d. Bygg data-URL: legg `valueCodes[Dim]=*` for hver dimensjon som IKKE alt er satt. Hent json-stat2 → tidy (uendret konvertering).

## §4 Størrelsesgrense (verifisert)

- **SSBs faktiske grense: 800 000 celler per spørring** (empirisk binærsøkt 2026-07-26: 797 100 → HTTP 200, 801 400 → HTTP 400 «Too many cells selected»).
- Vakten settes derfor til **`PXWEB_ALL_MAX_CELLS = 800000`** (navngitt konstant) — IKKE høyere, ellers avviser SSB med sin egen (styggere) feil før vår vennlige melding.
- Over grensen → feilmelding (aldri stille kutt): «`all()`: tabellen {id} har {N} celler (over grensen {M}) — begrens med filters()/years()/regions() for å laste et utvalg.» Norsk via `t()`, en.js-nøkkel.
- Konstanten er per-modul (kan senere gjøres per registerkilde hvis SCB/StatFin avviker; 800 000 er en trygg standard for alle nå).

## §5 Omfang / bevisst utenfor

- **Kun pxweb** (SSB/SCB/StatFin) i v1. Eurostat/sdmx har annen dimensjons-oppdaging (ikke samme /metadata-form) — egen senere utvidelse.
- `all()` på ikke-pxweb-kilde → tydelig feil («`all()` støttes foreløpig kun for pxweb-kilder»).
- Ingen UI-knapp i v1 (Hans valgte direktiv-stikkordet); en «last hele tabellen»-knapp i ⓘ-modalen kan komme senere og gjenbruke samme direktiv.

## §6 Testing

- **Enhetstester (node)**: parser (`all()` → `all:true`), resolve (pxweb `all:true`, bevarer eksplisitte valueCodes, feil på ikke-pxweb), og den rene ekspansjonshjelperen i `js/pxweb.js` (gitt en metadata-fixtur: fyller uspesifiserte dims med `*`, respekterer eksplisitte, celletelling, over/under grense). Aldri live HTTP i suiten.
- **Live smoke-test (kontrollør, ekte SSB)**: `# load ssb/05839 as bef, all()` → full tabell lastet (59 040 celler, ⊞ viser den); `all()` + `years()` → begrenset; en tabell over 800k (f.eks. 07459) → vennlig avvisning FØR SSB-400. I brython (der Hans tester).
- Full suite (node + deno + pytest) før commit. Lokale commits, INGEN push (norm).
