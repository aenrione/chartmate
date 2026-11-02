# Per-bar lead sheet + texture from the guitar stem: chord (chroma template match, bass from
# the transcription), and numbers that tell a strummed bar from a fingerpicked one.
#
# usage: barinfo.py <guitar.wav> <notes.csv> <grid.json> <out.json> [--vocals vocals.wav]
#                   [--split 2] [--bars 1-40]
#   --split K   also guess a chord for each 1/K of the bar (K=2: half bars), shown after "|"
#   --vocals    print the vocal stem's RMS per bar (dB), to find sung vs instrumental bars
#
# out.json: {"bars": [{"bar", "t0", "t1", "chord", "parts": [chord per 1/K], "bass", "score",
#            "onsets", "poly", "hf", "kind"}]}
# Texture columns:
#   onsets  guitar-stem onsets in the bar (librosa onset detection)
#   poly    mean number of basic-pitch notes starting within 35 ms of each onset
#   hf      share of onset-flux energy above 2 kHz: a strum (pick/nails across 4-6 strings)
#           is broadband, a single plucked string is not
#   kind    'strum' if poly >= --poly-strum and hf >= --hf-strum, 'pick' if poly < 2.2, else 'mixed'
# The chord is a template match on CQT chroma averaged over the bar (weighted by energy), with
# a bonus for a root that equals the lowest clear note at the start of the bar. Treat it as a
# hint for the progression; the per-slot roll (quantize.py) is the evidence for voicings.
import argparse
import csv
import json

import librosa
import numpy as np

NAMES = 'C C# D D# E F F# G G# A A# B'.split()
Q = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10),
     'sus2': (0, 2, 7), 'sus4': (0, 5, 7), 'add9': (0, 2, 4, 7), '6': (0, 4, 7, 9)}
PENALTY = {'': 0, 'm': 0, '7': .08, 'maj7': .08, 'm7': .08, 'sus2': .1, 'sus4': .1, 'add9': .1, '6': .1}

ap = argparse.ArgumentParser()
ap.add_argument('wav'); ap.add_argument('notes'); ap.add_argument('grid'); ap.add_argument('out')
ap.add_argument('--vocals')
ap.add_argument('--split', type=int, default=2)
ap.add_argument('--bars')
ap.add_argument('--poly-strum', type=float, default=3.0)
ap.add_argument('--hf-strum', type=float, default=0.25)
a = ap.parse_args()

HOP = 512
y, sr = librosa.load(a.wav, sr=22050, mono=True)
C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP, norm=None)
rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
tC = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=HOP)
S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256))
f = librosa.fft_frequencies(sr=sr, n_fft=1024)
flux = np.maximum(0, np.diff(np.log1p(S), axis=1, prepend=0))
hi_flux, all_flux = flux[f >= 2000].sum(0), flux.sum(0) + 1e-9
tS = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=256)
on = librosa.onset.onset_detect(y=y, sr=sr, hop_length=256, units='time', backtrack=False)
vy = None
if a.vocals:
    vy, _ = librosa.load(a.vocals, sr=22050, mono=True)

g = json.load(open(a.grid))
notes = [(float(r[0]), int(r[2]), float(r[3])) for r in csv.reader(open(a.notes))]


def chord_of(t0, t1, bass_pc):
    m = (tC >= t0) & (tC < t1)
    if not m.any():
        return '-', 0.0
    v = (C[:, m] * rms[m]).sum(1)
    v = v / (np.linalg.norm(v) + 1e-9)
    best, bs = '-', -9
    for r in range(12):
        for q, ivs in Q.items():
            tpl = np.zeros(12)
            for i in ivs:
                tpl[(r + i) % 12] = 1
            tpl /= np.linalg.norm(tpl)
            s = float(v @ tpl) - PENALTY[q] + (0.06 if bass_pc == r else 0)
            if s > bs:
                best, bs = NAMES[r] + q, s
    root = best[:2] if len(best) > 1 and best[1] == '#' else best[:1]
    if bass_pc is not None and NAMES.index(root) != bass_pc:
        best += '/' + NAMES[bass_pc]
    return best, bs


rng = None
if a.bars:
    lo, hi = map(int, a.bars.split('-'))
    rng = range(lo, hi + 1)
out = []
for i, (t0, t1) in enumerate(g['bars']):
    k = i + 1
    early = [m for t, m, amp in notes if t0 - .06 <= t < t0 + (t1 - t0) / 3 and amp >= .4 and m <= 52]
    bass = min(early) if early else None
    chord, sc = chord_of(t0, t1, bass % 12 if bass is not None else None)
    parts = []
    for j in range(a.split):
        u0 = t0 + (t1 - t0) * j / a.split
        u1 = t0 + (t1 - t0) * (j + 1) / a.split
        e = [m for t, m, amp in notes if u0 - .06 <= t < u0 + (u1 - u0) / 2 and amp >= .4 and m <= 52]
        parts.append(chord_of(u0, u1, min(e) % 12 if e else None)[0])
    ons = [t for t in on if t0 - .03 <= t < t1 - .03]
    poly = [len({m for t, m, amp in notes if abs(t - o) < .035 and amp >= .3}) for o in ons]
    m = (tS >= t0) & (tS < t1)
    hf = float(hi_flux[m].sum() / all_flux[m].sum()) if m.any() else 0
    mp = float(np.mean(poly)) if poly else 0
    kind = 'strum' if mp >= a.poly_strum and hf >= a.hf_strum else ('pick' if mp < 2.2 else 'mixed')
    rec = {'bar': k, 't0': round(t0, 2), 't1': round(t1, 2), 'chord': chord, 'parts': parts,
           'bass': NAMES[bass % 12] + str(bass // 12 - 1) if bass is not None else None, 'score': round(sc, 2),
           'onsets': len(ons), 'poly': round(mp, 2), 'hf': round(hf, 3), 'kind': kind}
    if vy is not None:
        seg = vy[int(t0 * 22050):int(t1 * 22050)]
        rec['voc_db'] = round(float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-6)), 1) if len(seg) else -99
    out.append(rec)
    if rng is None or k in rng:
        print(f"{k:4d} {t0:7.2f}s {chord:9s} | {' '.join(f'{p:8s}' for p in parts)} bass {rec['bass'] or '-':4s} "
              f"on {len(ons):2d} poly {mp:4.1f} hf {hf:.2f} {kind:5s}" + (f" voc {rec['voc_db']:6.1f}" if vy is not None else ''))
json.dump({'bars': out}, open(a.out, 'w'), indent=1)
