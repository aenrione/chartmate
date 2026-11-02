#!/usr/bin/env bash
# Everything mechanical before the rhythm decisions, in one command:
#   audio.wav  <- the recording (yt-dlp)
#   guitar.wav <- guitar stem (Demucs htdemucs_6s)
#   notes.csv  <- transcribed guitar notes: onset_s,offset_s,midi,amplitude (basic-pitch)
#   vocal-notes.csv, bass-notes.csv <- the same for the vocal and bass stems
#   tempo.txt  <- global and windowed tempo estimates (librosa)
#   stem-energy.txt <- which stems have content, and which grid tool fits (solo vs full band)
#
# usage: scripts/rhythm/prepare.sh <youtube-url|audio-file> <workdir>
# Steps whose output already exists are skipped, so re-running is cheap.
# An age-restricted or sign-in-required video fails with exit code 2 and a hint: find the
# artist's own upload of the same recording instead. Never pass browser cookies to yt-dlp
# without asking the user.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$1"
WORK="$2"
VENV="$("$HERE/setup.sh" | tail -1)"
PY="$VENV/bin/python"
mkdir -p "$WORK"

if [ ! -f "$WORK/audio.wav" ]; then
  if [ -f "$SRC" ]; then
    ffmpeg -loglevel error -y -i "$SRC" -ac 2 -ar 44100 "$WORK/audio.wav"
  else
    # Homebrew's yt-dlp falls behind YouTube and gets HTTP 403; always use the latest release.
    if ! uvx yt-dlp@latest -x --audio-format wav -o "$WORK/audio.%(ext)s" "$SRC" 2>&1 | tee "$WORK/yt-dlp.log"; then
      if grep -qiE 'confirm your age|age-restricted|inappropriate for some users|sign in|log in|cookies|members-only|private video' "$WORK/yt-dlp.log"; then
        cat >&2 <<'MSG'

prepare.sh: YouTube wants a signed-in (or age-verified) session for this video, so it can't be
downloaded anonymously. Do not use browser cookies unless the user says so. Instead:
  1. Find the artist's own upload of the same recording (official channel, or the
     "<Artist> - Topic" auto upload) and run prepare.sh on that URL, or ask the user for a file.
  2. Check it is the same recording, not a live take or another edit: compare the durations,
     and run scripts/transcribe/xcorr.py between candidate uploads.
MSG
        exit 2
      fi
      echo "prepare.sh: yt-dlp failed, see $WORK/yt-dlp.log" >&2
      exit 1
    fi
  fi
fi

if [ ! -f "$WORK/guitar.wav" ]; then
  # htdemucs_6s is the 6-stem model; it has a dedicated guitar stem (the 4-stem one doesn't).
  "$PY" -I -m demucs -n htdemucs_6s -o "$WORK/stems" "$WORK/audio.wav"
  cp "$WORK/stems/htdemucs_6s/audio/guitar.wav" "$WORK/guitar.wav"
fi

[ -f "$WORK/notes.csv" ] || "$PY" -I "$HERE/transcribe.py" "$WORK/guitar.wav" "$WORK/notes.csv"
# Bass and voice too (~30 s each): they tell real guitar notes from stem bleed
# (scripts/transcribe/quantize.py --vocals, and checking a low note against the bass stem).
STEMS="$WORK/stems/htdemucs_6s/audio"
[ -f "$WORK/vocal-notes.csv" ] || "$PY" -I "$HERE/transcribe.py" "$STEMS/vocals.wav" "$WORK/vocal-notes.csv"
[ -f "$WORK/bass-notes.csv" ] || "$PY" -I "$HERE/transcribe.py" "$STEMS/bass.wav" "$WORK/bass-notes.csv"
[ -f "$WORK/tempo.txt" ] || "$PY" -I "$HERE/tempo.py" "$WORK/guitar.wav" | tee "$WORK/tempo.txt"
if [ ! -f "$WORK/stem-energy.txt" ]; then
  "$PY" -I "$HERE/../transcribe/stem-energy.py" "$STEMS" --summary > "$WORK/stem-energy.txt.tmp"
  mv "$WORK/stem-energy.txt.tmp" "$WORK/stem-energy.txt"
fi
echo "stems ($WORK/stem-energy.txt):"
cat "$WORK/stem-energy.txt"

echo "ready: $WORK/{audio.wav,guitar.wav,notes.csv,vocal-notes.csv,bass-notes.csv,tempo.txt,stem-energy.txt}"
