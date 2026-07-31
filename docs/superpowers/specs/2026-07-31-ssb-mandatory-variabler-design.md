# SSB PxWeb v2: obligatoriske variabler synlige og håndhevede

**Dato:** 2026-07-31 · **Status:** utkast til Hans' godkjenning
**Kilde-referanser:** github.com/janbrus/ssb-api-v2-examples (SSBs egne
API-eksempler; `pxwebapi-v2-generic-skill/references/` lastet ned og lest
2026-07-31) + mekanisk verifisering mot data.ssb.no samme dag.

## Rotårsak (reprodusert og verifisert 2026-07-31)

Oslo-eksempelspørsmålet brant hele run_code-budsjettet (7+ turer) og
degraderte til sekundærkilder. Kjeden som sviktet:

1. PxWeb v2 KREVER valg for alle dimensjoner med `elimination=false` —
   alltid `ContentsCode` og `Tid` (janbrus: «never eliminable»). Uten →
   `400 {"title":"Missing selection for mandantory variable"}` (sic).
   Verifisert: 11342 uten ContentsCode → 400; med
   `valueCodes[ContentsCode]=Folkemengde` → 200.
2. `table_metadata` STRIPPER mandatory-informasjonen
   (`table-metadata.ts:66-82` leser aldri `extension.elimination`) —
   modellen KAN ikke vite hva som er obligatorisk.
3. DELIVERY-eksemplet `ssb.read("05839", years=…)` uten `indicators=`
   lærer bort et mønster som bare virker på én-innholds-tabeller.
4. Region-trunkeringen (`MAX_VALUES=40` av 979 koder, ingen søkevei) →
   modellen fikk aldri bekreftet Oslo=0301 og brant turer på det.
5. Adapterfeilen når modellen som naken HTTP-status uten handlingshint →
   reparasjonsrundene gjetter i stedet for å fikse.

Kjent uforklart rest: modellens trace nevnte «404 for table reads» — ikke
reprodusert isolert (proxy-veien krever nøkkel); sekundært, jaktes ikke i
denne omgangen.

## Mål

Ett-skudds SSB-uttrekk for flerinnholds-tabeller: modellen ser hva som er
obligatorisk, finner riktige koder med ett kall, og får en reparérbar
feilmelding når den likevel bommer.

## Ikke-mål (bevisst utelatt)

- Ekstern runtime-referanse til skills/MCP (skills.rest, GitHub-fetch i
  svarløpet) — injeksjonsflate, latens, kost; janbrus-repoet er KILDE for
  destillering, aldri kjøretidsavhengighet. MCP forblir roadmap.
- codelist-aggregeringer (`codelist[Region]=agg_…`, `outputValues`) —
  nevnes kun i ssb-guiden (fiks 4), håndheves ikke i v1.
- ssb-chart-skillen (figurstyling etter SSBs designsystem) — eget spor.
- Auto-fylling av obligatoriske dimensjoner i adapteren (velge første
  innholdskode selv) — eksplisitt valg fra modellen er riktigere enn
  stille gjetting; feilmeldingen (fiks 3) gjør valget til én runde.

## Lagdeling (designprinsipp)

Robusthetshierarki: **verktøykontrakt > feilmelding > guide > promptprosa.**
Fiks 1+3 leverer informasjonen i øyeblikket den trengs; fiks 4 (guiden)
bærer det som ikke passer i verktøykontrakter; fiks 2 holder prompten på
et minimum. Generaliseringen (flytte eksisterende per-kilde-quirks ut av
DELIVERY) er bevisst oppfølging, ikke del av denne runden.

## Fiks 1: `table_metadata` — mandatory-flagg + `find`-param

`netlify/edge-functions/_lib/tools/table-metadata.ts`:

- **`mandatory: true`** per variabel i svaret. pxweb: fra
  `dimension.<id>.extension.elimination === false`; mangler feltet, brukes
  fallback-regelen ContentsCode + tidsdimensjonen (`role.time`) =
  mandatory. Andre kataloggrener (fhi/dst/statfin/…): settes der
  metadataene bærer informasjonen; ellers utelates feltet (aldri gjett).
- **`find`-param** (valgfri streng) i verktøyskjemaet: filtrerer
  verdilistene per dimensjon på delstreng i kode ELLER etikett
  (case-insensitiv) FØR MAX_VALUES-kuttet — trunkeringen skjer hos oss,
  hele kodelisten er allerede i minnet. `find: "Oslo"` → Region-verdien
  `0301 Oslo` kommer med uansett posisjon. `valuesTruncated` reflekterer
  listen ETTER filtrering.
- Verktøybeskrivelsen (CLIENT_TOOL_DEFS i svar-prompt.ts) oppdateres:
  nevn mandatory-flagget og find-parameteren.

## Fiks 2: prompt — regelen + eksemplet (svar-prompt.ts + svar.md-speilet)

- Ny EVAL-REGEL i DELIVERY (destillert fra janbrus):
  «pxweb-KRAV: alle dimensjoner med mandatory=true i table_metadata MÅ ha
  valg i read-kallet — `indicators=` for ContentsCode, `years=` for Tid.
  Flerinnholds-tabeller uten `indicators=` gir 400 Missing selection.
  Bruk `find=` i table_metadata for å finne koder i lange lister (f.eks.
  kommunenavn) i stedet for å gjette.»
- Registerveis-eksemplet utvides med `indicators=` (reell innholdskode for
  05839 slås opp under implementeringen) slik at mønsteret modellen
  kopierer er komplett.

## Fiks 3: adapterfeil → handlingsrettet melding

pxweb-datahentingen (js/data-loader.js-grenen for `kind === 'pxweb'`):
ved HTTP 400 fra data-endepunktet hentes metadata (kun på feilveien) og
feilen oversettes til:

«SSB-tabell <id> krever valg for obligatoriske dimensjoner: <mangler-liste>.
Legg til indicators=/filters i read-linjen. Gyldige koder for <dim>:
<inntil 10 koder m/ etiketter>.»

Meldingen når modellen via run_code-resultatet → én reparasjonsrunde
holder. Andre statuser røres ikke.

## Fiks 4: source-guide-laget (skills-mønsteret internt)

Per-kilde-guider i repoet, levert via eksisterende verktøysvar — ingen ny
rundtur, ingen ekstern avhengighet:

- **`data/source-guides/ssb.md`** (første guide, ~800–1200 tokens):
  destillert fra janbrus-referansene — URL-mønstre for v2,
  `top(n)`/`from(år)`-syntaks, mandatory-regelen med eksempel,
  codelist-aggregeringer (`codelist[Region]=agg_…`, `outputValues`),
  kjente feller (latin-1-CSV, bred default-CSV, v2-beta død). Markdown i
  repoet = versjonert, testbar, lett å vedlikeholde (ingen
  TS-literal/speil-synk).
- **Levering:** i svar.ts-løpet får FØRSTE `search_catalog`- eller
  `table_metadata`-svar for en kilde et `guide`-felt vedlagt (per-kjøring
  Set av kilde-id-er hindrer gjentak). Guiden hentes av edge-funksjonen
  fra egen origin (`/data/source-guides/<id>.md` — statisk asset; Deno
  Deploy bundler ikke .md ved kjøretid, jf. svar.md-headeren);
  fetch-feil → feltet utelates stille, verktøysvaret ellers uendret.
- **Annonsering:** registerblokken (renderRegistryBlock) merker kilder som
  har guide med én kort setning, og EVAL-regelen i fiks 2 peker på at
  guiden følger med første katalogkall.
- Kilder uten guide-fil: helt uendret oppførsel.

**Oppfølging (egne runder, ikke nå):**
- Migrér eksisterende per-kilde-quirks (sdmx/worldbank/dbnomics/eurostat)
  fra DELIVERY til guider én kilde om gangen — prompten krymper per steg.
- **Landlaget** (vurdert 2026-07-31): `land`-felt + oppdeling av
  data-sources.json i `data/sources/{int,eu,no,dk,…}.json`; flagg-velger i
  UI som VEKTER (aldri filtrerer — spørsmålets geografi vinner over
  UI-landet); svarspråk følger fortsatt spørsmålet; bruker-styrbar
  search_datasets-scope; `md_country` i localStorage. Forutsetter at
  guide-laget er bevist i denne runden.

## Testing

- Node-tester for de rene delene: mandatory-utledning fra
  metadata-JSON (elimination-felt + fallback-regelen), find-filtrering
  (kode + etikett, case, trunkeringsflagg), feilmeldingsbyggeren.
- Deno check for edge-endringene.
- **Eval-kriterium (avgjørende):** Oslo-eksempelspørsmålet på nytt —
  ekte SSB-tall i svaret (ikke sekundærkilder), innenfor
  standardbudsjettet (≤3 run_code), uten degraderingsbadge.

## Filer

| Fil | Endring |
| --- | --- |
| `netlify/edge-functions/_lib/tools/table-metadata.ts` | mandatory + find |
| `netlify/edge-functions/_lib/svar-prompt.ts` | EVAL-regel, eksempel, verktøybeskrivelse |
| `netlify/edge-functions/prompts/svar.md` | speil |
| `js/data-loader.js` (+ ev. hjelper i js/pxweb.js) | 400-oversettelse |
| `data/source-guides/ssb.md` | NY — første guide (fra janbrus-refs) |
| `netlify/edge-functions/svar.ts` + `_lib/registry.ts` | guide-vedlegg ved første katalogkall; registerannonsering |
| `tests/js/…` + ev. deno-tester | som over + guide-gating |
