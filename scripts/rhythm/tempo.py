# Global and windowed (20 s) tempo estimates, plus the strongest periodicities per window.
# usage: tempo.py <audio.wav>
# Treat this as a hint: confirm the beat unit by fitting a grid to a well-known bar (fit.py).
import sys

import librosa
import numpy as np

HOP = 256
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
tempo, _ = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP)
print('global tempo', np.round(tempo, 1))

win = int(20 * sr / HOP)
for st in range(0, len(env) - win // 2, win // 2):
    seg = env[st:st + win]
    t = librosa.feature.tempo(onset_envelope=seg, sr=sr, hop_length=HOP, aggregate=None)
    acf = librosa.autocorrelate(seg - seg.mean())
    lags = np.arange(len(acf)) * HOP / sr
    m = (lags > 0.15) & (lags < 2.5)
    peaks = []
    for lag in lags[m][np.argsort(acf[m])[::-1]]:
        if all(abs(lag - p) > 0.05 for p in peaks):
            peaks.append(lag)
        if len(peaks) == 5:
            break
    print(f'{st * HOP / sr:6.1f}s tempo~{float(np.median(t)):6.1f} periods(s): {[round(p, 3) for p in peaks]}')
