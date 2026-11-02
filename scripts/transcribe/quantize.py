# Snap transcribed note onsets to a bar/slot grid and print a readable per-bar roll.
#
# usage: quantize.py <notes.csv> <grid.json> <quant.json> [--vocals vocal-notes.csv]
#                    [--min-amp A] [--bars 1-20] [--quiet]
#   notes.csv   basic-pitch output (onset_s, offset_s, midi, amplitude)
#   grid.json   from grid.py
#   --vocals    basic-pitch run on the vocal stem; a guitar note whose pitch the voice is
#               singing at that moment (same MIDI, overlapping in time) is marked "v" and
#               kept in quant.json with "vocal": true, since stem bleed is the likeliest cause
#   --min-amp   drop notes quieter than this from the printout (all are kept in quant.json)
#
# quant.json: {"bars": [{"bar": 1, "t0": .., "t1": .., "notes": [
#                {"slot": 0, "off": -0.05, "midi": 40, "amp": .5, "dur_slots": 7.6, "vocal": false}]}]}
#   off = onset distance from the slot in slots (-0.5..0.5). A cluster of offsets near +-0.5
#   or +-0.33 across bars means the grid needs subdivisions (16ths / triplets).
# Printout: one line per slot, "pitch(amp)" with the amplitude x10, strongest first.
import argparse
import bisect
import csv
import json

import numpy as np

NAMES = 'C C# D D# E F F# G G# A A# B'.split()


def name(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


ap = argparse.ArgumentParser()
ap.add_argument('notes'); ap.add_argument('grid'); ap.add_argument('out')
ap.add_argument('--vocals')
ap.add_argument('--min-amp', type=float, default=0.3)
ap.add_argument('--bars')
ap.add_argument('--quiet', action='store_true')
a = ap.parse_args()

g = json.load(open(a.grid))
N = g['per_bar']
slots = g['slots'][g['phase']:]
slot_s = g['slot_s']
notes = [(float(r[0]), float(r[1]), int(r[2]), float(r[3])) for r in csv.reader(open(a.notes))]
voc = [(float(r[0]), float(r[1]), int(r[2])) for r in csv.reader(open(a.vocals))] if a.vocals else []

bars = [{'bar': i + 1, 't0': b0, 't1': b1, 'notes': []} for i, (b0, b1) in enumerate(g['bars'])]
offs = []
for on, off, mid, amp in notes:
    k = bisect.bisect_left(slots, on)
    cand = [j for j in (k - 1, k) if 0 <= j < len(slots)]
    if not cand:
        continue
    j = min(cand, key=lambda j: abs(slots[j] - on))
    bi, si = divmod(j, N)
    if bi >= len(bars):
        continue
    o = (on - slots[j]) / slot_s
    offs.append(o)
    vocal = any(vm == mid and vs < off and ve > on for vs, ve, vm in voc)
    bars[bi]['notes'].append({'slot': si, 'off': round(o, 2), 'midi': mid, 'amp': amp,
                              'dur_slots': round((off - on) / slot_s, 2), 'vocal': vocal})

json.dump({'per_bar': N, 'slot_s': slot_s, 'bars': bars}, open(a.out, 'w'))
h, e = np.histogram(offs, bins=10, range=(-0.5, 0.5))
print('onset offset from slot (slots):', ' '.join(f'{e[i]:+.1f}:{h[i]}' for i in range(10)))
if a.quiet:
    raise SystemExit
lo, hi = (map(int, a.bars.split('-')) if a.bars else (1, len(bars)))
for b in bars[lo - 1:hi]:
    print(f'--- bar {b["bar"]}  {b["t0"]:.2f}s')
    for s in range(N):
        ns = sorted((n for n in b['notes'] if n['slot'] == s and n['amp'] >= a.min_amp), key=lambda n: -n['amp'])
        print(f'  {s}: ' + ' '.join(f'{name(n["midi"])}({n["amp"] * 10:.0f}{"v" if n["vocal"] else ""})' for n in ns))
