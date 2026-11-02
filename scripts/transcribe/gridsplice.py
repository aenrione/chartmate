# Splice two drumgrid.py grids at a time T: beats of <a> before T, beats of <b> from T on.
# Use it when the beat tracker slips somewhere: re-track the rest with drumgrid.py --start
# and --first-bar at the first good bar line after the slip, then splice.
# usage: gridsplice.py <a.json> <b.json> <T> <out.json> --beats-per-bar B --slots-per-beat K --first-bar T0
#   T must be a bar line in b; T0 is the first bar line of the whole grid.
import argparse, json
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('t', type=float); ap.add_argument('out')
ap.add_argument('--beats-per-bar', type=int, required=True); ap.add_argument('--slots-per-beat', type=int, required=True)
ap.add_argument('--first-bar', type=float, required=True)
x = ap.parse_args()
A, B = json.load(open(x.a)), json.load(open(x.b))
beats = np.array([t for t in A['beats'] if t < x.t - 0.1] + [t for t in B['beats'] if t >= x.t - 0.05])
K, NB = x.slots_per_beat, x.beats_per_bar
slots = []
for i in range(len(beats) - 1):
    slots += list(np.linspace(beats[i], beats[i + 1], K, endpoint=False))
slots.append(beats[-1]); slots = np.array(slots)
first = int(np.argmin(np.abs(beats - x.first_bar)))
sp, N = first * K, NB * K
bars = [[float(slots[i]), float(slots[i + N])] for i in range(sp, len(slots) - N, N)]
d = np.diff(beats)
for i in np.where(np.abs(d / np.median(d) - 1) > 0.15)[0]:
    print(f'irregular beat at {beats[i]:.2f}s: {d[i]:.3f}s')
json.dump({'slot_s': float(np.median(np.diff(slots))), 'per_bar': N, 'sub': 1, 'phase': sp,
           'slots': [round(float(s), 4) for s in slots], 'beats': [round(float(b), 4) for b in beats],
           'bars': [[round(b0, 4), round(b1, 4)] for b0, b1 in bars]}, open(x.out, 'w'))
print(f'{len(beats)} beats, {len(bars)} bars, bar 1 at {bars[0][0]:.2f}s, last bar {bars[-1]} -> {x.out}')
