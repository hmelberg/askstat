// js/read-bridge.js — pandas-URL-broen (plan 2026-07-27-pandas-url-bro).
// «pd.read_csv("https://…")» i motorene ruter hit: skann-og-prefetch mens
// motoren booter (HINT — en bom koster ventetid, aldri korrekthet), byte-
// cache, og synkrone fasader for motorer som ikke kan vente (Pyodide kjører
// på main thread; Brython/MicroPython bruker replay-broen i sine motorfiler).
(function (global) {
  'use strict';

  var cache = Object.create(null);   // url -> {bytes, contentType} | {error}
  var inflight = Object.create(null);

  // Testbar henter — produksjon bruker DataLoader.fetchRawUrl (proxy-fallback
  // + høylytte HTTP-feil bor DER, ikke her).
  var fetcher = function (url) { return global.DataLoader.fetchRawUrl(url); };

  // Rene string-literaler i de tre leserne. BEVISST enkel: variabler,
  // f-strenger og sammensatte uttrykk dekkes av sync-fallbackene i stedet —
  // hint-prinsippet sier at skannen aldri skal måtte ha rett.
  var SCAN_RE = /\bread_(?:csv|json|parquet)\(\s*(['"])((?:https?:\/\/|\/api\/hent\?)[^'"\n]+)\1/g;

  function scanUrls(script) {
    var out = [], seen = Object.create(null), m;
    SCAN_RE.lastIndex = 0;
    while ((m = SCAN_RE.exec(String(script || ''))) !== null) {
      if (!seen[m[2]]) { seen[m[2]] = true; out.push(m[2]); }
    }
    return out;
  }

  function ensure(url) {
    var c = cache[url];
    // Bytes er autoritative; en cachet FEIL er retrybar — en transient 500
    // under prefetch skal ikke forgifte økten (hint-prinsippet: en mislykket
    // prefetch koster tid, aldri korrekthet).
    if (c && !c.error) return Promise.resolve(c);
    if (inflight[url]) return inflight[url];
    inflight[url] = fetcher(url).then(function (r) {
      cache[url] = { bytes: r.bytes, contentType: r.contentType };
      return cache[url];
    }, function (e) {
      // Feil CACHES — et kast her ville forsvunnet i fire-and-forget-
      // prefetchen, og sync-oppslaget etterpå må kunne rapportere den.
      cache[url] = { error: (e && e.message) || String(e) };
      return cache[url];
    }).finally(function () { delete inflight[url]; });
    return inflight[url];
  }

  function prefetchScript(script) {
    scanUrls(script).forEach(function (u) { ensure(u); });
  }

  function getCached(url) { return cache[url] || null; }

  // Synkron XHR for cache-miss i Pyodide (dynamisk bygde URL-er). Kun
  // main thread — og sync XHR kan ikke bruke responseType, så binærdata
  // hentes med x-user-defined-trikset (charCode & 0xff per byte).
  function syncXhr(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    try { xhr.send(null); } catch (e) { return { status: 0, bytes: null }; }
    if (xhr.status === 0 || xhr.status >= 400) return { status: xhr.status, bytes: null };
    var t = xhr.responseText, u8 = new Uint8Array(t.length);
    for (var i = 0; i < t.length; i++) u8[i] = t.charCodeAt(i) & 0xff;
    return { status: xhr.status, bytes: u8 };
  }

  // Test-hook (_setXhr) av samme grunn som _setFetcher: sync-XHR-veien er
  // den mest risikable koden i modulen og skal ikke være usett av CI.
  var xhrImpl = null;
  function xhr(url) { return (xhrImpl || syncXhr)(url); }

  function forPyodideSync(url) {
    var c = cache[url];
    if (c && !c.error) return { bytes: c.bytes, error: null };
    // En cachet FEIL behandles som miss: sync-veien får prøve selv.
    var canXhr = xhrImpl || typeof XMLHttpRequest !== 'undefined';
    if (!canXhr) {
      return { bytes: null, error: (c && c.error) || ('ingen cache-oppføring og ingen XHR for ' + url) };
    }
    var r = xhr(url);
    // Proxy KUN ved status 0 (CORS/nettverk) — samme konvensjon som
    // fetchRawUrl/fetchLoadTarget. En ekte 404 er like ekte via proxyen,
    // og «HTTP 404» er en klarere melding enn «proxy 404».
    if (r.bytes === null && r.status === 0 && url.indexOf('/api/hent?') !== 0) {
      r = xhr('/api/hent?url=' + encodeURIComponent(url));
    }
    if (r.bytes === null) {
      return { bytes: null, error: (r.status ? 'HTTP ' + r.status : 'CORS/nettverksfeil') + ' for ' + url };
    }
    cache[url] = { bytes: r.bytes, contentType: '' };
    return { bytes: r.bytes, error: null };
  }

  // Python-kilden for Pyodide-wrapperne. Ligger HER (ikke inline i
  // index.html) så node-testene kan asserte på den. Kontrakt: URL-argument →
  // bro; alt annet → original uendret (standalone-paritet). HTTP-feil →
  // ValueError med status og URL, FØR parsing.
  function pyPatchSource() {
    return [
      'import io as _ost_io',
      'def _ost_url_buf(_p):',
      '    from js import window as _ost_w',
      '    _r = _ost_w.ReadBridge.forPyodideSync(str(_p))',
      '    if _r.error:',
      '        raise ValueError(str(_r.error))',
      '    return _ost_io.BytesIO(bytes(_r.bytes.to_py()))',
      'def _ost_wrap_reader(_orig):',
      '    def _w(*a, **kw):',
      '        if not a:',
      '            return _orig(*a, **kw)',
      '        _fp = a[0]',
      '        if isinstance(_fp, str) and (_fp.startswith("http://") or _fp.startswith("https://") or _fp.startswith("/api/hent?")):',
      '            return _orig(_ost_url_buf(_fp), *a[1:], **kw)',
      '        return _orig(*a, **kw)',
      '    return _w',
      'pd.read_csv = _ost_wrap_reader(pd.read_csv)',
      'pd.read_json = _ost_wrap_reader(pd.read_json)',
      'pd.read_parquet = _ost_wrap_reader(pd.read_parquet)',
      ''
    ].join('\n');
  }

  global.ReadBridge = {
    scanUrls: scanUrls, prefetchScript: prefetchScript, ensure: ensure,
    getCached: getCached, forPyodideSync: forPyodideSync, pyPatchSource: pyPatchSource,
    _reset: function () { cache = Object.create(null); inflight = Object.create(null); xhrImpl = null; },
    _setFetcher: function (f) { fetcher = f; },
    _setXhr: function (f) { xhrImpl = f; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
