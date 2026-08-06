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
