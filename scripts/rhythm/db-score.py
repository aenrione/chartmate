# Read or write a composition's Guitar Pro bytes straight from Chartmate's SQLite library,
# for when the MCP (get_composition_score / update_composition_score) isn't reachable.
# usage: db-score.py get <id> <out.gp>
#        db-score.py put <id> <in.gp>
#
# The app stores score_data as TEXT holding a JSON byte array ("[80,75,3,...]"), which is
# how the Tauri SQL plugin serialises an ArrayBuffer. Raw BLOBs also load, but `put` writes
# the app's own format so every row looks the same. sqlite3's readfile()/writefile() do NOT
# handle the JSON form — writefile() would give you a text file, not a .gp.
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB = os.environ.get('CHARTMATE_DB', os.path.expanduser('~/Library/Application Support/com.chartmate/chartmate.db'))
cmd, cid, path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
con = sqlite3.connect(DB)

if cmd == 'get':
    row = con.execute('select score_data from tab_compositions where id=?', (cid,)).fetchone()
    if not row:
        sys.exit(f'no composition {cid}')
    data = row[0]
    raw = bytes(json.loads(data)) if isinstance(data, str) else bytes(data)
    open(path, 'wb').write(raw)
    print(f'{len(raw)} bytes -> {path}')
elif cmd == 'put':
    raw = open(path, 'rb').read()
    if raw[:2] != b'PK':
        sys.exit(f'{path} is not a GP7 file (GP7 is a zip)')
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    cur = con.execute('update tab_compositions set score_data=?, updated_at=? where id=?',
                      (json.dumps(list(raw), separators=(',', ':')), now, cid))
    con.commit()
    if cur.rowcount != 1:
        sys.exit(f'no composition {cid}')
    print(f'{len(raw)} bytes -> composition {cid}')
else:
    sys.exit('usage: db-score.py get|put <id> <file>')
