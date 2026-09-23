"""Recalcula el Enfoque de Costos de REAL_ARANDAS a partir de sus entradas
según la especificación de 01-costos.md y compara contra los valores en caché."""
import ast, math
from decimal import Decimal, ROUND_HALF_UP
DUMP='dump/REAL_ARANDAS/06_VII_ENF_COSTOS.txt'

def load(path):
    d={}
    for line in open(path,encoding='utf-8'):
        if line.startswith('#'): continue
        p=line.rstrip('\n').split('\t')
        if len(p)==3:
            v=p[2][3:]
            try: v=ast.literal_eval(v)
            except Exception: pass
        else:
            v=p[1]
            try: v=float(v)
            except: pass
        d[p[0]]=v
    return d
c=load(DUMP)

def xround(x, n):
    """ROUND de Excel: mitad se aleja de cero (no banker's rounding)."""
    q=Decimal(1).scaleb(-n)
    return float(Decimal(repr(x)).quantize(q, rounding=ROUND_HALF_UP)) if n>=0 else \
        float((Decimal(repr(x))/Decimal(10)**(-n)).quantize(Decimal(1),rounding=ROUND_HALF_UP)*Decimal(10)**(-n))

def f_edad(edad, vu, exp=1.4):
    return 1-(edad/vu)**exp

res=[]
def chk(name, cell, calc):
    cache=c.get(cell)
    ok = isinstance(cache,(int,float)) and math.isclose(calc,cache,rel_tol=1e-12,abs_tol=1e-9)
    res.append((name,cell,calc,cache,ok))
    return calc

# ---------- A) Terreno ----------
lote_tipo = 169.78          # M38 del mercado (I38 marcado => superficie sujeto)
v_mercado = 9000            # 'VI. ENF. MERCADO VENTA'!T50 (capturado)
sup = 169.78                # 'lll. INF TERRENO'!H41
n = 3                       # Y17
T14 = chk('Valor comparativo redondeado','T14', xround(v_mercado,-1))
fsup = chk('Factor superficie (D18/D14)^(1/n)','Y18',(sup/lote_tipo)**(1/n))
Fneg,Fubi,Fser,Ffre,Ftop = 1,1,1,1,1
FRe = chk('FRe terreno','P18',Fneg*Fubi*fsup*Fser*Ffre*Ftop)
vu_neto = chk('Valor unitario neto','R18',FRe*T14)
vp = chk('Valor parcial terreno','U18',vu_neto*sup)
VT = chk('A) Valor del terreno ROUND(-2)','V20',xround(vp,-2))

# ---------- B) Construcciones ----------
sup_c, edad, vu, fcons, fotro, gt, ind, vrn = 467.27, 2, 70, 0.98, 1, 1, 1, 14361.99
fed = chk('Factor edad T-1','R26',f_edad(edad,vu))
fre = chk('FRe T-1','T26',fcons*fed*fotro)
chk('VRN parcial T-1','N30',vrn*sup_c)
vnr_u = chk('VNR unitario T-1','S30',fre*vrn)
vnr_p = chk('VNR parcial T-1','V30',vnr_u*sup_c*gt*ind)
VC = chk('B) Valor construcciones ROUND(-4)','V33',xround(vnr_p,-4))
chk('Valor unitario medio const.','N33',VC/sup_c)

# ---------- C) IE/EA/OC ----------
ie = [ # fila_ent, fila_val, P/C, cant, edad, vu, cons, otro, gt, ind, vrn_unit
 (39,50,'P',6,2,30,0.975,1,1,1,9000),
 (40,51,'P',1,2,30,0.975,1,1,1,35000),
 (41,52,'P',11.55,2,70,0.975,1,1,1,14361.99),
 (42,53,'P',3.54,2,70,0.975,1,1,1,14361.99),
 (43,54,'P',4,2,10,0.975,1,1,1,30648),
 (44,55,'P',1,2,70,0.975,1,1,1,90000),
 (45,56,'P',4,2,20,0.975,1,1,1,4000),
 (46,57,'P',4,2,20,0.975,1,1,1,3500),
]
tot=0; totP=0; totC=0
for fe,fv,pc,q,e,v,co,ot,g,i,u in ie:
    fr=chk(f'FRe IE {fe}',f'T{fe}',co*f_edad(e,v)*ot)
    chk(f'VRN parcial IE {fv}',f'O{fv}',q*u)
    s=chk(f'VNR unit IE {fv}',f'S{fv}',fr*u)
    p=chk(f'VNR parcial IE {fv}',f'V{fv}',s*q*i*g)
    tot+=p; totP+= p if pc.upper()=='P' else 0; totC+= p if pc.upper()=='C' else 0
chk('Suma privativa','V59',totP); chk('Suma común','V60',totC)
chk('Subtotal IE','V61',tot)
VIE=chk('C) IE ROUND(-3)','V63',xround(tot,-3))
chk('Valor físico ROUND(-4)','U65',xround(VT+VC+VIE,-4))

bad=0
for name,cell,calc,cache,ok in res:
    print(f"{'OK ' if ok else 'DIF'} {cell:5} {name:38} calc={calc:,.10f} cache={cache}")
    bad+= not ok
print(f'\n{len(res)-bad}/{len(res)} coincidencias')
# Sensibilidad: redondeos alternativos
print('Si terreno usara ROUND(-4) como la plantilla TCH:', xround(vp,-4), '-> valor físico', xround(xround(vp,-4)+VC+VIE,-4))
print('Valor físico sin redondear:', VT+VC+VIE, ' y sin redondeos intermedios:', vp+vnr_p+tot)
