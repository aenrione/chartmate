# Beat/bar grid for a recording: tracks the smallest steady pulse (the "slot", e.g. the
# eighth of a fingerpicked 6/8), then picks the bar phase from where the bass notes land.
#
# usage: grid.py <guitar.wav> <notes.csv> <grid.json> --slot SECONDS --per-bar N
#                [--sub K] [--bass-max MIDI] [--start S] [--end S]
#   --slot      rough slot length in seconds (tempo.txt's shortest strong period is a good hint)
#   --per-bar   slots per bar (6 for 6/8 or 3/4 counted in eighths, 8 for 4/4 in eighths, ...)
#   --sub K     also write K equal subdivisions per slot (e.g. 2 for 16ths, 3 for triplets);
#               default 1
#   --bass-max  notes at or below this MIDI pitch count as bass for the bar phase (default 50)
#   --start/--end  only grid this time range (e.g. skip a rubato intro)
#
# grid.json: {"slot_s": median slot, "per_bar": N, "sub": K, "phase": p,
#             "slots": [t...],           # tracked slot times (seconds)
#             "bars": [[t0, t1], ...]}   # bar start/end, bar 1 = first full bar after phase
# Prints the bass score of each phase per 20 s window: a window whose best phase differs from
# the global one means the bar line moved there (an odd bar, a pickup, a meter change, or
# the tracker slipped a slot). Check those by eye before trusting the bars.
import argparse
import csv
import json

import librosa
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('wav'); ap.add_argument('notes'); ap.add_argument('out')
ap.add_argument('--slot', type=float, required=True)
ap.add_argument('--per-bar', type=int, required=True)
ap.add_argument('--sub', type=int, default=1)
ap.add_argument('--bass-max', type=int, default=50)
ap.add_argument('--start', type=float, default=0.0)
ap.add_argument('--end', type=float, default=1e9)
a = ap.parse_args()

HOP = 256
y, sr = librosa.load(a.wav, sr=22050, mono=True)
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
t_env = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=HOP)
m = (t_env >= a.start) & (t_env <= a.end)
env = np.where(m, env, 0)
_, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP,
                                   bpm=60 / a.slot, tightness=400, trim=True)
slots = librosa.frames_to_time(beats, sr=sr, hop_length=HOP)
slots = slots[(slots >= a.start - 0.05) & (slots <= a.end)]

notes = [(float(r[0]), int(r[2]), float(r[3])) for r in csv.reader(open(a.notes))]
bass = np.array([(t, amp) for t, mid, amp in notes if mid <= a.bass_max])


def slot_bass(i):
    """bass amplitude starting within 40% of a slot around slot i"""
    w = 0.4 * np.median(np.diff(slots))
    if not len(bass):
        return 0.0
    near = np.abs(bass[:, 0] - slots[i]) < w
    return float(bass[near, 1].sum())


sb = np.array([slot_bass(i) for i in range(len(slots))])
N = a.per_bar
score = [sb[p::N].sum() for p in range(N)]
phase = int(np.argmax(score))
print(f'slots {len(slots)}  median slot {np.median(np.diff(slots)):.4f}s '
      f'(= {60 / np.median(np.diff(slots)):.1f}/min)  bass score per phase {np.round(score, 1)} -> phase {phase}')
print('window  local-best-phase  slot_s   scores')
for w0 in np.arange(slots[0], slots[-1], 20):
    idx = np.where((slots >= w0) & (slots < w0 + 20))[0]
    if len(idx) < N:
        continue
    sc = [sb[idx][(idx % N) == p].sum() for p in range(N)]
    best = int(np.argmax(sc))
    flag = '' if best == phase else '  <-- moved'
    print(f'{w0:6.1f}s  {best}  {np.median(np.diff(slots[idx])):.4f}  {np.round(sc, 1)}{flag}')

bars = [[float(slots[i]), float(slots[i + N])] for i in range(phase, len(slots) - N, N)]
sub = []
for i in range(len(slots) - 1):
    sub += list(np.linspace(slots[i], slots[i + 1], a.sub, endpoint=False))
json.dump({'slot_s': float(np.median(np.diff(slots))), 'per_bar': N, 'sub': a.sub, 'phase': phase,
           'slots': [round(float(s), 4) for s in slots], 'subslots': [round(float(s), 4) for s in sub],
           'bars': [[round(b0, 4), round(b1, 4)] for b0, b1 in bars]}, open(a.out, 'w'))
print(f'{len(bars)} bars -> {a.out}')
