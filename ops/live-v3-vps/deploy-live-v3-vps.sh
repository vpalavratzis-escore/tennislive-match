#!/usr/bin/env bash
# One-shot deployment to the ACTIVE Hetzner Nginx webroot.
# Only adds viewer presentation assets and one script to index.html.
# Does NOT touch APIs, stream URLs, databases, nginx, Studio, or score/replay JS.
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then echo "Run as root: sudo bash deploy-live-v3-vps.sh" >&2; exit 1; fi

ROOT="/var/www/voxcourt"
REPO_RAW="https://raw.githubusercontent.com/vpalavratzis-escore/tennislive-match/dev"
V3DIR="${ROOT}/voxcourt-live-v3"
VERSION="v3-20261011-hetzner"
BACKUP="/root/voxcourt-backups/${VERSION}-$(date -u +%Y%m%dT%H%M%SZ)"
STAGING=""
COMPLETED=0

echo "VoxCourt V3 — deploying to ACTIVE site ${ROOT}"
if [[ ! -s "${ROOT}/index.html" ]]; then echo "STOP: missing ${ROOT}/index.html" >&2; exit 1; fi
if ! grep -Eq '(/voxcourt-assets/|/__vcstudio/runtime\.js)' "${ROOT}/index.html"; then
  echo "STOP: this index.html does not match the current active VoxCourt frontend" >&2; exit 1;
fi
command -v curl >/dev/null || { echo "curl not installed" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 not installed" >&2; exit 1; }
mkdir -p "${BACKUP}"
cp -a "${ROOT}/index.html" "${BACKUP}/index.html"
if [[ -d "${V3DIR}" ]]; then cp -a "${V3DIR}" "${BACKUP}/voxcourt-live-v3"; fi
echo "Backup: ${BACKUP}"

rollback(){
  local exit_code=$?
  if [[ "${COMPLETED}" -eq 0 ]]; then
    echo "Deployment did not finish; restoring previous index/assets." >&2
    cp -a "${BACKUP}/index.html" "${ROOT}/index.html" || true
    if [[ -d "${BACKUP}/voxcourt-live-v3" ]]; then
      rm -rf "${V3DIR}"
      cp -a "${BACKUP}/voxcourt-live-v3" "${V3DIR}" || true
    else
      rm -rf "${V3DIR}"
    fi
  fi
  if [[ -n "${STAGING}" && -d "${STAGING}" ]]; then rm -rf "${STAGING}"; fi
  exit "${exit_code}"
}
trap rollback ERR INT TERM

STAGING="$(mktemp -d "${ROOT}/.vc3-staging.XXXXXX")"
ASSETS=(
  court-poster.webp header-bg.webp voxcourt-logo.png club-logo.png
  player-a.png player-b.png brand-voxcourt.png brand-admiral.png
  brand-wilson.png brand-cosmote.png brand-dei.png brand-avance.png
  brand-isostar.png brand-chalkis.png
)

for name in "${ASSETS[@]}"; do
  curl -fsSL --retry 3 --connect-timeout 12 --max-time 50 \
       "${REPO_RAW}/site/public/voxcourt-live-v3/${name}" -o "${STAGING}/${name}"
done
curl -fsSL --retry 3 --connect-timeout 12 --max-time 50 \
     "${REPO_RAW}/site/src/viewer-premium-v3.css" -o "${STAGING}/viewer.css"
curl -fsSL --retry 3 --connect-timeout 12 --max-time 50 \
     "${REPO_RAW}/ops/live-v3-vps/viewer-standalone.js" -o "${STAGING}/viewer-standalone.js"

# This VPS serves the SPA at "/", unlike GitHub Pages at "/tennislive-match/".
python3 - "${STAGING}" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
css = p.joinpath('viewer.css')
text = css.read_text()
text = text.replace('/tennislive-match/voxcourt-live-v3/', '/voxcourt-live-v3/')
css.write_text(text)
js = p.joinpath('viewer-standalone.js').read_text()
assert 'voxcourt-live-v3-vps-styles' in js and 'premiumWeather' in js
assert 'body:has(.vc-viewer-page)' in text and 'court-poster.webp' in text
for img in p.glob('*.webp'):
    assert img.stat().st_size > 1000, img.name
for img in p.glob('*.png'):
    assert img.stat().st_size > 1000, img.name
print('Prepared and checked', len(list(p.glob('*.png'))) + len(list(p.glob('*.webp'))), 'approved images')
PY

# Stage and swap complete directory. No cache busting of the score/camera JS.
if [[ -d "${V3DIR}" ]]; then rm -rf "${V3DIR}"; fi
mv "${STAGING}" "${V3DIR}"
STAGING=""

# Add a SINGLE versioned script to the end of the actual VPS index page.
# Its CSS is injected after existing styles; no SPA bundle is overwritten.
python3 - "${ROOT}/index.html" "${VERSION}" <<'PY'
from pathlib import Path
import sys,re,os
p = Path(sys.argv[1])
v = sys.argv[2]
h = p.read_text(encoding='utf-8')
h = re.sub(r'\s*<!-- VoxCourt V3 VPS BEGIN -->[\s\S]*?<!-- VoxCourt V3 VPS END -->\s*', '\n', h)
tag = f'''<!-- VoxCourt V3 VPS BEGIN -->
<script defer src="/voxcourt-live-v3/viewer-standalone.js?v={v}"></script>
<!-- VoxCourt V3 VPS END -->
'''
if '</body>' not in h.lower(): raise SystemExit('STOP: no body closing tag')
h = re.sub(r'</body>', lambda m: tag + m.group(0), h, count=1, flags=re.I)
tmp=p.with_suffix('.html.v3.tmp')
tmp.write_text(h,encoding='utf-8')
os.replace(tmp,p)
PY

# Validate the actual Nginx endpoint, rather than checking GitHub Pages.
mime="$(curl -ksSI --connect-timeout 7 --max-time 20 "https://voxcourt.com/voxcourt-live-v3/court-poster.webp?v=${VERSION}" | tr -d '\r' | grep -i '^content-type:' | tail -1 || true)"
if ! echo "${mime}" | grep -qi 'image/webp'; then
  echo "ERROR: voxcourt.com does not serve /voxcourt-live-v3/ from ${ROOT}. Header: ${mime}" >&2
  false
fi
if command -v nginx >/dev/null 2>&1; then nginx -t; fi
COMPLETED=1
trap - ERR INT TERM
echo "LIVE WEBSITE UPDATED: https://voxcourt.com/"
echo "Open an existing court viewer with Ctrl+F5. No process restart required."
echo "Rollback: cp -a '${BACKUP}/index.html' '${ROOT}/index.html'"
