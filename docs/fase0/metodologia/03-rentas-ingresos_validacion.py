"""Recalcula MERCADO RENTAS + ENF. INGRESOS desde las ENTRADAS del dump y compara vs valor en caché.
Uso: venv/bin/python metodologia/03-rentas-ingresos_validacion.py
"""
import math, os, re, statistics

BASE = os.path.join(os.path.dirname(__file__), '..', 'dump')


def load(fmt, prefix):
    d = {}
    fn = [f for f in os.listdir(os.path.join(BASE, fmt)) if f.startswith(prefix)][0]
    for line in open(os.path.join(BASE, fmt, fn), encoding='utf-8'):
        if line.startswith('#'):
            continue
        parts = line.rstrip('\n').split('\t')
        cell = parts[0]
        if len(parts) >= 3 and parts[1].startswith('='):
            v = parts[2][3:]
        else:
            v = parts[1] if len(parts) > 1 else None
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = None if v in (None, 'None') else v
        d[cell] = v
    return d


def num(d, c):
    v = d.get(c)
    return v if isinstance(v, float) else None


def xl_round(x, n):
    """ROUND de Excel: half away from zero."""
    f = 10.0 ** n
    return math.copysign(math.floor(abs(x) * f + 0.5) / f, x)


results = []


def chk(fmt, cell, calc, cache, tol=1e-9):
    ok = (calc is None and cache is None) or (
        calc is not None and cache is not None and abs(calc - cache) <= tol * max(1, abs(cache)))
    results.append((fmt, cell, calc, cache, ok))


def homolog(fmt, d, fs_inverted=False, ha=False, subj_cell='I44'):
    """Homologacion de rentas filas 38..42. Devuelve lista de T (homologados)."""
    S = num(d, subj_cell)
    n = num(d, 'Z37')
    Ts = []
    for r in range(38, 43):
        C, F = num(d, f'C{r}'), num(d, f'F{r}')
        if C is None or F is None:
            continue
        I = C / F * (10000 if ha else 1)
        chk(fmt, f'I{r}', I, num(d, f'I{r}'))
        Z = ((S / F) if fs_inverted else (F / S)) ** (1 / n)
        chk(fmt, f'Z{r}', Z, num(d, f'Z{r}'))
        fr = 1.0
        for col in 'LMOPQ':
            fr *= num(d, f'{col}{r}')
        fr *= Z  # N = Z
        chk(fmt, f'R{r}', fr, num(d, f'R{r}'))
        T = fr * I
        chk(fmt, f'T{r}', T, num(d, f'T{r}'))
        Ts.append(T)
    chk(fmt, 'T44', statistics.mean(Ts), num(d, 'T44'))
    chk(fmt, 'AC37', max(Ts) / min(Ts), num(d, 'AC37'))
    return Ts


def tch(fmt, pr, pi):
    r, i = load(fmt, pr), load(fmt, pi)
    # --- MERCADO RENTAS ---
    for k in range(4):
        P, S = num(r, f'AK{21+k}'), num(r, f'AN{21+k}')
        chk(fmt, f'U{28+k}', S / P, num(r, f'U{28+k}'))
    homolog(fmt, r, subj_cell='H45')
    chk(fmt, 'T49', num(r, 'H45') * num(r, 'T46'), num(r, 'T49'))
    # --- ENF. INGRESOS ---
    Q15 = num(r, 'T46')  # valor homologado a utilizar (captura manual)
    T17 = num(i, 'N15') * Q15
    chk(fmt, 'T17', T17, num(i, 'T17'))
    ded = sum(num(i, c) or 0 for c in ['F20', 'F21', 'F22', 'N20', 'N21', 'N22', 'V20', 'V21', 'V22'])
    chk(fmt, 'K24', ded, num(i, 'K24'))
    cols = ['H', 'K', 'M', 'O', 'R', 'U']
    tasas = [num(i, f'{c}29') for c in cols]
    califs = []
    for c in cols:
        califs.append(sum(num(i, f'{c}{row}') or 0 for row in (31, 33, 35, 37, 40, 43, 45)))
    tasa_res = sum(n * t / 7 * 100 for n, t in zip(califs, tasas)) / 100
    chk(fmt, 'U50', tasa_res, num(i, 'U50'))
    I62 = T17 - T17 * ded
    chk(fmt, 'I62', I62, num(i, 'I62'))
    I63 = I62 * 12
    chk(fmt, 'I63', I63, num(i, 'I63'))
    I65 = I63 / num(i, 'J56')
    chk(fmt, 'I65', I65, num(i, 'I65'))
    return I65, tasa_res


def tu(fmt, pi, inverted):
    d = load(fmt, pi)
    homolog(fmt, d, fs_inverted=inverted)
    T53 = num(d, 'N53') * num(d, 'T48')
    chk(fmt, 'T54', T53, num(d, 'T54'))
    J56 = T53
    O60 = num(d, 'O58') / (num(d, 'O59') * 360)
    chk(fmt, 'O60', O60, num(d, 'O60'))
    J63 = (J56 - J56 * O60) + num(d, 'O61')
    chk(fmt, 'J63', J63, num(d, 'J63'))
    K70 = sum(num(d, c) for c in ['F66', 'F67', 'N66', 'N67', 'V66', 'V67', 'F68', 'N68', 'V68'])
    chk(fmt, 'K70', K70, num(d, 'K70'))
    J72 = J63 - J63 * K70
    chk(fmt, 'J72', J72, num(d, 'J72'))
    U72 = J72 * 12
    chk(fmt, 'U72', U72, num(d, 'U72'))
    I78 = 1 - J72 / J56
    I79 = num(d, 'T48')
    I80 = ((I79 * 12) - (I79 * 12 * I78 / 100)) / J56
    chk(fmt, 'I80', I80, num(d, 'I80'))
    K82 = U72 / I80
    if inverted:
        K82 = xl_round(K82, -3)
    chk(fmt, 'K82', K82, num(d, 'K82'))
    I90 = (num(d, 'I87') - num(d, 'I88')) + 1 / num(d, 'M89')
    chk(fmt, 'I90', I90, num(d, 'I90'))
    Q89 = num(d, 'M89') * 12
    K92 = J72 * (1 - (1 + I90 / 12) ** -Q89) / (I90 / 12)
    chk(fmt, 'K92', K92, num(d, 'K92'))
    return K92


def tr(fmt, pi):
    d = load(fmt, pi)
    Ts = homolog(fmt, d, ha=True)
    S = num(d, 'I44')
    chk(fmt, 'T53', S * num(d, 'T48') / 10000, num(d, 'T53'))
    neg = num(d, 'S58') or 0
    vac = num(d, 'H69')
    gas = sum(num(d, c) or 0 for c in ['S69', 'S70', 'S71', 'W69', 'W70'])
    chk(fmt, 'W71', gas, num(d, 'W71'))
    K83s, O83s = [], []
    for k, T in enumerate(Ts):
        area = num(d, f'F{38+k}')
        precio = num(d, f'H{61+k}') * (1 - neg)
        ibp = (T / 10000) * area * (1 - neg)
        chk(fmt, f'U{61+k}', ibp, num(d, f'U{61+k}'))
        ino = ibp * (1 - vac) * (1 - gas)
        chk(fmt, f'U{74+k}', ino, num(d, f'U{74+k}'))
        K83s.append(ino / area * 10000)
        O83s.append(ino / precio)
        chk(fmt, f'O{83+k}', ino / precio, num(d, f'O{83+k}'))
    K88, O88 = statistics.mean(K83s), statistics.mean(O83s)
    chk(fmt, 'K88', K88, num(d, 'K88'))
    chk(fmt, 'O88', O88, num(d, 'O88'))
    R91 = (K88 / 10000) * S / O88
    chk(fmt, 'R91', R91, num(d, 'R91'))
    chk(fmt, 'K93', xl_round(R91, -3), num(d, 'K93'))
    return R91


if __name__ == '__main__':
    v_ar, t_ar = tch('REAL_ARANDAS', '07_', '08_')
    v_tch, t_tch = tch('TCH', '08_', '09_')
    v_tu = tu('TU', '07_', False)
    v_tuo = tu('TU_OFICIAL', '07_', True)
    v_tr = tr('TR', '07_')
    bad = [r for r in results if not r[4]]
    for r in results:
        print(f"{'OK ' if r[4] else 'XX '} {r[0]:13s} {r[1]:6s} calc={r[2]!r:>24} cache={r[3]!r}")
    print(f"\n{len(results)} celdas comparadas, {len(bad)} diferencias")
    print('Conclusiones (ROUND):')
    print(' TCH/ARANDAS I65 ->', xl_round(v_tch, -4), '(Arandas: NO APLICA en conclusion)')
    print(' TU K92 ->', xl_round(v_tu, -4), '| TU_OFICIAL K92 ->', xl_round(v_tuo, -4))
    print(' TR K93 ->', xl_round(xl_round(v_tr, -3), -2))
