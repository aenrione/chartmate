# Expand an arrangement (figures of pitches per slot + a bar map) into a score with string/fret
# for every note, chosen by dynamic programming over all playable positions.
#
# usage: fingering.py <arrangement.json> <score.json> [--max-fret 12] [--print]
#
# arrangement.json:
#   {"title", "artist", "tempo" (quarter BPM), "timeSignature": [6, 8], "slotsPerBar": 6,
#    "slotDuration": "8", "tuning": ["E4", ..., "E2"] (string 1 first), "capo": 0,
#    "figures": {"A": [["E2", "G3"], ["E4"], [], ...]},   # one pitch list per slot
#    "bars": ["A", "B", {"beats": [{"duration": "2.", "notes": ["E2", {"pitch": "E5",
#             "string": 1, "fret": 12, "harmonic": true}]}], "fermata": true}, ...],
#    "sections": {"1": "Intro", ...}}
#   A bar is a figure name, or an explicit {"beats": [...]} for one-off bars (rubato endings).
#   An explicit beat may also carry "chord", "stroke", "brush", "pickStroke" (see build-gp.ts).
#   A note can pin its string/fret ({"pitch", "string", "fret"}); the DP then keeps it.
#   Empty slots extend the previous beat (8 -> 4 -> 4.; in a simple meter such as 3/4 also
#   4 slots -> 2) without crossing the middle of a compound bar; what can't be merged becomes
#   a tied copy of the previous beat.
#
# Strummed and named chords (optional):
#   "shapes": {"G": "320033", "D/A": "x00232"}   frets string 6 -> 1, x = muted
#                                                (comma-separated if a fret is >= 10)
#   A figure slot may be a strum token instead of a pitch list: "G:D" (down, every string of
#   the shape), "G:U:1-3" (up, strings 1-3 only), "C/G:D:3-6". Its notes are pinned to the
#   shape (the DP keeps them), don't let ring, and the beat gets "stroke" and "chord".
#   Append "x" to the direction for a muted stroke: "G:Dx" is a dead-note chuck (printed as x
#   on every string of the stroke), "G:Ux:1-3" the same on strings 1-3. Use it for the strokes
#   the hand damps; a stroke the hand skips entirely is an empty slot, not a token.
#   Append "!" for an accented stroke and "!!" for a heavy one ("G:U!:1-5", "G:D!!"): the beat
#   gets "accent" and build-gp.ts marks every note of it. GP7 has only these two levels, so
#   quantise: accent the slots that measure louder in most bars, heavy only the one that is
#   loudest on every measure you have. "!" combines with "x" ("G:Dx!").
#   A figure may be {"chords": {"0": "Bm7", "3": "A#m7"}, "slots": [...]} to name the chords of
#   a picked figure (slot -> name). Chord names are written only where they change.
#   With "shapes", score.json gets "chords" (the diagrams build-gp.ts draws).
#
# score.json (what build-gp.ts reads):
#   {"title", "artist", "tempo", "chords"?, "tuning": [MIDI string 1..6], "capo",
#    "bars": [{"timeSignature": [6, 8], "section": "Intro"?, "fermata"?, "figure"?,
#              "beats": [{"duration": "8", "chord"?, "stroke"?, "notes": [{"string": 6,
#                          "fret": 0, "midi": 40, "tie"?: true, "harmonic"?: true,
#                          "letRing"?: false}]}]}]}
#
# DP cost (lower is better), per chord: each fretted note 1 + 0.1*fret; open strings 0.
# Frets above 5 cost 0.2 more per fret (first position, as a classical player would choose).
# Transition: the hand covers a 4-fret window and pays the distance it has to move when a
# chord falls outside it; a note on a string that is still ringing from the last two slots costs 0.6
# (arpeggios should ring across strings); a span over 4 frets inside one chord is not allowed.
import argparse
import itertools
import json

NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(p):
    if isinstance(p, int):
        return p
    n, rest = NAMES[p[0]], p[1:]
    while rest and rest[0] in '#b':
        n += 1 if rest[0] == '#' else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + n


DUR_SLOTS = {1: '8', 2: '4', 3: '4.', 6: '2.'}

ap = argparse.ArgumentParser()
ap.add_argument('arr'); ap.add_argument('out')
ap.add_argument('--max-fret', type=int, default=12)
ap.add_argument('--print', action='store_true')
a = ap.parse_args()
arr = json.load(open(a.arr))
tuning = [midi(p) + arr.get('capo', 0) for p in arr['tuning']]  # string 1..6, sounding pitch of "fret 0"
S = len(tuning)
N = arr['slotsPerBar']
half = N // 2 if arr['timeSignature'][1] == 8 and N % 3 == 0 else N
if half == N:  # simple meter: 4 empty-extended slots make a half note
    DUR_SLOTS = {**DUR_SLOTS, 4: '2'}
SHAPES = arr.get('shapes', {})
BEAT_KEYS = ('chord', 'stroke', 'brush', 'pickStroke', 'accent')


def norm(n):
    if isinstance(n, dict):
        return {'midi': midi(n['pitch']), **{k: v for k, v in n.items() if k != 'pitch'}}
    return {'midi': midi(n)}


def frets_of(shape):
    return shape.split(',') if ',' in shape else list(shape)


def strum(tok):
    """'G:U!:1-3' -> (notes pinned to the shape, stroke, chord name, accent or None)"""
    parts = tok.split(':')
    name, d = parts[0], parts[1].upper()
    bangs = len(d) - len(d.rstrip('!'))
    accent = {1: 'normal', 2: 'heavy'}.get(bangs)
    assert bangs <= 2, f'strum token {tok}: at most "!!"'
    d = d.rstrip('!')
    dead = d.endswith('X')
    d = d.rstrip('X')
    lo, hi = 1, S
    if len(parts) > 2:
        lo, hi = map(int, parts[2].split('-'))
    frets = frets_of(SHAPES[name])
    assert len(frets) == S, f'shape {name} needs {S} frets'
    notes = []
    for i, ch in enumerate(frets):  # i = 0 is the lowest string
        string = S - i
        if ch.strip().lower() == 'x' or not lo <= string <= hi:
            continue
        fret = int(ch)
        n = {'midi': tuning[string - 1] + fret, 'string': string, 'fret': fret, 'letRing': False}
        if dead:
            n['dead'] = True
        notes.append(n)
    return notes, 'down' if d == 'D' else 'up', name, accent


# 1. expand bars into beats: (bar index, duration token, notes, slot-length, tie)
bars = []
for bi, spec in enumerate(arr['bars']):
    bar = {'timeSignature': arr['timeSignature'], 'beats': []}
    if isinstance(spec, dict):
        bar['beats'] = [{'duration': b['duration'], 'notes': [norm(n) for n in b['notes']],
                         **{k: b[k] for k in BEAT_KEYS if k in b}} for b in spec['beats']]
        if spec.get('fermata'):
            bar['fermata'] = True
    else:
        slots = arr['figures'][spec]
        names = {}
        if isinstance(slots, dict):
            names = {int(k): v for k, v in slots.get('chords', {}).items()}
            slots = slots['slots']
        assert len(slots) == N, f'figure {spec} has {len(slots)} slots'
        s = 0
        while s < N:
            extra = {}
            if isinstance(slots[s], str):
                notes, stroke, cname, accent = strum(slots[s])
                extra = {'stroke': stroke, 'chord': cname}
                if accent:
                    extra['accent'] = accent
            else:
                notes = [norm(n) for n in slots[s]]
                if s in names:
                    extra = {'chord': names[s]}
            run = 1
            limit = half - (s % half)  # don't cross the middle of the bar
            while run < limit and not slots[s + run]:
                run += 1
            while run not in DUR_SLOTS:
                run -= 1
            if notes:
                bar['beats'].append({'duration': DUR_SLOTS[run], 'notes': notes, **extra})
            else:  # empty at the start of a half: tie the previous chord over
                prev = bar['beats'][-1]['notes'] if bar['beats'] else (bars[-1]['beats'][-1]['notes'] if bars else [])
                bar['beats'].append({'duration': DUR_SLOTS[run], 'notes': [dict(n, tie=True) for n in prev] if prev else [], 'tieFrom': True})
            s += run
        bar['figure'] = spec
    bars.append(bar)
for k, v in arr.get('sections', {}).items():
    bars[int(k) - 1]['section'] = v


# 2. DP over chords
def options(notes):
    """all string assignments for a chord: tuple of (string, fret) per note"""
    per = []
    for n in notes:
        if 'string' in n:
            per.append([(n['string'], n['fret'])])
            continue
        c = [(s + 1, n['midi'] - tuning[s]) for s in range(S) if 0 <= n['midi'] - tuning[s] <= a.max_fret]
        if not c:
            raise SystemExit(f'pitch {n["midi"]} not playable')
        per.append(c)
    out = []
    for combo in itertools.product(*per):
        strings = [s for s, _ in combo]
        if len(set(strings)) < len(strings):
            continue
        fretted = [f for (s, f), n in zip(combo, notes) if f > 0 and not n.get('harmonic')]
        if fretted and max(fretted) - min(fretted) > 4:
            continue
        out.append(combo)
    return out or [tuple(p[0] for p in per)]


events = [(bi, j) for bi, b in enumerate(bars) for j, be in enumerate(b['beats']) if be['notes'] and not be.get('tieFrom')]


def move(combo, notes, lo):
    """(new hand position, shift cost): the hand covers frets lo..lo+3 and only moves when a
    fretted note falls outside that window"""
    fr = [f for (s, f), n in zip(combo, notes) if f > 0 and not n.get('harmonic')]
    if not fr or (min(fr) >= lo and max(fr) <= lo + 3):
        return lo, 0
    new = min(fr) if min(fr) < lo else max(fr) - 3
    return new, abs(new - lo)


INF = float('inf')
layers = []  # per event: list of (combo, cost, back, handpos)
for ei, (bi, j) in enumerate(events):
    notes = bars[bi]['beats'][j]['notes']
    opts = options(notes)
    local = [sum(0 if f == 0 or n.get('harmonic') else 1 + 0.1 * f + 0.2 * max(0, f - 5) for (s, f), n in zip(c, notes)) for c in opts]
    if not layers:
        layers.append([(c, l + move(c, notes, 1)[1], None, move(c, notes, 1)[0]) for c, l in zip(opts, local)])
        continue
    ringing = [layers[-1]] + ([layers[-2]] if len(layers) > 1 else [])
    cur = []
    for c, l in zip(opts, local):
        best, bk, hp = INF, None, 0
        for pi, (pc, pcost, pback, ph) in enumerate(layers[-1]):
            h, shift = move(c, notes, ph)
            cost = pcost + l + shift
            strings = {s for s, _ in c}
            cost += 0.6 * len(strings & {s for s, _ in pc})
            if len(layers) > 1 and pback is not None:
                cost += 0.3 * len(strings & {s for s, _ in layers[-2][pback][0]})
            if cost < best:
                best, bk, hp = cost, pi, h
        cur.append((c, best, bk, hp))
    layers.append(cur)

k = min(range(len(layers[-1])), key=lambda i: layers[-1][i][1])
for ei in range(len(layers) - 1, -1, -1):
    c, _, back, _ = layers[ei][k]
    bi, j = events[ei]
    for (s, f), n in zip(c, bars[bi]['beats'][j]['notes']):
        n['string'], n['fret'] = s, f
    k = back if back is not None else 0

# tied copies inherit the fingering of the beat they continue
last = []
for b in bars:
    for be in b['beats']:
        if be.get('tieFrom'):
            be['notes'] = [dict(n, tie=True) for n in last]
            del be['tieFrom']
        elif be['notes']:
            last = be['notes']

# show a chord name only where it changes
last_chord = None
for b in bars:
    for be in b['beats']:
        c = be.pop('chord', None)
        if c and c != last_chord:
            be['chord'] = c
            last_chord = c

score = {k: arr[k] for k in ('title', 'artist', 'tempo')}
if SHAPES:
    score['chords'] = dict(SHAPES)
score.update({'tuning': tuning[:], 'capo': arr.get('capo', 0), 'bars': bars})
json.dump(score, open(a.out, 'w'), indent=1)
print(f'{len(bars)} bars, {len(events)} chords -> {a.out}')
if a.print:
    seen = set()
    for i, b in enumerate(bars):
        key = b.get('figure') or f'#{i + 1}'
        if key in seen:
            continue
        seen.add(key)
        print(f'{key:>5} (bar {i + 1}): ' + ' | '.join(
            (be['stroke'][:1].upper() + {'normal': '!', 'heavy': '!!'}.get(be.get('accent'), '') + ' '
             if be.get('stroke') else '') +
            ' '.join(f'{n["string"]}:{n["fret"]}{"~" if n.get("tie") else ""}' for n in be['notes']) + f' ({be["duration"]})'
            for be in b['beats']))
