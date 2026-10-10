import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseProviderConfig, scrubKey, scrubUrlSecrets } from "./config.ts";

const req = (key?: string) =>
  new Request("https://a.test/x", { headers: key ? { "X-Llm-Key": key } : {} });
const KEY = "sk-proj-abc123XYZ";

Deno.test("parseProviderConfig: absent or type anthropic → null", () => {
  assertEquals(parseProviderConfig(undefined, req(KEY)), null);
  assertEquals(parseProviderConfig(null, req(KEY)), null);
  assertEquals(parseProviderConfig({ type: "anthropic" }, req(KEY)), null);
});

Deno.test("parseProviderConfig: valid openai-compat", () => {
  const cfg = parseProviderConfig(
    { type: "openai-compat", base_url: "https://api.openai.com/v1/", model: "gpt-5.6" },
    req(KEY),
  );
  if (!cfg || "error" in cfg) throw new Error("uventet avvisning");
  assertEquals(cfg.baseUrl, "https://api.openai.com/v1");   // trailing slash strippet
  assertEquals(cfg.webSearch, "none");
  assertEquals(cfg.key, KEY);
});

Deno.test("parseProviderConfig: openai-responses gets webSearch native", () => {
  const cfg = parseProviderConfig(
    { type: "openai-responses", base_url: "https://api.openai.com/v1", model: "gpt-5.6" },
    req(KEY),
  );
  if (!cfg || "error" in cfg) throw new Error("uventet avvisning");
  assertEquals(cfg.webSearch, "native");
});

Deno.test("parseProviderConfig: rejections are 400 with named field, no key echo", async () => {
  const cases: [unknown, Request][] = [
    [{ type: "gemini", base_url: "https://x.example", model: "m" }, req(KEY)],       // ukjent type
    [{ type: "openai-compat", base_url: "http://169.254.169.254/v1", model: "m" }, req(KEY)], // SSRF
    [{ type: "openai-compat", base_url: "https://x.example", model: "har mellomrom" }, req(KEY)], // modell
    [{ type: "openai-compat", base_url: "https://x.example", model: "m" }, req()],   // mangler nøkkel
  ];
  for (const [raw, r] of cases) {
    const out = parseProviderConfig(raw, r);
    if (!out || !("error" in out)) throw new Error("skulle vært avvist: " + JSON.stringify(raw));
    assertEquals(out.error.status, 400);
    const text = await out.error.clone().text();
    if (text.includes(KEY)) throw new Error("nøkkel i feilkropp");
  }
});

Deno.test("scrubKey replaces every occurrence", () => {
  assertEquals(scrubKey(`err ${KEY} og ${KEY}`, KEY), "err *** og ***");
  assertEquals(scrubKey("ren tekst", KEY), "ren tekst");
  assertEquals(scrubKey("x", ""), "x");
});

Deno.test("scrubKey ignores implausibly short keys and scrubs URL-encoded form", () => {
  assertEquals(scrubKey("abc abc", "abc"), "abc abc");
  const k = "K+ey/With=Sign$";
  assertEquals(scrubKey(`u?key=${encodeURIComponent(k)} og ${k}`, k), "u?key=*** og ***");
});

Deno.test("scrubUrlSecrets masks key-like query params in any URL in the text", () => {
  const t = "error sending request for url (https://api.datacommons.org/v2/resolve?key=abcd1234XYZ&nodes=x) and " +
    "https://h/x?series=1&api_key=SECRET9&token=T0K3N#f";
  const out = scrubUrlSecrets(t);
  for (const s of ["abcd1234XYZ", "SECRET9", "T0K3N"]) {
    if (out.includes(s)) throw new Error("lekket: " + out);
  }
  assertEquals(out.includes("nodes=x"), true);
  assertEquals(out.includes("series=1"), true);
  assertEquals(scrubUrlSecrets("ingen url her"), "ingen url her");
});
