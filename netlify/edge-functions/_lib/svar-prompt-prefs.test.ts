import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSvarSystem, coercePacks, coercePreferences, coerceUserKeys, demoteHeadings, GET_PACK_TOOL,
} from "./svar-prompt.ts";

Deno.test("coercePreferences: streng, trim, tak 8000 (profil-tekster)", () => {
  assertEquals(coercePreferences(undefined), "");
  assertEquals(coercePreferences(42), "");
  assertEquals(coercePreferences("  x  "), "x");
  assertEquals(coercePreferences("a".repeat(9000)).length, 8000);
});

Deno.test("landruting alltid i data-ruten; preferanseblokk kun når satt, sist", () => {
  const uten = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x");
  assert(uten.includes("## Landruting"));
  assert(!uten.includes("Brukerens datapreferanser"));
  const med = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x",
    { preferences: "standardland Norge; foretrekk SSB" });
  assert(med.includes("standardland Norge; foretrekk SSB"));
  assert(med.indexOf("Brukerens datapreferanser") > med.indexOf("## Kilderegister"),
    "preferansene skal stå ETTER registerblokka (mest spesifikke sist)");
  assert(!buildSvarSystem("beregning", "python", "").includes("## Landruting"));
  assert(!buildSvarSystem("utforsk", "python", "", { preferences: "x" }).includes("Brukerens datapreferanser"));
});

Deno.test("packs-blokk: flere pakker rendres i rekkefølge m/felles intro, id i overskriften", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [{ id: "norway", name: "Norway", text: "## Preferred\nssb first", level: "full" },
            { id: "ess", name: "ESS", text: "ess api", level: "full" }],
  });
  assert(sys.includes("## Aktive kildepakker (valgt av brukeren)"));
  // default kind (ingen kind sendt) → 'source' → overskrift "Enkeltkilde".
  assert(sys.indexOf("### Enkeltkilde: Norway (id: norway)") < sys.indexOf("### Enkeltkilde: ESS (id: ess)"));
  assert(sys.includes("#### Preferred")); // demotert
});

// kind/tags (kilder-profil-output-runden 2026-08-08 Task 2): default kind er
// 'source' (uansett hva klienten sendte utover 'overview'); tags saneres med
// samme regex/tak som klienten (js/profiles.js TAG_RE/TAG_MAX, Task 1) og
// rendres som ' [tag1] [tag2]'-suffiks rett etter (id: …).
Deno.test("packs-blokk: kind='overview' → 'Tema (samling)'-overskrift; kind ukjent/mangler → 'Enkeltkilde'", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [
      { id: "temaX", name: "TemaX", text: "x", level: "full", kind: "overview" },
      { id: "kildeY", name: "KildeY", text: "y", level: "full", kind: "source" },
      { id: "kildeZ", name: "KildeZ", text: "z", level: "full", kind: "noe-ukjent" },
    ],
  });
  assert(sys.includes("### Tema (samling): TemaX (id: temaX)"));
  assert(sys.includes("### Enkeltkilde: KildeY (id: kildeY)"));
  assert(sys.includes("### Enkeltkilde: KildeZ (id: kildeZ)")); // ukjent kind → default 'source'
});

Deno.test("packs-blokk: tags rendres som ' [tag1] [tag2]'-suffiks i overskriften; ingen tags → ingen suffiks", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [
      { id: "a", name: "A", text: "x", level: "full", tags: ["mikro", "survey"] },
      { id: "b", name: "B", text: "y", level: "full" },
    ],
  });
  assert(sys.includes("### Enkeltkilde: A (id: a) [mikro] [survey]"));
  assert(sys.includes("### Enkeltkilde: B (id: b)\n\n")); // ingen tags → rett til note/tekst, ingen '['
});

Deno.test("coercePacks: caps — navn 60, tekst 40000, maks 20, søppel filtreres, id sanert, level validert", () => {
  const packs = coercePacks([
    { id: "a b/c!", name: "N".repeat(80), text: "t".repeat(45000) },
    { name: "", text: "x" }, null, "streng",
    ...Array.from({ length: 25 }, (_, i) => ({ name: "p" + i, text: "t" })),
  ]);
  assert(packs.length <= 20);
  assert(packs[0].name.length === 60 && packs[0].text.length === 40000);
  assertEquals(packs[0].id, "abc"); // [A-Za-z0-9:_-] — mellomrom/skilletegn borte
  assertEquals(packs[0].level, "full"); // ingen level oppgitt → default 'full'
  assertEquals(packs[0].kind, "source"); // ingen kind oppgitt → default 'source'
  assertEquals(packs[0].tags, []); // ingen tags oppgitt → tom liste
});

Deno.test("coercePacks: kind='overview' beholdes; alt annet (inkl. fravær) → 'source'", () => {
  const packs = coercePacks([
    { id: "a", name: "A", text: "t", kind: "overview" },
    { id: "b", name: "B", text: "t", kind: "source" },
    { id: "c", name: "C", text: "t", kind: "noe-ukjent" },
    { id: "d", name: "D", text: "t" },
  ]);
  assertEquals(packs.map((p) => p.kind), ["overview", "source", "source", "source"]);
});

Deno.test("coercePacks: tags saneres — regex, lowercase, dedup, tak 8", () => {
  const packs = coercePacks([{
    id: "a", name: "A", text: "t",
    tags: ["Mikro", "MIKRO", "  survey  ", "har mellomrom", "æøå-ok", "x".repeat(25),
      "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9-over-taket"],
  }]);
  // "Mikro"/"MIKRO"/"  survey  " → lowercase+trim; dedup fjerner andre "mikro";
  // "har mellomrom" og "x".repeat(25) (>24 tegn) forkastes av regex.
  assertEquals(packs[0].tags.slice(0, 3), ["mikro", "survey", "æøå-ok"]);
  assert(packs[0].tags.length <= 8);
  assert(!packs[0].tags.includes("har mellomrom"));
  assert(!packs[0].tags.includes("x".repeat(25)));
});

Deno.test("coercePacks: ikke-array tags → tom liste (aldri kast)", () => {
  const packs = coercePacks([{ id: "a", name: "A", text: "t", tags: "mikro" }]);
  assertEquals(packs[0].tags, []);
});

Deno.test("coercePacks: id-tak 100 tegn; level-verdier godtas/avvises", () => {
  const packs = coercePacks([
    { id: "x".repeat(150), name: "A", text: "t" },
    { id: "y", name: "B", text: "t", level: "manifest" },
    { id: "z", name: "C", text: "t", level: "summary" },
    { id: "w", name: "D", text: "t", level: "noe-ukjent" },
  ]);
  assertEquals(packs[0].id.length, 100);
  assertEquals(packs[1].level, "manifest");
  assertEquals(packs[2].level, "summary");
  assertEquals(packs[3].level, "full"); // ukjent verdi → default
});

Deno.test("coercePacks: SUM tekst ≤100000 — stopp når taket nås", () => {
  const packs = coercePacks([
    { id: "a", name: "A", text: "t".repeat(40000) },
    { id: "b", name: "B", text: "t".repeat(40000) },
    { id: "c", name: "C", text: "t".repeat(40000) }, // 3×40000 > 100000
    { id: "d", name: "D", text: "t".repeat(100) },   // ville rommet, men stopper likevel
  ]);
  assertEquals(packs.length, 2);
  const sum = packs.reduce((s, p) => s + p.text.length, 0);
  assert(sum <= 100000);
});

Deno.test("renderPacksBlock (via buildSvarSystem): nivåmerker på manifest/summary, ingen på full", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [
      { id: "a", name: "A", text: "fulltekst", level: "full" },
      { id: "b", name: "B", text: "utdrag", level: "manifest" },
      { id: "c", name: "C", text: "kort", level: "summary" },
    ],
  });
  assert(sys.includes("*(maskinutdrag — hent full tekst med get_pack)*"));
  assert(sys.includes("*(kortform — hent full tekst med get_pack)*"));
  // 'A' er full — ingen merke rett etter DENS overskrift.
  const aHeader = sys.indexOf("### Enkeltkilde: A (id: a)");
  const restEtterA = sys.slice(aHeader, aHeader + 60);
  assert(!restEtterA.includes("hent full tekst"));
});

Deno.test("packs-blokk: get_pack-setningen alltid; kortform-halen kun ved nedgradering", () => {
  const alleFull = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "full" }],
  });
  assert(alleFull.includes("get_pack-verktøyet"));
  assert(!alleFull.includes("kortform/maskinutdrag"));
  const enKort = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "summary" }],
  });
  assert(enKort.includes("kortform/maskinutdrag"));
});

Deno.test("GET_PACK_TOOL: navn og input_schema", () => {
  assertEquals(GET_PACK_TOOL.name, "get_pack");
  assertEquals(GET_PACK_TOOL.input_schema.required, ["id"]);
});

// GET_PACK_TOOL.description (Task 2 §Interfaces): må nevne begge formene
// (TEMA/ENKELTKILDE) og (id: …)-notasjonen — modellen leser KUN denne
// teksten for å vite hva get_pack gjør, ingen kode leser strengen.
Deno.test("GET_PACK_TOOL: beskrivelsen nevner TEMA (samling) og ENKELTKILDE", () => {
  assert(GET_PACK_TOOL.description.includes("TEMA (samling"));
  assert(GET_PACK_TOOL.description.includes("ENKELTKILDE"));
  assert(GET_PACK_TOOL.description.includes("(id: …)"));
});

// Ingress-forklaringen (Task 2 §Interfaces): TEMA vs. ENKELTKILDE forklares
// FØR pakkelisten, uavhengig av hvilke kind-er som faktisk er sendt.
Deno.test("packs-blokk: ingressen forklarer TEMA (samling) vs. ENKELTKILDE", () => {
  const sys = buildSvarSystem("data", "python", "", {
    packs: [{ id: "a", name: "A", text: "x", level: "full" }],
  });
  // to substrings (ikke én lang streng): kilden brytes over linjeskift i
  // svar-prompt.ts sin kildetekst, og en enkelt streng ville krysset det.
  assert(sys.includes("Et TEMA (samling) er en"));
  assert(sys.includes("meny over kilder"));
  assert(sys.includes("En ENKELTKILDE er"));
  assert(sys.includes("en direkte instruks om én kilde"));
});

Deno.test("demoteHeadings: +2 nivåer, tak 6, rører ikke ikke-headinger", () => {
  assertEquals(demoteHeadings("## Mine kilder\ntekst # ikke-heading"),
    "#### Mine kilder\ntekst # ikke-heading");
  assertEquals(demoteHeadings("###### Dypest"), "###### Dypest");
  assertEquals(demoteHeadings("#uten-mellomrom"), "#uten-mellomrom");
});

Deno.test("packs-blokk: tom liste → ingen blokk; utforsk-ruten får den ikke", () => {
  assert(!buildSvarSystem("data", "python", "", { packs: [] })
    .includes("Aktive kildepakker"));
  assert(!buildSvarSystem("utforsk", "python", "", {
    packs: [{ name: "N", text: "t" }] }).includes("Aktive kildepakker"));
});

// Utvidet søk (kontekstrunden fase 2 §5): DISCOVER-blokka er en oppdagelses-
// playbook for kilder UTENFOR registeret — KUN data-ruten, KUN når klienten
// eksplisitt sendte discover:true (bryteren i kildeseksjonen, js/packs.js).
Deno.test("DISCOVER-blokk: data-ruten m/discover:true; fraværende ellers; aldri andre ruter", () => {
  const med = buildSvarSystem("data", "python", "", { discover: true });
  assert(med.includes("## Utvidet kildesøk (aktivert av brukeren)"));
  assert(med.includes("```pack-blokk"));
  const utenFalse = buildSvarSystem("data", "python", "", { discover: false });
  assert(!utenFalse.includes("## Utvidet kildesøk"));
  const utenUndef = buildSvarSystem("data", "python", "");
  assert(!utenUndef.includes("## Utvidet kildesøk"));
  assert(!buildSvarSystem("beregning", "python", "", { discover: true }).includes("## Utvidet kildesøk"));
  assert(!buildSvarSystem("utforsk", "python", "", { discover: true }).includes("## Utvidet kildesøk"));
  assert(!buildSvarSystem("oppslag", "python", "", { discover: true }).includes("## Utvidet kildesøk"));
});

// Hint-linja (samme spec-punkt): peker mot bryteren KUN når den er av —
// DISCOVER-blokka overtar jobben når den er på (ingen dobbel veiledning).
Deno.test("Utvidet-søk-hint: «Extended search» nevnes i data-ruten uten discover, forsvinner med", () => {
  const utenDiscover = buildSvarSystem("data", "python", "");
  assert(utenDiscover.includes("Extended search"));
  const medDiscoverFalse = buildSvarSystem("data", "python", "", { discover: false });
  assert(medDiscoverFalse.includes("Extended search"));
  const medDiscover = buildSvarSystem("data", "python", "", { discover: true });
  assert(!medDiscover.includes("Extended search"));
  // andre ruter har verken hintet eller META_SEARCH i det hele tatt
  assert(!buildSvarSystem("beregning", "python", "").includes("Extended search"));
});

// Egne nøkler v1 (innstillinger-runden 2026-08-08 Task 11): coerceUserKeys
// saneres uavhengig av klienten — navn må matche slug-formatet (klienten
// slugifiserer allerede, men serveren stoler aldri på det), notat trimmes/
// kappes, taket er 10 nøkler. Selve verdien finnes ALDRI i denne strukturen
// (klienten sender kun {navn, notat} — se tests/js/run-kontrakt.test.js for
// klientsiden av kontrakten).
Deno.test("coerceUserKeys: navn-regex, notat-tak 500, maks 10, ugyldige navn droppes", () => {
  assertEquals(coerceUserKeys(undefined), []);
  assertEquals(coerceUserKeys("ikke en liste"), []);
  assertEquals(coerceUserKeys([{ navn: "Kaggle", notat: "  bruk kaggle-api  " }]),
    [{ navn: "kaggle", notat: "bruk kaggle-api" }]); // lowercased, trimmet
  assertEquals(coerceUserKeys([{ navn: "ugyldig navn!", notat: "x" }]), []); // mellomrom/tegn ikke tillatt
  assertEquals(coerceUserKeys([{ navn: "", notat: "x" }]), []);
  assertEquals(coerceUserKeys([{ navn: "ok_name-1", notat: "y" }]),
    [{ navn: "ok_name-1", notat: "y" }]);
  assertEquals(coerceUserKeys([{ navn: "a", notat: "x".repeat(600) }])[0].notat.length, 500);
  const elleve = Array.from({ length: 11 }, (_, i) => ({ navn: `k${i}`, notat: "n" }));
  assertEquals(coerceUserKeys(elleve).length, 10);
  // ingen verdi-felt i det hele tatt — selv om klienten skulle sende én,
  // rendres den aldri videre (kun navn/notat leses ut av coerceUserKeys).
  assertEquals(coerceUserKeys([{ navn: "kaggle", notat: "x", value: "hemmelig-hemmelighet" }]),
    [{ navn: "kaggle", notat: "x" }]);
});

Deno.test("renderUserKeysBlock (via buildSvarSystem): kun i data-ruten, kun når ikke-tom, etter packsBlock, aldri verdien i prompten", () => {
  const uten = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x");
  assert(!uten.includes("Brukerens egne API-nøkler"));
  const med = buildSvarSystem("data", "python", "## Kilderegister (kuratert)\n\n- x", {
    userKeys: [{ navn: "kaggle", notat: "bruk kaggle-api-en, se dokumentasjon" }],
  });
  assert(med.includes("## Brukerens egne API-nøkler"));
  assert(med.includes("- kaggle: bruk kaggle-api-en, se dokumentasjon"));
  assert(med.includes("KEYS['<navn>']"));
  const medPacks = buildSvarSystem("data", "python", "", {
    packs: [{ id: "norway", name: "Norway", text: "x", level: "full" }],
    userKeys: [{ navn: "kaggle", notat: "x" }],
  });
  assert(medPacks.indexOf("Aktive kildepakker") < medPacks.indexOf("Brukerens egne API-nøkler"),
    "user_keys-blokka skal stå ETTER packsBlock");
  // aldri i andre ruter
  assert(!buildSvarSystem("beregning", "python", "", { userKeys: [{ navn: "kaggle", notat: "x" }] })
    .includes("Brukerens egne API-nøkler"));
  assert(!buildSvarSystem("utforsk", "python", "", { userKeys: [{ navn: "kaggle", notat: "x" }] })
    .includes("Brukerens egne API-nøkler"));
  assert(!buildSvarSystem("oppslag", "python", "", { userKeys: [{ navn: "kaggle", notat: "x" }] })
    .includes("Brukerens egne API-nøkler"));
  // ugyldig navn → filtrert bort av coerceUserKeys → ingen blokk i det hele tatt
  const ugyldig = buildSvarSystem("data", "python", "", { userKeys: [{ navn: "har mellomrom", notat: "x" }] });
  assert(!ugyldig.includes("Brukerens egne API-nøkler"));
});
