// /api/kilde-pr — «Send som PR» (spec 2026-08-13-kildeforbedring §9).
// KUN admin: adminGate UTEN allowByok — BYOK-forbikjøringen i runAdminGate
// ville ellers sluppet enhver nøkkelbruker forbi admin-kravet. Klienten
// sender Authorization: Bearer <login-token>; Anvil-brukerens is_admin
// (eller delt service-token) er den reelle sperren.
import { adminGate, type IpContext } from "./_lib/auth.ts";
import { byggBranchNavn, opprettIssue, opprettPr, velgMaal } from "./_lib/kilde-pr-core.ts";

const MAX_BODY_BYTES = 300_000;
const MAX_TEKST = 60_000;
const OF_RE = /^[a-z0-9_-]{1,32}$/;   // samme id-form som coerceSourcesOff

interface RequestBody {
  id?: string; name?: string; of?: string; ny_tekst?: string; evidens?: string;
  issue?: { tittel?: unknown; kropp?: unknown };
}

export default async (request: Request, context: IpContext): Promise<Response> => {
  const gateResp = await adminGate(request, { endpoint: "kilde-pr", maxBodyBytes: MAX_BODY_BYTES }, context);
  if (gateResp) return gateResp;

  let body: RequestBody;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const token = Deno.env.get("GITHUB_PR_TOKEN");
  const repo = Deno.env.get("GITHUB_PR_REPO") ?? "hmelberg/askstat";
  if (!token) {
    console.error("kilde-pr: GITHUB_PR_TOKEN er ikke satt");
    return new Response("GITHUB_PR_TOKEN er ikke konfigurert", { status: 500 });
  }

  // Issue-modus (§4c): gjensidig utelukkende med ny_tekst-veien under —
  // sjekkes FØRST slik at kode-sak-bestillinger aldri faller gjennom til
  // kilde-PR-valideringen.
  const issue = body.issue;
  if (issue) {
    const tittel = typeof issue.tittel === "string" ? issue.tittel.trim().slice(0, 200) : "";
    const kropp = typeof issue.kropp === "string" ? issue.kropp.slice(0, 20_000) : "";
    if (!tittel || !kropp.trim()) return new Response("issue mangler tittel/kropp", { status: 400 });
    try {
      const r = await opprettIssue({ fetchImpl: fetch, token, repo },
        { tittel, kropp, etiketter: ["kilde-kodesak"] });
      return new Response(JSON.stringify({ url: r.url }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      console.error("kilde-pr issue:", e);
      return new Response("GitHub-kall feilet: " + (e instanceof Error ? e.message : String(e)), { status: 502 });
    }
  }

  const tekst = typeof body.ny_tekst === "string" ? body.ny_tekst : "";
  if (!tekst.trim() || tekst.length > MAX_TEKST) {
    return new Response("ny_tekst mangler eller er for stor", { status: 400 });
  }

  const of = typeof body.of === "string" && OF_RE.test(body.of) ? body.of : undefined;
  const maal = velgMaal({ of, id: String(body.id ?? ""), name: String(body.name ?? "") });
  const tittel = `kilde: ${maal.create ? "ny community-pakke" : "oppdatert"} ${maal.path.split("/").pop()} (forbedringssløyfa)`;
  // Evidensen er scrubbet KLIENTSIDE (byggEvidens, Task 12) — «hva feilet,
  // hva virket» i PR-kroppen er §9-regelen fra 2026-08-09-specen.
  const kropp = [
    String(body.evidens ?? "").slice(0, 8_000),
    "",
    "Sendt fra askstats forbedringssløyfe (kun admin). Review + repo-lint er formatvaktene; aldri auto-merge.",
  ].join("\n");

  try {
    const r = await opprettPr({ fetchImpl: fetch, token, repo }, {
      path: maal.path, create: maal.create, innhold: tekst,
      tittel, kropp, branch: byggBranchNavn(maal.path, new Date()),
    });
    return new Response(JSON.stringify({ url: r.url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kilde-pr:", e);
    return new Response("GitHub-kall feilet: " + (e instanceof Error ? e.message : String(e)), { status: 502 });
  }
};
