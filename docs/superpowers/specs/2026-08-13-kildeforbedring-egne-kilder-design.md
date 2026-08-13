# Design: Forslagsbasert forbedring av egendefinerte kildebeskrivelser

Dato: 2026-08-13. Status: utkast til Hans' review.

Frittstående forløper til forbedringssløyfa i kildedokument-designet
(2026-08-09 §9, der plassert i v4 som `propose_source_update`-verktøy i selve
svar-løkka). Denne runden er bevisst enklere: **knappeutløst etter ferdig
svar, kun egne kilder** (`user:`-oppføringer i Profiles-lageret) — men §8
utvider rekkevidden til innebygde kilder via egne kopier. Ingen
avhengighet til kildedokument-v1b — modellen redigerer rå markdown-tekst
direkte, så serializer-quoting-blokkeren berøres ikke. Diff-visningen og
akseptflyten bygges som egen modul slik at forslags-kortene (§9 v3/v4) kan
gjenbruke dem senere.

## Mål

Når et ask-svar krevde omveier (feilede kjøringer, forkastede resonneringstrinn)
og en egendefinert kilde var aktiv, skal brukeren med ett klikk kunne få et
KI-forslag til revidert kildebeskrivelse — basert på hele forsøksloggen — og
akseptere eller forkaste det, eventuelt med flere tilbakemeldingsrunder.
Lærdommen fra omveien («denne kilden krever parameter X», «bruk endepunkt Y,
ikke Z») skal kunne lande varig i beskrivelsen i stedet for å dø med samtalen.

## 1. Utløser og UI-inngang

- **Fangst ved flytstart** (`runAskFlow` i `js/ask-view.js`, ved siden av
  `activeProfile`): `aktiveEgneKilder` = `user:`-id-ene i
  `Packs.effectiveIds()` med navn+tekst fra `Profiles.get` — payload-sannheten
  for hva modellen faktisk så.
- **Signaler samles i eksisterende handlers:** `feilRuns` (finnes),
  `lastOkScript` (finnes), `lastSources` (finnes), pluss to nye billige:
  `prosesslinjer` (tekst-array append i `onProgress`/`onTurnDiscard` — IKKE
  DOM-skraping) og `kastedeTurer` (teller i `onTurnDiscard`).
- **Vilkår for å vise knappen:** `aktiveEgneKilder.length ≥ 1` OG
  (`feilRuns.length ≥ 1` ELLER `kastedeTurer ≥ 1`). Det dekker begge
  tilfellene Hans beskrev: harde kjørefeil og «virket til slutt, men via
  omvei». Uten friksjon vises ingenting (ingen evidens → ingen knapp).
- **Knappen:** «✎ Forbedre kildebeskrivelsen» i `#askAnswerActions`-raden
  (svar-knapper først ved ferdig svar — dagens konvensjon). Vises i alle
  badge-grener der kode kjørte (`ok`, `feilet-etter-suksess`, `feilet`).
  Klikk åpner forslags-modalen og fyrer FØRSTE kall til endepunktet.
- **Aldri automatisk kall** (overraskelsesprinsippet + BYOK-kostnad):
  KI-kallet skjer først ved klikk. Telemetri-valget `md_telemetri_av`
  gjelder IKKE her — dette er en eksplisitt brukerhandling, samme regel som
  probe-knappen i 2026-08-09 §10.

## 2. Grunnlaget («loggen») — avveiningen

Tre kandidater ble vurdert for hva sløyfa skal ta vare på:

| | A: Kun denne kjøringen (in-memory) | B: + device-lokal logg per kilde | C: + synket logg (userdoc) |
|---|---|---|---|
| Implementasjon | ~0 — alt finnes i `runAskFlow`-closuren | Ny lagringsnøkkel, caps, invalidering | + synk-skjema, størrelsesbudsjett i kontodoc |
| Dekker | Omveien som nettopp skjedde | Mønstre på tvers av kjøringer, «forbedre senere» | Samme, på tvers av enheter |
| Kostnad | Forslaget må tas med en gang | Scrub-ved-lagring-plikt, stale etter aksept | + Anvil-payloadvekst, merge-regler |

**Valg: A.** Utløseren fyrer nøyaktig når evidensen er komplett og fersk i
minnet; én kjørings omvei er nesten alltid nok til å formulere quirken
(«differansen mellom det som feilet og det som virket ER quirken», §9).
B/C gir marginal gevinst mot reell kompleksitet (persistert scripttekst =
persistert lekkasjeflate som må scrubbes ved skriving og tømmes ved aksept).
B står på v2-lista hvis praksis viser at folk lukker modalen og angrer.

**Payloaden** (bygges av ren, testbar funksjon i ny `js/kilde-forslag.js`):

```
{
  docs: [{id, name, text}],          // aktive egne kilder, tekst ≤ 40 000 tegn (dagens clamp)
  question, tolkning, mode, depth,   // som i feilrapporten
  runs: [{script, error}],           // feilRuns; script ≤ 20 000, error ≤ 4 000 tegn (telemetri-caps)
  ok_script,                         // lastOkScript eller null — sterkeste evidens for omveien
  trace: [".."],                     // prosesslinjer, samlet ≤ 4 000 tegn
  sources: [".."],                   // lastSources (URL-er), ≤ 60
  history: [{forslag_raatekst, tilbakemelding}],  // flerrunde (§4), tom første kall
  ui_lang, provider
}
```

Størrelsesbudsjett som telemetrien: 200 000 bytes for HELE payloaden
(UTF-8-bytetelling, ikke `.length` — æøå-lærdommen fra `feil-telemetri.js`).
Krymperekkefølge: dropp ELDSTE runs først, deretter klipp `trace` — `docs`
klippes aldri utover dagens 40 000-clamp (de er selve poenget). Serverens
`maxBodyBytes` settes til 250 000 (budsjettet med margin).

**Scrubbing er obligatorisk og gjenbrukt, ikke nyskrevet:** `script`/`ok_script`
gjennom `DataDirectives.scrubKeys`, `error`/`trace` gjennom `maskerNokler`
(eksporteres fra `FeilTelemetri` i stedet for å dupliseres). Dette er en NY
utgående vei for scripttekst — samme regel som de fem tettede lekkasjeveiene
fra kilderunden. Drift-test (§7) låser at byggefunksjonen faktisk kaller dem.

## 3. Endepunktet: `netlify/edge-functions/kilde-forslag.ts`

Mønster: `dm-vurder.ts` — single-shot, ingen verktøy, `gate(request,
{endpoint: 'kilde-forslag', maxBodyBytes, allowByok: true})`, BYOK via
`extractByokKey`, strøm via `streamAnthropic`. Prompt-tekstens fasit i
`prompts/kilde-forslag.md`, inlinet som TS-konstant (Deno bundler ikke .md —
dm-vurder-konvensjonen).

**Meldingsbygging:** første user-melding = payload-prompten; deretter per
historikkrunde `assistant: forslag_raatekst` + `user: tilbakemelding`.
Serveren er tilstandsløs — klienten eier hele runden.

**Promptens kjerneinstrukser:**

- Endre BARE det evidensen bærer; behold brukerens struktur, språk og
  front matter urørt med mindre feilen beviselig sitter der (f.eks. feil
  base-URL). Foretrekk å *erstatte* utdaterte linjer fremfor å legge til
  (mot notat-oppblåsing — §9-regelen).
- Returner FULL revidert tekst per kilde som trenger endring — aldri patch.
  (Valg: patch-formater er skjøre å applisere; tekstene er ≤ 40 000 tegn og
  diffen regnes klientside. Seksjonsvise patcher er en v2-mulighet hvis
  store dokumenter gjør full-tekst-retur dyr.)
- Ærlig tomt svar er gyldig: feilen kan ligge i modellens kodevaner eller i
  en innebygd kilde — da skal `forslag` være tom og `melding` si hvorfor.
  ALDRI dikte en endring for å ha noe å levere (E17-klassen).
- Svar på `ui_lang`; kildeTEKSTENS språk følger dokumentet, ikke UI-et.

**Svarkontrakt** (fenced JSON sist i strømmen; klient parser akkumulert
tekst à la `parseAskRoute`, med rå-tekst-fallback ved parsefeil):

```json
{
  "forslag": [{"id": "user:abc", "ny_tekst": "...", "begrunnelse": "..."}],
  "melding": "kort oppsummering / hvorfor ingen endring"
}
```

`max_tokens` rause nok til full retur av et stort dokument (16 000).

## 4. Forslags-modalen og flerrunde-sløyfa

Ny modul `js/kilde-forslag.js` (payloadbygger + parser + diff + modal) —
modal-mønster og stil fra `sources-modal.js` (NB modal-z-index-fella).

- **Per foreslått kilde:** navn, **linjediff** gammel→ny (liten ren
  LCS-linjediff i modulen, ingen ekstern avhengighet; slettede linjer rødt,
  nye grønt, uendret kontekst nedtonet), `begrunnelse`-avsnitt, knappene
  **[Bruk] [Forkast]**.
- **Bruk** → `Profiles.update(id.slice(5), {text: ny_tekst})` — dagens clamp
  (40 000 tegn) og kontosynk gjør resten; kvitteringslinje «Oppdatert —
  gjelder neste spørsmål». Aksept av én kilde lukker ikke de andre.
- **Manuell finpuss** skjer i den eksisterende kilde-editoren (lenke
  «Rediger selv» per kort) — modalen dupliserer ikke editoren.
- **Flerrunde (MED i v1 — evaluert: nesten gratis):** tekstfelt
  «Tilbakemelding» + knapp «Ny runde» nederst. Klienten legger
  {forslag_raatekst, tilbakemelding} til `history` og re-POSTer hele
  payloaden; ny respons erstatter kortene. Løper til brukeren trykker Bruk
  eller Lukk. Kostnaden er et tekstfelt, en knapp og en array — serveren er
  uansett tilstandsløs. Hver runde er et nytt BYOK-kall; rundeteller vises
  («runde 2») så kostnaden er synlig. `docs` re-leses fra Profiles-lageret
  ved hver runde — etter en delvis aksept skal modellen se den OPPDATERTE
  teksten, ikke utgangspunktet.
- **Avbryt/Lukk** forkaster alt uten spor (jf. valg A i §2 — ingen
  persistert kø i denne runden).
- Abort-håndtering som ellers i ask-flyten (`AbortController`, Lukk under
  strømming = abort).

## 5. Sikkerhet og personvern

- All utgående script-/feiltekst scrubbes (§2). Drift-test låser veien.
- `gate` + BYOK som øvrige endepunkter; BYOK slipper forbi adminGate som
  vanlig.
- Ingenting sendes til Anvil/telemetri fra denne flyten; eneste mottaker er
  brukerens egen KI-leverandør, utløst av eksplisitt klikk.
- Aksept skriver KUN til brukerens eget Profiles-lager (aldri innebygde
  kilder, aldri repo, aldri delte pakker).

## 6. i18n

Nye nøkler (knapp, modaltitler, Bruk/Forkast/Ny runde/Lukk, kvittering,
rundeteller, feiltekster) i alle 13 språkfiler + `tools/ask_i18n_keys.json`;
regenerert fasit. Husk: `lang='no'` faller aldri tilbake til `en`, og
data-i18n overskriver child-spans (teller-span-fella) — rundetelleren legges
derfor UTENFOR data-i18n-noden.

## 7. Testing og verifisering

- `tests/js/kilde-forslag.test.js` (node --test, husk glob-quoting
  `'tests/js/*.test.js'`), rene funksjoner med injiserte deps:
  - payloadbygger: caps per felt, dropp-eldste-runs under bytebudsjett
    (UTF-8-bytes), scrub-funksjonene faktisk kalt (spion-deps),
    `history`-oppbygging over runder.
  - svarparser: gyldig fenced JSON, JSON med manglende felt, ren
    tekst-fallback, tomt `forslag`.
  - linjediff: innsetting/sletting/erstatning/identisk/tomt dokument.
  - akseptflyt: `Profiles.update` kalles med riktig id og tekst (mock).
- Drift-test à la KEYS-regex-drifttesten: byggefunksjonen bruker
  `FeilTelemetri.maskerNokler`/`DataDirectives.scrubKeys` — feiler hvis noen
  senere «rydder bort» scrubben.
- Prompt-drift: `prompts/kilde-forslag.md` ↔ TS-konstanten (samme lint som
  søsterpromptene).
- **Manuell smoke (Hans):** still et spørsmål mot en egen kilde med bevisst
  mangelfull beskrivelse (f.eks. utelatt påkrevd parameter) → svar med
  reparasjonsrunde → knapp synlig → forslag nevner parameteren → gi
  tilbakemelding, ny runde → Bruk → still spørsmålet igjen → færre/ingen
  reparasjonsrunder. For §8: lag kopi av en innebygd kilde (f.eks. ssb),
  verifiser at guiden IKKE lenger følger første verktøysvar (Details-sporet)
  mens `ssb.read`/search_catalog fortsatt virker, og at forbedringssløyfa
  tilbys på kopien. NB dev-fellene: Chrome cacher `js/` (hard reload),
  netlify dev cacher edge-moduler (restart + 400-smoke), porter 8899/3998.

## 8. Tillegg: egne kopier av innebygde kilder

Vurdert på Hans' forespørsel (2026-08-13): *mulig, nyttig og enkelt* — med
ÉN avgjørende presisering om fortrengningen.

**Fella i den naive formen.** «Kopier + skru av den innebygde» virker
opplagt, men `sources_off` filtrerer registeret på ETT chokepoint i `svar.ts`
(linje ~216) som bevisst dekker BÅDE promptblokka OG hele verktøy-dispatchen
— å skru av `ssb` dreper `search_catalog`/`table_metadata`/probe og dermed
modellens evne til å finne tabell-id-er, selv om `ssb.read(...)` i selve
scriptet fortsatt kjører klientside. Kopien må derfor fortrenge
**dokumentteksten, ikke registeroppføringen**.

**Design: kopi + guide-fortrengning.**

- **«Lag egen kopi»** på innebygde enkeltkilder i kilde-modalen: henter
  `/data/sources/<id>.md` (statisk fasit; 404 → fall tilbake til
  registerbeskrivelsen som starttekst), oppretter Profiles-kilde via samme
  vei som `importPack` med navn «<navn> (min kopi)» og
  `origin: {source: 'builtin-copy', of: '<id>'}`, og velger den. For
  community-src-pakker FINNES kopimekanismen allerede (import = egen kopi);
  knappen gjenbruker den veien.
- **Fortrengning (kun prosa):** nytt body-felt `guides_off: string[]` —
  klienten samler `origin.of` fra AKTIVE builtin-kopier (samme payload-søm
  som `sources_off` i `ai-chat.js:716`), serveren coercer det (speil av
  `coerceSourcesOff`) og gir settet til `makeGuideAttacher`
  (`_lib/source-guides.ts`), som hopper over de id-ene. Registerlinja
  («Kort» — maskingenerert fakta) og alle adapterverktøy står urørt;
  kopien flyter som vanlig brukerpakke og overtar guiderollen. Én Set-sjekk
  i attacheren — `medGuideVedFeil`-veien arver den automatisk.
- **Eksklusiviteten** gjelder altså prosaen — det er den modellen skal ha én
  versjon av. For adapterløse rene URL-kilder virker «helt av + kopi alene»
  allerede i dag via `sources_off`; ingen ny kode.
- **Sløyfa i §1–4 virker uendret på kopier** (de er ordinære
  `user:`-kilder) — det er hele poenget: forbedringsløkka dekker dermed
  også innebygde kilder, lokalt.
- **«Oppdater fra original»**-knapp på kopier (`origin.of` finnes): re-fetch
  + overskriv kopiteksten etter bekreftelse — billigste drift-mottiltak.
- **Ærlig begrensning:** kopien fryser mens originalen utvikler seg via
  deploys, og lokale forbedringer når aldri andre brukere. Ekte overlegg med
  hash-hint og GitHub-tilbakestilling (kildedokument-specen v1b) og
  repo-løypa (§9 v3/v4) er de varige svarene; kopier er den pragmatiske
  broen som ikke venter på serializer-quoting-fiksen. Ved overlegg-lansering
  kan kopier stå igjen som de er (de er bare egne kilder).

Merkostnad: ~½–1 økt (knapp + fetch + origin-felt; coerce + Set-sjekk
server-side; tester).

## 9. Filer som endres

| Fil | Endring |
|---|---|
| `js/kilde-forslag.js` | NY: payloadbygger, parser, linjediff, modal, flerrunde |
| `js/ask-view.js` | fange `aktiveEgneKilder`/`prosesslinjer`/`kastedeTurer`; knapp i actionsRow |
| `js/feil-telemetri.js` | eksportere `maskerNokler` (gjenbruk, ikke duplikat) |
| `js/sources-modal.js` | §8: «Lag egen kopi» + «Oppdater fra original» |
| `js/packs.js`/`js/profiles.js` | §8: kopi-opprettelse (importPack-veien) m/`origin.of` |
| `js/ai-chat.js` | §8: `guides_off` i payloaden (ved `sources_off`-sømmen, :716) |
| `netlify/edge-functions/kilde-forslag.ts` | NY: gate+BYOK, meldingsbygging, streamAnthropic |
| `netlify/edge-functions/prompts/kilde-forslag.md` | NY: prompt-fasit |
| `netlify/edge-functions/svar.ts` + `_lib/source-guides.ts` | §8: coerce `guides_off` + skip-sett i attacheren |
| `index.html` | modal-markup + script-tag |
| `js/i18n/*` + `tools/ask_i18n_keys.json` | nye nøkler + fasit |
| `tests/js/kilde-forslag.test.js` | NY |
| `_lib/source-guides.test.ts` | §8: attacher hopper over guides_off-id-er |

Estimat: én fokusert økt for motor+endepunkt+tester, én for modal+i18n+smoke,
pluss ~½–1 økt for kopi-tillegget (§8).

## Bevisst utelatt (og hvor det bor)

- **Persistert forsøkslogg per kilde (B/C i §2)** — v2 ved målt behov.
- **Direkte redigering av innebygde kilder** — lokalt dekkes de nå av
  kopi-veien (§8); DELT forbedring av dem hører fortsatt hjemme i repoet via
  telemetri→admin-løypa og forslags-kort/PR-kanalen (2026-08-09 §9 v3/v4),
  der serializer-quoting-avhengigheten ligger.
- **`propose_source_update` som verktøy i svar-løkka** — §9 v4; denne rundens
  modal/diff/aksept-modul er designet for gjenbruk derfra.
- **Auto-forslag uten klikk, delt forslags-kø, PR-kanal** — som i
  2026-08-09-specen.
- **Seksjonsvise patcher i svarkontrakten** — kun hvis full-tekst-retur viser
  seg dyr i praksis.
- **openstat-port** — askstat-først, som resten av kildesystemet.
