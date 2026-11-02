# Check whether two audio files are the same recording (e.g. an age-gated video vs the artist's
# own upload): cross-correlation of their onset-strength envelopes gives the offset, and the
# normalized peak says how well they line up. The same recording scores well above a different
# take or a live version; compare against a known-different track if unsure.
# usage: xcorr.py <a.wav> <b.wav>
import sys
import librosa
import numpy as np
HOP = 512
def feat(p):
    y, sr = librosa.load(p, sr=22050, mono=True)
    return y, librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
ya, ea = feat(sys.argv[1]); yb, eb = feat(sys.argv[2])
ea = (ea - ea.mean()) / ea.std(); eb = (eb - eb.mean()) / eb.std()
c = np.correlate(ea, eb, 'full')
lag = int(np.argmax(c)) - (len(eb) - 1)
n = min(len(ea), len(eb))
r = c.max() / n
print(f'durations {len(ya)/22050:.1f}s {len(yb)/22050:.1f}s; best offset a-b = {lag*HOP/22050:+.2f}s; normalized peak {r:.2f}')
