"""Den EKTE _run_duck_sql (Pyodide-kjernen i index.html) kjørt i CPython mot
en falsk window.__duck som delegerer til ekte duckdb. Dekker review-funn:
  B11a: preview-SELECT-en kjøres én gang (ikke script + count + LIMIT);
  B11d: opprettede tabellnavn med '"' siteres riktig;
  B1:   en python-celle som binder datasettet på nytt (df = df[...]) skal
        sees av neste DuckDB-celle, også i per-celle-modus (fresh=False).
"""
import asyncio
import pathlib
import sys
import types

import pandas as pd
import pytest

duckdb = pytest.importorskip("duckdb")
pytest.importorskip("pyarrow")

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"


class _Res:
    def __init__(self, d):
        self._d = d

    def to_py(self):
        return self._d


class FakeDuck:
    def __init__(self):
        self.con = duckdb.connect()
        self.sql_log = []

    async def begin(self, opts):
        if not (opts or {}).get("fresh", True) is False:
            for name, kind in self.con.execute(
                "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main'"
            ).fetchall():
                self.con.execute("DROP " + ("VIEW" if "VIEW" in kind else "TABLE") + ' "' + name.replace('"', '""') + '"')

    async def registerTable(self, name, buf, as_table):
        import io
        import pyarrow.parquet as pq
        tbl = pq.read_table(io.BytesIO(bytes(buf)))
        self.con.register("__tmp_reg", tbl)
        kind = "TABLE" if as_table else "VIEW"
        ident = '"' + name.replace('"', '""') + '"'
        if kind == "VIEW":
            # en ekte view over en registrert arrow-tabell forsvinner når
            # __tmp_reg avregistreres — materialiser i en skjult tabell
            self.con.execute("CREATE OR REPLACE TABLE " + '"__src_' + name.replace('"', '""') + '"' + " AS SELECT * FROM __tmp_reg")
            self.con.execute("CREATE OR REPLACE VIEW " + ident + " AS SELECT * FROM " + '"__src_' + name.replace('"', '""') + '"')
        else:
            self.con.execute("CREATE OR REPLACE TABLE " + ident + " AS SELECT * FROM __tmp_reg")
        self.con.unregister("__tmp_reg")

    async def exec(self, sql):
        self.sql_log.append(sql)
        self.con.execute(sql)

    async def query(self, sql):
        self.sql_log.append(sql)
        df = self.con.execute(sql).fetchdf()
        return _Res({c: df[c].tolist() for c in df.columns})

    async def end(self):
        pass


def _load(monkeypatch):
    text = INDEX.read_text(encoding="utf-8")
    start = text.index("def _duck_concise(")
    end = text.index("\n`;", start)
    src = text[start:end].replace("\\\\", "\\")
    duck = FakeDuck()
    js = types.ModuleType("js")
    js.__duck = duck
    js.Object = types.SimpleNamespace(fromEntries=dict)
    ffi = types.ModuleType("pyodide.ffi")
    ffi.to_js = lambda x, **k: x
    pyo = types.ModuleType("pyodide")
    pyo.ffi = ffi
    monkeypatch.setitem(sys.modules, "js", js)
    monkeypatch.setitem(sys.modules, "pyodide", pyo)
    monkeypatch.setitem(sys.modules, "pyodide.ffi", ffi)
    e = types.SimpleNamespace(datasets={})
    ns = {"pd": pd, "e": e}
    exec(compile(src, "<index.html:_run_duck_sql>", "exec"), ns)
    return ns["_run_duck_sql"], e, duck


def test_preview_select_runs_once(monkeypatch):
    run, e, duck = _load(monkeypatch)
    e.datasets["df"] = pd.DataFrame({"x": list(range(1000))})
    out = asyncio.run(run("SELECT x FROM df WHERE x % 2 = 0 ORDER BY x DESC -- slutt"))
    assert "998" in out
    assert "500 rader — viser de første 400" in out
    ran = [s for s in duck.sql_log if "x % 2 = 0" in s]
    assert len(ran) == 1, ran


def test_created_table_name_with_quote(monkeypatch):
    run, e, duck = _load(monkeypatch)
    out = asyncio.run(run('CREATE TABLE "my""t" AS SELECT 1 AS a'))
    assert 'my"t' in e.datasets
    assert "Opprettet datasett my\"t" in out


def test_rebound_dataset_is_seen_by_next_cell_without_fresh(monkeypatch):
    run, e, duck = _load(monkeypatch)
    e.datasets["df"] = pd.DataFrame({"age": [20, 31, 40]})
    out1 = asyncio.run(run("SELECT count(*) AS n FROM df", False))
    assert "3" in out1
    # python-cellen df = df[df.age > 30] (skrevet tilbake av DatasetStore)
    e.datasets["df"] = e.datasets["df"][e.datasets["df"].age > 30]
    out2 = asyncio.run(run("SELECT count(*) AS n FROM df", False))
    assert out2.strip().splitlines()[-1].strip() == "2"


def test_rebound_created_table_is_replaced_without_fresh(monkeypatch):
    run, e, duck = _load(monkeypatch)
    asyncio.run(run("CREATE TABLE t AS SELECT * FROM range(5) r(v)", False))
    assert len(e.datasets["t"]) == 5
    e.datasets["t"] = e.datasets["t"].head(2)
    out = asyncio.run(run("SELECT count(*) AS n FROM t", False))
    assert out.strip().splitlines()[-1].strip() == "2"
