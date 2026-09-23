import openpyxl, glob, os, warnings
warnings.filterwarnings('ignore')
for p in sorted(glob.glob('/Users/brangarciaramos/Documents/Avaluos/*.xls*')):
    wb = openpyxl.load_workbook(p)
    print('=====', os.path.basename(p))
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.comment: print(f'  [{ws.title}] {c.coordinate} NOTE: {c.comment.text[:400]!r}')
        for rng in ws.conditional_formatting:
            for r in rng.rules:
                print(f'  [{ws.title}] CF {rng.sqref} {r.type} {r.operator} {r.formula}')
