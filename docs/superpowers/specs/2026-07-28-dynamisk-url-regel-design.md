# Dynamisk-URL-regelen — design (2026-07-28)

**Mål:** Lukk q15-forkledningen (dtypes-batchen, DELT): ved dynamisk bygde
URL-er oppfant modellen en direktivlinje med VARIABEL-argument (ugyldig
literal-grammatikk), merket den «autorativ», og «simulerte innlasting» med
urllib — der riktig svar for en cors-åpen kilde (DST målt cors:true) var ren
`pd.read_csv(url)`.

## §1 Ny EVAL-REGEL 7 (i regellista i data-svar-prompt.ts)

Dynamisk bygde URL-er (løkker over år/sider, f-string/paste0) er VANLIG
KODE: `pd.read_csv(url)`/`read.csv(url)` direkte — broen håndterer også
dynamiske URL-er (sync-fallback). Ved målt cors:false pakkes URL-en i
`/api/hent?url=` i koden. ALDRI urllib/requests (regel 4 gjelder), og ALDRI
«simuler innlasting»-kode — koden skal HENTE, ikke late som.

## §2 Kryss-lenke fra grammatikk-KRAVET

Grammatikk-punktet («ingen variabler i argumenter …») får én
henvisningssetning: trenger du en dynamisk URL er det vanlig kode
(regel 7), aldri en direktivlinje. (Forrige rundes lærdom anvendt
proaktivt: nye regler kobles EKSPLISITT til naboreglene sine.)

## §3 Ingen DST-hardkoding

DST-cors-fakta hardkodes IKKE som quirk — regel 6 («cors:true → direkte»)
+ probe-tillit dekker det generelt; regel 7 fjerner grunnen til å unnvike.

## §4 Deno-needles + måling (port før merge)

- Needles i python-systemlista: «dynamisk», «simuler».
- Batch (Deep): q15 ×2 (python/dst — målklassen) + q1 ×1 (naboklasse-vakt:
  literal-direktiv + direktivvariabel-bruk skal IKKE degradere til
  alt-blir-read_csv). Verify-ritualet (netlify-restart + 200/400-smoke)
  før måling. Resultat logges i evalsettet.

## §5 Utenfor scope

MODE-blokkene, kriteriene (12 dekker alt dtypes), R/duckdb-speiling av
regelen (regellista er delt — gjelder alle moduser automatisk).
