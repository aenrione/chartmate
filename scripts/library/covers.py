# Give library compositions that have no thumbnail a generated cover image.
# Songs should get their recording's YouTube thumbnail instead (see the tab_ingest_guide MCP
# tool); this is for things with no video, like practice exercises.
#
# usage: covers.py [--ids 1023,1024] [--force] [--dry-run]
#   default: every saved composition with no preview_image and no youtube_url
#   --ids     only these compositions (still skips ones that have an image, unless --force)
#   --force   replace an existing preview_image
#
# The cover is an SVG data URI stored in tab_compositions.preview_image, the same column the
# library card reads as <img src>. Colour comes from the artist, so exercises from the same
# source look like a set; a stylised six-string staff with an arpeggio sits behind the title.
import argparse
import base64
import hashlib
import os
import re
import sqlite3
from xml.sax.saxutils import escape

DB = os.environ.get('CHARTMATE_DB', os.path.expanduser('~/Library/Application Support/com.chartmate/chartmate.db'))
W, H = 480, 270


def hue(text: str) -> int:
    return int(hashlib.sha1(text.encode()).hexdigest()[:4], 16) % 360


def wrap(text: str, width: int, lines: int) -> list[str]:
    out, cur = [], ''
    for word in text.split():
        if len(cur) + len(word) + 1 > width and cur:
            out.append(cur)
            cur = word
        else:
            cur = f'{cur} {word}'.strip()
    out.append(cur)
    if len(out) > lines:
        out = out[:lines]
        out[-1] = out[-1][: width - 1].rstrip() + '…'
    return out


def cover(title: str, artist: str, seed: int) -> str:
    h = hue(artist or title)
    short = re.sub(r'^Ejercicio\s*[–-]\s*', '', title)
    kicker = 'EJERCICIO' if short != title else ''
    # six strings, and an arpeggio of dots climbing and falling across them
    strings = ''.join(
        f'<line x1="0" y1="{60 + i * 30}" x2="{W}" y2="{60 + i * 30}" stroke="white" '
        f'stroke-opacity="0.10" stroke-width="{1 + (5 - i) * 0.35:.2f}"/>' for i in range(6))
    pattern = [5, 2, 1, 3, 0, 1, 4, 2, 1, 3, 0, 1]
    dots = ''.join(
        f'<circle cx="{30 + k * 38}" cy="{60 + pattern[(k + seed) % 12] * 30}" r="7" '
        f'fill="hsl({h},70%,72%)" fill-opacity="0.35"/>' for k in range(12))
    lines = wrap(short, 26, 3)
    y0 = 135 - (len(lines) - 1) * 17
    text = ''.join(
        f'<text x="{W / 2}" y="{y0 + i * 34}" text-anchor="middle" font-size="28" font-weight="700" '
        f'fill="white">{escape(line)}</text>' for i, line in enumerate(lines))
    sub = (f'<text x="{W / 2}" y="{y0 + len(lines) * 34 + 6}" text-anchor="middle" font-size="16" '
           f'fill="white" fill-opacity="0.75">{escape(artist)}</text>') if artist else ''
    kick = (f'<text x="{W / 2}" y="{y0 - 40}" text-anchor="middle" font-size="13" letter-spacing="3" '
            f'fill="hsl({h},80%,80%)">{kicker}</text>') if kicker else ''
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
           f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="hsl({h},45%,22%)"/><stop offset="1" stop-color="hsl({(h + 40) % 360},40%,10%)"/>'
           f'</linearGradient></defs><rect width="{W}" height="{H}" fill="url(#g)"/>{strings}{dots}'
           f'<g font-family="Inter, -apple-system, Helvetica, Arial, sans-serif">{kick}{text}{sub}</g></svg>')
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()


ap = argparse.ArgumentParser()
ap.add_argument('--ids')
ap.add_argument('--force', action='store_true')
ap.add_argument('--dry-run', action='store_true')
args = ap.parse_args()

con = sqlite3.connect(DB)
if args.ids:
    ids = [int(x) for x in args.ids.split(',')]
    rows = con.execute(f"select id, title, artist, preview_image from tab_compositions where id in ({','.join('?' * len(ids))})", ids).fetchall()
else:
    rows = con.execute("select id, title, artist, preview_image from tab_compositions where is_saved = 1 "
                       "and coalesce(preview_image, '') = '' and coalesce(youtube_url, '') = ''").fetchall()
for cid, title, artist, existing in rows:
    if existing and not args.force:
        print(f'skip {cid} (has an image)')
        continue
    uri = cover(title, artist or '', cid)
    print(f'{cid} {title} ({len(uri)} bytes)')
    if not args.dry_run:
        con.execute('update tab_compositions set preview_image = ? where id = ?', (uri, cid))
con.commit()
