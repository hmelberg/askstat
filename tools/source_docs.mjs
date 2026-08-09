#!/usr/bin/env node
// tools/source_docs.mjs — kildedokument-konvertering + -generering (spec
// 2026-08-09-kildedokumenter-v1a §Task 2). data/sources/<id>.md er fasit
// ETTER `convert`; data/data-sources.json og data/source-guides/<id>.md er
// GENERERTE artefakter fra da av — rediger aldri dem direkte, kjør
// `node tools/source_docs.mjs generate` etter å ha endret et kildedokument.
//
// Subkommandoer:
//   convert   (ENGANGS) data/data-sources.json + data/source-guides/*.md
//             -> data/sources/<id>.md (30 dokumenter), MED en paritetsvakt
//             som kjører generate-logikken i minne FØR noe skrives til disk.
//   generate  (VARIG) data/sources/*.md -> data/data-sources.json +
//             data/source-guides/*.md.
//
// `generateInMemory(docsDir)` eksporteres for Task 3 sin drift-test — den
// leser *.md-filene fra docsDir og returnerer {entries, guides} UTEN å
// skrive noe, samme kjerne som `generate` bruker til å skrive med.
//
// Feltkilde-arkitektur: js/source-doc.js sin extractTitleAndSections()
// splitter FLATT på hver linje som starter med '## ' — ingen fence-vakt,
// ingen dybdesjekk (kjent, dokumentert begrensning fra Task 1, se
// task-1-report.md). Ekte guide-filer har sine EGNE '## X'-underoverskrifter
// (f.eks. data/source-guides/ssb.md: '## URL-mønstre', '## Kjente feller',
// …) — disse blir egne seksjons-chunks (key: null) i den FLATE
// sections-lista når det sammensatte kildedokumentet parses tilbake, ikke en
// del av 'guide'-chunkens .text. reconstructGuideText() under limer dem
// sammen igjen i original rekkefølge, med SAMME '## '+heading+'\n\n'+text-
// formel som SourceDoc.serialize() selv bruker per seksjon — verifisert
// empirisk (paritetsvakten under) at dette gir byte-identiske guider
// tilbake, fordi alle 16 ekte guide-filer følger vanlig markdown-konvensjon
// (blank linje etter hver '## '-overskrift, ingen kollisjon med kjente
// seksjons-alias). Seksjonen stopper alltid ved neste KJENTE seksjon ('om'
// er alltid sist og alltid til stede — se buildDocForEntry under for
// rekkefølgen convert skriver seksjonene i: Kort?, Guide?, Om kilden).

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SourceDoc = require('../js/source-doc.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_SOURCES_JSON = path.join(ROOT, 'data', 'data-sources.json');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const GUIDES_DIR = path.join(ROOT, 'data', 'source-guides');

// Disse tre JSON-feltene lever ALDRI i front matter — quirks/beskrivelse går
// i egne seksjoner (## Kort / ## Om kilden) VERBATIM, guide er avledet
// (Guide-seksjon finnes -> true) heller enn lagret.
const EXCLUDED_FIELDS = new Set(['beskrivelse', 'quirks', 'guide']);

class SourceDocsError extends Error {}
function fail(msg) {
  throw new SourceDocsError(msg);
}

// ---- Delt kjerne: en flat [{id, doc, rawText}]-liste (doc = SourceDoc.
// parse()-resultat, ELLER et håndbygd ekvivalent objekt fra convert;
// rawText = den fulle kildedokument-teksten doc ble/blir hentet fra) ->
// {entries, guides}. Brukes BÅDE av convert sin paritetsvakt (før noe er
// skrevet til disk) og av generateInMemory (leser data/sources/*.md fra
// disk). ----

// KEY_RANK: den ENESTE gyldige relative rekkefølgen kjente seksjonsnøkler
// kan opptre i et kildedokument (matcher rekkefølgen buildDocForEntry
// skriver dem i: Kort?, Guide?, Om kilden — 'variabler' er ubrukt i dag,
// men gitt samme plass i rekkefølgen som SECTION_ALIASES-oppslaget).
const KEY_RANK = { kort: 0, guide: 1, variabler: 2, om: 3 };

// validateSectionShape(id, sections) — funn fra task-reviewer 2026-08-10:
// js/source-doc.js sin extractTitleAndSections() splitter FLATT på HVER
// linje som starter med '## ', uten fence-/dybdevakt (dokumentert, avventet
// begrensning fra Task 1). En underoverskrift INNI en ekte '## Guide'-
// seksjon som ved et uhell matcher et kjent seksjonsalias (f.eks.
// '## Summary' -> 'kort', se SourceDoc.SECTION_ALIASES) blir da sin EGEN
// chunk med samme nøkkel som en ekte seksjon — og den gamle key-baserte
// bøttefyllingen (doc.sections.find/findIndex) plukket da stille opp FEIL
// chunk: kollisjonens tekst havnet i entry.quirks, og reconstructGuideText
// stoppet FOR TIDLIG (alt i guiden ETTER kollisjonen forsvant sporløst) —
// exit code 0, ingen feilmelding. Parseren er flat og kan ALDRI skille en
// tilfeldig kolliderende underoverskrift fra en ekte seksjon, så fiksen er
// ikke "gjett riktig" — det er "feil høyt istedenfor å gjette": ethvert
// dokument der en kjent nøkkel (kort/guide/variabler/om) dukker opp utenfor
// sin faste plass i KEY_RANK (duplikat ELLER feil rekkefølge — begge
// tilfeller fanges av samme monotont-økende-rank-sjekk) stanser med et
// forklarende norsk unntak, i stedet for å korrumpere stille.
function validateSectionShape(id, sections) {
  let lastRank = -1;
  sections.forEach((s) => {
    if (s.key === null) return;
    const rank = KEY_RANK[s.key];
    if (rank === undefined) return;
    if (rank <= lastRank) {
      const aliases = (SourceDoc.SECTION_ALIASES[s.key] || [s.key]).join('/');
      fail(
        `Kilde '${id}': overskriften «## ${s.heading}» kolliderer med seksjonsalias '${s.key}' ` +
        `(${aliases}) — sannsynligvis en underoverskrift inni Guide- eller Kort-teksten som ved et ` +
        `uhell matcher et kjent seksjonsnavn. Kildedokument-parseren splitter FLATT på hver '## '-linje ` +
        `og kan ikke skille en slik kollisjon fra en ekte seksjon. Gi underoverskriften et navn som ikke ` +
        `er et seksjonsalias, eller demot den til '### ${s.heading}' (kun '## ' splitter).`,
      );
    }
    lastRank = rank;
  });
}

function buildRegistryFromDocs(idDocPairs) {
  const seenIds = new Set();
  const seenOrders = new Map();
  const items = idDocPairs.map(({ id, doc, rawText }) => {
    if (seenIds.has(id)) fail(`Duplikat id blant kildedokumentene: '${id}'`);
    seenIds.add(id);

    validateSectionShape(id, doc.sections);

    const order = doc.fields.order;
    if (typeof order !== 'number' || !Number.isInteger(order)) {
      fail(`Kilde '${id}': feltet 'order' mangler eller er ikke et heltall`);
    }
    if (seenOrders.has(order)) {
      fail(`Duplikat order-verdi ${order}: '${seenOrders.get(order)}' og '${id}'`);
    }
    seenOrders.set(order, id);

    const navn = doc.fields.navn;
    if (typeof navn !== 'string' || !navn.trim()) fail(`Kilde '${id}': mangler navn`);
    const baseUrl = doc.fields.base_url;
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) fail(`Kilde '${id}': mangler base_url`);

    return { id, doc, rawText, order };
  });

  items.sort((a, b) => a.order - b.order);

  const entries = [];
  const guides = {};
  for (const { id, doc, rawText } of items) {
    const entry = {};
    doc.fieldOrder.forEach((k) => {
      if (k === 'order') return;
      entry[k] = doc.fields[k];
    });

    const omSection = doc.sections.find((s) => s.key === 'om');
    if (!omSection || !omSection.text.trim()) {
      fail(`Kilde '${id}': mangler '## Om kilden'-seksjon (beskrivelse er påkrevd)`);
    }
    entry.beskrivelse = omSection.text;

    const kortSection = doc.sections.find((s) => s.key === 'kort');
    if (kortSection && kortSection.text.trim()) entry.quirks = kortSection.text;

    const guideIdx = doc.sections.findIndex((s) => s.key === 'guide');
    if (guideIdx >= 0) {
      const guideText = reconstructGuideText(doc.sections, guideIdx);
      // Strukturvakt (defense-in-depth utover validateSectionShape over):
      // den sammensatte guide-teksten MÅ finnes ordrett igjen i kildedok-
      // umentet den kom fra. Om bøttefyllingen noensinne mister eller
      // forvrenger innhold (en fremtidig seksjonstype, en annen kollisjons-
      // form vi ikke har tenkt på ennå…) stopper dette stille sammenbrudd
      // FØR det når disk, i stedet for et byte-avvik oppdaget først av
      // paritetsvakten (convert, engangs) eller aldri (generate, varig).
      if (!rawText.includes(guideText)) {
        fail(
          `Kilde '${id}': guiden ble ikke funnet ordrett igjen i kildedokumentet etter sammensetting ` +
          `— strukturvakt stanset (mulig tap/forvrengning ved seksjonsrekonstruksjon)`,
        );
      }
      entry.guide = true;
      guides[id] = guideText + '\n';
    }

    entries.push(entry);
  }
  return { entries, guides };
}

// reconstructGuideText(sections, guideIdx) -> full VERBATIM guide-tekst.
// Guide-chunken selv holder alt FØR guidens egen første '## '-underoverskrift
// (om noen); hver etterfølgende key:null-chunk (fri seksjon, dvs. en
// underoverskrift som ikke matchet et kjent alias) limes tilbake på med
// akkurat samme '## '+heading+'\n\n'+text-formel serialize() selv bruker,
// helt til neste KJENTE seksjon (kort/guide/om/variabler) eller slutten av
// lista.
function reconstructGuideText(sections, guideIdx) {
  let text = sections[guideIdx].text;
  let i = guideIdx + 1;
  while (i < sections.length && sections[i].key === null) {
    text += '\n\n## ' + sections[i].heading + '\n\n' + sections[i].text;
    i++;
  }
  return text;
}

// ---- generate: data/sources/*.md -> {entries, guides} (i minne) ----

export function generateInMemory(docsDir) {
  if (!existsSync(docsDir)) fail(`Finner ikke kildedokument-mappa: ${docsDir}`);
  const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
  const idDocPairs = files.map((f) => {
    const text = readFileSync(path.join(docsDir, f), 'utf8');
    const doc = SourceDoc.parse(text);
    // id kommer fra front matter-feltet, IKKE filnavnet — id-feltet er den
    // faktiske registeridentiteten (brukt til guide-fil-oppslag andre steder
    // i appen, f.eks. /data/source-guides/<id>.md i source-guides.ts); et
    // filnavn som avviker fra sitt eget id-felt skal IKKE stille smitte over
    // en feil id inn i registeret.
    const id = doc.fields.id;
    if (typeof id !== 'string' || !id.trim()) {
      fail(`Fila '${f}' i ${docsDir} mangler et 'id'-felt i front matter`);
    }
    return { id, doc, rawText: text };
  });
  return buildRegistryFromDocs(idDocPairs);
}

function generate() {
  const { entries, guides } = generateInMemory(SOURCES_DIR);

  // "sletter guide-filer for kilder uten Guide-seksjon" — men ALDRI stille:
  // en eksisterende guidefil uten en tilsvarende Guide-seksjon i
  // kildedokumentet er en driftssituasjon (noen fjernet '## Guide' for
  // hånd) — feil høyt i stedet for å slette, skriv ingenting.
  const existingGuideFiles = existsSync(GUIDES_DIR)
    ? readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
    : [];
  const desired = new Set(Object.keys(guides));
  const orphans = existingGuideFiles.filter((id) => !desired.has(id)).sort();
  if (orphans.length) {
    console.error(
      'generate avbrutt — disse guidefilene mangler en tilsvarende «## Guide»-seksjon i ' +
      'data/sources/ og ville blitt slettet; rett kildedokumentet (eller fjern guidefila manuelt) ' +
      'og prøv igjen. Ingenting er skrevet:',
    );
    orphans.forEach((id) => console.error(` - data/source-guides/${id}.md`));
    process.exit(1);
  }

  writeFileSync(DATA_SOURCES_JSON, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  if (!existsSync(GUIDES_DIR)) mkdirSync(GUIDES_DIR, { recursive: true });
  Object.keys(guides).forEach((id) => {
    writeFileSync(path.join(GUIDES_DIR, `${id}.md`), guides[id], 'utf8');
  });

  console.log(
    `Generert: ${entries.length} kilder -> data/data-sources.json, ` +
    `${Object.keys(guides).length} guider -> data/source-guides/`,
  );
}

// ---- convert: data/data-sources.json + data/source-guides/*.md ->
// data/sources/<id>.md (ENGANGS), med paritetsvakt FØR noe skrives ----

function loadOriginalRegistry() {
  const raw = readFileSync(DATA_SOURCES_JSON, 'utf8');
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    fail(`data-sources.json er ikke gyldig JSON: ${e.message}`);
  }
  if (!Array.isArray(arr)) fail('data-sources.json må være en JSON-liste');
  return arr;
}

// buildDocForEntry(entry, index) -> {id, doc} — doc har SAMME form som
// SourceDoc.parse() returnerer ({fields, fieldOrder, title, sections,
// warnings}), håndbygd direkte (ikke via parse) slik at serialize(doc) gir
// kanonisk tekst "by construction" (brief §Interfaces).
function buildDocForEntry(entry, index) {
  const id = entry.id;
  if (typeof id !== 'string' || !id.trim()) fail(`Kilde #${index}: mangler id`);
  if (typeof entry.navn !== 'string' || !entry.navn.trim()) fail(`Kilde '${id}': mangler navn`);
  if (typeof entry.base_url !== 'string' || !entry.base_url.trim()) fail(`Kilde '${id}': mangler base_url`);
  if (typeof entry.beskrivelse !== 'string' || !entry.beskrivelse.trim()) fail(`Kilde '${id}': mangler beskrivelse`);

  const fields = {};
  const fieldOrder = [];
  Object.keys(entry).forEach((k) => {
    if (EXCLUDED_FIELDS.has(k)) return;
    fields[k] = entry[k];
    fieldOrder.push(k);
  });
  fields.order = index;
  fieldOrder.push('order');

  const sections = [];
  const hasQuirks = typeof entry.quirks === 'string' && entry.quirks.trim() !== '';
  if (hasQuirks) sections.push({ key: 'kort', heading: 'Kort', text: entry.quirks });

  const guidePath = path.join(GUIDES_DIR, `${id}.md`);
  const hasGuideFile = existsSync(guidePath);
  if (Boolean(entry.guide) !== hasGuideFile) {
    fail(
      `Kilde '${id}': registerets guide-felt (${entry.guide === true ? 'true' : 'fraværende'}) ` +
      `stemmer ikke med om ${guidePath} finnes (${hasGuideFile ? 'finnes' : 'mangler'})`,
    );
  }
  if (hasGuideFile) {
    const guideText = readFileSync(guidePath, 'utf8').trim();
    sections.push({ key: 'guide', heading: 'Guide', text: guideText });
  }

  sections.push({ key: 'om', heading: 'Om kilden', text: entry.beskrivelse });

  return { id, doc: { fields, fieldOrder, title: entry.navn, sections, warnings: [] } };
}

// ---- Deep-equal (nøkkelrekkefølge IGNORERES for objekter; array-rekkefølge
// er semantisk og MÅ stemme) + en detaljert avviksliste for feilmeldinger.

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function diffRegistry(orig, regen) {
  const issues = [];
  if (orig.length !== regen.length) {
    issues.push(`Antall kilder avviker: original ${orig.length}, ny ${regen.length}`);
  }
  const n = Math.max(orig.length, regen.length);
  for (let i = 0; i < n; i++) {
    const o = orig[i];
    const r = regen[i];
    if (!o) { issues.push(`Kilde #${i} (id='${r && r.id}'): finnes i ny generering, ikke i original (entry-rekkefølge)`); continue; }
    if (!r) { issues.push(`Kilde #${i} (id='${o.id}'): finnes i original, ikke i ny generering (entry-rekkefølge)`); continue; }
    if (o.id !== r.id) {
      issues.push(`Kilde #${i}: id avviker (original '${o.id}' vs ny '${r.id}') — entry-rekkefølgen har endret seg`);
      continue;
    }
    if (deepEqual(o, r)) continue;
    const keys = new Set([...Object.keys(o), ...Object.keys(r)]);
    for (const k of keys) {
      if (!deepEqual(o[k], r[k])) {
        issues.push(`Kilde '${o.id}': felt '${k}' avviker — original=${JSON.stringify(o[k])}, ny=${JSON.stringify(r[k])}`);
      }
    }
  }
  return issues;
}

function convert() {
  const originalArr = loadOriginalRegistry();

  const seenIds = new Set();
  originalArr.forEach((entry) => {
    if (typeof entry.id === 'string') {
      if (seenIds.has(entry.id)) fail(`Duplikat id i data-sources.json: '${entry.id}'`);
      seenIds.add(entry.id);
    }
  });

  const idDocPairs = originalArr.map((entry, i) => {
    const built = buildDocForEntry(entry, i);
    return { id: built.id, doc: built.doc, rawText: SourceDoc.serialize(built.doc) };
  });

  // Paritetsvakt — kjøres FØR noe som helst skrives til data/sources/.
  const { entries: regenEntries, guides: regenGuides } = buildRegistryFromDocs(idDocPairs);

  const mismatches = [];

  const originalGuideIds = existsSync(GUIDES_DIR)
    ? readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort()
    : [];
  const regenGuideIds = Object.keys(regenGuides).sort();
  originalGuideIds
    .filter((id) => !regenGuideIds.includes(id))
    .forEach((id) => mismatches.push(`Guide '${id}.md' finnes på disk men ble ikke generert (mangler '## Guide'-seksjon?)`));
  regenGuideIds
    .filter((id) => !originalGuideIds.includes(id))
    .forEach((id) => mismatches.push(`Guide '${id}.md' ble generert men finnes ikke som original fil`));
  regenGuideIds
    .filter((id) => originalGuideIds.includes(id))
    .forEach((id) => {
      const orig = readFileSync(path.join(GUIDES_DIR, `${id}.md`), 'utf8');
      if (orig !== regenGuides[id]) mismatches.push(`Guide '${id}.md' er IKKE byte-identisk etter rekonstruksjon`);
    });

  const normOrig = JSON.parse(JSON.stringify(originalArr));
  const normNew = JSON.parse(JSON.stringify(regenEntries));
  mismatches.push(...diffRegistry(normOrig, normNew));

  if (mismatches.length) {
    console.error('Paritetsvakt feilet — ingenting er skrevet til data/sources/. Avvik:');
    mismatches.forEach((m) => console.error(' - ' + m));
    process.exit(1);
  }

  if (!existsSync(SOURCES_DIR)) mkdirSync(SOURCES_DIR, { recursive: true });
  idDocPairs.forEach(({ id, rawText }) => {
    writeFileSync(path.join(SOURCES_DIR, `${id}.md`), rawText, 'utf8');
  });

  console.log(
    `${idDocPairs.length} kilder, ${regenGuideIds.length} guider byte-like, JSON deep-equal ✅`,
  );
}

// ---- CLI ----

function main() {
  const cmd = process.argv[2];
  try {
    if (cmd === 'convert') convert();
    else if (cmd === 'generate') generate();
    else {
      console.error('Bruk: node tools/source_docs.mjs <convert|generate>');
      process.exit(1);
    }
  } catch (e) {
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  }
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');
  } catch {
    return false;
  }
})();
if (isMain) main();
