import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

for (const f of ["directive-parser.js", "data-directives.js", "data-loader.js", "enc-crypto.js"]) {
  (0, eval)(await Deno.readTextFile(new URL(`../../../js/${f}`, import.meta.url)));
}
// deno-lint-ignore no-explicit-any
const DL = (globalThis as any).DataLoader;

Deno.test("resolveAndFetchLoads: fetches, sniffs format, proxy fallback on CORS", async () => {
  const calls: string[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url + ((init?.headers as Record<string, string>)?.Authorization ? " [auth]" : ""));
    if (url.startsWith("https://blocked.example/")) return Promise.reject(new TypeError("CORS"));
    const body = url.includes("/api/hent?") ? "a;b\n1;2" : "x,y\n3,4";
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = [
    '# direkte = ost.read("https://open.example/d.csv")',
    '# sperret = ost.read("https://blocked.example/d.csv")',
  ].join("\n");
  const out = await DL.resolveAndFetchLoads(script, { fetchImpl, registry: [], authToken: "T" });
  assertEquals(out.loads.map((o: { alias: string; format: string }) => [o.alias, o.format]),
    [["direkte", "csv"], ["sperret", "csv"]]);
  assertEquals(out.remote, []);
  // blocked URL retried via proxy with auth header
  const proxyCall = calls.find((c) => c.includes("/api/hent?url=https%3A%2F%2Fblocked.example"));
  if (!proxyCall?.includes("[auth]")) throw new Error("proxy-fallback mangler auth: " + calls.join(" | "));
});

// NB (testisolasjon): js/data-loader.js har en modul-scoped byte-cache per
// resolved URL (_bufCache, «page reload is the reset, by design») — testene i
// denne fila deler prosess, så hver test MÅ bruke URL-er ingen tidligere test
// har lastet, ellers ser den cachede bytes og null fetch-kall. Cache-
// semantikken pinnes eksplisitt av testen nederst.

Deno.test("resolveAndFetchLoads: BYOK-nøkkel sendes som X-Anthropic-Key på proxy-kall når token mangler", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    if (url.startsWith("https://blocked-byok.example/")) return Promise.reject(new TypeError("CORS"));
    return Promise.resolve(new Response("x,y\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = '# sperret = ost.read("https://blocked-byok.example/d.csv")';
  await DL.resolveAndFetchLoads(script, { fetchImpl, registry: [], anthropicKey: "sk-ant-test123" });
  const proxy = calls.find((c) => c.url.includes("/api/hent?url="));
  if (!proxy) throw new Error("ingen proxy-kall: " + calls.map((c) => c.url).join(" | "));
  assertEquals(proxy.headers["X-Anthropic-Key"], "sk-ant-test123");
  assertEquals(proxy.headers["Authorization"], undefined);
});

Deno.test("resolveAndFetchLoads: innloggingstoken har forrang over BYOK-nøkkel", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(new Response("x,y\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = '# via = ost.read("/api/hent?url=https%3A%2F%2Fx.example%2Fd.csv")';
  await DL.resolveAndFetchLoads(script, { fetchImpl, registry: [], authToken: "T", anthropicKey: "sk-ant-test123" });
  const proxy = calls.find((c) => c.url.includes("/api/hent?url="));
  if (!proxy) throw new Error("ingen proxy-kall");
  assertEquals(proxy.headers["Authorization"], "Bearer T");
  assertEquals(proxy.headers["X-Anthropic-Key"], undefined);
});

Deno.test("sniffFormat: content-type wins over URL", () => {
  const mk = (ct: string) => new Response("", { headers: { "content-type": ct } });
  assertEquals(DL._sniffFormat(mk("text/html; charset=utf-8"), "https://x/api"), "html");
  assertEquals(DL._sniffFormat(mk("application/json"), "https://x/d.csv"), "json");
  assertEquals(DL._sniffFormat(mk("text/csv"), "https://x/tabell?format=csv"), "csv");
});

// deno-lint-ignore no-explicit-any
const EC = (globalThis as any).EncCrypto;

function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

Deno.test("resolveAndFetchLoads: connect/load to an unregistered name errors", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("", { status: 200 }))) as typeof fetch;
  // Etter safestat-synk 23ad822 anvil-rutes ukjente navn i resolve; i den
  // offentlige liten-utgaven (ingen Anvil-API-base) feiler de her i stedet.
  await assertRejects(
    () => DL.resolveAndFetchLoads('# u = ost.connect("ukjent")\n# df = u.read()',
      { fetchImpl, registry: [] }),
    Error, "ingen API-base konfigurert for kilden «ukjent»");
});

Deno.test("url envelope + key literal decrypts", async () => {
  const plain = new TextEncoder().encode("x,y\n9,8\n");
  const { envelope, key } = await EC.encryptBytes(plain, "csv");
  const fetchImpl = (() => Promise.resolve(jsonResp(envelope))) as typeof fetch;
  const out = await DL.resolveAndFetchLoads(
    `# df = ost.read("https://x.example/d.enc.json", secret_key="${key}")`,
    { fetchImpl, registry: [] });
  assertEquals(new TextDecoder().decode(out.loads[0].bytes), "x,y\n9,8\n");
});

Deno.test("envelope without key prompts via promptKey(ask)", async () => {
  const plain = new TextEncoder().encode("q\n1\n");
  const { envelope, key } = await EC.encryptBytes(plain, "csv");
  const fetchImpl = (() => Promise.resolve(jsonResp(envelope))) as typeof fetch;
  let asked = "";
  // Egen URL (d-ask.enc.json): testen over cachet alt bytes for d.enc.json —
  // samme URL her ville dekryptert FEIL envelope («feil nøkkel eller ødelagt fil»).
  const out = await DL.resolveAndFetchLoads(
    '# df = ost.read("https://x.example/d-ask.enc.json", secret_key="ask")',
    { fetchImpl, registry: [], promptKey: (alias: string) => { asked = alias; return Promise.resolve(key); } });
  assertEquals(asked, "df");
  assertEquals(new TextDecoder().decode(out.loads[0].bytes), "q\n1\n");
});

Deno.test("byte-cache: samme URL hentes ikke på nytt i samme økt (page reload = reset)", async () => {
  let fetches = 0;
  const fetchImpl = (() => {
    fetches++;
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = '# df = ost.read("https://cachetest.example/d.csv")';
  await DL.resolveAndFetchLoads(script, { fetchImpl, registry: [] });
  const out = await DL.resolveAndFetchLoads(script, { fetchImpl, registry: [] });
  assertEquals(fetches, 1);   // andre kjøring traff _bufCache
  assertEquals(new TextDecoder().decode(out.loads[0].bytes), "a,b\n1,2");
});

Deno.test("resolveAndAssemble: fetches spec sources + returns spec", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes("people") ? "pid,income\n1,10\n2,20" : "pid,amount\n1,5";
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = [
    '# p = ost.connect("https://x.example/people.csv")',
    '# s = ost.connect("https://x.example/sales.csv")',
    '# panel = ost.create(key="pid")',
    '# panel.add(p, ["income"])',
    "# sales = s.read()",
    '# panel.join(sales, on="pid")',
  ].join("\n");
  const out = await DL.resolveAndAssemble(script, { fetchImpl, registry: [] });
  assertEquals(out.remote, []);
  assertEquals(out.sources.map((x: {alias: string}) => x.alias).sort(), ["p", "s"]);
  assertEquals(out.spec.datasets.find((d: {name: string}) => d.name === "panel").key, ["pid"]);
  const p = out.sources.find((x: {alias: string}) => x.alias === "p");
  assertEquals(new TextDecoder().decode(p.bytes), "pid,income\n1,10\n2,20");
});

const KAGGLE_REG = [{
  id: "kaggle", navn: "Kaggle", utgiver: "Kaggle", beskrivelse: "test", tillit: "etablert", tilgang: "rest",
  base_url: "https://www.kaggle.com/api/v1/", cors: false,
  auth: { type: "api_key", user: true, plassering: "basic" },
}];

Deno.test("data-loader: X-Source-Key settes på proxy-kall for user-auth-kilde", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const inner = encodeURIComponent("https://www.kaggle.com/api/v1/datasets/download/own/slug/fil-a.csv");
  const script = '# kag = ost.read("/api/hent?url=' + inner + '")';
  const keysApi = { get: (t: string) => (t === "kaggle" ? "bruker:K9" : "") };
  const out = await DL.resolveAndFetchLoads(script, { fetchImpl, registry: KAGGLE_REG, keysApi });
  assertEquals(out.loads[0].alias, "kag");
  const proxy = calls.find((c) => c.url.includes("/api/hent?url="));
  assertEquals(proxy?.headers["X-Source-Key"], "bruker:K9");
});

Deno.test("data-loader: manglende brukernøkkel → norsk feil før fetch", async () => {
  const calls: string[] = [];
  const fetchImpl = ((input: string | URL | Request) => {
    calls.push(String(input));
    return Promise.resolve(new Response("x", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const inner = encodeURIComponent("https://www.kaggle.com/api/v1/datasets/download/own/slug/fil-b.csv");
  const script = '# kag2 = ost.read("/api/hent?url=' + inner + '")';
  await assertRejects(
    () => DL.resolveAndFetchLoads(script, { fetchImpl, registry: KAGGLE_REG, keysApi: { get: () => "" } }),
    Error, "krever API-nøkkel",
  );
  assertEquals(calls.filter((c) => c.includes("kaggle")).length, 0);
});

Deno.test("data-loader: connect-basert user-auth-kilde rutes via proxy med nøkkel", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = [
    '# kaggle = ost.connect("kaggle")',
    '# kag3 = kaggle.read("datasets/download/own/slug/fil-c.csv")',
  ].join("\n");
  const keysApi = { get: (t: string) => (t === "kaggle" ? "bruker:K10" : "") };
  await DL.resolveAndFetchLoads(script, { fetchImpl, registry: KAGGLE_REG, keysApi });
  const proxy = calls.find((c) => c.url.includes("/api/hent?url="));
  if (!proxy) throw new Error("ingen proxy-kall: " + calls.map((c) => c.url).join(" | "));
  assertEquals(proxy.headers["X-Source-Key"], "bruker:K10");
});

Deno.test("data-loader: bar URL mot user-auth-kilde rutes via proxy (aldri direkte)", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const script = '# kag4 = ost.read("https://www.kaggle.com/api/v1/datasets/download/own/slug/fil-d.csv")';
  const keysApi = { get: (t: string) => (t === "kaggle" ? "bruker:K11" : "") };
  await DL.resolveAndFetchLoads(script, { fetchImpl, registry: KAGGLE_REG, keysApi });
  assertEquals(calls.length, 1);
  if (!calls[0].url.includes("/api/hent?url=")) throw new Error("gikk ikke via proxy: " + calls[0].url);
  assertEquals(calls[0].headers["X-Source-Key"], "bruker:K11");
});

const KAGGLE_FRI_REG = [{
  id: "kagglefri", navn: "KaggleFri", utgiver: "K", beskrivelse: "test", tillit: "etablert", tilgang: "rest",
  base_url: "https://open.kagglefri.example/api/", cors: false,
  auth: { type: "api_key", user: true, valgfri: true, plassering: "basic" },
}];

Deno.test("data-loader: valgfri kilde uten nøkkel kaster ikke — via proxy uten X-Source-Key", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers as Record<string, string>) ?? {} });
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;
  const inner = encodeURIComponent("https://open.kagglefri.example/api/fil-e.csv");
  const out = await DL.resolveAndFetchLoads('# fri = ost.read("/api/hent?url=' + inner + '")',
    { fetchImpl, registry: KAGGLE_FRI_REG, keysApi: { get: () => "" } });
  assertEquals(out.loads[0].alias, "fri");
  const proxy = calls.find((c) => c.url.includes("/api/hent?url="));
  assertEquals(proxy?.headers["X-Source-Key"], undefined);
});

// Task 10: resolveAndAssemble/resolveSourcesOnly bygger lastelisten DIREKTE
// (DD.makeLoad) i stedet for å skrive en direktivstreng og parse den tilbake.
// resolveAndFetchLoads må derfor ta imot et ferdig parset objekt like godt
// som et script. NB: fersk URL — modul-cachen deler prosess (se over).
Deno.test("resolveAndFetchLoads: tar imot et ferdig parset objekt", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }))) as typeof fetch;
  // deno-lint-ignore no-explicit-any
  const parsed = (globalThis as any).DataDirectives.parse('# df = ost.read("https://parsed-obj.example/d.csv")');
  const out = await DL.resolveAndFetchLoads(parsed, { fetchImpl, registry: [] });
  assertEquals(out.loads.length, 1);
  assertEquals(out.loads[0].alias, "df");
});

Deno.test("fetchRawUrl: bytes + contentType ved 200", async () => {
  const fetchImpl = (u: string) =>
    Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  const out = await DL.fetchRawUrl("https://x.example/d.csv", { fetchImpl });
  assertEquals(new TextDecoder().decode(out.bytes), "a,b\n1,2");
  assertEquals(out.contentType.includes("text/csv"), true);
});

Deno.test("fetchRawUrl: HTTP-feil kaster med status og URL — aldri bytes fra en feilkropp", async () => {
  const fetchImpl = (u: string) =>
    Promise.resolve(new Response('{"type":"Parameter error","status":400}', { status: 400 }));
  await assertRejects(
    () => DL.fetchRawUrl("https://x.example/d.csv", { fetchImpl }),
    Error, "HTTP 400");
});

Deno.test("fetchRawUrl: TypeError (CORS/nettverk) faller tilbake på proxy", async () => {
  const calls: string[] = [];
  const fetchImpl = (u: string) => {
    calls.push(u);
    if (u.indexOf("/api/hent?") === 0)
      return Promise.resolve(new Response("x,y\n1,2\n", { status: 200, headers: { "content-type": "text/csv" } }));
    return Promise.reject(new TypeError("Failed to fetch"));
  };
  const out = await DL.fetchRawUrl("https://cors-stengt.example/d.csv", { fetchImpl });
  assertEquals(new TextDecoder().decode(out.bytes), "x,y\n1,2\n");
  assertEquals(calls[1].indexOf("/api/hent?url="), 0);
});

// S5 (smoke-revisjon): /api/hent er auth-portet — broens proxy-fallback må
// sende samme headere som direktiv-veien, ellers er den død (målt: 401 i
// smoke 6).
Deno.test("fetchRawUrl: proxy-fallback sender auth-headere (S5)", async () => {
  const seen: Array<Record<string, string>> = [];
  const fetchImpl = (u: string, init?: RequestInit) => {
    if (u.indexOf("/api/hent?") === 0) {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Promise.resolve(new Response("a,b\n1,2\n", { status: 200, headers: { "content-type": "text/csv" } }));
    }
    return Promise.reject(new TypeError("Failed to fetch"));
  };
  await DL.fetchRawUrl("https://cors.example/d.csv", { fetchImpl, anthropicKey: "sk-ant-test" });
  assertEquals(seen[0]["x-anthropic-key"], "sk-ant-test");
  await DL.fetchRawUrl("https://cors.example/d.csv", { fetchImpl, authToken: "T1", anthropicKey: "sk-ant-test" });
  assertEquals(seen[1]["authorization"], "Bearer T1");
});

// Styrte kilder (2026-08-14, Task 3): script-lagets skinne. styrtKildeFor
// er den rene matcheren; resolveAndFetchLoads/fetchRawUrl er de to
// avskjæringspunktene (plan §Task 3 — se rapporten for hvorfor akkurat
// disse to og ikke f.eks. item.url-et etter DD.resolve).
Deno.test("styrtKildeFor: prefiks + kodet form, kun styrt===true", () => {
  const reg = [
    { id: "ssb", base_url: "https://data.ssb.no/api/pxwebapi/v2/", styrt: true },
    { id: "fri", base_url: "https://api.fri.no/" },
  ];
  assertEquals(DL.styrtKildeFor("https://data.ssb.no/api/pxwebapi/v2/tables/x/data", reg)?.id, "ssb");
  assertEquals(DL.styrtKildeFor("/api/hent?url=https%3A%2F%2Fdata.ssb.no%2Fapi%2Fpxwebapi%2Fv2%2Ftables%2Fx", reg)?.id, "ssb");
  assertEquals(DL.styrtKildeFor("https://api.fri.no/x", reg), null);
  assertEquals(DL.styrtKildeFor(null, null), null);
});

// Host-match (sluttreview-fiks, finding 5): mirrors registry.ts sin
// sourceForUrl-semantikk (eksakt vert) i tillegg til prefiks/kodet-formen
// over — verifisert gap: en rå eurostat SDMX 2.1-URL deler VERT med
// base_url ("ec.europa.eu") men ikke STI (base_url peker på
// dissemination/statistics/1.0/data/, den faktiske URL-en på
// dissemination/sdmx/2.1/data/) — prefiks-sjekken alene matchet ALDRI den,
// selv om serverens probe.ts (host-basert) alt stengte den. Bevisst
// akseptert kollateral: dette utvider treffet til hele ec.europa.eu.
Deno.test("styrtKildeFor: host-match fanger eurostat sdmx/2.1 (annen sti, samme vert som base_url)", () => {
  const reg = [
    { id: "eurostat", base_url: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/", styrt: true },
  ];
  const sdmxUrl = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nrg_pc_202/?format=SDMX-CSV&geo=NO";
  assertEquals(DL.styrtKildeFor(sdmxUrl, reg)?.id, "eurostat");
  // proxy-pakket form (/api/hent?url=<kodet>) fanges likt via unwrap.
  assertEquals(DL.styrtKildeFor("/api/hent?url=" + encodeURIComponent(sdmxUrl), reg)?.id, "eurostat");
  // en annen vert treffer fortsatt ikke.
  assertEquals(DL.styrtKildeFor("https://example.org/eurostat/api/dissemination/sdmx/2.1/data/x", reg), null);
});

// Integrasjonstest: rå url-direktiv mot en styrt kildes base_url kastes FØR
// fetch (0 kall), mens adapterveien (# alias = ost.connect("<id>") + read())
// går helt uendret gjennom. «styrttest»-oppføringen har BEVISST intet
// kind-felt (speiler ess i data-sources.json i dag: tilgang="rest", ingen
// kind) — den formen som ELLERS ville havnet i akkurat den samme generiske
// fetchBytes-fallback-grenen som en rå URL. At denne testen består beviser
// at sjekken skiller «brukeren skrev en URL literal» fra «resolve() bygde
// en URL fra registeret», IKKE «har item et kind-felt».
Deno.test("styrt: rå url-direktiv kastes FØR fetch; registrert kilde (uten kind) går uendret gjennom", async () => {
  const reg = [
    { id: "styrttest", base_url: "https://data.ssb.no/api/pxwebapi/v2/", styrt: true },
  ];
  const calls: string[] = [];
  const fetchImpl = ((input: string | URL | Request) => {
    calls.push(String(input));
    return Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  }) as typeof fetch;

  const rejected = await DL.resolveAndFetchLoads(
    '# df = ost.read("https://data.ssb.no/api/pxwebapi/v2/tables/x/data")',
    { fetchImpl, registry: reg }).then(() => null, (e: Error) => e);
  if (!rejected) throw new Error("rå url-direktiv mot styrt kilde kastet ikke");
  if (!/STYRT kilde/.test(rejected.message) || !/styrttest\.read/.test(rejected.message)) {
    throw new Error("uventet feilmelding: " + rejected.message);
  }
  assertEquals(calls.length, 0);   // aldri fetchet

  const script = [
    '# styrttest = ost.connect("styrttest")',
    '# df = styrttest.read("x/data")',
  ].join("\n");
  const out = await DL.resolveAndFetchLoads(script, { fetchImpl, registry: reg });
  assertEquals(out.loads.map((o: { alias: string }) => o.alias), ["df"]);
  assertEquals(calls.length, 1);   // adapterveien fetchet normalt
});

Deno.test("fetchRawUrl: styrt kilde avvises FØR fetch (hook b — read-bridge/replay-motorenes produksjonsvei)", async () => {
  const reg = [{ id: "styrt2", base_url: "https://api.styrt2.example/", styrt: true }];
  let calls = 0;
  const fetchImpl = (() => { calls++; return Promise.resolve(new Response("x", { status: 200 })); }) as typeof fetch;
  await assertRejects(
    () => DL.fetchRawUrl("https://api.styrt2.example/x/data.csv", { fetchImpl, registry: reg }),
    Error, "STYRT kilde");
  assertEquals(calls, 0);
});

// Parquet-deteksjon (funn 2026-08-13, ESS-klassen): formatet ligger i en
// URL-KODET query-param bak /api/hent — verken .parquet-endelse eller
// parquet-content-type finnes, så sniffen falt til CSV og lesingen ga
// søppel. Nå: fileFormat=parquet i (ev. kodet) URL ELLER PAR1-magic-bytes.
Deno.test("sniffFormat: parquet via kodet fileFormat-param og PAR1-magic", () => {
  const mk = (ct: string) => new Response("", { headers: { "content-type": ct } });
  assertEquals(DL._sniffFormat(mk("application/octet-stream"),
    "/api/hent?url=https%3A%2F%2Fapi.ess.sikt.no%2Fv1%2Fdata%2FdataFile%2F10.21338%2Fess11e03_0%3FfileFormat%3Dparquet%26recodeMissingValues%3Dtrue"),
    "parquet");
  assertEquals(DL._sniffFormat(mk("application/octet-stream"),
    "https://api.ess.sikt.no/v1/data/dataFile/x?fileFormat=parquet"), "parquet");
  const par1 = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0x11]);
  assertEquals(DL._sniffFormat(mk("application/octet-stream"), "https://x/blob", undefined, par1), "parquet");
  // csv-default urørt: generisk ct + ukjent URL + ikke-PAR1-bytes
  assertEquals(DL._sniffFormat(mk("application/octet-stream"), "https://x/blob", undefined,
    new Uint8Array([0x61, 0x2c, 0x62])), "csv");
});

// ── Størrelsesvakta i den ASYNKRONE broveien (strategirunden 2026-08-16):
// python-fasaden og sync-broen fikk taket først — re-målingen av inflasjon
// krasjet fanen gjennom NETTOPP dette hullet (direktiv-veien henter via
// fetchRawUrl/fetchLoadTarget uten tak). Speiler read-bridge/openstat.py.
Deno.test("fetchRawUrl: annonsert Content-Length over taket nektes m/reparasjonshint", async () => {
  DL._setMaksUttrekkBytes(100);
  const fetchImpl = (_u: string) =>
    Promise.resolve(new Response("x", { status: 200, headers: { "content-length": "5000" } }));
  try {
    await assertRejects(
      () => DL.fetchRawUrl("https://x.example/enorm.csv", { fetchImpl }),
      Error, "Filtrer");
  } finally { DL._setMaksUttrekkBytes(null); }
});

Deno.test("fetchRawUrl: kropp over taket uten Content-Length nektes etter nedlasting", async () => {
  DL._setMaksUttrekkBytes(100);
  const fetchImpl = (_u: string) =>
    Promise.resolve(new Response("a,b\n" + "1,2\n".repeat(80), { status: 200, headers: { "content-type": "text/csv" } }));
  try {
    await assertRejects(
      () => DL.fetchRawUrl("https://x.example/enorm2.csv", { fetchImpl }),
      Error, "OOM");
  } finally { DL._setMaksUttrekkBytes(null); }
});

Deno.test("fetchRawUrl: kropp under taket passerer", async () => {
  DL._setMaksUttrekkBytes(100);
  const fetchImpl = (_u: string) =>
    Promise.resolve(new Response("a,b\n1,2", { status: 200, headers: { "content-type": "text/csv" } }));
  try {
    const out = await DL.fetchRawUrl("https://x.example/passe.csv", { fetchImpl });
    assertEquals(new TextDecoder().decode(out.bytes), "a,b\n1,2");
  } finally { DL._setMaksUttrekkBytes(null); }
});
