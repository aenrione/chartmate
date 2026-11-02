# Group bars that play the same figure, and keep only the notes that most occurrences agree on.
# Fingerpicked accompaniment repeats, so a note heard in most occurrences of a figure is real,
# while a ghost (overtone, sympathetic string, voice bleed) shows up in only a few.
#
# usage: figures.py <quant.json> <figures.json> [--labels labels.json] [--thr 0.35]
#                   [--keep 0.5] [--sim 0.8] [--show A,B]
#   quant.json   from quantize.py
#   --labels     {"A": "1,3,5-7", "B": "2,4", ...} assigns bars to figures by hand; bars left
#                out are clustered automatically. Without it every bar is clustered.
#   --thr        minimum basic-pitch amplitude for a note to count as heard (default .35)
#   --keep       share of a figure's occurrences a (slot, pitch) needs to be kept (default .5)
#   --sim        cosine similarity to join an existing cluster (default .8)
#   --show       print the consensus of only these figures
#
# figures.json: {"labels": {"1": "A", ...},
#                "figures": {"A": {"bars": [..], "notes": [{"slot": 0, "midi": 40, "share": .9}]}}}
# Printout: the label sequence (8 bars per line, so the form is visible), then per figure every
# (slot, pitch) heard in at least 25% of its occurrences, with the share; kept ones marked "*".
# Octave pairs (X and X+12 at the same slot) are a common basic-pitch artefact: when the upper
# one is much weaker and always co-occurs with the lower, it's the overtone - drop it by hand.
import argparse
import collections
import json

import numpy as np

NAMES = 'C C# D D# E F F# G G# A A# B'.split()


def name(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def parse_bars(s):
    out = []
    for part in str(s).split(','):
        if '-' in part:
            lo, hi = map(int, part.split('-'))
            out += range(lo, hi + 1)
        elif part.strip():
            out.append(int(part))
    return out


ap = argparse.ArgumentParser()
ap.add_argument('quant'); ap.add_argument('out')
ap.add_argument('--labels')
ap.add_argument('--thr', type=float, default=0.35)
ap.add_argument('--keep', type=float, default=0.5)
ap.add_argument('--sim', type=float, default=0.8)
ap.add_argument('--show')
a = ap.parse_args()

q = json.load(open(a.quant))
N = q['per_bar']
bars = q['bars']


def heard(b):
    """set of (slot, midi) heard in bar b"""
    return {(n['slot'], n['midi']) for n in b['notes'] if n['amp'] >= a.thr}


def vec(b):
    """slot x pitch-class chroma, plus a bass (midi < 52) slot x pitch-class block weighted x2"""
    v = np.zeros((N, 24))
    for n in b['notes']:
        if n['amp'] < a.thr:
            continue
        v[n['slot'], n['midi'] % 12] += n['amp']
        if n['midi'] < 52:
            v[n['slot'], 12 + n['midi'] % 12] += 2 * n['amp']
    v = v.ravel()
    return v / (np.linalg.norm(v) or 1)


labels = {}
if a.labels:
    for lab, spec in json.load(open(a.labels)).items():
        for bn in parse_bars(spec):
            labels[bn] = lab

centroids = collections.defaultdict(list)
for b in bars:
    if b['bar'] in labels:
        centroids[labels[b['bar']]].append(vec(b))
auto = iter('abcdefghijklmnopqrstuvwxyz' + ''.join(f'z{i}' for i in range(99)))
for b in bars:
    if b['bar'] in labels:
        continue
    v = vec(b)
    best, bs = None, a.sim
    for lab, vs in centroids.items():
        s = float(np.mean(vs, axis=0) @ v) / (np.linalg.norm(np.mean(vs, axis=0)) or 1)
        if s >= bs:
            best, bs = lab, s
    if best is None:
        best = next(auto)
    labels[b['bar']] = best
    centroids[best].append(v)

print('form (8 bars per line; upper case = hand-labelled):')
seq = [labels[b['bar']] for b in bars]
for i in range(0, len(seq), 8):
    print(f'  {i + 1:3d} {bars[i]["t0"]:6.1f}s  ' + ' '.join(f'{x:>3}' for x in seq[i:i + 8]))

figs = {}
show = set(a.show.split(',')) if a.show else None
for lab in sorted(set(seq), key=seq.index):
    members = [b for b in bars if labels[b['bar']] == lab]
    cnt = collections.Counter()
    for b in members:
        cnt.update(heard(b))
    k = len(members)
    kept = [{'slot': s, 'midi': m, 'share': round(c / k, 2)} for (s, m), c in cnt.items() if c / k >= a.keep]
    figs[lab] = {'bars': [b['bar'] for b in members], 'notes': sorted(kept, key=lambda x: (x['slot'], x['midi']))}
    if show and lab not in show:
        continue
    print(f'\n[{lab}] x{k}: bars {",".join(str(b["bar"]) for b in members)}')
    for s in range(N):
        row = sorted(((m, c / k) for (ss, m), c in cnt.items() if ss == s and c / k >= 0.25), key=lambda x: x[0])
        print(f'  {s}: ' + ' '.join(f'{name(m)}{"*" if sh >= a.keep else ""}{sh:.0%}' for m, sh in row))
json.dump({'labels': {str(k): v for k, v in labels.items()}, 'figures': figs}, open(a.out, 'w'), indent=1)
