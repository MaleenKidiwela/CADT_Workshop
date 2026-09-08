#!/usr/bin/env bash
# Full-page screenshot of the built site with a local Chrome or Edge.
#   scripts/screenshot.sh [page.html] [width]
# Writes _screenshots/<page>.png. Run `pixi run build` first.
set -euo pipefail
cd "$(dirname "$0")/.."
PAGE="${1:-index.html}"
WIDTH="${2:-1440}"
[ -f "_site/$PAGE" ] || { echo "missing _site/$PAGE; run: pixi run build" >&2; exit 1; }
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "$(command -v google-chrome || true)" "$(command -v chromium || true)" "$(command -v chromium-browser || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && CHROME="$c" && break
done
[ -n "${CHROME:-}" ] || { echo "no Chrome/Edge found" >&2; exit 1; }
mkdir -p _screenshots
OUT="_screenshots/${PAGE%.html}.png"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
  --window-size="${WIDTH},15000" --virtual-time-budget=4000 \
  --screenshot="$OUT" "file://$PWD/_site/$PAGE" >/dev/null 2>&1
echo "wrote $OUT"
