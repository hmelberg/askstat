import { assertEquals, assertStrictEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearRegistryCache, coerceSourcesOff, filtrerAvslatte, findSource, isSearchableSource,
  loadRegistry, parseRegistry, renderRegistryBlock, sourceForUrl, synligeKilder, type DataSource,
} from "./registry.ts";

const VALID = [{
  id: "ssb", navn: "Statistisk sentralbyrå (PxWebApi v2)", utgiver: "SSB",
  beskrivelse: "Statistics Norway — official Norwegian statistics.",
  tillit: "offisiell", tilgang: "pxweb",
  base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/",
  sok_endepunkt: "https://data.ssb.no/api/pxwebapi/v2-beta/tables?query={q}&lang=no",
  cors: true, join_nokler: ["kommunenummer", "år"],
}, {
  id: "fred", navn: "FRED", utgiver: "St. Louis Fed",
  beskrivelse: "FRED — US and international macroeconomic time series.",
  tillit: "etablert", tilgang: "rest", base_url: "https://api.stlouisfed.org/fred/", cors: false,
  auth: { type: "api_key", env: "FRED_API_KEY", plassering: "query:api_key" },
}];

// styrt-flagget (styrte kilder-runden, Task 1): GYLDIG_KILDE er en minimal
// gyldig fixture — kun de påkrevde feltene — til bruk i tester som ikke
// bryr seg om resten av registerformen.
const GYLDIG_KILDE = {
  id: "ssb", navn: "SSB", utgiver: "SSB", beskrivelse: "SSB.",
  tillit: "offisiell", tilgang: "pxweb",
  base_url: "https://data.ssb.no/api/pxwebapi/v2/", cors: true,
};

Deno.test("parseRegistry: styrt-flagget tas imot, fravær er falsy", () => {
  const [a, b] = parseRegistry([
    { ...GYLDIG_KILDE, id: "ssb", styrt: true },
    { ...GYLDIG_KILDE, id: "fri" },
  ]);
  assertEquals(a.styrt, true);
  assertEquals(!!b.styrt, false);
});

Deno.test("parseRegistry accepts valid entries", () => {
  const reg = parseRegistry(VALID);
  assertEquals(reg.length, 2);
  assertEquals(reg[0].id, "ssb");
});

Deno.test("parseRegistry rejects missing base_url and bad tillit", () => {
  assertThrows(() => parseRegistry([{ id: "x", tilgang: "rest", cors: true }]));
  assertThrows(() => parseRegistry([{ ...VALID[0], tillit: "hemmelig" }]));
  assertThrows(() => parseRegistry({ not: "an array" }));
});

// beskrivelse (kildevelger-runde 2, Task 3): PÅKREVD felt — vises i
// manager-infopanelet (js/packs.js listRegistry), ALDRI i promptens
// registerblokk (se renderRegistryBlock-testen under, urørt).
Deno.test("parseRegistry rejects entries missing beskrivelse", () => {
  const { beskrivelse: _drop, ...utenBeskrivelse } = VALID[0];
  assertThrows(() => parseRegistry([utenBeskrivelse]));
});

Deno.test("parseRegistry rejects entries with blank beskrivelse", () => {
  assertThrows(() => parseRegistry([{ ...VALID[0], beskrivelse: "   " }]));
});

Deno.test("findSource / sourceForUrl", () => {
  const reg = parseRegistry(VALID);
  assertEquals(findSource(reg, "fred")?.id, "fred");
  assertEquals(findSource(reg, "nope"), null);
  assertEquals(sourceForUrl(reg, "https://api.stlouisfed.org/fred/series?x=1")?.id, "fred");
  assertEquals(sourceForUrl(reg, "https://evil.example/fred/"), null);
  assertEquals(sourceForUrl(reg, "not a url"), null);
});

Deno.test("loadRegistry fetches once and caches", async () => {
  clearRegistryCache();
  let calls = 0;
  const fetchImpl = ((_u: string | URL | Request) => {
    calls++;
    return Promise.resolve(new Response(JSON.stringify(VALID), { status: 200 }));
  }) as typeof fetch;
  const a = await loadRegistry("https://app.test", fetchImpl);
  const b = await loadRegistry("https://app.test", fetchImpl);
  assertEquals(a.length, 2);
  assertEquals(b, a);
  assertEquals(calls, 1);
  clearRegistryCache();
});

Deno.test("renderRegistryBlock is compact and byte-stable", () => {
  const reg = parseRegistry(VALID) as DataSource[];
  const block = renderRegistryBlock(reg);
  assertEquals(block, renderRegistryBlock(reg)); // stable
  if (!block.includes("ssb") || !block.includes("søkbar")) throw new Error("mangler innhold:\n" + block);
  if (block.includes("FRED_API_KEY")) throw new Error("auth-detaljer skal ikke i prompt");
});

// beskrivelse skal ALDRI havne i den cachede prompt-registerblokka (kun i
// manager-infopanelet, klientside) — se §Designavgjørelser i planen.
Deno.test("renderRegistryBlock never includes beskrivelse", () => {
  const reg = parseRegistry(VALID) as DataSource[];
  const block = renderRegistryBlock(reg);
  if (block.includes("macroeconomic time series")) {
    throw new Error("beskrivelse lekket inn i promptblokka:\n" + block);
  }
});

// styrt-bit (sluttreview-fiks, finding 3): promptens DELIVERY-blokk sier
// "kilder merket styrt" — renderRegistryBlock må faktisk sette det merket
// for at setningen skal være verifiserbar ex ante, ikke bare sant for de
// kildene modellen tilfeldigvis møtte via probe/table_metadata-avvisning.
Deno.test("renderRegistryBlock: styrt kilde får 'styrt'-bit; ikke-styrt får det ikke", () => {
  const reg = parseRegistry([
    { ...GYLDIG_KILDE, id: "ssb", styrt: true },
    { ...GYLDIG_KILDE, id: "fri" },
  ]) as DataSource[];
  const block = renderRegistryBlock(reg);
  const ssbLine = block.split("\n").find((l) => l.includes("**ssb**"));
  const friLine = block.split("\n").find((l) => l.includes("**fri**"));
  if (!ssbLine || !/\bstyrt\b/.test(ssbLine)) throw new Error("ssb mangler styrt-bit:\n" + ssbLine);
  if (!friLine || /\bstyrt\b/.test(friLine)) throw new Error("fri feilmarkert styrt:\n" + friLine);
});

Deno.test("parseRegistry validates auth: env xor user, plassering incl. basic", () => {
  const base = { id: "k", navn: "K", utgiver: "K", beskrivelse: "K.", tillit: "etablert", tilgang: "rest",
    base_url: "https://api.k.example/", cors: false };
  // valid: user-key with basic placement
  const ok = parseRegistry([{ ...base, auth: { type: "api_key", user: true, plassering: "basic" } }]);
  assertEquals(ok[0].auth?.user, true);
  // invalid: both env and user
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", env: "X", user: true, plassering: "basic" } }]));
  // invalid: neither env nor user
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", plassering: "basic" } }]));
  // invalid: bad plassering
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", user: true, plassering: "query:" } }]));
});

Deno.test("parseRegistry rejects user-key with query-plassering (nøkkel ville havnet i URL/logg)", () => {
  const base = { id: "q", navn: "Q", utgiver: "Q", beskrivelse: "Q.", tillit: "etablert", tilgang: "rest",
    base_url: "https://api.q.example/", cors: false };
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", user: true, plassering: "query:key" } }]));
});

Deno.test("renderRegistryBlock marks user-key sources by registration state", () => {
  const reg = parseRegistry([{
    id: "kaggle", navn: "Kaggle", utgiver: "Kaggle", beskrivelse: "Kaggle Datasets.",
    tillit: "etablert", tilgang: "rest",
    base_url: "https://www.kaggle.com/api/v1/", cors: false,
    auth: { type: "api_key", user: true, plassering: "basic" },
  }]);
  const uten = renderRegistryBlock(reg);
  if (!uten.includes("IKKE registrert")) throw new Error("mangler ikke-registrert-markering:\n" + uten);
  const med = renderRegistryBlock(reg, ["kaggle"]);
  if (!med.includes("brukernøkkel (registrert)")) throw new Error("mangler registrert-markering:\n" + med);
  if (med.includes("IKKE registrert")) throw new Error("registrert kilde feilmarkert:\n" + med);
});

// Shipped-testen (kildevelger-runde 2, Task 3): tvinger alle 30 registry-
// kilder til å ha beskrivelse — parseRegistry avviser allerede manglende/tom
// beskrivelse (testen over), så dette er hovedsakelig en eksplisitt,
// lesbar bekreftelse pluss et vern mot at antallet kilder driver stille.
Deno.test("shipped data/data-sources.json parses against the schema (alle 30 kilder har beskrivelse)", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("../../../data/data-sources.json", import.meta.url)));
  const reg = parseRegistry(raw);
  assertEquals(reg.length, 30);
  for (const s of reg) {
    if (!s.beskrivelse || !s.beskrivelse.trim()) throw new Error(`kilde ${s.id} mangler beskrivelse`);
  }
});

Deno.test("parseRegistry: auth.valgfri krever user:true", () => {
  const base = { id: "k", navn: "K", utgiver: "K", beskrivelse: "K.", tillit: "etablert", tilgang: "rest",
    base_url: "https://api.k.example/", cors: false };
  const ok = parseRegistry([{ ...base, auth: { type: "api_key", user: true, valgfri: true, plassering: "basic" } }]);
  assertEquals(ok[0].auth?.valgfri, true);
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", env: "X", valgfri: true, plassering: "basic" } }]));
  assertThrows(() => parseRegistry([{ ...base, auth: { type: "api_key", user: true, valgfri: "ja", plassering: "basic" } }]));
});

Deno.test("renderRegistryBlock: valgfri-kilde markeres som brukbar uten nøkkel", () => {
  const reg = parseRegistry([{
    id: "kaggle", navn: "Kaggle", utgiver: "Kaggle", beskrivelse: "Kaggle Datasets.",
    tillit: "etablert", tilgang: "rest",
    base_url: "https://www.kaggle.com/api/v1/", cors: false,
    auth: { type: "api_key", user: true, valgfri: true, plassering: "basic" },
  }]);
  const uten = renderRegistryBlock(reg);
  if (!uten.includes("brukernøkkel valgfri")) throw new Error("mangler valgfri-markering:\n" + uten);
  if (uten.includes("IKKE registrert: ikke bygg")) throw new Error("valgfri kilde feilmarkert som ubrukelig");
  const med = renderRegistryBlock(reg, ["kaggle"]);
  if (!med.includes("valgfri (registrert)")) throw new Error("mangler registrert-markering:\n" + med);
});

// tags (kilder-profil-output-runden 2026-08-08 Task 2/3): registerposter kan
// bære tags (Task 3 fyller feltet i data-sources.json) — renderRegistryBlock
// leser feltet DEFENSIVT: fravær = ingen suffiks, aldri en kastet feil.
Deno.test("renderRegistryBlock: kilde MED tags får ' [tag1] [tag2]'-suffiks", () => {
  const reg = parseRegistry([{ ...VALID[0], tags: ["makro", "offisiell-stat"] }]) as DataSource[];
  const block = renderRegistryBlock(reg);
  if (!block.includes("[makro] [offisiell-stat]")) throw new Error("mangler tag-suffiks:\n" + block);
});

Deno.test("renderRegistryBlock: kilde UTEN tags (fravær) får ingen suffiks", () => {
  const reg = parseRegistry(VALID) as DataSource[];
  const block = renderRegistryBlock(reg);
  if (block.includes("[")) throw new Error("uventet '['-tegn uten tags:\n" + block);
});

Deno.test("renderRegistryBlock: tomt tags-array og ikke-string-elementer håndteres defensivt", () => {
  const reg = parseRegistry([
    { ...VALID[0], tags: [] },
    { ...VALID[1], tags: ["mikro", 42, null, "  "] as unknown as string[] },
  ]) as DataSource[];
  const block = renderRegistryBlock(reg);
  if (!block.includes("[mikro]")) throw new Error("gyldig tag droppet:\n" + block);
  if (block.includes("[42]") || block.includes("[null]")) {
    throw new Error("ikke-string tag lekket inn:\n" + block);
  }
});

Deno.test("renderRegistryBlock marks kind=apd as søkbar even without sok_endepunkt", () => {
  const reg = parseRegistry([{
    id: "apd", navn: "APD", utgiver: "apd-core", beskrivelse: "Awesome Public Datasets.",
    tillit: "funnet", tilgang: "fil",
    kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false,
  }]);
  const block = renderRegistryBlock(reg);
  if (!block.includes("søkbar via search_catalog")) throw new Error("apd skal markeres søkbar:\n" + block);
});

Deno.test("isSearchableSource: sok_endepunkt, kjent kind, eller sdmx+id i SDMX_STRUCTURE_ACCEPT", () => {
  const reg = parseRegistry([
    { id: "ssb", navn: "SSB", utgiver: "SSB", beskrivelse: "SSB.", tillit: "offisiell", tilgang: "pxweb",
      base_url: "https://data.ssb.no/api/pxwebapi/v2-beta/",
      sok_endepunkt: "https://data.ssb.no/api/pxwebapi/v2-beta/tables?query={q}&lang=no", cors: true },
    { id: "apd", navn: "APD", utgiver: "apd-core", beskrivelse: "APD.", tillit: "funnet", tilgang: "fil",
      kind: "apd", base_url: "https://github.com/awesomedata/apd-core", cors: false },
    { id: "norgesbank", navn: "Norges Bank", utgiver: "Norges Bank", beskrivelse: "Norges Bank.", tillit: "offisiell",
      tilgang: "sdmx", kind: "sdmx", base_url: "https://data.norges-bank.no/api/data/", cors: true },
    { id: "ecb", navn: "ECB", utgiver: "ECB", beskrivelse: "ECB.", tillit: "offisiell", tilgang: "sdmx", kind: "sdmx",
      base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
    { id: "owid", navn: "OWID", utgiver: "OWID", beskrivelse: "OWID.", tillit: "etablert", tilgang: "fil",
      base_url: "https://ourworldindata.org/grapher/", cors: true },
  ]);
  assertEquals(isSearchableSource(reg[0]), true);  // sok_endepunkt
  assertEquals(isSearchableSource(reg[1]), true);  // kind apd
  assertEquals(isSearchableSource(reg[2]), true);  // sdmx + norgesbank i SDMX_STRUCTURE_ACCEPT
  assertEquals(isSearchableSource(reg[3]), true);  // sdmx + ecb er nå i SDMX_XML_SOURCES (XML-adapter)
  assertEquals(isSearchableSource(reg[4]), false); // verken sok_endepunkt, kjent kind, eller sdmx
});

Deno.test("isSearchableSource: ecb blir søkbar etter XML-støtte (SDMX_XML_SOURCES)", () => {
  const reg = parseRegistry([
    { id: "ecb", navn: "ECB", utgiver: "ECB", beskrivelse: "ECB.", tillit: "offisiell", tilgang: "sdmx", kind: "sdmx",
      base_url: "https://data-api.ecb.europa.eu/service/data/", cors: true },
  ]);
  assertEquals(isSearchableSource(reg[0]), true);
});

Deno.test("synligeKilder: filtrerer env-nøkkel-kilder ut av PROMPT-lista når nøkkelen mangler, lar andre stå", () => {
  const reg = parseRegistry([
    { id: "datacommons", navn: "Google Data Commons", utgiver: "Google", beskrivelse: "Data Commons.", tillit: "etablert",
      tilgang: "rest", kind: "datacommons", base_url: "https://api.datacommons.org/v2/", cors: true,
      auth: { type: "api_key", env: "DATACOMMONS_API_KEY", plassering: "query:key" } },
    { id: "census", navn: "US Census PUMS", utgiver: "Census", beskrivelse: "Census PUMS.", tillit: "offisiell",
      tilgang: "rest", base_url: "https://api.census.gov/", cors: true,
      auth: { type: "api_key", env: "CENSUS_API_KEY", plassering: "query:key" } },
    VALID[0],
  ]) as DataSource[];
  const uten = synligeKilder(reg, () => false);
  assertEquals(uten.map((s) => s.id), ["ssb"]);
  // Delvis: kun kilden med manglende nøkkel filtreres.
  const delvis = synligeKilder(reg, (env) => env === "CENSUS_API_KEY");
  assertEquals(delvis.map((s) => s.id), ["census", "ssb"]);
});

Deno.test("synligeKilder: med alle nøkler — alt blir stående, reg uendret", () => {
  const reg = parseRegistry([
    { id: "datacommons", navn: "Google Data Commons", utgiver: "Google", beskrivelse: "Data Commons.", tillit: "etablert",
      tilgang: "rest", kind: "datacommons", base_url: "https://api.datacommons.org/v2/", cors: true,
      auth: { type: "api_key", env: "DATACOMMONS_API_KEY", plassering: "query:key" } },
    VALID[0],
  ]) as DataSource[];
  const med = synligeKilder(reg, () => true);
  assertEquals(med, reg);
  assertEquals(med.map((s) => s.id), ["datacommons", "ssb"]);
});

Deno.test("synligeKilder: brukernøkkel-kilder (auth.user) berøres ALDRI — kun env-kilder filtreres", () => {
  const reg = parseRegistry([
    { id: "ipums", navn: "IPUMS", utgiver: "IPUMS", beskrivelse: "IPUMS.", tillit: "etablert",
      tilgang: "rest", base_url: "https://api.ipums.org/", cors: false,
      auth: { type: "api_key", user: true, plassering: "header:Authorization" } },
    VALID[0],
  ]) as DataSource[];
  assertEquals(synligeKilder(reg, () => false), reg);
  assertEquals(synligeKilder(reg, () => true), reg);
});

// coerceSourcesOff (kildevelger-runde 2, Task 3): serveren stoler ALDRI på
// klienten — samme regex/tak som js/profiles.js håndhever klientside
// (SOURCES_OFF_ID_RE/SOURCES_OFF_MAX), men validert på nytt her.
Deno.test("coerceSourcesOff: ikke-array input gir tom liste", () => {
  assertEquals(coerceSourcesOff(undefined), []);
  assertEquals(coerceSourcesOff(null), []);
  assertEquals(coerceSourcesOff("dbnomics"), []);
  assertEquals(coerceSourcesOff({ 0: "dbnomics" }), []);
  assertEquals(coerceSourcesOff(42), []);
});

Deno.test("coerceSourcesOff: filtrerer mot regex ^[a-z0-9_-]{1,32}$ og dropper ikke-strings", () => {
  const input = [
    "dbnomics", "SSB", "has space", "æøå", "a".repeat(33), "a".repeat(32),
    "kind-med_bindestrek09", "", 42, null, undefined, { id: "x" }, ["y"],
  ];
  assertEquals(coerceSourcesOff(input), ["dbnomics", "a".repeat(32), "kind-med_bindestrek09"]);
});

Deno.test("coerceSourcesOff: kutter ved 40 (tak)", () => {
  const input = Array.from({ length: 45 }, (_, i) => `src${i}`);
  const out = coerceSourcesOff(input);
  assertEquals(out.length, 40);
  assertEquals(out, input.slice(0, 40));
});

// filtrerAvslatte (kildevelger-runde 2, Task 3): loadRegistry cacher
// modul-globalt (samme array-referanse ved hvert kall) — funksjonen må
// ALDRI mutere reg-argumentet, ellers forsvinner kilden permanent for alle
// senere spørringer i samme edge-instans.
Deno.test("filtrerAvslatte: fjerner oppgitte ider", () => {
  const reg = parseRegistry(VALID);
  const out = filtrerAvslatte(reg, ["fred"]);
  assertEquals(out.map((s) => s.id), ["ssb"]);
});

Deno.test("filtrerAvslatte: ignorerer ukjente ider (ingen feil, ingen effekt)", () => {
  const reg = parseRegistry(VALID);
  const out = filtrerAvslatte(reg, ["ikke-en-kilde", "heller-ikke"]);
  assertEquals(out.map((s) => s.id), ["ssb", "fred"]);
});

Deno.test("filtrerAvslatte: muterer ALDRI input-arrayen (loadRegistry-cachen)", () => {
  const reg = parseRegistry(VALID);
  const before = reg.slice();
  filtrerAvslatte(reg, ["fred"]);
  assertEquals(reg, before);
  assertEquals(reg.length, 2);
});

Deno.test("filtrerAvslatte: tom off gir SAMME referanse (ingen unødvendig kopi)", () => {
  const reg = parseRegistry(VALID);
  assertStrictEquals(filtrerAvslatte(reg, []), reg);
});

Deno.test("filtrerAvslatte: ikke-tom off gir NY array (selv om ingen treff)", () => {
  const reg = parseRegistry(VALID);
  const out = filtrerAvslatte(reg, ["ukjent"]);
  assertEquals(out, reg);
  if (out === reg) throw new Error("filtrerAvslatte returnerte samme referanse med ikke-tom off");
});
