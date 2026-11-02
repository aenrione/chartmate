# Fold kick and snare onsets from the Demucs drum stem onto a slot grid (grid.py or
# drumgrid.py), to confirm the meter and the bar phase in a full-band recording. A guitar accent
# is not the meter: in 3/4 counted in eighths the drums hit slots 0, 2 and 4; in 6/8, 0 and 3.
# Kick = onset strength in 30-150 Hz, snare = 1.5-5 kHz; each is summed per slot position mod P.
# usage: drumfold.py <drums.wav> <grid.json> [--period 6,12] [--win 30]
#   Prints, per period P, the kick and snare weight at each position, globally and per --win
#   seconds (0 = global only). Positions count from the grid's first slot, not from bar 1.
#   In 6/8 rock: kick on 0, snare on 3. In 12/8: snare on 3 and 9.
import argparse, json
import librosa, numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('wav'); ap.add_argument('grid')
ap.add_argument('--period', default='6,12'); ap.add_argument('--win', type=float, default=30)
a = ap.parse_args()
HOP = 256
y, sr = librosa.load(a.wav, sr=22050, mono=True)
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
def band(lo, hi):
    e = np.log1p(S[(f >= lo) & (f < hi)].sum(0)); d = np.maximum(0, np.diff(e, prepend=e[0])); return d / d.max()
kick, snare = band(30, 150), band(1500, 5000)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=HOP)
slots = np.array(json.load(open(a.grid))['slots'])
def at(sig, ts):
    w = 0.3 * np.median(np.diff(slots))
    return np.array([sig[(t >= x - w) & (t < x + w)].max(initial=0) for x in ts])
K, Sn = at(kick, slots), at(snare, slots)
for P in map(int, a.period.split(',')):
    print(f'period {P} (position = slot index mod {P}, slot 0 = first tracked slot {slots[0]:.2f}s)')
    wins = [('all ', np.ones(len(slots), bool))]
    if a.win > 0:
        wins += [(f'{lo:4.0f}s', (slots >= lo) & (slots < lo + a.win)) for lo in np.arange(0, slots[-1], a.win)]
    for lab, m in wins:
        idx = np.where(m)[0]
        if len(idx) < P:
            continue
        k = [K[idx[idx % P == p]].mean() for p in range(P)]; s = [Sn[idx[idx % P == p]].mean() for p in range(P)]
        print(f'  {lab} kick ' + ' '.join(f'{v:.2f}' for v in k) + '  | snare ' + ' '.join(f'{v:.2f}' for v in s))
