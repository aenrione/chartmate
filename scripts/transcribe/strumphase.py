# Strum direction for a strummed section, decided per section instead of per stroke.
#
# The old per-slot detectors (strums.py's band lag, strumdir.py's low-vs-high lag) sit at
# chance. This one splits the problem in two, and only the second half is a guess:
#
#   1. DOES THE HAND ALTERNATE?  Measured without the grid: take the attack strength of every
#      onset in time order and correlate the sequence with itself at lag 1 and lag 2. A hand
#      going down-up-down-up makes neighbouring strokes differ and every second stroke match,
#      so r1 < 0 and r2 > 0. On Society: r1 -0.35, r2 +0.36 over 600 strokes.
#   2. WHICH BRANCH IS DOWN?  One attack-shape cue, predicted from the mechanics before being
#      measured, and aggregated over a block of bars rather than trusted per stroke:
#        subpeaks  a downstroke sweeps 5-6 strings, so its onset-flux peak breaks into more
#                  resolvable sub-peaks than an upstroke's shorter 3-4 string sweep
#      Reported as the AUC of "even slot" against "odd slot". AUC > .5 => the even slots (the
#      on-beats, when the grid's phase is right) are the downstrokes. Measured: .85 on Society
#      (solo guitar, every eighth struck, 5/5 blocks agree), .57 on the Te vas de mí choruses
#      (full band, strokes skipped, 7/8 blocks agree) -- decisive on the first, barely a lean
#      on the second. Do not read a single block below about .6 as an answer.
#
#      risetime (10-90% envelope rise, longer for a downstroke starting on the bass strings)
#      is printed too, but it does NOT vote: it read .61 on Society and .37 -- the opposite
#      sign -- on Te vas de mí, so it does not generalise. It is here only as a diagnostic.
#
# Per stroke neither number is reliable. Per block of 8-16 bars, ~60 strokes a side, the call
# held across every block of both songs. So: read the block table, take the majority call, and
# write the section as a strict alternation from there. If the blocks disagree, or the
# alternation test says the hand is not alternating, this tool has no answer for you -- fall
# back to the pendulum and label it as an assumption.
#
# usage: strumphase.py <guitar.wav> <grid.json> [--bars 33-48] [--block 8] [--min .3]
#   --block N   bars per block in the table (0 = one block for the whole range)
#   --min       onset strength (relative to the stem's 95th percentile) for a slot to count
#
# Caveat worth repeating in the report: the AUC is computed against slot parity, so it tells
# you the strokes alternate *in step with the grid* and which parity looks like a downstroke.
# It cannot catch a section where the player breaks the alternation by skipping a stroke
# without the hand skipping with it.
import argparse
import json

import librosa
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('wav'); ap.add_argument('grid')
ap.add_argument('--bars')
ap.add_argument('--block', type=int, default=8)
ap.add_argument('--min', type=float, default=0.3)
a = ap.parse_args()

SR, HOP = 22050, 32
y, _ = librosa.load(a.wav, sr=SR, mono=True)
env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
env = env / np.percentile(env, 95)
rms = librosa.feature.rms(y=y, frame_length=256, hop_length=HOP)[0]
t = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)
dt = float(t[1] - t[0])

g = json.load(open(a.grid))
N = g['per_bar']
slots = g['slots'][g['phase']:]
b0, b1 = map(int, a.bars.split('-')) if a.bars else (1, len(g['bars']))

rows = []  # bar, parity, strength, subpeaks, risetime
for i, ts in enumerate(slots[:-1]):
    bar = i // N + 1
    if not (b0 <= bar <= b1):
        continue
    m = np.where((t >= ts - 0.06) & (t < ts + 0.08))[0]
    if len(m) < 5:
        continue
    j = m[np.argmax(env[m])]
    pk = float(env[j])
    if pk < a.min:
        continue
    w = np.where((t >= t[j] - 0.06) & (t <= t[j] + 0.06))[0]
    e = env[w]
    sub = int(((e[1:-1] > e[:-2]) & (e[1:-1] > e[2:]) & (e[1:-1] > pk * 0.4)).sum())
    r = np.where((t >= t[j] - 0.03) & (t <= t[j] + 0.07))[0]
    lo, hi = rms[r].min(), rms[r].max()
    rise = float(np.argmax(rms[r] >= lo + 0.9 * (hi - lo)) - np.argmax(rms[r] >= lo + 0.1 * (hi - lo))) * dt * 1000
    rows.append((bar, i % 2, pk, sub, rise, float(t[j])))

if len(rows) < 20:
    raise SystemExit(f'only {len(rows)} struck slots in bars {b0}-{b1}: nothing to measure')
R = np.array([r[:5] for r in rows], float)

# 1. alternation, grid-free: consecutive onsets in time order
v = np.array([r[2] for r in sorted(rows, key=lambda x: x[5])])
v = (v - v.mean()) / (v.std() + 1e-9)
r1 = float(np.corrcoef(v[:-1], v[1:])[0, 1])
r2 = float(np.corrcoef(v[:-2], v[2:])[0, 1])
verdict = 'alternating' if (r1 < -0.1 and r2 > 0.1) else 'NOT clearly alternating'
print(f'alternation (no grid used): lag1 r {r1:+.3f}  lag2 r {r2:+.3f}  -> {verdict}')
print(f'  {len(rows)} struck slots in bars {b0}-{b1}\n')


def auc(x, y):
    x, y = np.asarray(x), np.asarray(y)
    if len(x) < 5 or len(y) < 5:
        return float('nan')
    r = np.concatenate([x, y]).argsort().argsort() + 1.0
    return float((r[:len(x)].sum() - len(x) * (len(x) + 1) / 2) / (len(x) * len(y)))


def call(m):
    ev, od = R[m & (R[:, 1] == 0)], R[m & (R[:, 1] == 1)]
    s, r = auc(ev[:, 3], od[:, 3]), auc(ev[:, 4], od[:, 4])
    return int(m.sum()), s, r, s  # only subpeaks votes


print('block        n   AUC subpeaks  (risetime)    call')
calls = []
step = a.block or (b1 - b0 + 1)
for s0 in range(b0, b1 + 1, step):
    m = (R[:, 0] >= s0) & (R[:, 0] < s0 + step)
    if m.sum() < 20:
        continue
    n, s, r, avg = call(m)
    c = 'even slots = DOWN' if avg > 0.5 else 'even slots = UP'
    calls.append(avg > 0.5)
    print(f'{s0:4d}-{min(s0 + step - 1, b1):<4d} {n:5d}   {s:.3f}        ({r:.3f})       {c}')
n, s, r, avg = call(np.ones(len(R), bool))
agree = sum(calls) if sum(calls) * 2 >= len(calls) else len(calls) - sum(calls)
print(f'\noverall      {n:5d}   {s:.3f}        ({r:.3f})       '
      f'{"even slots = DOWN" if avg > 0.5 else "even slots = UP"}'
      f'   ({agree}/{len(calls)} blocks agree)')
if sum(calls) not in (0, len(calls)):
    print('blocks disagree: do not trust the phase, and check the grid before the audio')
