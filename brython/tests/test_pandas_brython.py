import sys, os, io
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pandas_brython as pd

def test_import_and_basic_frame():
    df = pd.DataFrame({'a': [1, 2, 3], 'b': ['x', 'y', 'x']})
    assert len(df) == 3
    assert list(df['a']) == [1, 2, 3]

def test_read_csv_stringio():
    df = pd.read_csv(io.StringIO("a,b\n1,x\n2,y\n"))
    assert len(df) == 2

def test_groupby_and_to_html():
    df = pd.DataFrame({'g': ['a', 'a', 'b'], 'v': [1, 2, 3]})
    counts = df.groupby('g').size()
    html = df.to_html()
    assert '<table' in html

def test_gap_verbs_raise_clear_error():
    # 2026-07-10: merge/join/pivot_table/melt/corr er implementert (se
    # test_pandas_brython_diff.py); bare MultiIndex-/tidsserie-avhengige
    # verb er igjen som gap.
    df = pd.DataFrame({'a': [1]})
    for verb in ['pivot', 'rolling', 'resample']:
        try:
            getattr(df, verb)()
            raise AssertionError(verb + ' should raise NotImplementedError')
        except NotImplementedError as e:
            assert 'Brython' in str(e), verb + ': message must name Brython mode'

def test_former_gap_verbs_now_implemented():
    for verb in ['merge', 'crosstab', 'get_dummies', 'pivot_table', 'melt']:
        fn = getattr(pd, verb)
        assert callable(fn) and fn.__name__ != verb or fn.__name__ == verb
        assert 'NotImplementedError' not in (fn.__doc__ or '') and not getattr(fn, '_is_gap', False)
    for verb in ['merge', 'join', 'pivot_table', 'melt', 'corr']:
        assert getattr(pd.DataFrame, verb).__doc__ is None or 'Brython-modus' not in getattr(pd.DataFrame, verb).__doc__

def test_read_csv_type_inference():
    df = pd.read_csv(io.StringIO("a,b,c\n1,x,1.5\n2,y,\n"))
    assert list(df['a']) == [1, 2], 'int inference'
    assert isinstance(list(df['c'])[0], float), 'float inference'
    assert list(df['b']) == ['x', 'y'], 'strings preserved'
    missing = list(df['c'])[1]
    assert missing is pd.nan, 'empty numeric cell becomes nan sentinel'
    assert len(df.dropna()) == 1, 'dropna sees the nan'
    assert df['a'].mean() == 1.5, 'mean works on inferred ints'

def test_groupby_mean_with_missing_values():
    df = pd.read_csv(io.StringIO("g,v\na,1\na,\nb,3\n"))
    out = df.groupby('g').mean()
    html = out.to_html()
    assert '<table' in html

def test_float_display_formatting():
    df = pd.DataFrame({'g': ['a', 'b'], 'v': [5.005999999999999, 620000.0]})
    html = df.to_html()
    assert '5.006' in html and '5.005999' not in html, 'float noise rounded in to_html'
    assert '620000.0' in html, 'integral float keeps .0'
    txt = str(df)
    assert '5.006' in txt and '5.005999' not in txt, 'float noise rounded in str()'
    # data itself is untouched
    assert list(df['v'])[0] == 5.005999999999999


# ── mini-knippet §2: dtype-kwarg i read_csv (0301-vernet) ──────────────────

def test_read_csv_dtype_none_default_unchanged():
    # Dagens (dokumenterte) begrensning uten dtype-kwarg: ledende null blir
    # tall ved parse. Baseline som viser HVORFOR dtype-kwarget trengs.
    df = pd.read_csv(io.StringIO("kommune,v\n0301,1\n"))
    assert list(df['kommune']) == [301]


def test_read_csv_dtype_dict_preserves_leading_zero():
    df = pd.read_csv(io.StringIO("kommune,v\n0301,1\n0302,2\n"), dtype={'kommune': str})
    assert list(df['kommune']) == ['0301', '0302'], 'ledende null bevart for navngitt kolonne'
    assert list(df['v']) == [1, 2], 'ikke-nevnte kolonner typeinferes som før'


def test_read_csv_dtype_dict_str_marker_variants():
    for marker in (str, 'str', 'object'):
        df = pd.read_csv(io.StringIO("kommune,v\n0301,1\n"), dtype={'kommune': marker})
        assert list(df['kommune']) == ['0301'], marker


def test_read_csv_dtype_scalar_all_columns_text():
    df = pd.read_csv(io.StringIO("a,b\n1,0301\n2,0302\n"), dtype=str)
    assert list(df['a']) == ['1', '2'], 'skalar dtype=str skrur av inferens for ALLE kolonner'
    assert list(df['b']) == ['0301', '0302']


def test_read_csv_dtype_str_marker_empty_cell_becomes_nan():
    # NaN-deteksjon er UAVHENGIG av dtype=str (py-paritet — se
    # test_pandas_parity_diff.py: ekte pandas gjør det samme).
    df = pd.read_csv(io.StringIO("kommune,v\n0301,1\n,2\n"), dtype={'kommune': str})
    vals = list(df['kommune'])
    assert vals[0] == '0301'
    assert vals[1] is pd.nan


def test_read_csv_dtype_unknown_dict_value_raises():
    try:
        pd.read_csv(io.StringIO("a,v\n1,2\n"), dtype={'a': int})
        raise AssertionError('skulle kastet ValueError')
    except ValueError as e:
        assert 'a' in str(e) and 'støttes ikke i mini-pandas' in str(e), str(e)


def test_read_csv_dtype_unknown_scalar_raises():
    try:
        pd.read_csv(io.StringIO("a,v\n1,2\n"), dtype=int)
        raise AssertionError('skulle kastet ValueError')
    except ValueError as e:
        assert 'støttes ikke i mini-pandas' in str(e), str(e)


def test_read_csv_dtype_scalar_object_string_not_supported():
    # Spec (mini-knippet §2) er eksplisitt: skalar-formen støtter kun
    # str/"str" — "object" er kun gyldig som DICT-verdi, ikke som skalar.
    try:
        pd.read_csv(io.StringIO("a,v\n1,2\n"), dtype='object')
        raise AssertionError('skulle kastet ValueError')
    except ValueError as e:
        assert 'støttes ikke i mini-pandas' in str(e), str(e)


if __name__ == '__main__':
    for name, fn in sorted(globals().items()):
        if name.startswith('test_'):
            fn(); print('PASS', name)
