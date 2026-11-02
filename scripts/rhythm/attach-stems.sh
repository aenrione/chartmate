#!/usr/bin/env bash
# Attach Demucs stems to a library composition so the tab editor's STEMS panel plays them.
# Encodes them as MP3 into Chartmate's managed stem folder and records the association —
# the same layout the app's own "link stems" flow uses (song key "tab-editor:<id>").
#
# usage: scripts/rhythm/attach-stems.sh <demucs-output-dir> <composition-id>
#   demucs-output-dir: the folder holding drums/bass/vocals/guitar/other(.wav), e.g.
#   <workdir>/stems/htdemucs_6s/audio from prepare.sh. A piano stem (6-stem model) is mixed
#   into "other", because the app only knows drums/bass/vocals/guitar/other.
set -euo pipefail

SRC="$1"
ID="$2"
APP_DATA="${CHARTMATE_APP_DATA:-$HOME/Library/Application Support/com.chartmate}"
DB="$APP_DATA/chartmate.db"
KEY="tab-editor:$ID"
DEST="$APP_DATA/stems/$KEY"

[ "$(sqlite3 "$DB" "select count(*) from tab_compositions where id=$ID")" = 1 ] \
  || { echo "no composition with id $ID" >&2; exit 1; }
mkdir -p "$DEST"

for stem in drums bass vocals guitar; do
  [ -f "$SRC/$stem.wav" ] && ffmpeg -loglevel error -y -i "$SRC/$stem.wav" -codec:a libmp3lame -q:a 2 "$DEST/$stem.mp3"
done
if [ -f "$SRC/piano.wav" ] && [ -f "$SRC/other.wav" ]; then
  ffmpeg -loglevel error -y -i "$SRC/other.wav" -i "$SRC/piano.wav" \
    -filter_complex "amix=inputs=2:normalize=0" -codec:a libmp3lame -q:a 2 "$DEST/other.mp3"
elif [ -f "$SRC/other.wav" ]; then
  ffmpeg -loglevel error -y -i "$SRC/other.wav" -codec:a libmp3lame -q:a 2 "$DEST/other.mp3"
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
sqlite3 "$DB" "insert into stem_associations (song_key, stem_folder_path, created_at)
  values ('$KEY', '$DEST', '$NOW')
  on conflict(song_key) do update set stem_folder_path=excluded.stem_folder_path"
ls -1 "$DEST"
echo "linked $KEY -> $DEST (reopen the tab in the editor to load them)"
