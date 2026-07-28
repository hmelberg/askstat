/* ===================================================================
   Ask-visning (default i askstat; ?view=editor gir full editor-visning)
   — spørsmål → kode → svar
   Rene funksjoner her; DOM-oppkobling nederst (plan Task 5).
   =================================================================== */
(function askViewModule() {
  var T = window.t || function (s, p) { return p ? s.replace(/\{(\w+)\}/g, function (m, k) { return k in p ? p[k] : m; }) : s; };

  var ASK_ROUTES = ['beregning', 'data', 'oppslag', 'språk'];

  // Tolerant uthenting av ruter-JSON: modellen skal svare med rent JSON, men
  // vi godtar tekst/kodeblokker rundt. Alt ugyldig → rute 'data' (= dagens
  // data-svar-oppførsel, spec §Feilhåndtering).
  function parseAskRoute(text) {
    var fallback = { rute: 'data', tolkning: '', begrunnelse: '', svar: '' };
    if (!text) return fallback;
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return fallback;
    var obj;
    try { obj = JSON.parse(text.slice(start, end + 1)); } catch (_) { return fallback; }
    var rute = (obj && typeof obj.rute === 'string') ? obj.rute.toLowerCase().trim() : '';
    return {
      rute: ASK_ROUTES.indexOf(rute) >= 0 ? rute : 'data',
      tolkning: (obj && typeof obj.tolkning === 'string') ? obj.tolkning : '',
      begrunnelse: (obj && typeof obj.begrunnelse === 'string') ? obj.begrunnelse : '',
      svar: (obj && typeof obj.svar === 'string') ? obj.svar : '',
    };
  }

  // Proveniens-blokk som settes ØVERST i det genererte scriptet (spec §4):
  // spørsmål, operasjonell tolkning og rute som kommentarer, i modusens
  // kommentarsyntaks. Én linje per felt (linjeskift i feltene flates ut).
  var COMMENT_PREFIX = { python: '#', r: '#', duckdb: '--' };
  function buildAskProvenance(meta, mode) {
    var p = COMMENT_PREFIX[mode] || '#';
    var one = function (s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); };
    var lines = [
      p + ' ══ ask ══ generert av askstat',
      p + ' Spørsmål: ' + one(meta.question),
      p + ' Tolkning: ' + one(meta.tolkning),
      p + ' Rute: ' + one(meta.rute),
    ];
    return lines.join('\n') + '\n\n';
  }

  // Node-testbar seam (samme mønster som js/ai-chat.js nederst).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseAskRoute: parseAskRoute,
      buildAskProvenance: buildAskProvenance,
    };
  }
})();
