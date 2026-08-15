// Kryss-lag-kontrakten (spec 2026-08-04-lokke-niva): serverens
// klassifiserRunResult sniffer på klientens literaler. Endres formatet i
// ai-chat.js uten at run-disiplin.ts følger med, skal DENNE testen rødne.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('mdAskExecuteScript-literalene består (OK./FEIL:-kontrakten)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(src.includes("'OK. OUTPUT'"), 'OK.-literalen mangler/endret');
  // Ærlig trunkering (Oslo-runde 9): etiketten er betinget og navngir omfanget.
  assert.ok(src.includes("' (avkuttet etter 20000 av '"), 'avkuttet-etiketten mangler/endret');
  assert.ok(src.includes("'FEIL:\\n'"), 'FEIL:-literalen mangler/endret');
});

// get_pack-kontrakten (review-funn 2026-08-06 #1): klienten dispatcher på
// SSE-eventet 'get_pack' og sender feltet get_pack_result tilbake i
// resume-POSTen; svar.ts parser NØYAKTIG de samme navnene fra body. Endres
// ett navn uten det andre, dør hele get_pack-runden stille (server 400 på
// resume, eller løkka kaster "mangler get_pack_result") — uten at NOEN
// eksisterende test (som kaller stream-løkkene direkte) fanger det, siden
// de aldri går via de faktiske streng-literalene i disse to filene.
test('get_pack-kontrakten består: event-type og feltnavn synkronisert mellom klient og server', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const svarTs = fs.readFileSync(
    path.join(__dirname, '..', '..', 'netlify', 'edge-functions', 'svar.ts'), 'utf8');
  assert.ok(aiChat.includes("ev.type === 'get_pack'"), "klienten dispatcher ikke lenger på 'get_pack'-eventet");
  assert.ok(aiChat.includes('get_pack_result:'), 'klienten sender ikke lenger get_pack_result i POST-body');
  assert.ok(svarTs.includes('body.get_pack_result'), 'svar.ts leser ikke lenger body.get_pack_result');
  assert.ok(svarTs.includes('get_pack_result?:'), 'svar.ts sin RequestBody mangler get_pack_result-feltet');
});

// Tomt get_pack-svar (review-funn 2026-08-06 #2): en tom tool_result-
// content-blokk avvises av Messages-API-et med en dødelig 400. Klienten
// (ukjent/fjernet id) MÅ sende en markørstreng i stedet for '' — låst her
// fordi ingen eksisterende test kjører runSvarLoop selv (ingen DOM-rigg).
test('get_pack: tomt svar erstattes med en markørstreng, aldri en tom streng', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(aiChat.includes("if (!packText) packText = '(fant ikke pakken — svar med det du har)';"),
    'klientens fallback for tomt get_pack-svar mangler/endret');
});

// Utvidet søk-kontrakten (kontekstrunden fase 2 §5): bryteren (nå
// #sourcesDiscoverCb i js/sources-modal.js — flyttet dit fra packs.js sin
// popover i kilder-profil-output-runden, Task 5) og js/ai-chat.js sin payload
// MÅ dele NØYAKTIG samme localStorage-nøkkel — ingen felles konstant på tvers
// av filer i dette ES5-oppsettet (samme risiko som get_pack-kontrakten over:
// et navnesprik ville dødd stille, bryteren huker av men payloaden sender
// aldri discover).
test('utvidet søk-kontrakten består: samme localStorage-nøkkel i sources-modal.js og ai-chat.js', () => {
  const modalJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'sources-modal.js'), 'utf8');
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(modalJs.includes("'md_ask_discover'"), 'sources-modal.js bruker ikke lenger nøkkelen md_ask_discover');
  assert.ok(aiChat.includes("localStorage.getItem('md_ask_discover') === '1'"),
    'ai-chat.js leser ikke lenger md_ask_discover NØYAKTIG slik svar.ts/coercing forventer');
  assert.ok(aiChat.includes('discover:'), 'ai-chat.js payload mangler discover-feltet');
});

// sources_off-kontrakten (kildevelger-runde 2, Task 3): klienten sender
// feltet i /api/svar-payloaden, og svar.ts må ha BÅDE RequestBody-feltet
// OG selve filtreringsfunksjonen — et navnesprik her ville dødd stille
// (av-skrudde kilder ville aldri blitt filtrert server-side), uten at noen
// eksisterende test (som aldri gjør en ekte HTTP-runde) fanger det.
test('sources_off-kontrakten består: ai-chat.js sender feltet, svar.ts leser+filtrerer det', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const svarTs = fs.readFileSync(
    path.join(__dirname, '..', '..', 'netlify', 'edge-functions', 'svar.ts'), 'utf8');
  assert.ok(aiChat.includes('sources_off:'), 'ai-chat.js payload mangler sources_off-feltet');
  assert.ok(svarTs.includes('sources_off?:'), 'svar.ts sin RequestBody mangler sources_off-feltet');
  assert.ok(svarTs.includes('coerceSourcesOff'), 'svar.ts kaller ikke lenger coerceSourcesOff');
});

// user_keys-kontrakten (innstillinger-runden, Task 11): egne nøkler lagres
// lokalt som metadata (md_user_keys: [{id, navn, notat}]) + selve verdien i
// det felles nøkkellageret (window.Keys, id 'usr-<slug>'). Payloaden til
// /api/svar skal ALDRI inneholde selve nøkkelverdien — kun navn+notat, slik
// at et navnesprik her ikke stille lekker en hemmelighet til serveren/
// telemetri. svar.ts må ha BÅDE RequestBody-feltet OG en faktisk
// koersjonsfunksjon (samme mønster som sources_off/packs over).
//
// navn = userKeyCanonicalName(k) (SLUGEN, k.id.slice(4)) — IKKE k.navn (fri
// visningstekst) — fikserunde 1, funn #2: k.navn er ukontrollert brukertekst
// (case/mellomrom) og kan spirke fra serverens USER_KEY_NAME_RE OG fra
// hva KEYS-injeksjonen (mdAskExecuteScript) faktisk setter som dict-nøkkel.
// Slugen er GARANTERT [a-z0-9_-]{1,32} og brukes IDENTISK begge steder
// (samme funksjon), så et KEYS['<navn>']-oppslag i AI-generert kode kan
// aldri KeyError-e på et navn serveren fikk men klienten aldri bruker.
test('user_keys-kontrakten består: payload sender {navn: SLUG, notat}, ALDRI selve verdien eller rå visningstekst', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const svarTs = fs.readFileSync(
    path.join(__dirname, '..', '..', 'netlify', 'edge-functions', 'svar.ts'), 'utf8');
  assert.ok(aiChat.includes('user_keys:'), 'ai-chat.js payload mangler user_keys-feltet');
  assert.ok(
    /user_keys:\s*\(mdUserKeysMeta\(\)\.length\s*\?\s*mdUserKeysMeta\(\)\.map\(function\s*\(k\)\s*\{\s*return\s*\{\s*navn:\s*userKeyCanonicalName\(k\),\s*notat:\s*k\.notat\s*\};\s*\}\)\s*:\s*undefined\)/
      .test(aiChat),
    'user_keys skal mappes til {navn: userKeyCanonicalName(k), notat} fra mdUserKeysMeta() — ikke i det formatet forventet');
  const uk = aiChat.match(/user_keys:[\s\S]*?undefined\)/);
  assert.ok(uk, 'fant ikke user_keys-uttrykket i payloaden');
  assert.ok(!/Keys\.get|\.value\b|k\.navn/.test(uk[0]),
    'user_keys-uttrykket refererer til selve nøkkelverdien eller rå k.navn — skal KUN sende {navn: SLUG, notat}');
  assert.ok(svarTs.includes('user_keys?:'), 'svar.ts sin RequestBody mangler user_keys-feltet');
  assert.ok(svarTs.includes('coerceUserKeys') || svarTs.includes('body.user_keys'),
    'svar.ts leser ikke lenger body.user_keys inn i buildSvarSystem');
});

// Fikserunde 1, funn #2 (klientsiden av navn/slug-spriket): KEYS-injeksjonen
// i mdAskExecuteScript MÅ bruke NØYAKTIG samme kanoniske navn-funksjon som
// payloaden over — ellers kan de to driftet fra hverandre igjen ved en
// senere endring uten at noen test fanger det.
test('KEYS-injeksjonen bruker userKeyCanonicalName(k) — samme kanoniske navn som user_keys-payloaden, ikke k.navn', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(aiChat.includes('function userKeyCanonicalName(k)'),
    'userKeyCanonicalName mangler — kanonisk-navn-funksjonen delt mellom payload og KEYS-injeksjon');
  assert.ok(/userKeys\[userKeyCanonicalName\(k\)\]\s*=\s*v/.test(aiChat),
    'KEYS-injeksjonen setter ikke lenger dict-nøkkelen via userKeyCanonicalName(k)');
  assert.ok(!/userKeys\[k\.navn\]/.test(aiChat),
    'KEYS-injeksjonen bruker fortsatt rå k.navn som dict-nøkkel — navn/slug-spriket er ikke fikset');
});

// available_keys-avgrensning (selv-review-funn, Task 11): egne nøkler
// ('usr-<slug>'-ider i window.Keys) skal ALDRI havne i available_keys —
// den listen har en annen betydning server-side (renderRegistryBlock i
// svar-prompt.ts sjekker s.id-medlemskap mot REGISTERKILDER, ikke egne
// nøkler) og de to nøkkellistene skal holdes begrepsmessig adskilt: egne
// nøkler går KUN via user_keys-feltet over.
test('available_keys filtrerer bort usr-*-ider (egne nøkler skal KUN i user_keys, ikke blandes inn her)', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const ak = aiChat.match(/available_keys:[\s\S]*?\)\s*:\s*\[\]\)/);
  assert.ok(ak, 'fant ikke available_keys-uttrykket i payloaden');
  assert.ok(/indexOf\('usr-'\)\s*!==\s*0/.test(ak[0]),
    'available_keys filtrerer ikke lenger bort usr-*-ider fra Keys.registered()');
});

// Fikserunde 1, funn #1 (CRITICAL): «Tolk resultat» (index.html) sender
// scriptInput.value til /api/tolk-resultat → LLM UTEN å gå via
// runSvarLoop/scrubScript i js/ai-chat.js — egen kode, egen skrubbeplikt.
// En egne nøkler-injisert KEYS = {...}-linje som ble stående i editoren
// etter en tidligere kjøring ville ellers gått urørt til leverandøren ved
// ett klikk. index.html er ikke et Node-krevbart modul (én kjempe-
// <script>-blokk) — testes på kildenivå, samme mønster som resten av fila.
test('index.html: triggerTolkResultat skrubber scriptet med DataDirectives.scrubKeys FØR mdInterpretResults', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const start = html.indexOf('function triggerTolkResultat()');
  assert.ok(start > -1, 'fant ikke triggerTolkResultat-funksjonen i index.html');
  const end = html.indexOf('\n    }', start);
  assert.ok(end > start, 'fant ikke slutten på triggerTolkResultat-funksjonen');
  const fn = html.slice(start, end);
  assert.ok(/DataDirectives\.scrubKeys/.test(fn),
    'triggerTolkResultat kaller ikke lenger DataDirectives.scrubKeys — egne nøkler kan lekke til /api/tolk-resultat');
  const scrubAt = fn.search(/DataDirectives\.scrubKeys/);
  const sendAt = fn.search(/mdInterpretResults\(/);
  assert.ok(scrubAt > -1 && sendAt > -1 && scrubAt < sendAt,
    'scrubKeys må kjøre FØR scriptet sendes videre til mdInterpretResults');
});

// Fikserunde 1, funn #3: «Lagre»-nedlastingen (menuSave, index.html) skriver
// scriptInput.value RÅTT til en nedlastet .txt-fil — samme skrubbeplikt som
// delelenke/GitHub-lagring (js/github-storage.js) og eksport
// (js/portable-export.js), som begge allerede går via DataDirectives.scrubKeys.
test('index.html: «Lagre»-nedlastingen (menuSave) skrubber scriptInput.value med DataDirectives.scrubKeys før Blob', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const idx = html.indexOf("getElementById('menuSave')");
  assert.ok(idx > -1, 'fant ikke menuSave-klikklytteren i index.html');
  const chunk = html.slice(idx, idx + 700);
  assert.ok(/DataDirectives\.scrubKeys/.test(chunk),
    'menuSave-nedlastingen kaller ikke lenger DataDirectives.scrubKeys — egne nøkler kan havne i en lastet ned fil');
  assert.ok(/new Blob\(\[content\]/.test(chunk),
    'Blob bygges ikke lenger fra den skrubbede content-variabelen');
});

// Fikserunde 1, funn #4: utkast-autosave (index.html) persisterer og
// gjenoppretter scriptInput.value RÅTT — en injisert KEYS = {...}-linje
// overlevde tidligere «Fjern nøkkel» i det autolagrede utkastet, både ved
// lagring OG ved gjenoppretting-ved-boot. Testes at BEGGE stiene går via
// samme scrubDraftKeysLine-hjelper (lokal duplikat av KEYS_LINE_RE-mønsteret
// siden denne inline-blokka kjører FØR js/data-directives.js har lastet —
// se kommentaren i index.html for skriptlaste-rekkefølgen).
test('index.html: utkast-autosave (lagring OG gjenoppretting-ved-boot) skrubber KEYS = {...}-linjer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.ok(html.includes('function scrubDraftKeysLine('),
    'scrubDraftKeysLine mangler — utkast-autosaven har ingen egen skrubbefunksjon');
  const restoreIdx = html.indexOf('function restoreDrafts()');
  assert.ok(restoreIdx > -1, 'fant ikke restoreDrafts()');
  const restoreChunk = html.slice(restoreIdx, restoreIdx + 1200);
  assert.ok(/scrubDraftKeysLine\(raw\)/.test(restoreChunk) && /scrubDraftKeysLine\(bootDraftRaw\)/.test(restoreChunk),
    'restoreDrafts() skrubber ikke lenger BÅDE per-modus-utkastene og boot-utkastet ved gjenoppretting');
  // Flere scriptInput 'input'-lyttere finnes i filen — søk ETTER
  // restoreDrafts()-blokka (draft-autosaven bor rett under den) for å
  // unngå å treffe en av de andre.
  const saveIdx = html.indexOf("scriptInput.addEventListener('input'", restoreIdx);
  assert.ok(saveIdx > -1, 'fant ikke utkast-autosavens input-lytter');
  const saveChunk = html.slice(saveIdx, saveIdx + 500);
  assert.ok(/scrubDraftKeysLine\(_v\)/.test(saveChunk),
    'autosave-lagringen (debounced input-lytter) skrubber ikke lenger FØR localStorage.setItem');
});

// Fikserunde 1, funn #5: md_user_keys (metadata) synkes IKKE på tvers av
// enheter, men window.Keys sine VERDIER gjør (konto-synk krypterer HELE
// md_keys-dokumentet) — en usr-<slug>-id kan derfor lande på enhet 2 uten
// metadata og bli usynlig/ufjernbar i innstillings-UI-en der, selv om
// verdien fortsatt finnes og brukes (KEYS-injeksjonen bryr seg ikke om
// metadata finnes). mdUserKeysMeta() må selvhelbrede — rekonstruere
// {id, navn: id.slice(4), notat:''} for enhver foreldreløs usr-*-id fra
// Keys.registered() — og PERSISTERE den rekonstruerte lista tilbake, ikke
// bare returnere en transient sammenslåing.
test('mdUserKeysMeta() selvhelbreder foreldreløse usr-*-ider fra Keys.registered() og persisterer dem', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const start = aiChat.indexOf('function mdUserKeysMeta()');
  assert.ok(start > -1, 'fant ikke mdUserKeysMeta()');
  const end = aiChat.indexOf('\n      }', start);
  assert.ok(end > start, 'fant ikke slutten på mdUserKeysMeta()');
  const fn = aiChat.slice(start, end);
  assert.ok(/Keys\.registered\(\)/.test(fn),
    'mdUserKeysMeta() leser ikke lenger Keys.registered() — kan ikke oppdage foreldreløse usr-*-ider fra andre enheter');
  assert.ok(/id\.indexOf\('usr-'\)\s*===\s*0/.test(fn),
    'mdUserKeysMeta() filtrerer ikke lenger på usr-*-prefikset ved rekonstruksjon');
  assert.ok(/navn:\s*id\.slice\(4\)/.test(fn),
    'rekonstruksjonen bruker ikke lenger id.slice(4) som navn (skal matche userKeyCanonicalName)');
  assert.ok(/saveUserKeysMeta\(list\)/.test(fn),
    'mdUserKeysMeta() persisterer ikke lenger den rekonstruerte lista tilbake — «vis» uten «persister» løser ikke funn #5');
});

// Sluttreview-fiksebølge #2 (CRITICAL): egne nøkkel-VERDIER kan lekke til
// LLM-leverandøren via run_result — generert kode kan printe KEYS['x'],
// eller en exception kan ekko verdien. maskKnownKeyValues MÅ kjøre på
// outText OG err FØR result-strengen bygges, og MÅ bruke split/join (ikke
// regex på selve verdien — den kan inneholde regex-metategn).
test('mdAskExecuteScript maskerer kjente egne nøkkelverdier i run_result FØR retur', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(aiChat.includes('function maskKnownKeyValues('), 'maskKnownKeyValues mangler');
  assert.ok(aiChat.includes("out.split(v).join('•••')"),
    'maskeringen bruker ikke lenger split/join — regex på selve nøkkelverdien er farlig (kan inneholde metategn)');
  const start = aiChat.indexOf('window.mdAskExecuteScript = async function');
  assert.ok(start > -1, 'fant ikke mdAskExecuteScript');
  const end = aiChat.indexOf('\n        };', start);
  assert.ok(end > start, 'fant ikke slutten på mdAskExecuteScript');
  const fn = aiChat.slice(start, end);
  assert.ok(/outText\s*=\s*maskKnownKeyValues\(/.test(fn),
    'mdAskExecuteScript maskerer ikke lenger outText før den havner i result');
  assert.ok(/maskKnownKeyValues\(String\(err\)\)/.test(fn),
    'mdAskExecuteScript maskerer ikke lenger feilteksten (err) før den havner i result');
});

// Kildenivå-kontrakt: index.html sin triggerTolkResultat («Tolk resultat»)
// MÅ maskere outputen med SAMME funksjon (window.mdMaskKeyValues, eksponert
// av ai-chat.js) — ellers lekker en egen nøkkelverdi i output via den veien
// selv om mdAskExecuteScript-veien over er tettet.
test('index.html: triggerTolkResultat maskerer output med window.mdMaskKeyValues', () => {
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  assert.ok(aiChat.includes('window.mdMaskKeyValues = maskKnownKeyValues;'),
    'ai-chat.js eksponerer ikke lenger maskeringsfunksjonen som window.mdMaskKeyValues');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const start = html.indexOf('function triggerTolkResultat()');
  assert.ok(start > -1, 'fant ikke triggerTolkResultat-funksjonen i index.html');
  const end = html.indexOf('\n    }', start);
  const fn = html.slice(start, end);
  assert.ok(/window\.mdMaskKeyValues\(outText\)/.test(fn),
    'triggerTolkResultat kaller ikke lenger window.mdMaskKeyValues(outText) — egne nøkkelverdier i output kan lekke til /api/tolk-resultat');
});

// KEYS-regex-drift (sluttreview-fiksebølge #3, fix-før-merge): scrubDraft-
// KeysLine sin fallback i index.html (kjører FØR js/data-directives.js har
// lastet) og KEYS_LINE_RE i js/data-directives.js er hånd-dupliserte
// literaler som MÅ matche BYTE-LIKT (bortsett fra regex-flagg) — ellers kan
// et utkast unnslippe skrubbing avhengig av HVILKEN av de to vegene som
// traff det. Injeksjonsformatet i ai-chat.js (mdAskExecuteScript) er den
// tredje parten begge regexene må fange — låst her slik at en fremtidig
// endring ett sted rødner denne testen i stedet for å drifte stille.
test('KEYS-regex-drift: fallback i index.html og KEYS_LINE_RE i data-directives.js er byte-like; injeksjonsformatet består', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const ddJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'data-directives.js'), 'utf8');
  const aiChat = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  const corePattern = '^[ \\t]*KEYS[ \\t]*=[ \\t]*\\{.*\\}[ \\t]*$';
  assert.ok(html.includes(corePattern), 'index.html sin scrubDraftKeysLine-fallback har endret KEYS-regex-mønsteret');
  assert.ok(ddJs.includes(corePattern), 'js/data-directives.js sin KEYS_LINE_RE har endret KEYS-regex-mønsteret');
  assert.ok(aiChat.includes("'KEYS = ' + JSON.stringify(userKeys) + '\\n' + script"),
    'ai-chat.js sitt injeksjonsformat (KEYS = <JSON>\\n<script>) har endret seg — regexene over må oppdateres i takt');
});

// FEIL-linja i prosessloggen (spec 2026-08-15 §1): kjørefeil skal være
// synlige i prosessloggen. runSvarLoop emitterer én gang for ALLE kallere
// (ask-view og AI-panelet) via handlers.onProgress, som er delt på tvers.
test('runSvarLoop emitterer FEIL-linje til prosessloggen (spec 2026-08-15 §1)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai-chat.js'), 'utf8');
  // Emisjonen skjer sentralt i løkka (én gang for ALLE kallere), etter onRunCode.
  assert.ok(src.includes("'⚠️ Kjøring feilet: '"), 'FEIL-prosesslinje-literalen mangler');
  // FEIL:\n-prefikset er kontrakt mot modellen og skal strippes i visningen.
  assert.ok(src.includes("replace(/^FEIL:\\n/"), 'FEIL-prefiks-strippingen mangler');
});
