#!/usr/bin/env bash
set -euo pipefail

IPA="$(dirname "$0")/../src-tauri/gen/apple/build/arm64/Chartmate.ipa"

if [[ ! -f "$IPA" ]]; then
  echo "No IPA found at $IPA — run 'pnpm tauri ios build --export-method debugging' first."
  exit 1
fi

DEVICES=$(xcrun devicectl list devices 2>/dev/null | tail -n +3 | grep -v '^\s*$')
COUNT=$(echo "$DEVICES" | wc -l | tr -d ' ')

if [[ "$COUNT" -eq 1 ]]; then
  SELECTED="$DEVICES"
else
  SELECTED=$(echo "$DEVICES" | fzf --prompt="Select device > " --height=40% --border)
fi

if [[ -z "$SELECTED" ]]; then
  echo "No device selected."
  exit 0
fi

DEVICE_ID=$(echo "$SELECTED" | awk '{print $3}')
DEVICE_NAME=$(echo "$SELECTED" | awk '{print $1, $2}')

echo "Installing on: $DEVICE_NAME ($DEVICE_ID)"
xcrun devicectl device install app --device "$DEVICE_ID" "$IPA"
echo "Done."
