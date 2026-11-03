#!/usr/bin/env bash
# Renders popup.html with mocked state in headless Chrome; writes docs/popup-<state>-<scheme>.png
set -e; cd "$(dirname "$0")/.."; T=$(mktemp -d); cp -r popup.html popup.css popup.js icons tools/mock-chrome.js "$T"/
sed -i 's#<script src="popup.js">#<script src="mock-chrome.js"></script><script src="popup.js">#' "$T/popup.html"
CHROME=${CHROME:-google-chrome}
for st in idle scanned running done error; do for sch in light dark; do
  $CHROME --headless=new --no-sandbox --disable-gpu --hide-scrollbars $([ $sch = dark ] && echo --force-dark-mode) --virtual-time-budget=1500 --window-size=368,1100 --screenshot="$T/raw.png" "file://$T/popup.html?state=$st" >/dev/null 2>&1
  python3 tools/trim.py "$T/raw.png" "docs/popup-$st-$sch.png"
done; done; rm -rf "$T"
