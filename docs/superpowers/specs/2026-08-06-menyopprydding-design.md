# Menyopprydding: profil til sidemenyen, ren kildepille, biblioteksmanager med søk

**Dato:** 2026-08-06 · **Status:** utkast til godkjenning (design-samtale 2026-08-06; ingen kode endret)

## Bakgrunn og mål

Kontekstrunden (spec 2026-08-06-kontekstrunden) samlet profil og kilder i én
pille — men i praksis forvirrer to ulike begreper i samme popover, og
kildeseksjonen blander fire radtyper som ser like ut men oppfører seg ulikt:
sjekkbokser (innebygde + importerte), community-rader som åpner
Explore-modalen, «Choose country →» som bytter visning, og modal-lenker
(«New source…», «View/Import shared packs…»). Samme utseende, fire
oppførsler — det er kjernen i forvirringen.

Målet med runden: **profil ut av pillen** (til sidemenyen), **ren
kildepille med faste valg først**, **én biblioteksmanager-modal** som
samler alt kildestell, og **søk i import- og landvelgerne**. Ren
UI-omflytting — payload-kontrakten mot `/api/svar` endres ikke.

## Beslutninger (Hans, design-samtalen 2026-08-06)

- **Profil flyttes til sidemenyen**; knappen åpner profilmodalen direkte
  (radioene, «Ingen profil», Ny/Rediger/Slett finnes der allerede).
  Ingen hurtigmeny-mellomledd.
- **Faste valg først** i undermenyer: Standard/None, Utvidet internettsøk,
  Administrer — deretter variable lister. Stabile posisjoner gir
  muskelminne.
- **«Extended search» døpes om** til «Utvidet internettsøk» (en:
  «Extended internet search») og flyttes opp blant de faste valgene.
- **Manager-modalen er ÉN liste** med sjekkbokser (samme idiom som
  popoveren), ikke to kolonner — besluttet etter avveining: to
  fremstillinger av samme valgt-tilstand kan re-forvirre, og kolonner er
  trange på mobil.
- **Enkeltklikk, ikke dobbeltklikk**, som mekanisme (touch + oppdagbarhet):
  klikk markerer og viser info; sjekkboksen/knappene gjør endringene.
- **Import med søk**: søkefelt + to-stegs visning (liste → detalj med
  forhåndsvisning → Importer). Samme søkemønster i landvelgeren.
- **Deling til admin** (submitte kildebeskrivelse) utsettes; infopanelet
  designes med knapperad slik at en «Del …»-knapp kan legges til senere.

## Design

### 1. Kildepopoveren (slankes)

Pillen viser kun kilder; «Context»-fallbacken blir «Kilder». Profilseksjonen
(`askCtxProfileSection` + ProfilesUi.renderInto) slettes fra popoveren.
Innhold ovenfra:

1. Overskrift + forklaringslinje (som i dag).
2. **Faste valg:** «Standard (automatisk)» (hake når auto er aktiv),
   «Utvidet internettsøk» (avkrysning, sticky per enhet som i dag),
   «Administrer kilder …» (åpner manageren, §3).
3. Skillelinje.
4. **Kun sjekkboksrader:** biblioteket = innebygde pakker, egne/importerte
   kilder, valgte land. Klikk toggler (ikke-lukkende, som i dag).
   **Lista har maks-høyde og ruller internt** — de faste valgene over
   skillet er alltid synlige uansett bibliotekstørrelse (Hans 2026-08-06).
5. Budsjett-hintet nederst (uendret).

Ut av popoveren: uimporterte community-rader, «Choose country →»-drillinnen
med `view`-tilstanden, «New source…» og «View/Import shared packs…» — alt
bor nå i manageren.

### 2. «Standard (automatisk)» — vei tilbake til auto

I dag er manuelt valg en enveisdør: `setPacks` skriver `doc.packs`
permanent, og auto-forslaget (md_pack_auto) kommer aldri tilbake. Raden
gjenoppretter auto.

**Mekanikk:** auto-tilstanden skrives EKSPLISITT som
`doc.packs = {auto: true, updated}` — IKKE ved å slette `doc.packs`
(sletting ville blitt resurrektert av mergeRemote: remote med eldre
manuelt sett vinner over fraværende lokalt felt). `packsState()` behandler
`{auto:true}` som fraværende felt (les md_pack_auto); Packs kjører
`applyAuto` på nytt med locale-kandidatene. Merge forblir hele-settet,
nyeste `updated` vinner.

### 3. Profil i sidemenyen

Ny knapp i `.ask-side-bottom` (over «API key & settings»), person-ikon,
etikett «Profil: \<navn\>» — «Profil» når ingen er aktiv. Klikk åpner
`Profiles.openModal()` direkte. Etiketten oppdateres via `Profiles.onChange`.
Modalen er uendret (radioliste med «Ingen profil» øverst, Ny/Rediger/Slett,
markdown-preview). `context-pill.js` beholder åpne/lukke og etikett, men
kun kildedelen.

### 4. Biblioteksmanageren («Administrer kilder»)

Dagens modal i `kind:'source'`-modus (profilesBackdrop/openModal) UTVIDES
til biblioteksmanager — profilmodusen er uendret. Tittel «Kilder»
(en: «Sources»).

- **Lista:** hele biblioteket (innebygde, egne/importerte, valgte land) med
  sjekkboks = aktiv (`togglePack`, samme tilstand som popoveren). Klikk på
  radnavnet markerer raden og viser **infopanelet** under: beskrivelse fra
  katalogen (index.json/countries.json-note; for egne kilder origin +
  første linjer av teksten) og en knapperad — «Rediger» og «Slett» (kun
  egne kilder; gjenbruker dagens openEdit/remove), plass til «Del …»
  senere.
- **Bunnknapper (faste valg, alltid synlige):** «+ Ny kilde» (dagens
  editor), «Importer delte kilder …» (åpner Explore, §5), «Legg til
  land …» (undervisning, §6). **Lista ruller internt** (maks-høyde);
  bunnknappene er festet under lista (sticky footer) og forblir synlige
  uansett listelengde (Hans 2026-08-06).

### 5. Import med søk (Explore-modalen)

- **Søkefelt øverst** som filtrerer `listCommunity()` fortløpende på navn +
  beskrivelse (klientside, ingen server).
- **To steg i samme modal:** (a) liste med søk; (b) klikk på en kilde →
  detaljvisning: navn, forfatter/oppdatert, rendret forhåndsvisning,
  knappene **Importer** og **← Tilbake til lista**. I dag blir lista
  stående over forhåndsvisningen — med mange kilder må man scrolle forbi
  hele lista; detaljsteget er roligere og mobilvennlig.
- Import beholder dagens semantikk: kopi som `kind:'source'` med
  origin-stempel, aktiveres direkte; manageren re-rendres.

### 6. «Legg til land …» med søk

Undervisning i manager-modalen (ikke i popoveren): samme søkefelt-mønster
filtrerer landlista fra `countries.json`; klikk toggler valget (landet
dukker opp i biblioteket/popoveren som avkrysset rad); «← Tilbake».

### 7. i18n og opprydding

- Nye nøkler i alle 13 ordbøker (engelsk fallback ok i mellomfasen):
  «Standard (automatisk)», «Utvidet internettsøk», «Administrer kilder …»,
  «Profil», «Profil: {name}», «Kilder», «Importer delte kilder …»,
  «Legg til land …», «← Tilbake til lista», søkefelt-placeholder.
- Slettes: ProfilesUi.renderInto (popover-varianten), community-/land-/
  modal-radene i PacksUi sin hovedvisning, `view`-tilstanden i packs.js
  sin popoverdel, «(auto)»-merket erstattes av Standard-radens hake.
- `md_ask_discover`-NØKKELEN endres ikke (kun etiketten) — ai-chat.js
  leser literalen direkte (run-kontrakt.test.js).

## Faser (hver leverbar alene)

1. **Omflytting:** profilknapp i sidemenyen + profilseksjonen ut av
   popoveren, faste valg først, «Utvidet internettsøk»-rename,
   «Standard (automatisk)» med {auto:true}-semantikken.
2. **Manageren:** biblioteksliste med info/Rediger/Slett, bunnknapper,
   landvelger-undervisning med søk. Popoveren slankes samtidig
   (community-/land-radene flyttes hit).
3. **Import-søk:** søkefelt + to-stegs Explore.

## Tester

- `packsState`: `{auto:true}` ≡ fraværende felt; merge-test: Standard på
  én enhet vinner over eldre manuelt sett fra annen enhet (nyeste
  `updated`), ingen resurreksjon.
- Popover-render: faste valg først, kun sjekkbokser under skillet,
  budsjett-hint nederst.
- Manager: toggle i modalen ≡ toggle i popoveren (samme tilstand);
  Rediger/Slett kun for egne kilder; import → aktivert + i lista.
- Run-kontrakten UENDRET: `md_ask_discover`-nøkkel, `packs[]`-payload,
  `preferences`-feltet (run-kontrakt.test.js er vokteren).
- Søkefilter: ren funksjon (navn + beskrivelse, case-insensitiv) node-testes.
- E2e-smoke før push (smoke = pre-push-port som vanlig).

## Bevisst utsatt

- To-kolonners flytteliste — bare hvis én-liste-manageren likevel føles
  trang når biblioteket vokser.
- «Del …»/innsending av kildebeskrivelse til admin (knapperaden i
  infopanelet er forberedt).
- Søk i selve popoveren — biblioteket er lite; søk bor i manager/import.
- Popover viser bare aktive + sist brukte kilder — kun hvis biblioteket
  vokser så mye at intern rulling (§1) ikke holder.

## Kjente feller

- **Auto-resurreksjon:** sletting av `doc.packs` gjenopplives av
  mergeRemote — derfor eksplisitt `{auto:true}`-verdi (§2). Testdekkes.
- **menuSawClick-fella** (context-pill.js): modal-åpning fra popoveren må
  fortsatt gå via `close()` før modalen åpnes; klikk i modalen skal ikke
  treffe click-outside-lytteren.
- **Modal-z-index-fella** (safestat-erfaring): sjekk stabling når
  Explore åpnes over manageren.
- **Node-mockene:** gamle tester mocker Profiles uten nye funksjoner
  (`{auto:true}`-lesing) — mock-oppdatering før grønt betyr noe.
- **Popover-re-render ved onChange** mens menyen står åpen: fresh-flagget
  forsvinner sammen med `view`-tilstanden — fjern begge, ikke bare én.
- **i18n:** `data-i18n-title` på nye knapper; «Profil: {name}» trenger
  parameter-interpolasjon (t(k, p)-mønsteret finnes).
