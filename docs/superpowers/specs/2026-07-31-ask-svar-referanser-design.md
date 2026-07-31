# Ask-svar med output-referanser (kuratert svar)

**Dato:** 2026-07-31 · **Status:** godkjent design, venter på implementasjonsplan

## Bakgrunn og problem

Sluttsvaret i ask-visningen er ren markdown (markdown-it) i `#askAnswer`, og hele
`#outputArea` flyttes levende inn under svaret etter vellykket kjøring
(`mountLiveOutput`, `js/ask-view.js`). Tre målte problemer:

1. **Matte rendres ikke** — ingen KaTeX/MathJax i appen; LaTeX vises som rå tekst.
2. **Duplisering** — svarteksten omtaler resultatene, og så vises hele råoutputen
   (alle prints, tabeller, figurer) en gang til rett under.
3. **Ingen komposisjon** — svaret kan ikke plassere figurer/tabeller i tekstflyten;
   figurer «ser statiske ut» fordi modellen ikke har noe insentiv til å designe
   output for svaret.

Output-pipelinen er allerede rik og typet (`buildOutputNodes`, `index.html`):
embedTypes `figure` (plotly), `tabulator`, `tablehtml`, `png`, `vegalite`,
`leafletmap`, `ipywidget`, `html`, `markdown`, pluss tekst-parsede tabeller og
`#@param`-kontrollstriper. Alt dette er levende DOM-noder med fungerende
interaktivitet. Problemet er at svaret ikke kan *referere* dem — bare stå ved
siden av dem.

## Strategi (én setning)

Svaret er tekst som **peker på levende elementer fra analysen** i stedet for å
gjenskape eller gjenta dem.

Tre begrunnelser: (1) tallintegritet — modellen retaster aldri tall inn i
svaret; (2) interaktivitet gratis — elementene ER kjøringens ekte DOM-noder
(plotly-zoom, Tabulator-sortering, `#@param`-sliders virker); (3) kuratering —
modellen velger hva som fortjener plass i svaret, resten gjemmes bak «Full
output».

## Mål

- Plassholdere i sluttsvaret (`{{fig:1}}` osv.) byttes mot levende output-noder.
- Ureferert output vises kollapset («Full output»), ikke alltid synlig.
- KaTeX-rendring av matte i svaret (og i `.output-markdown`).
- Prompt som får modellen til å designe output FOR svaret (liten
  oppsummeringstabell, plotly fremfor statisk figur der interaktivitet gir
  verdi, `#@param`-kontroller i simuleringssvar).
- `#@param`-re-kjøringer virker for utflyttede noder (re-resolve).

## Ikke-mål (bevisst utelatt, YAGNI)

- Kolonnelayout/side-ved-side i svaret (stablede fullbredde-blokker i v1).
- Presentasjonsscript som svarform («lag 2» fra brainstormen) og p5-innslag.
- Navngitte referanser (`id=`-konvensjon i scriptet) — posisjonsreferanser
  holder i v1.
- `pre`-referanseklasse (printede blokker, f.eks. statsmodels-sammendrag) —
  mest sannsynlige første utvidelse, men v1-praksis er en liten kuratert
  tabell i stedet. Å legge til en klasse koster tre grep: mapping-rad,
  regex-alternativ, promptlinje.
- KaTeX under streaming (rå `$…$` synlig til svaret er ferdig — akseptert).
- Endringer i v2-pipelinen (`kode-svar-v2.ts`) — kun `/api/svar`-løpet.

## 1. Svarkontrakt (promptendring i `svar-prompt.ts`)

Sluttsvaret er fortsatt markdown, men kan inneholde **blokk-plassholdere** på
egen linje: `{{fig:N}}`, `{{table:N}}`, `{{map:N}}`, `{{widget:N}}`,
`{{html:N}}`, `{{controls:N}}` (1-basert per klasse, i output-rekkefølge).

Endringer i RUN-blokken (og et kort tillegg i MODE_PY/MODE_R om å designe
output for svaret):

- Setningen «figurer/tabeller fra kjøringen vises automatisk under svaret»
  ERSTATTES — den blir usann. Ny instruks: referer elementer med plassholdere;
  ureferert output havner bak en fold.
- ALDRI gjenta tall/tabeller som et referert element allerede viser — pek på
  elementet og TOLK det i stedet.
- Typisk form: funn (1–3 setninger) → `{{fig:1}}` → tolkning → ev.
  `{{table:1}}` → forbehold + kilder.
- Referer KUN det som står i OUTPUTS-manifestet (se §2) — aldri gjett.
- Matte skrives som `$…$`/`$$…$$` (rendres nå).
- Design output for svaret: en liten oppsummeringstabell (≤ ~10 rader) beregnet
  på svaret fremfor rå ramme-dump; plotly fremfor statisk figur der
  interaktivitet gir verdi; i simuleringer (REFORM-veien): `#@param`-kontroller
  og referer `{{controls:1}}` + figuren den driver.

**Python-først (Hans 2026-07-31):** «design for svaret»-tillegget legges fullt
i MODE_PY (plotly, ipywidgets/`widget`, `#@param`/`controls`); MODE_R/duckdb
får kun minimumsvarianten (referer i stedet for å gjenta; liten
oppsummeringstabell). fig/table-referansene virker likevel i alle moduser —
maskineriet er delt.

## 2. Manifest (`mdAskExecuteScript`, `js/ai-chat.js`)

Etter vellykket kjøring skannes `#outputArea` og resultatteksten til modellen
får en sluttlinje:

```
OUTPUTS: fig:1 (plotly), fig:2 (png), table:1 (tabulator), controls:1
```

Utelates når ingen refererbare elementer finnes. Manifestet og resolveren
bruker SAMME klassifiseringsfunksjon — nummereringen kan aldri sprike.

## 3. Klassifisering (delt funksjon, DOM-basert)

Én funksjon (`window.mdClassifyAskOutput(container)`) skanner
`#outputArea`-barna ETTER kjøring (fanger det som faktisk ble rendret) og
returnerer `[{ ref: 'fig:1', el, kind: 'plotly' }, …]` i DOM-rekkefølge,
nummerert per klasse:

| Referanse | Output-elementer |
| --- | --- |
| `fig` | plotly (`figure`), `png`-bilder, `vegalite` |
| `table` | `tabulator`, `tablehtml`, tekst-parsede `.output-table-wrap` |
| `map` | `leafletmap` |
| `widget` | `ipywidget` |
| `html` | `html`-embeds |
| `controls` | `#@param`-/ui-kontrollstriper (`.param-form`/`.ui-controls`-familien) |

Prosa (`pre`, `.output-markdown`) er IKKE refererbar — svaret har sin egen
prosa. Eksakte selektorer pinnes i implementasjonsplanen mot
`buildOutputNodes`-wrapperne.

## 4. Resolver (`js/ask-view.js`)

- Etter endelig `renderMd` (i `showAnswer`, ikke per streaming-delta): finn
  `<p>`-noder hvis trimmede tekst matcher
  `^\{\{(fig|table|map|widget|html|controls):(\d+)\}\}$`, bytt dem mot
  slot-divs `<div class="ask-out-slot" data-ref="fig:1">`.
- Flytt (ALDRI klon) matchende node fra `#outputArea` inn i slotten. Ved
  utflytting etterlates et usynlig **anker** (`<span class="ask-out-anchor"
  data-ref>`) på nodens plass i `#outputArea` — hjemreisebillett.
- Plotly-resize etter flytt (som `mountLiveOutput` gjør i dag).
- `#outputArea` selv monteres i en NY kollapset details «Full output»
  (`#askFullOutput`) i svarkortet — vises når området har innhold utover ankre.
- **Fallback:** null plassholdere i svaret → dagens oppførsel uendret (hele
  `#outputArea` monteres synlig via `mountLiveOutput`). Trygg degradering når
  modellen ignorerer kontrakten.
- Ukjent referanse (`{{fig:9}}` finnes ikke): slotten fjernes stille.
- Samme referanse to ganger: første slot vinner; senere duplikater fjernes
  (noden kan bare bo ett sted).

**Hjemreise (kritisk for livssyklus):** før svarboksen tømmes eller visning
byttes (`askNewBtn`, ny `runAskFlow`, `switchToEditor`/`unmountLiveOutput`)
returneres alle slot-noder til ankrene sine. Da forblir `purgePlots` +
`renderOutput` sin `innerHTML = ''` den eneste oppryddingsveien — ingen
plotly-lekkasje fra noder som «bor» utenfor `#outputArea`.

## 5. `#@param`-re-kjøringer (re-resolve)

`renderOutput` tømmer og gjenoppbygger `#outputArea` — utflyttede slot-noder
blir stale. Løsning etter eksisterende mønster (debounced MutationObserver på
`#outputArea`, som kopier-knappene):

1. Observer ser re-render → re-resolve trigges (debounced).
2. Hver slot: purge plotly i slot-innholdet (utenfor `purgePlots` sitt
   nedslagsfelt — resolveren MÅ purge selv), tøm slotten.
3. Klassifiser `#outputArea` på nytt; flytt ferske noder inn i slots med
   matchende `data-ref` (+ nye ankre).
4. Referanse borte etter re-kjøring → slotten står tom.

Kort flimmer under re-resolve aksepteres i v1.

## 6. KaTeX (lag 0)

- Lazy-lastes (CDN, samme lastemønster som andre libs) KUN når endelig
  svartekst matcher `$`/`\(` — ingen kostnad for matteløse svar.
- `renderMathInElement` over `#askAnswer` etter endelig rendring. Delimiters:
  `$$…$$`, `$…$`, `\(…\)`, `\[…\]`.
- Best effort over `.output-markdown`-noder når KaTeX alt er lastet.

## 7. CSS/layout

`.ask-out-slot`: fullbredde blokk, konsistente marger mot svartypografien,
`overflow-x: auto` for brede tabeller. «Full output»-details med samme stil
som eksisterende `#askDetails`. Ankre er `display: none`.

## 8. Kanttilfeller og feilhåndtering

- **Kopier-knappen** (`askCopyBtn`): plassholderlinjer i `lastAnswerMd` byttes
  til `[fig 1]`-stil klammertekst ved kopiering.
- Kjøring feilet (`lastRunOk = false`): dagens varselbadge-oppførsel beholdes;
  plassholdere resolves ikke (ingen pålitelig output å peke på) — de strippes
  som ved kopiering.
- `språk`-/`oppslag`-svar uten kjøring: ingen manifest, ingen plassholdere —
  uendret oppførsel.
- Gjelder alle tre ask-modusene (python/r/duckdb) — maskineriet er delt.

## 9. Testing

- **Node-tester** (rene funksjoner via eksisterende test-seam i ask-view.js):
  plassholder-parsing, manifest-formatering, klammetekst-stripping.
- **DOM-tester** (`tests/js/ui-dom.test.js`-mønsteret): resolver flytter riktig
  node, anker/hjemreise, fallback ved null plassholdere, ukjent referanse,
  re-resolve etter simulert re-render, plotly-purge-kall i slot.
- Manuell smoke i appen (Hans): mattespørsmål, standard dataspørsmål,
  simuleringsspørsmål med `#@param`.

## 10. Filer som endres

| Fil | Endring |
| --- | --- |
| `netlify/edge-functions/_lib/svar-prompt.ts` | Svarkontrakt i RUN (+ kort «design for svaret»-tillegg i MODE-blokkene) |
| `js/ai-chat.js` | OUTPUTS-manifest i `mdAskExecuteScript` |
| `js/ask-view.js` | Klassifisering, resolver, ankre/hjemreise, «Full output»-details, re-resolve-observer, KaTeX-trigger, kopier-stripping |
| `index.html` | KaTeX-lasting (lazy), `#askFullOutput`-details, CSS for slots/ankre |
| `tests/js/…` | Node- + DOM-tester som over |
