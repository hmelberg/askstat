import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { base64Utf8, byggBranchNavn, opprettIssue, opprettPr, slugify, velgMaal } from "./kilde-pr-core.ts";

Deno.test("velgMaal: kopi → oppdater data/sources; egen kilde → ny community-pakke", () => {
  assertEquals(velgMaal({ of: "ssb", id: "user:a", name: "SSB (min kopi)" }),
    { path: "data/sources/ssb.md", create: false });
  assertEquals(velgMaal({ id: "user:b", name: "Min Ægen Kilde!" }),
    { path: "data/packs/community/min-aegen-kilde.md", create: true });
});

Deno.test("slugify: norsk + spesialtegn + tak", () => {
  assertEquals(slugify("Blæ/Blø (v2)"), "blae-blo-v2");
  assertEquals(slugify("  "), "kilde");
  assertEquals(slugify("x".repeat(100)).length, 60);
});

Deno.test("byggBranchNavn: fil + tidsstempel", () => {
  const navn = byggBranchNavn("data/sources/ssb.md", new Date("2026-08-13T10:20:30Z"));
  assertEquals(navn, "kilde/ssb-20260813102030");
});

Deno.test("base64Utf8: UTF-8 round-trip med norsk tekst", () => {
  const dekodet = new TextDecoder().decode(
    Uint8Array.from(atob(base64Utf8("blåbær og østers")), (c) => c.charCodeAt(0)));
  assertEquals(dekodet, "blåbær og østers");
});

Deno.test("opprettPr: fire kall i riktig rekkefølge; 422 på branch tolereres", async () => {
  const kall: { url: string; method: string; body?: unknown }[] = [];
  const svar: Record<string, unknown>[] = [
    { object: { sha: "abc" } },          // GET ref
    {},                                   // POST refs (branch)
    { sha: "filsha" },                    // GET contents
    {},                                   // PUT contents
    { html_url: "https://github.com/x/pull/1" }, // POST pulls
  ];
  let i = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify(svar[i++]), { status: kall.length === 2 ? 422 : 200 }));
  }) as typeof fetch;
  const r = await opprettPr({ fetchImpl, token: "tok", repo: "hmelberg/askstat" },
    { path: "data/sources/ssb.md", create: false, innhold: "NY", tittel: "T", kropp: "K", branch: "kilde/ssb-x" });
  assertEquals(r.url, "https://github.com/x/pull/1");
  assertEquals(kall.length, 5);
  assertStringIncludes(kall[0].url, "/git/ref/heads/main");
  assertStringIncludes(kall[1].url, "/git/refs");
  // sha hentes fra BRANCHEN (som PUT-en skriver til) — en gjenbrukt branch
  // (422) kan ha en nyere versjon av fila enn main.
  assertStringIncludes(kall[2].url, "/contents/data/sources/ssb.md?ref=kilde%2Fssb-x");
  assertEquals(kall[3].method, "PUT");
  assertEquals((kall[3].body as Record<string, unknown>).sha, "filsha");
  assertEquals((kall[3].body as Record<string, unknown>).branch, "kilde/ssb-x");
  assertStringIncludes(kall[4].url, "/pulls");
  assertEquals((kall[4].body as Record<string, unknown>).base, "main");
});

// Review 2026-10-10: create=true over en fil som alt finnes (samme slug på
// nytt, eller gjenbrukt branch) PUT-et uten sha → GitHub 422 → 502. sha
// hentes nå i begge moduser; 404 = ny fil, PUT uten sha.
Deno.test("opprettPr: create=true over eksisterende fil sender sha", async () => {
  const kall: { url: string; method: string; body?: unknown }[] = [];
  const svar = [{ object: { sha: "abc" } }, {}, { sha: "finnes" }, {}, { html_url: "u" }];
  let i = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify(svar[i++]), { status: 200 }));
  }) as typeof fetch;
  await opprettPr({ fetchImpl, token: "t", repo: "r/r" },
    { path: "data/packs/community/ny.md", create: true, innhold: "x", tittel: "T", kropp: "K", branch: "b" });
  assertEquals(kall.length, 5);
  assertStringIncludes(kall[2].url, "/contents/data/packs/community/ny.md?ref=b");
  assertEquals((kall[3].body as Record<string, unknown>).sha, "finnes");
});

Deno.test("opprettPr: create=true og fila finnes ikke (404) → PUT uten sha", async () => {
  const kall: { url: string; method: string; body?: unknown }[] = [];
  const svar: [unknown, number][] = [[{ object: { sha: "abc" } }, 200], [{}, 200], [{ message: "Not Found" }, 404], [{}, 201], [{ html_url: "u" }, 201]];
  let i = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const [b, st] = svar[i++];
    return Promise.resolve(new Response(JSON.stringify(b), { status: st }));
  }) as typeof fetch;
  const r = await opprettPr({ fetchImpl, token: "t", repo: "r/r" },
    { path: "data/packs/community/ny.md", create: true, innhold: "x", tittel: "T", kropp: "K", branch: "b" });
  assertEquals(r.url, "u");
  assertEquals(kall[3].method, "PUT");
  assertEquals("sha" in (kall[3].body as Record<string, unknown>), false);
});

Deno.test("opprettIssue: ett POST /issues med title/body/labels", async () => {
  const kall: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    kall.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ html_url: "https://github.com/x/issues/7" }), { status: 201 }));
  }) as typeof fetch;
  const r = await opprettIssue({ fetchImpl, token: "t", repo: "hmelberg/askstat" },
    { tittel: "SDMX-dialekt", kropp: "Bestilling", etiketter: ["kilde-kodesak"] });
  assertEquals(r.url, "https://github.com/x/issues/7");
  assertEquals(kall.length, 1);
  assertStringIncludes(kall[0].url, "/repos/hmelberg/askstat/issues");
  assertEquals(kall[0].body, { title: "SDMX-dialekt", body: "Bestilling", labels: ["kilde-kodesak"] });
});
