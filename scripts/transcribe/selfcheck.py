# Compare a score against the transcription it came from: per section, how much of what is
# clearly heard the score has (coverage), and how much of the score the audio confirms.
#
# usage: selfcheck.py <score.json> <grid.json> <notes.csv> [--clear .5] [--any .3] [--tol .6]
#                     [--vocals vocal-notes.csv] [--bars-csv out.csv]
#   score.json  from fingering.py (string/fret per note; pitch = tuning[string-1] + fret)
#   grid.json   from grid.py; bar k of the score starts at grid bar k. Bars past the grid
#               (a rubato ending) are skipped and reported as such.
#   --clear     amplitude for an audio note to count as "clearly heard" (default .5)
#   --any       lowest amplitude that still confirms a score note (default .3)
#   --tol       onset tolerance in grid slots (default .6)
#   --vocals    drop "clear" audio notes that the voice is singing at the time (likely bleed)
#
# Clear audio notes also exclude harmonic ghosts: a note 12 or 19 semitones above a louder
# note that started within one slot before it and is still sounding.
# Columns: coverage = clear audio notes matched by a score note of the same pitch;
#   +oct = additionally matched only by pitch class (octave error); confirmed = score notes
#   with any audio note of the same pitch nearby; unmatched = score notes with none.
# Counts only: misses.py lists WHICH heard notes a bar lacks. Strummed sections built from chord
# shapes typically confirm only 60-70% (Te vas de mí), against 92% for the picked Luz de rabia.
import argparse
import bisect
import collections
import csv
import json

ap = argparse.ArgumentParser()
ap.add_argument('score'); ap.add_argument('grid'); ap.add_argument('notes')
ap.add_argument('--clear', type=float, default=0.5)
ap.add_argument('--any', type=float, default=0.3)
ap.add_argument('--tol', type=float, default=0.6)
ap.add_argument('--vocals')
ap.add_argument('--bars-csv')
a = ap.parse_args()

sc = json.load(open(a.score))
g = json.load(open(a.grid))
slot = g['slot_s']
DUR = {'1': 32, '2': 16, '4': 8, '8': 4, '16': 2, '32': 1}  # in 32nds


def length32(tok):
    base = DUR[tok.rstrip('.t')]
    d = tok.count('.')
    v = base * (2 - 0.5 ** d)
    return v * 2 / 3 if tok.endswith('t') else v


# score notes -> (time, midi, bar)
snotes, section_of, sec = [], {}, ''
for i, bar in enumerate(sc['bars']):
    sec = bar.get('section', sec)
    section_of[i + 1] = sec
    if i >= len(g['bars']):
        continue
    t0 = g['bars'][i][0]
    pos = 0.0
    for be in bar['beats']:
        for n in be['notes']:
            if not n.get('tie'):
                snotes.append((t0 + pos / 4 * slot, sc['tuning'][n['string'] - 1] + n['fret'], i + 1))
        pos += length32(be['duration'])
last_t = g['bars'][min(len(sc['bars']), len(g['bars'])) - 1][1]
first_t = g['bars'][0][0]

audio = [(float(r[0]), float(r[1]), int(r[2]), float(r[3])) for r in csv.reader(open(a.notes))]
audio = [x for x in audio if first_t - slot / 2 <= x[0] < last_t - slot / 2]
voc = [(float(r[0]), float(r[1]), int(r[2])) for r in csv.reader(open(a.vocals))] if a.vocals else []


def ghost(x):
    on, off, m, amp = x
    return any(o[2] in (m - 12, m - 19) and on - slot * 1.1 <= o[0] <= on + 0.03 and o[3] >= amp and o[1] > on
               for o in audio if o is not x)


def sung(x):
    return any(vm == x[2] and vs < x[1] and ve > x[0] for vs, ve, vm in voc)


clear = [x for x in audio if x[3] >= a.clear and not ghost(x) and not sung(x)]
anyn = [x for x in audio if x[3] >= a.any]
tol = a.tol * slot
by_t = sorted(snotes)
times = [s[0] for s in by_t]


def near(t, items_t):
    lo = bisect.bisect_left(items_t, t - tol)
    hi = bisect.bisect_right(items_t, t + tol)
    return range(lo, hi)


def bar_of(t):
    k = bisect.bisect_right([b[0] for b in g['bars']], t) - 1
    return k + 1


stat = collections.defaultdict(lambda: collections.Counter())
for x in clear:
    b = bar_of(x[0])
    s = section_of.get(b, '?')
    cands = [by_t[i] for i in near(x[0], times)]
    st = stat[s]
    st['clear'] += 1
    if any(c[1] == x[2] for c in cands):
        st['hit'] += 1
    elif any(c[1] % 12 == x[2] % 12 for c in cands):
        st['oct'] += 1
    stat[b]['clear'] += 1
    stat[b]['hit'] += any(c[1] == x[2] for c in cands)

a_sorted = sorted(anyn)
a_times = [x[0] for x in a_sorted]
for t, m, b in snotes:
    s = section_of[b]
    stat[s]['score'] += 1
    stat[b]['score'] += 1
    ok = any(a_sorted[i][2] == m for i in near(t, a_times))
    stat[s]['conf'] += ok
    stat[b]['conf'] += ok

order = list(dict.fromkeys(section_of[b] for b in sorted(section_of)))
print(f'{"section":28} {"bars":>7} {"clear":>5} {"coverage":>8} {"+oct":>5} {"score":>5} {"confirmed":>9} {"unmatched":>9}')
tot = collections.Counter()
for s in order:
    bars = [b for b in section_of if section_of[b] == s]
    st = stat[s]
    tot.update(st)
    rng = f'{min(bars)}-{max(bars)}'
    if min(bars) > len(g['bars']):
        print(f'{s:28} {rng:>7}  (past the grid: not checked)')
        continue
    print(f'{s:28} {rng:>7} {st["clear"]:5d} {st["hit"] / max(st["clear"], 1):8.0%} {st["oct"] / max(st["clear"], 1):5.0%} '
          f'{st["score"]:5d} {st["conf"] / max(st["score"], 1):9.0%} {st["score"] - st["conf"]:9d}')
print(f'{"ALL":28} {"":>7} {tot["clear"]:5d} {tot["hit"] / tot["clear"]:8.0%} {tot["oct"] / tot["clear"]:5.0%} '
      f'{tot["score"]:5d} {tot["conf"] / tot["score"]:9.0%} {tot["score"] - tot["conf"]:9d}')
if a.bars_csv:
    with open(a.bars_csv, 'w') as f:
        w = csv.writer(f)
        w.writerow(['bar', 'section', 'clear', 'covered', 'score_notes', 'confirmed'])
        for b in sorted(k for k in section_of if k <= len(g['bars'])):
            st = stat[b]
            w.writerow([b, section_of[b], st['clear'], st['hit'], st['score'], st['conf']])
