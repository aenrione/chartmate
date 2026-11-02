# Per-bar chord from a fixed candidate set (guitar-stem chroma cosine vs each chord's pitch
# classes, plus a bonus when the bass stem's root matches), then figure labels by position in
# the run of equal chords: a single bar -> "<chord>s", a run of 2+ -> "<chord>1", "<chord>2"
# (positions past 2 reuse 2). Writes a figures.py --labels file, so figures are grouped by
# harmony and position in the progression instead of by raw pitch similarity.
# usage: chordlabels.py <guitar.wav> <grid.json> <bquant.json> <labels.json>
#          --chords "G=G,A#,D,F;C=C,E,A#,D;E=D#,G,A#,D;D=D,F#,A,C" [--override 10=C,39=E]
#   chord names must be one letter-ish token (used as label prefix); --override forces bars.
import argparse, json, collections
import librosa, numpy as np
NAMES = 'C C# D D# E F F# G G# A A# B'.split()
ap = argparse.ArgumentParser(); ap.add_argument('wav'); ap.add_argument('grid'); ap.add_argument('bquant'); ap.add_argument('out')
ap.add_argument('--chords', required=True); ap.add_argument('--override', default='')
a = ap.parse_args()
cands = {}
for part in a.chords.split(';'):
    k, v = part.split('='); pcs = [NAMES.index(x) for x in v.split(',')]
    cands[k] = (pcs[0], np.isin(np.arange(12), pcs).astype(float))
g = json.load(open(a.grid)); bq = json.load(open(a.bquant))['bars']
y, sr = librosa.load(a.wav, sr=22050, mono=True)
C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512); tc = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=512)
ov = dict(x.split('=') for x in a.override.split(',') if x)
seq = []
for i, (t0, t1) in enumerate(g['bars']):
    v = C[:, (tc >= t0) & (tc < t1)].mean(1); v = v / np.linalg.norm(v)
    s0 = [n for n in (bq[i]['notes'] if i < len(bq) else []) if n['slot'] in (0, 1) and n['amp'] > .4]
    root = max(s0, key=lambda n: n['amp'])['midi'] % 12 if s0 else None
    sc = {k: float(v @ (m / np.linalg.norm(m))) + (0.08 if r == root else 0) for k, (r, m) in cands.items()}
    best = max(sc, key=sc.get); srt = sorted(sc.values())
    c = ov.get(str(i + 1), best)
    seq.append(c)
    print(f'{i + 1:4d} {t0:7.2f} {c}{"*" if str(i + 1) in ov else " "} margin {srt[-1] - srt[-2]:.2f}  ' + ' '.join(f'{k}:{x:.2f}' for k, x in sc.items()))
labels, i = [], 0
while i < len(seq):
    j = i
    while j < len(seq) and seq[j] == seq[i]: j += 1
    n = j - i
    labels += [seq[i] + 's'] if n == 1 else [f'{seq[i]}{min(p + 1, 2)}' for p in range(n)]
    i = j
groups = collections.defaultdict(list)
for b, l in enumerate(labels): groups[l].append(b + 1)
json.dump({k: ','.join(map(str, v)) for k, v in groups.items()}, open(a.out, 'w'), indent=1)
for r in range(0, len(labels), 8): print(f'{r + 1:4d}: ' + ' '.join(f'{l:3}' for l in labels[r:r + 8]))
