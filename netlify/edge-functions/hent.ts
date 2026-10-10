// /api/hent — SSRF-hardened fetch proxy for Web mode: admin, or BYOK (a user
// presenting their own Anthropic key gets Web mode incl. proxy loads — B5 in
// safepy/docs/plan-integration.md; the key is format-checked only here, so
// this endpoint is reachable with a fabricated key, bounded by the per-IP
// rate limit — accepted by the owner 2026-07-04). Same trust position for a
// custom-provider user's X-Llm-Key (review 2026-10-10: they were 401'd here
// although svar/tolk-resultat accept them). Neither key unlocks the site's env
// keys. GET /api/hent?url=…[&body=…]
import { adminGate, extractByokKey, extractLlmKey, type IpContext } from "./_lib/auth.ts";
import { loadRegistry } from "./_lib/registry.ts";
import { handleHent } from "./_lib/hent-core.ts";

export default async (request: Request, context: IpContext): Promise<Response> => {
  const gateResp = await adminGate(request, {
    endpoint: "hent",
    maxBodyBytes: 0,
    allowedMethods: ["GET"],
    allowByok: true,
    allowLlmKey: true,
  }, context);
  if (gateResp) return gateResp;

  let registry;
  try {
    registry = await loadRegistry(new URL(request.url).origin);
  } catch (e) {
    console.error("hent: registry load failed:", e);
    return new Response("Kilderegister utilgjengelig", { status: 502 });
  }
  // runAdminGate lets a BYOK/X-Llm-Key header win over any token, so such a
  // request here is NOT admin-authenticated — keep the site's env keys out.
  return handleHent(request, {
    registry,
    getEnv: (k) => Deno.env.get(k),
    envKeysAllowed: extractByokKey(request) === null && extractLlmKey(request) === null,
  });
};
