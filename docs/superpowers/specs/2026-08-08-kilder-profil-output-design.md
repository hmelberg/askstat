# Design: Kilder, instruksjoner, output og innstillinger — opprydningsrunden

Dato: 2026-08-08. Status: godkjent av Hans (helhet + alle delvalg).

## Mål

Gjøre kilde- og profilhåndteringen intuitiv og forståelig, rydde sidemenyen og
innstillingene, polere svar-outputen, fikse plotly-label-overlapp, og innføre
et generelt tag-system med mikro/makro som første bruksfall. Ingen
bakoverkompatibilitet (ingen brukere å migrere).

## 1. Sidemeny — alle valg over historikken

Ny rekkefølge i `#askSidebar` (`index.html:109–202`):

1. Topp (collapse-knapp + «AskStat»)
2. **Instruksjoner** (tidl. Profil, `#askProfileBtn`) — statisk tekst, aldri «Profil: navn»
3. **Kilder** (ny knapp; erstatter Country-knappen som inngang) — statisk tekst
4. Nytt spørsmål
5. Eksempler
6. Hvorfor AskStat?
7. Kode og output
8. Innstillinger (`#askSettingsBtn`)
9. Nylige (historikk — fyller resten av høyden)
10. **Logg inn / konto — eneste element i bunnblokka**

Fjernes: `#askCountryBtn` (landvalget flytter inn i kilde-dialogen, §2).
Kildepillen i spørrekortet (`#askContextBtn`, `index.html:219–223`) beholdes
med statisk tekst «Kilder» og åpner kilde-dialogen direkte; popover-menyen med
kildeliste (`js/packs.js renderInto` + `js/context-pill.js`) fjernes helt.
Flip-logikken og outside-click-håndteringen i `context-pill.js` blir dermed
overflødig for kilder (kontomenyen `#askAccountMenu` beholder sin egen).

## 2. Kilde-dialogen — egen modal med faner og tag-filter

Kilder får **egen modal** (ny `#sourcesBackdrop`); profilmodalen
(`#profilesBackdrop`) beholder kun profiler/instruksjoner. Dagens
`modalKind`-bryter i `js/profiles.js` (delt modal med hidden-togglede knapper,
dokumentert skjør) fjernes.

Struktur:

```
Kilder
  Land: [Norge ▾]        ☐ Utvidet internettsøk
  [ Tema (2) ][ Enkeltkilder (12) ]
  Søk: [________]   Tags: (makro) (mikro) (norge) …
  ┌ avkryssingsliste, valgte øverst ┐
  │ ☑ SSB                  [makro] [norge]  (innebygd) │
  │ ☐ ESS                  [mikro] [survey] (innebygd) │
  │ ☑ Min helsekilde       [makro] (min)               │
  └──────────────────────────────────────────┘
  (klikk på rad → infopanel; Rediger/Slett for egne kilder)
  [Importer nye kilder …] [Lag ny …]        [Lagre] [Lukk]
```

- **Faner** «Tema ∣ Enkeltkilder» (segmentert kontroll) med antall i etiketten.
  Ingen lang samle-scroll; hver fane har sin egen liste.
- **Land-dropdown** øverst erstatter Country-modalen (`#countryBackdrop` kan
  fjernes eller gjenbrukes som datakilde for lista). Semantikk uendret:
  landpakken legges automatisk til (`Profiles.countryState()`/`countryPackId()`).
- **«Utvidet internettsøk»**-avkryssingen flytter hit fra popoveren
  (localStorage `md_ask_discover` uendret).
- **Innholdet i fanene:** registerkildene (innebygde av/på, `doc.sources_off`)
  og brukerens egne kilder flettes inn i riktig fane med hhv. «innebygd»- og
  «min»-merke. Dagens fire grupper i én scroll erstattes av dette.
- **Søk + tag-chips:** fritekstsøk på navn, pluss tag-chips generert automatisk
  fra taggene som finnes i lista (hyppigst først). Flere valgte chips =
  innsnevring (OG). Samme filterrad gjenbrukes i import-utforskeren
  (`#packsExploreBackdrop`).
- **Knapper:** «Importer nye kilder …» (erstatter «Importer delte kilder …»,
  samme to-stegs les-før-importer-flyt), «Lag ny …», «Lagre», «Lukk».
  «Fjern importerte» og «Deselect all» utgår (slett per rad i infopanelet;
  valgte ligger øverst per fane).
- **«Lag ny …»** spør først type: «Hva vil du lage? ◉ Enkeltkilde ◯ Tema
  (samling)», deretter navn + tekst + tags-felt (fritekst, kommaseparert) med
  hurtigchips for mikro/makro/land. Rediger-skjemaet har samme felt.

## 3. Datamodell: `kind` er felt, `tags` er liste

Regel: *må det være nøyaktig én verdi og forgrener koden på den → felt; kan det
være null/én/flere og brukes til filtrering/ruting → tag.*

- **`kind`** (`'overview'` | `'source'`, dvs. tema/enkeltkilde) blir
  obligatorisk felt på alle pakker — også brukerlagde (settes i «Lag ny»,
  i dag settes den kun ved import). Gamle brukerkilder uten kind vises som
  enkeltkilde til de redigeres (ingen migrering).
- **`tags: string[]`** (valgfritt) legges til i:
  - `data/packs/index.json` (delte pakker — merkes i denne runden med
    mikro/makro + land der det er opplagt)
  - `data/data-sources.json` (registerkildene — mikrodatakildene merkes `mikro`)
  - brukerlagde kilder (lagres sammen med navn/tekst, følger kontosynk som i dag)
- **Reserverte tagger i v1:** `mikro`/`makro` (fargede badges + rutingsregel i
  prompten), landnavn (nøytral badge). Alle andre tagger er lov og vises som
  nøytrale badges. Ny tag → nytt filter-chip uten kodeendring.

## 4. Prompt-integrasjon

`kind` og `tags` bæres gjennom hele kjeden som i dag stripper dem:
`compose()` (`js/packs.js:47–64`) → payload → `coercePacks()`
(`svar-prompt.ts:53–71`) → `renderPacksBlock()` (`svar-prompt.ts:87–112`).

- Overskrift per pakke: `### Tema (samling): …` vs `### Enkeltkilde: …`,
  med tags vedheftet: `### Enkeltkilde: ESS [mikro] [survey]`.
- Ny forklaringssetning i blokka: tema er en meny av kilder (hent detaljer med
  `get_pack`), enkeltkilde er en direkte instruks.
- `get_pack`-beskrivelsen (`svar-prompt.ts:962–974`) oppdateres til å forklare
  begge typene — også for brukerlagde kilder (som i dag mangler `src-*`-hintet).
- Registerblokka (`renderRegistryBlock`) viser også tags per kilde.
- **Rutingsregel** i systemprompten (data-ruta): bruk `mikro`-kilder bare når
  spørsmålet gjelder individdata (fordelinger, undergrupper, surveydata) eller
  brukeren ber om det; ellers foretrekk `makro`. Default-valgene endres ikke —
  regelen retter skjevheten der mange mikrokilder står på.

## 5. «Instruksjoner» (tidl. Profil)

- Navn: **Instruksjoner** (en: *Instructions*), statisk knappetekst, plassering
  øverst (§1).
- Ny hjelpetekst (erstatter dagens i `index.html:478`): «Instruksjoner legges
  automatisk til hvert spørsmål. Bruk dem til å styre hvordan svarene lages —
  språk, form, metode eller vektlegging. De kan justere eller overstyre appens
  standardoppførsel.»
- Nye eksempler i hjelpeteksten: «Svar alltid kort og på norsk», «Vis alltid
  usikkerhet og oppgi kilder», «Bruk R i stedet for Python», «Foretrekk
  tabeller fremfor grafer», «Jeg er forsker — bruk fagterminologi».
- Modal-tittel og knapper («New profile» → «Ny instruksjon» osv.) følger med.
  Payload-feltet `preferences` og `renderPreferencesBlock` beholder navn
  (serverkontrakt uendret).

## 6. Svar-output

- **Handlingsknappene** (`.ask-answer-actions`, `index.html:252–256`) vises
  først når svaret er ferdig (i dag synlige fra første streaming-tegn fordi
  `answerCard.hidden = false` settes ved start, `ask-view.js:996`). Gjelder
  Kopier og Se kode; «Full output» beholder sin egen logikk (vises når kode
  har kjørt).
- **«Kjør koden på nytt» fjernes helt** — knappen, `rerunRestored`-wiring og
  historikk-visningen av den (`ask-view.js:795, 851, 1003`). Veien for gamle
  svar: «Se kode og data» → kjør i editoren.
- **«View code» → «View code and data»** (no: «Se kode og data»).
- **Typografi for `.ask-answer`** (i dag kun én h2-regel): moderat prosa-sett i
  `css/ask.css` — `line-height: 1.6`, avsnittsmarg, liste-innrykk,
  tabellkantlinjer + cellepolstring, `code`/`pre`-bakgrunn, luft rundt
  overskrifter. Mønster kan hentes fra `.ai-bubble`-settet i `app.css:987–1009`.

## 7. Tekster / i18n

- Overskrift `index.html:211`: nøkkel «Ask with data» → **«Get answers based on
  data»**, no: «Få svar basert på data».
- Editor-toppknappen (`injectTopbarSwitch`, `ask-view.js:581–592`): «Ask mode»
  → i18n-nøkkel **«Back to Ask»**, no: «Gå tilbake til Ask». Title-teksten
  i18n-ifiseres samtidig.
- Alle nye/endrede nøkler legges inn i alle 13 språkfiler under `js/i18n/` og i
  `tools/ask_i18n_keys.json`. NB: `lang='no'` faller aldri tilbake til `en` —
  manglende nøkkel vises som engelsk nøkkeltekst.

## 8. Plotly — slutt på label-overlapp

1. **Delt helper** (`index.html:6343–6398`): erstatt flat
   `Object.assign(baseLayout, spec.layout)` med deep-merge per seksjon
   (`margin`, `xaxis`, `yaxis`, `legend`, `title`), og sett
   `automargin: true` som default på begge akser. Modellens egne verdier skal
   overleve uten å slette resten av seksjonen.
2. **`ui.figure`-helperen** (`js/ui.js:1882–1888`) får samme
   automargin-default så de to veiene oppfører seg likt.
3. **Prompt** (`svar-prompt.ts:775–778`): foretrekk `plotly.express`; korte
   akse-/tick-labels; legend under plottet ved mange serier.

## 9. Innstillinger — leverandør før nøkkel + egne nøkler (v1)

Ny rekkefølge i `#aiSettingsBackdrop` (`index.html:510–551`):

1. Språk
2. **AI-leverandør** (select) — flyttes øverst; feltene under er betinget:
   - Anthropic (standard) → Anthropic API-nøkkel-feltet (+ «nøkkel lagret»-
     panelet `#aiCfgByokStored`)
   - andre → URL + modell + nøkkel som i dag
3. Datakilde-nøkler (registerdrevet, `#aiCfgSourceKeys`, uendret mekanikk)
4. **Egne nøkler (NY, v1):** liste + «Legg til egen nøkkel»-skjema med
   *Tjeneste/navn*, *Nøkkel*, *Notat (valgfritt — fritekst og/eller URL om
   hvordan nøkkelen brukes)*.

Egne nøkler v1-mekanikk:

- Metadata (navn + notat, ikke hemmelig) i localStorage `md_user_keys`
  (JSON-liste `{id, navn, notat}` med id-prefiks `usr-` for å unngå kollisjon
  med registerens nøkkel-id-er). Selve nøkkelen i nøkkellageret
  (`window.Keys`, id = samme `usr-…`).
- **Prompt:** payload får `user_keys: [{navn, notat}]` (aldri nøkkelen);
  serveren rendrer en blokk «Brukerens egne API-nøkler» med navn + notat og
  instruks om at nøkkelen er tilgjengelig i generert Python-kode som
  `KEYS['<navn>']`.
- **Kjøring:** en `KEYS`-ordbok injiseres i Python-miljøet rett før generert
  kode kjøres i ask-flyten (v1: kun Python/Pyodide-veien).
- **Dokumentert begrensning:** tjenester uten CORS-åpent API kan ikke nås
  direkte fra nettleseren; server-proxy for egne nøkler er v2.

## 10. Bevisst utelatt

- Ingen migrering/bakoverkompat (ingen brukere).
- Ingen openstat-synk — hele ask-laget er askstat-eksklusivt.
- Server-proxy for egne nøkler (v2), R/DuckDB-støtte for `KEYS` (v2).
- Ingen endring i hvilke kilder som er på som default — rutingsregelen (§4)
  håndterer mikro/makro-skjevheten.

## Verifisering

- Manuell smoke lokalt (dev-porter 8899/3998; NB Chrome-cache av `js/` og
  netlify dev-cache av edge-moduler — hard reload + restart før evaluering):
  kilde-dialogens faner/filter/lag ny/import, instruksjons-modalen, sidemeny-
  rekkefølge, knappe-visning etter ferdig svar, editor-returknapp, ny
  overskrift, innstillingsrekkefølge, egen nøkkel ende-til-ende (legg inn
  dummy → se at prompten får navn+notat og koden får `KEYS`).
- Plotly: ett spørsmål som gir figur med lange aksetitler — verifiser at
  labels ikke overlapper og at modell-satte marger overlever.
- Kjør eksisterende driftslint/tester (`tools/`, `tests/`) — særlig
  i18n-nøkkelsjekken og packs-drift-linten.
