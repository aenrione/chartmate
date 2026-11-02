# Run auto-rhythm.py over a candidate list, several songs at a time, and summarise.
#
# usage: batch-rhythm.py <candidates.json> <gp-dir> <out-root> [--ids 874,909] [--skip 8,10]
#                        [--jobs 4] [--video-check] [--demucs auto|always|never] [--force]
#   candidates.json: [{"id", "title", "yt", ...}]; the GP for id N is <gp-dir>/N.gp
#   <out-root>/work/<id>/   downloads and intermediate files (untrusted)
#   <out-root>/out/<id>/    spec.json, out.gp, report.json, report.md
#   <out-root>/summary.json, summary.md   one row per song: verdict, reason, metrics, time
# Songs with an existing report.json are skipped unless --force. Run with the rhythm venv's
# python and -I.
import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))


def run_one(c, args):
    sid = str(c['id'])
    out = os.path.join(args.root, 'out', sid)
    rp = os.path.join(out, 'report.json')
    if os.path.exists(rp) and not args.force:
        return json.load(open(rp))
    cmd = [sys.executable, '-I', os.path.join(HERE, 'auto-rhythm.py'), '--gp', os.path.join(args.gp_dir, f'{sid}.gp'),
           '--url', c['yt'], '--work', os.path.join(args.root, 'work', sid), '--out', out, '--id', sid,
           '--title', c.get('title', ''), '--demucs', args.demucs]
    if args.video_check:
        cmd.append('--video-check')
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True)
    if not os.path.exists(rp):
        return {'id': sid, 'title': c.get('title', ''), 'verdict': ['fail', 'crashed: ' + (r.stderr or r.stdout)[-200:]],
                'timings_s': {'total': round(time.time() - t0, 1)}}
    rep = json.load(open(rp))
    print(f"{sid:>5} {rep['verdict'][0]:8} {rep['timings_s'].get('total', 0):6.1f}s  {rep.get('title', '')[:30]:30} {rep['verdict'][1][:90]}",
          flush=True)
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('candidates')
    ap.add_argument('gp_dir')
    ap.add_argument('root')
    ap.add_argument('--ids', default='')
    ap.add_argument('--skip', default='')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--video-check', action='store_true')
    ap.add_argument('--demucs', default='auto')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    cands = json.load(open(args.candidates))
    ids = {x for x in args.ids.split(',') if x}
    skip = {x for x in args.skip.split(',') if x}
    cands = [c for c in cands if (not ids or str(c['id']) in ids) and str(c['id']) not in skip]
    os.makedirs(args.root, exist_ok=True)
    t0 = time.time()
    # basic-pitch and the DP are CPU-bound and use 1-2 cores each; downloads overlap with them
    with ThreadPoolExecutor(args.jobs) as ex:
        reps = list(ex.map(lambda c: run_one(c, args), cands))
    wall = time.time() - t0
    rows = []
    for r in reps:
        m = r.get('meter', {})
        vc = r.get('video_check', {})
        ao = r.get('audio_only') or {}
        tm = r.get('timings_s', {})
        rows.append({'id': r.get('id'), 'title': r.get('title'), 'verdict': r['verdict'][0], 'why': r['verdict'][1],
                     'verdict_audio_only': (r.get('verdict_audio_only') or r['verdict'])[0],
                     'meter': '/'.join(map(str, m.get('ts', []))), 'bpm': m.get('bpm'), 'coverage': r.get('coverage'),
                     'p90_pct': r.get('residual', {}).get('p90_pct'), 'flagged_bars': len(r.get('flags', {})),
                     'bars': r.get('bars_out'), 'tie_break': 'chosen' in r.get('tie_break', {}),
                     'cursor_bar_match_audio_only': (not ao) and r.get('cursor_bar_match'),
                     'video_agree': vc.get('duration_agreement'), 'video_downbeats': vc.get('downbeat_agreement'),
                     'video_agree_audio_only': (ao.get('video_check') or vc).get('duration_agreement'),
                     'wall_s': tm.get('total'), 'cpu_s': tm.get('cpu'),
                     'basic_pitch_s': tm.get('basic-pitch'), 'cursor_s': tm.get('video-cursor')})
    json.dump({'wall_s': round(wall, 1), 'songs': rows}, open(os.path.join(args.root, 'summary.json'), 'w'), indent=1)
    cnt = lambda key, v: sum(1 for x in rows if x[key] == v)
    withv = [x for x in rows if x['video_agree'] is not None]
    L = [f'# auto-rhythm batch: {len(rows)} songs in {wall / 60:.1f} min', '',
         f"final: auto-ok {cnt('verdict', 'auto-ok')}, review {cnt('verdict', 'review')}, fail {cnt('verdict', 'fail')}  |  "
         f"audio only: auto-ok {cnt('verdict_audio_only', 'auto-ok')}, review {cnt('verdict_audio_only', 'review')}, "
         f"fail {cnt('verdict_audio_only', 'fail')}"]
    if withv:
        L.append(f"cursor check on {len(withv)}: audio-only bar length matched the on-screen bars in "
                 f"{sum(1 for x in withv if x['cursor_bar_match_audio_only'])}, tie-broken in {sum(1 for x in withv if x['tie_break'])}")
    L += ['', '| id | title | verdict | audio-only | meter | bpm | cov | p90% | flagged/bars | cursor dur/downbeat | cpu s | why |',
          '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for x in sorted(rows, key=lambda x: ({'fail': 0, 'review': 1, 'auto-ok': 2}[x['verdict']], str(x['id']))):
        L.append(f"| {x['id']} | {(x['title'] or '')[:28]} | {x['verdict']} | {x['verdict_audio_only']} | {x['meter']} | {x['bpm']} | "
                 f"{x['coverage']} | {x['p90_pct']} | {x['flagged_bars']}/{x['bars']} | {x['video_agree']}/{x['video_downbeats']} | "
                 f"{x['cpu_s']} | {x['why'][:140]} |")
    open(os.path.join(args.root, 'summary.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L[:4]))


if __name__ == '__main__':
    main()
