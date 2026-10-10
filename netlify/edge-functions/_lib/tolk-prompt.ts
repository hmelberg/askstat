// Brukerturen for /api/tolk-resultat (flyttet ut av endepunktet 2026-10-10
// så den kan testes, og så detectLanguage overlever slettingen av den døde
// parse-script-context.ts — kode-svar/dm-vurder var de andre brukerne).
//
// Utfyllingen er ÉN-PASS med funksjonserstatning: brukertekst (script,
// output, OUTPUTS-linjen) settes inn bokstavelig — ingen $&/$'-ekspansjon fra
// String.prototype.replace, og en «{{OUTPUT}}» inne i scriptet blir ikke
// fylt ut av et senere steg (review-funn 2026-10-10).

export const TOLK_USER_TEMPLATE = `\
{{OUTPUT_LANGUAGE}}

SPRÅK
{{LANGUAGE}}
{{OUTPUTS}}
SCRIPT (kommandoer)

{{SCRIPT}}

OUTPUT (resultater)

{{OUTPUT}}`;

function languageInstruction(requested: string, detected: string): string {
  if (requested === "microdata") return "Output er fra microdata.no-DSL.";
  if (requested === "python") return "Output er fra Python.";
  if (requested === "r") return "Output er fra R.";
  return `Detektert språk: ${detected}.`;
}

/** Fyll {{NAVN}}-plassholdere i ett pass; ukjente navn står urørt. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, navn: string) =>
    Object.prototype.hasOwnProperty.call(vars, navn) ? vars[navn] : m);
}

export interface TolkPromptInput {
  outputLanguage: string;
  requested: string;
  script: string;
  output: string;
  outputs: string;
}

export function buildTolkPrompt(i: TolkPromptInput): string {
  const detected = detectLanguage(i.output || i.script);
  return fillTemplate(TOLK_USER_TEMPLATE, {
    OUTPUT_LANGUAGE: i.outputLanguage,
    LANGUAGE: languageInstruction(i.requested, detected),
    OUTPUTS: i.outputs ? `\nOUTPUTS (allerede vist i appen)\n\n${i.outputs}\n` : "",
    SCRIPT: i.script || "(ingen kommandoer sendt)",
    OUTPUT: i.output,
  });
}

// ── Språkdeteksjon (flyttet uendret fra parse-script-context.ts) ───────────

export type Language = "microdata" | "python" | "r" | "mixed";

const MICRODATA_PATTERNS = [
  /^\s*import\s+(all\s+)?(variables?\s+)?[^\n]*[ \t]from[ \t]+\w+/im,
  /\bcollapse\s*\(\s*(mean|sum|sd|count|median|min|max|p\d+)/i,
  /^\s*tabulate\s+\w+/im,
  /^\s*summarize\s+\w+/im,
  /^\s*keep\s+if\s+/im,
  /^\s*drop\s+if\s+/im,
  // m2py merge: "merge VAR into DATASET on KEY" — NOT Stata's "merge 1:m using"
  /^\s*merge\s+\w+\s+(into|onto)\s+/im,
];

const PYTHON_PATTERNS = [
  /^\s*from\s+\w+\s+import\s+/m,
  /^\s*import\s+\w+(\s+as\s+\w+)?$/m,
  /^\s*def\s+\w+\s*\(/m,
  /^\s*class\s+\w+/m,
  /\bpd\.|np\.|pandas|numpy\b/i,
];

const R_PATTERNS = [
  /^\s*library\s*\(/m,
  /<-\s*[a-zA-Z0-9_(]/,
  /\bdata\.frame\b/,
  /%>%/,
  /^\s*require\s*\(/m,
];

function countMatches(script: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(script)) n++;
  return n;
}

/**
 * Detects the scripting language of a script.
 *
 * Thresholds are asymmetric by design:
 *   - Microdata: ≥1 pattern match (microdata keywords are domain-specific and rarely appear by accident)
 *   - Python/R:  ≥2 pattern matches to avoid single-token false positives (e.g. a lone `<-` or `def`)
 * Empty/whitespace-only input defaults to "microdata".
 * When Python and R scores are equal (tie), "python" is returned.
 */
export function detectLanguage(script: string): Language {
  if (!script.trim()) return "microdata";

  const microdataScore = countMatches(script, MICRODATA_PATTERNS);
  const pythonScore = countMatches(script, PYTHON_PATTERNS);
  const rScore = countMatches(script, R_PATTERNS);

  const hasMicrodata = microdataScore >= 1;
  const hasPython = pythonScore >= 2;
  const hasR = rScore >= 2;

  if (hasMicrodata && (hasPython || hasR)) return "mixed";
  if (hasMicrodata) return "microdata";
  if (hasPython && !hasR) return "python";
  if (hasR && !hasPython) return "r";
  if (hasPython && hasR) return pythonScore >= rScore ? "python" : "r";
  return "microdata";
}
