"""Transliteración 1:1 de la hoja CIFRAENLETRAS (idéntica en los 7 libros).
Reproduce también sus defectos. Uso: cifra(valor) -> texto como en celda I7."""
import re, math

def _fixed2(x):  # FIXED(x,2,FALSE): redondeo a 2 dec. (half away from zero) con comas
    from decimal import Decimal, ROUND_HALF_UP
    d = Decimal(repr(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    s = f"{abs(d):,.2f}"
    return ('-' if d < 0 else '') + s

def _trim(s):  # TRIM de Excel: quita espacios extremos y colapsa internos
    return re.sub(' +', ' ', s).strip(' ')

def cifra(F7):
    F8 = int(math.floor(F7))            # INT
    AA8 = _fixed2(F7)                    # texto
    s8 = str(F8)
    def R(n):                             # RIGHT(F8,n) como número
        return int(s8[-n:]) if n > 0 else 0
    def dig(n):                           # ((RIGHT(F8,n))-(RIGHT(F8,n-1)))/10^(n-1)
        return (R(n) - R(n-1)) / 10**(n-1)
    F9, H9, I9, K9, M9, N9, P9, R9, S9, U9, W9, X9 = [dig(n) for n in range(13, 1, -1)]
    Z9 = R(1) - 0                         # AA9 vacía
    AB9 = (int(AA8[-2:]) - int(AA8[-1:])) / 10
    AD9 = int(AA8[-1:]) - 0               # AE9 vacía
    row = dict(F=F9,H=H9,I=I9,K=K9,M=M9,N=N9,P=P9,R=R9,S=S9,U=U9,W=W9,X=X9,Z=Z9)
    order = list(row)
    def SUM(a, b):
        cols = ['F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
        return sum(row.get(c, 0) for c in cols[cols.index(a):cols.index(b)+1])
    sumc = AB9 + AD9
    def units(d, six, tres=("TRES  ", "TRES  "), dos=("DOS  ", "DOS  "), extra_one="", nine="NUEVE  ", sp=("OCHO   ","SIETE   ","CINCO  ","CUATRO  ")):
        pass
    hund = lambda d, dos="DOSCIENTOS  ": ("NOVECIENTOS  " if d>8 else "OCHOCIENTOS   " if d>7 else "SETECIENTOS    " if d>6 else "SEISCIENTOS    " if d>5 else "QUINIENTOS  " if d>4 else "CUATROCIENTOS   " if d>3 else "TRESCIENTOS  " if d>2 else dos if d>1 else "")
    tens = lambda d: ("NOVENTA  " if d>8 else "OCHENTA   " if d>7 else "SETENTA    " if d>6 else "SESENTA    " if d>5 else "CINCUENTA  " if d>4 else "CUARENTA   " if d>3 else "TREINTA  " if d>2 else "VEINTI" if d>1 else "")
    def teen(t, u):
        if t==2 and u==0: return "VEINTE "
        if t==1 and u>5: return "DIECI"
        if t==1 and u>4: return "QUINCE "
        if t==1 and u>3: return "CATORCE "
        if t==1 and u>2: return "TRECE "
        if t==1 and u>1: return "DOCE "
        if t==1 and u>0: return "ONCE "
        if t==1: return "DIEZ "
        return ""
    # fila 10
    F10 = ("NUEVE  " if F9>8 else "OCHO   " if F9>7 else "SIETE   " if F9>6 else "SEIS   " if F9>5 else "CINCO  " if F9>4 else "CUATRO  " if F9>3 else "TRES  " if F9>2 else "DOS  " if F9>1 else "")
    G10 = "UN  BILLÓN " if (F8>999999999999 and F9==1 and SUM('H','Z')>0) else ("UN  BILLÓN " if F9==1 else ("BILLONES  " if (F8>999999999999 and F9>1) else ""))
    H10 = hund(H9, "DOSCIENTOS")
    I10 = tens(I9); J10 = "Y  " if (I9>2 and K9>0) else ""
    I11 = teen(I9, K9)
    K10 = ("NUEVE  " if K9>8 else "OCHO   " if K9>7 else "SIETE   " if K9>6 else (("SÉIS   " if I11=="DIECI" else ("SÉIS   " if I10=="VEINTI" else "SEIS")) if K9>5 else "CINCO  " if K9>4 else "CUATRO  " if K9>3 else "TRES  " if K9>2 else "DOS  " if K9>1 else ""))
    L10 = "MIL " if (I9==1 and K9==1) else ("UN  MIL " if (F7>1999999999 and K9==1 and SUM('M','P')>0) else ("UN  MIL " if (K9==1 and SUM('H','J')>0) else (" MIL " if SUM('H','K')>=1 else "")))
    M10 = hund(M9); N10 = tens(N9); O10 = "Y  " if (N9>2 and P9>0) else ""
    N11 = teen(N9, P9)
    P10 = ("NUEVE  " if P9>8 else "OCHO   " if P9>7 else "SIETE   " if P9>6 else (("SÉIS   " if N11=="DIECI" else ("SÉIS   " if N10=="VEINTI" else "SEIS")) if P9>5 else "CINCO  " if P9>4 else "CUATRO  " if P9>3 else "TRES  " if P9>2 else "DOS  " if P9>1 else (("UN  " if N10=="" else "ÚN  ") if P9>0 else "")))
    Q10 = " MILLONES " if (N9==1 and P9==1 and SUM('F','O')>0) else ("MILLÓN " if (P9==1 and SUM('F','P')==1) else (" MILLONES  " if SUM('H','P')>0 else " "))
    R10 = hund(R9, "DOSCIENTOS "); S10 = tens(S9); T10 = "Y  " if (S9>2 and U9>0) else ""
    S11 = teen(S9, U9)
    U10 = ("NUEVE  " if U9>8 else "OCHO   " if U9>7 else "SIETE   " if U9>6 else (("SÉIS   " if S11=="DIECI" else ("SÉIS   " if S10=="VEINTI" else "SEIS")) if U9>5 else "CINCO  " if U9>4 else "CUATRO  " if U9>3 else (("TRES  " if S10=="" else "TRÉS  ") if U9>2 else (("DOS  " if S10=="" else "DÓS  ") if U9>1 else ""))))
    V10 = "MIL  " if (S9==1 and U9==1) else ("UN  MIL " if (F8>1999 and U9==1 and SUM('W','Z')>0) else ("UN  MIL " if (U9==1 and SUM('R','T')>0) else (" MIL " if SUM('R','U')>=1 else "")))
    W10 = hund(W9); X10 = tens(X9); Y10 = "Y  " if (X9>2 and Z9>0) else ""
    X11 = teen(X9, Z9)
    Z10 = ("NUEVE   " if Z9>8 else "OCHO   " if Z9>7 else "SIETE   " if Z9>6 else (("SÉIS   " if X11=="DIECI" else ("SÉIS   " if X10=="VEINTI" else "SEIS")) if Z9>5 else "CINCO   " if Z9>4 else "CUATRO   " if Z9>3 else (("TRES  " if X10=="" else "TRÉS  ") if Z9>2 else (("DOS  " if S10=="" else "DÓS  ") if Z9>1 else ""))))
    AA10 = "UN PESO" if (F8==1 and Z9==1) else (" DE PESOS " if (X9==1 and Z9==1) else ("UN PESOS" if (Z9==1 and SUM('F','Y')>0) else ("CERO PESOS  " if (sumc>0 and Z9==0 and SUM('F','Z')<1) else " PESOS")))
    AB10 = tens(AB9); AC10 = "Y  " if (AB9>2 and AD9>0) else ""
    AB11 = teen(AB9, AD9)
    AD10 = ("NUEVE   " if AD9>8 else "OCHO   " if AD9>7 else "SIETE   " if AD9>6 else (("SÉIS   " if AB11=="DIECI" else ("SÉIS   " if AB10=="VEINTI" else "SEIS")) if AD9>5 else "CINCO   " if AD9>4 else "CUATRO   " if AD9>3 else "TRES   " if AD9>2 else "DOS   " if AD9>1 else ""))
    # AA8 es TEXTO: en Excel texto<0 es FALSO y texto>0.01 es VERDADERO siempre
    AE10 = "UN  CENTAVO" if (sumc==1 and AD9==1) else ("UN  CENTAVOS" if (AD9==1 and AB9>1) else (" CENTAVOS " if sumc>0 else "  "))
    H11 = "CIENTO " if (H9==1 and SUM('I','K')>0) else ("CIEN" if H9==1 else " ")
    M11 = "CIENTO  " if (M9==1 and SUM('N','P')>0) else ("CIEN " if M9==1 else " ")
    R11 = "CIENTO " if (R9==1 and SUM('S','U')>0) else ("CIEN" if R9==1 else " ")
    W11 = "CIENTO  " if (W9==1 and SUM('X','Z')>0) else ("CIEN" if W9==1 else " ")
    F12 = (("CERO" if F7==0 else " ") + F10 + G10 +
        (H11 if H10=="" else H10) + ("" if I11=="VEINTE " else I10) + J10 + (K10 if I11=="" else I11) + (K10 if I11=="DIECI" else "") + L10 +
        (M11 if M10=="" else M10) + ("" if N11=="VEINTE " else N10) + O10 + (P10 if N11=="" else N11) + (P10 if N11=="DIECI" else "") + Q10 +
        (R11 if R10=="" else R10) + ("" if S11=="VEINTE " else S10) + T10 + (U10 if S11=="" else S11) + (U10 if S11=="DIECI" else "") + V10 +
        (W11 if W10=="" else W10) + ("" if X11=="VEINTE " else X10) + Y10 + (Z10 if X11=="" else X11) + (Z10 if X11=="DIECI" else "") +
        ("DE  " if (SUM('M','P')>0 and SUM('R','Z')<1) else "") + AA10 +
        ("  CON  " if sumc>0 else "") + ("" if AB11=="VEINTE " else AB10) + AC10 + (AD10 if AB11=="" else AB11) + (AD10 if AB11=="DIECI" else "") +
        AE10 + "00/100 M. N.")
    F13 = "(" + F12 + ")"
    return _trim(F13)

if __name__ == "__main__":
    import sys
    for a in sys.argv[1:]:
        print(a, "->", cifra(float(a)))
