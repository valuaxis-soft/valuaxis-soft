"""Verificación rápida de la especificación contra los valores de caché de las plantillas
(TU, TU_OFICIAL, TCH, TR, TRC, MEH). Solo recalcula los totales clave."""
import math
from decimal import Decimal, ROUND_HALF_UP
def xround(x,n):
    q=Decimal(10)**(-n)
    return float((Decimal(repr(x))/q).quantize(Decimal(1),rounding=ROUND_HALF_UP)*q)
fed=lambda e,v:1-(e/v)**1.4
def ok(label,calc,cache): print(('OK ' if math.isclose(calc,cache,rel_tol=1e-12) else 'DIF'),label,calc,cache)

# IE comunes a TU/TCH/TR/TRC (malla + bomba)
ie = 550*0.975*fed(15,30)*140*1*0.5 + 20000*0.975*fed(7,20)*1*1*1
# TU
U18=(0.95*0.9*(160/160)**(1/3)*1.05)*7000*160
ok('TU U48',xround(xround(U18,-4)+ie+0,-4),1050000)
# TU_OFICIAL: factor superficie (D14/D18) -> igual porque D14=D18
ok('TU_OF Y18',(160/160)**(1/3),1)
# TCH
fs=(160/140)**(1/3); ok('TCH Y18 (sujeto/lote tipo)',fs,1.0455159171494204)
U18=0.95*0.9*fs*1.05*5000*160; V41=xround(12550*0.98*fed(7,70)*250,-4)
ok('TCH U69',xround(xround(U18,-4)+V41+xround(ie,-3)+0,-4),3740000)
print('   TCH con factor orientado como TU_OFICIAL (140/160)^(1/3):',
      xround(xround(0.95*0.9*(140/160)**(1/3)*1.05*5000*160,-4)+V41+xround(ie,-3),-4))
# TR
ok('TR T64',6900000*1*3857.5/10000+ie+85*0.95*fed(3,6)*0.9*1500,2767708.270675873)
# TRC
ok('TRC U84',6800000*3857.5/10000+13732.09*0.98*fed(7,70)*250+ie+85*0.95*fed(3,6)*0.6*1500+1320*1*fed(7,40)*0.95*500,6509348.219682156)
# MEH
W34=65000*17.65*1*(1+0.09); B38=fed(14,30)*0.975
W42=B38*0.975*0.95*1*1*W34
ok('MEH W42 (conservación aplicada 2 veces)',W42,740788.9020491218)
adit=117000*1.09*((20-10)/20)*0.95 + 185000*1*((20-5)/20)*0.95
ok('MEH V61',xround(W42+adit,-3),933000)
print('   MEH V61 si la conservación se aplicara una sola vez:',xround(W42/0.975+adit,-3))
