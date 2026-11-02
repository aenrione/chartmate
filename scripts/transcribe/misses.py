# List clearly heard notes (quant.json, amp >= --clear, not voice bleed) that the score lacks at
# that bar/slot, per bar, and the most-missed pitches overall. The misses view selfcheck.py
# lacks (it only gives counts): a pitch missed in many bars of one figure belongs in the figure. Slot match is exact on the quantized slot (+-1 with --loose).
# usage: misses.py <score.json> <quant.json> --bars 1-10 [--clear .5] [--loose] [--slot 8]
#   score.json: fingering.py output (notes carry "midi"), before or after annotate-score.py.
#   --slot      the slot's note value (8 = eighth slots, 16 = sixteenth); beat durations are
#               converted to slots with it (a "t" triplet beat counts 2/3).
import argparse, json
N = 'C C# D D# E F F# G G# A A# B'.split(); nm = lambda m: f'{N[m % 12]}{m // 12 - 1}'
ap = argparse.ArgumentParser(); ap.add_argument('score'); ap.add_argument('quant'); ap.add_argument('--bars', required=True)
ap.add_argument('--clear', type=float, default=.5); ap.add_argument('--loose', action='store_true')
ap.add_argument('--slot', type=int, default=8)
a = ap.parse_args()


def slots_of(d):
    base, dots = d.rstrip('.t'), d.count('.')
    return a.slot / int(base) * (2 - 0.5 ** dots) * (2 / 3 if d.endswith('t') else 1)


sc = json.load(open(a.score)); q = json.load(open(a.quant))['bars']
lo, hi = map(int, a.bars.split('-'))
tot = {}
for b in range(lo, min(hi, len(sc['bars']), len(q)) + 1):
    have, pos = {}, 0
    for be in sc['bars'][b - 1]['beats']:
        for n in be['notes']:
            if not n.get('tie'): have.setdefault(pos, set()).add(n['midi'])
        pos += slots_of(be['duration'])
    heard = [(n['slot'], n['midi']) for n in q[b - 1]['notes'] if n['amp'] >= a.clear and not n['vocal']]
    miss = [(s, m) for s, m in heard if not any(m in have.get(s + d, ()) for d in ((-1, 0, 1) if a.loose else (0,)))]
    for s, m in miss: tot[nm(m)] = tot.get(nm(m), 0) + 1
    print(f'bar {b:3d} ({sc["bars"][b-1].get("figure", "-"):3}) missed: ' + ' '.join(f'{s}:{nm(m)}' for s, m in sorted(miss)))
print('missed pitches:', sorted(tot.items(), key=lambda x: -x[1]))
