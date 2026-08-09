// js/source-doc.js — kildedokument-parser (spec
// 2026-08-09-kildedokumenter-v1a §2, Task 1): markdown-dokumenter (front
// matter/fenced yaml/nakne felter -> typede fields) blir den kanoniske
// kilden for datakilde-registeret. Ren modul — ingen storage/fetch/DOM.
// Task 2 (tools/source_docs.mjs, node) og v1b (nettleser) konsumerer denne
// via NØYAKTIG disse navnene: parse/serialize/normalize/sectionKey/
// TAG_ALIASES/SECTION_ALIASES. I v1a er fila passiv — ingenting kaller den
// ennå, script-taggen ligger i index.html kun til v1b trenger den i browser.
(function (global) {
  'use strict';

  // Kort norske→engelske tag-alias (spec §Interfaces) — flat oppslagstabell,
  // ren data, ingen logikk her. Konsumeres av senere tasks (tag-normalisering
  // i UI/registry).
  var TAG_ALIASES = {
    micro: 'mikro', macro: 'makro', norway: 'norge', sweden: 'sverige',
    denmark: 'danmark', us: 'usa',
  };

  // Kjente seksjonsoverskrifter (norsk kanonisk nøkkel -> aksepterte alias,
  // case-insensitivt matchet av sectionKey under). Ukjente overskrifter får
  // key null (fri prosa) — heading/text bevares verbatim gjennom serialize.
  var SECTION_ALIASES = {
    kort: ['kort', 'short', 'summary'],
    guide: ['guide'],
    variabler: ['variabler', 'variables'],
    om: ['om kilden', 'about', 'about the source'],
  };

  function sectionKey(heading) {
    var h = String(heading || '').trim().toLowerCase();
    if (!h) return null;
    var keys = Object.keys(SECTION_ALIASES);
    for (var i = 0; i < keys.length; i++) {
      var aliases = SECTION_ALIASES[keys[i]];
      for (var j = 0; j < aliases.length; j++) {
        if (aliases[j] === h) return keys[i];
      }
    }
    return null;
  }

  // ---- Mini-YAML (flat + ett nivå nesting — IKKE full YAML) ----

  // typeValue(raw) -> typet verdi for EN skalarverdi (streng allerede trimmet
  // rest-etter-kolon). Rekursivt for arrayelementer (samme typing per
  // element), ikke for nesting (den håndteres i parseFieldLines under).
  function typeValue(raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if (raw.length >= 2 && raw.charAt(0) === '[' && raw.charAt(raw.length - 1) === ']') {
      var inner = raw.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map(function (part) { return typeValue(part.trim()); });
    }
    if (raw.length >= 2 && raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') {
      try { return JSON.parse(raw); } catch (e) { return raw; }
    }
    return raw;
  }

  var FIELD_LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/;
  var SUB_FIELD_LINE_RE = /^  ([A-Za-z_][A-Za-z0-9_]*):(.*)$/;

  // parseFieldLines(lines) -> {fields, fieldOrder, warnings} — delt kjerne
  // for ALLE tre inndataformater (front matter-blokk, delistet fenced-yaml,
  // nakne linjer). Kaster aldri: ukjente linjer -> warning + ignoreres.
  function parseFieldLines(lines) {
    var fields = {};
    var fieldOrder = [];
    var warnings = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      var m = FIELD_LINE_RE.exec(line);
      if (!m) {
        warnings.push('Ukjent linje i front matter, ignorert: «' + line + '»');
        i++;
        continue;
      }
      var key = m[1];
      var rawValue = m[2].trim();
      if (rawValue === '') {
        // Mulig nestet objekt: se etter 2-space-innrykkede sub: value-linjer
        // rett under. Ingen -> tom streng.
        var sub = {};
        var any = false;
        var j = i + 1;
        while (j < lines.length) {
          var sm = SUB_FIELD_LINE_RE.exec(lines[j]);
          if (!sm) break;
          sub[sm[1]] = typeValue(sm[2].trim());
          any = true;
          j++;
        }
        fields[key] = any ? sub : '';
        fieldOrder.push(key);
        i = any ? j : i + 1;
        continue;
      }
      fields[key] = typeValue(rawValue);
      fieldOrder.push(key);
      i++;
    }
    return { fields: fields, fieldOrder: fieldOrder, warnings: warnings };
  }

  // ---- Innlesning: tre aksepterte inndataformater (spec §2) ----

  var YAML_FENCE_RE = /```ya?ml[ \t]*\r?\n([\s\S]*?)\r?\n```/;
  var NAKED_KEY_RE = /^[a-z_][a-z0-9_]*:\s/i;
  var H2_ANCHOR_RE = /(^|\r?\n)## /;

  // leadingText(text) -> delen av dokumentet FØR første '## '-overskrift, om
  // noen finnes (ellers hele dokumentet). Feilfunn (task-1-review, punkt 2):
  // fenced-yaml-gjenkjenning skal ALDRI plukke opp en ```yaml-blokk som
  // ligger inne i en senere '## '-seksjon (f.eks. et eksempel i en
  // '## Guide') — feltkilder må stå FØR seksjonene, aldri inni dem.
  // Bruker text.slice() (ikke split+join) slik at yamlMatch.index under
  // FORTSATT er en gyldig indeks inn i den ORIGINALE teksten — en
  // split(/\r?\n/).join('\n')-rekonstruksjon ville forskjøvet indeksene ved
  // \r\n-linjeskift.
  function leadingText(text) {
    var m = H2_ANCHOR_RE.exec(text);
    if (!m) return text;
    return text.slice(0, m.index + m[1].length);
  }

  // delistFirstItem(yamlLines) -> lines for parseFieldLines, av FØRSTE
  // listeelement i en '- key: value'-fenced-yaml-blokk (som src-socrata.md).
  // Kun første element flates til fields — resten av lista ignoreres (spec:
  // "listeform ... flates: første elements nøkler blir fields").
  function delistFirstItem(yamlLines) {
    var out = [yamlLines[0].replace(/^-\s/, '')];
    for (var k = 1; k < yamlLines.length; k++) {
      var line = yamlLines[k];
      if (/^\s*$/.test(line) || /^-\s/.test(line)) break; // blank/neste element -> slutt
      var m = /^  (.*)$/.exec(line);
      if (!m) break;
      out.push(m[1]);
    }
    return out;
  }

  // extractFields(text) -> {fields, fieldOrder, warnings, body} — body er
  // resten av dokumentet (rå tekst) etter at feltblokka er fjernet, klar for
  // tittel-/seksjonsuttrekk.
  function extractFields(text) {
    var lines = text.split(/\r?\n/);
    if (lines[0] === '---') {
      var closeIdx = -1;
      for (var i = 1; i < lines.length; i++) {
        if (lines[i] === '---') { closeIdx = i; break; }
      }
      if (closeIdx >= 0) {
        var fm = parseFieldLines(lines.slice(1, closeIdx));
        return { fields: fm.fields, fieldOrder: fm.fieldOrder, warnings: fm.warnings,
          body: lines.slice(closeIdx + 1).join('\n') };
      }
      return { fields: {}, fieldOrder: [], warnings:
        ['Front matter mangler avsluttende "---" — hele dokumentet tolkes som prosa.'],
        body: text };
    }

    // Kun ØVERST i dokumentet (før første '## '-seksjon) — en ```yaml-blokk
    // inni en seksjon lenger ned er innhold, ikke en feltkilde (task-1-review
    // punkt 2). yamlMatch.index er relativt til leading-strengen, så body må
    // bygges av den FULLE teksten ved å slå opp samme substring der.
    var leading = leadingText(text);
    var yamlMatch = YAML_FENCE_RE.exec(leading);
    if (yamlMatch) {
      var yamlLines = yamlMatch[1].split(/\r?\n/);
      var isList = yamlLines.length > 0 && /^-\s/.test(yamlLines[0]);
      var fieldLines = isList ? delistFirstItem(yamlLines) : yamlLines;
      var y = parseFieldLines(fieldLines);
      var body = text.slice(0, yamlMatch.index) + text.slice(yamlMatch.index + yamlMatch[0].length);
      return { fields: y.fields, fieldOrder: y.fieldOrder, warnings: y.warnings, body: body };
    }

    // Nakne key: value-linjer fra toppen, før første blanklinje/overskrift.
    var candidate = [];
    for (var n = 0; n < lines.length; n++) {
      var ln = lines[n];
      if (ln === '' || ln.charAt(0) === '#') break;
      candidate.push(ln);
    }
    var hasKeyLine = candidate.some(function (l) { return NAKED_KEY_RE.test(l); });
    if (hasKeyLine) {
      var nk = parseFieldLines(candidate);
      return { fields: nk.fields, fieldOrder: nk.fieldOrder, warnings: nk.warnings,
        body: lines.slice(candidate.length).join('\n') };
    }
    return { fields: {}, fieldOrder: [], warnings: [], body: text };
  }

  // ---- Tittel + seksjoner ----

  var TITLE_RE = /^# (.*)$/;
  var HEADING_RE = /^## (.*)$/;
  var FENCE_LINE_RE = /^```/;

  function extractTitleAndSections(body) {
    var bodyLines = body.split(/\r?\n/);
    var title = '';
    for (var t = 0; t < bodyLines.length; t++) {
      var line = bodyLines[t];
      var tm = TITLE_RE.exec(line);
      if (tm) { title = tm[1].trim(); bodyLines.splice(t, 1); break; }
      // Feilfunn (task-1-review, punkt 1): tittelsøket skal IKKE fortsette
      // inn i en senere seksjon eller kodeblokk — en '# '-linje i et
      // kode-eksempel (f.eks. en Python-kommentar) skal aldri kapres som
      // dokumentets tittel. Stopp søket ved første '## '-overskrift eller
      // fenced-blokk; finnes ingen ekte tittel før det, er title ''.
      if (HEADING_RE.test(line) || FENCE_LINE_RE.test(line)) break;
    }
    var chunks = [{ key: null, heading: '', lines: [] }];
    var current = chunks[0];
    for (var b = 0; b < bodyLines.length; b++) {
      var hm = HEADING_RE.exec(bodyLines[b]);
      if (hm) {
        var heading = hm[1].trim();
        current = { key: sectionKey(heading), heading: heading, lines: [] };
        chunks.push(current);
      } else {
        current.lines.push(bodyLines[b]);
      }
    }
    var sections = [];
    chunks.forEach(function (c) {
      var text = c.lines.join('\n').trim();
      if (c.heading === '' && text === '') return; // ingen ledende prosa -> ingen tom seksjon
      sections.push({ key: c.key, heading: c.heading, text: text });
    });
    return { title: title, sections: sections };
  }

  // ---- parse ----

  function parse(text) {
    if (typeof text !== 'string') {
      throw new TypeError('SourceDoc.parse: text må være en streng');
    }
    var extracted = extractFields(text);
    var ts = extractTitleAndSections(extracted.body);
    return {
      fields: extracted.fields,
      fieldOrder: extracted.fieldOrder,
      title: ts.title,
      sections: ts.sections,
      warnings: extracted.warnings,
    };
  }

  // ---- serialize ----

  // needsQuote(s) (spec §2): quoter KUN når verdien inneholder ': ', starter
  // med '['/'"'/'#'/whitespace, eller har ledende/etterfølgende whitespace.
  function needsQuote(s) {
    if (s.indexOf(': ') >= 0) return true;
    if (/^[\["#\s]/.test(s)) return true;
    if (/^\s|\s$/.test(s)) return true;
    return false;
  }

  function serializeScalar(value) {
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    var s = String(value);
    return needsQuote(s) ? JSON.stringify(s) : s;
  }

  function serializeFieldLine(key, value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      var out = key + ':\n';
      Object.keys(value).forEach(function (k) {
        out += '  ' + k + ': ' + serializeScalar(value[k]) + '\n';
      });
      return out;
    }
    if (Array.isArray(value)) {
      return key + ': [' + value.map(serializeScalar).join(', ') + ']\n';
    }
    if (value === '') return key + ':\n';
    return key + ': ' + serializeScalar(value) + '\n';
  }

  function serialize(doc) {
    doc = doc || {};
    var fields = doc.fields || {};
    var fieldOrder = doc.fieldOrder || [];
    var title = doc.title || '';
    var sections = doc.sections || [];
    var out = '---\n';
    fieldOrder.forEach(function (key) { out += serializeFieldLine(key, fields[key]); });
    out += '---\n\n';
    if (title) out += '# ' + title + '\n\n';
    sections.forEach(function (s) {
      if (s.heading) out += '## ' + s.heading + '\n\n' + s.text + '\n\n';
      else if (s.text) out += s.text + '\n\n';
    });
    return out;
  }

  function normalize(text) {
    return serialize(parse(text));
  }

  var SourceDoc = {
    parse: parse,
    serialize: serialize,
    normalize: normalize,
    sectionKey: sectionKey,
    TAG_ALIASES: TAG_ALIASES,
    SECTION_ALIASES: SECTION_ALIASES,
  };

  global.SourceDoc = SourceDoc;

  if (typeof module !== 'undefined' && module.exports) module.exports = SourceDoc;
})(typeof window !== 'undefined' ? window : globalThis);
