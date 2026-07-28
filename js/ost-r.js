// js/ost-r.js — eksplisitt typing i R (r-factor-runden §3, spec
// docs/superpowers/specs/2026-07-28-r-factor-runden-design.md).
// R-kilden bor HER (node-testbar streng — pyPatchSource-presedensen) og
// evalueres ved webR-boot ETTER rPatchSource (gjenbruker .ost_json_str/
// .ost_fetch/.ost_is_bridge_url) og ETTER at js/pxweb.js er evaluert inn i
// worker-scope (globalThis.PxWeb — eneste kilde for gjenkjenning/typemeta,
// aldri en R-tvilling). Anvendelsesreglene speiler openstat.py
// _apply_best_effort: kun kolonner hvis verdier er kildens KODER typles;
// time+intlike -> as.integer (R-integer har NA); ellers factor i kildens
// orden. Verdier endres ALDRI. Metadata-feil -> utypet + hoylytt notat.
(function (global) {
  'use strict';

  function rSource() {
    return [
      // metadata-URL for en gjenkjent kilde ('' for ukjent/feil — aldri kast)
      '.ost_meta_url <- function(url) {',
      '  tryCatch({',
      '    r <- as.character(webr::eval_js(paste0(',
      "      '(function(){ try { var px = globalThis.PxWeb;',",
      "      ' if (!px || !px.metaUrlFor) return \"\";',",
      "      ' return px.metaUrlFor(', .ost_json_str(url), '); } catch (e) { return \"\"; } })()')))",
      '    if (length(r) == 1L && nzchar(r)) r else ""',
      '  }, error = function(e) "")',
      '}',
      // typemeta som linjeprotokoll (Task 1-flaten), parset til R-liste.
      // Henting via .ost_fetch = broen (proxy-fallback + manifest gratis).
      '.ost_typemeta_fetch <- function(murl) {',
      '  path <- tryCatch(.ost_fetch(murl), error = function(e) {',
      '    message("ost: metadata utilgjengelig (", conditionMessage(e), ") \\u2014 laster utypet."); NULL })',
      '  if (is.null(path)) return(NULL)',
      '  tsv <- tryCatch(as.character(webr::eval_js(paste0(',
      "    '(function(){ try { var t = new TextDecoder(\"utf-8\", {fatal:true}).decode(Module.FS.readFile(', .ost_json_str(path), '));',",
      "    ' return globalThis.PxWeb.typemetaTsvFromText(t); } catch (e) { return \"ERR:\" + String(e).slice(0,200); } })()'))),",
      '    error = function(e) paste0("ERR:", conditionMessage(e)))',
      '  if (!nzchar(tsv)) return(NULL)',
      '  if (startsWith(tsv, "ERR:")) {',
      '    message("ost: typemeta-feil (", sub("^ERR:", "", tsv), ") \\u2014 laster utypet."); return(NULL) }',
      '  lapply(strsplit(tsv, "\\n", fixed = TRUE)[[1]], function(l) {',
      '    p <- strsplit(l, "\\x1f", fixed = TRUE)[[1]]',
      '    list(did = p[1], time = identical(p[2], "time"),',
      '         codes = if (length(p) > 2) p[-c(1, 2)] else character(0))',
      '  })',
      '}',
      // best-effort-paritet med openstat.py _apply_best_effort — les den
      // ved endring («endres den ene, endres den andre»).
      '.ost_apply_typemeta_r <- function(df, tm) {',
      '  for (e in tm) {',
      '    did <- e$did',
      '    if (!(did %in% names(df))) next',
      '    cats <- e$codes',
      '    if (!length(cats)) next',
      '    vals <- unique(as.character(df[[did]][!is.na(df[[did]])]))',
      '    if (!length(vals) || !all(vals %in% cats)) next',
      '    if (isTRUE(e$time) && all(grepl("^-?[0-9]+$", cats))) {',
      '      df[[did]] <- as.integer(as.character(df[[did]]))',
      '    } else {',
      '      df[[did]] <- factor(as.character(df[[did]]), levels = cats, ordered = isTRUE(e$time))',
      '    }',
      '  }',
      '  df',
      '}',
      // 0301-vernet VED parse (py-paritet): dim-kolonner leses som character
      // saa "0301" ikke blir 301 foer factor-typingen. Konservativt: vernet
      // droppes helt naar brukeren selv sender sep= eller colClasses= i ...
      // (headeren sniffes med komma — feil sep gir feil vern, og brukerens
      // valg vinner alltid, som i py-tvillingen).
      '.ost_col_guard <- function(path, tm, dots) {',
      '  if (any(c("colClasses", "sep") %in% names(dots))) return(NULL)',
      '  hdr <- tryCatch(strsplit(readLines(path, n = 1L, warn = FALSE), ",", fixed = TRUE)[[1]],',
      '                  error = function(e) character(0))',
      '  hdr <- gsub(\'^"|"$\', "", hdr)',
      '  dids <- vapply(tm, function(e) e$did, character(1))',
      '  guard <- intersect(dids, hdr)',
      '  if (!length(guard)) return(NULL)',
      '  stats::setNames(rep("character", length(guard)), guard)',
      '}',
      'ost_read_csv <- function(url, convert = TRUE, ...) {',
      '  if (!.ost_is_bridge_url(url)) stop("ost_read_csv krever en URL (https://\\u2026 eller /api/hent?\\u2026)")',
      '  path <- .ost_fetch(url)',
      '  murl <- .ost_meta_url(url)',
      '  if (!nzchar(murl)) return(utils::read.csv(path, ...))',   // ukjent: ren passthrough
      '  tm <- NULL',
      '  if (isTRUE(convert)) tm <- .ost_typemeta_fetch(murl)',
      '  cc <- if (!is.null(tm)) .ost_col_guard(path, tm, list(...)) else NULL',
      '  df <- if (is.null(cc)) utils::read.csv(path, ...) else utils::read.csv(path, colClasses = cc, ...)',
      '  if (!is.null(tm)) df <- .ost_apply_typemeta_r(df, tm)',
      '  attr(df, "ost_url") <- url',                              // panelet — uansett convert
      '  df',
      '}',
      'ost_convert_dtypes <- function(df, meta) {',
      '  if (missing(meta) || is.null(meta)) stop("ost_convert_dtypes krever meta=", " (register-URL eller typemeta-liste) \\u2014 heuristikk uten meta er ikke st\\u00f8ttet i R")',
      '  tm <- if (is.character(meta) && length(meta) == 1L) {',
      '    murl <- .ost_meta_url(meta)',
      '    if (!nzchar(murl)) stop("gjenkjente ikke kilden: ", meta)',
      '    t2 <- .ost_typemeta_fetch(murl)',
      '    if (is.null(t2)) stop("kunne ikke hente metadata for ", meta)',
      '    t2',
      '  } else if (is.list(meta)) meta',
      '  else stop("meta m\\u00e5 v\\u00e6re en register-URL eller en typemeta-liste")',
      '  .ost_apply_typemeta_r(df, tm)',
      '}',
      ''
    ].join('\n');
  }

  global.OstR = { rSource: rSource };
})(typeof window !== 'undefined' ? window : globalThis);
