const el = (id) => document.getElementById(id);

function parseRoute() {
  // Accept:
  // /viewer/            -> default first club/court
  // /club/<clubId>/court/<courtId>  -> route-driven
  const p = location.pathname.replace(/\/+$/,'');
  const m = p.match(/\/club\/([^/]+)\/court\/([^/]+)$/);
  if (!m) return { clubId: null, courtId: null };
  return { clubId: decodeURIComponent(m[1]), courtId: decodeURIComponent(m[2]) };
}

async function loadClubs() {
  const r = await fetch("./config/clubs.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`Cannot load config/clubs.json (${r.status})`);
  return r.json();
}


function pickCourt(cfg, clubId, courtId) {
  const clubs = cfg.clubs || [];
  let club = clubs.find(c => c.id === clubId) || clubs[0];
  if (!club) throw new Error('No clubs in config');
  let court = (club.courts || []).find(c => c.id === courtId) || (club.courts || [])[0];
  if (!court) throw new Error('No courts in config');
  return { club, court };
}

function setConnected(ok, msg) {
  el('dot').classList.toggle('ok', ok);
  el('status').textContent = msg;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '0';
}

function setImg(imgEl, url, statusEl) {
  if (!url) {
    imgEl.removeAttribute('src');
    statusEl.textContent = 'no photo';
    return;
  }
  imgEl.src = url;
  statusEl.textContent = 'ok';
}

async function main() {
  const route = parseRoute();
  const cfg = await loadConfig();
  const { club, court } = pickCourt(cfg, route.clubId, route.courtId);

  const apiBase = (court.apiBase || '').replace(/\/+$/,'');
  const statePath = court.statePath || '/api/state';
  const stateUrl = apiBase + statePath;

  el('title').textContent = `${club.name} · ${court.name}`;
  el('subtitle').textContent = `Route: /club/${club.id}/court/${court.id}`;
  el('openApi').href = stateUrl;

  el('foot').textContent = `© ${new Date().getFullYear()} e-Scoreboards · ${club.id}/${court.id}`;

  let lastOk = 0;
  let errors = 0;

  async function tick() {
    try {
      const r = await fetch(stateUrl + `?t=${Date.now()}`, { cache:'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();

      // Header / meta
      el('liveLabel').textContent = (s.status || 'LIVE').toUpperCase();
      el('meta').textContent = `Best of ${s.bestOf || 3}` + (s.inTiebreak ? ' · TIEBREAK' : '');

      // Names
      el('nameA').textContent = s.playerA?.name || 'Player A';
      el('nameB').textContent = s.playerB?.name || 'Player B';
      el('capA').textContent  = s.playerA?.name || 'Player A';
      el('capB').textContent  = s.playerB?.name || 'Player B';

      // Values
      el('setsA').textContent = safeNum(s.playerA?.sets);
      el('setsB').textContent = safeNum(s.playerB?.sets);
      el('gamesA').textContent = safeNum(s.playerA?.games);
      el('gamesB').textContent = safeNum(s.playerB?.games);

      // Points (server already sends "points" string)
      el('pointsA').textContent = String(s.playerA?.points ?? '0');
      el('pointsB').textContent = String(s.playerB?.points ?? '0');

      // Serve indicator
      el('serveA').classList.toggle('on', !!s.playerA?.serve);
      el('serveB').classList.toggle('on', !!s.playerB?.serve);

      // Photos
      setImg(el('imgA'), s.playerA?.photo || '', el('statusA'));
      setImg(el('imgB'), s.playerB?.photo || '', el('statusB'));

      // Updated
      const upd = s.updatedAt ? `updated: ${s.updatedAt}` : `updated: ${new Date().toISOString()}`;
      el('updated').textContent = upd;

      lastOk = Date.now();
      errors = 0;
      setConnected(true, 'Connected');
    } catch (e) {
      errors++;
      const seconds = Math.round((Date.now() - lastOk)/1000);
      setConnected(false, lastOk ? `Disconnected (${seconds}s)` : `Error: ${e.message}`);
    }
  }

  // first tick now, then every 1s
  await tick();
  setInterval(tick, 1000);
}

main().catch(e => {
  setConnected(false, e.message);
  el('title').textContent = 'Viewer error';
  el('subtitle').textContent = e.message;
});

