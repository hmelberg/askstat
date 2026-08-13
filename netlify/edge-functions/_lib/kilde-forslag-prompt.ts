// Promptbygger for /api/kilde-forslag (spec 2026-08-13-kildeforbedring §3).
// Ren og deno-testet; endepunktet eier auth/provider-dispatch.

export interface ForslagDoc { id: string; name: string; text: string; }
export interface ForslagRun { script: string; error: string; }
export interface ForslagRunde { forslag_raatekst: string; tilbakemelding: string; }
export interface KildeForslagBody {
  docs: ForslagDoc[];
  question: string;
  tolkning?: string;
  mode?: string;
  depth?: string;
  runs: ForslagRun[];
  ok_script?: string;
  trace?: string;
  sources?: string[];
  history?: ForslagRunde[];
  ui_lang?: string;
  provider?: unknown;
}

const LANG_NAVN: Record<string, string> = {
  no: "norsk", en: "English", da: "dansk", sv: "svenska", fi: "suomi",
  is: "íslenska", de: "Deutsch", fr: "français", es: "español",
  pt: "português", zh: "中文", ja: "日本語", hi: "हिन्दी",
};

export function byggKildeForslagPrompt(body: KildeForslagBody): string {
  const deler: string[] = [];
  deler.push("KILDEBESKRIVELSER\n");
  for (const d of body.docs) {
    deler.push(`### ${d.id} — ${d.name}\n\n${d.text}\n`);
  }
  deler.push(`SPØRSMÅL\n\n${body.question}\n`);
  if (body.tolkning) deler.push(`TOLKNING\n\n${body.tolkning}\n`);
  if (body.mode) deler.push(`MODUS: ${body.mode} (dybde: ${body.depth ?? "standard"})\n`);
  if (body.runs.length) {
    deler.push("FEILEDE KJØRINGER\n");
    body.runs.forEach((r, i) => {
      deler.push(`Runde ${i + 1} — script:\n\`\`\`\n${r.script}\n\`\`\`\nFeilmelding:\n${r.error}\n`);
    });
  }
  if (body.ok_script) {
    deler.push(`SCRIPTET SOM TIL SLUTT VIRKET\n\`\`\`\n${body.ok_script}\n\`\`\`\n`);
  }
  if (body.trace) deler.push(`PROSESS-SPOR\n\n${body.trace}\n`);
  if (body.sources?.length) deler.push(`PROBEDE KILDER\n\n${body.sources.join("\n")}\n`);
  if (body.history?.length) {
    deler.push("TIDLIGERE RUNDER\n");
    body.history.forEach((h, i) => {
      deler.push(`Ditt forslag i runde ${i + 1}:\n${h.forslag_raatekst}\n\nBrukerens tilbakemelding:\n${h.tilbakemelding}\n`);
    });
  }
  const lang = LANG_NAVN[body.ui_lang ?? "en"] ?? "English";
  deler.push(`Skriv "melding" og "begrunnelse" på ${lang}.`);
  return deler.join("\n");
}
