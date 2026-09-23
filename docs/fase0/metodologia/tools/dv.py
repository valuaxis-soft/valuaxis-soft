import openpyxl, glob, os, sys
for p in sorted(glob.glob('/Users/brangarciaramos/Documents/Avaluos/*.xls*')):
    wb = openpyxl.load_workbook(p, keep_vba=False)
    print('=====', os.path.basename(p))
    print('  defined names:', [(n, wb.defined_names[n].attr_text) for n in wb.defined_names][:40])
    for ws in wb.worksheets:
        dvs = ws.data_validations.dataValidation
        cf = ws.conditional_formatting
        if dvs:
            for dv in dvs:
                print(f'  [{ws.title}] {dv.sqref} type={dv.type} f1={dv.formula1!r} f2={dv.formula2!r} op={dv.operator} prompt={dv.prompt!r} err={dv.error!r}')
        ncf = sum(1 for _ in cf)
        if ncf: print(f'  [{ws.title}] conditional formats: {ncf}')
