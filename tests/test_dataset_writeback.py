"""B1 (review 2026-10): en celle som TILORDNER et datasettnavn på nytt
(df = df[df.age > 30]) ble tilbakestilt — segmentløkken kaller
e.sync_datasets_to_globals(_g) før hvert segment, og DatasetStore skjøv
den opprinnelige framen inn igjen. Testen kjører den EKTE DatasetStore
hentet ut av index.html sin JS-template-literal (samme teknikk som
test_display_policy.py) og simulerer celle 1-3 slik segmentløkken gjør."""
import pathlib

import pandas as pd

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"


def _store_cls():
    text = INDEX.read_text(encoding="utf-8")
    start = text.index("class DatasetStore:")
    end = text.index("e = DatasetStore()", start)
    ns = {"pd": pd}
    exec(compile(text[start:end].replace("\\\\", "\\"), "<index.html:DatasetStore>", "exec"), ns)
    return ns["DatasetStore"]


def _cell(store, g, code):
    # samme rekkefølge som _m2py_run_segment: sync inn, kjør, sync ut
    store.sync_datasets_to_globals(g)
    exec(code, g)
    store.sync_datasets_to_globals(g)


def _new():
    s = _store_cls()()
    s.datasets["df"] = pd.DataFrame({"age": [20, 25, 31, 40, 50]})
    return s, {}


def test_reassigned_dataset_survives_next_cell():
    s, g = _new()
    _cell(s, g, "n0 = len(df)")
    _cell(s, g, "df = df[df.age > 30]")
    _cell(s, g, "n = len(df)")
    assert g["n0"] == 5
    assert g["n"] == 3
    # og registeret (som DuckDB-/use-veiene leser) ser den nye framen
    assert len(s.datasets["df"]) == 3


def test_store_update_wins_over_stale_global():
    # en ny # load / to_microdata / DuckDB CREATE TABLE erstatter registeret
    # — den eldre globale (brukerens filtrerte versjon) skal da ikke vinne.
    s, g = _new()
    _cell(s, g, "df = df[df.age > 30]")
    s.datasets["df"] = pd.DataFrame({"age": [1, 2]})
    _cell(s, g, "n = len(df)")
    assert g["n"] == 2


def test_non_frame_rebind_is_not_clobbered_nor_stored():
    s, g = _new()
    _cell(s, g, "df = 'tekst'")
    _cell(s, g, "t = df")
    assert g["t"] == "tekst"
    assert isinstance(s.datasets["df"], pd.DataFrame)


def test_deleted_global_is_restored():
    s, g = _new()
    _cell(s, g, "del df")
    _cell(s, g, "n = len(df)")
    assert g["n"] == 5


def test_separate_namespaces_tracked_independently():
    s, g1 = _new()
    g2 = {}
    _cell(s, g1, "df = df[df.age > 30]")
    # et annet navnerom (f.eks. jamovi sin globals()) har aldri sett den
    # gamle framen — det får registerets (nye) verdi
    s.sync_datasets_to_globals(g2)
    assert len(g2["df"]) == 3
