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
  assert.ok(src.includes("'OK. OUTPUT (truncated):\\n'"), 'OK.-literalen mangler/endret');
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
