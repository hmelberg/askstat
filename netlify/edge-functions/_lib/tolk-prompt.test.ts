import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildTolkPrompt, detectLanguage } from "./tolk-prompt.ts";

const base = { outputLanguage: "Svar på norsk.", requested: "python", script: "x = 1", output: "1", outputs: "" };

// Review 2026-10-10: OUTPUTS ble satt inn med streng-formen av .replace, så
// «$&», «$'» o.l. i brukertekst ble ekspandert av String.prototype.replace.
Deno.test("buildTolkPrompt: $-mønstre i brukertekst settes inn bokstavelig", () => {
  const p = buildTolkPrompt({ ...base, outputs: "figur $& og $' og $1", output: "verdi $& $$", script: "s $`" });
  assertEquals(p.includes("figur $& og $' og $1"), true);
  assertEquals(p.includes("verdi $& $$"), true);
  assertEquals(p.includes("s $`"), true);
  assertEquals(p.includes("{{"), false);
});

// Én-pass-utfylling: en plassholder INNE i brukertekst skal ikke fylles ut av
// et senere replace-steg (script med «{{OUTPUT}}» fikk før outputen limt inn).
Deno.test("buildTolkPrompt: plassholdere i brukertekst ekspanderes ikke", () => {
  const p = buildTolkPrompt({ ...base, script: "print('{{OUTPUT}}')", output: "HEMMELIG-OUTPUT", outputs: "{{SCRIPT}}" });
  assertEquals(p.split("HEMMELIG-OUTPUT").length - 1, 1);
  assertEquals(p.includes("print('{{OUTPUT}}')"), true);
  assertEquals(p.includes("OUTPUTS (allerede vist i appen)\n\n{{SCRIPT}}"), true);
});

Deno.test("buildTolkPrompt: uten outputs, ingen OUTPUTS-seksjon; tomt script får plassholdertekst", () => {
  const p = buildTolkPrompt({ ...base, script: "" });
  assertEquals(p.includes("OUTPUTS"), false);
  assertEquals(p.includes("(ingen kommandoer sendt)"), true);
  assertEquals(p.includes("Output er fra Python."), true);
});

Deno.test("detectLanguage: python, r og tom default", () => {
  assertEquals(detectLanguage("import pandas as pd\ndef f(x):\n  return x"), "python");
  assertEquals(detectLanguage("library(dplyr)\ndf <- read.csv('x')"), "r");
  assertEquals(detectLanguage(""), "microdata");
});
