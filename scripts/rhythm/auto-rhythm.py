# Recover the real rhythm of a placeholder-rhythm tab (an ASCII import: every note the same
# value at 120) from a recording of it, and say how far to trust the result.
#
# usage: auto-rhythm.py --gp <orig.gp> --url <youtube-url|audio/video file> --work <dir> --out <dir>
#                       [--id N] [--title T] [--demucs auto|always|never] [--video-check]
#                       [--meters 4/4,3/4,6/8,2/4] [--no-apply]
#   --work  per-song scratch dir: download, transcription, intermediate JSON (untrusted data)
#   --out   per-song results: spec.json (apply-rhythm "rebar"), out.gp, report.json, report.md
#   --video-check  also read the video's on-screen tab cursor (video-cursor.py) and report how
#                  well it agrees. Optional, never used to build the result.
# Run with the rhythm venv's python and -I. Node must be on PATH (or set $NODE).
#
# Core path (audio only, works for any recording of the tab's arrangement):
#   1. basic-pitch on the full mix (fast; enough for solo guitar). With --demucs auto, when
#      under 75% of the tab aligns, separate the guitar stem (htdemucs_6s) and retry.
#   2. Align the tab's beats to the audio note events by pitch (octave-tolerant), with a DP that
#      tolerates ghosts, misses, an intro, and long skips (the recording repeating what the tab
#      writes once, or the reverse).
#   3. One Viterbi pass per candidate meter over (position in bar, tempo): each note's
#      inter-onset interval must be a note value at the current tempo; tempo moves slowly;
#      notes land on metrically likely positions; accented notes (bass, chords, loud, long) and,
#      when they look real, the ASCII tab's bar lines prefer downbeats. The cheapest meter wins.
#   4. Write the result as an apply-rhythm "rebar" spec (bar lines rebuilt, ties across them,
#      tempo changes where the tempo moves for good), apply it and verify.
#   5. Confidence: coverage, residuals, tempo stability, meter margin, per-bar flags, verdict.
import argparse
import csv
import glob
import json
import math
import os
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
NODE = os.environ.get('NODE', 'node')
TPQ = 960  # alphaTab ticks per quarter
UPQ = 12  # DP units per quarter: 16th = 3, 8th-triplet = 4
TICK = TPQ // UPQ


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ----------------------------------------------------------------------------------------------
# stages (cached in --work)
# ----------------------------------------------------------------------------------------------

def run_stage(name, out, cmd, timings, cwd=None):
    if os.path.exists(out):
        return
    t0 = time.time()
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'{name} failed: {(r.stderr or r.stdout).strip()[-400:]}')
    timings[name] = round(time.time() - t0, 1)


def fetch(src, work, timings, video=False):
    """Audio (and, for --video-check, a 480p video) of the recording."""
    pat = 'video' if video else 'media'
    have = [p for p in glob.glob(os.path.join(work, pat + '.*')) if not p.endswith(('.part', '.log', '.json', '.ytdl'))]
    if have:
        return have[0]
    t0 = time.time()
    if os.path.isfile(src):
        dst = os.path.join(work, pat + os.path.splitext(src)[1])
        shutil.copy(src, dst)
    else:
        fmt = 'bv*[height<=480]+ba/b[height<=480]/b' if video else 'ba/b'
        r = subprocess.run(['uvx', 'yt-dlp@latest', '-q', '--no-warnings', '--no-playlist', '-f', fmt,
                            '-o', pat + '.%(ext)s', src], cwd=work, capture_output=True, text=True)
        open(os.path.join(work, f'yt-dlp-{pat}.log'), 'w').write(r.stdout + r.stderr)
        if r.returncode:
            raise RuntimeError('download failed: ' + (r.stderr.strip().splitlines() or ['?'])[-1][:200])
    timings['download-' + pat] = round(time.time() - t0, 1)
    have = [p for p in glob.glob(os.path.join(work, pat + '.*')) if not p.endswith(('.part', '.log', '.json', '.ytdl'))]
    return have[0]


def cpu_seconds():
    r = os.times()
    return r.children_user + r.children_system + r.user + r.system


# ----------------------------------------------------------------------------------------------
# alignment of the tab to the performance
# ----------------------------------------------------------------------------------------------

def align(S, perf_skip, tab_skip=0.6, open_=3.0, perf_ext=0.02, tab_ext=0.05):
    """Semi-global alignment of a performance (rows) to the tab (columns).
    S[i][j]: match score. perf_skip[i]: cost of skipping performance event i on its own.
    Long gaps (a section played twice, an intro, a tab section the player leaves out) cost
    open_ + ext per event. Free performance prefix and suffix. Returns [(i, j)]."""
    N, K = S.shape
    NEG = -1e18
    D = np.full((N + 1, K + 1), NEG)
    H = np.full((N + 1, K + 1), NEG)
    G = np.full((N + 1, K + 1), NEG)
    P = np.zeros((N + 1, K + 1), np.int8)  # 0 match, 1 perf skip, 2 tab skip, 3 long perf gap, 4 long tab gap
    PH = np.zeros((N + 1, K + 1), np.int8)
    PG = np.zeros((N + 1, K + 1), np.int8)
    D[:, 0] = 0.0
    for j in range(1, K + 1):
        go, ge = D[0][j - 1] - open_, G[0][j - 1] - tab_ext
        G[0][j], PG[0][j] = (go, 0) if go >= ge else (ge, 1)
        a = D[0][j - 1] - tab_skip
        D[0][j], P[0][j] = (a, 2) if a >= G[0][j] else (G[0][j], 4)
    for i in range(1, N + 1):
        Dp = D[i - 1]
        h_open = Dp - open_
        h_ext = H[i - 1] - perf_ext
        H[i] = np.maximum(h_open, h_ext)
        PH[i] = (h_ext > h_open).astype(np.int8)
        match = np.full(K + 1, NEG)
        match[1:] = Dp[:-1] + S[i - 1]
        pskip = Dp - perf_skip[i - 1]
        # best of the moves that don't depend on this row's left neighbour
        base = np.maximum(match, pskip)
        bmv = np.where(match >= pskip, 0, 1).astype(np.int8)
        hb = H[i] > base
        base = np.where(hb, H[i], base)
        bmv = np.where(hb, 3, bmv).astype(np.int8)
        Di, Gi, Pi, PGi = D[i], G[i], P[i], PG[i]
        for j in range(1, K + 1):
            go = Di[j - 1] - open_
            ge = Gi[j - 1] - tab_ext
            if go >= ge:
                Gi[j] = go
                PGi[j] = 0
            else:
                Gi[j] = ge
                PGi[j] = 1
            best, mv = base[j], bmv[j]
            v = Di[j - 1] - tab_skip
            if v > best:
                best, mv = v, 2
            if Gi[j] > best:
                best, mv = Gi[j], 4
            Di[j] = best
            Pi[j] = mv
    i = int(np.argmax(D[:, K]))
    j = K
    pairs = []
    state = 'D'
    while j > 0:
        if state == 'D':
            mv = P[i][j]
            if i == 0 and mv not in (2, 4):
                mv = 2
            if mv == 0:
                pairs.append((i - 1, j - 1))
                i, j = i - 1, j - 1
            elif mv == 1:
                i -= 1
            elif mv == 2:
                j -= 1
            elif mv == 3:
                state = 'H'
            else:
                state = 'G'
        elif state == 'H':
            ext = PH[i][j]
            i -= 1
            state = 'H' if ext else 'D'
        else:
            ext = PG[i][j]
            j -= 1
            state = 'G' if ext else 'D'
    pairs.reverse()
    return pairs


def sim_pitch(A, T):
    """Match score of an audio event (pitch set A) for a tab beat (pitch set T): every tab
    pitch heard scores, an octave error scores less, unexplained extra pitches cost a little."""
    if not A:
        return -1.0
    m = 0.0
    for t in T:
        if t in A:
            m += 1
        elif any((a - t) % 12 == 0 and abs(a - t) <= 24 for a in A):
            m += 0.6
    extra = sum(1 for a in A if not any(a == t or ((a - t) % 12 == 0 and abs(a - t) <= 24) for t in T))
    return 2.2 * m / len(T) - 1.0 - min(0.45, 0.15 * extra)


def sim_lines(V, T):
    if not V or not T:
        return -1.0
    return 2.2 * (2 * len(V & T) / (len(V) + len(T))) - 1.0


def audio_events(rows, amin=0.25, win=0.05):
    """basic-pitch notes grouped into onset events (a chord's notes start within `win`)."""
    rows = sorted(r for r in rows if r[3] >= amin)
    ev = []
    for r in rows:
        if ev and r[0] - ev[-1]['t'] < win:
            ev[-1]['p'].add(r[2])
            ev[-1]['a'] = max(ev[-1]['a'], r[3])
            ev[-1]['off'] = max(ev[-1]['off'], r[1])
        else:
            ev.append({'t': r[0], 'p': {r[2]}, 'a': r[3], 'off': r[1]})
    return ev


def align_audio(rows, TM, expect=None):
    """Tab beats to audio events. With `expect` (a time per tab beat from a first rhythm pass),
    events far from where the rhythm says a beat should sound cost extra: this settles runs of
    repeated same-pitch notes and doubled onsets, where pitch alone can't tell which is which."""
    aev = audio_events(rows)
    if not aev:
        return aev, [], {}
    S = np.array([[sim_pitch(e['p'], T) for T in TM] for e in aev])
    if expect is not None:
        et = np.array([e['t'] for e in aev])
        S = S - 0.7 * np.minimum(np.abs(et[:, None] - expect[None, :]) / 0.15, 3.0)
        S0 = np.array([[sim_pitch(e['p'], T) for T in TM] for e in aev])
    else:
        S0 = S
    pairs = [(i, j) for i, j in align(S, np.full(len(aev), 0.35)) if S0[i][j] > 0.0 and S[i][j] > -1.0]
    return aev, pairs, {j: i for i, j in pairs}


def expected_times(r, J, a_of, aev, w):
    """Time each tab beat should sound at, from a rhythm solution and the heard anchors."""
    pos = np.concatenate([[0], np.cumsum(r['durs'])]).astype(float)
    anc = sorted((pos[j], aev[i]['t']) for j, i in a_of.items() if w[j] >= 1 or (j and w[j - 1] >= 1))
    ap, at = [], []
    for p, t in anc:
        if ap and (t <= at[-1] or p <= ap[-1]):
            continue
        ap.append(p)
        at.append(t)
    if len(ap) < 2:
        return None
    return np.interp(pos, ap, at)


# ----------------------------------------------------------------------------------------------
# rhythm DP
# ----------------------------------------------------------------------------------------------

METERS = {'4/4': (4, 4, 0.0), '3/4': (3, 4, 0.0), '6/8': (6, 8, 0.03), '2/4': (2, 4, 0.06),
          '12/8': (12, 8, 0.06), '9/8': (9, 8, 0.08)}


def meter_tables(num, den):
    """Units per bar, allowed onset positions, and the metrical cost of landing on each."""
    P = num * UPQ * 4 // den
    compound = den == 8 and num % 3 == 0
    pos_cost = np.full(P, np.inf)
    cls = np.zeros(P, np.int8)  # 0 shared (beat), 1 straight-only, 2 triplet-only
    for p in range(P):
        if compound:
            beat = UPQ * 3 // 2  # dotted quarter = 18 units
            if p % 3:
                continue
            c = 0.0 if p == 0 else 0.4 if p % beat == 0 else 1.0 if p % 6 == 0 else 1.9
        else:
            r = p % UPQ
            if r not in (0, 3, 4, 6, 8, 9):
                continue
            c = (0.0 if p == 0 else 0.25 if (num == 4 and p == 2 * UPQ) else 0.4 if r == 0 else 1.0 if r == 6
                 else 1.9 if r in (3, 9) else 3.2)
            cls[p] = 0 if r == 0 else 2 if r in (4, 8) else 1
        pos_cost[p] = c
    return P, compound, pos_cost, cls


# Durations that are one written value (in units: 16th 3, 8th-triplet 4, 8th 6, dotted 8th 9,
# quarter-triplet 8, quarter 12, dotted quarter 18, half 24, dotted half 36, whole 48, ...).
# Anything else needs a tie, which a player would rarely mean: it costs extra. Without this the
# finer grid of a doubled tempo soaks up expressive timing as odd tied values.
SIMPLE = np.array([3, 4, 6, 8, 9, 12, 16, 18, 24, 36, 48, 72, 96])

DUR_W, DUR_C = float(os.environ.get('AR_DUR_W', 0.25)), float(os.environ.get('AR_DUR_C', 6))
Q_W, Q_C = float(os.environ.get('AR_Q_W', 0)), float(os.environ.get('AR_Q_C', 80))
ACC_BASS, ACC_LONG = float(os.environ.get('AR_ACC_BASS', 0.6)), float(os.environ.get('AR_ACC_LONG', 0.0))
REP_W = float(os.environ.get('AR_REP_W', 0.3))
# Bar-length prior. Re-scoring the 104 pilot songs whose cursor gives the true bar suggested a
# slower centre (3.6 s / weight 1.5 would have matched 62% of them against 35% for 2.8/1.0), but
# re-running the DP with it moved the audio-only match only 1/9 -> 2/9 on the review set and made
# some readings worse: with a heavier prior the search just finds a different fast reading. Left
# at the measured values; AR_BAR_W / AR_BAR_C are there to try again on a bigger re-run.
BAR_W, BAR_C = float(os.environ.get('AR_BAR_W', 1.0)), float(os.environ.get('AR_BAR_C', 2.8))
# How fast the (robust) observation cost keeps growing past its cap. 0 reproduces the old hard
# clip, which let notes the alignment got wrong be written at any length.
CAP_SLOPE = float(os.environ.get('AR_CAP_SLOPE', 0.25))
# Plausible written quarter-note tempo: outside this band the tempo costs extra (3 per octave
# per note). The upper end settles the tempo octave, the commonest audio-only mistake: these
# arrangements are written as 16ths at 60-90, not 8ths at 120-180, so a quarter much over
# ~90 bpm is nearly always a doubled reading of a slower bar.
# Measured over the 115 songs of the 2026-10-26 batch that have a readable on-screen cursor,
# audio alone (no cursor, no tie-break): raising TP_HI from 170 to 90 took the bar length from
# 34/115 to 66/115 right, doubled-tempo readings from 47 to 9, and the median duration
# agreement from 0.18 to 0.71; 33 of the 34 already-right songs stayed right.
# Raise AR_TP_HI for genuinely fast material (the band is on the quarter, not on the pulse).
TP_LO, TP_HI = float(os.environ.get('AR_TP_LO', 58)), float(os.environ.get('AR_TP_HI', 90))

QGRID = np.exp(np.linspace(math.log(0.22), math.log(1.7), 92))  # seconds per quarter (273..35 bpm)


def tempo_prior(q):
    bpm = 60 / q
    if TP_LO <= bpm <= TP_HI:
        return 0.0
    return 3.0 * abs(math.log2(bpm / (TP_LO if bpm < TP_LO else TP_HI)))


def rhythm_dp(ioi, w, acc, gpbar, meter, gp_weight=0.0, band=None):
    """Viterbi over (position in bar, tempo) for one meter.
    ioi[j], w[j]: observed interval from note j to j+1 and its reliability (0 = unknown).
    acc[j]: accent of note j (prefers downbeats/beats). gpbar[j]: note j starts an ASCII bar.
    Returns (cost, start position, [duration units], [quarter seconds per note], [capped])."""
    num, den, prior = meter
    P, compound, pos_cost, cls = meter_tables(num, den)
    K = len(QGRID)
    J = len(acc)
    beat_units = UPQ * 3 // 2 if compound else UPQ
    on_beat = np.array([p % beat_units == 0 for p in range(P)])
    allowed = np.isfinite(pos_cost)
    # tempo prior, plus a bar-length prior: written bars mostly last 2-4 s (4/4 at 60-120,
    # 3/4 at 45-90); this, more than note values, settles the tempo octave
    tp = np.array([tempo_prior(q) + BAR_W * abs(math.log2((P / UPQ) * q / BAR_C)) + Q_W * abs(math.log2(Q_C / (60 / q)))
                   for q in QGRID])
    if band:  # only bars lasting band[0]..band[1] seconds (one tempo octave)
        bar_s = (P / UPQ) * QGRID
        tp = np.where((bar_s >= band[0]) & (bar_s < band[1]), tp, 1e6)

    def land_cost(j):
        c = pos_cost.copy()
        a = acc[j]
        if a:
            c = c + a * np.where(np.arange(P) == 0, 0.0, np.where(on_beat, 0.5, 1.0))
        if gp_weight and gpbar[j]:
            c = c + gp_weight * (np.arange(P) != 0)
        return c

    # transitions: d units from p to (p + d) % P, d = 3 .. 2P
    Ds = [d for d in range(3, 2 * P + 1)]
    valid = {}
    for d in Ds:
        v = np.zeros(P, bool)  # indexed by the landing position p'
        for p in range(P):
            if not allowed[p]:
                continue
            p2 = (p + d) % P
            if not allowed[p2]:
                continue
            # no mixing of straight 16ths and triplets inside one beat
            if not compound and d < UPQ and p // UPQ == (p + d) // UPQ and {cls[p], cls[p2]} == {1, 2}:
                continue
            v[p2] = True
        if v.any():
            valid[d] = v
    Ds = sorted(valid)
    Dar = np.array(Ds, float)
    C = land_cost(0)[:, None] + tp[None, :]
    C[~allowed] = np.inf
    back_d = np.zeros((J, P, K), np.int16)
    back_k = np.zeros((J, P, K), np.int8)
    capped = []
    CAP = 9.0
    Z0 = math.sqrt(2 * CAP)
    for j in range(J - 1):
        # tempo change at this note: k' = k + dk
        best = np.full((P, K), np.inf)
        bk = np.zeros((P, K), np.int8)
        for dk in (-2, -1, 0, 1, 2):
            sh = np.full((P, K), np.inf)
            if dk >= 0:
                sh[:, dk:] = C[:, :K - dk]
            else:
                sh[:, :K + dk] = C[:, -dk:]
            sh = sh + 0.7 * dk * dk + 0.3 * tp[None, :]
            m = sh < best
            best[m] = sh[m]
            bk[m] = dk
        # observation: ioi vs d * q / UPQ
        if w[j] > 0:
            y = Dar[:, None] * QGRID[None, :] / UPQ  # (D, K)
            sig = np.sqrt(0.025 ** 2 + (0.08 * y) ** 2)
            # Huber, not a hard clip: beyond the cap the cost still grows, slowly. A flat cap
            # left every value equally bad for a note the alignment got wrong (a rolled chord,
            # a fermata, a missed onset), so the duration prior picked an 8th for a 0.07 s gap
            # and the score ran long - 10-60% longer than the recording in the pilot.
            z = np.abs(ioi[j] - y) / sig
            O = w[j] * np.where(z <= Z0, 0.5 * z ** 2, CAP + CAP_SLOPE * (z - Z0))
        else:
            O = np.zeros((len(Ds), K))
        # duration prior: very short or very long values cost a little
        # duration prior: notes are mostly 8ths and quarters; this, with the tempo prior, settles
        # the tempo octave (the same onsets fit 3/4 at 77 with quarters, or 3/4 at 233 with
        # dotted halves; the position prior alone would prefer the second)
        O = O + DUR_W * np.abs(np.log2(Dar / DUR_C))[:, None] + np.where(np.isin(Dar, SIMPLE), 0.0, 1.0)[:, None]
        new = np.full((P, K), np.inf)
        nd = np.zeros((P, K), np.int16)
        for di, d in enumerate(Ds):
            cand = np.roll(best, d, axis=0) + O[di][None, :]
            cand[~valid[d]] = np.inf
            m = cand < new
            new[m] = cand[m]
            nd[m] = d
        new = new + land_cost(j + 1)[:, None]
        C = new
        back_d[j + 1] = nd
        back_k[j + 1] = bk
    p, k = np.unravel_index(int(np.argmin(C)), C.shape)
    total = float(C[p, k]) + prior * J
    durs = []
    qs = [QGRID[k]]
    for j in range(J - 1, 0, -1):
        d = int(back_d[j][p, k])
        p = (p - d) % P
        k = k - int(back_k[j][p, k])
        durs.append(d)
        qs.append(QGRID[k])
    durs.reverse()
    qs.reverse()
    for j in range(J - 1):
        if w[j] > 0:
            y = durs[j] * qs[j + 1] / UPQ
            sig = math.sqrt(0.025 ** 2 + (0.08 * y) ** 2)
            if 0.5 * ((ioi[j] - y) / sig) ** 2 >= CAP:
                capped.append(j)
    return {'cost': total, 'start': int(p), 'durs': durs, 'q': qs, 'capped': capped, 'P': P,
            'meter': (num, den), 'compound': compound}


# ----------------------------------------------------------------------------------------------
# notation
# ----------------------------------------------------------------------------------------------

VALUES = [(3840, '1'), (2880, '2.'), (1920, '2'), (1440, '4.'), (1280, '2t'), (960, '4'), (720, '8.'),
          (640, '4t'), (480, '8'), (360, '16.'), (320, '8t'), (240, '16'), (160, '16t'), (120, '32')]


def decompose(x, length, beat_unit):
    """Split `length` ticks starting at bar position x into notated values (to be tied):
    the fewest pieces, each starting where its value may start, largest first."""
    def fits(v, tok, x):
        if tok.endswith('t'):
            return x % (v // 2 if v >= 640 else v) == 0
        base = v * 2 // 3 if tok.endswith('.') else v
        return x % min(base, beat_unit) == 0

    best = None

    def dfs(x, length, acc):
        nonlocal best
        if length == 0:
            if best is None or len(acc) < len(best):
                best = list(acc)
            return
        if best is not None and len(acc) + 1 >= len(best) or len(acc) > 8:
            return
        for v, tok in VALUES:
            if v <= length and fits(v, tok, x):
                acc.append((v, tok))
                dfs(x + v, length - v, acc)
                acc.pop()
                if best is not None and len(best) == len(acc) + 1:
                    return

    dfs(x, length, [])
    if best is None:
        raise ValueError(f'cannot notate {length} ticks at {x}')
    return best


def build_bars(starts, lengths, srcs, bar_ticks, beat_unit, ts):
    """Notes (start tick, length, original beat index) -> apply-rhythm rebar bars."""
    total = starts[-1] + lengths[-1]
    nbars = max(1, -(-total // bar_ticks))
    bars = [{'ts': list(ts), 'beats': []} for _ in range(nbars)]

    def emit(x, length, mk):
        first = True
        while length > 0:
            b, bx = divmod(x, bar_ticks)
            chunk = min(length, bar_ticks - bx)
            for v, tok in decompose(bx, chunk, beat_unit):
                bars[b]['beats'].append(mk(tok, first))
                first = False
            x += chunk
            length -= chunk

    pos = 0
    for x, ln, k in zip(starts, lengths, srcs):
        if x > pos:
            emit(pos, x - pos, lambda tok, f: {'rest': True, 'd': tok})
        emit(x, ln, lambda tok, f, k=k: {'src': k, 'd': tok} if f else {'src': k, 'd': tok, 'tie': True})
        pos = x + ln
    if pos < nbars * bar_ticks:
        emit(pos, nbars * bar_ticks - pos, lambda tok, f: {'rest': True, 'd': tok})
    return bars


def tempo_sections(bar_bpm, tol=0.08, min_len=2):
    """Bars where the tempo moves for good (median of the bars after differs by > tol)."""
    out = {}
    nb = len(bar_bpm)
    cur = None
    b = 0
    while b < nb:
        if bar_bpm[b] is None:
            b += 1
            continue
        if cur is None:
            seg = [x for x in bar_bpm[b:b + 4] if x]
            cur = float(np.median(seg))
            out[b + 1] = round(cur)
            b += 1
            continue
        nxt = [x for x in bar_bpm[b:b + min_len + 1] if x]
        if len(nxt) >= min_len and all(abs(x / cur - 1) > tol for x in nxt[:min_len]) and \
                abs(float(np.median(nxt)) / cur - 1) > tol:
            cur = float(np.median([x for x in bar_bpm[b:b + 4] if x]))
            out[b + 1] = round(cur)
        b += 1
    return out


# ----------------------------------------------------------------------------------------------
# analysis
# ----------------------------------------------------------------------------------------------

def observations(J, a_of, aev, tab_k, beats):
    """Inter-onset interval per tab note and how much to trust it."""
    t = {j: aev[i]['t'] for j, i in a_of.items()}
    ioi = np.zeros(J)
    w = np.zeros(J)
    how = [''] * J
    disc = []
    for j in range(J - 1):
        if j in t and j + 1 in t and 0 < a_of[j + 1] - a_of[j] <= 4 and 0.0 < t[j + 1] - t[j] < 0.12:
            # two tab beats sounding almost together: a rolled chord or a grace note
            ioi[j], w[j], how[j] = t[j + 1] - t[j], 0.2, 'rolled'
        elif j in t and j + 1 in t and 0 < a_of[j + 1] - a_of[j] <= 4 and 0.05 < t[j + 1] - t[j] < 6:
            ioi[j], w[j], how[j] = t[j + 1] - t[j], 1.0, 'heard'
        elif j in t and j + 1 in t and t[j + 1] > t[j] and t[j + 1] - t[j] < 6 and a_of[j + 1] - a_of[j] <= 12:
            ioi[j], w[j], how[j] = t[j + 1] - t[j], 0.5, 'heard (ornaments between)'
        elif j in t and a_of[j] + 1 < len(aev) and (j + 1 not in t or t[j + 1] <= t[j] or t[j + 1] - t[j] >= 6):
            # the recording jumps here (a repeat or a skipped section): this note's own length
            # is the gap to whatever is heard next
            nx = aev[a_of[j] + 1]['t'] - t[j]
            if 0.05 < nx < 6:
                ioi[j], w[j], how[j] = nx, 0.4, 'jump'
                disc.append(j)
    # unmatched runs between two heard notes: share the span evenly, weakly
    j = 0
    while j < J:
        if j in t:
            j += 1
            continue
        s = j
        while j < J and j not in t:
            j += 1
        a, b = s - 1, j
        if a >= 0 and b < J and a in t and b in t and t[b] > t[a] and t[b] - t[a] < 6 * (b - a):
            step = (t[b] - t[a]) / (b - a)
            for x in range(a, b):
                ioi[x], w[x], how[x] = step, 0.15, 'interpolated'
    acc = np.zeros(J)
    gpbar = np.zeros(J, bool)
    amps = [aev[a_of[j]]['a'] for j in range(J) if j in a_of]
    amed = float(np.median(amps)) if amps else 0.5
    heard_ioi = [ioi[j] for j in range(J) if w[j] >= 1]
    imed = float(np.median(heard_ioi)) if heard_ioi else 0.5
    for j in range(J):
        notes = beats[tab_k[j]]['notes']
        lo = min(n['midi'] for n in notes)
        a = 0.0
        if lo < 50 and any(n['line'] >= 5 for n in notes):
            a += ACC_BASS  # a bass note
        if w[j] >= 0.5 and ioi[j] > 1.8 * imed:
            a += ACC_LONG  # a long note: long notes tend to start on strong beats
        if len(notes) >= 3:
            a += 0.3
        if j in a_of and aev[a_of[j]]['a'] > 1.3 * amed:
            a += 0.2
        if j > 0 and w[j - 1] >= 0.5 and ioi[j - 1] > 2.2 * imed:
            a += 0.3  # after a long note: a phrase start
        acc[j] = a
        gpbar[j] = beats[tab_k[j]]['beat'] == 0 or (tab_k[j] > 0 and beats[tab_k[j] - 1]['bar'] != beats[tab_k[j]]['bar'])
    return ioi, w, how, acc, gpbar, disc


def analyse(beats, rows, meters, flags, cursor_bar_s=None):
    tab_k = [k for k, b in enumerate(beats) if b['notes']]
    J = len(tab_k)
    TM = [set(n['midi'] for n in beats[k]['notes']) for k in tab_k]
    rep = {'tab_beats': J, 'tab_rests_dropped': len(beats) - J}
    aev, pairs, a_of = align_audio(rows, TM)
    if len(a_of) < 0.5 * J:
        rep['coverage'] = round(len(a_of) / J, 3)
        return rep, None, None

    # repeated passages (the same run of pitches) should repeat a whole number of bars apart
    keyseq = [tuple(sorted(x)) for x in TM]
    L = 6
    where = defaultdict(list)
    for j in range(J - L):
        where[tuple(keyseq[j:j + L])].append(j)
    rep_pairs = []
    for js in where.values():
        js = [x for i, x in enumerate(js) if i == 0 or x - js[i - 1] >= L][:6]
        rep_pairs += [(a, b) for i, a in enumerate(js) for b in js[i + 1:]]
    rep['repeat_pairs'] = len(rep_pairs)

    def repeat_fit(r):
        if not rep_pairs:
            return None
        pos = np.concatenate([[r['start']], r['start'] + np.cumsum(r['durs'])])
        return sum(1 for a, b in rep_pairs if (pos[b] - pos[a]) % r['P'] == 0) / len(rep_pairs)

    # one search per tempo octave, so each meter offers its best reading at a slow, a medium and
    # a fast bar. With the on-screen bar length known, add a narrow band around it: otherwise the
    # tie-break can only pick among readings the coarse bands happened to land on, which may be
    # the right meter at the wrong tempo (Spirited Away: 4/4 was searched in 2.8-5.6 s and settled
    # at 2.82 s, so the 3.6 s reading the cursor shows was never offered).
    bands = [(0.9, 1.8), (1.6, 3.2), (2.8, 5.6)]
    if cursor_bar_s:
        bands.append((cursor_bar_s * 0.94, cursor_bar_s * 1.06))

    def solve(ioi, w, acc, gpbar, gp_weight):
        res = []
        for name in meters:
            P = meter_tables(*METERS[name][:2])[0]
            seen = set()
            for band in bands:
                r = rhythm_dp(ioi, w, acc, gpbar, METERS[name], gp_weight=gp_weight, band=band)
                key = (tuple(r['durs']), r['start'])
                bar_s = (P / UPQ) * float(np.median(r['q']))
                if key in seen or not band[0] <= bar_s < band[1]:
                    continue
                seen.add(key)
                rf = repeat_fit(r)
                r['repeat_fit'] = rf
                r['bar_s'] = bar_s
                r['name'] = name
                cost = r['cost'] + (REP_W * J * (1 - rf) if rf is not None else 0)
                res.append((cost, f'{name}@{round(60 / float(np.median(r["q"])))}', r))
        res.sort(key=lambda x: x[0])
        return res

    def gp_agreement(r, gpbar):
        pos = r['start']
        hits = n = 0
        for j in range(J):
            if gpbar[j] and j > 0:
                n += 1
                hits += pos % r['P'] == 0
            if j < J - 1:
                pos += r['durs'][j]
        return hits / max(1, n)

    # pass 1: pitch-only alignment, rhythm without the ASCII bar lines
    ioi, w, how, acc, gpbar, disc = observations(J, a_of, aev, tab_k, beats)
    res = solve(ioi, w, acc, gpbar, 0.0)
    gpa = gp_agreement(res[0][2], gpbar)
    rep['ascii_barlines_on_downbeats'] = round(gpa, 3)
    gpw = 1.2 if gpa >= 0.6 else 0.0  # most ASCII bar lines on downbeats: they are real, use them
    rep['ascii_barlines_used'] = bool(gpw)
    # pass 2: re-align with the expected times, then solve again
    exp = expected_times(res[0][2], J, a_of, aev, w)
    rep['coverage_pass1'] = round(len(a_of) / J, 3)
    if exp is not None:
        aev, pairs, a_of = align_audio(rows, TM, exp)
        ioi, w, how, acc, gpbar, disc = observations(J, a_of, aev, tab_k, beats)
    res = solve(ioi, w, acc, gpbar, gpw)
    best = res[0][2]
    rep['candidates'] = [{'name': n, 'cost_per_note': round(c / J, 3), 'bar_s': round(r['bar_s'], 2),
                          'repeat_fit': None if r['repeat_fit'] is None else round(r['repeat_fit'], 2)} for c, n, r in res[:6]]
    rep['audio_choice'] = res[0][1]
    if cursor_bar_s:
        # tie-break only: among the audio's own candidates, take the cheapest whose bar length
        # matches the on-screen bars, if it is not already the audio's first choice
        ok = [x for x in res if abs(x[2]['bar_s'] / cursor_bar_s - 1) < 0.06]
        if ok and ok[0] is not res[0]:
            rep['tie_break'] = {'cursor_bar_s': cursor_bar_s, 'audio_choice': res[0][1], 'chosen': ok[0][1],
                                'cost_gap_per_note': round((ok[0][0] - res[0][0]) / J, 3)}
            res = [ok[0]] + [x for x in res if x is not ok[0]]
            best = res[0][2]
        elif not ok:
            rep['tie_break'] = {'cursor_bar_s': cursor_bar_s, 'none_matches': True}
    if gpw:
        rep['ascii_barlines_on_downbeats_after'] = round(gp_agreement(best, gpbar), 3)
    rep['coverage'] = round(len(a_of) / J, 3)
    rep['audio_events'] = len(aev)
    rep['audio_unmatched_events'] = len(aev) - len(pairs)
    rep['meter_costs'] = {name: round(c / J, 3) for c, name, _ in res}
    margin = (res[1][0] - res[0][0]) / J if len(res) > 1 else 9
    rep['meter_margin'] = round(margin, 3)
    rep['meter_runner_up'] = res[1][1] if len(res) > 1 else None

    def realize(r):
        """A DP solution -> rebar spec (bars, ties, tempo sections) and per-note layout."""
        num, den = r['meter']
        bar_ticks = r['P'] * TICK
        beat_unit = 480 if r['compound'] else 960
        starts = [int(round(r['start'] * TICK))]
        for d in r['durs']:
            starts.append(starts[-1] + int(round(d * TICK)))
        lengths = [int(round(d * TICK)) for d in r['durs']]
        # the last note rings to the end of its bar (at least an 8th)
        last = starts[-1]
        end = max(last + 480, -(-(last + 1) // bar_ticks) * bar_ticks)
        lengths.append(end - last)
        bars = build_bars(starts, lengths, tab_k, bar_ticks, beat_unit, (num, den))
        bar_of = [x // bar_ticks + 1 for x in starts]
        # tempo per bar (median over its notes), then sections where it moves for good
        qs = np.array(r['q'])
        bar_bpm = [None] * len(bars)
        per = defaultdict(list)
        for j in range(J):
            if w[j] >= 0.5 or (j and w[j - 1] >= 0.5):
                per[bar_of[j] - 1].append(60 / qs[j])
        for b_, v in per.items():
            bar_bpm[b_] = float(np.median(v))
        tempo = tempo_sections(bar_bpm) or {1: round(60 / float(np.median(qs)))}
        tempo = {str(k): v for k, v in tempo.items()}
        return {'rebar': {'bars': bars}, 'tempo': tempo}, starts, lengths, bar_of, qs, per, bar_bpm, bar_ticks

    # ready-made alternatives for the reviewer: the best other meter, and the same reading at
    # half and double tempo (the tempo octave is the commonest audio-only mistake)
    alts = []
    other = next((x for x in res[1:] if x[2]['meter'] != best['meter']), None)
    if other:
        alts.append((other[1], other[2]))
    bpm0 = round(60 / float(np.median(best['q'])))
    if True:  # halving may need 32nds (a 16th becomes a 32nd)
        alts.append((f"{'/'.join(map(str, best['meter']))}@{round(bpm0 / 2)}",
                     dict(best, durs=[d / 2 for d in best['durs']], start=best['start'] / 2, q=[q * 2 for q in best['q']])))
    alts.append((f"{'/'.join(map(str, best['meter']))}@{bpm0 * 2}",
                 dict(best, durs=[d * 2 for d in best['durs']], start=(best['start'] * 2) % best['P'], q=[q / 2 for q in best['q']])))
    rep['alternates'] = []
    for name, r in alts:
        try:
            rep['alternates'].append({'name': name, 'spec': realize(r)[0]})
        except ValueError:
            pass

    num, den = best['meter']
    spec, starts, lengths, bar_of, qs, per, bar_bpm, bar_ticks = realize(best)
    tempo = spec['tempo']
    nb = len(spec['rebar']['bars'])
    # ---- confidence
    rel, ms = [], []
    for j in range(J - 1):
        if w[j] >= 1:
            y = best['durs'][j] * qs[j + 1] / UPQ
            rel.append(abs(ioi[j] - y) / y)
            ms.append(abs(ioi[j] - y))
    rel, ms = np.array(rel or [0]), np.array(ms or [0])
    rep['residual'] = {'median_pct': round(float(np.median(rel)) * 100, 1), 'p90_pct': round(float(np.percentile(rel, 90)) * 100, 1),
                       'median_ms': round(float(np.median(ms)) * 1000), 'p90_ms': round(float(np.percentile(ms, 90)) * 1000),
                       'over25pct': int((rel > 0.25).sum())}
    bpms = 60 / qs
    rep['meter'] = {'ts': [num, den], 'bpm': int(next(iter(tempo.values()))), 'tempo_sections': tempo,
                    'bpm_p10_p90': [round(float(np.percentile(bpms, 10))), round(float(np.percentile(bpms, 90)))]}
    rep['tempo_spread_pct'] = round(float((np.percentile(bpms, 90) - np.percentile(bpms, 10)) / np.median(bpms)) * 100, 1)
    rep['capped'] = len(best['capped'])
    rep['jumps'] = len(disc)
    rep['interpolated'] = sum(1 for h in how if h == 'interpolated')
    rep['unknown'] = sum(1 for j in range(J - 1) if w[j] == 0)
    trip = [j for j in range(J) if (starts[j] % TPQ) % 320 == 0 and (starts[j] % TPQ) % 240]
    rep['triplet_notes'] = len(trip)

    for j in best['capped']:
        flags[bar_of[j]].append(f'held {ioi[j]:.2f}s, no note value fits (rubato or fermata)')
    for j in range(J - 1):
        if w[j] >= 1:
            y = best['durs'][j] * qs[j + 1] / UPQ
            if abs(ioi[j] - y) / y > 0.25 and j not in best['capped']:
                flags[bar_of[j]].append(f'note at {aev[a_of[j]]["t"]:.2f}s is {100 * (ioi[j] / y - 1):+.0f}% off its value')
        elif w[j] == 0:
            flags[bar_of[j]].append('duration unknown (not heard)')
        elif how[j] == 'interpolated':
            flags[bar_of[j]].append('not heard; spaced evenly')
        elif how[j] == 'rolled':
            flags[bar_of[j]].append(f'rolled chord or grace note at {aev[a_of[j]]["t"]:.2f}s, written as the shortest value')
    for j in disc:
        flags[bar_of[j]].append(f'recording jumps after {aev[a_of[j]]["t"]:.2f}s (repeat or skip)')
    for j in trip:
        flags[bar_of[j]].append('triplet')
    for b in sorted(per):
        if bar_bpm[b] and abs(bar_bpm[b] / rep['meter']['bpm'] - 1) > 0.12 and str(b + 1) not in tempo:
            flags[b + 1].append(f'tempo {bar_bpm[b]:.0f} here')

    timeline = [{'j': j, 'k': tab_k[j], 'bar': bar_of[j], 'tick': starts[j], 'dur': lengths[j],
                 't': (aev[a_of[j]]['t'] if j in a_of else None), 'how': how[j]} for j in range(J)]
    rep['bars_out'] = nb
    rep['audio_pairs'] = [(aev[i]['t'], tab_k[j]) for i, j in pairs]
    return rep, spec, timeline


# ----------------------------------------------------------------------------------------------
# optional: the on-screen tab cursor as an independent reference
# ----------------------------------------------------------------------------------------------

def cursor_bar(vid):
    """Bar length of the on-screen score: the commonest gap between the first highlights of
    consecutive bars (the cursor runs at the score's steady tempo)."""
    if not vid or not vid.get('ok'):
        return None
    vev = [e for e in vid['events'] if 'x' in e]
    starts = [e['t'] for i, e in enumerate(vev) if i == 0 or e['bar'] != vev[i - 1]['bar']]
    L = np.diff(starts)
    L = L[(L > 0.5) & (L < 10)]
    if len(L) < 3:
        return None
    hist = Counter(np.round(L / 0.04).astype(int))
    mode = max(hist, key=lambda k: hist[k] + 0.6 * (hist.get(k - 1, 0) + hist.get(k + 1, 0))) * 0.04
    near = L[np.abs(L - mode) < 0.06 * mode]
    return round(float(np.median(near)), 3) if len(near) >= 3 else None


def compare_cursor(vid, beats, timeline, bar_ticks):
    """How well the audio result matches the video's tab cursor, beat by beat: each tab note's
    cursor interval as a fraction of a cursor bar vs its audio-derived duration as a fraction of
    an output bar (within a 16th-triplet, or 12%). Also the share of the cursor's bar starts
    that are downbeats in the output, and the bar-length ratio."""
    Bv = cursor_bar(vid)
    if Bv is None:
        return {'ok': False, 'why': (vid or {}).get('why') or 'no usable cursor'}
    tab_k = [t['k'] for t in timeline]
    J = len(tab_k)
    TL = [set(n['line'] for n in beats[k]['notes']) for k in tab_k]
    vev = [e for e in vid['events'] if 'x' in e]
    S = np.array([[sim_lines(set(e['lines']), T) for T in TL] for e in vev])
    pskip = np.array([0.15 if i and vev[i]['lines'] == vev[i - 1]['lines'] else 0.5 for i in range(len(vev))])
    v_of = {j: i for i, j in align(S, pskip) if S[i][j] > -0.2}
    out = {'ok': True, 'coverage': round(len(v_of) / J, 3), 'cursor_bar_s': Bv}
    pairs = [(j, (vev[v_of[j + 1]]['t'] - vev[v_of[j]]['t']) / Bv) for j in range(J - 1)
             if j in v_of and j + 1 in v_of and 0 < v_of[j + 1] - v_of[j] <= 2]
    if not pairs:
        return out
    da = {t['j']: t['dur'] / bar_ticks for t in timeline}
    ok = [abs(da[j] - dv) * bar_ticks < max(160, 0.12 * da[j] * bar_ticks) for j, dv in pairs]
    out['duration_agreement'] = round(sum(ok) / len(ok), 3)
    out['compared'] = len(pairs)
    # the same comparison with the bar length divided out: the cursor's own seconds per written
    # quarter, and how many intervals agree with it. This separates a wrong bar length (a
    # misread cursor_bar, or the wrong meter) from wrong note values: duration_agreement low
    # with duration_agreement_free high means only the bar length is in doubt.
    rr = np.array([(vev[v_of[j + 1]]['t'] - vev[v_of[j]]['t']) / (da[j] * bar_ticks / 960.0)
                   for j, _ in pairs if da[j] > 0])
    if len(rr):
        med = float(np.median(rr))
        out['cursor_bpm'] = round(60 / med, 1)
        out['duration_agreement_free'] = round(float(np.mean(np.abs(rr / med - 1) < 0.12)), 3)
    # downbeats: cursor bar starts that the output also puts on a downbeat
    starts = [j for j in range(1, J) if j in v_of and j - 1 in v_of and vev[v_of[j]]['bar'] != vev[v_of[j - 1]]['bar']]
    if starts:
        out['downbeat_agreement'] = round(sum(1 for j in starts if timeline[j]['tick'] % bar_ticks == 0) / len(starts), 3)
    return out


# ----------------------------------------------------------------------------------------------
# verdict
# ----------------------------------------------------------------------------------------------

def verdict(rep):
    """auto-ok only when every signal is clean; a wrong auto-ok costs more than a review."""
    if rep.get('error'):
        return 'fail', rep['error'][:200]
    cov = rep.get('coverage', 0)
    if cov < 0.5 or 'meter' not in rep:
        return 'fail', f'only {cov:.0%} of the tab is heard in the recording (other arrangement, or a full band without --demucs)'
    if not rep.get('verify_ok'):
        return 'fail', 'apply/verify failed: ' + (rep.get('apply_error') or 'see verify.txt')[:150]
    J = rep['tab_beats']
    r = rep['residual']
    why = []
    if cov < 0.95:
        why.append(f'{cov:.0%} of the tab heard')
    if r['p90_pct'] > 12 or r['over25pct'] > max(1, 0.01 * J):
        why.append(f"timing loose (p90 {r['p90_pct']}%, {r['over25pct']} notes >25% off)")
    if rep['capped']:
        why.append(f"{rep['capped']} held notes fit no value (rubato/fermata)")
    if rep['tempo_spread_pct'] > 10 or len(rep['meter']['tempo_sections']) > 1:
        why.append(f"tempo moves ({rep['tempo_spread_pct']}% spread, {len(rep['meter']['tempo_sections'])} sections)")
    # Meter and tempo octave: on melody tabs the audio alone picked the right bar length for
    # only ~60% of the pilot, and its cost margin did not tell those apart. So they count as
    # confirmed only by an independent signal: real ASCII bar lines, or the video's on-screen bars.
    tb = rep.get('tie_break', {})
    if 'chosen' in tb:
        why.append(f"audio alone preferred {tb['audio_choice']}; the on-screen bars chose {tb['chosen']}")
    elif not (rep.get('cursor_bar_match') or rep.get('ascii_barlines_used')):
        why.append(f"meter/tempo unconfirmed: {rep['audio_choice']} (alternatives: "
                   + ', '.join(a['name'] for a in rep.get('alternates', [])) + ')')
    if rep['jumps']:
        why.append(f"recording jumps {rep['jumps']}x (repeats)")
    if rep['interpolated'] + rep['unknown'] > 0.02 * J:
        why.append(f"{rep['interpolated'] + rep['unknown']} notes not heard")
    if rep['triplet_notes'] > 0.05 * J:
        why.append(f"{rep['triplet_notes']} triplet notes")
    if rep.get('pitch_suspects'):
        why.append(f"{rep['pitch_suspects']} possible wrong notes in the tab")
    vc = rep.get('video_check', {})
    if vc.get('duration_agreement') is not None:
        if vc['duration_agreement'] < 0.85 or vc.get('downbeat_agreement', 0) < 0.85 or vc.get('coverage', 0) < 0.9:
            msg = (f"on-screen cursor agrees on {vc['duration_agreement']:.0%} of durations, "
                   f"{vc.get('downbeat_agreement', 0):.0%} of downbeats")
            free = vc.get('duration_agreement_free')
            if free is not None and free - vc['duration_agreement'] > 0.3:
                msg += (f" (but {free:.0%} once the bar length is divided out, at {vc['cursor_bpm']:.0f} bpm: "
                        'the note values look right and only the bar length is in doubt)')
            why.append(msg)
    if why:
        return 'review', '; '.join(why)
    return 'auto-ok', 'clean alignment, steady tempo, every note on the grid'


# ----------------------------------------------------------------------------------------------

def finish(rep, spec, out, args, notes, bj, py):
    """Apply the spec, verify it, and run pitch-check on the audio alignment."""
    rep['verify_ok'] = False
    if not spec:
        return
    sp = os.path.join(out, 'spec.json')
    json.dump(spec, open(sp, 'w'))
    if not args.no_apply:
        og = os.path.join(out, 'out.gp')
        r = subprocess.run([NODE, 'scripts/rhythm/apply-rhythm.ts', os.path.abspath(args.gp), sp, og], cwd=REPO,
                           capture_output=True, text=True)
        if r.returncode:
            rep['apply_error'] = (r.stderr or r.stdout)[-600:]
        else:
            r = subprocess.run([NODE, 'scripts/rhythm/verify.ts', os.path.abspath(args.gp), og, '--flat'], cwd=REPO,
                               capture_output=True, text=True)
            open(os.path.join(out, 'verify.txt'), 'w').write(r.stdout + r.stderr)
            rep['verify_ok'] = r.returncode == 0
    else:
        rep['verify_ok'] = True
    # the runner-up readings (another meter or tempo octave), ready to open if the first is wrong
    for i, alt in enumerate(rep.get('alternates', []), 1):
        name = alt['name'].replace('/', '-').replace('@', '-q')
        ap_ = os.path.join(out, f'alt{i}-{name}.spec.json')
        json.dump(alt.pop('spec'), open(ap_, 'w'))
        alt['file'] = os.path.basename(ap_)
        if not args.no_apply:
            r = subprocess.run([NODE, 'scripts/rhythm/apply-rhythm.ts', os.path.abspath(args.gp), ap_,
                                os.path.join(out, f'alt{i}-{name}.gp')], cwd=REPO, capture_output=True, text=True)
            if r.returncode == 0:
                alt['gp'] = f'alt{i}-{name}.gp'
    # tab notes the recording disagrees with: to listen to, never auto-fixed
    aj = os.path.join(args.work, 'align-audio.json')
    json.dump([{'t': t, 'k': k} for t, k in rep['audio_pairs']], open(aj, 'w'))
    r = subprocess.run([py, '-I', os.path.join(HERE, 'pitch-check.py'), notes, bj, aj], capture_output=True, text=True)
    rep['pitch_check'] = [l for l in r.stdout.splitlines() if l.startswith('bar ')]
    rep['pitch_suspects'] = len(rep['pitch_check'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gp', required=True)
    ap.add_argument('--url', required=True)
    ap.add_argument('--work', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--id', default='')
    ap.add_argument('--title', default='')
    ap.add_argument('--demucs', default='auto', choices=['auto', 'always', 'never'])
    ap.add_argument('--video-check', action='store_true')
    ap.add_argument('--meters', default='4/4,3/4,6/8,2/4')
    ap.add_argument('--no-apply', action='store_true')
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)
    timings = {}
    t_start, cpu0 = time.time(), cpu_seconds()
    py = sys.executable
    rep = {}
    flags = defaultdict(list)
    try:
        wav = os.path.join(args.work, 'audio.wav')
        # with --video-check the 480p video carries the audio too: one download instead of two
        media = None if os.path.exists(wav) else fetch(args.url, args.work, timings, video=args.video_check)
        run_stage('audio', wav, ['ffmpeg', '-loglevel', 'error', '-y', '-i', media, '-vn', '-ac', '1', '-ar', '22050', wav], timings)
        notes = os.path.join(args.work, 'notes.csv')
        run_stage('basic-pitch', notes, [py, '-I', os.path.join(HERE, 'transcribe.py'), wav, notes], timings)
        bj = os.path.join(args.work, 'beats.json')
        run_stage('export-beats', bj, [NODE, 'scripts/rhythm/export-beats.ts', os.path.abspath(args.gp), bj], timings, cwd=REPO)
        beats = json.load(open(bj))
        load = lambda p: [(float(a), float(b), int(c), float(d)) for a, b, c, d in csv.reader(open(p))]
        rows = load(notes)
        meters = args.meters.split(',')
        t0 = time.time()
        rep, spec, timeline = analyse(beats, rows, meters, flags)
        rep['transcribed_from'] = 'mix'
        if args.demucs == 'always' or (args.demucs == 'auto' and rep['coverage'] < 0.75):
            stem = os.path.join(args.work, 'stems', 'htdemucs_6s', 'audio', 'guitar.wav')
            run_stage('demucs', stem, [py, '-I', '-m', 'demucs', '-n', 'htdemucs_6s', '-o', os.path.join(args.work, 'stems'), wav], timings)
            gnotes = os.path.join(args.work, 'guitar-notes.csv')
            run_stage('basic-pitch-stem', gnotes, [py, '-I', os.path.join(HERE, 'transcribe.py'), stem, gnotes], timings)
            f2 = defaultdict(list)
            rep2, spec2, tl2 = analyse(beats, load(gnotes), meters, f2)
            if rep2['coverage'] > rep['coverage'] or args.demucs == 'always':
                rep2['coverage_mix'] = rep['coverage']
                rep, spec, timeline, flags = rep2, spec2, tl2, f2
                rep['transcribed_from'] = 'guitar stem'
                notes, rows = gnotes, load(gnotes)
        timings['analyse'] = round(time.time() - t0, 1)
        finish(rep, spec, args.out, args, notes, bj, py)
        rep['verdict'] = list(verdict(rep))
        rep['verdict_audio_only'] = rep['verdict']
        if args.video_check and spec:
            vt0 = time.time()
            video = fetch(args.url, args.work, timings, video=True)
            vj = os.path.join(args.work, 'video.json')
            run_stage('video-cursor', vj, [py, '-I', os.path.join(HERE, 'video-cursor.py'), video, vj], timings)
            vid = json.load(open(vj))
            m = rep['meter']['ts']
            rep['video_check'] = compare_cursor(vid, beats, timeline, m[0] * 4 * TPQ // m[1])
            Bv = cursor_bar(vid)
            if Bv:
                rep['cursor_bar_match'] = abs(rep['candidates'][0]['bar_s'] / Bv - 1) < 0.06
                f3 = defaultdict(list)
                rep3, spec3, tl3 = analyse(beats, rows, meters, f3, cursor_bar_s=Bv)
                if 'chosen' in rep3.get('tie_break', {}):
                    # keep the audio-only result next to the tie-broken one
                    alt = os.path.join(args.out, 'audio-only')
                    os.makedirs(alt, exist_ok=True)
                    for f in ('spec.json', 'out.gp', 'verify.txt'):
                        if os.path.exists(os.path.join(args.out, f)):
                            shutil.move(os.path.join(args.out, f), os.path.join(alt, f))
                    json.dump(timeline, open(os.path.join(alt, 'timeline.json'), 'w'))
                    audio_only = {'choice': rep['audio_choice'], 'verdict': rep['verdict_audio_only'], 'video_check': rep['video_check'],
                                  'meter': rep['meter']}
                    rep3['transcribed_from'] = rep['transcribed_from']
                    finish(rep3, spec3, args.out, args, notes, bj, py)
                    m = rep3['meter']['ts']
                    rep3['video_check'] = compare_cursor(vid, beats, tl3, m[0] * 4 * TPQ // m[1])
                    rep3['audio_only'] = audio_only
                    rep3['cursor_bar_match'] = True
                    rep3['verdict_audio_only'] = rep['verdict_audio_only']
                    rep, spec, timeline, flags = rep3, spec3, tl3, f3
            timings['video-check'] = round(time.time() - vt0, 1)
        rep.pop('audio_pairs', None)
    except Exception as e:  # noqa: BLE001 - one song must not stop a batch
        rep['error'] = f'{type(e).__name__}: {e}'
    v = verdict(rep)
    rep['verdict'] = list(v)
    timings['total'] = round(time.time() - t_start, 1)
    timings['cpu'] = round(cpu_seconds() - cpu0, 1)
    rep['timings_s'] = timings
    rep['id'] = args.id
    rep['title'] = args.title
    rep['flags'] = {str(k): sorted(set(x)) for k, x in sorted(flags.items())}
    json.dump(rep, open(os.path.join(args.out, 'report.json'), 'w'), indent=1, default=str)
    if timeline:
        json.dump(timeline, open(os.path.join(args.out, 'timeline.json'), 'w'))
    write_md(rep, os.path.join(args.out, 'report.md'))
    print(json.dumps({'id': args.id, 'verdict': v[0], 'why': v[1], 'wall_s': timings['total'], 'cpu_s': timings['cpu']}))


def write_md(rep, path):
    L = [f"# {rep.get('id', '')} {rep.get('title', '')}", '', f"**{rep['verdict'][0]}**: {rep['verdict'][1]}", '']
    if 'meter' in rep:
        m = rep['meter']
        L.append(f"- meter {m['ts'][0]}/{m['ts'][1]}, tempo {m['tempo_sections']} (q bpm; 10-90%: {m['bpm_p10_p90']})")
    for k in ('transcribed_from', 'coverage', 'coverage_mix', 'residual', 'meter_costs', 'meter_margin', 'tempo_spread_pct',
              'ascii_barlines_on_downbeats', 'capped', 'jumps', 'interpolated', 'unknown', 'triplet_notes', 'bars_out',
              'pitch_suspects', 'video_check', 'timings_s', 'error', 'apply_error'):
        if k in rep:
            L.append(f'- {k}: {json.dumps(rep[k], default=str)}')
    if rep.get('pitch_check'):
        L += ['', '## pitch-check (possible tab errors: listen, never auto-fixed)'] + [f'- {x}' for x in rep['pitch_check']]
    if rep.get('flags'):
        L += ['', '## flagged bars (output bar numbers)']
        for b, fl in rep['flags'].items():
            L.append(f'- bar {b}: ' + '; '.join(fl))
    open(path, 'w').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
