# Read the on-screen tab of a "Simple Guitar Tabs"-style video: a Guitar Pro tab strip under the
# player, with a playback cursor that turns the current beat's digits orange. The cursor follows
# the author's own score at a steady tempo, so the times its highlight moves are the notated
# rhythm, and the bar lines on screen are the real bar lines.
#
# usage: video-cursor.py <video> <out.json> [--debug]
# out.json: {
#   "band": {"lines": [y1..y6]},           # string line rows (line 1 = highest string)
#   "events": [{"t", "x", "lines", "bar"}], # one per highlighted beat; x in strip coordinates
#             | {"t", "off": true}          # highlight cleared, nothing new lit: a rest starts
#   "barlines": [x, ...],                   # strip x of every bar line seen
#   "bar" counts the bar lines the cursor has crossed (a jump back, i.e. a repeat, counts as one).
#   "scrolls": [[t, shift], ...], "fps", "duration", "ok", "why"
# }
# "Strip coordinates" join the pages: each page turn is measured (how far the content moved)
# and added up, so a bar keeps the same x however many pages later the cursor comes back to it.
# ok=false means the layout wasn't recognised (no 6-line tab band, or no orange cursor).
import json
import subprocess
import sys

import numpy as np

video, out = sys.argv[1], sys.argv[2]
DEBUG = '--debug' in sys.argv


def probe():
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,r_frame_rate:format=duration', '-of', 'json', video],
                       capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    s = j['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return s['width'], s['height'], float(num) / float(den), float(j['format']['duration'])


W, H, FPS, DUR = probe()


def frames(start=None, length=None):
    cmd = ['ffmpeg', '-loglevel', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    cmd += ['-i', video]
    if length is not None:
        cmd += ['-t', str(length)]
    cmd += ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    p.wait()


def find_lines():
    """Six evenly spaced bright rows in the lower half: the tab's string lines."""
    best = None
    for t in np.linspace(DUR * 0.2, DUR * 0.8, 5):
        f = next(frames(t, 0.1), None)
        if f is None:
            continue
        lum = f.astype(int).mean(2)
        row = (lum > 110).mean(1)
        cand = [y for y in range(H // 2, H) if row[y] > 0.5 and row[y] >= row[y - 1] and row[y] >= row[min(H - 1, y + 1)]]
        # merge neighbours (an anti-aliased line spans two rows)
        merged = []
        for y in cand:
            if merged and y - merged[-1][-1] <= 2:
                merged[-1].append(y)
            else:
                merged.append([y])
        ys = [float(np.mean(m)) for m in merged]
        for i in range(len(ys) - 5):
            six = ys[i:i + 6]
            gaps = np.diff(six)
            if gaps.min() > 8 and gaps.max() - gaps.min() <= 2.5:
                best = six
                break
        if best:
            break
    return best


lines = find_lines()
if not lines:
    json.dump({'ok': False, 'why': 'no 6-line tab band found'}, open(out, 'w'))
    print('no tab band found')
    sys.exit(0)
gap = float(np.mean(np.diff(lines)))
Y0 = int(lines[0] - gap * 0.9)
Y1 = int(lines[-1] + gap * 0.9)
ly = [y - Y0 for y in lines]
line_rows = np.zeros(Y1 - Y0, bool)
for y in ly:
    line_rows[max(0, int(round(y)) - 1):int(round(y)) + 2] = True
mid_rows = [int(round((ly[k] + ly[k + 1]) / 2)) for k in range(5)]


def shift_between(p, q):
    """Best s with q[x] ~ p[x + s] (content moved left by s). Returns (s, err)."""
    best = (0, 1e9)
    n = len(p)
    for s in range(-n + 40, n - 40):
        if s >= 0:
            a, b = p[s:], q[:n - s]
        else:
            a, b = p[:n + s], q[-s:]
        tot = a.sum() + b.sum()
        if tot < 50:
            continue
        err = np.abs(a - b).sum() / tot
        if err < best[1]:
            best = (s, err)
    return best


events = []
barx = []
scrolls = []
offset = 0  # strip x = screen x + offset
ref = None  # column profile of the current page
prev_cols = []  # highlighted columns (strip x) in the previous frame
unstable = 0
page = 0
page_off = {0: 0}  # page -> strip x of its left edge
fi = -1
for f in frames():
    fi += 1
    t = fi / FPS
    a = f[Y0:Y1].astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = (R + G + B) / 3
    bright = lum > 100
    bright[line_rows] = False
    prof = bright.sum(0).astype(float)
    if ref is None:
        ref = prof
    d = np.abs(prof - ref).sum() / max(1.0, prof.sum() + ref.sum())
    if d > 0.25:
        s, err = shift_between(ref, prof)
        if err < 0.2 and s != 0:
            offset += s
            page += 1
            page_off[page] = offset
            scrolls.append([round(t, 3), int(s)])
            ref = prof
            unstable = 0
        elif err < 0.2:
            ref = prof
        else:
            unstable += 1
            if unstable > FPS * 2:  # a new layout (e.g. after a cut): start a fresh page
                ref = prof
                offset += W
                page += 1
                page_off[page] = offset
                scrolls.append([round(t, 3), None])
                unstable = 0
            prev_cols = []
            continue
    else:
        ref = 0.9 * ref + 0.1 * prof
        unstable = 0
    # bar lines: thin and unbroken from the top string to the bottom one. A stacked chord's
    # digits can light the gaps too, but they are wide and the string lines break around them.
    col = np.ones(W, bool)
    for r in mid_rows:
        col &= lum[r] > 110
    if col.any():
        span = lum[int(round(ly[0])):int(round(ly[-1])) + 1] > 90
        solid = span.mean(0) > 0.95
        for x in np.nonzero(col & solid)[0]:
            lo, hi = max(0, x - 4), min(W - 1, x + 4)
            if span[:, lo].mean() < 0.5 or span[:, hi].mean() < 0.5:
                barx.append((page, int(x) + offset))
    # orange highlight
    m = (R > 165) & (R - B > 90) & (G > 85) & (G < 215)
    xs = np.nonzero(m.sum(0) >= 2)[0]
    cols = []
    if len(xs):
        groups = np.split(xs, np.nonzero(np.diff(xs) > 5)[0] + 1)
        for g in groups:
            sub = m[:, g[0]:g[-1] + 1]
            if sub.sum() < 12:
                continue
            rows = np.nonzero(sub.any(1))[0]
            hit = sorted({k + 1 for k, y in enumerate(ly) for r in rows if abs(r - y) <= gap * 0.4})
            cols.append((float(g.mean()) + offset, hit, int(sub.sum())))
    new = [c for c in cols if all(abs(c[0] - p[0]) > 6 for p in prev_cols)]
    last = next((e for e in reversed(events) if 'x' in e), None)
    if new and not prev_cols and last and all(abs(c[0] - last['x']) <= 8 for c in new) and t - last['t'] < 30:
        # the same digits lit again after a flicker: not a new beat, and not a rest
        if events[-1].get('off') and t - events[-1]['t'] < 0.3:
            events.pop()
        new = []
        prev_cols = cols
        continue
    if new:
        x = float(np.mean([c[0] for c in new]))
        hit = sorted({h for c in new for h in c[1]})
        events.append({'t': round(t, 3), 'x': round(x, 1), 'lines': hit, 'page': page})
    elif cols and events and 'x' in events[-1]:
        # the highlight can take a frame or two to reach every digit of a chord
        same = [c for c in cols if abs(c[0] - events[-1]['x']) <= 6]
        events[-1]['lines'] = sorted(set(events[-1]['lines']) | {h for c in same for h in c[1]})
    elif not cols and prev_cols:
        # highlight cleared with nothing new lit: a rest starts (or the song ends)
        events.append({'t': round(t, 3), 'off': True})
    prev_cols = cols

# Bar lines per page (seen in many frames, 1-3 px wide). Kept per page: summing page turns
# drifts by a pixel or two per turn, so one physical bar line seen on two pages would count twice.
by_page = {}
for pg, x in barx:
    by_page.setdefault(pg, []).append(x)
page_bars = {}
for pg, xs in by_page.items():
    xs.sort()
    groups = []
    for x in xs:
        if groups and x - groups[-1][-1] <= 4:
            groups[-1].append(x)
        else:
            groups.append([x])
    # a real bar line is visible for a while; a few stray frames are glyph noise
    page_bars[pg] = [round(float(np.mean(g)), 1) for g in groups if len(g) >= 8]


def crossings(a, b):
    """Bar lines between two consecutive highlights (strip x), counting each page's share."""
    if b['x'] < a['x'] - 30:
        return 1  # the cursor jumped back (a repeat): a new bar
    if b['x'] <= a['x']:
        return 0
    n = 0
    lo, hi = a['x'], b['x']
    for pg in range(a['page'], b['page'] + 1):
        left = page_off[pg] if pg > a['page'] else -1e9
        right = page_off[pg + 1] if pg < b['page'] and pg + 1 in page_off else 1e9
        n += sum(1 for x in page_bars.get(pg, []) if max(lo, left) < x < min(hi, right))
    return n


bar = 0
prev = None
for e in events:
    if 'x' in e:
        if prev is not None:
            bar += crossings(prev, e)
        e['bar'] = bar
        prev = e
barlines = sorted(x for xs in page_bars.values() for x in xs)
ok = sum(1 for e in events if 'x' in e) >= 8
json.dump({'ok': ok, 'why': '' if ok else 'too few highlight events', 'fps': FPS, 'duration': DUR,
           'band': {'y0': Y0, 'y1': Y1, 'lines': lines}, 'events': events, 'barlines': barlines,
           'scrolls': scrolls}, open(out, 'w'))
print(f'{len(events)} highlight events, {len(barlines)} bar lines, {len(scrolls)} page turns -> {out}')
