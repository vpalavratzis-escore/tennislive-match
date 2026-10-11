#!/usr/bin/env bash
# One-shot deployment to the ACTIVE Hetzner Nginx webroot.
# Only adds viewer presentation assets and one script to index.html.
# Does NOT touch APIs, stream URLs, databases, nginx, Studio, or score/replay JS.
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then echo "Run as root: sudo bash deploy-live-v3-vps.sh" >&2; exit 1; fi

ROOT="/var/www/voxcourt"
REPO_RAW="https://raw.githubusercontent.com/vpalavratzis-escore/tennislive-match/dev"
STATIC_PREFIX=""
UPLOADED_FILES=()
BACKUP_READY=0
DOMAIN="https://voxcourt.com"
VERSION="v3-20261011-hetzner"
BACKUP="/root/voxcourt-backups/${VERSION}-$(date -u +%Y%m%dT%H%M%SZ)"
STAGING=""
COMPLETED=0

echo "VoxCourt V3 — discovering real Nginx static location"
if [[ ! -s "${ROOT}/index.html" ]]; then echo "STOP: missing ${ROOT}/index.html" >&2; exit 1; fi
if ! grep -Eq '(/voxcourt-assets/|/__vcstudio/runtime\.js)' "${ROOT}/index.html"; then
  echo "STOP: this index.html does not match the current active VoxCourt frontend" >&2; exit 1;
fi
command -v curl >/dev/null || { echo "curl not installed" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 not installed" >&2; exit 1; }

rollback(){
  local exit_code=$?
  if [[ "${COMPLETED}" -eq 0 && "${BACKUP_READY}" -eq 1 ]]; then
    echo "Deployment did not finish; restoring previous index/assets." >&2
    cp -a "${BACKUP}/index.html" "${ROOT}/index.html" || true
    for f in "${UPLOADED_FILES[@]}"; do
      name="${f##*/}"
      if [[ -f "${BACKUP}/${name}" ]]; then
        cp -a "${BACKUP}/${name}" "${f}" || true
      else
        rm -f "${f}"
      fi
    done
  fi
  if [[ -n "${STAGING}" && -d "${STAGING}" ]]; then rm -rf "${STAGING}"; fi
  exit "${exit_code}"
}
trap rollback ERR INT TERM

STAGING="$(mktemp -d /tmp/.vc3-staging.XXXXXX)"
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


# Resolve actual Nginx-served static alias instead of assuming /var/www/voxcourt.
curl -fsSL --connect-timeout 10 --max-time 20 -H 'Cache-Control: no-cache' \
  "${DOMAIN}/?vc3-index-check=$(date +%s)" -o "${STAGING}/live-index.html"
if ! cmp -s "${STAGING}/live-index.html" "${ROOT}/index.html"; then
  echo "STOP: ${ROOT}/index.html is not the LIVE public page. No changes made." >&2
  exit 1
fi
STATIC_DETAILS="$(python3 - "${ROOT}/index.html" "${STAGING}/court-poster.webp" "${DOMAIN}" <<'PY'
from pathlib import Path
from urllib.request import Request, urlopen
import sys,re,subprocess,uuid
html=Path(sys.argv[1]).read_text()
poster=Path(sys.argv[2]).read_bytes()
domain=sys.argv[3]
paths=re.findall(r'/(?:voxcourt-assets|vendor|assets)/[A-Za-z0-9_.-]+\.js',html)
paths=sorted(set(paths),key=lambda a:(0 if a.startswith('/voxcourt-assets/') else 1,a))
roots=[r for r in ['/var/www','/srv','/opt','/usr/share/nginx/html','/home'] if Path(r).is_dir()]
for path in paths:
    prefix='/'+path.strip('/').split('/')[0]
    basename=path.rsplit('/',1)[-1]
    if not roots: break
    try:
        cmd=['find','-L',*roots,'-maxdepth','9','-type','f','-name',basename,'-print0']
        matches=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=55).stdout
    except subprocess.TimeoutExpired: continue
    for raw in matches.split(b'\0'):
        if not raw: continue
        folder=Path(raw.decode()).parent
        name='vc3-check-'+uuid.uuid4().hex+'.webp'
        probe=folder/name
        try:
            probe.write_bytes(poster)
            req=Request(domain+prefix+'/'+name+'?t='+uuid.uuid4().hex,headers={'Cache-Control':'no-cache'})
            with urlopen(req,timeout=12) as r: result=r.read(len(poster)+1)
            if result==poster:
                print(str(folder)+'|'+prefix)
                sys.exit(0)
        except Exception: pass
        finally:
            try: probe.unlink(missing_ok=True)
            except Exception: pass
folder=Path(sys.argv[1]).parent
name='vc3-check-'+uuid.uuid4().hex+'.webp'
probe=folder/name
try:
    probe.write_bytes(poster)
    with urlopen(Request(domain+'/'+name+'?t='+uuid.uuid4().hex,headers={'Cache-Control':'no-cache'}),timeout=12) as r:
        if r.read(len(poster)+1)==poster:
            print(str(folder)+'|')
            sys.exit(0)
except Exception: pass
finally:
    try: probe.unlink(missing_ok=True)
    except Exception: pass
sys.exit('STOP: Could not verify an Nginx-served static directory; nothing changed.')
PY
)"
STATIC_DIR="${STATIC_DETAILS%%|*}"
STATIC_PREFIX="${STATIC_DETAILS#*|}"
PUBLIC_URL="${STATIC_PREFIX}"
echo "Confirmed public asset directory: ${STATIC_DIR} -> ${PUBLIC_URL} (flat V3 assets)"
mkdir -p "${BACKUP}"
cp -a "${ROOT}/index.html" "${BACKUP}/index.html"
for name in "${ASSETS[@]}" viewer.css viewer-standalone.js; do
  dest="${STATIC_DIR}/vc3-${name}"
  UPLOADED_FILES+=("${dest}")
  if [[ -f "${dest}" ]]; then cp -a "${dest}" "${BACKUP}/vc3-${name}"; fi
done
BACKUP_READY=1
echo "Backup: ${BACKUP}"
# Remap approved assets to the REAL public static route.
python3 - "${STAGING}" "${STATIC_PREFIX}" "${PUBLIC_URL}" "${VERSION}" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
prefix, public, version = sys.argv[2:5]
css = p.joinpath('viewer.css')
text = css.read_text()
text = text.replace('/tennislive-match/voxcourt-live-v3/', public + '/vc3-')
css.write_text(text)
jsfile = p.joinpath('viewer-standalone.js')
js = jsfile.read_text()
assert "const BASE='/'" in js
assert "const cssUrl='/voxcourt-live-v3/viewer.css?v=20261011-live';" in js
js = js.replace("const BASE='/'",f"const BASE='{prefix}/'")
js = js.replace("const cssUrl='/voxcourt-live-v3/viewer.css?v=20261011-live';",f"const cssUrl='{public}/vc3-viewer.css?v={version}';")
js = js.replace('voxcourt-live-v3/', 'vc3-')
jsfile.write_text(js)
assert 'voxcourt-live-v3-vps-styles' in js and 'premiumWeather' in js
assert 'body:has(.vc-viewer-page)' in text and 'court-poster.webp' in text
for img in p.glob('*.webp'):
    assert img.stat().st_size > 1000, img.name
for img in p.glob('*.png'):
    assert img.stat().st_size > 1000, img.name
print('Prepared and checked', len(list(p.glob('*.png'))) + len(list(p.glob('*.webp'))), 'approved images')
PY

# Install files FLAT in the directory proven accessible from public URLs.
# The active Nginx configuration does not expose nested /voxcourt-live-v3/*.
for name in "${ASSETS[@]}"; do
  install -m 0644 "${STAGING}/${name}" "${STATIC_DIR}/vc3-${name}"
done
install -m 0644 "${STAGING}/viewer.css" "${STATIC_DIR}/vc3-viewer.css"
install -m 0644 "${STAGING}/viewer-standalone.js" "${STATIC_DIR}/vc3-viewer-standalone.js"

# Add a SINGLE versioned script to the end of the actual VPS index page.
# Its CSS is injected after existing styles; no SPA bundle is overwritten.
python3 - "${ROOT}/index.html" "${VERSION}" "${PUBLIC_URL}" <<'PY'
from pathlib import Path
import sys,re,os
p = Path(sys.argv[1])
v, public = sys.argv[2:4]
h = p.read_text(encoding='utf-8')
h = re.sub(r'\s*<!-- VoxCourt V3 VPS BEGIN -->[\s\S]*?<!-- VoxCourt V3 VPS END -->\s*', '\n', h)
tag = f'''<!-- VoxCourt V3 VPS BEGIN -->
<script defer src="{public}/vc3-viewer-standalone.js?v={v}"></script>
<!-- VoxCourt V3 VPS END -->
'''
if '</body>' not in h.lower(): raise SystemExit('STOP: no body closing tag')
h = re.sub(r'</body>', lambda m: tag + m.group(0), h, count=1, flags=re.I)
tmp=p.with_suffix('.html.v3.tmp')
tmp.write_text(h,encoding='utf-8')
os.replace(tmp,p)
PY

# Verify exact PUBLIC CONTENTS (an HTTP 200 might be the SPA HTML fallback).
python3 - "${PUBLIC_URL}" "${VERSION}" "${STAGING}/court-poster.webp" <<'PY'
from urllib.request import Request,urlopen
from pathlib import Path
import sys,uuid
public,version,poster=sys.argv[1:]
def fetch(p):
    with urlopen(Request('https://voxcourt.com'+p,headers={'Cache-Control':'no-cache'}),timeout=20) as r:
        return r.read(1000000)
assert fetch(public+'/vc3-court-poster.webp?v='+version)==Path(poster).read_bytes(), 'V3 image not served'
js=fetch(public+'/vc3-viewer-standalone.js?v='+version)
assert b'premiumWeather' in js and b'voxcourt-live-v3-vps-styles' in js, 'V3 JS not served'
html=fetch('/?vc3confirm='+uuid.uuid4().hex)
assert (public+'/vc3-viewer-standalone.js?v='+version).encode() in html, 'V3 script not in PUBLIC HTML'
print('PUBLIC WEBSITE VERIFIED: HTML, V3 JavaScript and approved court poster')
PY

if command -v nginx >/dev/null 2>&1; then nginx -t; fi
COMPLETED=1
if [[ -n "${STAGING}" && -d "${STAGING}" ]]; then rm -rf "${STAGING}"; fi
STAGING=""
trap - ERR INT TERM
echo "LIVE WEBSITE UPDATED: https://voxcourt.com/"
echo "Open an existing court viewer with Ctrl+F5. No process restart required."
echo "Rollback: cp -a '${BACKUP}/index.html' '${ROOT}/index.html'"
