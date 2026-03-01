const el = (id) => document.getElementById(id);

/**
 * Routes supported:
 * - /club/<clubId>/court/<courtId>
 * - ?p=/gr/attica/<clubId>/<courtId>   (your shared links)
 */
function parseRoute() {
  const params = new URLSearchParams(location.search);
  let p = params.get("p");

  if (p) {
    p = String(p).trim().replace(/^\/+/, "").replace(/\/+$/, "");
    const parts = p.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length >= 2) {
      return { clubId: parts[parts.length - 2] || null, courtId: parts[parts.length - 1] || null };
    }
    return { clubId: null, courtId: null };
  }

  const path = location.pathname.replace(/\/+$/, "");
  const m = path.match(/\/club\/([^/]+)\/court\/([^/]+)$/);
  if (!m) return { clubId: null, courtId: null };
  return { clubId: decodeURIComponent(m[1]), courtId: decodeURIComponent(m[2]) };
}

async function loadClubs() {
  // Use the "site" config (countries/cities/clubs/courts)
  const r = await fetch("site/dist/config/clubs.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`Cannot load site/dist/config/clubs.json (${r.status})`);
  return r.json();
}

function pickCourt(cfg, clubId, courtId) {
  // cfg structure:
  // { countries:[ { cities:[ { clubs:[ { id,name,courts:[ {id,name,state,stream:{type,url}} ] } ] } ] } ] }

  const countries = cfg.countries || [];
  const firstCountry = countries[0];
  const firstCity = firstCountry?.cities?.[0];
  const allClubs = [];

  for (const country of countries) {
    for (const city of (country.cities || [])) {
      for (const club of (city.clubs || [])) {
        allClubs.push({ ...club, __city: city, __country: country });
      }
    }
  }

  const club = (clubId ? allClubs.find(c => c.id === clubId) : null) || allClubs[0];
  if (!club) throw new Error("No clubs in config");

  const courts = club.courts || [];
  const court = (courtId ? courts.find(c => c.id === courtId) : null) || courts[0];
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

function normalizeState(s) {
  // Supports both:
  // A) nested: { playerA:{name,sets,games,points,serve,photo}, playerB:{...}, updatedAt, status, inTiebreak, bestOf }
  // B) flat:   { nameA,nameB,setsA,setsB,gamesA,gamesB,pointA,pointB,server,updatedAt, photoA?, photoB? }

  const aName = s.playerA?.name ?? s.nameA ?? "Player A";
  const bName = s.playerB?.name ?? s.nameB ?? "Player B";

  const aSets = s.playerA?.sets ?? s.setsA ?? 0;
  const bSets = s.playerB?.sets ?? s.setsB ?? 0;

  const aGames = s.playerA?.games ?? s.gamesA ?? 0;
  const bGames = s.playerB?.games ?? s.gamesB ?? 0;

  const aPts = s.playerA?.points ?? s.pointA ?? "0";
  const bPts = s.playerB?.points ?? s.pointB ?? "0";

  // Server:
  // - nested: playerA.serve / playerB.serve
  // - flat: server = "A" or "B"
  const server =
    (s.playerA?.serve ? "A" : "") ||
    (s.playerB?.serve ? "B" : "") ||
    (typeof s.server === "string" ? s.server : "");

  const aPhoto = s.playerA?.photo ?? s.photoA ?? "";
  const bPhoto = s.playerB?.photo ?? s.photoB ?? "";

  return {
    aName,
    bName,
    aSets,
    bSets,
    aGames,
    bGames,
    aPts,
    bPts,
    server,
    aPhoto,
    bPhoto,
    status: s.status ?? "LIVE",
    bestOf: s.bestOf ?? 3,
    inTiebreak: !!s.inTiebreak,
    updatedAt: s.updatedAt,
  };
}

async function main() {
  const route = parseRoute();
  const cfg = await loadClubs();
  const { club, court } = pickCourt(cfg, route.clubId, route.courtId);

  // In the big config, court.state is already a full URL
  const stateUrl = String(court.state || "");
  if (!stateUrl) throw new Error("Court has empty state URL in config");

  if (el("title")) el("title").textContent = `${club.name} · ${court.name}`;
  if (el("subtitle")) el("subtitle").textContent = `Route: club=${club.id} court=${court.id}`;
  if (el("openApi")) el("openApi").href = stateUrl;

  if (el("foot")) {
    el("foot").textContent = `© ${new Date().getFullYear()} e-Scoreboards · ${club.id}/${court.id}`;
  }

  let lastOk = 0;

  async function tick() {
    try {
      const r = await fetch(stateUrl + `?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const s = normalizeState(raw);

      // Header / meta
      if (el("liveLabel")) el("liveLabel").textContent = String(s.status).toUpperCase();
      if (el("meta")) el("meta").textContent = `Best of ${s.bestOf}` + (s.inTiebreak ? " · TIEBREAK" : "");

      // Names
      if (el("nameA")) el("nameA").textContent = s.aName;
      if (el("nameB")) el("nameB").textContent = s.bName;
      if (el("capA")) el("capA").textContent = s.aName;
      if (el("capB")) el("capB").textContent = s.bName;

      // Values
      if (el("setsA")) el("setsA").textContent = safeNum(s.aSets);
      if (el("setsB")) el("setsB").textContent = safeNum(s.bSets);
      if (el("gamesA")) el("gamesA").textContent = safeNum(s.aGames);
      if (el("gamesB")) el("gamesB").textContent = safeNum(s.bGames);

      // Points
      if (el("pointsA")) el("pointsA").textContent = String(s.aPts);
      if (el("pointsB")) el("pointsB").textContent = String(s.bPts);

      // Serve
      el("serveA")?.classList.toggle("on", String(s.server).toUpperCase() === "A");
      el("serveB")?.classList.toggle("on", String(s.server).toUpperCase() === "B");

      // Photos
      setImg(el("imgA"), s.aPhoto, el("statusA"));
      setImg(el("imgB"), s.bPhoto, el("statusB"));

      // Updated
      const upd =
        typeof s.updatedAt === "number"
          ? `updated: ${new Date(s.updatedAt).toLocaleString()}`
          : s.updatedAt
          ? `updated: ${s.updatedAt}`
          : `updated: ${new Date().toISOString()}`;

      if (el("updated")) el("updated").textContent = upd;

      lastOk = Date.now();
      setConnected(true, "Connected");
    } catch (e) {
      const seconds = lastOk ? Math.round((Date.now() - lastOk) / 1000) : 0;
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
