# Strum or pluck, and strum direction, per grid slot, from the guitar stem. Use it to tell a
# strummed part from a pinched/plucked one: mostly '=' means pinch (bass + treble together).
# The D/U split is a hint, not ground truth: strum direction detection is unreliable (an
# up-strum often hits only strings 1-3, so the low band has no onset and the slot is skipped).
# For each slot, finds the onset peak (within +-70 ms) in a low band (75-260 Hz, strings 6-4)
# and a high band (290-1300 Hz fundamentals of strings 3-1); lag = t_high - t_low.
#   lag > +8 ms: low strings first = downstroke; lag < -8 ms: upstroke;
#   |lag| <= 8 ms: simultaneous = pinch/pluck (or a strum too fast to tell).
# Only slots with an onset in both bands are measured.
# usage: strumdir.py <guitar.wav> <grid.json> [--bars 1-20] [--min .25] [--quiet]
#   --quiet: only the per-slot summary. Prints per bar a row of slot cells: D/U/= plus the lag in ms, then a summary per slot
#   position (share of D/U/= over all bars), which is the strumming pattern if one exists.
import argparse, json
import librosa, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('wav'); ap.add_argument('grid')
ap.add_argument('--bars'); ap.add_argument('--min', type=float, default=.25); ap.add_argument('--quiet', action='store_true')
a = ap.parse_args()
sr, HOP = 22050, 32
y, _ = librosa.load(a.wav, sr=sr, mono=True)
S = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP)); f = librosa.fft_frequencies(sr=sr, n_fft=1024)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=HOP)
def env(lo, hi):
    e = np.log1p(10 * S[(f >= lo) & (f < hi)].sum(0)); d = np.maximum(0, np.diff(e, prepend=e[0]))
    d = np.convolve(d, np.ones(5) / 5, 'same'); return d / np.percentile(d, 99.5)
lo_e, hi_e = env(75, 260), env(290, 1300)
g = json.load(open(a.grid)); N = g['per_bar']; slots = g['slots'][g['phase']:]
b0, b1 = map(int, a.bars.split('-')) if a.bars else (1, len(g['bars']))
summary = [[0, 0, 0] for _ in range(N)]
rows = []
for bi in range(len(g['bars'])):
    cells = []
    for s in range(N):
        j = bi * N + s
        if j >= len(slots): break
        m = (t >= slots[j] - .07) & (t < slots[j] + .07)
        if not m.any(): cells.append('  .   '); continue
        il, ih = np.argmax(lo_e[m]), np.argmax(hi_e[m])
        if lo_e[m][il] < a.min or hi_e[m][ih] < a.min: cells.append('  .   '); continue
        lag = 1000 * (t[m][ih] - t[m][il])
        k = 0 if lag > 8 else (1 if lag < -8 else 2)
        summary[s][k] += 1
        cells.append(f'{"DU="[k]}{lag:+4.0f}ms')
    if b0 <= bi + 1 <= b1 and not a.quiet:
        print(f'{bi + 1:4d} ' + ' '.join(cells))
print('per slot position: D/U/= counts')
for s in range(N):
    print(f'  slot {s}: D {summary[s][0]:3d}  U {summary[s][1]:3d}  = {summary[s][2]:3d}')
