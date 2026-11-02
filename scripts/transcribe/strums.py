# Strum strength per grid slot across bars, from the guitar stem. The per-slot strike profile
# over repeated bars is the strum rhythm; take the voicing from the chord shapes.
# The direction column (dir / lag_ms) is UNRELIABLE: do not write D/U from it. Write
# down/up as a pendulum assumption (on-beat down, off-beat up) and say so in the report.
#
# usage: strums.py <guitar.wav> <notes.csv> <grid.json> <out.json> [--bars 33-50]
#                  [--min .25] [--print]
#   grid.json  from grid.py (slots + bars); one strum is looked for per slot
#   --min      onset strength (relative to the 95th percentile of the stem) for a slot to count
#              as struck
#   --lag-min  |lag_ms| needed to call a direction from the sweep (default 6)
#   --mode     edge (default) | centroid: how each band's onset time is located
#
# For each slot of each bar:
#   strength  peak onset strength near the slot (guitar stem, librosa spectral flux)
#   lag_ms    sweep direction: the flux in 8 log-spaced bands (80 Hz-5 kHz) is located in time
#             (energy-weighted centroid within -30..+60 ms of the onset), and time is regressed on
#             band index. A downstroke reaches the low strings first, so their band peaks first:
#             lag_ms > 0 = low before high = DOWN, lag_ms < 0 = UP. lag_ms is the fitted time
#             difference between the lowest and the highest band.
#   low/high  lowest and highest basic-pitch note starting within 60 ms (what was hit)
#   dir       'D' or 'U' from lag_ms when |lag_ms| >= --lag-min, else from the strings hit
#             (bass string in the chord -> D, top strings only -> U), else '?'
# Prints each bar as a 6-character pattern (one per slot: D/U/d/u, lowercase = weak, '.' = none)
# followed by the per-slot lags, and at the end the most common pattern per --bars range and
# how often the lag-based direction agrees with "on-beat = down" (a sanity check: alternating
# strumming plays every on-beat slot down).
import argparse
import collections
import csv
import json

import librosa
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('wav'); ap.add_argument('notes'); ap.add_argument('grid'); ap.add_argument('out')
ap.add_argument('--bars')
ap.add_argument('--min', type=float, default=0.25)
ap.add_argument('--lag-min', type=float, default=6.0)
ap.add_argument('--print', action='store_true')
ap.add_argument('--mode', choices=['edge', 'centroid'], default='edge')
a = ap.parse_args()

SR, HOP = 22050, 64
y, _ = librosa.load(a.wav, sr=SR, mono=True)
env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
env = env / np.percentile(env, 95)
tE = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)
Sx = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP))
f = librosa.fft_frequencies(sr=SR, n_fft=1024)
edges = np.geomspace(80, 5000, 9)
band_flux = []
for lo, hi in zip(edges[:-1], edges[1:]):
    e = np.log1p(Sx[(f >= lo) & (f < hi)].sum(0))
    band_flux.append(np.maximum(0, np.diff(e, prepend=e[0])))
band_flux = np.array(band_flux)
notes = [(float(r[0]), int(r[2]), float(r[3])) for r in csv.reader(open(a.notes))]
g = json.load(open(a.grid))
N = g['per_bar']
slots = g['slots'][g['phase']:]
slot_s = g['slot_s']

NAMES = 'C C# D D# E F F# G G# A A# B'.split()


def nm(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def analyse(t):
    w = (tE >= t - 0.35 * slot_s) & (tE <= t + 0.35 * slot_s)
    if not w.any():
        return None
    idx = np.where(w)[0]
    k = idx[np.argmax(env[idx])]
    strength = float(env[k])
    t_on = tE[k]
    win = (tE >= t_on - 0.03) & (tE <= t_on + 0.06)
    cents = []
    for b in range(band_flux.shape[0]):
        v = band_flux[b, win]
        if a.mode == 'centroid':
            cents.append(float((tE[win] * v).sum() / v.sum()) if v.sum() > 0 else np.nan)
        else:  # rising edge: first frame reaching half the band's peak in the window
            cents.append(float(tE[win][np.argmax(v >= 0.5 * v.max())]) if v.max() > 0 else np.nan)
    cents = np.array(cents)
    ok = ~np.isnan(cents)
    lag = 0.0
    if ok.sum() >= 4:
        x = np.arange(len(cents))[ok]
        slope = np.polyfit(x, cents[ok], 1)[0]
        lag = float(-slope * (len(cents) - 1) * 1000)  # high minus low, flipped: >0 = low first
    lo_e = band_flux[:2, win].sum()
    hi_e = band_flux[4:, win].sum()
    tilt = float(np.log2((hi_e + 1e-6) / (lo_e + 1e-6)))
    hit = [m for tt, m, amp in notes if abs(tt - t_on) < 0.06 and amp >= 0.3]
    return {'t': round(float(t_on), 3), 'strength': round(strength, 2), 'lag_ms': round(lag, 1), 'tilt': round(tilt, 2),
            'low': nm(min(hit)) if hit else None, 'high': nm(max(hit)) if hit else None,
            'n': len(set(hit)), 'low_midi': min(hit) if hit else None}


def direction(r):
    if r is None or r['strength'] < a.min:
        return '.'
    if abs(r['lag_ms']) >= a.lag_min:
        d = 'D' if r['lag_ms'] > 0 else 'U'
    elif r['low_midi'] is not None:
        d = 'D' if r['low_midi'] <= 50 else 'U'
    else:
        d = '?'
    return d if r['strength'] >= 2 * a.min else d.lower()


rng = None
if a.bars:
    lo, hi = map(int, a.bars.split('-'))
    rng = range(lo, hi + 1)
out, pats, agree = [], collections.Counter(), collections.Counter()
for bi in range(len(g['bars'])):
    k = bi + 1
    if rng is not None and k not in rng:
        continue
    rec = {'bar': k, 'slots': []}
    pat = ''
    for s in range(N):
        j = bi * N + s
        if j >= len(slots):
            break
        r = analyse(slots[j])
        d = direction(r)
        rec['slots'].append(dict(r or {}, dir=d))
        pat += d
        if d not in '.?' and r and abs(r['lag_ms']) >= a.lag_min:
            agree[(s % 2 == 0) == (d.upper() == 'D')] += 1
    rec['pattern'] = pat
    out.append(rec)
    pats[pat.upper()] += 1
    if a.print:
        print(f"{k:4d} {pat}  lags " + ' '.join(f"{x.get('lag_ms', 0):+5.0f}" for x in rec['slots']) +
              '  str ' + ' '.join(f"{x.get('strength', 0):3.1f}" for x in rec['slots']) +
              '  low ' + ' '.join(f"{x.get('low') or '-':4s}" for x in rec['slots']))
print('patterns:', pats.most_common(6))
print(f"lag direction agrees with on-beat=down on {agree[True]}/{agree[True] + agree[False]} slots")
json.dump({'bars': out}, open(a.out, 'w'), indent=1)
