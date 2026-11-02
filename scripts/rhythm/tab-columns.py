# Recover each bar's note column positions from the ASCII tab (the GP file lost them), and
# check that the tab's bars line up with the GP's bars note for note.
# usage: tab-columns.py <tab.txt> <beats.json> <cols.json>
# cols.json: [{bar, w (bar width in columns), cols (column of each beat)}] — input for fit.py.
# A MISMATCH line means the ASCII and the GP disagree for that bar (e.g. the importer split a
# long bar into 16-beat chunks); fix the mapping before trusting fit.py for those bars.
import json
import re
import sys
from collections import defaultdict

text = open(sys.argv[1], 'rb').read().decode('utf-8', errors='replace')
if '�' in text:
    text = open(sys.argv[1], 'rb').read().decode('latin1')
lines = text.replace('\r\n', '\n').replace('\r', '\n').replace('\t', '    ').split('\n')
beats = json.load(open(sys.argv[2]))
letters = bool(re.search(r'\ba\s*=\s*10', text))  # a=10 … f=15, only when the tab declares it


def tabish(line):
    t = re.sub(r'^\s*[A-Ga-g][#b]?\s*[|:]', '', line).strip()
    return len(t) >= 6 and t.count('-') / max(1, len(t.replace(' ', ''))) >= 0.45


def fret(ch):
    if ch.isdigit():
        return int(ch)
    if letters and ch in 'abcdef':
        return 10 + 'abcdef'.index(ch)
    return None


systems, group = [], []
for line in lines + ['']:
    if tabish(line):
        group.append(re.sub(r'^\s*[A-Ga-g][#b]?\s*[|:]', '', line.rstrip()))
    else:
        if len(group) in (4, 6, 7):
            systems.append(group)
        elif group:
            print(f'skipped a {len(group)}-line block: {group[0][:40]!r}')
        group = []

bars = []
for sysl in systems:
    w = max(len(l) for l in sysl)
    rows = [l.ljust(w) for l in sysl]
    # a bar is a run of columns where at least one string has a non-space, non-bar-line char
    gap = [all(r[c] in ' |' for r in rows) for c in range(w)]
    c = 0
    while c < w:
        if gap[c]:
            c += 1
            continue
        s = c
        while c < w and not gap[c]:
            c += 1
        ev = defaultdict(list)
        for li, r in enumerate(rows):
            for ci, ch in enumerate(r[s:c]):
                f = fret(ch)
                # a digit right after another digit is part of a 2-digit fret (unless letter frets)
                if f is not None and not (ch.isdigit() and not letters and ci > 0 and r[s + ci - 1].isdigit()):
                    if ch.isdigit() and not letters and ci + 1 < c - s and r[s + ci + 1].isdigit():
                        f = int(r[s + ci:s + ci + 2])
                    ev[ci].append((li + 1, f))
        bars.append({'w': c - s, 'ev': sorted(ev.items())})

gp = defaultdict(list)
for b in beats:
    gp[b['bar']].append(sorted((n['line'], n['fret']) for n in b['notes']))

out = []
for i, b in enumerate(bars):
    tab = [sorted(n) for _, n in b['ev']]
    ok = tab == gp.get(i + 1, [])
    print(i + 1, f"w={b['w']}", 'OK' if ok else 'MISMATCH',
          ' '.join(f"{c}:{'+'.join(f'{l}/{f}' for l, f in n)}" for c, n in b['ev']))
    if not ok:
        print('   gp:', gp.get(i + 1, []))
    out.append({'bar': i + 1, 'w': b['w'], 'cols': [c for c, _ in b['ev']]})
json.dump(out, open(sys.argv[3], 'w'))
print(f'{len(bars)} tab bars, {len(gp)} GP bars')
