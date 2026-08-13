# Design: Innebygde kilder i forbedringssløyfa — referansedokumenter + admin-PR

Dato: 2026-08-14. Status: utkast til Hans' review.

Tredje runde på forbedringssløyfa (etter kildeforbedring 2026-08-13 og
kort/lang-splitt 2026-08-13). Utløst av Hans' observasjon: sløyfa «fant
ikke» ESS/eurostat (innebygde kilder er per design ikke i payloaden), og
admin-issues bør være INFORMERT av den innebygde beskrivelsen så de blir
lettere å fikse. Parquet-saken 2026-08-13 er referansecaset: en kodesak som
kunne sitert «guiden anbefaler fileFormat=parquet, men proben klassifiserer
svaret som CSV» hadde vært en selvbærende bestilling.

## Mål

1. **Informert diagnose for alle:** når kjøringen brukte innebygde kilder,
   ser sløyfa-modellen deres beskrivelser som LESE-referanse — bedre
   lag-vurdering, melding og kode_sak.
2. **Admin-vei uten kopi-omvei:** admin kan få forslag til revidert
   innebygd beskrivelse vist som diff og sendt RETT som PR mot
   `data/sources/<id>.md` — kopiveien forblir for lokale varianter.
3. **Siterende kodesaker:** issue-bestillinger refererer hva
   beskrivelsen lover vs. hva målingen viste.

## 1. Referansedokumenter i payloaden (`ref_docs`)

- **Utvelgelse (klient):** de innebygde kildene kjøringen faktisk
  involverte — registry-oppføringer (Packs.listRegistry) hvis `base_url`
  er prefiks i noen av kjøringens kilde-/probe-URL-er (`ctx.sources`).
  Maks 3, første-treff-orden. Ren, node-testet matcher
  (`involverteInnebygde(sources, registry)` i js/kilde-forslag.js).
- **Henting:** `data/sources/<id>.md` (v1a-fasiten, statisk samme origin —
  samme kilde som kopi-funksjonen), klippet 8 000 tegn per dokument (samme
  tak som guidene). 404/nettfeil → kilden utelates stille.
- **Payload:** nytt felt `ref_docs: [{id, text}]`. Repo-innhold — ingen
  scrub-behov, men klipp + maks-tak håndheves i payloadbyggeren og
  re-valideres server-side (id-regex som guides_override, tekst-klipp).
- **Prompt:** ny seksjon `REFERANSE: INNEBYGDE KILDER` — «skrivebeskyttet
  bakgrunn: bruk til å diagnostisere og SITERE (hva beskrivelsen lover vs.
  hva loggen viser); foreslå endringer i disse KUN når forespørselen har
  admin-flagget (§2)».

## 2. Admin-forslag mot innebygde dokumenter

- **Klient-flagg:** payloaden får `admin: true` når `erAdmin()`. Flagget
  styrer KUN prompt-instruksen (om builtin-forslag er tillatt) — det er
  ALDRI autorisasjon: en ikke-admin som fusker inn flagget får forslag
  uten noe sted å sende dem (PR-endepunktets adminGate er sperren, som før).
- **Kontrakt:** forslag-elementer kan ha id `builtin:<kilde-id>` —
  `ny_tekst` er da hele den reviderte `data/sources/<id>.md`-fila.
  Parseren aksepterer formen; kilde-id valideres mot ref_docs-settet
  (forslag mot dokumenter modellen ikke fikk, filtreres).
- **Modal:** builtin-forslag rendres som eget kort KUN bak `erAdmin()`:
  diff mot ref-doc-teksten (klienten har den), begrunnelse, og knappene
  **[Send som PR]** (eksisterende `/api/kilde-pr` med `of: <kilde-id>` —
  endepunktet støtter allerede oppdatering av `data/sources/<of>.md`,
  UENDRET server-side) og **[Forkast]**. INGEN «Bruk»-knapp — det finnes
  ingen lokal skrivevei for innebygde dokumenter (bevisst).
- **Ikke-admin:** ser aldri builtin-kort; ref_docs gir dem fortsatt bedre
  melding/diagnose.

## 3. Prompt-utvidelser (prompts/kilde-forslag.md, fasit-tekst i planen)

- Lag-regelen presiseres: builtin-forslag KUN ved admin-flagget, og KUN
  når evidensen peker på en beskrivelsesfeil i den innebygde fila (feil
  URL/parameter/påstand) — kodefeil går fortsatt til kode_sak.
- Kodesak-regelen utvides: siter relevant linje/påstand fra
  referansedokumentet når det finnes («guiden sier X, målingen viste Y»).

## 4. Sikkerhet

- ref_docs er repo-innhold — ingen hemmeligheter; klipp/tak mot
  payload-oppblåsing; server-koersjon gjenbruker id-regexen.
- Builtin-forslag har ingen lokal skrivevei; eneste utgang er PR-endepunktet
  bak adminGate uten BYOK-forbikjøring (uendret).
- Admin-flagget i payloaden er prompt-styring, aldri tilgangskontroll.

## 5. Verifisering

- Matcher: base_url-prefiks-treff, dedup, maks 3, tomme/ukjente URL-er.
- Payloadbygger: ref_docs-klipp og -tak; admin-flagget kun når erAdmin.
- Parser: `builtin:`-id aksepteres; forslag mot id utenfor ref_docs
  filtreres; eksisterende former uendret.
- Prompt-drift: .md ↔ TS-konstant som før.
- Manuell smoke (Hans): (a) ESS-scenario med kodefeil → kodesak SITERER
  guiden; (b) konstruer en beskrivelsesfeil (f.eks. bevisst feil parameter
  i en testkilde-fil lokalt) → builtin-diff-kort → «Send som PR» → PR mot
  data/sources/<id>.md; (c) som ikke-admin: ingen builtin-kort, men
  melding refererer beskrivelsen.

## 6. Filer som endres

| Fil | Endring |
|---|---|
| js/kilde-forslag.js | involverteInnebygde-matcher, ref_docs-henting/-bygging, admin-flagg, builtin-kort m/PR-knapp |
| js/ask-view.js | (kun hvis ctx mangler noe — sources finnes alt i ctx) |
| netlify/edge-functions/prompts/kilde-forslag.md + kilde-forslag.ts | REFERANSE-seksjon + admin/builtin-regler + ref_docs/admin i body |
| netlify/edge-functions/_lib/kilde-forslag-prompt.ts (+test) | ref_docs/admin i KildeForslagBody + prompt-seksjon |
| tests/js/kilde-forslag.test.js | matcher, payload, parser |

Estimat: ~1 økt.

## Bevisst utelatt

- **Ett-klikks «lag kopi av <innebygd> og forbedre»** — fortsatt egen
  UX-sak på lista; denne runden fjerner hovedbehovet (admin trenger ikke
  kopi for sentral forbedring).
- **Builtin-forslag for ikke-admin** (f.eks. som delt forslags-kø) —
  2026-08-09-specens v3/v4-tema, ikke her.
- **ref_docs for hele registeret** — kun kilder kjøringen involverte;
  payload-disiplin.
- **Auto-PR/auto-issue** — alt forblir eksplisitte admin-klikk.
