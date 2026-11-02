#!/usr/bin/env bash
# Rebuild a transcription after editing the arrangement: fingering -> annotate (optional) ->
# GP -> self-check. Run it after every edit; it takes seconds.
# usage (from anywhere): scripts/transcribe/rebuild.sh <arrangement.json> <workdir> <out.gp> [annotate-score.py options]
#   workdir     holds grid.json, notes.csv and vocal-notes.csv (prepare.sh + grid step);
#               score-raw.json, score.json and bars.csv are written there
#   options     any annotate-score.py options, e.g. --section-tempo --brush "125:2=down";
#               without them score.json is fingering.py's output unchanged
# env: PY (default $CHARTMATE_RHYTHM_VENV/bin/python), NODE (default node),
#      PRINT=1 (fingering --print), PICKSTROKE=1 (build-gp --pickstroke)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ARR="$1"; WORK="$2"; OUT="$3"; shift 3
PY="${PY:-${CHARTMATE_RHYTHM_VENV:-$HOME/.cache/chartmate-rhythm/venv}/bin/python}"
NODE="${NODE:-node}"

"$PY" -I "$HERE/fingering.py" "$ARR" "$WORK/score-raw.json" ${PRINT:+--print}
if [ $# -gt 0 ]; then
  "$PY" -I "$HERE/annotate-score.py" "$WORK/score-raw.json" "$WORK/grid.json" "$WORK/score.json" "$@"
else
  cp "$WORK/score-raw.json" "$WORK/score.json"
fi
"$NODE" "$HERE/build-gp.ts" "$WORK/score.json" "$OUT" ${PICKSTROKE:+--pickstroke}
VOC=()
[ -f "$WORK/vocal-notes.csv" ] && VOC=(--vocals "$WORK/vocal-notes.csv")
"$PY" -I "$HERE/selfcheck.py" "$WORK/score.json" "$WORK/grid.json" "$WORK/notes.csv" ${VOC[@]+"${VOC[@]}"} --bars-csv "$WORK/bars.csv"
