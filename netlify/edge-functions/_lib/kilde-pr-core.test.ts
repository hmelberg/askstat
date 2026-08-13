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
  assertStringIncludes(kall[2].url, "/contents/data/sources/ssb.md?ref=main");
  assertEquals(kall[3].method, "PUT");
  assertEquals((kall[3].body as Record<string, unknown>).sha, "filsha");
  assertEquals((kall[3].body as Record<string, unknown>).branch, "kilde/ssb-x");
  assertStringIncludes(kall[4].url, "/pulls");
  assertEquals((kall[4].body as Record<string, unknown>).base, "main");
});

Deno.test("opprettPr: create=true henter ikke fil-sha (fire kall totalt)", async () => {
  const kall: string[] = [];
  const svar = [{ object: { sha: "abc" } }, {}, {}, { html_url: "u" }];
  let i = 0;
  const fetchImpl = ((url: string) => {
    kall.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(svar[i++]), { status: 200 }));
  }) as typeof fetch;
  await opprettPr({ fetchImpl, token: "t", repo: "r/r" },
    { path: "data/packs/community/ny.md", create: true, innhold: "x", tittel: "T", kropp: "K", branch: "b" });
  assertEquals(kall.length, 4);
  assertEquals(kall.filter((u) => u.includes("?ref=main")).length, 0);
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
