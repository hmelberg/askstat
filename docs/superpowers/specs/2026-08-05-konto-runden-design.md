# Konto-runden: historikk, profiler, valgfri innlogging og synk

**Dato:** 2026-08-05 · **Status:** godkjent design (brainstorm 2026-08-05), venter på implementasjonsplan

## Bakgrunn og mål

Ask-visningen er én-svars: hvert nye spørsmål wiper `#askAnswer`, og ingenting
huskes. Hans vil ha (1) en historikk i venstre sidebar der klikk på et
tidligere spørsmål bringer svaret tilbake, (2) navngitte **profiler** — tekst
som automatisk legges til prompten (f.eks. «Use only OECD as a data source»,
datasettdokumentasjon, kilde-URL-er), og (3) valgfri innlogging som lar
historikk, profiler og API-nøkler (anthropic, kaggle-typen m.fl.) følge
brukeren på tvers av maskiner — uten at brukeren må taste nøklene på nytt.

Backend er microdata-api (mdataapi.anvil.app), som allerede har alt av
login-infrastruktur (magic-code e-post, bearer-tokens, `/auth/me`) og et
bevist per-bruker-dokument-mønster (`keystore.py`). Askstat snakker allerede
med appen fra prod (`js/feil-telemetri.js`) — CORS er bevist.

## Beslutninger (brainstorm 2026-08-05, Hans)

- **Lokal-først; login er VALGFRITT.** Anonym BYOK forblir basismodus.
  Historikk, profiler og nøkler virker fullt uten konto (localStorage).
  Login legger KUN til synk — ingen gating av ask, ingen divergerende
  kodeveier i spørremaskineriet. Ikke-innloggede sender ingenting til
  server (utover dagens feil-telemetri).
- **Nøkkelsynk-mekanisme:** hele `md_keys`-dokumentet (flat v1) krypteres
  klient-side med nøkkel avledet av **login-koden** (som brukeren uansett
  taster på ny maskin) — PBKDF2-600k(salt=email) → AES-GCM. Serveren lagrer
  kun ciphertext. Bevisst ULIK safestats v2-lager (åpen/låst/hemmelig +
  hovedpassord) — askstat skal ikke ha hovedpassord-UX.
- **3 ord** i magic-koden (ikke 4) **+ slow-hash av magic-/delt-koder
  server-side** (kompenserer ~39 bits entropi mot DB-dump-knekking).
- **Synk ALLE nøkler, inkl. anthropic** (ingen per-nøkkel-opt-out i v1).
- **Avvist:** «kryptering» med brukernavn (encoding, falsk trygghet);
  Firefox-Sync-modell med egen synk-kode (sterkere, men ekstra hemmelighet
  å miste — bakhånd hvis behovet oppstår).
- **Profiler:** én aktiv profil om gangen; aktiv-valget synkes på tvers av
  enheter; tekst-cap 8 000 tegn. Profiler ERSTATTER md_ask_prefs
  ([[feedback-no-backwards-compat]] — én mekanisme, ikke to).
- **Server-historikk = question + kode + metadata, ALDRI markdown-svaret**
  (personvern + størrelse; full markdown forblir lokal cache).
- **Merge ved første login:** lokale data overlever og pushes opp.
  **Logout beholder lokale data**; egen eksplisitt «log out and clear this
  device» for delte maskiner.
- Faser: **1 = lokalt** (historikk + profiler, null backend), **2 = konto**
  (login + userdoc-endepunkt + synk + slow-hash). Én Anvil-pull dekker hele
  fase 2s serverside.

## Fase 1a — historikk-sidebar (lokalt)

**Fangst.** Ett innslag lagres når et svar fullføres (`showAnswer`-tidspunkt
i `runAskFlow`), for alle utfall unntatt catch-grenens feilkort,
API-nøkkel-mangler-kortet og ren abort. Språk-rutens direktesvar lagres
(script = null). Innslag:

```
{ id, ts, updated,              // crypto.randomUUID(), ISO-tid (updated = ts,
                                // endres kun ved tombstoning — fase 2-merge)
  question, route, tolkning,
  markdown,                     // res.markdown RÅ (med {{fig:N}})
  script,                       // siste VELLYKKEDE kjørte script (prefix+script,
                                // nøyaktig som eksekvert); null hvis ingen ok
  sources,                      // [{url, ok, viaProxy}]
  badge,                        // 'ok' | 'feilet-etter-suksess' | 'feilet' | 'ingen-kjøring'
  depth, mode,
  profileId, profileName }      // aktiv profil ved spørretid (proveniens)
```

Fanges i `onRunCode`: ved `r.ok` oppdateres `lastOkScript` (i dag fanges kun
feilede script, til telemetri). `updated`-felt per innslag for fase 2-merge.

**Lagring.** `localStorage.md_ask_history`, `{v:1, entries:{id→innslag}}`.
Tak: 50 innslag OG 2 MB serialisert — eldste kastes først (evict på ts).
QuotaExceeded → kast eldste og prøv én gang til; deretter gi opp stille
(historikk er best-effort, aldri i veien for svaret).

**Sidebar-UI.** Liste i eksisterende `.ask-sidebar` under knappene, nyeste
øverst, scrollbar. Tittel = question trunkert ~60 tegn (title-attributt =
full tekst), relativ dato. Hover viser slette-×; «Clear history» nederst.
Listen re-rendres ved lagring/sletting. Engelske strenger (ask-visningens
språkkonvensjon).

**Gjenoppretting (klikk).** Deaktivert mens `running`. Klikk:
1. Spørsmålsfeltet fylles med `question`; svarkortet vises med lagret
   `markdown` via eksisterende `renderMd` + badge fra `badge`-feltet;
   `{{fig:N}}` uten levende noder → `stripRefs` (`[fig 1]`-klammer) +
   `sweepUnresolvedRefs`. Kilder re-rendres. Details-folden får linjen
   «Restored from history (asked <dato>)».
2. Har innslaget `script`: knapp **«Run code again»** i svarkortets
   handlingsrad. Klikk kjører scriptet LOKALT via `mdAskExecuteScript`
   (pyodide — null LLM-kostnad), deretter re-render av rå markdown +
   `resolveAnswerRefs`/`mountFullOutput`-maskineriet som i ok-grenen i dag.
   Ref-nummerering er deterministisk (DOM-orden i `classifyAskOutput`), så
   figurene lander i riktige slots.
3. Nytt Ask fra gjenopprettet tilstand = helt vanlig nytt spørsmål.

**Kjent begrensning (aksepteres):** re-kjøring reproduserer hva siste
vellykkede script produserte — tall i svaret som stammet fra en TIDLIGERE
kjøring i samme løp regenereres ikke, og ferske data kan ha driftet siden
spørretidspunktet. Details-linjen gjør konteksten synlig.

## Fase 1b — profiler (lokalt)

**Datamodell.** `localStorage.md_profiles`:

```
{ v:1, active: id|null, updated,
  profiles: { id: { name, text, updated } } }   // text ≤ 8000, name ≤ 60
```

**UI.** Ny knapp **«Profiles»** i ask-sidebaren → modal i eksisterende
`ai-modal-backdrop`-mønster: liste (aktiv markert, radio-semantikk — én
aktiv, «No profile» øverst), ny/rediger/slett, navnfelt + textarea med
tegnteller mot 8 000. Modal-stacking-fella (alle backdrops z-index 300,
senere DOM vinner) gjelder hvis modalen noen gang åpnes oppå en annen —
v1 åpner den kun fra sidebaren, men noter fella i koden.

**Synlighet (mot glemt-aktiv-profil-fella).** Aktiv profil skal aldri
usynlig forme svar: (1) chip ved spørrefeltet «Profile: <name>» med ×
(deaktiver) — klikk på chipen åpner modalen; (2) linje i Details-folden
«Profile applied: <name>»; (3) profileName lagres i historikk-innslaget.

**Prompt-integrasjon.** Aktiv profils tekst sendes i det EKSISTERENDE
`preferences`-feltet til `/api/svar` (blokk SIST i prompten — mekanismen
fra datasøk-runden 2.6). Lesepunktet i `js/ai-chat.js` (~linje 690, leser
`md_ask_prefs`) byttes til `Profiles.activeText()`. Server: kun
cap-økning 2 000 → 8 000 i `coercePreferences`
(`netlify/edge-functions/_lib/svar-prompt.ts:18`, deployes med git push —
IKKE Anvil).

**Erstatter md_ask_prefs.** Ved første last: finnes ikke-tom
`md_ask_prefs`, seedes profil «My preferences» (aktiv), md_ask_prefs
slettes. «Data preferences»-feltet i innstillingsmodalen fjernes.

**Hemmeligheter i profiler:** profiler er KLARTEKST (synkes ukryptert i
fase 2). Modal-hint: referer nøkler som `key(name)` (data-loaderen slår
opp, scrubberen maskerer) — aldri lim inn rånøkler.

## Fase 2a — login (valgfri)

Porter safestats `js/login.js` (246 linjer) → askstat: apiBase =
`https://mdataapi.anvil.app`, engelske strenger, login-modal i index.html,
«Log in»-knapp i ask-sidebaren (viser e-post når innlogget, med
logout-meny: «Log out» / «Log out and clear this device»). Endepunktene
(`/_/api/auth/email/request|verify|me|logout`) finnes og er i drift.
Registrering er åpen — whitelisten i `find_or_create_user` styrer kun
kategori/kreditter, blokkerer ikke ukjente e-poster; askstat-brukere lander
i default-kategori, og userdoc-endepunktet krever kun innlogget bruker
(som keystores `_require_user`).

VIKTIG ved verify: koden brukeren tastet holdes i minnet akkurat lenge nok
til KEK-avledning (fase 2c) — den lagres aldri selv.

## Fase 2b — generisk userdoc-endepunkt (Anvil)

Ny `server_code/userdoc.py`, klon av keystore.py-mønsteret (ren logikk
importerbar uten anvil, endepunkter bak `_ANVIL`-gate):

```
GET  /_/api/userdoc/:name           → {"doc": str|null, "updated": str|null}
POST /_/api/userdoc/:name {"doc"}   → {"ok": true, "updated": str}
```

- Tabell `userdocs`: email, name, doc (string), updated. Én rad per
  (email, name).
- Allowlist `name ∈ {askkeys, profiles, history}`; caps: askkeys 64 kB,
  profiles 128 kB, history 256 kB.
- Validering MINIMAL (allowlist, str, JSON-parsebar, cap, `updated`
  finnes) — klienten eier semantikken; nøkkelblobben er bare et dokument
  hvis innhold tilfeldigvis er ciphertext.
- Auth: `auth.authenticate_or_fail` + krev bruker (delt-kode-økter har
  ingen brukerrad → 403, dermed ingen synk — bevisst).
- Begrunnelse for generisk fremfor tre kloner: ÉN Anvil-pull dekker alt,
  og `userdocs`-tabellen opprettes samtidig i Anvil-editoren.

## Fase 2c — synk-moduler (klient)

Ny `js/konto-sync.js` (mønster: safestats keys-sync.js — pull ved login,
debounced push ~2 s etter lokal endring, `replaceDoc`-stil som ikke fyrer
onChange-løkker).

**Profiler og historikk: union-by-id.** Whole-doc newest-wins klobrer på
tvers av enheter; i stedet merges per innslag/profil på `updated`
(ISO-streng, leksikografisk). **Sletting = tombstone** `{deleted:true,
updated}` (ellers gjenoppstår slettede fra andre enheter); tombstones
prunes etter 90 dager. «Clear history» = tombstone på alle. `active` i
profildoket følger dokumentets `updated` (nyeste valg vinner).
Server-historikkdok inneholder question/script/metadata-feltene, IKKE
markdown — markdown forblir i lokal cache, og et innslag hentet fra server
uten lokal markdown gjenoppretter via «Run code again».

**Nøkler: kryptert blob, whole-doc newest-wins.** Ny `js/keys-crypto.js`:

- KEK = PBKDF2-SHA256, 600 000 iter, passord = magic-koden (normalisert
  som server: lowercase, skilletegn-runs → «-»), salt = email (lowercase).
- Blob: `{v:'ask1', ct, iv, salt:email, kekId, updated}` — AES-GCM-256
  over `JSON.stringify(md_keys)`; `kekId` = første 8 hex av
  SHA-256(koden) (serveren har allerede full hash — avslører ingenting).
- Lokalt FORBLIR `md_keys` klartekst-arbeidslager (dagens aksepterte
  risiko); kryptering er kun for transport/serverlagring. Avledet KEK
  caches i localStorage så Keys.onChange kan re-kryptere og pushe uten
  ny kodetasting.
- **Rotasjon:** koder utløper etter 30 dager / kan reutstedes. Ved pull:
  kekId ≠ vår → prøv dekryptering med cached KEK; feiler den, prompt
  «enter the login code these keys were saved with» med fallback
  «re-enter keys manually». Enhver enhet med klartekst re-krypterer under
  gjeldende kode ved neste push — rotasjon leger seg selv.

**Merge ved første login:** pull → merge med lokalt → push resultatet.
Tom server = ren opplasting av lokal tilstand.

## Fase 2d — slow-hash av koder (auth.py, påvirker OGSÅ safestat)

`_hash_token` splittes: **sesjonstokens beholder sha256** (høy entropi);
**magic- og delt-koder** hashes med PBKDF2-SHA256, 600 000 iter, FAST
salt (konstant i koden) — verify forblir ett PBKDF2-kall + indeksert
radoppslag (O(1); per-rad-salt ville gitt O(rader × 600k), for tregt).
Fast salt er akseptabelt: iterasjonstallet er forsvaret; kodene er
tilfeldige (ingen rainbow-gevinst på tvers).

Konsekvens: eksisterende magic-koder slutter å virke etter Anvil-pull —
brukere (også safestat) ber bare om ny kode. Få brukere, ingen
bakoverkompat-forpliktelse. Reutstedelse koordineres med Hans ved pull.

## Sikkerhet og trusselramme (ærlig)

- **Beskytter mot:** DB-dump/tabell-titting — nøkler er AES-GCM-ciphertext;
  knekking krever brute av ~39-bits kode gjennom PBKDF2-600k **to ganger**
  (server-hashen for oppslag OG klient-KDF-en), GPU-år-klassen.
- **Beskytter IKKE mot:** ondsinnet/kompromittert server — koden passerer
  serveren ved verify, og serveren serverer uansett JS-en (samme grense
  som ethvert web-levert kryptosystem, inkl. safestats hovedpassord).
  Dette SIES i personvernteksten, ikke skjules.
- **Lokalt uendret:** klartekst md_keys i localStorage er dagens
  dokumenterte aksepterte risiko; KEK-caching legger ingenting til.
- Profiler/historikk synkes i klartekst (ikke hemmeligheter per policy;
  `key(name)`-referanser, aldri rånøkler). Spørsmålshistorikk er
  personopplysninger → personvern.html/.en.html får konto-avsnitt i
  fase 2: hva lagres innlogget (spørsmål+kode, profiler, krypterte
  nøkler), ingenting ellers; slett konto = rader slettes.

## Feilhåndtering

- Synk er ALLTID best-effort og asynkron — feil (offline, 401, 413)
  logges stille/vises som diskret «sync paused»-hint, blokkerer aldri
  ask-flyten. 401 → lokal logout-state, data beholdes.
- Dekrypteringsfeil → rotasjonsflyten (2c), aldri sletting av serverblob
  uten eksplisitt brukervalg.
- localStorage-kvote → evict-og-retry, deretter stille degradering.
- POST-kappløp to enheter: siste vinner på serveren, union-merge ved
  neste pull reparerer (innslag går ikke tapt — de re-pushes fra enheten
  som har dem).

## Testing

- **Node (nye moduler som rene seams, dagens mønster):** historikk
  (fangst/evict/gjenopprett-plan), profiler (CRUD, activeText, seed-
  migrering fra md_ask_prefs), merge (union-by-id, tombstones, prune,
  active-vinner), keys-crypto (krypter/dekrypter-rundtur i node-webcrypto,
  kekId-mismatch-vei, normalisering av kode).
- **Deno:** coercePreferences-cap 8 000.
- **Pytest (microdata-api):** userdoc-validering (allowlist, caps, JSON),
  hash-splitten (kode→PBKDF2, sesjon→sha256), uten anvil-import (keystore-
  mønsteret).
- **Playwright-røyk fase 1:** spør → innslag i sidebar → restore →
  «Run code again» → figur i slot. Profil: opprett, aktiver, sjekk chip +
  Details-linje + at preferences-feltet når serveren (nettverksfane).
- **Fase 2 manuell røyk (Hans, etter Anvil-pull):** login → nøkkel synlig
  kryptert i userdocs-tabellen → annen nettleser → login → nøkler virker
  uten retasting; historikk/profil-merge fra to enheter.

## Avgrensninger (v1, bevisste)

- Én aktiv profil (multi-select evt. senere hvis det klemmer).
- SSO- og delt-kode-innlogging: ingen nøkkelsynk (ingen kode → ingen KEK;
  ingen brukerrad → ingen dok). Historikk/profil-synk gjelder heller ikke
  delt-kode (403 fra userdoc).
- Ingen svar-markdown på serveren; gjenoppretting på ny maskin = re-kjør.
- Ingen HMAC/signering av synk-dokumenter (samme aksepterte rest som
  resume-state; roadmap).
- Ask-visningen forblir én-svars (historikk = gjenopprett, ikke chat-stack).

## Filer som røres

**Fase 1 (askstat, git push = live):** nye `js/ask-history.js`,
`js/profiles.js`; endringer i `js/ask-view.js` (fangst, restore, re-run),
`js/ai-chat.js` (preferences-lesepunkt, fjern prefs-felt fra modal),
`index.html` (sidebar-liste, Profiles-knapp, modal, chip), `css/ask.css`,
`netlify/edge-functions/_lib/svar-prompt.ts` (coercePreferences-cap),
node-/playwright-tester.

**Fase 2:** askstat: nye `js/login.js` (port), `js/konto-sync.js`,
`js/keys-crypto.js`, login-modal i index.html, personvernsidene;
microdata-api: ny `server_code/userdoc.py`, `auth.py`-hashsplitt,
pytest — deretter ÉN Anvil-pull + `userdocs`-tabell i editoren.

## Åpne punkter

- Ingen designåpne punkter. Operasjonelt: tidspunkt for Anvil-pull
  (invaliderer eksisterende koder — koordineres med Hans).
