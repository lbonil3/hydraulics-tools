#!/usr/bin/env python3
"""Builds swp3-builder/summary-layout.js: field geometry for the two official TxDOT SWP3 Summary Sheet PDFs.
The PDFs are flat (no AcroForm) and all text is outlined vector art, so positions come from
 (1) vector geometry read with PyMuPDF (table rules, underline rules, checkbox glyph rectangles) and
 (2) OCR of a 3x render (RapidOCR), used only to find label rows.
Usage: build_layout.py <dir with swp3a23.pdf swp3b23.pdf ocr.json geo.json ul.json> <out.js>"""
import json, sys, re, pymupdf
src, out = sys.argv[1], sys.argv[2]
OCR = json.load(open(src + '/ocr.json')); GEO = json.load(open(src + '/geo.json')); UL = json.load(open(src + '/ul.json'))

def die(m): raise SystemExit('LAYOUT ASSERT: ' + m)

class P:
    def __init__(s, name, pn, F, pre):
        s.doc = pymupdf.open(f'{src}/{name}.pdf'); pg = s.doc[pn - 1]; s.pn = pn; s.F = F; s.pre = pre
        k = f'{name}-{pn}'; s.k = k; s.ocr = OCR[k]; s.ul = UL[k]; s.H = GEO[k]['H']; s.V = GEO[k]['V']
        s.bx = []
        for x in pg.get_drawings():
            b = x['rect']
            if len(x['items']) == 8 and 4.4 < b.width < 5.0 and 8.0 < b.height < 8.5 and b.y0 > 5: s.bx.append([b.x0, b.y0, b.width, b.height])
            elif len(x['items']) == 10 and 7.0 < b.width < 7.6 and 7.0 < b.height < 7.6: s.bx.append([b.x0, b.y0, b.width, b.height])
    def snap(s, cx, cy, tol=3.5):
        best = None
        for b in s.bx:
            d = abs(b[0] + b[2] / 2 - cx) + abs(b[1] + b[3] / 2 - cy)
            if d < tol and (best is None or d < best[0]): best = (d, b)
        return best[1] if best else None
    def check(s, fid, x0, y0, w=4.7, h=8.2):
        b = s.snap(x0 + w / 2, y0 + h / 2)
        sn = bool(b)
        if b: x0, y0, w, h = b
        s.F[fid] = dict(t='c', p=s.pn, x=round(x0, 1), y=round(y0, 1), w=round(w, 1), h=round(h, 1), snap=sn, pre=fid in s.pre)
    def lines(s, x0, x1, y0, y1): return sorted([o for o in s.ocr if x0 <= o[0] <= x1 and y0 <= o[1] <= y1], key=lambda o: o[1])
    def items(s, ids, x0, x1, y0, y1, indent=5.0, label=''):
        L = s.lines(x0, x1, y0, y1)
        if not L: die(f'{s.k} {label}: no lines')
        base = min(o[0] for o in L); L = [o for o in L if o[0] < base + indent]
        if len(L) != len(ids): die(f'{s.k} {label}: found {len(L)} item lines, expected {len(ids)}: ' + ' | '.join(f'{o[0]},{o[1]}:{o[4]}' for o in L))
        for o, i in zip(L, ids): s.check(i, o[0] + 1.0, o[1] + 2.5)
    def tp(s, pre, ids, xT, xP, x0, x1, y0, y1, label=''):
        """two checkboxes (T and P columns) before each label line; 'o*' ids are the Other: lines (text on the underline)"""
        L = [o for o in s.lines(x0, x1, y0, y1) if not re.search(r'T\s*/\s*p', o[4], re.I)]
        base = min(o[0] for o in L); L = [o for o in L if o[0] < base + 3.0]
        col = sorted([b for b in s.bx if abs(b[0] - xT) < 1.6 and y0 - 8 <= b[1] <= y1 + 6], key=lambda b: b[1])
        colP = sorted([b for b in s.bx if abs(b[0] - xP) < 1.6 and y0 - 8 <= b[1] <= y1 + 6], key=lambda b: b[1])
        if not (len(L) == len(ids) == len(col) == len(colP)): die(f'{s.k} {label}: lines {len(L)} ids {len(ids)} T {len(col)} P {len(colP)}: ' + ' | '.join(f'{o[0]},{o[1]}:{o[4]}' for o in L))
        for i, o, bt, bp in zip(ids, L, col, colP):
            for suf, b in (('.T', bt), ('.P', bp)):
                s.F[pre + i + suf] = dict(t='c', p=s.pn, x=round(b[0], 1), y=round(b[1], 1), w=round(b[2], 1), h=round(b[3], 1), snap=True, pre=False)
            if i.startswith('o'):
                us = [u for u in s.ul if o[3] - 4.5 <= u[0] <= o[3] + 4.0 and u[1] >= o[2] - 8 and u[1] < x1 + 400]
                if not us: die(f'{s.k} {pre}{i}: no underline')
                s.area(pre + i, [sorted(us, key=lambda u: u[1])[0]])
    def text(s, fid, u, size=8): s.F[fid] = dict(t='t', p=s.pn, x0=round(u[1], 1), x1=round(u[2], 1), y=round(u[0], 1), size=size)
    def uat(s, y, x0=0, x1=9999):
        c = [u for u in s.ul if abs(u[0] - y) < 1.5 and u[2] > x0 and u[1] < x1]
        if not c: die(f'{s.k}: no underline at y={y} x={x0}-{x1}')
        return sorted(c, key=lambda u: u[1])[0]
    def area(s, fid, us, size=8): s.F[fid] = dict(t='a', p=s.pn, lines=[dict(x0=round(u[1], 1), x1=round(u[2], 1), y=round(u[0], 1)) for u in us], size=size)
    def others(s, fp, n, x0, x1, y0, y1, tp=None):
        L = [o for o in s.lines(x0, x1, y0, y1) if re.match(r'^\W*Other:?\W*$', o[4].strip())]
        if len(L) != n: die(f'{s.k} others {fp}: {len(L)} != {n}')
        for i, o in enumerate(L, 1):
            fid = f'{fp}.o{i}'
            if tp is None: s.check(fid + '.c', o[0] + 1.0, o[1] + 2.5)
            us = [u for u in s.ul if o[3] - 4.0 <= u[0] <= o[3] + 4.0 and x0 - 2 <= u[1] <= x1 and u[2] > o[2] - 8]
            if not us: die(f'{s.k} {fid}: no underline')
            cont = [u for u in s.ul if o[3] + 4.0 < u[0] <= o[3] + 18 and abs(u[1] - o[0]) < 8 and u[1] >= x0 - 2]
            s.area(fid, [sorted(us, key=lambda u: u[1])[-1]] + cont[:1])
    def table(s, fid, x0, x1, y0, y1, hdr, size=7.5):
        hl = [h for h in s.H if h[0] <= x0 + 8 and h[1] >= x1 - 8 and y0 - 1 <= h[2] <= y1 + 1 and h[1] - h[0] < 330]
        hs = sorted(set(round(h[2], 1) for h in hl))
        if not hl: die(f'{s.k} table {fid}: no horizontal rules')
        hx0 = min(h[0] for h in hl); hx1 = max(h[1] for h in hl)
        vs = sorted(set(round(v[0], 1) for v in s.V if hx0 - 0.8 <= v[0] <= hx1 + 0.8 and v[1] <= y1 and v[2] >= y0 and v[2] - v[1] < 330))
        rows = hs[hdr:]
        if len(rows) < 2 or len(vs) < 2: die(f'{s.k} table {fid}: hs={hs} vs={vs}')
        s.F[fid] = dict(t='tbl', p=s.pn, top=hs[0], cols=[[vs[i], vs[i + 1]] for i in range(len(vs) - 1)], rows=[[rows[i], rows[i + 1]] for i in range(len(rows) - 1)], size=size)
    def titleblock(s):
        pn = s.pn; F = s.F
        for k, (x0, x1, y0, y1, sz) in {'proj': (1038.5, 1177.7, 715.5, 727.3, 7.5), 'fed': (1011.1, 1038.5, 715.5, 727.3, 6.5), 'sheet': (1177.7, 1203.4, 715.5, 727.3, 7),
                                        'dist': (1051.2, 1083.3, 739.5, 751.1, 7), 'county': (1083.3, 1203.4, 739.5, 751.1, 7.5), 'cont': (1011.1, 1051.2, 761.9, 773.8, 7),
                                        'sect': (1051.2, 1083.3, 761.9, 773.8, 7), 'job': (1083.3, 1135.7, 761.9, 773.8, 7), 'hwy': (1135.7, 1203.4, 761.9, 773.8, 7.5)}.items():
            F[f't.{k}.{pn}'] = dict(t='cell', p=pn, x0=x0, x1=x1, y0=y0, y1=y1, size=sz)

ACT = ['mob', 'sed', 'clear', 'pave', 'grade', 'subgrade', 'culrem', 'mbgf', 'paveinst', 'culinst', 'mow', 'flex', 'slopes', 'windrow', 'reveg', 'stab']
EC = ['pev', 'vbz', 'srb', 'geo', 'mulch', 'sst', 'tseed', 'pplant', 'ecl', 'rfd', 'vtrack', 'swale', 'riprap', 'dike', 'tpsd', 'embank', 'flume']
SC = ['ecl', 'dewater', 'inlet', 'rfd', 'sandbag', 'fence', 'exit', 'turb', 'vbz', 'vfs']
VEH = ['mud', 'haul', 'tarp', 'exit', 'sweep']
PP = ['chem', 'concrete', 'debris', 'dust', 'sanitary']
NSD = ['hydrant', 'irrig', 'pavewash', 'potable', 'springs', 'gw', 'vehwash', 'other']
POL_B = ['sed', 'fuel', 'solv', 'track', 'debris', 'water', 'sanit', 'trash', 'stock']
RT_B = ['plans', 'noi', 'csn', 'ms4', 'insp', 'records', 'not', 'keep3']
RC_B = ['ops', 'noi', 'csn', 'ms4', 'sched', 'bmps', 'not', 'keep3']
RT_A = ['plans', 'insp', 'records']
RC_A = ['ops', 'sched', 'bmps']

def anc(p, rx, xmin=0, xmax=9999, ymin=0, ymax=9999):
    c = [o for o in p.ocr if re.search(rx, o[4], re.I) and xmin <= o[0] <= xmax and ymin <= o[1] <= ymax]
    if not c: die(f'{p.k}: anchor {rx} not found')
    return sorted(c, key=lambda o: o[1])[0]

def items2(p, ids, x0, x1, y0, y1, rx=None, label='', indent=5.0, keep_other=False):
    L = [o for o in p.lines(x0, x1, y0, y1) if keep_other or not re.match(r'^\W*Other', o[4].strip(), re.I)]
    if rx: L = [o for o in L if re.search(rx, o[4], re.I)]
    if not L: die(f'{p.k} {label}: none')
    base = min(o[0] for o in L); L = [o for o in L if o[0] < base + indent]
    if len(L) == len(ids) - 1:   # OCR sometimes drops the first line of a list: recover its box from the drawn glyph
        c = sorted([b for b in p.bx if abs(b[0] - (base + 1.0)) < 2.5 and y0 - 6 <= b[1] <= L[0][1] - 6], key=lambda b: b[1])
        if c:
            L = [[base, c[0][1] - 2.5, 0, 0, '(label not read by OCR)']] + L
    if len(L) != len(ids): die(f'{p.k} {label}: found {len(L)} expected {len(ids)}: ' + ' | '.join(f'{o[0]},{o[1]}:{o[4]}' for o in L))
    for o, i in zip(L, ids): p.check(i, o[0] + 1.0, o[1] + 2.5)

def first_other(p, x0, x1, ymin):
    c = [o for o in p.lines(x0, x1, ymin, 9999) if re.match(r'^\W*Other', o[4].strip())]
    if not c: die(f'{p.k}: no Other after {ymin}')
    return min(o[1] for o in c)

def sheet1(p, var):
    p.titleblock()
    u = sorted([x for x in p.ul if x[1] < 300 and 270 < x[0] < 520], key=lambda a: (round(a[0]), a[1]))
    if len(u) != 12: die(f'{p.k} left col underlines {len(u)} {u}')
    names = ['csj', 'limFrom', 'limTo', 'bLat', 'bLon', 'eLat', 'eLon', 'totalArea', 'distArea']
    for n, x in zip(names, u[:9]): p.text(n, x, 7.5 if n[1:] in ('Lat', 'Lon') else 8)
    p.area('nature', u[9:12], 7.5)
    t17 = anc(p, r'^1\.7', 40, 100); t18 = anc(p, r'^1\.8', 320, 345); t19 = anc(p, r'^1\.9', 320, 345)
    t110 = anc(p, r'^1\.1[0O]', 600, 640); t111 = anc(p, r'^1\.11', 600, 640)
    p.table('soils', 48, 327, t17[3], 775, 1)
    items2(p, ['psl.pre', 'psl.con', 'psl.none'], t18[0] - 3, t18[0] + 20, t18[1] + 30, t18[1] + 120, rx=r'determined|No PS', label='psl')
    tbl_x1 = 612
    p.table('psl', t18[0] - 3, tbl_x1, t18[1] + 90, t18[1] + 300, 1)
    items2(p, ['act.' + k for k in ACT], t19[0] - 3, t19[0] + 14, t19[1] + 45, 690, label='act', rx=r'.')
    p.others('act', 3, t19[0] - 3, 612, t19[1] + 250, 770)
    ob = [o for o in p.lines(t110[0] - 3, t110[0] + 12, t110[1] + 5, 330) if re.match(r'^\W*Other', o[4].strip())]
    firstO = min(o[1] for o in ob)
    items2(p, ['pol.' + k for k in (POL_B if var == 'B' else POL_B + ['concwash'])], t110[0] - 3, t110[0] + 12, t110[1] + 5, firstO - 2, label='pol', indent=5)
    p.others('pol', 3, t110[0] - 3, 910, t110[1] + 5, t111[1] - 3)
    p.table('recv', t111[0] - 3, 906, t111[1] + 10, 640, 1)
    if var == 'B':
        t112 = anc(p, r'^1\.12', 600, 640); t113 = anc(p, r'^1\.13', 900); t114 = anc(p, r'^1\.14', 900)
        items2(p, ['rt.' + k for k in RT_B], t112[0] - 2, t112[0] + 12, t112[1] + 5, 780, label='rt')
        p.others('rt', 3, t112[0] - 2, 910, t112[1] + 5, 780)
        items2(p, ['rc.' + k for k in RC_B], t113[0] - 2, t113[0] + 12, t113[1] + 5, t114[1] - 3, label='rc')
        p.others('rc', 3, t113[0] - 2, 1210, t113[1] + 5, t114[1] - 3)
        p.table('ms4', 910, 1200, t114[1] + 20, 460, 1)
        items2(p, ['seal.nolay', 'seal.calc', 'seal.nofeas'], 915, 925, 500, 600, rx=r'No signed|Calculations|third box', label='seal')
    else:
        t112 = anc(p, r'^1\.12', 900); t113 = anc(p, r'^1\.13', 900)
        items2(p, ['rt.' + k for k in RT_A], t112[0] - 2, t112[0] + 12, t112[1] + 5, t113[1] - 3, label='rt')
        p.others('rt', 2, t112[0] - 2, 1210, t112[1] + 5, t113[1] - 3)
        items2(p, ['rc.' + k for k in RC_A], t113[0] - 2, t113[0] + 12, t113[1] + 5, 600, label='rc')
        p.others('rc', 2, t113[0] - 2, 1210, t113[1] + 5, 600)

def sheet2(p, var):
    p.titleblock()
    t21 = anc(p, r'^2\.1 ERO', 40, 100); t22 = anc(p, r'^2\.2 SED', 40, 100)
    refer = [o for o in p.ocr if o[0] < 100 and o[1] > 700 and re.search(r'^Refer', o[4])]
    yend = refer[0][1] if refer else 790
    O4 = ['o1', 'o2', 'o3', 'o4']
    p.tp('ec.', EC + O4, 51.0, 62.6, 70, 80, 222, t22[1] - 3, label='2.1')
    p.tp('sc.', SC + O4, 51.0, 62.6, 70, 80, t22[3] + 4, yend - 2, label='2.2')
    t24 = anc(p, r'^2\.4 OFF', 300, 700); t25 = anc(p, r'^2\.5 POL', 600, 700); t26 = anc(p, r'^2\.6 VEG', 600, 700)
    t27 = anc(p, r'^2\.7 ALL', 900, 1000); t28 = anc(p, r'^2\.8 DEW', 900, 1000)
    t23 = anc(p, r'^2\.3 PERM', 300, 400)
    nO = 4 if var == 'B' else 4
    items2(p, ['veh.' + k for k in VEH], t24[0] - 3, t24[0] + 12, t24[1] + 5, first_other(p, t24[0] - 3, t24[0] + 12, t24[1] + 5) - 2, label='veh')
    p.others('veh', 4, t24[0] - 3, 900, t24[1] + 5, 600)  if var == 'A' else p.others('veh', 4, t24[0] - 3, 900, t24[1] + 5, t25[1] - 3)
    items2(p, ['pp.' + k for k in PP], t25[0] - 3, t25[0] + 12, t25[1] + 5, first_other(p, t25[0] - 3, t25[0] + 12, t25[1] + 5) - 2, label='pp')
    p.others('pp', 4, t25[0] - 3, 900, t25[1] + 5, t26[1] - 3 if var == 'B' else 340)
    items2(p, ['nsd.' + k for k in NSD], t27[0] - 3, t27[0] + 12, t27[1] + 5, t28[1] - 3, label='nsd', keep_other=True)
    p.table('perm', t23[0] - 3, 612, t23[1] + 10, 700 if var == 'B' else 330, 1)
    p.table('buf', t26[0] - 3, 906, t26[1] + 15, 740 if var == 'B' else 650, 1)
    if var == 'B':
        tr = anc(p, r'Sediment Trap', 320, 340); tcalc = anc(p, r'Calculated volume', 335, 350, tr[1])
        t36 = anc(p, r'3,600', 335, 350, tr[1])
        ba = anc(p, r'Sedimentation Basin', 320, 345)
        def rowbox(o, n):
            cy = (o[1] + o[3]) / 2
            c = sorted([b for b in p.bx if abs(b[1] + b[3] / 2 - cy) < 5 and b[0] < 352 and b[0] > 328], key=lambda b: b[0])
            if len(c) < n: die(f'{p.k} rowbox {o[4]}: {len(c)}')
            return c[:n]
        for nm, o in (('trap', tr), ('basin', ba)):
            for suf, b in zip(('.T', '.P'), rowbox(o, 2)):
                p.F[nm + suf] = dict(t='c', p=p.pn, x=round(b[0], 1), y=round(b[1], 1), w=round(b[2], 1), h=round(b[3], 1), snap=True, pre=False)
        p.check('trap.calc', tcalc[0] + 1.0, tcalc[1] + 2.5); p.check('trap.3600', t36[0] + 1.0, t36[1] + 2.5)
        def lone(rx, xmin, ymin, ymax=9999):
            return anc(p, rx, xmin, 700, ymin, ymax)
        nr = lone(r'Not required', 350, ba[1]); rq = lone(r'^\W*Required \(>10 acres\) and', 350, ba[1])
        bc = lone(r'Calculated volume', 360, rq[1]); b36 = lone(r'3,600', 360, bc[1])
        nf = lone(r'but not feasible', 350, b36[1])
        for fid, o in (('basin.notreq', nr), ('basin.req', rq), ('basin.calc', bc), ('basin.3600', b36), ('basin.nf', nf)): p.check(fid, o[0] + 1.0, o[1] + 2.5)
        nfl = [o for o in p.lines(360, 380, nf[1] + 5, nf[1] + 90) if re.search(r'Available|Site slope|Site soils|Public safety|Other', o[4])]
        if len(nfl) != 5: die(f'{p.k} nf lines {len(nfl)}')
        for fid, o in zip(['nf.area', 'nf.slope', 'nf.soils', 'nf.safety', 'nf.other.c'], nfl): p.check(fid, o[0] + 1.0, o[1] + 2.5)
        uo = [x for x in p.ul if abs(x[0] - nfl[4][3]) < 4 and x[1] > 400 and x[1] < 420]
        if not uo: die('nf other underline')
        p.text('nf.other', uo[0])
        items2(p, ['seal2.nolay', 'seal2.calc', 'seal2.nofeas'], 915, 928, 515, 610, rx=r'No signed|Calculations|third box', label='seal2')

def run(name, var):
    F = {}; dims = []
    pre = set()
    for pn in (1, 2):
        p = P(name, pn, F, pre)
        dims.append([round(p.doc[pn - 1].rect.width, 1), round(p.doc[pn - 1].rect.height, 1)])
        (sheet1 if pn == 1 else sheet2)(p, var)
    # pre-checked boxes in the printed template
    prefix = ['rt.' + k for k in (RT_B if var == 'B' else RT_A)] + ['rc.' + k for k in (RC_B if var == 'B' else RC_A)] + ['nsd.' + k for k in NSD]
    for k in prefix: F[k]['pre'] = True
    return dict(file=name + '.pdf', pages=dims, fields=F)

out_d = {'B': run('swp3b23', 'B'), 'A': run('swp3a23', 'A')}
open(out, 'w').write('/* Generated by swp3-builder/summary-tools/build_layout.py from the unmodified official PDFs. Do not edit by hand. Units: PDF points, origin top-left (y down) as in PyMuPDF. */\n(function (r) { var L = ' + json.dumps(out_d, separators=(',', ':')) + '; if (typeof module !== "undefined" && module.exports) module.exports = L; else r.SwpSummaryLayout = L; })(typeof window !== "undefined" ? window : this);\n')
for v in out_d:
    F = out_d[v]['fields']; print(v, len(F), 'fields;', sum(1 for f in F.values() if f['t'] == 'c'), 'checks;', sum(1 for f in F.values() if f['t'] == 'c' and not f['snap']), 'unsnapped')
