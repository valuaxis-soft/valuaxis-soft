import re, glob, os, collections, sys
ref = re.compile(r"(?:'([^']+)'|([A-Za-z0-9_.]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?")
HDR = re.compile(r'^[A-Z]+[2-8]$')
for fmt in sys.argv[1:]:
    print('########', fmt)
    edges = collections.OrderedDict()
    for f in sorted(glob.glob(f'dump/{fmt}/*.txt')):
        lines = open(f, encoding='utf-8').read().splitlines()
        sheet = lines[0].split(' :: ')[1].rsplit(' (estado', 1)[0]
        for ln in lines[1:]:
            p = ln.split('\t')
            if len(p) < 3 or not p[1].startswith('='): continue
            cell, fm, val = p[0], p[1], p[2][3:]
            for m in ref.finditer(fm):
                src = m.group(1) or m.group(2)
                if src == sheet: continue
                srccell = m.group(3)+m.group(4) + (':'+m.group(5)+m.group(6) if m.group(5) else '')
                # skip page headers (rows 2-8 membrete) 
                if HDR.match(cell) and src in ('l. CARATULA','ll. DATOS'): continue
                edges.setdefault((src, sheet), []).append(f'{src}!{srccell} -> {cell} ({val[:40]})')
    for (s, t), lst in edges.items():
        print(f'== {s}  ==>  {t}  [{len(lst)}]')
        for e in lst[:60]: print('   ', e)
