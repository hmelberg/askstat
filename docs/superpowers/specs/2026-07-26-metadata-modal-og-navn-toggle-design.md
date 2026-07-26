# Metadata i modal + navn-toggle for variabler — design

**Dato:** 2026-07-26 (etter bruksprøving av `2026-07-26-metadata-ui-datasett-flate` samme dag)
**Status:** Reviderer klikk-modellen fra `2026-07-26-metadata-ui-datasett-flate-design.md`. MetaInfo-modulen, `# meta`-parseren og `/api/metadata` er uendret — dette flytter HVOR metadata vises (inline → modal) og gjør variabellisten til en navn-toggle. Roadmap-punktene i den forrige spec-en består.

## Bakgrunn (Hans' bruksprøving)

Etter at forrige leveranse gikk live: (1) ⓘ åpnet metadata i en inline-container i sidebaren — Hans vil ha den i en egen modal; (2) variabellisten var alltid synlig (datasett) / inne i containeren (kilder) — Hans vil at klikk på navnet skal veksle (åpne/skjule) variabellisten; (3) datasett-navnet åpnet datatabellen (Tabulator) — den flyttes til et eget ⊞-ikon; (4) «Fra fellesskapet» bør hete «Kommentarer»; (5) giscus-widgeten viser stygge «blå linjer» (dens egen ikke-installert/feil-tilstand + hardkodet lyst/engelsk tema).

## §1 Enhetlig rad-modell (datasett OG kilder)

Radoppsett: `navn` · `⊞` (kun datasett) · `ⓘ`.

| Handling | Datasett | Kilde |
|---|---|---|
| Klikk navn | veksle variabelliste (skjult som standard; klikk igjen skjuler) | veksle variabelliste |
| Klikk ⊞ | åpner datatabell-modalen (`showIndividataModal`) — flyttet hit fra navn-klikk | *(ingen ⊞)* |
| Klikk ⓘ | metadata i **modal** | metadata i **modal** |
| Klikk en variabel (i den utvidede lista) | variabeldetalj-panel (`showVariableDetail`, som nå) | variabelens kodeliste/detalj |

Prinsipp: **⊞ = «se dataene», ⓘ = «om dataene», navn = «hva finnes i dem»**.

- Variabellisten er SKJULT som standard i begge flater (i dag: alltid synlig for datasett, inne-i-container for kilder). Navn-klikk toggler den inline under raden. Aktiv/utvidet tilstand markeres visuelt (f.eks. en ▸/▾-indikator eller uthevet navn).
- Stale-datasett (forrige leveranse): navn-klikk på et stale datasett gir fortsatt «Kjør scriptet i denne modusen»-forklaringen (variabellisten finnes ikke i denne motoren) — uendret. ⊞ og ⓘ på stale rader: ⓘ kan åpne metadata-modalen (metadata er motor-uavhengig); ⊞ gir samme kjør-forklaring (ingen data å vise).

## §2 Metadata-modal

- Ny overlay-modal, bygget på det eksisterende `var-detail-overlay`-mønsteret (header m/ tittel + lukk-knapp, `role="dialog"`, Esc/backdrop lukker).
- Innhold = nøyaktig det metadata-containeren viste før (spec-ene A/B): `# meta`-innhold øverst, proveniens, rader×kolonner (datasett) / kildeform, kildeberikelse fra `/api/metadata` (lazy, cache uendret), og kommentar-rammen (§3). All rendring gjenbruker MetaInfo + den eksisterende `metaRenderDataset`/`metaRender`-logikken — bare mål-noden endres fra inline-container til modal-body.
- Lazy-henting og caching (`window.__datasetMetaCache` / `entry.metaInfo`) beholdes.
- Den inline `.meta-info-container`-en i sidebaren fjernes (metadata bor nå i modalen).

## §3 Kommentarer

- Overskriften «Fra fellesskapet» → **«Kommentarer»** (`t()`-nøkkel byttes; en.js oppdateres).
- Rammen ligger i metadata-modalen (og i variabeldetalj-panelet, som før). 💬-knappen toggler giscus-tråden som nå.
- giscus gjøres **tema-bevisst**: les `document.body.getAttribute('data-theme')` (`light`/`dark`) og send tilsvarende giscus-`data-theme` (`light`/`dark`) i stedet for hardkodet `preferred_color_scheme`. Oppdater tråden ved temabytte hvis åpen (best-effort; ellers gjelder ved neste åpning).
- Språk: send `no` hvis giscus støtter det, ellers behold `en` (implementeringen verifiserer giscus' lokalliste; tema er hovedfiksen).
- De «blå linjene» er giscus' egen ikke-installert-tilstand — forsvinner når giscus-appen installeres på `hmelberg/openstat-metadata` (Hans' steg). Rammen bør ha en fast, diskret min-høyde så mellomstadiet ser ryddig ut.

## §4 Bevisst utenfor / uendret

- MetaInfo-modulen, `# meta`-parseren, `/api/metadata`, giscus-modulens kjerne (én tråd om gangen, lazy) — uendret.
- Roadmap fra forrige spec (kilde-kanonisering, alle-kilder-liste, attrs-opphav, stats i flere motorer) — fortsatt utenfor.
- Kilde-variabel-detalj: beholder dagens kodeliste-innhold; bare plasseringen (under navn-togglet liste) endres.

## §5 Testing

- `js/comments.js` tema/språk: enhetstest på `attrs()` (tema-mapping). MetaInfo/parser uendret → eksisterende tester består.
- UI-endringene (modal, toggle, ikoner): klikk-basert browser-smoke i BÅDE brython og python — ⓘ→modal, navn→toggle av/på, ⊞→datatabell (datasett), kilde-navn→toggle, «Kommentarer»-overskrift, giscus tema-match. Full suite (node+deno+pytest) før commit. Lokale commits, INGEN push (norm).
