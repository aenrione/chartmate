# Transcribe a (guitar) stem to note events with basic-pitch.
# usage: transcribe.py <stem.wav> <notes.csv>
# notes.csv rows: onset_s, offset_s, midi, amplitude — sorted by onset.
import csv
import sys

# basic-pitch still calls scipy.signal.gaussian, which newer scipy moved to scipy.signal.windows.
import scipy.signal
import scipy.signal.windows
scipy.signal.gaussian = scipy.signal.windows.gaussian

import os

from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import predict

# The default model is the TensorFlow one; the ONNX copy next to it runs without TF.
MODEL = os.path.join(os.path.dirname(ICASSP_2022_MODEL_PATH), 'nmp.onnx')

wav, out = sys.argv[1], sys.argv[2]
_, _, notes = predict(wav, MODEL, onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=40)
with open(out, 'w') as f:
    w = csv.writer(f)
    for start, end, pitch, amp, _ in sorted(notes, key=lambda n: n[0]):
        w.writerow([round(start, 3), round(end, 3), pitch, round(float(amp), 3)])
print(len(notes), 'notes ->', out)
