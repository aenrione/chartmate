# RMS (dB) of each Demucs stem per window, to see which instruments play where. Run it first
# (prepare.sh does): drums with content mean a full band, so build the grid from the drums
# (drumgrid.py); grid.py needs the guitar's bass notes to mark the bar at a steady tempo;
# vocals near silent marks instrumental bars; a guitar stem near silent where the "piano" or
# "other" stem is loud means Demucs put the guitar there.
# usage: stem-energy.py <stems-dir> [--win 5] [--summary]
#   stems-dir     e.g. $WORK/stems/htdemucs_6s/audio
#   --summary     one line per stem (median and 90th-percentile dB, share of windows above -40 dB)
#                 instead of the per-window table, plus which grid tool to use
import argparse
import glob
import os

import librosa
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--win', type=float, default=5.0)
ap.add_argument('--summary', action='store_true')
a = ap.parse_args()
rows = {}
for p in sorted(glob.glob(os.path.join(a.dir, '*.wav'))):
    y, sr = librosa.load(p, sr=11025, mono=True)
    n = int(a.win * sr)
    rows[os.path.basename(p)[:-4]] = [20 * np.log10(np.sqrt(np.mean(y[i:i + n] ** 2)) + 1e-6) for i in range(0, len(y), n)]
if not rows:
    raise SystemExit(f'no .wav stems in {a.dir}')
if a.summary:
    for k, v in rows.items():
        v = np.array(v)
        print(f'{k:8s} median {np.median(v):6.1f} dB  p90 {np.percentile(v, 90):6.1f} dB  active {np.mean(v > -40):4.0%}')
    drums = np.array(rows.get('drums', [-99]))
    if np.mean(drums > -40) >= 0.5:
        print('=> drums through most of it: grid from the drums (drumgrid.py, follows tempo drift; meter '
              'check with drumfold.py). grid.py also works if the guitar picks a steady bass at a steady tempo')
    else:
        print('=> no steady drums: grid from the guitar (grid.py)')
else:
    print('t     ' + ' '.join(f'{k[:6]:>7}' for k in rows))
    for i in range(len(next(iter(rows.values())))):
        print(f'{i * a.win:5.0f} ' + ' '.join(f'{v[i]:7.1f}' for v in rows.values()))
