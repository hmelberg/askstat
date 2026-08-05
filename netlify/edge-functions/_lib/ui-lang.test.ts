import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coerceUiLang, LANG_NAME, UI_LANGS } from "./ui-lang.ts";

Deno.test("coerceUiLang: gyldige koder passerer, alt annet → en", () => {
  assertEquals(coerceUiLang("no"), "no");
  assertEquals(coerceUiLang("hi"), "hi");
  assertEquals(coerceUiLang("tlh"), "en");
  assertEquals(coerceUiLang(undefined), "en");
  assertEquals(coerceUiLang(42), "en");
});

Deno.test("LANG_NAME dekker alle UI_LANGS", () => {
  for (const l of UI_LANGS) assertEquals(typeof LANG_NAME[l], "string");
});
