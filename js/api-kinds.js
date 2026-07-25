// js/api-kinds.js — protokoll-adaptere for API-kilder (økt 2026-07-25,
// spec docs/superpowers/specs/2026-07-25-api-kinds-design.md §1):
// sdmx (OECD/ECB/Norges Bank/IMF …), dbnomics (~80 kilder), worldbank.
// Brukeren skriver KILDEN (kind(oecd)) — kindAlias mapper til protokollen.
// Ren modul uten nett/DOM: kjører under node --test. CSV-serialisering
// gjenbrukes fra js/pxweb.js (columnsToCsv) der flatenere trengs.
// SDMX-fellen (spec §0): 2.1-API-ene ignorerer ukjente parametre STILLE —
// send aldri noe kilden ikke garantert forstår; oversett verifiserbart
// eller feil høyt.
(function (global) {
  'use strict';

  // Kildenavn → protokoll-kind. Protokollnavnene er gyldige selv (for kilder
  // utenfor registeret); ukjente navn → null (ikke vår kind).
  var ALIAS = { oecd: 'sdmx', ecb: 'sdmx', norgesbank: 'sdmx', imf: 'sdmx',
                sdmx: 'sdmx', dbnomics: 'dbnomics', worldbank: 'worldbank' };
  function kindAlias(name) { return ALIAS[String(name || '').toLowerCase()] || null; }

  // Forsøk 1 for sdmx-datahenting (spec §0: virker hos OECD og NB; labels=id
  // gir rene koder — NBs default er labels=both). CORS-safelistet header
  // (ingen kolon i verdien → ingen preflight).
  var SDMX_ACCEPT = 'application/vnd.sdmx.data+csv;labels=id';

  // ECB 406-er på Accept-veien men tar format=csvdata (spec §0). 404/422 er
  // ekte feil (ukjent flow/nøkkel) — IKKE formatproblem, ingen fallback.
  function sdmxNeedsFallback(status, contentType) {
    if (status === 406) return true;
    if (status >= 400) return false;
    return String(contentType || '').toLowerCase().indexOf('csv') < 0;
  }

  function stripParam(query, name) {
    return (query ? query.split('&') : []).filter(function (p) {
      return p && p.split('=')[0].toLowerCase() !== name;
    });
  }
  function splitUrl(url) {
    var s = String(url || '');
    var q = s.indexOf('?');
    return { base: q >= 0 ? s.slice(0, q) : s, query: q >= 0 ? s.slice(q + 1) : '' };
  }

  function sdmxFallbackUrl(url) {
    var u = splitUrl(url);
    var parts = stripParam(u.query, 'format');
    parts.push('format=csvdata');
    return u.base + '?' + parts.join('&');
  }

  var api = { kindAlias: kindAlias, SDMX_ACCEPT: SDMX_ACCEPT,
              sdmxNeedsFallback: sdmxNeedsFallback, sdmxFallbackUrl: sdmxFallbackUrl };
  global.ApiKinds = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
