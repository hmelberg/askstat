// IMPORTANT: bump CACHE whenever PRECACHE_URLS (or any precached asset) changes,
// otherwise clients keep serving the stale cache. The Pyodide version string is
// duplicated across this file (PYODIDE_VERSION below), index.html and
// export_data*.html — update all together when upgrading Pyodide.
const PYODIDE_VERSION = 'v314.0.2';
const CACHE = 'm2py-v36';
const CDN_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'cdn.plot.ly',
  'files.pythonhosted.org',
  'pypi.org',
  'webr.r-wasm.org',    // webR-runtime (jamovi-modus)
  'repo.r-wasm.org',    // wasm-R-pakker: jmv, scatr m.fl. (~170 MB, cache-first)
  'cdnjs.cloudflare.com' // require.min.js (ipywidgets-broen, js/ipywidgets-bridge.js — pinned)
]);

// Cache Storage holder KUN uforanderlige, versjonspinnede BIBLIOTEK-URL-er
// (cache-first). Alt annet på CDN_HOSTS går rett til nettet og lagres ALDRI
// her: brukerdata (cdn.jsdelivr.net/gh/eier/repo@<hva som helst>/data.csv —
// også commit-pinnet, det er fortsatt brukerens data), muterbare refs (@main,
// @latest, @1), micropips pypi.org/pypi/<pkg>/json-oppslag og webR-repoets
// PACKAGES-indeks. Den gamle network-first-grenen la slikt i Cache Storage
// uten grense (review 2026-10-10, portet fra microdata 2e05f06); m2py-v36-
// bumpen sletter de gamle oppføringene.
const EXACT_SEMVER = String.raw`v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`;
const JSDELIVR_IMMUTABLE = [
  /^\/pyodide\/v\d+(?:\.\d+)+\//,
  // /npm/pkg@1.2.3/… og /npm/@scope/pkg@1.2.3/… (ikke @1, @^1, @latest)
  new RegExp('^/npm/(?:@[^/@]+/)?[^/@]+@' + EXACT_SEMVER + '(?:/|$)')
  // Bevisst IKKE /gh/…: det er brukerens repo-innhold (data), ikke bibliotek.
];
function isImmutableUrl(url) {
  const p = url.pathname;
  switch (url.hostname) {
    case 'files.pythonhosted.org': return true;  // filnavn inneholder versjon + hash-sti
    case 'cdnjs.cloudflare.com':   return /^\/ajax\/libs\/[^/]+\/\d[^/]*\//.test(p);
    case 'cdn.plot.ly':            return /^\/plotly-(?:[a-z]+-)?\d+\.\d+\.\d+/.test(p);
    case 'webr.r-wasm.org':        return /^\/v\d+\.\d+\.\d+\//.test(p);
    // Pakkefiler bærer versjon i navnet (jmv_2.5.6.tgz/.data/.js.metadata);
    // PACKAGES/PACKAGES.rds-indeksen er muterbar.
    case 'repo.r-wasm.org':        return /\/[A-Za-z0-9.]+_\d[^/]*$/.test(p);
    case 'cdn.jsdelivr.net':       return JSDELIVR_IMMUTABLE.some(re => re.test(p));
    default:                       return false;  // bl.a. pypi.org (JSON-API-et er muterbart)
  }
}

// Cache-skew-fiksen (2026-07-23): den gamle ENUMERERTE listen driftet —
// den manglet bl.a. ui_brython.py, ui_mpy.py og shared/ui_core.py, som
// dermed falt til ren HTTP-cache med heuristisk TTL (observert stale-krasj
// etter deploy tre ganger 2026-07-20..22). Nå dekkes ALLE lokale .py-filer
// av én suffiks-regel, så nye filer aldri kan glemmes.
function isLocalPy(pathname) {
  return pathname.endsWith('.py');
}

const PRECACHE_URLS = [
  'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide.js',
  'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide.mjs',
  'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide.asm.wasm',
  'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide-lock.json',
  'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/python_stdlib.zip',
  'https://cdn.plot.ly/plotly-2.32.0.min.js',
  'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js',
  'https://cdn.jsdelivr.net/npm/brython@3.12.0/brython.min.js',
  'https://cdn.jsdelivr.net/npm/brython@3.12.0/brython_stdlib.js',
  // ipywidgets-broen (js/ipywidgets-bridge.js) — pinnede versjoner, se dens
  // PIN-konstantblokk (REQUIRE_JS_URL/EMBED_AMD_URL). Lastes lat (kun når et
  // kjørt dokument importerer ipywidgets), men precaches likevel her slik at
  // det første treffet ikke krever nettverk hvis SW-en allerede er installert.
  'https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.4/require.min.js',
  'https://cdn.jsdelivr.net/npm/@jupyter-widgets/html-manager@1.0.14/dist/embed-amd.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(
        PRECACHE_URLS.map(u =>
          fetch(u, { cache: 'no-cache' })
            .then(r => (r && (r.ok || r.type === 'opaque')) ? cache.put(u, r) : null)
            .catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (CDN_HOSTS.has(url.hostname)) {
    // Muterbart / brukerdata: ingen respondWith → vanlig nettverk/HTTP-cache.
    if (isImmutableUrl(url)) e.respondWith(cacheFirst(e.request));
    return;
  }

  if (url.origin === self.location.origin && isLocalPy(url.pathname)) {
    e.respondWith(localPyNetworkFirst(e.request));
    return;
  }

  // App-shell assets (index.html, app.css, js/*.js, command_help.js,
  // widgets/forklar-widgets.js) intentionally fall through to plain
  // network/HTTP-cache — they are NOT precached or runtime-cached here.
  // If you ever add the shell to the SW for offline support, add index.html
  // alongside its css/js and bump CACHE.
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // Cache only real, inspectable responses. Opaque (cross-origin no-cors)
    // responses are padded to a large fixed size in the quota (~7MB each) — and
    // our CDN (jsdelivr) sends CORS, so res.ok is the right gate.
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(() => {});
      return res;
    }
    // Transient 4xx/5xx (CDN-blipp): prøv cachet kopi før vi gir feilen videre —
    // en resolved !ok-respons nådde aldri catch-fallbacken under.
    // Eksakt nøkkel (ikke ignoreSearch): en annen query-variant av samme sti
    // kan være et helt annet innhold (f.eks. jsdelivr ?-parametre, API-kall).
    const stale = await cache.match(req);
    return stale || res;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    throw err;
  }
}

// Lokale .py-filer: NETTVERK FØRST (review 2026-10-10). Stale-while-
// revalidate serverte forrige deploys Python-kjerne på første last hvis
// ?v=M2PY_VERSION ikke ble bumpet — versjonsskjev mot ny index.html/js.
// Nå vinner alltid ferskt svar ('no-cache' = revalider, 304 er billig);
// cachet kopi (eksakt nøkkel inkl. ?v=) brukes bare offline / ved !ok.
async function localPyNetworkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = new Request(req.url);
  try {
    const res = await fetch(req.url, { cache: 'no-cache' });
    if (res && res.ok) {
      cache.put(key, res.clone()).catch(() => {});
      return res;
    }
    const stale = await cache.match(key);
    return stale || res;
  } catch (err) {
    const fallback = await cache.match(key);
    if (fallback) return fallback;
    throw err;
  }
}
