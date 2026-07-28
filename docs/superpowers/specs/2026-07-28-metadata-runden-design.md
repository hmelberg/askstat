# Metadata-runden — design

Dato: 2026-07-28. Status: godkjent av Hans (brainstorm-dialog samme dag).
Bygger på typet-kanonisk-vei-runden (merget 8f71911): typemeta-kontrakten
(dims/categories/labels/time/metric/units + role/label/unit) ligger i
js/pxweb.js og på rammene som `attrs['ost_typemeta']`, med JS/py-paritet
håndhevet gjennom delt fixture.

## Motivasjon

1. **Målt stille-feil-klasse på hovedveien.** Pandas-først-regelen gjør rå
   `pd.read_csv(url)` til den anbefalte veien for åpne GET-tabeller — men
   den veien har 0301→301-fella (null-paddede koder tolkes som tall, stille
   datakorrupsjon) som typet kanonisk vei allerede fikser med dtype=str-vern.
   I dag gir altså den ANBEFALTE veien dårligere datakvalitet enn
   direktivveien. Det er baklengs.
2. **Metadataen finnes men vises ikke.** Panelet viser dtypes (category/
   int64), men etikettene og nivåene som ligger i ost_typemeta når aldri
   brukeren.
3. **Portabilitet skal bevares eksplisitt.** Automatikk i appen skal ha en
   eksplisitt, pip-bar tvilling i openstat.py slik at samme resultat kan
   oppnås utenfor appen med samme regler (Hans' krav i dialogen).

## 1. Panelvisning: etiketter/nivåer/enheter

Datasettpanelet (updateSidebarDatasets-veien i index.html) utvides for
rammer som bærer ost_typemeta:

- Kolonnerad: `navn — etikett · dtype` (f.eks. «Region — region · category»).
- Category-kolonner får utvidbar kode→etikett-liste: første ~20 nivåer,
  deretter «+N flere» (ren DOM, ingen ny avhengighet, ingen scroll-felle).
- Verdikolonnen viser unit når den finnes (f.eks. «verdi — personer · float
  · antall»).
- Kilde for panelet er JS-sidens typemeta (den bor i JS før injeksjon), så
  visningen virker for alle motorer panelet kjenner; attrs-lesing fra
  Pyodide i post-run-sveipen brukes der den finnes.
- js/meta-info.js røres IKKE — brukersatt metadata (#meta-direktivene) er en
  annen flate med egne regler.

## 2. Fødselstyping i appen: obligatorisk, men feilbar

For laster der URL-en gjenkjennes som en registerkilde med kjent metadata
(pxweb-familien: ssb/scb/dst/statfin — eurostat samme vei), gjelder:

- **Obligatorisk = alltid forsøkt automatisk.** Tabell-id ekstraheres fra
  URL-en (registerdrevet mønster, aldri hardkodede vertsnavn utenfor
  registeret), metadata hentes i PARALLELL med data-prefetchen
  (literal-skannen gir URL-ene før kjøring; broen er choke-punktet), og
  caches per (kilde, tabell-id) for økten.
- **Typing ved fødsel, aldri etterpå.** Rammen fødes typet FØR brukerkoden
  ser den, med kanonisk veis apply-regler (Categorical i kildens orden,
  tidsregelen int64-vs-ordnet-Categorical, value→to_numeric, dtype=str-vern
  for kodekolonner). Ingen mutasjon av en ramme etter kjøring — «kun
  berike»-beslutningen gjelder alt som ankommer sent.
- **Feilbar = aldri blokkerende.** Feiler metadatahentingen (nett, 4xx,
  ukjent skjema): lasten fortsetter UTYPET med et høylytt konsollnotat.
  Kjøringen feiler aldri på metadata, og vi setter aldri usikre etiketter
  (ingen gjetting).
- Motoromfang i denne runden: fødselstyping i **Pyodide** (apply-mekanikken
  finnes: PxWeb.pyApplyTypemetaSource). R- og mini-motor-rammer får verken
  typing eller panelberikelse ennå — panelberikelse krever URL→ramme-navn-
  kobling som ikke finnes (R-sveipen leser globalenv uten opphavs-URL);
  ført som oppfølging sammen med R-factor og mini-motor-typing (justert ved
  planskriving 2026-07-28). DuckDB utsettes.
- Kjent, akseptert divergens: samme script gir typet ramme i appen og
  utypet i naken Jupyter. Divergensen er i korrekthetens favør
  (padding-fella), dokumenteres i hjelpen, og NØYTRALISERES av seksjon 3
  for den som vil: samme funksjon eksplisitt.

## 3. Eksplisitte, portable funksjoner i openstat.py

Pakken (openstat.py, pip-bar, JS/py-paritet via delt fixture) får tre
funksjoner med samme apply-regler som appen:

- `ost.read_csv(url, **pandas_kwargs)` — henter CSV-en OG metadataen for en
  gjenkjent register-URL, returnerer ferdig typet DataFrame (attrs satt).
  For ikke-gjenkjente URL-er: ren pandas-passthrough (aldri stille gjetting).
- `ost.apply_meta(df, source_or_url, table=None)` — påfører metadata på en
  ramme brukeren alt har lastet; returnerer samme ramme typet.
- `ost.read_table(source, table, **kanonisk vokabular: years=/filters=/…)` —
  én-forespørsels-veien: henter json-stat2 (bærer etiketter/kategorier
  INLINE) og bygger tidy, typet ramme direkte. Egen liten json-stat2-
  konverter (~60–100 linjer) — INGEN pyjstat-avhengighet (avvist 2026-07-27;
  `pd.read_json` klarer ikke json-stat2, probet samme dato).
- Appens metadata-henting og pakkens skal dele parser-regler; json-stat2-
  konverteren skrives så den også kan lese /metadata-endepunktets form der
  det er samme skjema. Fixture-paritet håndhever at app-typing og
  pakke-typing gir byte-like resultater gjennom CSV-rundturen.
- Navn er bevisst korte og pandas-nære (read_csv/read_table/apply_meta) —
  Hans' navnepreferanse; `ost.read_csv(url)` skal føles som pandas med
  metadata på.

## 4. Verifisering (kjøre-verifisering, Deep-sporet)

- Browser (chrome-devtools, ignoreCache-fella respekteres): (a) smoke
  1-scriptet (kanonisk vei) → panelet viser etikett + utvidbar nivåliste +
  unit; (b) et rått `pd.read_csv(<SSB-URL>)`-script → rammen fødes typet
  (dtypes i panelet: category/int64, kodekolonner bevarer «0301») og
  panelet berikes; (c) metadata-feil-scenario (ugyldig tabell-id) → lasten
  fullfører utypet + konsollnotat.
- node: URL→(kilde, tabell-id)-gjenkjenning (registerdrevet, kanttilfeller),
  panel-render (mønster fra meta-info-testene: modellen OG render()).
- pytest: openstat.py-funksjonene (typing, passthrough, feil-veier),
  json-stat2-konverteren mot fixtures, fixture-paritet app↔pakke.
- Eval: ingen egen promptendring i denne runden → ingen ny evalbatch;
  smoke-verifiseringene over er porten. (Promptomtale av `ost.read_csv`
  som portabilitetsråd vurderes SENERE, måles da per spec §7-regelen.)

## 5. Utenfor runden (står i køen)

R-factor-typing, mini-motor-typing, SDMX-typemeta, portabel-eksport som
emitter dtype=str-hint for kodekolonner, promptmal-omtale av de eksplisitte
funksjonene, DuckDB-typing.

## Beslutningslogg (Hans, 2026-07-28)

- Scope: BEGGE deler (panel + henting) — og hentingen skjerpet fra «lat men
  varm» til «obligatorisk men feilbar» med fødselstyping (Hans' korreksjon:
  for kilder med kjent metadata skal henting skje automatisk før videre
  kjøring og påvirke dtype, f.eks. category).
- Panelform: etikett + utvidbar nivåliste (~20 + «+N flere»), units.
- Mutasjonsregel: kun berike etter kjøring, aldri mutere — typing skjer ved
  fødsel eller aldri.
- Portabilitet/eksplisitthet: samme evne bygges inn i ost/openstat.py som
  egne funksjoner (read_csv/apply_meta/read_table); json-stat2 som
  én-forespørsels-motor under panseret.
