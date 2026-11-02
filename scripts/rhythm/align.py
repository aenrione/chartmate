# Align the tab (beats.json from export-beats.ts) to transcribed notes (notes.csv from
# transcribe.py) and print where each bar occurs in the recording: a first draft of the form.
# usage: align.py <notes.csv> <beats.json> <align.json>
# Caveat: bars with nearly identical pitches (e.g. two variants of the same figure) get
# confused, and bar order is only a suggestion. Decide the form yourself from this output.
import sys, csv, json, numpy as np
notes_csv, beats_json, out_json = sys.argv[1:4]
AMIN=0.3
rows=sorted([(float(a),float(b),int(c),float(d)) for a,b,c,d in csv.reader(open(notes_csv))])
rows=[r for r in rows if r[3]>=AMIN]
ev=[]
for r in rows:
    if ev and r[0]-ev[-1]['t']<0.045: ev[-1]['p'].add(r[2]); ev[-1]['a']=max(ev[-1]['a'],r[3])
    else: ev.append({'t':r[0],'p':{r[2]},'a':r[3]})
beats=json.load(open(beats_json))
K=len(beats); N=len(ev)
T=[set(n['midi'] for n in b['notes']) for b in beats]
bar=[b['bar'] for b in beats]
starts=[k for k in range(K) if k==0 or bar[k]!=bar[k-1]]
ends=[k for k in range(K) if k==K-1 or bar[k]!=bar[k+1]]
def emis(Ts,A):
    m=0
    for t in Ts:
        if t in A: m+=1
        elif any((a-t)%12==0 for a in A): m+=0.5
    f=m/len(Ts)
    extra=sum(1 for a in A if a not in Ts and not any((a-t)%12==0 for t in Ts))
    return 2*f-1-min(0.4,0.1*extra)
E=np.array([[emis(T[k],ev[i]['p']) for k in range(K)] for i in range(N)])
PINS,PDEL,PSELF,PJUMP,PREP=-0.6,-0.8,-0.5,-2.5,-0.6
NEG=-1e9
M=np.full((N,K),NEG); I=np.full((N,K),NEG)
bpM=np.zeros((N,K,2),dtype=int); bpI=np.zeros((N,K),dtype=int)
isstart=np.zeros(K,bool); isstart[starts]=True
barstart={b:k for k in starts for b in [bar[k]]}
for i in range(N):
    if i==0:
        M[0]=E[0]+np.where(isstart,PJUMP,NEG); M[0][0]=E[0][0]; continue
    prev=np.maximum(M[i-1],I[i-1]); prevsrc=np.where(M[i-1]>=I[i-1],0,1)
    # insertion
    I[i]=prev+PINS; bpI[i]=prevsrc
    best_end=max(ends,key=lambda k:prev[k]); best_end_v=prev[best_end]
    for k in range(K):
        cands=[]
        if k>=1 and not isstart[k]: cands.append((prev[k-1],k-1))
        if k>=2 and not isstart[k]: cands.append((prev[k-2]+PDEL,k-2))
        cands.append((M[i-1][k]+PSELF,-(k+1)))  # self from M only
        if isstart[k]:
            if k>=1: cands.append((prev[k-1],k-1))  # sequential bar
            be=ends[bar[k]-1]  # this bar's end (repeat)
            cands.append((prev[be]+PREP,be))
            cands.append((best_end_v+PJUMP,best_end))
        v,src=max(cands)
        M[i][k]=v+E[i][k]
        if src<0: bpM[i][k]=(-src-1,0)
        else: bpM[i][k]=(src,prevsrc[src])
# backtrack
k=int(np.argmax(np.maximum(M[N-1],I[N-1]))); s=0 if M[N-1][k]>=I[N-1][k] else 1
path=[None]*N
for i in range(N-1,-1,-1):
    if s==0:
        path[i]=k; 
        if i==0: break
        k2,s2=bpM[i][k]; k,s=int(k2),int(s2)
    else:
        path[i]=None
        s=int(bpI[i][k])
res=[{'t':ev[i]['t'],'p':sorted(ev[i]['p']),'k':path[i],'bar':(bar[path[i]] if path[i] is not None else None),'beat':(beats[path[i]]['beat'] if path[i] is not None else None),'e':(float(E[i][path[i]]) if path[i] is not None else None)} for i in range(N)]
json.dump(res,open(out_json,'w'))
# summarize bar occurrences
occ=[]
for r in res:
    if r['k'] is None: continue
    if occ and occ[-1]['bar']==r['bar'] and r['beat']>=occ[-1]['lastbeat']:
        o=occ[-1]; o['lastbeat']=r['beat']; o['n']+=1; o['es'].append(r['e']); o['beats'].add(r['beat'])
    else:
        occ.append({'bar':r['bar'],'t':r['t'],'firstbeat':r['beat'],'lastbeat':r['beat'],'n':1,'es':[r['e']],'beats':{r['beat']}})
nb={b:sum(1 for x in bar if x==b) for b in set(bar)}
for o in occ:
    print('%7.2f bar %2d  beats %2d/%2d (first %d) mean %.2f'%(o['t'],o['bar'],len(o['beats']),nb[o['bar']],o['firstbeat'],np.mean(o['es'])))
