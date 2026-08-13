// /api/svar — samlet ask-pipeline: ETT agentisk løp med run_code som
// klientutført verktøy. Erstatter data-svar + tolk-ask.
// Spec: docs/superpowers/specs/2026-07-29-samlet-ask-pipeline-design.md
import { adminGate, extractByokKey, extractLlmKey } from "./_lib/auth.ts";
import { type AgenticResumeState, runAgenticStream } from "./_lib/anthropic.ts";
import { coerceSourcesOff, filtrerAvslatte, loadRegistry, renderRegistryBlock, synligeKilder } from "./_lib/registry.ts";
import { makeGuideAttacher, medGuideVedFeil } from "./_lib/source-guides.ts";
import { searchCatalog } from "./_lib/tools/search-catalog.ts";
import { tableMetadata } from "./_lib/tools/table-metadata.ts";
import { coerceScope, searchDatasets } from "./_lib/tools/search-datasets.ts";
import { probeUrl } from "./_lib/tools/probe.ts";
import { injectBeforeDone } from "./_lib/sse-util.ts";
import {
  buildRouteToolDefs, buildSvarSystem, coerceDataMode, coerceDepth,
  coercePacks, coerceRoute, depthClientToolCalls, depthRunCodeCalls,
  GET_PACK_TOOL, progressLabel, questionTurn,
} from "./_lib/svar-prompt.ts";
import { searchLiterature } from "./_lib/tools/search-literature.ts";
import { parseProviderConfig } from "./_lib/providers/config.ts";
import { runProviderAgenticStream } from "./_lib/providers/agentic.ts";
import { makeOpenAiCompatTurn } from "./_lib/providers/openai-compat.ts";
import { makeOpenAiResponsesTurn } from "./_lib/providers/openai-responses.ts";
import { coerceRunOkCalls, filtrerRunCode, klassifiserRunResult, medPaaminnelse } from "./_lib/run-disiplin.ts";

interface ResumeBody { state?: AgenticResumeState; probed?: unknown; run_ok_calls?: unknown; }
interface RequestBody {
  question?: string;
  route?: string;
  mode?: string;
  depth?: string;
  script?: string;
  available_keys?: unknown;
  preferences?: unknown;
  packs?: unknown;
  sources_off?: unknown;
  guides_off?: unknown;
  user_keys?: unknown;
  discover?: unknown;
  provider?: unknown;
  resume?: ResumeBody;
  run_result?: string;
  get_pack_result?: unknown;
}

// Resume-bodies bærer hele samtaletilstanden (tool-results, websøk-blokker).
const MAX_BODY_BYTES = 2_000_000;

// Eksportert for direkte node/deno-test (review-funn 2026-08-06 #1) — den
// eneste garantien for at et resume-objekt som PASSERER valideringen faktisk
// også REKONSTRUERES korrekt (rebuildResumeState under) er å teste paret.
export function validResumeState(s: AgenticResumeState | undefined): s is AgenticResumeState {
  if (!s || !Array.isArray(s.messages) || s.messages.length < 1 || s.messages.length > 400) return false;
  if (!Number.isInteger(s.turn) || s.turn < 1 || s.turn > 64) return false;
  if (!Number.isInteger(s.clientCalls) || s.clientCalls < 0 || s.clientCalls > 200) return false;
  if (s.runCalls !== undefined && (!Number.isInteger(s.runCalls) || s.runCalls < 0 || s.runCalls > 50)) return false;
  // getPackCalls (review-funn 2026-08-06 #3): egen teller, samme grenser som
  // runCalls — se anthropic.ts sin AgenticResumeState.getPackCalls.
  if (s.getPackCalls !== undefined &&
    (!Number.isInteger(s.getPackCalls) || s.getPackCalls < 0 || s.getPackCalls > 50)) return false;
  if (s.prevResponseId !== undefined &&
    (typeof s.prevResponseId !== "string" || s.prevResponseId.length > 200)) return false;
  if (s.pending !== undefined) {
    const p = s.pending as Record<string, unknown>;
    if (!p || typeof p.awaitingId !== "string" || p.awaitingId.length > 200 ||
      !Array.isArray(p.results) || (p.results as unknown[]).length > 20) return false;
    // name/expectedId (get_pack — kontekstrunden fase 2 §4): valgfrie, men
    // strengformet og lengdebegrenset når de foreligger.
    if (p.name !== undefined && (typeof p.name !== "string" || p.name.length > 20)) return false;
    if (p.expectedId !== undefined && (typeof p.expectedId !== "string" || p.expectedId.length > 100)) return false;
  }
  return typeof s.usage === "object" && s.usage !== null;
}

// Ren rekonstruksjon av resume-state fra klientens (allerede
// validResumeState-sjekkede) JSON — eksportert og node/deno-testet direkte
// (review-funn 2026-08-06 #1). `pending` kopieres som ETT objekt, ALDRI
// felt-for-felt (i motsetning til `usage` under, som bevisst whitelister
// tallfelt) — en felt-for-felt-omskriving her ville stille droppet
// pending.name/expectedId og latt HVER get_pack-runde dø med «mangler
// run_result», med en grønn test-suite (siden begge protokolltestene i
// anthropic.test.ts/agentic.test.ts kaller løkkene direkte og aldri går
// via denne funksjonen).
export function rebuildResumeState(s: AgenticResumeState): AgenticResumeState {
  const u = s.usage as Record<string, unknown>;
  return {
    messages: s.messages,
    turn: s.turn,
    clientCalls: s.clientCalls,
    runCalls: s.runCalls,
    getPackCalls: s.getPackCalls,
    pending: s.pending,
    prevResponseId: s.prevResponseId,
    usage: {
      inputTokens: Number(u.inputTokens) || 0,
      outputTokens: Number(u.outputTokens) || 0,
      cacheReadTokens: Number(u.cacheReadTokens) || 0,
      cacheCreationTokens: Number(u.cacheCreationTokens) || 0,
    },
  };
}

export default async (request: Request): Promise<Response> => {
  // Ratelimiten teller SPØRSMÅL: continuation-hops er samme spørsmål, derfor
  // hoppes den over når klienten hevder å fortsette en påbegynt kjøring. Denne
  // avgjørelsen tas FØR body er lest, så den kan ikke selv sjekke at det
  // faktisk foreligger et resume-objekt — det håndheves nedenfor, rett etter
  // JSON-parsingen, så en FERSK spørring med kun headeren (+ en velformet
  // nøkkel) ikke slipper forbi ratelimiten. Merk: resume-state er fortsatt
  // usignert (ingen HMAC) — en klient som SENDER et resume-objekt kan
  // fremdeles forfalske det for å hoppe over ratelimiten på et nytt
  // spørsmål; det er en dokumentert gjenværende risiko (roadmap: HMAC over
  // state).
  const svarResumeHeader = request.headers.get("x-svar-resume") === "1";
  const gateResp = await adminGate(request, {
    endpoint: "svar",
    maxBodyBytes: MAX_BODY_BYTES,
    allowByok: true,
    allowLlmKey: true,
    skipRateLimit: svarResumeHeader,
  });
  if (gateResp) return gateResp;

  let body: RequestBody;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (svarResumeHeader && !body.resume) {
    return new Response("X-Svar-Resume krever resume-state", { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return new Response("Missing question", { status: 400 });

  let resumeState: AgenticResumeState | undefined;
  if (body.resume) {
    if (!validResumeState(body.resume.state)) {
      return new Response("Invalid resume payload", { status: 400 });
    }
    resumeState = rebuildResumeState(body.resume.state);
  }
  const runResult = typeof body.run_result === "string"
    ? body.run_result.slice(0, 30_000)
    : undefined;
  // get_pack-protokollen (kontekstrunden fase 2 §4, speiler run_result over):
  // resume-feltet klienten fyller etter Packs.fullTextFor(id) — id-match mot
  // den utestående forespørselen håndheves i runAgenticStream (state.pending).
  const rawGetPackResult = body.get_pack_result as Record<string, unknown> | undefined;
  const getPackResult = rawGetPackResult && typeof rawGetPackResult === "object"
    ? {
      id: String(rawGetPackResult.id ?? "").slice(0, 100),
      text: String(rawGetPackResult.text ?? "").slice(0, 40_000),
    }
    : undefined;

  // Run-disiplin (spec 2026-08-04-lokke-niva): suksess-teller i resume-
  // SIDEKANALEN (probed-mønsteret — løkka er uvitende). Påminnelse på
  // suksess-hop #1; run_code filtreres fra verktøylistene fra suksess #2.
  let runOkCalls = coerceRunOkCalls(body.resume?.run_ok_calls);
  let runResultTilLopet = runResult;
  if (runResult !== undefined && klassifiserRunResult(runResult) === "ok") {
    runOkCalls += 1;
    if (runOkCalls === 1) runResultTilLopet = medPaaminnelse(runResult);
  }

  const provider = parseProviderConfig(body.provider, request);
  if (provider && "error" in provider) return provider.error;
  if (!extractByokKey(request) && extractLlmKey(request) && !provider) {
    return new Response("X-Llm-Key krever komplett leverandørkonfigurasjon (provider-feltet i forespørselen)", { status: 401 });
  }

  const byokKey = extractByokKey(request);
  const apiKey = provider ? provider.key : (byokKey ?? Deno.env.get("ANTHROPIC_API_KEY"));
  const model = provider
    ? provider.model
    : (Deno.env.get("DATA_SVAR_MODEL") ?? Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6");
  if (!apiKey) {
    console.error("svar: mangler API-nøkkel (env ANTHROPIC_API_KEY eller leverandørnøkkel)");
    return new Response("Server configuration error", { status: 500 });
  }

  const route = coerceRoute(body.route);
  const mode = coerceDataMode(body.mode);
  const depth = coerceDepth(body.depth);

  // get_pack er kun aktuelt i data-ruten (packs-blokka rendres KUN der, se
  // buildSvarSystem). Pakkesplitting (spec 2026-08-07 §2): verktøyet følger
  // nå ALLE valgte pakker — oversiktspakker refererer enkeltkildepakker med
  // (id: src-…)-notasjon som modellen skal kunne hente uavhengig av
  // nedgradering.
  const needsGetPack = route === "data" && coercePacks(body.packs).length > 0;
  const withGetPackTool = (tools: unknown[]): unknown[] =>
    needsGetPack ? [...tools, GET_PACK_TOOL] : tools;

  // Registeret trengs bare i data-ruten (beregning/oppslag har verken
  // katalogverktøy eller registerblokk i prompten) — sparer et nettkall.
  const origin = new URL(request.url).origin;
  let registryBlock = "";
  let registry: Awaited<ReturnType<typeof loadRegistry>> | null = null;
  // sourcesOff: coercet ÉN gang her (gjenbrukes av search_datasets-deps
  // under) — å kalle coerceSourcesOff(body.sources_off) på nytt der ville
  // vært en unødvendig dobbel-parsing av samme rå body-felt.
  let sourcesOff: string[] = [];
  if (route === "data") {
    try { registry = await loadRegistry(origin); } catch (e) {
      console.error("svar: registry load failed:", e);
      return new Response("Kilderegister utilgjengelig", { status: 502 });
    }
    // sources_off (kildevelger-runde 2, Task 3): filtrerer registeret RETT
    // ETTER loadRegistry, FØR noe annet leser `registry`-variabelen — dette
    // ENE punktet dekker derfor BÅDE registerblokka (renderRegistryBlock
    // under) OG hele executeTool-dispatchen lenger ned (search_catalog/
    // table_metadata/search_datasets/probe leser alle `registry` direkte),
    // uten at hver gren må huske å filtrere selv. filtrerAvslatte er
    // ikke-muterende (loadRegistry cacher modul-globalt — én mutasjon her
    // ville fjernet kilden PERMANENT for alle senere spørringer i samme
    // edge-instans) og returnerer samme referanse når ingen kilder er
    // skrudd av. hent.ts (den separate proxy-funksjonen) er UBERØRT — den
    // kjenner ikke sources_off og skal ikke gjøre det (Designavgjørelser).
    sourcesOff = coerceSourcesOff(body.sources_off);
    registry = filtrerAvslatte(registry, sourcesOff);
    const availableKeys = Array.isArray(body.available_keys)
      ? (body.available_keys as unknown[])
        .filter((k): k is string => typeof k === "string" && /^[a-z0-9_-]{1,32}$/.test(k))
        .slice(0, 20)
      : [];
    // synligeKilder: env-nøkkel-kilder (datacommons, census, fred, …) ute av
    // PROMPT-blokka når nøkkelen mangler — samme stille-fraværende-prinsipp
    // som søkearmen (Task 6). `registry` selv (brukt til verktøy-dispatch/
    // searchDatasets under) er UENDRET — kun listen som faktisk sendes til
    // renderRegistryBlock er filtrert.
    registryBlock = renderRegistryBlock(
      synligeKilder(registry, (env) => !!Deno.env.get(env)), availableKeys);
  }

  const memoryUrls = provider ? provider.webSearch === "none" : false;
  // Utvidet søk (kontekstrunden fase 2 §5): eksplisitt streng boolean —
  // klienten sender kun true|undefined (js/ai-chat.js payload), men body er
  // ukjent JSON, så === true holder DISCOVER-blokka unna en tilfeldig
  // truthy-verdi (f.eks. "false" som streng).
  const discover = body.discover === true;
  const system = buildSvarSystem(route, mode, registryBlock, {
    memoryUrls, depth, preferences: body.preferences, packs: body.packs, discover, userKeys: body.user_keys,
  });

  const probed: { url: string; ok: boolean; cors: boolean; viaProxy: boolean }[] = [];
  if (body.resume && Array.isArray(body.resume.probed)) {
    for (const p of (body.resume.probed as Record<string, unknown>[]).slice(0, 60)) {
      if (p && typeof p.url === "string") {
        probed.push({ url: p.url, ok: !!p.ok, cors: !!p.cors, viaProxy: !!p.viaProxy });
      }
    }
  }

  // guides_off (spec 2026-08-13 §8): fortrenger KUN den late guiden for
  // kilder brukeren har aktiv egen kopi av — verktøy-dispatchen og
  // registerblokka er med vilje urørt (motsatsen til sources_off over).
  // coerceSourcesOff gjenbrukes: identisk id-form og tak.
  const attachGuide = makeGuideAttacher(origin, fetch, new Set(coerceSourcesOff(body.guides_off)));

  const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === "search_datasets" && registry) {
      // sourcesOff: samme av-skrudde kilde-ider som filtrerAvslatte brukte på
      // registeret over — search_datasets har EGNE direktearmer (worldbank/
      // eurostat/dbnomics/owid/datacommons/cessda) som ikke leser `registry`
      // og derfor ikke automatisk respekterer filtreringen (sluttreview-funn).
      return JSON.stringify(await searchDatasets(
        String(input.query ?? ""), coerceScope(input.scope), { registry, origin, sourcesOff },
      ));
    }
    if (name === "search_catalog" && registry) {
      const sourceId = String(input.source ?? "");
      // medGuideVedFeil: fn() kaster for kilder uten søkeadapter (f.eks.
      // eurostat/ipums) — fanges der og omgjøres til {feil, guide} NÅR
      // kilden har guide:true, ellers kastes uendret (se source-guides.ts).
      const r = await medGuideVedFeil(sourceId, registry, attachGuide, async () => {
        const hits = await searchCatalog(sourceId, String(input.query ?? ""), { registry, origin });
        // searchCatalog svarer med en ARRAY (CatalogHit[]) — JSON.stringify på
        // en array dropper stille alle ikke-indekserte egenskaper, så et
        // guide-felt satt direkte på arrayen ville aldri nådd modellen. Pakk
        // derfor inn i et objekt (samme "hits"-konvensjon som
        // SearchDatasetsResult) FØR attach, uansett om kilden har guide.
        return { hits };
      });
      return JSON.stringify(r);
    }
    if (name === "table_metadata" && registry) {
      const sourceId = String(input.source ?? "");
      const r = await medGuideVedFeil(sourceId, registry, attachGuide, async () => {
        return await tableMetadata(sourceId, String(input.table_id ?? ""), {
          registry,
          find: typeof input.find === "string" && input.find.trim() ? input.find : undefined,
        }) as Record<string, unknown>;
      });
      return JSON.stringify(r);
    }
    if (name === "probe") {
      const url = String(input.url ?? "");
      // registry: probe må sende samme Accept som lasteren for sdmx-kilder,
      // ellers observerer den XML der scriptet får CSV (målt 2026-08-01).
      const r = await probeUrl(url, { registry: registry ?? undefined });
      probed.push({ url, ok: r.ok, cors: r.cors, viaProxy: r.ok && !r.cors });
      return JSON.stringify(r);
    }
    if (name === "search_literature") {
      const fromYear = Number.isInteger(input.from_year) ? Number(input.from_year) : undefined;
      return JSON.stringify(await searchLiterature(String(input.query ?? ""), fromYear, {
        mailto: Deno.env.get("OPENALEX_MAILTO") || undefined,
      }));
    }
    throw new Error(`ukjent verktøy: ${name}`);
  };

  const commonOpts = {
    system,
    userContent: questionTurn(question, body.script),
    executeTool,
    progressLabel,
    maxTokens: 8192,
    maxClientToolCalls: depthClientToolCalls(depth),
    clientTools: needsGetPack ? ["run_code", "get_pack"] : ["run_code"],
    maxRunCode: depthRunCodeCalls(depth),
    runResult: runResultTilLopet,
    getPackResult,
    resume: resumeState,
    continueExtra: () => ({ probed, run_ok_calls: runOkCalls }),
  };
  const providerDeps = { timeoutMs: 180_000, retries: 1 };
  // filtrerRunCode (run-disiplin.ts): dropper run_code fra `tools` ved
  // run_ok_calls>=2, unntatt der run_code er eneste verktøy (beregning) —
  // se kommentar der. get_pack er UBERØRT av run-disiplinen (den handler om
  // reparasjonsløkker, ikke om å hente pakketekst) — withGetPackTool legges
  // til FØR filtrering. Verktøylista ligger FØR system i Anthropic sitt
  // cache-prefiks, så denne endringen invaliderer prompt-cachen for resten
  // av løpet — akseptert kostnad (spec §Mekanisme 1), ikke optimalisert her.
  let inner: ReadableStream<Uint8Array>;
  if (provider && provider.type === "openai-compat") {
    inner = runProviderAgenticStream({
      ...commonOpts, deps: providerDeps, runTurn: makeOpenAiCompatTurn(provider),
      tools: filtrerRunCode(withGetPackTool(buildRouteToolDefs(route, depth, { hostedWeb: false })), runOkCalls),
    });
  } else if (provider && provider.type === "openai-responses") {
    inner = runProviderAgenticStream({
      ...commonOpts, deps: providerDeps, runTurn: makeOpenAiResponsesTurn(provider),
      tools: filtrerRunCode(withGetPackTool(buildRouteToolDefs(route, depth, { hostedWeb: false })), runOkCalls),
    });
  } else {
    inner = runAgenticStream({
      ...commonOpts,
      apiKey, model,
      tools: filtrerRunCode(withGetPackTool(buildRouteToolDefs(route, depth)), runOkCalls),
      turnsPerCall: 8,
      cacheTtl: "1h",
      apiBase: provider?.type === "anthropic-compat" ? provider.baseUrl : undefined,
    });
  }

  const stream = injectBeforeDone(inner, () =>
    probed.length ? { type: "sources", sources: probed } : null);

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
};
