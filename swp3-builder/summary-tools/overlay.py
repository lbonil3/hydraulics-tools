import json, re, sys, pymupdf
src='/workspace/swp3src/ss'
txt=open('/workspace/swp3tools/layout.js').read()
L=json.loads(re.search(r'var L = (\{.*?\}); if',txt,re.S).group(1))
for v,name in (('B','swp3b23'),('A','swp3a23')):
    d=pymupdf.open(f'{src}/{name}.pdf')
    for f,o in L[v]['fields'].items():
        pg=d[o['p']-1]
        if o['t']=='c': pg.draw_rect(pymupdf.Rect(o['x']-0.5,o['y']-0.5,o['x']+o['w']+0.5,o['y']+o['h']+0.5),color=(1,0,0),width=0.6)
        elif o['t']=='t': pg.draw_line((o['x0'],o['y']-1),(o['x1'],o['y']-1),color=(0,0,1),width=1.2)
        elif o['t']=='a':
            for l in o['lines']: pg.draw_line((l['x0'],l['y']-1),(l['x1'],l['y']-1),color=(0,0.6,0.9),width=1.2)
        elif o['t']=='tbl':
            for r in o['rows']:
                for c in o['cols']: pg.draw_rect(pymupdf.Rect(c[0]+1,r[0]+1,c[1]-1,r[1]-1),color=(0,0.7,0),width=0.5)
        elif o['t']=='cell': pg.draw_rect(pymupdf.Rect(o['x0']+0.5,o['y0']+0.5,o['x1']-0.5,o['y1']-0.5),color=(0.8,0,0.8),width=0.5)
    for i in range(2): d[i].get_pixmap(matrix=pymupdf.Matrix(1.6,1.6)).save(f'/workspace/swp3tools/ov-{v}{i+1}.png')
