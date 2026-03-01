const el = (id) => document.getElementById(id);

/**
 * Supported routes:
 * 1) /club/<clubId>/court/<courtId>               (path-based)
 * 2) ?p=/gr/attica/<clubId>/<courtId>             (query-based, your current site)
 * 3) ?p=/club/<clubId>/court/<courtId>            (query-based, same as path style)
 *
 * Returns { clubId, courtId } or { null, null } to fall back to defaults.
 */
function parseRoute() {
  // 1) Preferred: query param ?p=/gr/attica/<clubId>/<courtId>
  const params = new URLSearchParams(location.search);
  let p = params.get("p");

  if (p) {
    p = String(p).trim().replace(/^\/+/, "").replace(/\/+$/, "");
    const parts = p.split("/").filter(Boolean).map(decodeURIComponent);

    // If format is ".../<clubId>/<courtId>" take last 2
    if (parts.length >= 2) {
      return { clubId: parts[parts.length - 2] || null, courtId: parts[parts.length - 1] || null };
    }
    return { clubId: null, courtId: null };
  }

  // 2) Fallback: /club/<clubId>/court/<courtId>
  const path = location.pathname.replace(/\/+$/, "");
  const m = path.match(/\/club\/([^/]+)\/court\/([^/]+)$/);
  if (!m) return { clubId: null, courtId: null };
  return { clubId: decodeURIComponent(m[1]), courtId: decodeURIComponent(m[2]) };
}

    // Case B: "gr/attica/<clubId>/<courtId>" (assume last two segments are ids)
    if (parts.length >= 2) {
      const clubId = parts[parts.length - 2] || null;
      const courtId = parts[parts.length - 1] || null;
      return { clubId, courtId };
    }

    return { clubId: null, courtId: null };
  }

  // Fallback: path-based "/club/<clubId>/court/<courtId>"
  const pathname = location.pathname.replace(/\/+$/, "");
  const m = pathname.match(/\/club\/([^/]+)\/court\/([^/]+)$/);
  if (!m) return { clubId: null, courtId: null };
  return { clubId: decodeURIComponent(m[1]), courtId: decodeURIComponent(m[2]) };
}

async function loadClubs() {
  const r = await fetch("config/clubs.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`Cannot load config/clubs.json (${r.status})`);
  return r.json();
}

function pickCourt(cfg, clubId, courtId) {
  const clubs = cfg.clubs || [];
  let club = (clubId ? clubs.find((c) => c.id === clubId) : null) || clubs[0];
  if (!club) throw new Error("No clubs in config");

  let court =
    (courtId ? (club.courts || []).find((c) => c.id === courtId) : null) ||
    (club.courts || [])[0];

  if (!court) throw new Error("No courts in config");
  return { club, court };
}

function setConnected(ok, msg) {
  el("dot")?.classList.toggle("ok", ok);
  if (el("status")) el("status").textContent = msg;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "0";
}

function setImg(imgEl, url, statusEl) {
  if (!imgEl || !statusEl) return;
  if (!url) {
    imgEl.removeAttribute("src");
    statusEl.textContent = "no photo";
    return;
  }
  imgEl.src = url;
  statusEl.textContent = "ok";
}

async function main() {
  const route = parseRoute();

  // IMPORTANT: your snippet called loadConfig() but function is loadClubs()
  const cfg = await loadClubs();

  const { club, court } = pickCourt(cfg, route.clubId, route.courtId);

  const apiBase = (court.apiBase || "").replace(/\/+$/, "");
  const statePath = court.statePath || "/api/state";
  const stateUrl = apiBase + statePath;
  el('subtitle').textContent = `Using: ${stateUrl}`;
  el('openApi').href = stateUrl;

  if (el("title")) el("title").textContent = `${club.name} · ${court.name}`;

  // Show what route resolved to (useful for debugging)
  if (el("subtitle")) el("subtitle").textContent = `Route: club=${club.id} court=${court.id}`;

  if (el("openApi")) el("openApi").href = stateUrl;

  if (el("foot"))
    el("foot").textContent = `© ${new Date().getFullYear()} e-Scoreboards · ${club.id}/${court.id}`;

  let lastOk = 0;
  let errors = 0;

  async function tick() {
    try {
      const r = await fetch(stateUrl + `?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();

      // Header / meta
      if (el("liveLabel")) el("liveLabel").textContent = (s.status || "LIVE").toUpperCase();
      if (el("meta"))
        el("meta").textContent = `Best of ${s.bestOf || 3}` + (s.inTiebreak ? " · TIEBREAK" : "");

      // Names
      if (el("nameA")) el("nameA").textContent = s.playerA?.name || "Player A";
      if (el("nameB")) el("nameB").textContent = s.playerB?.name || "Player B";
      if (el("capA")) el("capA").textContent = s.playerA?.name || "Player A";
      if (el("capB")) el("capB").textContent = s.playerB?.name || "Player B";

      // Values
      if (el("setsA")) el("setsA").textContent = safeNum(s.playerA?.sets);
      if (el("setsB")) el("setsB").textContent = safeNum(s.playerB?.sets);
      if (el("gamesA")) el("gamesA").textContent = safeNum(s.playerA?.games);
      if (el("gamesB")) el("gamesB").textContent = safeNum(s.playerB?.games);

      // Points
      if (el("pointsA")) el("pointsA").textContent = String(s.playerA?.points ?? "0");
      if (el("pointsB")) el("pointsB").textContent = String(s.playerB?.points ?? "0");

      // Serve indicator
      el("serveA")?.classList.toggle("on", !!s.playerA?.serve);
      el("serveB")?.classList.toggle("on", !!s.playerB?.serve);

      // Photos
      setImg(el("imgA"), s.playerA?.photo || "", el("statusA"));
      setImg(el("imgB"), s.playerB?.photo || "", el("statusB"));

      // Updated
      const upd = s.updatedAt ? `updated: ${s.updatedAt}` : `updated: ${new Date().toISOString()}`;
      if (el("updated")) el("updated").textContent = upd;

      lastOk = Date.now();
      errors = 0;
      setConnected(true, "Connected");
    } catch (e) {
      errors++;
      const seconds = Math.round((Date.now() - lastOk) / 1000);
      setConnected(false, lastOk ? `Disconnected (${seconds}s)` : `Error: ${e.message}`);
    }
  }

  await tick();
  setInterval(tick, 1000);
}

main().catch((e) => {
  setConnected(false, e.message);
  if (el("title")) el("title").textContent = "Viewer error";
  if (el("subtitle")) el("subtitle").textContent = e.message;
});
