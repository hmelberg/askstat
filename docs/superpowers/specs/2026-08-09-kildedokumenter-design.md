# Design: Kildedokumenter — ett format for alle kilder, redigering, probe og forbedringssløyfe

Dato: 2026-08-09. Status: godkjent av Hans (hele diskusjonsrunden 2026-08-09).
Overordnet designspec med faseplan (v1–v4) — hver fase får sin egen
implementasjonsplan før koding.

## Mål

Gjøre de innebygde kildene (oecd, dbnomics, ssb, …) valgbare og redigerbare på
linje med brukerens egne kilder, med ett felles markdown-dokumentformat for
alle kilder. Dokumentene skal kunne være alt fra «navn + én URL» til fulle
OECD-klasse-guider, kunne bære variabellister, kunne binde seg til appens
adaptere, og forbedres over tid — av brukeren (redigering), av maskinen
(probe-knapp og feilsløyfe, alltid med review) og av admin (PR til repoet).
Ingen bakoverkompatibilitet (ingen brukere å migrere).

## 1. Grunnmodell

**Alt er kildedokumenter.** Én kilde = (valgfri) adapterbinding + gradert
beskrivelse + (valgfri) kodebok, som markdown. To nivåer med synlig opphav:

| | GitHub-nivået (standard + community) | Brukernivået (egne + overlegg + importerte) |
|---|---|---|
| Bor | Repoet, statisk servert (som i dag) | localStorage `md_profiles` (rå markdown-tekst) |
| Oppdateres via | Deploy/PR (git = historikk + review) | Redigering, forslags-kort, probe |
| Prompt-plassering | Kompakt linje i cachet prefiks + lat guide | Per-spørring pakkeblokk |
| Synk | Alltid ferskt for alle | Anvil-kontosynk (innloggede); eksport/import for alle |

Kildevalg skjer på nøyaktig tre måter: **velgeren** (varig av/på — gjelder
også standardkilder, dagens `doc.sources_off`/`filtrerAvslatte` uendret),
**`#`/`@` i spørreteksten** (per spørsmål, §7), **land/tags** (implisitt,
dagens mekanikk). Ingen fjerde mekanisme.

## 2. Dokumentformatet

### Front matter + raus parser

Kanonisk form er front matter (`---` … `---` øverst). Parseren er raus etter
Postel-prinsippet og aksepterer tre former, normalisert til front matter ved
lagring:

1. front matter (kanonisk)
2. fenced ```yaml-blokk (dagens src-pakke-form)
3. nakne `key: value`-linjer øverst, frem til første blanklinje/overskrift

Engangsskript konverterer de eksisterende filene (85 src-pakker i
`data/packs/community/`, 16 guider i `data/source-guides/`, 30 oppføringer i
`data/data-sources.json`) til det nye formatet. `data-sources.json` erstattes
som kilde: registerdata genereres fra dokumentenes front matter ved bygg
(eller leses direkte — avgjøres i v1-planen). `parseRegistry`-valideringen i
`netlify/edge-functions/_lib/registry.ts` beholdes som kontrakt.

### Maskinfelter (minimalt sett)

`id, name, adapter, base_url, auth, cors, trust, tags, country, data_url,
docs_url, variables_url, format`

- **Låst for standardkilder** (adapterkontrakt + nøkkelvakt): id, adapter,
  base_url, auth, cors. Vises nedtonet i editor; serveren leser alltid sin
  egen fasit (§6).
- Dagens felter `sporrings_url_mal`, `join_nokler`, `oppskrift`,
  `sok_endepunkt`-detaljer nedgraderes til prosa i seksjonene (leses uansett
  kun av modellen). `beskrivelse`-feltet utgår — UI rendrer «Om kilden».

### Seksjoner med definert flyt

| Seksjon | Flyter til | Merknad |
|---|---|---|
| **Kort** | Registerlinja — alltid i prompten | Hold stram; koster tokens per svar |
| **Guide** | Lat — første `search_catalog`/`table_metadata`-svar (dagens `source-guides.ts`-mekanikk, tak 8 000 tegn) | Én notat/quirks-seksjon — «Quirks» og «Egne notater» slås sammen her |
| **Variabler** | Lat (med guiden) + kildevelger-søket | Inline hvis ≤ ~30 variabler og stabil kilde; ellers `variables_url`; aldri for SSB-skala |
| **Om kilden** | Kun UI (detaljpanelet) | Aldri i prompten |

**Alt er valgfritt unntatt navn + én URL** (nivå 0–3: fra «navn + data_url,
appen prober» til full guide + adapterbinding). Manglende info erstattes av
eksisterende probe-disiplin i prompten. Fabrikasjonsvernet utvides eksplisitt:
en variabelliste er kodebok, aldri dataverdier (samme regel som wbmicro-
quirken i dag).

### Eksempler (ytterpunktene; OECD-klassen = dagens registeroppføring + guide slått sammen)

Minimal funnet kilde med kodebok:

```markdown
---
name: Oslo halvmaraton-resultater
data_url: https://raw.githubusercontent.com/…/oslo_half.csv
format: csv
trust: funnet
tags: [norge, løping]
---
Én rad per fullført løper, 2015–2024. Ikke verifisert — prob før bruk.

## Variabler
| navn | forklaring |
|---|---|
| year | løpsår |
| finish_sec | sluttid i sekunder |
```

Ny vert på eksisterende adapter (v2-funksjon, §5 i faseplanen):

```markdown
---
id: unicef
name: UNICEF Data Warehouse
adapter: sdmx
base_url: https://sdmx.data.unicef.org/ws/public/sdmxapi/rest/
trust: offisiell
tags: [makro]
---
Barnehelse og levekår per land. Dialekt ikke målt — adapteren prøver
Accept-variantene selv og sier ærlig fra hvis strukturspørringer feiler.
```

## 3. Prompt-integrasjon

Token-økonomien beholdes som i dag — det er et hardt krav:

- **Uredigerte standardkilder:** rendres som nå — kompakt linje fra
  Kort-seksjonen via `renderRegistryBlock` (cachet prefiks) + lat guide via
  `makeGuideAttacher`. Målet er byte-likt med dagens prompt for uendret
  tilstand.
- **Brukerkilder og overlegg:** sendes per spørring i pakkeblokka
  (`coercePacks`/`renderPacksBlock` i `svar-prompt.ts`, budsjettene uendret).
  Overlegg får en overstyrings-instruks i blokka: «dokumentet under overstyrer
  registeroppføringen med samme id». Registerlinja i prefikset står urørt
  (cache-vennlig); instruksen vinner.
- Aldri alle fulle dokumenter i prompten — Kort/Guide-todelingen er selve
  budsjettmekanismen.

## 4. Redigering og identitet

- **Rediger standardkilde** → overlegg med *samme id*, badge
  «standard · redigert av deg». Tilbakestill = slett overlegget → GitHub-fila
  gjelder (ingen snapshot-lagring). Overlegget lagrer hash av standardteksten
  det ble laget fra → «standarden er endret siden din redigering»-hint med
  diff og valget ta-inn-nytt / behold-mitt.
- **«Dupliser som egen kilde»** → ny id (forslag: `<id>-kopi`), helt på
  brukernivå. Ærlig UI: ingen site-nøkkelinjeksjon; adapter må deklareres selv
  (og virker først fra v2). For `auth.env`-kilder (fred-klassen) sier knappen
  eksplisitt at kopien ikke får nøkkelen.
- **Én dokumenttype:** id-match mot standard avgjør overlegg vs. selvstendig
  kilde. Kollisjonsvakt ved opprettelse/import: «dette vil overstyre
  standardkilden oecd — er det meningen, eller vil du gi den nytt navn?»
- **Sidevogn per kilde-id** (lokal metadata, ikke synket i v1): probe-stempler
  (§9) og brukerens egne tags på standardkilder — uten å utløse overlegg.
  «Redigert?» forblir et rent ja/nei.

## 5. Lagring, synk og portabilitet

- Egne kilder/overlegg gjenbruker `kind:'source'`-oppføringene i
  `js/profiles.js` (`SOURCE_TEXT_MAX` 40 000 tegn, tombstones, kontosynk med
  nyeste-`updated`-vinner — alt uendret). **Lagret form er rå markdown-tekst**,
  parses ved bruk: lagret form = eksportform = PR-form.
- **Eksport/import av .md-filer** (enkeltvis/zip) — flyttebro og delingsformat
  for anonyme brukere. **«Importer kilde fra URL»** (rå .md-lenke, inkl.
  gists) gjenbruker åpne-fra-URL-mønsteret i `js/github-storage.js`; importert
  kilde merkes med opphavs-URL og kan senere tilby «hent ny versjon» (samme
  hint-mekanikk som mot standardnivået).
- Ingen diskmappe (File System Access API er Chrome-only + friksjon), ingen
  innloggingskrav (anonyme BYOK-brukere er førsteklasses), ingen
  bruker-GitHub-synk for kilder (to synk-kanaler = konfliktkilde; `github-
  storage.js`-scriptflyten berøres ikke).
- Kjent begrensning dokumenteres: Safari kan tømme localStorage etter ~7 dager
  uten besøk — eksport-knappen synlig, innloggings-hint vennlig. Fluktvei ved
  kvotepress er IndexedDB, ikke filer.

## 6. Sikkerhetslinjer (ikke forhandlingsbare)

1. Serveren leser alltid sitt eget register for auth/host/adapter-dispatch
   (`sourceForUrl`-vakten i `registry.ts` ser aldri brukerdokumenter) —
   brukerredigering påvirker kun prompttekst, aldri nøkkelinjeksjonens mål.
2. Brukerkilder får aldri site-nøkler; egne nøkler går via `KEYS`-dicten
   (innstillinger-runden 2026-08-08 §9), uendret.
3. Maskingenererte forslag (§9): seksjonshvitliste (aldri maskinfelter),
   linjenivå legg-til/erstatt, størrelsestak, datert — og **alltid review før
   bruk, aldri auto-apply**. Trusselen er lagret prompt-injeksjon: feiltekster
   og probe-funn er eksternt innhold som ellers kunne persistere instruksjoner
   inn i alle fremtidige prompts.
4. Import vises og godkjennes før aktivering — et importert dokument former
   aldri prompter stille.
5. Alt eksternt innhold (feilkropper, probe-funn, docs_url-tekst) gjennom
   scrub-vernet; serverhenting mot deklarerte URL-er gjennom `ssrf.ts`-vernet
   i `/api/hent`-laget.

## 7. Notasjon: `#` og `@` i spørreteksten

- **`#x`** (additiv, klient-tolket): alle katalogkilder med *nøyaktig* taggen
  x ∪ kilden med nøyaktig navnet/id-en x — **begge ved kollisjon**
  (additivitet gjør over-inkludering billig). Katalogen = alt som har et
  dokument (standard + medfølgende pakker + egne + importerte), **uavhengig av
  på/av** — å nå avslåtte kilder per spørsmål er selve poenget. Klienten
  sender eksplisitte felt (`sources_on` + ekstra pakke-payload), validert
  serverside med samme regex/tak-mønster som `coerceSourcesOff`; serveren
  parser aldri spørreteksten for styring.
- **`@profil`**: legger profilens tekst til for dette spørsmålet (additiv;
  varig bytte = aktiv profil som før).
- **Autocomplete + chips:** `#`/`@` i spørrefeltet åpner nedtrekk over
  katalogen (fuzzy i *pickeren*, eksakt i payload); gjenkjente tokens vises
  som chips brukeren kan avvise (dekker også lim-inn-injeksjon). Ukjent token
  forblir ren tekst med diskret hint.
- **Aliaser kun for reservert kjernevokabular** (micro→mikro, macro→makro,
  norway→norge — taggene med rutingsemantikk i prompten). Alle andre tags er
  frie, uoversatte, og konvergerer via foreslå-eksisterende-først.
- **Ingen** `##`, `and`/`or`, negasjon eller `kun:`. Eksklusjon dekkes av
  prosa («ikke bruk SSB» — modellen leser spørsmålet) og av-bryteren.
  Grammatikk-utvidelser (f.eks. `#x+y`-snitt) kun ved målt behov.

## 8. Menysystemet

Bygger videre på kilde-dialogen fra 2026-08-08-spec §2 (faner Tema |
Enkeltkilder med antall, søk, tag-chips, land-dropdown beholdes). Endringer:

- **Én radtype:** på/av-bryter, navn, opphavs-badge (standard /
  standard·redigert / din / importert), **ferskhetsprikk** fra probe-stempel
  (grønn = nylig testet OK, grå = aldri, rød = siste test feilet).
- **Master–detalj:** klikk på rad → detaljpanel som rendrer *dokumentet*
  (front matter som egenskapstabell, låste felter nedtonet) med handlingene
  Rediger / Test / Dupliser / Eksporter / Tilbakestill. Erstatter dagens
  infopanel. «Rediger» virker nå på ALT (sources-modal.js-begrensningen «kun
  egne kilder» oppheves — på standardkilder betyr den overlegg, §4). Mobil:
  panelet som fullskjerm.
- **Filtrering:** chips = ren union (ingen [noen|alle]-toggle, ingen
  fasetter); **søkefeltet AND-er termene** over navn + tags + beskrivelse —
  «norge mikro» gir snittet gratis. Lang tag-hale i «flere tags ▾»-dropdown
  med søk og avkryssing; antall-badge per chip.
- **Ny kilde-modalen:** placeholder-tekst som viser minimum først («Alt er
  valgfritt unntatt navn og én URL …»), `?`-hjelpeknapp → modal generert fra
  formatspesifikasjonen (én fasit, drift-lintet — hjelpesider-lærdommen),
  «Sett inn mal» (statisk skjelett, «slett det du ikke trenger»), «Test og
  fyll ut automatisk» (probe, aktiveres i v3).
- **«Hva ser modellen?»-knapp:** viser de faktisk rendrede promptblokkene for
  gjeldende valg (renderfunksjonene finnes — nesten gratis, og gjør
  redigeringens effekt synlig).
- **Kildelinje under hvert ferdig svar:** «Kilder brukt: ssb · oecd»,
  klikkbar → dokumentet. Naturlig hjem for forslags-kortene (§9).
- Forslags-innboks med teller (⚑) i modal-toppen.

## 9. Forbedringssløyfa — tre destinasjoner, stigende varighet

| Kanal | Hvem | Mekanisme |
|---|---|---|
| Økten | Alle, automatisk | Modellen retter seg selv i svar-løkka (finnes i dag) |
| Overlegget | Brukeren, én-klikk | Forslags-kort med diff [Ta imot / Rediger / Avvis] |
| Repoet | Admin | «Send som PR» → server-endepunkt, CI-probe, manuell merge |

- **Feillogg fra alle finnes allerede** (`js/feil-telemetri.js` →
  `mdataapi.anvil.app/_/api/feil`, kun feil, nøkkelmaskert): utvides med
  `source_id`-tagging når feilen skjer mot kjent kilde → varmekart for admin.
  Respekterer telemetri-valget (§10).
- **Probe-knappen** (per kilde + i ny kilde-flyten): (1) *mekanisk lag* uten
  KI — HTTP-status/CORS/content-type, CSV-header-sniff, adapter-rundtur i
  miniatyr (søk → metadata → bitteliten read), variabel-diff mot deklarert
  liste, målt fra både nettleser og server (fanger IHSN-klassen); (2)
  *tolkende lag* — ett KI-kall som gjør rapport + dokument om til
  diff-forslag i forslags-kortet. Skånsom: få kall, småuttrekk, kvoterespekt,
  nøkkelkilder kun med nøkkel til stede. Vellykket probe → stempel i
  sidevognen («sist testet <dato> ✅»).
- **Feilsløyfa:** klientverktøy `propose_source_update(source_id, patch)` i
  svar-løkka (samme mønster som `get_pack`). Utløsere i fallende styrke:
  feil→omvei funnet i samme økt (sterkest — differansen ER quirken),
  berikelse av tynne kilder etter vellykket probe/lasting, kodefeil mot
  skjema (Variabler-fiks), endelig fiasko (kun forsiktig varsel-linje).
  Forslag foretrekker å *erstatte* utdaterte linjer fremfor å legge til
  (mot notat-oppblåsing).
- **PR-kanalen (kun admin i v1):** Netlify-funksjon med fingranulert
  GitHub-token (kun PR-rett) tar validert forslag {kilde-id, patch, evidens}
  → branch + commit + PR. Evidens i PR-kroppen (hva feilet, hva virket,
  dato). **GitHub Action kjører mekanisk probe mot endret kilde og
  kommenterer ✅/❌ på PR-en.** «Send som PR»-knapp bak adminGate på admins
  egne forslags-kort og redigeringer. Aldri auto-PR fra brukere. Senere ved
  behov: delt forslags-kø (samme dumme Anvil-mønster som feilloggen) med
  eksplisitt «Del forslaget»-samtykke + patch-hash-dedup med teller; admin
  forfremmer fra kø til PR.

## 10. Telemetri-valg i innstillinger (NY)

Brukeren skal kunne nekte telemetri:

- **UI:** ny avkryssing nederst i `#aiSettingsBackdrop` (index.html:526,
  etter Egne nøkler-seksjonen): «Send anonyme feilrapporter (hjelper oss å
  forbedre kildene)» — **default på** (dagens oppførsel), avkryssbar.
  Hjelpetekst: kun feil sendes, aldri spørsmål eller data; nøkler maskeres.
- **Lagring:** localStorage `md_telemetri_av` (`'1'` = nektet), device-lokal
  som `md_ask_discover` — synkes ikke (personvernvalg bør tas per enhet).
- **Håndheving i chokepointet, ikke kallstedene:** vakt først i
  `FeilTelemetri.sendFeilrapport()` (js/feil-telemetri.js) — returnerer
  stille når `md_telemetri_av === '1'`. Da arver alle nåværende
  (ask-view.js:992–994) og fremtidige kallsteder valget automatisk.
- **Gjelder også fremtidige kanaler:** source_id-taggingen (§9) og en
  eventuell delt forslags-kø sjekker samme flagg. Probe-knappen og «Send som
  PR» berøres ikke (eksplisitte brukerhandlinger, ikke telemetri).
- **i18n:** nye nøkler i alle 13 språkfiler + `tools/ask_i18n_keys.json`
  (husk: `lang='no'` faller aldri tilbake til en).
- **Personvernsidene** (`personvern.html`/`.en.html`) oppdateres med
  telemetribeskrivelsen og hvordan man skrur den av.

## Faseplan

- **v1:** dokumentformat + raus parser + konverteringsskript; overlegg/
  redigering med GitHub-tilbakestilling og hash-hint; Variabler-seksjonen;
  `#`/`@` med autocomplete/chips + `sources_on`-serverside; ny kilde-modalen
  (placeholder/hjelp/mal); eksport/import + importer-fra-URL; «Hva ser
  modellen?»; kildelinje under svar; **telemetri-valget (§10)**.
- **v2:** adapterbinding for nye verter — dialekt-prøvekjede i SDMX/PxWeb-
  adapterne (dagens `SDMX_STRUCTURE_ACCEPT`-per-id → prøv-og-fall-tilbake),
  klientside kilde-token-registrering for `<id>.read(...)`.
- **v3:** probe-knappen (mekanisk + tolkende lag) + forslags-kortet +
  «Test og fyll ut automatisk» + sidevogn/ferskhetsprikk + CI-probe-action.
- **v4:** feilsløyfa (`propose_source_update`) + PR-endepunktet (admin) +
  `source_id` i feilloggen.
- **Kun ved målt behov:** delt forslags-kø, tri-state-chips, `#x+y`-snitt,
  bruker-GitHub-lagring for kilder, planlagt probing.

## Åpne valg (avgjøres i v1-planleggingen)

Eksakte seksjonsnavn (norsk vs. engelsk i dokumentene), den reserverte
taglisten + aliastabellen, default-fane (Tema vs. Enkeltkilder), malteksten i
ny kilde-modalen, og om registerdata genereres fra dokumentene ved bygg eller
leses runtime.

## Bevisst utelatt

- Ingen migrering/bakoverkompat; de gamle formene (data-sources.json som
  fasit, fenced-yaml-pakker) erstattes, ikke vedlikeholdes.
- Adapterne beholdes og forblir kode — dokumentene beskriver dem, erstatter
  dem aldri (quirks-historikken viser hvorfor: stille feil som SDMX-200-med-
  ufiltrerte-data må fanges i kode).
- Ingen auto-apply av maskinforslag, ingen auto-PR fra brukere.
- Ingen boolsk spørresyntaks utover additiv `#`/`@`.
- Ingen openstat-synk i denne runden — kildedokument-systemet er
  askstat-først; port vurderes etter at mønsteret har satt seg.

## Verifisering (per fase; detaljeres i fase-planene)

- **v1:** konverteringsskriptet er idempotent og round-trips alle 131
  eksisterende filer (parse → normaliser → parse = identisk); prompt-diff
  mot dagens rendering for uendret tilstand er tom (byte-likhet som mål);
  overlegg-e2e (rediger ssb → «Hva ser modellen?» viser overstyring →
  tilbakestill → identisk med GitHub); `#`-oppløsning enhetstestes (tag ∪
  navn, kollisjonsregel, ukjent token, alias); telemetri-valget: skru av →
  fremprovoser feil → verifiser at ingen POST går til `/_/api/feil` (nettverks-
  fanen), skru på → rapport sendes; i18n-nøkkelsjekk + packs-drift-lint.
- **v2:** ny SDMX-vert (UNICEF) e2e: søk → metadata → read; dialekt-fallback
  testes mot ECB (XML-only) og OECD (versjonsstreng).
- **v3:** probe mot en frisk, en død og en CORS-stengt kilde; forslags-kort
  round-trip (ta imot → overlegg → tilbakestill); CI-proben på en test-PR.
- **v4:** feil→omvei-økt gir forslag med korrekt diff; PR-endepunktet lager
  PR med evidens; adminGate håndheves.
- Manuell smoke lokalt: dev-porter 8899/3998; NB Chrome-cacher `js/` og
  netlify dev cacher edge-moduler — hard reload + restart før evaluering.
