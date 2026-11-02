# Per-bar pitch-class energy of the guitar stem, printed raw. The view chordlabels.py hides:
# it gives you a chord name, this gives you the numbers the name came from, so you can see
# *which* pitch class separates two candidates and split a label that is really two voicings.
#
# Two chords that share most of their notes are told apart by one pitch class, and the whole
# question is whether that class is present. Gmaj7 "324002" (G B F#) vs plain G "355433"
# (G B D): D. Gmaj7 vs Bm (B D F#): G. D/A vs A: F# vs E. Read the column, not the label.
#
# usage: barchroma.py <guitar.wav> <grid.json> [--pcs G,B,D,F#] [--bars 1-76]
#        [--vocals vocals.wav] [--half] [--map GGDA...]
#   --pcs     pitch classes to print, in order (default: the 5 strongest over the whole file)
#   --half    two rows per bar instead of one, to catch a chord that changes mid-bar
#   --map     one letter per bar; printed next to the numbers so you can scan for bars whose
#             numbers disagree with the label you gave them
#   --vocals  prints the vocal stem's dB per bar. A row whose odd reading sits in the loudest
#             vocal bars is bleed, not a chord: check it against a bar with the voice quiet.
# Rows are L2-normalised per bar, so columns are comparable across bars but not across songs.
import argparse, json
import librosa, numpy as np

NAMES = 'C C# D D# E F F# G G# A A# B'.split()
ap = argparse.ArgumentParser()
ap.add_argument('wav'); ap.add_argument('grid')
ap.add_argument('--pcs', default=''); ap.add_argument('--bars', default='')
ap.add_argument('--vocals', default=''); ap.add_argument('--half', action='store_true')
ap.add_argument('--map', default='')
a = ap.parse_args()

g = json.load(open(a.grid))
bars = g['bars']
lo, hi = (1, len(bars))
if a.bars:
    lo, hi = (int(x) for x in a.bars.split('-'))

y, sr = librosa.load(a.wav, sr=22050, mono=True)
# harmonic part only: the strum's broadband attack otherwise smears every pitch class
C = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y, margin=3.0), sr=sr, hop_length=512)
t = librosa.times_like(C, sr=sr, hop_length=512)

voc = None
if a.vocals:
    v, _ = librosa.load(a.vocals, sr=sr, mono=True)
    tv = librosa.times_like(v, sr=sr, hop_length=1)


def row(t0, t1):
    m = (t >= t0) & (t < t1)
    if m.sum() == 0:
        return None
    u = C[:, m].mean(1)
    return u / (np.linalg.norm(u) + 1e-9)


pcs = a.pcs.split(',') if a.pcs else None
if pcs is None:
    acc = np.zeros(12)
    for i in range(lo - 1, min(hi, len(bars))):
        u = row(*bars[i])
        if u is not None:
            acc += u
    pcs = [NAMES[i] for i in np.argsort(-acc)[:5]]
idx = [NAMES.index(p) for p in pcs]

print('bar' + (' lab' if a.map else '') + '  ' + ' '.join(f'{p:>4s}' for p in pcs)
      + ('   voc' if a.vocals else ''))
for i in range(lo - 1, min(hi, len(bars))):
    t0, t1 = bars[i]
    spans = [(t0, t1)] if not a.half else [(t0, (t0 + t1) / 2), ((t0 + t1) / 2, t1)]
    for k, (s0, s1) in enumerate(spans):
        u = row(s0, s1)
        if u is None:
            continue
        lab = f" {a.map[i]:>3s}" if a.map and i < len(a.map) else ''
        tag = f'{i + 1:3d}' + (f'.{k}' if a.half else '') + lab
        line = tag + '  ' + ' '.join(f'{u[j]:4.2f}' for j in idx)
        if a.vocals:
            seg = v[int(s0 * sr):int(s1 * sr)]
            db = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)
            line += f'  {db:5.0f}'
        print(line)
