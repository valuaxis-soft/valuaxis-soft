"""Validación: recalcula el enfoque comparativo de mercado (terrenos) de REAL_ARANDAS
desde sus entradas y compara contra el valor en caché de Excel.
También recalcula TU vs TU_OFICIAL (factor de superficie invertido) y la regresión MEH.
Uso: venv/bin/python metodologia/02-mercado_validacion.py
"""
import math, re, statistics
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

DUMP = Path(__file__).resolve().parent.parent / "dump"


def load(path):
    cells = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        ref, raw = parts[0], parts[1]
        cached = None
        if len(parts) >= 3 and parts[2].startswith("=> "):
            cached = parts[2][3:]
        cells[ref] = (raw, cached)
    return cells


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def factor_input(cells, ref):
    """Los factores se capturan como número o como '=a/b' literal."""
    raw = cells.get(ref, (None, None))[0]
    if raw is None:
        return None
    if raw.startswith("="):
        m = re.fullmatch(r"=([0-9.]+)/([0-9.]+)", raw)
        assert m, f"factor no literal en {ref}: {raw}"
        return float(m.group(1)) / float(m.group(2))
    return float(raw)


def cached(cells, ref):
    return num(cells[ref][1]) if ref in cells else None


def excel_round(x, nd):
    q = Decimal(1).scaleb(-nd)
    return float(Decimal(repr(x)).quantize(q, rounding=ROUND_HALF_UP))


def excel_odd(x):
    s = 1 if x >= 0 else -1
    n = math.ceil(abs(x))
    if n % 2 == 0:
        n += 1
    return s * n


def homologar_terreno(cells, rows_datos, rows_hom, sup_ref, pot_ref, invertido=False,
                      col_sup="AJ", col_precio="AM", lote_tipo_ref="M37", marca_tipo="I37"):
    base_sujeto = num(cells[sup_ref][1])
    n = float(cells[pot_ref][0])
    usa_lote_tipo = cells.get(marca_tipo, ("", None))[0] not in ("", None)
    base = float(cells[lote_tipo_ref][0]) if usa_lote_tipo else base_sujeto
    out = []
    for rd, rh in zip(rows_datos, rows_hom):
        precio = num(cells.get(f"{col_precio}{rd}", (None,))[0])
        sup = num(cells.get(f"{col_sup}{rd}", (None,))[0])
        if not precio or not sup:
            continue
        vu = precio / sup
        fsup = (base / sup) ** (1 / n) if invertido else (sup / base) ** (1 / n)
        fac = {k: factor_input(cells, f"{k}{rh}") for k in "LMOPQ"}
        fre = fac["L"] * fac["M"] * fsup * fac["O"] * fac["P"] * fac["Q"]
        out.append(dict(fila=rh, precio=precio, sup=sup, vu=vu, fsup=fsup, fre=fre, vuh=fre * vu, **fac))
    return out, base_sujeto, n


def comparar(label, calc, ref_cache, tol=1e-9):
    diff = abs(calc - ref_cache) if (calc is not None and ref_cache is not None) else None
    ok = diff is not None and diff <= tol * max(1, abs(ref_cache))
    print(f"  {label:<34} calc={calc!r:<24} cache={ref_cache!r:<24} {'OK' if ok else 'DIFERENTE'}")
    return ok


def real_arandas():
    print("=== REAL_ARANDAS  hoja 'VI. ENF. MERCADO VENTA' (terrenos) ===")
    c = load(DUMP / "REAL_ARANDAS/05_VI_ENF_MERCADO_VENTA.txt")
    comps, sup_suj, n = homologar_terreno(c, range(22, 27), range(42, 47), "F48", "Z41")
    todo_ok = True
    for k in comps:
        r = k["fila"]
        print(f" Comparable fila {r}: P={k['precio']:.2f} S={k['sup']} Vu={k['vu']:.6f} "
              f"Neg={k['L']} Ubic={k['M']:.6f} Fsup={k['fsup']:.10f} Zona={k['O']:.6f} "
              f"Frent={k['P']:.6f} Uso={k['Q']:.6f} FRe={k['fre']:.10f} VUH={k['vuh']:.6f}")
        todo_ok &= comparar(f"I{r} valor unitario", k["vu"], cached(c, f"I{r}"))
        todo_ok &= comparar(f"Z{r} factor superficie", k["fsup"], cached(c, f"Z{r}"))
        todo_ok &= comparar(f"R{r} factor resultante", k["fre"], cached(c, f"R{r}"))
        todo_ok &= comparar(f"T{r} VU homologado", k["vuh"], cached(c, f"T{r}"))
    vuh = [k["vuh"] for k in comps]
    prom = sum(vuh) / len(vuh)
    todo_ok &= comparar("T48 promedio homologado", prom, cached(c, "T48"))
    todo_ok &= comparar("AC41 dispersión max/min", max(vuh) / min(vuh), cached(c, "AC41"))
    adoptado = float(c["T50"][0])
    t53 = sup_suj * adoptado
    todo_ok &= comparar("T53 subtotal", t53, cached(c, "T53"))
    t55 = excel_round(t53 + float(c["T54"][0]), -2)
    todo_ok &= comparar("T55 valor comparativo (ROUND -2)", t55, cached(c, "T55"))
    # potencia sugerida
    ns = []
    for a, b in zip(comps, comps[1:]):
        ls = math.log10(a["sup"] / b["sup"])
        if ls == 0:
            ns.append(None)
            continue
        inv_n = math.log10(a["vu"] / b["vu"]) / ls
        ns.append(abs(excel_round(1 / inv_n, 0)))
    print(f"  n por pares consecutivos (AN42:AN45) = {ns}  -> moda = {statistics.mode([x for x in ns if x is not None])}")
    # estadística adicional que Excel NO calcula
    sd = statistics.stdev(vuh)
    print(f"  [extra] min={min(vuh):.2f} max={max(vuh):.2f} rango={max(vuh)-min(vuh):.2f} "
          f"desv.est.muestral={sd:.2f} CV={sd/prom:.4%} mediana={statistics.median(vuh):.2f}")
    print(f"  [extra] adoptado {adoptado} vs promedio {prom:.2f}: desviación {adoptado/prom-1:+.2%}")
    print(f"  [extra] costos T14 = ROUND(T50,-1) = {excel_round(adoptado, -1)}")
    print("  RESULTADO:", "TODO COINCIDE" if todo_ok else "HAY DIFERENCIAS")
    return todo_ok


def tu_vs_oficial():
    print("\n=== TU vs TU_OFICIAL: efecto de invertir el factor de superficie ===")
    for fmt, inv in (("TU", False), ("TU_OFICIAL", True)):
        c = load(DUMP / f"{fmt}/06_VI_ENF_MERCADO_VENTA.txt")
        comps, sup_suj, n = homologar_terreno(c, range(22, 27), range(42, 47), "F48", "Z41",
                                              invertido=inv, col_sup="AI", col_precio="AL")
        vuh = [k["vuh"] for k in comps]
        ok = all(abs(k["vuh"] - cached(c, f"T{k['fila']}")) < 1e-6 for k in comps)
        prom = sum(vuh) / len(vuh)
        print(f"  {fmt:<11} Fsup={[round(k['fsup'], 4) for k in comps]} VUH={[round(v, 2) for v in vuh]} "
              f"prom={prom:.2f} (cache {cached(c, 'T48'):.2f}) adoptado T50={c['T50'][0]} recalculo_ok={ok}")


def meh_regresion():
    print("\n=== MEH 'METODOS ALTERNATIVOS' regresión: ¿filas duplicadas? ===")
    c = load(DUMP / "MEH/06_METODOS_ALTERNATIVOS.txt")
    cols = ["AR", "AS", "AT", "AU", "AV", "AW", "AX"]
    rows = []
    for r in range(85, 105):
        vals = [num(c.get(f"{col}{r}", (None,))[0]) for col in cols]
        if None not in vals:
            rows.append(vals)
    print(f"  filas de datos: {len(rows)}; únicas exactas: {len(set(map(tuple, rows)))}")
    sin_odometro = [tuple(r[:3] + r[4:]) for r in rows]  # ignora ODOMETRO (AU)
    print(f"  únicas ignorando ODOMETRO: {len(set(sin_odometro))}  "
          f"(filas 99-104 repiten los comparables 9-14 salvo el odómetro)")
    # OLS por ecuaciones normales (sin numpy)
    X = [[1.0] + r[1:] for r in rows]
    y = [r[0] for r in rows]
    k = len(X[0])
    A = [[sum(X[i][a] * X[i][b] for i in range(len(X))) for b in range(k)] for a in range(k)]
    v = [sum(X[i][a] * y[i] for i in range(len(X))) for a in range(k)]
    M = [row[:] + [v[i]] for i, row in enumerate(A)]
    for i in range(k):
        p = max(range(i, k), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(k):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [a - f * b for a, b in zip(M[r], M[i])]
    beta = [M[i][k] / M[i][i] for i in range(k)]
    pegados = [num(c[f"AR{r}"][0]) for r in range(109, 116)]
    print("  coef. recalculados con las 20 filas:", [round(b, 4) for b in beta])
    print("  coef. pegados en AR109:AR115      :", [round(b, 4) for b in pegados])


if __name__ == "__main__":
    real_arandas()
    tu_vs_oficial()
    meh_regresion()
