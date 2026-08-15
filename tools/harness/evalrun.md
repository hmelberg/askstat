# Eval-prosedyren (flyt-evalueren)

Kildeharnessens andre halvdel (spec `docs/superpowers/specs/2026-08-15-kildeharness-design.md`
§2 «Flyt-evalueren» + §4 «Forbedringssløyfa»). Kjører spørsmål fra
`tools/harness/sporsmal.json` gjennom den EKTE ask-løkka (ekte klient, ekte
pyodide, ekte skinner — ingen mocking) og måler hvordan den presterer.

Denne fila er en KOMPLETT, kald-kjørbar prosedyre: en kontrollør uten annen
kontekst enn denne fila + `sporsmal.json` skal kunne gjennomføre en runde fra
start til ferdig rapport. Ingenting under er «se annet dokument uten
konkret sti» — alle kommandoer står utskrevet.

Koster Claude-penger (ekte BYOK-kall via `/api/svar`) — se §5 Budsjettregler
FØR du starter noe. Kildeutforskeren (`tools/harness/utforsk.py`) er den
GRATIS halvdelen av harnessen og en helt annen prosedyre enn denne.

---

## 1. Forutsetninger

Sjekk ALLE punktene under, i rekkefølge, før du sender ett eneste spørsmål.

### 1.1 Kjør fra riktig repo-rot

Alle kommandoer i denne fila forutsetter at gjeldende mappe er repo-roten
(samme mappe som `netlify.toml` og `openstat.py` ligger i). Sjekk:

```bash
test -f netlify.toml && test -f openstat.py && echo "riktig mappe" || echo "FEIL MAPPE — cd til repo-roten først"
```

### 1.2 `.env` med nøkkelen

Denne prosedyren bruker **BYOK** (bring your own key) nøyaktig slik appen
selv gjør det for vanlige brukere — nøkkelen legges i nettleserens
`localStorage` (`md_keys`), ALDRI i en server-header eller i et Claude
Code-verktøykall.

- Sjekk at `.env` finnes i repo-roten: `test -f .env && echo ok || echo "MANGLER"`.
  Git-worktrees deler IKKE gitignorerte filer (`.env` er gitignoret) — hvis
  denne prosedyren kjøres i en worktree og `.env` mangler der, kopiér den inn
  fra hovedarbeidstreet (f.eks. `cp /Users/hom/Documents/GitHub/askstat/.env .env`
  — bytt ut stien med din faktiske hovedrepo-rot om den er en annen).
- `ANTHROPIC_API_KEY` i `.env` er valgfri på SERVER-siden (se `.env.example`
  — edge-funksjonen `/api/svar` godtar allerede den som ringer sin egen
  nøkkel via BYOK), men er kilden denne PROSEDYREN leser verdien fra for å
  legge den inn i nettleseren (§2.2). Er den ikke satt: sett den nå, eller
  bruk en nøkkel Hans allerede har lagt inn manuelt i den nettleserøkta
  harnessen skal gjenbruke (§2.2 punkt A).
- **Nøkkelregel (hardt krav, hele denne prosedyren):** den rå nøkkelverdien
  skal ALDRI stå i noe Bash-kommandoutdata, noe `browser_evaluate`-JS-streng
  du selv komponerer, noen rapport, eller noe annet sted som havner i
  kontrollørens (din egen) kontekst eller i en committet fil. `cat .env`,
  `grep ANTHROPIC .env` eller lignende er FORBUDT i denne prosedyren — se
  §2.2 for den trygge injeksjonsveien.

### 1.3 Start `netlify dev` fra repo-roten

```bash
netlify dev
```

- Kjøres i bakgrunnen (egen terminal/prosess) — denne prosedyren refererer
  til den som «dev-serveren» resten av veien.
- **Dev-portene for askstat er 8899 (app) / 3998 (statisk server)** —
  satt eksplisitt i `netlify.toml` sitt `[dev]`-avsnitt (`port = 8899`,
  `staticServerPort = 3998`), nettopp for at askstat og openstat skal kunne
  kjøre `netlify dev` samtidig på samme maskin uten portkollisjon (openstat
  bruker standardportene 8888/3999). Vent til loggen viser:
  ```
  Local dev server ready: http://localhost:8899
  ```
  Se bort fra advarselen «Unable to determine public folder … Setup a
  netlify.toml file with a [dev] section» rett over den linja — den er
  godartet støy fra CLI-en (den finner porten fra `[dev]` uansett).
- Verifisert: en fersk `netlify dev`-kjøring i dette repoet 2026-08-15 startet
  ren på `http://localhost:8899` med alle ti edge-funksjonene lastet
  (`ask-ruter, dm-vurder, hent, kilde-forslag, kilde-pr, kode-svar-v2,
  kode-svar, metadata, svar, tolk-resultat`) uten at lokal `.env` var
  til stede i worktreen (miljøvariabler for de andre kildenøklene kom fra
  det lenkede Netlify-prosjektet) — `ANTHROPIC_API_KEY` er IKKE blant de
  server-injiserte variablene, som forventet (BYOK er klient-siden).

### 1.4 De MÅLTE fellene (verifisert på nytt 2026-08-15 i denne worktreen)

Disse tre er dokumentert flere steder i repoets historikk (bl.a.
`docs/superpowers/specs/2026-08-13-kildeforbedring-egne-kilder-design.md`,
`docs/superpowers/specs/2026-08-09-kildedokumenter-design.md`) og gjentas
her ORDRETT fra spec/brief, PLUSS den konkrete, live-verifiserte kommandoen
for hver (porten er rettet fra openstat sin 8888 til askstats faktiske 8899,
se §1.3 — resten av teksten er uendret):

**a) `netlify dev` cacher edge-TS-moduler → restart + 400-smoke
(`curl -s -o /dev/null -w "%{http_code}" localhost:8888/api/svar` forventer
400/405, aldri 500) før eval.**

Live-verifisert smoke-sekvens (kjør ALLE tre etter hver `netlify dev`-restart,
FØR du åpner nettleseren):

```bash
# 1) Bar GET, ingen headere — svarer 401 "Unauthorized: missing token"
#    (adminGate krever enten en admin-Bearer-token ELLER en BYOK-header
#    før den i det hele tatt ser på metode/JSON — dette er IKKE 500, så
#    modulen har lastet). Verifisert live 2026-08-15.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/api/svar
# forventet: 401

# 2) GET + en (ekte eller falsk) BYOK-header — svarer 405 "Method not
#    allowed" (metode-sjekken kjører nå den har passert token-sjekken).
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Anthropic-Key: sk-ant-smoketest" \
  http://localhost:8899/api/svar
# forventet: 405

# 3) POST + BYOK-header + tom JSON-kropp — DETTE er linja som gir 400,
#    presist som fellen opprinnelig beskriver den ("Missing question").
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "X-Anthropic-Key: sk-ant-smoketest" -H "Content-Type: application/json" \
  --data '{}' http://localhost:8899/api/svar
# forventet: 400
```

Får du 500 på NOEN av de tre → stopp: `netlify dev` har en stale-cachet
edge-modul. Drep prosessen (`Ctrl-C` eller `pkill -f "netlify dev"`) og
start `netlify dev` på nytt, kjør smoken igjen. Ikke fortsett til eval før
alle tre gir de forventede kodene.

**b) Chrome HTTP-cacher `js/` → hard reload m/ignoreCache.**

Rammer deg KUN hvis noen `.js`-fil i `js/` ble redigert kort tid før denne
eval-runden (de fleste filene der har IKKE et `?v=`-cache-bust-suffiks i
`index.html`s `<script src>`, i motsetning til CSS-en — se `index.html`
rundt linje 880). Manuell kjøring: DevTools åpen → Network-fane → huk av
«Disable cache» (gjelder så lenge DevTools-panelet er åpent), ELLER
Cmd+Shift+R. Automatisert (MCP Playwright, §2.2): siden hver ny
browser-økt starter med tom cache, unngår du dette AUTOMATISK så lenge du
alltid navigerer FØRST etter en `netlify dev`-restart og ALDRI gjenbruker
en fane som var åpen FØR en `js/`-redigering — merker du symptomer som ikke
matcher gjeldende kode uansett (gammel feiltekst, en knapp som mangler),
lukk fanen (`browser_close`) og naviger helt på nytt.

**c) Hans' Firefox blokkerer localhost-cross-origin (bruk Chromium).**

Kjør ALDRI denne prosedyren i Firefox. MCP Playwright-verktøyet
(`mcp__plugin_playwright_playwright__*`) bruker Chromium som standard — det
er riktig valg og krever ingen ekstra flagg. Manuell kjøring: bruk et
Chrome/Chromium-vindu, ikke Firefox.

### 1.5 Fersk nettleserøkt (unngå gammel filter-tilstand)

Kjent felle utenfor denne fellelisten men verdt å nevne (jf. memory-notatet
«askstat-debug brukertilstand» — Oslo-rundene 8–10 ble maskert nettopp av
dette): en gjenbrukt nettleserprofil kan ha `sources_off` (kilder skrudd
av) eller et landvalg satt fra en TIDLIGERE økt, som stille endrer hvilke
kilder modellen ser. Bruk alltid en FERSK nettleserkontekst for en
eval-runde (en helt ny `browser_navigate` i en ny MCP-økt gir dette gratis
— ingen `localStorage` fra før). Skal du gjenbruke en økt med en allerede
lagret nøkkel (§2.2 punkt A), sjekk tilstanden via **API-et, ikke rå
`localStorage`-nøkler** — lagringen bor i `js/profiles.js` under ÉN
JSON-nøkkel (`md_profiles`), IKKE under separate nøkler kalt `sources_off`/
`doc_country` (de nøklene finnes ikke — et forsøk på å lese dem gir alltid
`null`/`null`, som ser ut som en «ren» tilstand uansett hva som faktisk er
lagret, og sikkerhetsnettet blir dermed virkningsløst uten at det synes):

```js
() => ({ sources_off: window.Profiles.sourcesOff(), country: window.Profiles.countryState() })
```
(kjøres som `browser_evaluate`) — en REN tilstand er
`sources_off: []` (tom liste) og `country: {mode: "auto"}`. Verifisert live
2026-08-15: en fersk profil gir nøyaktig dette; `toggleSourceOff('dbnomics')`
+ `setCountry('cc','DE')` endrer dem synlig til
`["dbnomics"]`/`{mode:"cc",cc:"DE",...}`, og API-et fanger begge endringene
umiddelbart (i motsetning til de gamle, ikke-eksisterende nøklene).

**Er tilstanden IKKE ren** (`sources_off.length > 0` eller
`country.mode !== "auto"`) har du to valg — velg FØR du sender noe
spørsmål: (a) **rydd opp** hvis avviket ikke er tilsiktet:
`window.Profiles.setCountry('auto')` og
`window.Profiles.sourcesOff().forEach(id => window.Profiles.toggleSourceOff(id))`
(sistnevnte fordi `toggleSourceOff` er en av/på-veksling, ikke en direkte
setter — kjør den én gang per id som står i lista); eller (b) **dokumentér
tilstanden i rapporten** (§4, i en egen linje eller i Hovedfunn) FØR du
kjører, hvis du bevisst tester atferd under en satt filtrering — en eval-
runde med ukjent/urapportert filtreringstilstand er ikke pålitelig og skal
ikke telle som en ordinær runde mot budsjettet i §5.

---

## 2. Kjøring per spørsmål

Gjenta dette avsnittet for HVERT spørsmål i runden (§5 for hvor mange).

### 2.1 Åpne appen

Ask er default-visningen (`index.html` setter `ask-view`-klassen med mindre
`?view=editor` står i URL-en) — naviger rett til roten:

```
http://localhost:8899/
```

MCP: `mcp__plugin_playwright_playwright__browser_navigate` med
`url: "http://localhost:8899/"`. Verifisert live 2026-08-15: siden laster
med spørsmålsfeltet fokusert og «Ask»-knappen synlig; eneste konsollfeil er
en godartet `favicon.ico 404` (ignorér).

### 2.2 Legg inn BYOK-nøkkelen (kun første gang i økta)

Nøkkelen lagres i `localStorage` under nøkkelen `md_keys`
(`js/keys.js`, API-et `window.Keys`). Sjekk FØRST om den alt er der —
`window.mdAiHasKey()` — før du gjør noe:

```js
() => (window.mdAiHasKey && window.mdAiHasKey()) || false
```

- **Er den `true`:** hopp over resten av dette avsnittet, gå til §2.3.
- **Er den `false`:** velg ÉN av de to veiene under. Prioritér A.

**A) Foretrukket — gjenbruk en allerede-satt nøkkel.** Be Hans (eller en
tidligere økt) legge inn nøkkelen ÉN gang manuelt via appens eget UI
(«API key & settings»-knappen i ask-sidepanelet → lim inn Anthropic-nøkkel
→ lagre). Den ligger deretter i `localStorage` for `http://localhost:8899`
og overlever både sideoppdateringer og nye `netlify dev`-restarter (den er
klient-side, ikke server-side) SÅ LENGE samme nettleserprofil/brukerdata-
katalog gjenbrukes. Kontrolløren trenger ALDRI å se selve verdien — kun
sjekke `mdAiHasKey()` som over. **Mangler en slik forhåndssatt nøkkel og
ingen menneske er tilgjengelig til å sette den: STOPP og spør Hans** —
ikke gå videre til B uten videre, B har en reell (om enn liten og
selvvalgt) eksponeringskostnad.

**B) Aksepert unntak — automatisert engangsinjeksjon.** Kun når A ikke er
mulig OG du/Hans eksplisitt aksepterer at nøkkelen da havner i ett
`browser_evaluate`-kall (som IGJEN blir en del av kontrollørens
verktøykall-historikk — dette er den kjente avveiningen, ikke en skjult
lekkasje). Injiser via `window.Keys.set`, samme API app-UI-et selv bruker:

```js
(k) => { window.Keys.set('anthropic', k); return (window.mdAiHasKey && window.mdAiHasKey()) || false; }
```
kjørt med den faktiske nøkkelverdien satt inn i `k` sitt sted i selve
JS-strengen (verktøyet har ikke et eget parameter-felt for verdien — den må
stå i `function`-teksten). Bekreft at kallet returnerer `true`. Fjern den
igjen ved øktslutt hvis dette er en delt/langlevd profil:
`window.Keys.remove('anthropic')`.
Verifisert live 2026-08-15: `Keys.set('anthropic', <verdi>)` →
`mdAiHasKey()` blir `true`; `Keys.remove('anthropic')` → `false` igjen.

### 2.3 Send spørsmålet

1. Hent spørsmålsteksten fra `sporsmal.json` (feltet `sporsmal`, IKKE `id`).
2. Skriv den inn i feltet: `browser_type` med
   `target`/`element`: tekstboksen med tilgjengelighetsnavn
   «What do you want to find out?» (`textarea#askInput`), `text`: hele
   spørsmålsteksten, `submit: false`.
3. Klikk «Ask»-knappen (`button#askSendBtn`, tilgjengelighetsnavn «Ask»):
   `browser_click` på samme element.
4. **Noter starttidspunktet** for tid-målingen (§3): `date +%s` i en
   Bash-kommando rett før klikket, eller enklere — la MCP-verktøykallets
   egen tidsstempel i transkriptet være tidsreferansen; skriv ned
   klokkeslettet i egne notater før du går videre.

### 2.4 Vent på ferdig svar-kort (maks 5 min)

Fullført svar = `#askAnswerActions` (raden med «Copy answer» osv.) går fra
`hidden` til synlig — det skjer KUN når `showAnswer()` kalles, altså når
svaret faktisk er ferdig (aldri under strømming). Verifisert live
2026-08-15: elementet har `hidden` ved sideåpning; CSS-regelen
`.ask-answer-actions[hidden]{display:none}` sikrer at «Copy answer»-teksten
ikke er synlig/matchbar før da.

`browser_wait_for` sin tekst-modus har en INTERN timeout på kun 5 sekunder
(verifisert live) — for godt under 5-minutters-budsjettet. Poll derfor i en
løkke, maks 60 forsøk (60 × 5 s = 5 min):

```
gjenta inntil (maks 60 ganger):
  browser_evaluate: () => document.getElementById('askAnswerActions').hidden === false
  hvis true: FERDIG, gå til §2.5
  ellers: browser_wait_for { time: 5 }   (fast pause, ikke tekstavhengig)
```

Fortsatt `false` etter 60 forsøk → **TIMEOUT**. Noter dette som utfallet
(egen rad i feiltype-kolonnen, se §3) og gå videre til neste spørsmål — ikke
la ett fastlåst spørsmål ete resten av budsjettet.

### 2.5 Høst resultatet

Ett `browser_evaluate`-kall henter ALT du trenger til scoring, uten å
sluke hele siden inn i konteksten din:

```js
() => {
  var proc = Array.from(document.querySelectorAll('#askProcess > div')).map(function (d) { return d.textContent; });
  var live = Array.from(document.querySelectorAll('#askStatus > div')).map(function (d) { return d.textContent; });
  var badge = document.querySelector('#askAnswer .ask-badge');
  var fig = !!document.querySelector(
    '#askLiveOutput img, #askLiveOutput .js-plotly-plot, #askLiveOutput canvas, ' +
    '#askFullOutputHost img, #askFullOutputHost .js-plotly-plot, #askFullOutputHost canvas'
  );
  return {
    trace: proc.concat(live),                 // hele ⏳/📝/⚠️-sporet, i rekkefølge
    badgeText: badge ? badge.textContent : null,
    badgeWarn: badge ? badge.classList.contains('ask-badge-warn') : false,
    answer: document.getElementById('askAnswer').innerText,
    hasFigure: fig,
  };
}
```

Noter også **turer** = antall linjer i `trace` som INNEHOLDER
`▶ Kjører scriptet` (linja er alltid `⏳ ▶ Kjører scriptet …` — dette ER
run_code-rundetallet: `progressLabel()` i
`netlify/edge-functions/_lib/svar-prompt.ts` setter nøyaktig den teksten
for `run_code`-kall, og INGEN andre kall setter den samme strengen. En
`📝`-arkivert modelltekst kan i teorien inneholde tilfeldig sammenfallende
ord — usannsynlig med akkurat denne pil+ord-kombinasjonen, men stikk
innom de matchede linjene visuelt hvis tallet virker urimelig høyt) og
**tid** = sluttidspunkt (da §2.4-løkka fant `true`) minus starttidspunktet
fra §2.3.4.

**Trenger du selve den genererte koden** (kun for `vekter_i_spor` når
regexen ikke gir treff i `trace`/`answer`, se §3): klikk «View code and
data» (`button#askOpenEditorBtn`, tilgjengelighetsnavn samme tekst) — dette
bytter til editor-visningen i SAMME fane (ingen omlasting, verifisert i
`js/ask-view.js` sin `switchToEditor()` — kun en CSS-klasse/URL-parameter
endres) og setter den faktisk kjørte koden inn i editoren. Les koden der
(visuelt, eller via en `browser_snapshot`/`browser_find` på editor-området)
før du evt. går tilbake med `#askSwitchCode`-knappen (samme handling,
motsatt vei) eller «New question».

### 2.6 Klargjør neste spørsmål

Klikk «New question» (`button#askNewBtn`) for å nullstille kortet uten å
miste den innlagte BYOK-nøkkelen (den er `localStorage`, upåvirket) eller å
måtte navigere på nytt. Gjenta §2.3–2.6 for neste spørsmål.

---

## 3. Scoring mot fasit

Hvert spørsmål i `sporsmal.json` har et `fasit`-objekt med én eller flere
sjekk-typer. Kjør ALLE sjekkene som finnes for spørsmålet; et spørsmål kan
ha flere. `merknad`/`nytt_monster`-feltene er IKKE sjekker — de er kontekst
for Hovedfunn-seksjonen (§4), forklarer HVORFOR spørsmålet er med og hva
det skal avdekke.

| Sjekk-type | Felt i fasit | Mekanikk |
|---|---|---|
| `tall_i_intervall` | `{verdi, min, maks}` | Finn ETHVERT tall i `answer`-teksten (regex `/[\d][\d\s.,]*\d|\d/g`, norsk tusenskille-tolerant) som, tolket som tall, ligger i `[min, maks]`. **Splitt-presisering:** en «, »-sekvens (komma ETTERFULGT av mellomrom, som i «2020, 2024» eller en tall-liste) er ALLTID en grense mellom to separate tall, aldri en del av ett tall — splitt der FØR du tolker restene som tall, ellers leses «2020, 2024» som ett sammenhengende tall. Et komma UTEN etterfølgende mellomrom («7,9») er norsk desimaltegn og et mellomrom UTEN komma i en sifferkjede («700 000») er norsk tusenskille — begge disse blir stående som ÉN tall-streng. Minst ett treff i intervallet → bestått. `verdi`-teksten er kun en menneskelig beskrivelse av hva tallet skal representere — brukes til Hovedfunn hvis flere tall i intervallet er tvetydige, ikke i selve ja/nei-sjekken. |
| `kilde_i_spor` | regex-streng | Kjør regexen som `new RegExp(mønster, 'is')` — BEGGE flagg, ikke bare `i` — mot `trace.join("\n")` FRA §2.5. Treff → bestått. `s`-flagget (dotAll) er PÅKREVD, ikke kosmetikk: fasitmønstre som `ssb.*eurostat\|eurostat.*ssb` (inflasjon-no-euro) skal matche selv når kildene står på HVER SIN linje i sporet — uten `s` matcher `.` aldri et linjeskift, og et ekte, riktig svar der SSB og Eurostat begge brukes (bare på separate `⏳`/`📝`-linjer, som er det normale) scorer da FALSKT som FEIL. Verifisert-i-praksis av reviewer i fikserunde 1 (2026-08-15). |
| `vekter_i_spor` | regex-streng | Samme mekanikk som `kilde_i_spor` (`new RegExp(mønster, 'is')`), samme felt (`trace`). Gir INGEN treff der (sannsynlig — se §2.5-notatet: `run_code`-progresslinja viser aldri kodeinnhold): søk ETTERPÅ i `answer`-teksten (modellens metodeavsnitt nevner ofte vektvalget i prosa). Fortsatt ingen treff: åpne koden (§2.5, siste avsnitt) og søk der — FØRST da er «ikke bestått» endelig. |
| `aldri_raa_host` | liste med host-strenger | Filtrer `trace` til linjer som INNEHOLDER `Sjekker` (verktøyet `probe`) eller `▶ Kjører scriptet`/`Kjører` (verktøyet `run_code`/andre — `progressLabel()`s eksakte tekster, alltid med `⏳ `-prefiks foran i selve linja). Søk hver host-streng i DISSE linjene. Nulltreff → bestått, ingen merknad. Ett+ treff → noter linja ORDRETT i rapportens «Rå-URL-forsøk»-kolonne, og avgjør ADAPTERVEI-unntaket: appens genererte kode kaller kilder via en forhåndsbundet alias (`ssb.read(...)`, aldri en bokstavelig URL — se `openstat.py` sin `connect_alias()`, kommentert «modellen skrev eurostat.read(...) som kjørbar Python»), så en bokstavelig host-streng i sporet betyr så godt som alltid at modellen gikk UTENOM adapteren (websøk/`web_fetch`/en `probe` rett mot rå-URL). Er du i tvil om et enkelttilfelle er en dokumentert intern probe (f.eks. sdmx sin `needs_key`-probe, se `tools/harness/utkast/<kilde>.md` hvis den finnes) — noter usikkerheten i Hovedfunn i stedet for å felle en hard dom. |
| `figur` | `true`/`false` | `hasFigure` fra §2.5 sitt harvest-kall. |
| `minst_land` | tall N | Tell distinkte land nevnt i `answer` (landnavn på norsk/engelsk ELLER ISO2-kode — for nordenspørsmålene: Norge/NO, Sverige/SE, Danmark/DK, Finland/FI, Island/IS). Antall ≥ N → bestått. |
| `samme_periode` | `true` | Sjekk at periodeangivelsen (år, år-måned, kvartal) som følger hvert land-tall i `answer` er DEN SAMME på tvers av land. Rent tekstlig — heuristikk, ikke garantert presis; avvik du finner (ett land 2025, et annet 2023) er et Hovedfunn-verdig funn i seg selv (jf. baseline-rundens M-Q5-funn om nettopp dette), ikke bare en avkrysning. |

**Utfall** (baseline-vokabularet, `docs/eval/2026-08-baseline.md`):

- **PASS** — alle mekaniske sjekker for spørsmålet bestått, `badgeText`
  er `null` (ingen advarsel i det hele tatt).
- **PASS m/slitasje** — alle mekaniske sjekker bestått, MEN et av: (a)
  `badgeText` er satt med `badgeWarn: false` (svaret sier selv at en
  poleringsrunde feilet etter en vellykket kjøring — `badgeFor()` sin
  `'feilet-etter-suksess'`-gren i `js/ask-view.js`), (b) `turer` traff
  taket — **4** kjøringer, verifisert 2026-08-15 i
  `netlify/edge-functions/_lib/svar-prompt.ts` («run_code-kjøringer: begge
  dybder får samme tak (4)» — ask kjører nå alltid «deep», `askDepth()`;
  dette TALLET DRIFTER over tid (memory-loggen viser flere tidligere
  hevinger, 2→3→4) — sjekk kommentaren på linja rundt «run_code-kjøringer:»
  i den fila hvis den ikke lenger sier 4), (c) svarteksten selv sier noe i
  retning «budsjettet ble
  brukt opp» eller gir omtrentlige/hedgede tall der fasiten spør om et
  presist tall.
- **ÆRLIG FEIL** — modellen fabrikerte INGENTING, men klarte heller ikke å
  levere et sjekkbart svar: en eller flere mekaniske sjekker feiler FORDI
  svaret mangler (tomt, degradert prosa, eksplisitt «fant ikke data for
  dette»), OG/ELLER `badgeText` er satt med `badgeWarn: true`
  (`badgeFor()` sin `'feilet'`-gren) UTEN at et konkret feil TALL ble
  presentert som fasitsvar.
- **FEIL** — en mekanisk sjekk feiler PÅ NOE MODELLEN FAKTISK PÅSTÅR: et
  levert tall utenfor intervallet uten forbehold, en `aldri_raa_host`-
  overtredelse, en kilde-referanse som mangler helt der spørsmålet krever
  én, eller et «stille galt» tall (ser plausibelt ut, er det ikke — jf.
  baseline-rundens Q4-funn 2026-08-04: «10,2 % … et STILLE GALT tall ingen
  fanget» — dette er nettopp klassen `tall_i_intervall` alene ikke fanger;
  kryssjekk tallet mot kildens egen dokumenterte verdi når du er mistenksom,
  ikke bare mot intervallet).
- **TIMEOUT** — se §2.4: ingen svar-kort etter 5 minutter. Egen kategori,
  tell IKKE som noen av de fire over.

---

## 4. Rapport

Skriv `docs/eval/<dato>-harness.md` (dagens dato, `YYYY-MM-DD`, f.eks.
`docs/eval/2026-08-15-harness.md`) i SAMME tabellformat som
`docs/eval/2026-08-baseline.md`, utvidet med de to nye kolonnene fra spec §2
(«PLUSS de nye signalene»):

```markdown
# Harness-kjøring <dato> (<commit-hash for HEAD>)

Kjørt <dato> av kontrolleren (Playwright/Chromium mot lokal `netlify dev`
:8899, BYOK). Spørsmålssett: `tools/harness/sporsmal.json`.

Budsjett: kjøring <N-start>–<N-slutt> av rammen på 30 (runde <M> av maks 2
denne økten).

| # | Spørsmål (id) | Tid | Turer (run_code) | Utfall | Feiltype | ⚠️-linjer | Rå-URL-forsøk |
|---|---|---|---|---|---|---|---|
| 1 | oslo-folketall | 73 s | 2 | PASS | — | 0 | ingen |
| 2 | norden-ledighet | … | … | … | … | … | … |
…

## Hovedfunn

1. …
2. …

## Syntese (spec §4 — se §6 under for prosedyren)

- Kildebeskrivelse-utkast: …
- Logikk-/promptforslag: …
- Adapter-/kodeforslag (issue-kanal): …
```

- Raden per spørsmål er `id`-feltet fra `sporsmal.json` (ikke hele
  spørsmålsteksten — hold tabellen lesbar, den fulle teksten står i
  `sporsmal.json`).
- «⚠️-linjer» = antall linjer i `trace` (§2.5) som inneholder `⚠️`
  (tell, list ikke ut alle — men SITÉR de mest talende ORDRETT i
  Hovedfunn, samme stil som baseline-rundenes funn-punkter).
- «Rå-URL-forsøk» = antall linjer som trigget `aldri_raa_host`-treff i §3
  (0 hvis ingen `aldri_raa_host`-sjekk gjelder spørsmålet — skriv «–», ikke
  0, for spørsmål uten den sjekken).
- **Oppdater `budsjett.brukt` i `tools/harness/sporsmal.json` i SAMME
  commit** som rapporten — legg til antall spørsmål kjørt denne runden
  (IKKE antall Claude-kall internt i hvert svar; ett spørsmål = én
  budsjett-enhet, jf. `maks_per_runde: 8` sin egen enhet).

Commit (etter en fullført runde):

```bash
git add docs/eval/<dato>-harness.md tools/harness/sporsmal.json
git commit -m "harness: eval-runde <dato> — <N> spørsmål, <kort oppsummering av utfall>"
```

---

## 5. Budsjettreglene (spec §2, ordrett)

> **Budsjett (Hans' ramme: 20–30 løkke-kjøringer er OK, spør før mer):**
> én runde = spørsmålssettet én gang (6–8 kjøringer). Før/etter-måling av
> en endring = to runder (~12–16). Harde regler: aldri kjør uten
> eksplisitt bestilling; maks 2 runder per økt uten ny bekreftelse fra
> Hans; løpende teller i rapporten («kjøring 14 av rammen på 30»).

Operasjonalisert mot `sporsmal.json` sitt `budsjett`-objekt
(`{ramme_totalt: 30, brukt: <N>, maks_per_runde: 8, maks_runder_per_okt: 2}`):

1. **Sjekk `budsjett.brukt` FØR du sender ETT eneste spørsmål.** Er
   `ramme_totalt - brukt < antall spørsmål du planlegger å kjøre` → STOPP,
   spør Hans, ikke kjør noe.
2. **Kjør ALDRI denne prosedyren uten en eksplisitt bestilling** fra Hans
   for DENNE runden — «eval-prosedyren finnes» er ikke det samme som
   «kjør den nå». Kildeutforskeren (`utforsk.py`) er derimot gratis og
   krever ingen slik bestilling.
3. **Maks 8 spørsmål per runde** (`maks_per_runde`). Vanligvis hele
   8-spørsmåls-settet i `sporsmal.json`; en delmengde er greit hvis Hans ber
   om det spesifikt (f.eks. kun de nye mønster-spørsmålene).
4. **Maks 2 runder per økt** (`maks_runder_per_okt`) UTEN ny eksplisitt
   bekreftelse fra Hans mellom dem — en «økt» er én sammenhengende
   kontrolløroppgave/samtale, ikke en kalenderdag.
5. **Løpende teller i rapporten**, format «kjøring N av rammen på 30» — se
   §4s rapportmal (`Budsjett: kjøring <N-start>–<N-slutt> av rammen på
   30`).
6. Runden er FERDIG (stopp, ikke fortsett til enda et spørsmål) når ett av:
   alle spørsmål i denne rundens delmengde er kjørt, `maks_per_runde` er
   nådd, ELLER rammen (`ramme_totalt`) ville blitt overskredet av neste
   spørsmål — sistnevnte: spør Hans FØR du fortsetter, ikke etterpå.

---

## 6. Syntesefasen (spec §4)

Etter en fullført runde (§4s rapport er skrevet og committet) destillerer
kontrolløren funnene til TRE typer forslag. Ingen av de tre skrives
DIREKTE inn i appens kode, prompter eller `data/sources/` — «Aldri
auto-apply» er en hard regel for hele harnessen (spec-ens Prinsipper).

1. **Kildebeskrivelse-utkast** — når eval-runden avdekket noe om en kilde
   som kildeutforskerens utkast (`tools/harness/utkast/<kilde>.md`) ikke
   fanget (f.eks. et tallnavn-forbehold av samme type som
   inflasjon-runden 2026-08-15s «SSB 14706, ikke 14710»): REDIGER
   `tools/harness/utkast/<kilde>.md` (eller opprett den hvis den ikke
   finnes ennå for denne kilden) med en ny seksjon eller et tillegg til
   «Kjente feller», merket med datoen for DENNE eval-runden og hvilket
   spørsmål som avdekket det. Dette er fortsatt et UTKAST — Hans/en senere
   runde fletter det inn i `data/sources/<kilde>.md`, akkurat som
   kildeutforskerens egne utkast.
2. **Logikk-/promptforslag** — funn som peker mot en endring i selve
   ask-flyten, ROUTING-regler eller RUN-disiplin (samme klasse forslag som
   baseline-rundens «A. Run-disiplinregel» / «B. Enklest-kilde-regel»,
   `docs/eval/2026-08-baseline.md`): skriv dem som nummererte, begrunnede
   forslag i rapportens «Syntese»-seksjon (§4s mal), HVER med en referanse
   til hvilken rad/hvilket spørsmål som målte problemet. Aldri en direkte
   prompt-diff — Hans vurderer og implementerer selv (eller ber
   kontrolløren om en separat, egen implementeringsoppgave).
3. **Adapter-/kodeforslag** — når funnet er en ekte kodefeil (ikke en
   tekst-/prompt-sak), meld det som en kodesak via eksisterende kanal:
   `/api/kilde-pr` sin issue-modus (`netlify/edge-functions/kilde-pr.ts`),
   `POST` med kropp `{"issue": {"tittel": "...", "kropp": "..."}}`, som
   oppretter et GitHub-issue merket `kilde-kodesak` i `hmelberg/askstat`
   (eller `GITHUB_PR_REPO` hvis overstyrt). Endepunktet er ADMIN-gatet
   (`adminGate` UTEN `allowByok` — krever enten en admin-innloggingstoken
   ELLER `Authorization: Bearer <M2PY_ACCESS_TOKEN>` hvis den delte
   testnøkkelen er satt i `.env`). **Standard oppførsel: kontrolløren
   SKRIVER issue-teksten (tittel + kropp) i rapportens Syntese-seksjon og
   lar Hans avgjøre om/når den skal sendes** — send den KUN direkte via
   `curl` mot `/api/kilde-pr` hvis Hans eksplisitt har bedt om automatisk
   innsending for denne runden, ellers er dette identisk med
   «Aldri auto-apply»-prinsippet anvendt på issue-kanalen. Eksempel-`curl`
   (kun til bruk ETTER en slik eksplisitt bestilling, med
   `M2PY_ACCESS_TOKEN` satt i `.env` — samme nøkkel-regel som §1.2: verdien
   leses av skallet inn i en miljøvariabel og limes ALDRI inn i selve
   kommandoteksten eller skrives ut):
   ```bash
   set -a; source .env; set +a   # laster M2PY_ACCESS_TOKEN (+ resten av .env) inn i skallets miljø, uten å skrive ut noe
   curl -s -X POST http://localhost:8899/api/kilde-pr \
     -H "Authorization: Bearer $M2PY_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     --data "$(python3 -c 'import json,sys; json.dump({"issue": {"tittel": sys.argv[1], "kropp": sys.argv[2]}}, sys.stdout)' "<tittel>" "<kropp>")"
   ```
   (`M2PY_ACCESS_TOKEN` ikke satt i `.env`: denne veien er ikke tilgjengelig
   lokalt — Hans må sende issuen selv, eller sette den delte testnøkkelen
   først.)

Sløyfa lukkes ved at NESTE eval-runde måler deltaet (turer/utfall) mot
DENNE rapporten — sammenlign eksplisitt i den neste rundens Hovedfunn-
seksjon, samme format som baseline-dokumentets egne før/etter-tabeller.
