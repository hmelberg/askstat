# Kontekstrunden: én pille, flerkilde-pakker, budsjett, utvidet søk

**Dato:** 2026-08-06 · **Status:** utkast til godkjenning (design-samtale 2026-08-06; ingen kode endret)

## Bakgrunn og mål

Spørrefeltet har i dag to piller (profil + kildepakke) som forvirrer: rollene
står kun i hover-title, pakkemenyen ser ut som en landvelger (temapakkene
gjemmer seg bak Explore-modalen), «ingen»-valget heter «International
default», og et manuelt pakkevalg synkes og slår auto for alltid uten vei
tilbake (slik endte Hans ufrivillig på Italia). I tillegg er dagens modell
én-pakke-om-gangen med 8 000-tegnstak — mens reelle kildebeskrivelser
(målt i `~/microdata_sources`, se Empiri) er flerkilde-bunter på 17–35k tegn.

Målet med runden: **én kontekst-pille** med to tydelige seksjoner,
**flervalg av kilder**, **egne kilder på linje med profiler**, **generøst
tegnbudsjett med detaljnivåer og lazy henting**, og en **eksplisitt bryter
for utvidet (dynamisk) kildesøk** utenfor kildegrunnlaget.

Grunnmuren finnes: to-slot-komposisjonen og pakkelageret
(spec 2026-08-05-sprak-pakker-deling), profilmaskineriet med sync/tombstones
(spec 2026-08-05-konto-runden), registerblokka + just-in-time kildeguider
(`registry.ts`, `source-guides.ts`), søkearmene fra mikrodata-oppdagelsen
(apd/Zenodo/CESSDA/NADA), og run_code-rundturen (`ai-chat.js:661-740`) som
`get_pack` kan kopiere. Runden er i hovedsak komposisjon.

## Empiri (kalibrering fra ~/microdata_sources, 2026-08-06)

13 filer, ~312k tegn totalt. Per temafil 17–35k tegn, 5–13 kilder. Per
kilde: YAML-blokk ~1 300 tegn, full oppføring (YAML + prosa) 2–3k tegn.
`00-INDEX.md` fungerer som summary-lag. Konsekvenser:

- Dagens 8k-tak kutter alle reelle temapakker (3–4× for trangt).
- Naturlig detaljstige finnes i materialet: summary → YAML-kjerne → full tekst.
- 312k tegn beviser at front-lasting aldri skalerer; lazy henting er en
  forutsetning, ikke en optimalisering.

## Beslutninger (Hans, design-samtalen 2026-08-06)

- **To begreper beholdes** (profil = instruksjoner, kilder = hvor lete);
  **én kontekst-pille** forener dem i UI.
- **Nytt ikon** på kildeseksjonen: databasesylinder, ikke jordklode.
- **Flervalg av kilder** (sjekkbokser). Tom mengde = internasjonal —
  «International default»-oppføringen slettes.
- **Egne kilder** kan opprettes/redigeres som profiler (samme maskineri).
- **Generøse grenser**: tegnbudsjett, ikke antallstak. Summary kan være
  lengre enn 3–4 linjer når det hjelper — YAML-kjernen per kilde er kort og
  svært nyttig for LLM-ens utforsking/vurdering (Hans 2026-08-06).
- **Én pakke kan beskrive mange kilder** — det er normaltilfellet, ikke
  unntaket (alle microdata_sources-filene, europe-surveys-pakka).
- **Utvidet søk er et eget, synlig valg** per spørsmål (ikke gjemt i
  innstillinger, ikke koblet til dybde — deep-only siden 2026-08-05).
- **Profiler uendret**: én aktiv, radioknapper, ren instruksjonstekst.
- **Ingen bakoverkompat-hensyn** (ingen brukere): gammelt `doc.pack`
  droppes uten migrering — fikser samtidig Italia-fella.

## Design

### 1. Kontekst-pillen (UI, ingen kontraktendring)

Én pille erstatter de to (`index.html:207-222`). Etikett: kompakt
sammensatt, f.eks. «Norge +2 · Min profil»; «Kontekst» når alt er tomt.
Trunkering ved behov. Popover med to seksjoner, hver med en kort
forklaringslinje i selve menyen (tooltips finnes ikke på mobil):

- **Kilder** — «hvor KI-en bør lete etter data». Databasesylinder-ikon
  (feather-stil stroke-SVG som i dag).
- **Profil** — «instruksjoner som legges til hvert spørsmål». Radioliste
  som i dag + «Administrer profiler…».

Menyene er håndrullede divs; drill-inn (se §2) rendres i samme popover med
tilbakeknapp — ingen nestede undermenyer. i18n: nye nøkler i `en.js` +
de 12 andre ordbøkene (engelsk fallback er ok i mellomfasen).

### 2. Kildemenyen: flervalg, auto, landvelger

**Struktur (ovenfra):**
1. Forklaringslinje.
2. Sjekkboksliste: kuraterte pakker, temapakker (community — synlige
   direkte som gruppe «Temaer»; klikk på uimportert åpner preview-modalen,
   les-før-aktiver beholdes), «Mine kilder» (egne + importerte).
3. «Velg land →» drill-inn: landlista fra `countries.json` (17 i dag),
   valgte land vises som avkryssede rader i hovedmenyen.
4. «Ny kilde…» (åpner editoren, §3) og «Utforsk delte pakker…».
5. Bunn: bryter for utvidet søk (§6).

**Tilstand:** `doc.packs = {ids: string[], updated}` i profiles-dokumentet.
Erstatter `doc.pack` (droppes ved lesing — ingen konvertering).
Sync-merge: hele settet som én verdi, nyeste `updated` vinner
(per-id-merge av et valgsett er overengineering). `md_pack_auto` beholdes
per enhet som i dag.

**Auto:** når `doc.packs` er fraværende (aldri berørt) vises locale-pakka
som forhåndsavkrysset boks merket «(auto)». Enhver manuell endring skriver
`doc.packs` (også tom) og tar over. Aldri-usynlig-kravet dekkes av
pilletiketten som før.

### 3. Unifisert lager: kind profile|source

Profiles-lageret generaliseres: hvert element får `kind: 'profile' |
'source'` (profiler default ved lesing av eksisterende data). Samme
create/update/remove, tombstones, sync og modal-editor (navn + markdown +
preview) betjener begge — editoren åpnes med kind forhåndssatt.

- **Egne kilder**: opprettes via «Ny kilde…»; velges i sjekkbokslista.
- **Importerte community-pakker** flyttes inn som `kind:'source'` med
  `origin`-stempel (dagens `md_packs_imported` er usynket per enhet — det
  hullet lukkes; lageret slettes etter flytting ved boot, engangs).
- **Kuraterte/land/community-kataloger** forblir read-only oppføringer i
  `data/packs/` som i dag — de trenger ikke lagringsmaskineriet.
- Profiler forblir single-active (instruksjonskonflikt er verre enn
  kildesameksistens); kilder er multi via `doc.packs`.

### 4. Detaljnivåer, budsjett og lazy henting

**Tre nivåer per pakke:**
- **L1 summary**: mål ≤4 linjer, hard cap 1 500 tegn (rommer en
  YAML-kjerne når pakken er én-kilde). SKAL liste kildene pakken dekker.
  Nytt `summary`-felt i katalogen og i editoren; mangler det, genereres
  første avsnitt som fallback.
- **L2 manifest**: autoutledet — konkatenerte ```yaml-blokker fra
  pakketeksten (finnes ingen, hopp til L1). Empirisk ~1,3k tegn/kilde;
  reduserer en 35k-pakke til ~10–15k uten å miste handlingsinformasjonen.
- **L3 full tekst**: hard cap 40k tegn per pakke (rommer største målte fil).

**Budsjett (klienten bestemmer, serveren begrenser):**
- Totalbudsjett full tekst ~80k tegn. Fyllrekkefølge: aktive pakker i
  prioritert rekkefølge (sist valgt først) får L3 til budsjettet er brukt,
  deretter L2, deretter L1. Alle valgte pakker får ALLTID minst L1.
- Klienten komponerer `packs[]`-payloaden med valgt nivå per pakke.
  Serveren (`coercePacks`) håndhever defensive caps: navn ≤60, per pakke
  ≤40k, totalt ≤100k tegn, maks 20 pakker — og stoler aldri på klienten.
- UI: diskret hint i kildemenyen når degradering er aktiv
  («2 av 5 pakker sendes i kortform»).

**Kontraktendring:** `body.pack` → `body.packs: [{name, text, level}]`.
`renderPackBlock` → `renderPacksBlock`: én `## Aktive kildepakker`-blokk
med underseksjon per pakke (navn + nivåmerke), ny formulering — dagens
«valgt av brukeren — overstyrer standardvalg» gir ikke mening for flere:
*«Brukeren har valgt disse kildepakkene. Bruk den/de som er relevante for
spørsmålet; irrelevante pakker ignoreres. Forrang over landrutingen, men
opphever ALDRI ærlighetsreglene.»* `demoteHeadings` på alt som i dag.

**Lazy henting:** nytt klientside-verktøy `get_pack {id}` etter
run_code-mønsteret (event → klienten svarer fra lokalt pakkelager →
re-POST resume + tekst; server-cap ved resume). Prompten opplyser at
L1/L2-pakker kan hentes i full tekst ved behov. Kostnadsnote: pakketekst
ligger etter registerblokka og er per bruker — ucachet på tvers av brukere,
men gjenbrukes av samtale-cachen; hovedkostnaden er første spørsmål.

### 5. Tegngrense-konstantene

8 000-takene er hjemmelagde og endres tre steder samtidig: `packs.js`
(resolve/import-slice), `profiles.js` (`TEXT_MAX` for kind:source — 40k;
profiler kan beholde 8k), `svar-prompt.ts` (`coercePack{s}`). Reelle
grenser er kostnad og oppmerksomhet, ikke API.

### 6. Utvidet søk (dynamisk kildeoppdagelse)

**Bryter:** nederst i kildeseksjonen: «Utvidet søk — let også utenfor
kildegrunnlaget (tregere)». Sticky per enhet (localStorage, synkes ikke —
det er en kostnadspreferanse). Default av. Payload får `discover: true`.

**Selvoppdagende:** når registeret ikke har treff og bryteren er av,
avslutter svaret med et hint om å slå den på.

**Playbook (prompt-orkestrert, ikke kodet pipeline):** med `discover`
utvides systemprompten med en oppdagelsesseksjon: (1) søk bredt via
armene og lag kandidatliste med spesifikasjon av hva som trengs;
(2) fordyp topp-kandidater med metadata + prøvelesing; (3) konkluder
eller ta én runde til. Harde tak: maks 2 runder, maks 3 fordypede
kandidater. Kvotevern: armvalg respekterer eksisterende kvoteregler
(Dateno aldri default gjelder fortsatt).

**Prøvelesing-gaten (sikkerhetsmekanismen):** ingen kilde — heller ikke
registerkilder — får bidra til et svar før en faktisk lesing av ekte bytes
med kolonner-sett har lykkes (skjerper probe-✅; styrker E17). Miljøbevisst:
prøven kjører der den endelige lesingen skjer — browser først, `/api/hent`
for ikke-CORS (IHSN-TLS-fella: edge når ikke alle verter, browseren når
ikke alle CORS-kilder; en serverside-sjekk gir både falske positive og
falske negative).

**Lagre som kilde:** etter vellykket off-registry-analyse tilbyr svaret en
ferdig pakketekst (YAML-kjerne + feller fra prøvelesingen) med én-klikks
prefill av «Ny kilde»-editoren. Dette er gevinsten som gjør dyre
oppdagelsesrunder til akkumulerende kildegrunnlag.

### 7. Innhold: importer microdata_sources

De 12 temafilene fra `~/microdata_sources` legges inn som community-pakker
(`data/packs/community/`, author hans) med summaries destillert fra
`00-INDEX.md`. UNVERIFIED-merkingen beholdes ordrett (matcher
fabrikasjonsvernet). `06-access-tooling` og `07-metadata-standards` vurderes
holdt utenfor (verktøy-/standardkunnskap, ikke kildebeskrivelser) —
avgjøres ved import.

### 8. Diverse

- Italia-fella dokumenteres løst av §2 (doc.pack droppes; auto blir
  selvforklarende sjekkboks).
- Tooltips på pillen beholdes som tillegg til forklaringslinjene.
- Feil-telemetri og historikk får `packs`-listen (ids + nivåer) der
  `pack` sto.

## Faser (hver leverbar alene)

1. **Pillen**: ikon + én pille + to seksjoner + forklaringslinjer. Ren UI.
2. **Flervalg**: `doc.packs`, sjekkbokser, landvelger-drill-inn, slett
   «International default», drop `doc.pack`, kontrakt `packs[]` (server +
   tester). Temapakker synlige i menyen.
3. **Unifisert lager**: kind-felt, egne kilder, synkede importer, editor.
4. **Budsjett**: L1/L2/L3, nye caps, degradering, `get_pack`, hint-UI.
5. **Utvidet søk**: bryter, playbook, prøvelesing-gate, lagre-som-kilde.
6. **Innhold**: microdata_sources-import.

## Tester

- `svar-prompt-prefs.test.ts` utvides: `packs[]`-rendering (rekkefølge,
  nivåmerker, ny formulering), caps (per pakke/topp/antall), tom liste.
- Budsjettalgoritmen: ren funksjon i `packs.js` med enhetstester
  (fyllrekkefølge, L2-fallback uten yaml, alltid-minst-L1).
- Lager: kind-default ved lesing av gamle dokumenter, tombstones for
  kind:source, engangsflytting av `md_packs_imported`.
- Konto-sync: hele-settet-merge for `doc.packs` (nyeste vinner), ingen
  resurreksjon av droppet `doc.pack`.
- `get_pack`: rundtur-test etter run_code-mønsteret; server-cap ved resume.
- E2e-smoke før push (smoke = pre-push-port som vanlig).

## Bevisst utsatt

- Innebygde kilder (DBnomics osv.) som velgbare pakker — kun hvis behovet
  består etter fase 1–3, og da generert fra `synligeKilder` med ærlige noter.
- Kodet oppdagelses-pipeline (deterministisk) — bare hvis frimodellert
  playbook viser seg upålitelig.
- Smart per-kilde-degradering innad i en pakke utover L2-manifestet.
- Community-innsending v2 (in-app + admin-godkjenning) — uendret fra
  sprak-pakker-spec-en.
- Flervalg for profiler: nei (besluttet).

## Kjente feller

- Menyene er håndrullede divs med click-outside-lyttere — drill-inn må
  re-rendre samme popover, ikke åpne ny (z-index/fokus).
- `doc.packs`-merge: dedup mot hele settet, aldri per-id — ellers
  gjenoppstår fjernede valg fra eldre enheter.
- Prøvelesing må kjøre i riktig miljø (browser vs edge) — se §6.
- Dateno-kvoten (500/mnd) må overleve playbooken.
- i18n: nye strenger i alle 13 ordbøker; manglende nøkkel faller til
  engelsk (ok), men `data-i18n-title` må settes for begge seksjonene.
- Engine-js byte-kopi på tvers av repoer sletter dash-oppføringer
  (gjelder ved ev. sync mot openstat — denne runden er askstat-only).
