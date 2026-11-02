# Fit a constant-speed grid to each occurrence of a bar, using the ASCII column positions
# (tab-columns.py) as the starting guess, and print where each note really falls in grid units.
# usage: fit.py <notes.csv> <beats.json> <cols.json> <occ.json> [cols_per_unit=2]
#   occ.json: [[bar, start_s, end_s], ...] — occurrences you picked from align.py output
# Residuals near integers mean the tab spacing is the rhythm; consistent fractions (0.33, 0.67)
# mean triplets. Aggregates over occurrences are printed at the end.
import sys, csv, json, numpy as np
rows=[(float(a),float(b),int(c),float(d)) for a,b,c,d in csv.reader(open(sys.argv[1]))]
rows=[r for r in rows if r[3]>=0.28]
beats=json.load(open(sys.argv[2])); cols={b['bar']:b for b in json.load(open(sys.argv[3]))}
occs=json.load(open(sys.argv[4])); CPU=float(sys.argv[5]) if len(sys.argv)>5 else 2.0
bybar={}
for b in beats: bybar.setdefault(b['bar'],[]).append(b)
agg={}
def find(P, t, half, used):
    best=None
    for r in rows:
        if abs(r[0]-t)<=half and r[0] not in used:
            m = 1.0 if r[2] in P else (0.6 if any((r[2]-p)%12==0 for p in P) else 0)
            if m==0: continue
            sc = m*r[3]*(1-0.5*abs(r[0]-t)/half)
            if best is None or sc>best[0]: best=(sc,r[0],r[2])
    return best
def theilsen(x,y):
    sl=[(y[j]-y[i])/(x[j]-x[i]) for i in range(len(x)) for j in range(i+1,len(x)) if x[j]!=x[i]]
    b=np.median(sl); a=np.median(np.array(y)-b*np.array(x)); return a,b
for bar,st,en in occs:
    bb=bybar[bar]; cc=cols[bar]['cols']; w=cols[bar]['w']
    units=w/CPU; u0=(en-st)/units
    pos=[c/CPU for c in cc]
    a,b=st,u0
    for half in (0.9,0.55):
        found=[]; used=set()
        for j,be in enumerate(bb):
            P=set(n['midi'] for n in be['notes'])
            f=find(P, a+b*pos[j], half*b, used)
            if f: used.add(f[1])
            found.append(f)
        xs=[pos[j] for j in range(len(bb)) if found[j]]; ys=[found[j][1] for j in range(len(bb)) if found[j]]
        if len(xs)>=3: a,b=theilsen(xs,ys)
    res=[]
    for j in range(len(bb)):
        if found[j]:
            r=(found[j][1]-a)/b
            res.append('%5.2f'%r); agg.setdefault(bar,{}).setdefault(j,[]).append(r)
        else: res.append('  -  ')
    nxt=(en-a)/b
    print('bar%2d @%7.2f unit=%.3fs (%.0f bpm/unit) end@%5.2f | %s'%(bar,a,b,60/b,nxt,' '.join(res)))
print()
for bar in sorted(agg):
    cc=cols[bar]['cols']
    print('bar%2d'%bar, ' '.join('%s:%5.2f±%.2f(n%d)'%(cc[j]/CPU, np.median(v), (np.percentile(v,75)-np.percentile(v,25))/2, len(v)) for j,v in sorted(agg[bar].items())))
