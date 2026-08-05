// UI-språkkoder (spec 2026-08-05-sprak-pakker-deling §4): klienten sender
// ui_lang for ruter-direktesvar og tolk-resultat. Svarspråket i /api/svar
// følger SPØRSMÅLET og bruker aldri denne lista.
export const UI_LANGS = ["no", "en", "da", "sv", "fi", "is", "de", "fr", "es", "pt", "zh", "ja", "hi"] as const;
export type UiLang = (typeof UI_LANGS)[number];

export function coerceUiLang(v: unknown): UiLang {
  return (UI_LANGS as readonly string[]).includes(String(v)) ? (String(v) as UiLang) : "en";
}

/** Engelske språknavn til promptinstruksjoner («Write … in French»). */
export const LANG_NAME: Record<UiLang, string> = {
  no: "Norwegian", en: "English", da: "Danish", sv: "Swedish", fi: "Finnish",
  is: "Icelandic", de: "German", fr: "French", es: "Spanish", pt: "Portuguese",
  zh: "Chinese", ja: "Japanese", hi: "Hindi",
};
