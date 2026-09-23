import re, glob, sys
sys.path.insert(0, 'metodologia/tools')
from cifraenletras import cifra
ok = bad = 0
for f in sorted(glob.glob('dump/*/*CIFRA*.txt')):
    cells = {}; forms = {}
    for line in open(f, encoding='utf-8'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 3: cells[p[0]] = p[2][3:]; forms[p[0]] = p[1]
    for k, fm in forms.items():
        m = re.match(r'^I(\d+)$', k)
        if m and fm.startswith('=TRIM'):
            src = 'F' + m.group(1)
            num = float(cells[src]); exp = eval(cells[k]); got = cifra(num)
            ok += got == exp; bad += got != exp
            print('OK ' if got == exp else 'DIF', f.split('/')[1], src, num, '|', exp, '' if got == exp else '| got: ' + got)
print('ok', ok, 'bad', bad)
