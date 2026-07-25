# Metadata-UI flyttes til Datasett-flaten — design

**Dato:** 2026-07-25 (etter bruksprøving av leveranse A samme dag)
**Status:** Supersederer plasseringsdelen av §5 i
`2026-07-25-metadata-sidebar-design.md`. MetaInfo-formen (§1),
flettingsregelen (§2), direktivreglene (§3), endepunktet (§4) og
tillitsregelen (§7) består uendret — dette dokumentet flytter kun HVOR
tingene vises, og bytter kommentar-lenken med innebygd tråd.

## Bakgrunn (Hans' bruksprøving av leveranse A)

Fire observasjoner: (1) samme data så ut som tre oppføringer (datasett
`peng`, datasett `penguins`, kilde `peng` m/ variabelrader); (2) klikk på
datasett fra en annen modus ga «kjør et script»-feil; (3) variabelinfo lå
under «Tilkoblede kilder», men ønskes ved variabelklikk i Datasett-listen —
som i dag er hardt sperret utenfor python (`nonPyRuntime`-gaten,
index.html:4394, sperrer HELE panelet, ikke bare stats); (4) ingen ⓘ på
datasettradene. Konklusjon: tyngdepunktet flyttes fra «Tilkoblede kilder»
til Datasett-listen.

## §1 Datasett-listen (primærflaten)

- **ⓘ på hver datasettrad** (på linje med navnet). Klikk åpner container
  under raden med, i rekkefølge:
  1. `# meta`-innhold for datasettet (target = datasettnavnet/aliaset) —
     øverst, `meta-info-user`-stil,
  2. proveniens: kilde-URL/registerkilde og format (fra load-oppføringen),
  3. rader × kolonner,
  4. kildemetadata NÅR datasettet stammer fra en registerkilde
     (`<register-id>/<tabell>`-load): tittel/utgiver/tillit/lenker via
     `/api/metadata` — samme lazy+cache-mønster som leveranse A
     (aldri ved sideinnlasting; cache per mål),
  5. 💬-kommentarknapp (§3), mål = datasettnavnet.
- **Variabelklikk åpner variabelpanelet i ALLE moduser.**
  `nonPyRuntime`-sperren flyttes fra inngangen til KUN stats-delen:
  metadata-delen (beskrivelse fra `variable_metadata`, `# meta`-notater,
  lenker, 💬 med mål `datasett.variabel`) vises alltid. Når motoren ikke
  støtter fordeling/statistikk utelates den delen STILLE — ingen
  forklaringsmelding. (Roadmap: stats-støtte i flere motorer, §6.)
- Dette LØSER helhets-reviewens funn om alias-vs-nøkkel: brukernotater
  (`# meta`) hører til datasett/alias, der target alltid matcher.
  `# meta` mot en kildecontainer-nøkkel (`ssb/05839`) er bevisst ikke
  uttrykkbart — kilde-containeren viser kildens egne metadata.

## §2 «Tilkoblede kilder» (slanket)

- Kun kildenavn per rad — variabelradene fjernes.
- Hele raden (navn eller ⓘ) er ETT målpunkt: klikk åpner ÉN samlet
  container: `# meta`-innhold for kildens connect-alias øverst (filkilder:
  aliaset er målet, som i dag; registerkilder: connect-aliaset, f.eks.
  `# meta ssb …` for `# connect … as ssb` — nøkkelformen `ssb/05839` er
  fortsatt ikke et gyldig direktiv-mål), kildemetadata
  (tittel/utgiver/lenker fra `/api/metadata` for registerkilder;
  kilde-URL-lenke for filkilder), deretter variabellisten. Variablene i
  containeren er klikkbare → kodeliste/variabelinfo i samme
  container-mønster som leveranse A.
- Advarselsraden for ukjente `# meta`-mål består (aldri stille dropp).
- Semantikk: kilde-flaten er «hva finnes hos kilden» (før/uavhengig av
  lasting); Datasett-listen er «hva har jeg lastet».

## §3 Kommentarer — giscus i stedet for lenke ut

- 💬 i alle containerne (datasett-ⓘ, variabelpanel, kilde-container)
  åpner en innebygd giscus-tråd, lastet LAZY først ved klikk på 💬.
- Term = dagens målstreng (`ssb/05839.Region`, `penguins.species`) →
  deterministisk én tråd per mål i `openstat-metadata`-repoet. Lesing uten
  innlogging; skriving med GitHub-innlogging inne i widgeten.
- §7s tillitsregel består: tråden ligger i tydelig «fra fellesskapet»-ramme,
  aldri forvekselbar med kildens offisielle metadata. Liten
  «åpne på GitHub»-lenke (dagens søke-URL) beholdes i rammen.
- giscus-scriptet er ekstern JS — lastes kun ved eksplisitt 💬-klikk
  (personvern: ingen tredjepartskall før brukeren ber om kommentarer).
- **Forutsetning (Hans, engangs):** installere giscus-appen på
  `hmelberg/openstat-metadata` (github.com/apps/giscus) og opprette en
  Discussions-kategori (f.eks. «Kommentarer», type Announcement anbefales
  av giscus for å hindre at tilfeldige oppretter tråder utenom appen).
  Planen får nøyaktige steg + config-verdiene (repo-id/kategori-id fra
  giscus.app).

## §4 Stale datasett (andre motorer enn aktiv modus)

- Gråes ut med merkelapp («fra brython») og sorteres NEDERST; aktive
  modusens datasett øverst.
- Klikk på grået datasett: når datasettet stammer fra en kjent kilde
  (`# read`/`# load` med URL) tilbys **«Hent inn i <modus>»** — laster
  dataene inn i aktiv motor via data-loaderens vanlige vei (buffer-cache
  eller re-fetch). Beregnede datasett (uten kjent kilde) får en vennlig
  «kjør scriptet på nytt i denne modusen»-forklaring i stedet for dagens
  feilmelding. (Gjennomførbarhet for buffer-gjenbruk avklares i planfasen —
  fallback er alltid re-fetch av URL-en.)
- Ingen sletting ved modusbytte — historikken er synlig men ærlig.

## §5 Eksempler

- Brython-eksemplene (bry32–35) oppdateres: konsekvent alias (`penguins`
  der pingvindata brukes), tekster som beskriver den NYE UI-en.
- Nye pyodide-eksempler i `examples/python/`: minst ett med etablert
  metadata-rik kilde via sdmx — OECD (endepunktet støtter table_metadata
  for oecd allerede) — pluss en SSB-variant (v2-API-et).
- ALLE eksempler verifiseres med EKTE klikk i browser i BÅDE brython- og
  python-modus før commit (lærdom: leveranse A-smoke-testen kalte
  showVariableDetail programmatisk og gikk utenom nonPyRuntime-sperren —
  klikket var aldri testet).

## §6 Roadmap (bevisst utenfor denne leveransen)

- Fordeling/statistikk i variabelpanelet for flere motorer (brython
  først — den har dataene i JS-tilgjengelig form). Til da: stats utelates
  stille utenfor python.
- Høstet `community-notes.json` (fase 2 fra §7 i A-spec-en) — kan komme i
  TILLEGG til giscus (giscus = tråden; høsting = kuraterte notater).
- `hasTableMetadata`-predikatet og 502-klartekst-beslutningen fra
  A-reviewen (åpne Hans-beslutninger, uendret av dette designet).

## §7 Testing

- MetaInfo-modulen og parseren er uendret (flate-nøytrale) — eksisterende
  tester består. Nye enhetstester kun for ny ren logikk (f.eks.
  giscus-config-bygging, sorterings-/stale-logikk om den trekkes ut som
  testbar funksjon).
- UI-endringene verifiseres med klikk-basert browser-smoke-test i brython
  OG python: datasett-ⓘ, variabelklikk (med og uten stats), kilde-container
  m/ variabelliste, giscus-lasting, grået-datasett-flyt, «Hent inn»-valget.
- Full suite (deno + node + pytest) før commit, lokale commits, INGEN push
  (etablert norm).
