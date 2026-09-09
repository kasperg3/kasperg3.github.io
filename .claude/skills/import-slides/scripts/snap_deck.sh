#!/usr/bin/env bash
# Screenshot slides of a knowledge deck at the native 1920x1080 stage size.
#
#   scripts/snap_deck.sh <slug> [first] [last] [outdir]
#
# Serves the repository root on a spare port, drives headless Chromium over
# each /knowledge/<slug>/#N and writes <outdir>/<slug>-NN.png. Look at the
# PNGs: overflow past the stage, cards painting over a sibling and images
# squashed by a caption are the things the engine cannot catch for you.
#
# Chromium is found from $CHROME, then the Playwright cache under
# /opt/pw-browsers, then PATH (chromium, google-chrome). No Node or Python
# package is needed.
set -euo pipefail

slug=${1:?usage: snap_deck.sh <slug> [first] [last] [outdir]}
first=${2:-1}
last=${3:-}
outdir=${4:-${TMPDIR:-/tmp}/deck-snaps}

repo=$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)
deck="$repo/knowledge/$slug/index.html"
[ -f "$deck" ] || { echo "no deck at $deck" >&2; exit 1; }

if [ -z "$last" ]; then
  last=$(grep -c '<section class="slide' "$deck")
fi

chrome=${CHROME:-}
if [ -z "$chrome" ]; then
  for c in /opt/pw-browsers/chromium-*/chrome-linux/chrome \
           "$(command -v chromium 2>/dev/null || true)" \
           "$(command -v chromium-browser 2>/dev/null || true)" \
           "$(command -v google-chrome 2>/dev/null || true)" \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [ -n "$c" ] && [ -x "$c" ]; then chrome=$c; break; fi
  done
fi
[ -n "$chrome" ] || { echo "no Chromium found; set CHROME=/path/to/chrome" >&2; exit 1; }

port=$(( 8400 + RANDOM % 500 ))
( cd "$repo" && python3 -m http.server "$port" >/dev/null 2>&1 ) &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
sleep 0.6

mkdir -p "$outdir"
for n in $(seq "$first" "$last"); do
  out=$(printf '%s/%s-%02d.png' "$outdir" "$slug" "$n")
  # Web fonts are mapped to nowhere so a blocked or slow font host fails fast
  # instead of holding the virtual clock; the stage renders in fallback faces.
  # Reduced motion turns the deck's entrance animations off (deck.css honours
  # it), so a capture never lands on a half-revealed slide.
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-prefers-reduced-motion \
    --host-resolver-rules="MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND" \
    --window-size=1920,1080 --virtual-time-budget=8000 \
    --screenshot="$out" "http://localhost:$port/knowledge/$slug/#$n" >/dev/null 2>&1
  echo "$out"
done
