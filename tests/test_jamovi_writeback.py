"""B11i (review 2026-10): jamovi-datafanens skriv-tilbake og legg-til-rad.
Python-kilden bor som JS-strengkonstanter i js/modes/jamovi.js
(JMV_WRITEBACK_PY / JMV_ADDROW_PY); testen henter dem ut med node og
kjører dem mot ekte pandas.
  - en redigert verdi skrives med kolonnens dtype (en tekst «3» inn i en
    int-kolonne er 3; 2.5 oppkaster kolonnen til float i stedet for å kaste);
  - ugyldig verdi gir en tydelig ValueError (JS viser den og ruller tilbake);
  - legg-til-rad tåler en ikke-heltalls-indeks."""
import json
import pathlib
import shutil
import subprocess
import types

import pandas as pd
import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent

EXTRACT_JS = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const out = {};
for (const name of ['JMV_WRITEBACK_PY', 'JMV_ADDROW_PY']) {
  const s = src.indexOf('var ' + name + ' =');
  if (s < 0) { console.error('mangler ' + name); process.exit(2); }
  const e = src.indexOf(".join('\\n');", s);
  out[name] = new Function('return ' + src.slice(s + ('var ' + name + ' =').length, e + ".join('\\n')".length))();
}
process.stdout.write(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def snippets():
    if shutil.which("node") is None:
        pytest.skip("node mangler")
    out = subprocess.run(["node", "-e", EXTRACT_JS, str(ROOT / "js/modes/jamovi.js")],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def _store(df):
    return types.SimpleNamespace(datasets={"d": df}, active_name="d")


def _write(snippets, df, rid, col, val):
    e = _store(df)
    exec(snippets["JMV_WRITEBACK_PY"], {"e": e, "_wb_id": rid, "_wb_col": col, "_wb_val": val})
    return e.datasets["d"]


def test_int_column_accepts_numeric_text(snippets):
    df = _write(snippets, pd.DataFrame({"x": [1, 2, 3]}), 1, "x", "7")
    assert df.at[1, "x"] == 7
    assert pd.api.types.is_integer_dtype(df["x"])


def test_int_column_upcasts_for_float(snippets):
    df = _write(snippets, pd.DataFrame({"x": [1, 2, 3]}), 1, "x", 2.5)
    assert df.at[1, "x"] == 2.5
    assert pd.api.types.is_float_dtype(df["x"])


def test_nullable_int_column_float_value(snippets):
    df = _write(snippets, pd.DataFrame({"x": pd.array([1, None, 3], dtype="Int64")}), 1, "x", 2.5)
    assert df.at[1, "x"] == 2.5


def test_int_column_missing_becomes_nullable(snippets):
    df = _write(snippets, pd.DataFrame({"x": [1, 2, 3]}), 0, "x", None)
    assert pd.isna(df.at[0, "x"])
    assert df.at[1, "x"] == 2


def test_float_column_text_number(snippets):
    df = _write(snippets, pd.DataFrame({"x": [1.5, 2.5]}), 0, "x", "3,25")
    assert df.at[0, "x"] == 3.25


def test_numeric_column_rejects_text(snippets):
    with pytest.raises(ValueError, match="x"):
        _write(snippets, pd.DataFrame({"x": [1, 2]}), 0, "x", "abc")


def test_bool_column(snippets):
    df = _write(snippets, pd.DataFrame({"b": [True, False]}), 1, "b", "true")
    assert df.at[1, "b"] is True or df.at[1, "b"] == True  # noqa: E712


def test_text_column_keeps_string(snippets):
    df = _write(snippets, pd.DataFrame({"s": ["a", "b"]}), 0, "s", "z")
    assert df.at[0, "s"] == "z"


def test_add_row_integer_index(snippets):
    df = pd.DataFrame({"x": [1, 2]})
    e = _store(df)
    ns = {"e": e}
    exec(snippets["JMV_ADDROW_PY"], ns)
    assert ns["_ni"] == 2
    assert len(e.datasets["d"]) == 3


def test_add_row_string_index(snippets):
    df = pd.DataFrame({"x": [1.0, 2.0]}, index=["a", "b"])
    e = _store(df)
    ns = {"e": e}
    exec(snippets["JMV_ADDROW_PY"], ns)
    assert len(e.datasets["d"]) == 3
    assert ns["_ni"] not in ("a", "b")
