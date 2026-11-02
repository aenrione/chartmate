# Beat/bar grid for a full-band recording, driven by the drum stem instead of the guitar's bass
# notes (grid.py's method, which fails when the guitar strums or the bass guitar owns the low end).
# Tracks the BEAT (e.g. the dotted quarter of 6/8) on the drum stem with a loose tempo prior,
# so a drifting tempo is followed; splits each beat into --slots-per-beat equal slots; picks the
# bar phase from the kick (30-150 Hz onsets), so bar 1 starts on a kick-heavy beat.
# Writes the same grid.json format as scripts/transcribe/grid.py, so quantize.py,
# selfcheck.py etc. work unchanged.
#
# When the tracker slips somewhere, re-track from after the slip and join with gridsplice.py.
# usage: drumgrid.py <drums.wav> <grid.json> --beat SECONDS --beats-per-bar B --slots-per-beat K
#                    [--tightness 100] [--start S] [--end S] [--first-bar T] [--no-trim]
#   --no-trim      keep weak beats at the ends (librosa trims a quiet outro otherwise)
#   --beat         rough beat length (6/8: the dotted quarter, ~3x the eighth)
#   --tightness    librosa beat_track tightness; lower follows tempo changes more freely (default 100)
#   --first-bar T  force the bar line onto the tracked beat nearest T seconds (overrides the kick vote)
#   --start/--end  only track within this range (e.g. skip a drumless intro)
# Prints the tempo per 20 s window and the kick/snare weight at each beat-in-bar position per
# window; a window whose kick peak moves to another position means an odd bar or a slip.
import argparse, json
import librosa, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('wav'); ap.add_argument('out')
ap.add_argument('--beat', type=float, required=True); ap.add_argument('--beats-per-bar', type=int, required=True)
ap.add_argument('--slots-per-beat', type=int, required=True); ap.add_argument('--tightness', type=float, default=100)
ap.add_argument('--start', type=float, default=0); ap.add_argument('--end', type=float, default=1e9)
ap.add_argument("--first-bar", type=float); ap.add_argument("--no-trim", action="store_true")
a = ap.parse_args()
HOP = 256
y, sr = librosa.load(a.wav, sr=22050, mono=True)
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
te = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=HOP)
env = np.where((te >= a.start) & (te <= a.end), env, 0)
_, bf = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, bpm=60 / a.beat, tightness=a.tightness, trim=not a.no_trim)
beats = librosa.frames_to_time(bf, sr=sr, hop_length=HOP)
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)); f = librosa.fft_frequencies(sr=sr, n_fft=2048)
def band(lo, hi):
    e = np.log1p(S[(f >= lo) & (f < hi)].sum(0)); d = np.maximum(0, np.diff(e, prepend=e[0])); return d / d.max()
kick, snare = band(30, 150), band(1500, 5000)
def at(sig, x):
    w = 0.12 * np.median(np.diff(beats)); return sig[(te >= x - w) & (te < x + w)].max(initial=0)
K = np.array([at(kick, b) for b in beats]); Sn = np.array([at(snare, b) for b in beats])
B = a.beats_per_bar
if a.first_bar is not None:
    phase = int(np.argmin(np.abs(beats - a.first_bar))) % B
else:
    phase = int(np.argmax([K[p::B].sum() - 0.5 * Sn[p::B].sum() for p in range(B)]))
print(f'{len(beats)} beats, median {np.median(np.diff(beats)):.3f}s, phase {phase}')
print('window   beat_s  bpm(beat)  kick per position | snare per position')
for w0 in np.arange(beats[0], beats[-1], 20):
    idx = np.where((beats >= w0) & (beats < w0 + 20))[0]
    if len(idx) < 2 * B: continue
    k = [K[idx[(idx - phase) % B == p]].mean() for p in range(B)]; s = [Sn[idx[(idx - phase) % B == p]].mean() for p in range(B)]
    d = np.median(np.diff(beats[idx]))
    flag = '' if int(np.argmax(k)) == 0 else '  <-- kick peak moved'
    print(f'{w0:6.1f}s  {d:.3f}  {60 / d:6.1f}   ' + ' '.join(f'{v:.2f}' for v in k) + ' | ' + ' '.join(f'{v:.2f}' for v in s) + flag)
Kp = a.slots_per_beat
slots = []
for i in range(len(beats) - 1):
    slots += list(np.linspace(beats[i], beats[i + 1], Kp, endpoint=False))
slots.append(beats[-1])
slots = np.array(slots)
N = B * Kp
sp = phase * Kp
bars = [[float(slots[i]), float(slots[i + N])] for i in range(sp, len(slots) - N, N)]
json.dump({'slot_s': float(np.median(np.diff(slots))), 'per_bar': N, 'sub': 1, 'phase': sp,
           'slots': [round(float(s), 4) for s in slots], 'beats': [round(float(b), 4) for b in beats],
           'bars': [[round(b0, 4), round(b1, 4)] for b0, b1 in bars]}, open(a.out, 'w'))
print(f'{len(bars)} bars of {N} slots, first at {bars[0][0]:.2f}s -> {a.out}')
