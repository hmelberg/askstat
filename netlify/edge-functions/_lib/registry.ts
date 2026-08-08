// Curated data-source registry for the data route in /api/svar
// (design: docs/superpowers/specs/2026-07-29-samlet-ask-pipeline-design.md).
// The JSON file is served statically (like variable_metadata.json); this module
// loads, validates and caches it, and renders the compact prompt block.

export interface SourceAuth {
  type: "api_key";
  env?: string;       // Netlify env var (site-nøkkel) — gjensidig utelukkende med user
  user?: boolean;     // true = brukernøkkel via X-Source-Key (js/keys.js), injiseres av /api/hent
  valgfri?: boolean;  // kun med user:true — nøkkel valgfri (anonym tilgang mulig)
  plassering: string; // "query:<param>" | "header:<name>" | "basic"
}

export interface DataSource {
  id: string;
  navn: string;
  utgiver: string;
  beskrivelse: string; // engelsk én-linjer, brukervendt — KUN manager-infopanelet (js/packs.js), aldri promptens registerblokk (renderRegistryBlock under)
  tillit: "offisiell" | "etablert" | "funnet";
  tilgang: "pxweb" | "sdmx" | "rest" | "ckan" | "fil";
  kind?: string;
  base_url: string;
  sok_endepunkt?: string;
  cors: boolean;
  join_nokler?: string[];
  oppskrift?: Record<string, string>;
  sporrings_url_mal?: string;
  auth?: SourceAuth;
  nokkel_hint?: string;
  quirks?: string;
  guide?: boolean;  // true = data/source-guides/<id>.md finnes; se source-guides.ts
}

const TILLIT = new Set(["offisiell", "etablert", "funnet"]);
const TILGANG = new Set(["pxweb", "sdmx", "rest", "ckan", "fil"]);

export function parseRegistry(json: unknown): DataSource[] {
  if (!Array.isArray(json)) throw new Error("registeret må være en JSON-liste");
  return json.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    for (const field of ["id", "navn", "utgiver", "beskrivelse", "tillit", "tilgang", "base_url"]) {
      if (typeof e[field] !== "string" || !(e[field] as string).trim()) {
        throw new Error(`kilde #${i}: mangler/ugyldig felt '${field}'`);
      }
    }
    if (!TILLIT.has(e.tillit as string)) throw new Error(`kilde ${e.id}: ukjent tillit '${e.tillit}'`);
    if (!TILGANG.has(e.tilgang as string)) throw new Error(`kilde ${e.id}: ukjent tilgang '${e.tilgang}'`);
    if (typeof e.cors !== "boolean") throw new Error(`kilde ${e.id}: 'cors' må være boolsk`);
    new URL(e.base_url as string); // throws on invalid
    if (e.auth !== undefined) {
      const a = e.auth as Record<string, unknown>;
      if (a.type !== "api_key") throw new Error(`kilde ${e.id}: ukjent auth.type '${a.type}'`);
      const plass = a.plassering;
      const okPlass = typeof plass === "string" &&
        (/^(query|header):.+$/.test(plass) || plass === "basic");
      if (!okPlass) throw new Error(`kilde ${e.id}: ugyldig auth.plassering '${plass}'`);
      const hasEnv = typeof a.env === "string" && !!(a.env as string).trim();
      if (hasEnv === (a.user === true)) {
        throw new Error(`kilde ${e.id}: auth må ha nøyaktig én av env eller user:true`);
      }
      if (a.user === true && typeof plass === "string" && plass.startsWith("query:")) {
        throw new Error(`kilde ${e.id}: brukernøkkel kan ikke ha query-plassering (nøkkel ville havnet i URL og logger)`);
      }
      if (a.valgfri !== undefined && (a.valgfri !== true || a.user !== true)) {
        throw new Error(`kilde ${e.id}: auth.valgfri krever user:true (og må være true)`);
      }
    }
    return e as unknown as DataSource;
  });
}

let _cache: DataSource[] | null = null;
export function clearRegistryCache(): void { _cache = null; }

export async function loadRegistry(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DataSource[]> {
  if (_cache) return _cache;
  const res = await fetchImpl(new URL("/data/data-sources.json", origin).toString());
  if (!res.ok) throw new Error(`kunne ikke hente data-sources.json: ${res.status}`);
  _cache = parseRegistry(await res.json());
  return _cache;
}

export function findSource(reg: DataSource[], id: string): DataSource | null {
  return reg.find((s) => s.id === id) ?? null;
}

/** Exact host match against base_url — the guard for server-side key injection. */
export function sourceForUrl(reg: DataSource[], url: string): DataSource | null {
  let host: string;
  try { host = new URL(url).host; } catch { return null; }
  return reg.find((s) => {
    try { return new URL(s.base_url).host === host; } catch { return false; }
  }) ?? null;
}

/** Accept-header for SDMX-strukturspørringer (dataflow-liste/DSD), PER
 *  KILDE-ID — versjonsstrengen avviker mellom leverandører (406 ellers).
 *  ECB er BEVISST UTELATT: mangler JSON-støtte for strukturspørringer,
 *  kun XML — se docs/superpowers/specs/2026-07-25-source-catalog-adapters-design.md §1a. */
export const SDMX_STRUCTURE_ACCEPT: Record<string, string> = {
  norgesbank: "application/vnd.sdmx.structure+json;version=1.0.0",
  oecd: "application/vnd.sdmx.structure+json;version=1.0",
};

/** SDMX-kilder som KUN støtter XML for strukturspørringer (ingen JSON) —
 *  ecbSearch/ecbMetadata (search-catalog.ts/table-metadata.ts) håndterer
 *  disse via fast-xml-parser. Verifisert 2026-07-25, se spec §8. */
export const SDMX_XML_SOURCES = new Set(["ecb"]);

const SEARCHABLE_KINDS = new Set(["apd", "statfin", "dst", "fhi", "nada", "cessda"]);

/** Én kilde til sannhet for "er denne kilden søkbar via search_catalog?" —
 *  brukt BÅDE av renderRegistryBlock (prompt-hintet) og av search_catalog
 *  sin dispatch-vakt, slik at de to ikke kan drifte fra hverandre. */
export function isSearchableSource(src: DataSource): boolean {
  if (src.sok_endepunkt) return true;
  if (src.tilgang === "sdmx" && (src.id in SDMX_STRUCTURE_ACCEPT || SDMX_XML_SOURCES.has(src.id))) return true;
  if (src.kind && SEARCHABLE_KINDS.has(src.kind)) return true;
  return false;
}

/** Compact registry rendering for the cached system prefix. No auth secrets.
 *  userKeys = registrerte brukernøkkel-kilde-ider (fra available_keys) — bare
 *  ider, aldri verdier; styrer om en user-auth-kilde framstår som brukbar. */
export function renderRegistryBlock(reg: DataSource[], userKeys: string[] = []): string {
  const lines = reg.map((s) => {
    const bits = [`${s.tilgang}, base ${s.base_url}`];
    if (isSearchableSource(s)) bits.push("søkbar via search_catalog");
    if (s.guide) bits.push("kildeguide følger med første search_catalog/table_metadata-svar (også ved feil)");
    if (s.auth?.user && s.auth.valgfri) {
      bits.push(userKeys.includes(s.id)
        ? "brukernøkkel valgfri (registrert) → hentes alltid via /api/hent"
        : "brukernøkkel valgfri — offentlige datasett kan hentes uten nøkkel; privat-/konkurransedata krever registrert nøkkel (AI-innstillingene)");
    } else if (s.auth?.user) {
      bits.push(userKeys.includes(s.id)
        ? "krever brukernøkkel (registrert) → hentes alltid via /api/hent"
        : "krever brukernøkkel — IKKE registrert: ikke bygg svaret på denne kilden; nevn i så fall at nøkkel kan registreres i AI-innstillingene");
    } else if (s.auth) {
      bits.push("krever nøkkel → hentes alltid via /api/hent");
    }
    if (!s.cors) bits.push("ikke CORS → /api/hent");
    if (s.join_nokler?.length) bits.push(`join: ${s.join_nokler.join(", ")}`);
    const quirks = s.quirks ? ` — ${s.quirks}` : "";
    return `- **${s.id}** (${s.navn}; ${s.tillit}): ${bits.join("; ")}${quirks}`;
  });
  return `## Kilderegister (kuratert)\n\n${lines.join("\n")}`;
}

/** Kilder synlige i registerblokka i PROMPTEN (renderRegistryBlock-input) —
 *  filtrerer ut ENHVER kilde med auth.env der nøkkelen mangler i miljøet
 *  (datacommons, census, fred, …): samme stille-fraværende-prinsippet som
 *  søkearmen (Task 6, dcSearch registreres KUN med nøkkelen til stede).
 *  Uten dette var kilden synlig-men-502 — modellen fikk se den i registeret
 *  og kunne bygge et svar rundt en kilde som garantert feiler serverside
 *  («Nøkkel for <id> er ikke konfigurert», hent-core.ts). Ren funksjon
 *  (tar en nøkkel-sjekk som parameter i stedet for å lese Deno.env selv) —
 *  kalleren (svar.ts) sjekker miljøet; dette holder funksjonen
 *  node/deno-testbar uten env-oppsett. Brukernøkkel-kilder (auth.user)
 *  berøres IKKE — de skal stå synlige med «nøkkel kan registreres»-hintet.
 *  Rører ALDRI reg selv — kun listen SENDT til renderRegistryBlock. Den fulle
 *  reg-arrayen brukes fortsatt uendret til verktøy-dispatch/searchDatasets
 *  (hent-core sin egen env-sjekk er uendret og kaster sin egen norske feil
 *  om modellen likevel prøver). */
export function synligeKilder(reg: DataSource[], harNokkel: (env: string) => boolean): DataSource[] {
  return reg.filter((s) => !s.auth?.env || harNokkel(s.auth.env));
}

// Samme regex/tak som js/profiles.js håndhever klientside (SOURCES_OFF_ID_RE/
// SOURCES_OFF_MAX, kildevelger-runde 2 Task 1) — serveren stoler ALDRI på
// klienten og validerer sources_off-feltet på nytt her.
const SOURCES_OFF_ID_RE = /^[a-z0-9_-]{1,32}$/;
const SOURCES_OFF_MAX = 40;

/** Klient-clampet av-skrudde kilde-ider fra body.sources_off (ukjent JSON) —
 *  samme filter-så-slice-mønster som available_keys i svar.ts. Ugyldige
 *  verdier (ikke-strings, feil form, for lange) filtreres stille bort
 *  fremfor å kaste — samme stille-toleranse-prinsipp som resten av
 *  body-parsingen i svar.ts. */
export function coerceSourcesOff(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && SOURCES_OFF_ID_RE.test(x))
    .slice(0, SOURCES_OFF_MAX);
}

/** Filtrerer registeret mot av-skrudde kilde-ider — IKKE-MUTERENDE og med
 *  vilje "for streng" om referanse-identitet: loadRegistry cacher
 *  modul-globalt (ÉN array-referanse delt av ALLE spørringer i samme
 *  edge-instans), så en in-place-mutasjon her ville fjernet kilden
 *  PERMANENT for alle senere brukere, ikke bare denne spørringen. Tom off
 *  returnerer SAMME referanse (vanligste kall — ingen kilder avskrudd,
 *  ingen grunn til å kopiere); ellers en NY array via .filter (som aldri
 *  rører originalen). Ukjente ider i off (kilde funnet ikke i reg) er en
 *  stille no-op — ingen feil. */
export function filtrerAvslatte(reg: DataSource[], off: string[]): DataSource[] {
  if (off.length === 0) return reg;
  const offSet = new Set(off);
  return reg.filter((s) => !offSet.has(s.id));
}
