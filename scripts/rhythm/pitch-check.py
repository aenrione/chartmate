# Flag tab notes the recording disagrees with: likely tab errors (ASCII tabs have plenty).
# For each tab beat, looks at every place align.py matched it and counts how often each tab
# pitch was heard, and which other pitch was heard instead.
# usage: pitch-check.py <notes.csv> <beats.json> <align.json> [min_occurrences=2]
#
# A flag is evidence, not a verdict: basic-pitch is weak on low notes and on notes that ring
# under others. Listen at the printed timestamps, then fix the fret only when the recording is
# unambiguous (and say so in your report).
import csv
import json
import sys
from collections import Counter, defaultdict

NAMES = 'C C# D Eb E F F# G Ab A Bb B'.split()
name = lambda m: f'{NAMES[m % 12]}{m // 12 - 1}'

notes_csv, beats_json, align_json = sys.argv[1:4]
MIN_OCC = int(sys.argv[4]) if len(sys.argv) > 4 else 2
rows = [(float(a), float(b), int(c), float(d)) for a, b, c, d in csv.reader(open(notes_csv))]
beats = json.load(open(beats_json))
aligned = json.load(open(align_json))

# all pitches sounding within ±60 ms of each aligned event (the event itself may group a few)
heard = defaultdict(list)  # beat index -> [(time, set of pitches)]
for ev in aligned:
    if ev['k'] is None:
        continue
    ps = {r[2] for r in rows if abs(r[0] - ev['t']) <= 0.06 and r[3] >= 0.3}
    heard[ev['k']].append((ev['t'], ps))

flagged = 0
for k, b in enumerate(beats):
    occ = heard.get(k, [])
    if len(occ) < MIN_OCC:
        continue
    for n in b['notes']:
        hits = sum(1 for _, ps in occ if n['midi'] in ps or any(abs(p - n['midi']) == 12 for p in ps))
        if hits / len(occ) >= 0.5:
            continue
        # Only a nearby fret on the same string counts: that's what a tab typo looks like.
        # Anything further away is another voice or string ringing, not evidence.
        others = Counter(p for _, ps in occ for p in ps
                         if p not in {x['midi'] for x in b['notes']}
                         and 0 < abs(p - n['midi']) <= 4 and n['fret'] + p - n['midi'] >= 0)
        alt, alt_n = others.most_common(1)[0] if others else (None, 0)
        if alt is None or alt_n / len(occ) < 0.5:
            continue
        flagged += 1
        diff = alt - n['midi']
        print(f"bar {b['bar']} beat {b['beat']} line {n['line']} fret {n['fret']} ({name(n['midi'])}): "
              f"heard in {hits}/{len(occ)}; {name(alt)} heard in {alt_n}/{len(occ)} "
              f"(→ fret {n['fret'] + diff} on the same string?) at "
              + ', '.join(f'{t:.2f}s' for t, _ in occ[:6]))
print(f'{flagged} suspect note(s)')
