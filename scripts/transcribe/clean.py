# Turn the quantized transcription into a draft score: remove ghosts, then let repetition decide.
#
# usage: clean.py <quant.json> <draft.json> [--figures figures.json] [--min-occ 3]
#                 [--thr .4] [--keep .5] [--max-poly 3] [--vocal-amp .55] [--bars 25-40]
#   quant.json    from quantize.py
#   --figures     from figures.py; a bar whose figure has >= --min-occ occurrences gets the
#                 figure's consensus (notes kept in >= --keep of the occurrences, after each
#                 occurrence was cleaned); other bars keep their own cleaned notes
#   --thr         minimum amplitude to count a note at all
#   --max-poly    most notes starting together (the lowest note plus the strongest others).
#                 The default 3 suits arpeggios; for pinched or strummed chords use 5-6, or
#                 real top notes get dropped (No le entregues el poder lost its F#4s and G4s)
#   --vocal-amp   a note quantize.py marked as sung by the voice is dropped below this amplitude
#
# Ghost rules, per bar (onsets are slots; a note "rings" for its dur_slots):
#   - harmonic: m is dropped if m-12 or m-19 (2nd/3rd harmonic) started at the same slot or
#     one slot before, is at least as loud, and is still ringing
#   - duplicate: the same pitch twice in one slot is merged (loudest kept)
#   - vocal bleed: see --vocal-amp
# draft.json: {"per_bar": N, "bars": [{"bar": 1, "figure": "A", "source": "figure"|"bar",
#               "slots": [[midi, ...], ...]}]}  - one list of pitches per slot, low to high
# Prints each bar as slot columns plus a chord guess, so the draft can be read like a lead sheet.
import argparse
import collections
import json

NAMES = 'C C# D D# E F F# G G# A A# B'.split()
QUALITIES = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10),
             'sus4': (0, 5, 7), 'sus2': (0, 2, 7), 'madd9': (0, 2, 3, 7), 'add9': (0, 2, 4, 7), '6': (0, 4, 7, 9)}


def name(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def chord_name(pitches):
    """best chord template for a bag of MIDI pitches; bass = lowest pitch, shown as a slash"""
    if not pitches:
        return '-'
    pcs = collections.Counter(p % 12 for p in pitches)
    bass = min(pitches) % 12
    best, bs = '?', -9
    for root in range(12):
        for q, ivs in QUALITIES.items():
            tones = {(root + i) % 12 for i in ivs}
            s = sum(c for pc, c in pcs.items() if pc in tones) - 1.5 * sum(c for pc, c in pcs.items() if pc not in tones)
            s -= 0.3 * len(ivs) - (0.5 if root == bass else 0)
            if s > bs:
                best, bs = NAMES[root] + q, s
    root = best.rstrip('m7ajsu2469d')
    root = best[:2] if len(best) > 1 and best[1] == '#' else best[:1]
    return best if NAMES.index(root) == bass else f'{best}/{NAMES[bass]}'


def clean_bar(b, a, N):
    ns = [n for n in b['notes'] if n['amp'] >= a.thr and not (n['vocal'] and n['amp'] < a.vocal_amp)]
    keep = []
    for n in ns:
        s, m = n['slot'], n['midi']
        ghost = any(o is not n and o['midi'] in (m - 12, m - 19) and n['slot'] - 1 <= o['slot'] <= s
                    and o['amp'] >= n['amp'] and o['slot'] + o['dur_slots'] > s for o in ns)
        if not ghost:
            keep.append(n)
    slots = []
    for s in range(N):
        best = {}
        for n in keep:
            if n['slot'] == s and n['amp'] > best.get(n['midi'], {'amp': 0})['amp']:
                best[n['midi']] = n
        sel = sorted(best.values(), key=lambda n: n['midi'])
        if len(sel) > a.max_poly:
            low = sel[0]
            rest = sorted(sel[1:], key=lambda n: -n['amp'])[:a.max_poly - 1]
            sel = sorted([low] + rest, key=lambda n: n['midi'])
        slots.append([n['midi'] for n in sel])
    return slots


ap = argparse.ArgumentParser()
ap.add_argument('quant'); ap.add_argument('out')
ap.add_argument('--figures')
ap.add_argument('--min-occ', type=int, default=3)
ap.add_argument('--thr', type=float, default=0.4)
ap.add_argument('--keep', type=float, default=0.5)
ap.add_argument('--max-poly', type=int, default=3)
ap.add_argument('--vocal-amp', type=float, default=0.55)
ap.add_argument('--bars')
a = ap.parse_args()

q = json.load(open(a.quant))
N = q['per_bar']
own = {b['bar']: clean_bar(b, a, N) for b in q['bars']}
labels, members = {}, collections.defaultdict(list)
if a.figures:
    f = json.load(open(a.figures))
    labels = {int(k): v for k, v in f['labels'].items()}
    for bn, lab in labels.items():
        members[lab].append(bn)

consensus = {}
for lab, bns in members.items():
    if len(bns) < a.min_occ:
        continue
    cnt = collections.Counter((s, m) for bn in bns for s, ms in enumerate(own[bn]) for m in ms)
    consensus[lab] = [sorted(m for (ss, m), c in cnt.items() if ss == s and c / len(bns) >= a.keep) for s in range(N)]

out = []
for b in q['bars']:
    lab = labels.get(b['bar'], '')
    src = 'figure' if lab in consensus else 'bar'
    slots = consensus[lab] if src == 'figure' else own[b['bar']]
    out.append({'bar': b['bar'], 't0': b['t0'], 'figure': lab, 'source': src, 'slots': slots})
json.dump({'per_bar': N, 'bars': out}, open(a.out, 'w'), indent=1)

lo, hi = (map(int, a.bars.split('-')) if a.bars else (1, len(out)))
for b in out[lo - 1:hi]:
    half = N // 2
    ch = [chord_name([m for ms in b['slots'][i:i + half] for m in ms]) for i in (0, half)]
    cols = ' | '.join(','.join(name(m) for m in ms) or '.' for ms in b['slots'])
    print(f'{b["bar"]:3d} {b["t0"]:6.1f}s {b["figure"]:>3} {b["source"][0]} {ch[0]:>8} {ch[1]:>8}   {cols}')
