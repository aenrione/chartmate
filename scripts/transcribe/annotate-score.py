# Post-process a fingering.py score.json: per-section tempo marks measured from the grid (for a
# drifting full-band tempo), and brush / pick-stroke marks on chosen beats. (For explicit bars
# you can also write "brush"/"pickStroke" on the beat in the arrangement; fingering.py keeps them.)
# usage: annotate-score.py <score.json> <grid.json> <out.json> [--section-tempo]
#                          [--brush "125:2=down,..."] [--pick "12:3=up,..."] [--quarters-per-bar 3]
#   --section-tempo     on the first bar of each section, set "tempo" = quarter BPM from the
#                       mean grid bar length over that section (a 6/8 bar = 3 quarters); the
#                       global "tempo" becomes bar 1's. Bars past the grid keep the last tempo.
#   --brush/--pick      bar:beat-index (bar 1-based, beat 0-based = index into that bar's
#                       "beats" in score.json) = down|up; build-gp.ts reads them.
#   --quarters-per-bar  quarter notes per bar (6/8 = 3, 3/4 = 3, 4/4 = 4)
import argparse, json
ap = argparse.ArgumentParser(); ap.add_argument('score'); ap.add_argument('grid'); ap.add_argument('out')
ap.add_argument('--section-tempo', action='store_true'); ap.add_argument('--brush', default=''); ap.add_argument('--pick', default='')
ap.add_argument('--quarters-per-bar', type=float, default=3)
a = ap.parse_args()
sc = json.load(open(a.score)); g = json.load(open(a.grid))['bars']
if a.section_tempo:
    starts = [i for i, b in enumerate(sc['bars']) if b.get('section')] + [len(sc['bars'])]
    for s, e in zip(starts, starts[1:]):
        gb = g[s:min(e, len(g))]
        if not gb: continue
        bar_s = sum(b1 - b0 for b0, b1 in gb) / len(gb)
        bpm = round(60 * a.quarters_per_bar / bar_s)
        sc['bars'][s]['tempo'] = bpm
        print(f'bar {s + 1:3d} {sc["bars"][s]["section"]:12s} {bpm} quarter BPM ({60 / (bar_s / 2):.1f} dotted-quarter BPM)')
    sc['tempo'] = sc['bars'][0]['tempo']
for key, spec in (('brush', a.brush), ('pickStroke', a.pick)):
    for item in filter(None, spec.split(',')):
        pos, d = item.split('='); bar, beat = map(int, pos.split(':'))
        sc['bars'][bar - 1]['beats'][beat][key] = d
json.dump(sc, open(a.out, 'w'), indent=1)
print('->', a.out)
