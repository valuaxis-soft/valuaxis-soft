import openpyxl, glob, os, warnings, json
warnings.filterwarnings('ignore')
out = {}
for p in sorted(glob.glob('/Users/brangarciaramos/Documents/Avaluos/*.xls*')):
    wb = openpyxl.load_workbook(p)
    k = os.path.basename(p)
    out[k] = {'notes': [], 'merged': {}}
    for ws in wb.worksheets:
        out[k]['merged'][ws.title] = [str(r) for r in ws.merged_cells.ranges]
        for row in ws.iter_rows():
            for c in row:
                if c.comment: out[k]['notes'].append([ws.title, c.coordinate, c.comment.text])
json.dump(out, open('metodologia/tools/notes_merged.json', 'w'), ensure_ascii=False, indent=1)
