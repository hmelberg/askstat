import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { byggKildeForslagPrompt } from "./kilde-forslag-prompt.ts";

Deno.test("byggKildeForslagPrompt: alle seksjoner med, i riktig rekkefølge", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "Min kilde", text: "# Doc" }],
    question: "Hva er X?", tolkning: "X per år", mode: "python", depth: "fast",
    runs: [{ script: "kode1", error: "feil1" }],
    ok_script: "kode2", trace: "⏳ probet", sources: ["https://u"],
    history: [{ forslag_raatekst: "forrige", tilbakemelding: "kortere" }],
    ui_lang: "no",
  });
  assertStringIncludes(p, "KILDEBESKRIVELSER");
  assertStringIncludes(p, "### user:a — Min kilde");
  assertStringIncludes(p, "SPØRSMÅL\n\nHva er X?");
  assertStringIncludes(p, "FEILEDE KJØRINGER");
  assertStringIncludes(p, "kode1");
  assertStringIncludes(p, "feil1");
  assertStringIncludes(p, "SCRIPTET SOM TIL SLUTT VIRKET");
  assertStringIncludes(p, "TIDLIGERE RUNDER");
  assertStringIncludes(p, "kortere");
  assertStringIncludes(p, "norsk");
  assert(p.indexOf("KILDEBESKRIVELSER") < p.indexOf("FEILEDE KJØRINGER"));
});

Deno.test("byggKildeForslagPrompt: valgfrie seksjoner utelates når tomme", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }],
    question: "q", runs: [], ui_lang: "en",
  });
  assert(!p.includes("SCRIPTET SOM TIL SLUTT VIRKET"));
  assert(!p.includes("TIDLIGERE RUNDER"));
  assert(!p.includes("PROSESS-SPOR"));
});

Deno.test("byggKildeForslagPrompt: oppgave kort → OPPGAVE-linje med", () => {
  const p = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "", runs: [], oppgave: "kort", ui_lang: "no" });
  assertStringIncludes(p, "OPPGAVE: KORT");
});
Deno.test("byggKildeForslagPrompt: uten oppgave ingen OPPGAVE-linje", () => {
  const p = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [] });
  assert(!p.includes("OPPGAVE: KORT"));
});

Deno.test("byggKildeForslagPrompt: ref_docs-seksjon + admin-linje, riktig plassering", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [],
    ref_docs: [{ id: "ess", text: "## Guide\nparquet anbefales" }],
    admin: true,
    history: [{ forslag_raatekst: "f", tilbakemelding: "t" }],
  });
  assertStringIncludes(p, "REFERANSE: INNEBYGDE KILDER");
  assertStringIncludes(p, "### ess (innebygd)");
  assertStringIncludes(p, "parquet anbefales");
  assertStringIncludes(p, "ADMIN: forslag mot innebygde dokumenter er tillatt");
  assert(p.indexOf("REFERANSE: INNEBYGDE KILDER") < p.indexOf("TIDLIGERE RUNDER"));
});

Deno.test("byggKildeForslagPrompt: uten ref_docs ingen seksjon; uten admin ingen ADMIN-linje", () => {
  const p = byggKildeForslagPrompt({
    docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [],
    ref_docs: [{ id: "ess", text: "x" }],
  });
  assert(!p.includes("ADMIN:"));
  const p2 = byggKildeForslagPrompt({ docs: [{ id: "user:a", name: "A", text: "t" }], question: "q", runs: [] });
  assert(!p2.includes("REFERANSE: INNEBYGDE KILDER"));
});
