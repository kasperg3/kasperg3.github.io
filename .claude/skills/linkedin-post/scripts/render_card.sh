#!/usr/bin/env bash
# Render a LinkedIn card (an HTML file under cards/) to a PNG at 2x.
#
#   scripts/render_card.sh <card.html> [out.png] [width] [height]
#
# Defaults to 1200x1200, the square LinkedIn feed image. The card is served
# from the repository root so it can pull in /site/site.css and /blog/blog.css
# and reuse a figure lifted straight out of a post.
#
# Headless Chromium gives the page a viewport a few dozen pixels shorter than
# --window-size, so anything pinned to the bottom of the card is clipped away
# without any error. The fix is to render tall and crop back: never drop the
# +120 here, and always look at the PNG before posting it.
set -euo pipefail

card=${1:?usage: render_card.sh <card.html> [out.png] [width] [height]}
out=${2:-${card%.html}.png}
w=${3:-1200}
h=${4:-1200}
repo=$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)

chrome=${CHROME:-}
if [ -z "$chrome" ]; then
  for c in "$(command -v google-chrome 2>/dev/null || true)" \
           "$(command -v chromium 2>/dev/null || true)" \
           "$(command -v chromium-browser 2>/dev/null || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then chrome=$c; break; fi
  done
fi
[ -n "$chrome" ] || { echo "no Chromium found; set CHROME=/path/to/chrome" >&2; exit 1; }

port=$(( 8400 + RANDOM % 500 ))
( cd "$repo" && python3 -m http.server "$port" >/dev/null 2>&1 ) &
server=$!
tmp=$(mktemp -d)
trap 'kill $server 2>/dev/null || true; rm -rf "$tmp"' EXIT
sleep 0.6

cp "$card" "$repo/.render-card.html"
trap 'kill $server 2>/dev/null || true; rm -rf "$tmp" "$repo/.render-card.html"' EXIT

"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --force-prefers-reduced-motion --force-device-scale-factor=2 \
  --window-size="$w",$(( h + 120 )) --virtual-time-budget=9000 \
  --screenshot="$tmp/raw.png" "http://localhost:$port/.render-card.html" >/dev/null 2>&1

python3 - "$tmp/raw.png" "$out" "$w" "$h" <<'PY'
import sys
from PIL import Image
raw, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
Image.open(raw).crop((0, 0, w * 2, h * 2)).save(out)
print(out, f"{w*2}x{h*2}")
PY
