// src/pages/viewer.js

function segs(path) {
  return String(path || "").split("/").filter(Boolean);
}

function isAbsUrl(u) {
  return /^https?:\/\//i.test(String(u || ""));
}

function resolveUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (isAbsUrl(s)) return s;
  return new URL(s, window.location.origin).toString();
}

async function loadClubs() {
  const base = import.meta.env.BASE_URL || "/";
  const r = await fetch(`${base}config/clubs.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Cannot load ${base}config/clubs.json (${r.status})`);
  return r.json();
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
  return r.json();
}

function clampText(s, max = 28) {
  const t = String(s ?? "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function setPhoto(img, ph, url) {
  const u = String(url || "").trim();
  if (u) {
    img.src = u;
    img.style.display = "";
    if (ph) ph.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    if (ph) ph.style.display = "";
  }
}

function destroyVideoHls(video) {
  if (!video) return;
  try {
    if (video._hls) {
      video._hls.destroy();
      video._hls = null;
    }
  } catch (_) {}
}

function attachHlsToVideo(video, url) {
  if (!video) return false;

  const u = String(url || "").trim();
  if (!u) return false;

  destroyVideoHls(video);

  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";

  try {
    video.pause();
    video.removeAttribute("src");
    video.load();
  } catch (_) {}

  const ua = navigator.userAgent || "";
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isSafari && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = u;
    video.play?.().catch(() => {});
    return true;
  }

  const Hls = window.Hls;
  if (!Hls || !Hls.isSupported()) {
    video.src = u;
    video.play?.().catch(() => {});
    return true;
  }

  const hls = new Hls({
  lowLatencyMode: true,
  backBufferLength: 10,
  enableWorker: true,

  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 3,
  maxLiveSyncPlaybackRate: 1.2,

  manifestLoadingTimeOut: 10000,
  manifestLoadingMaxRetry: 2,
  levelLoadingTimeOut: 10000,
  levelLoadingMaxRetry: 2,
  fragLoadingTimeOut: 10000,
  fragLoadingMaxRetry: 2
});

  video._hls = hls;
  hls.attachMedia(video);

  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    try {
      hls.loadSource(u);
      hls.startLoad();
    } catch (_) {}
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.play?.().catch(() => {});
  });

  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (!data || !data.fatal) return;

    try {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          video._hls = null;
          break;
      }
    } catch (_) {}
  });

  return true;
}

function buildMobileHlsUrl(apiBase, courtId, camRole) {
  const base = String(apiBase || "").replace(/\/+$/, "");
  const court = String(courtId || "").trim();
  const cam = String(camRole || "").trim();
  if (!base || !court || !cam) return "";
  return `${base}/hls/${court}-${cam}.m3u8`;
}

async function pickBestStreamSource({ apiBase, courtObj, courtId }) {
  const fallbackUrlRaw =
    typeof courtObj.stream === "string"
      ? courtObj.stream
      : (courtObj.stream && typeof courtObj.stream === "object" ? courtObj.stream.url : "");

  const fallbackUrl = resolveUrl(fallbackUrlRaw || "");

  const result = {
    selectedUrl: fallbackUrl,
    sourceLabel: fallbackUrl ? "Default / Config stream" : "No stream configured",
    fallbackUrl,
    mobileSources: []
  };

  try {
    const sourcesUrl = `${apiBase}/api/court/sources?courtId=${encodeURIComponent(courtId)}`;
    const payload = await fetchJson(sourcesUrl);

    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    result.mobileSources = sources;

    const activeCam1 = sources.find(
      (s) => s && s.camRole === "cam1" && s.liveActive === true
    );
    const activeCam2 = sources.find(
      (s) => s && s.camRole === "cam2" && s.liveActive === true
    );

    if (activeCam1) {
      result.selectedUrl = buildMobileHlsUrl(apiBase, courtId, "cam1");
      result.sourceLabel = `Mobile cam1 • ${activeCam1.deviceName || "Unknown device"}`;
      return result;
    }

    if (activeCam2) {
      result.selectedUrl = buildMobileHlsUrl(apiBase, courtId, "cam2");
      result.sourceLabel = `Mobile cam2 • ${activeCam2.deviceName || "Unknown device"}`;
      return result;
    }

    if (fallbackUrl) {
      result.selectedUrl = fallbackUrl;
      result.sourceLabel = "Default / Pi stream";
      return result;
    }

    result.selectedUrl = "";
    result.sourceLabel = "No active source";
    return result;
  } catch (_) {
    if (fallbackUrl) {
      result.selectedUrl = fallbackUrl;
      result.sourceLabel = "Default / Pi stream (sources API unavailable)";
      return result;
    }

    result.selectedUrl = "";
    result.sourceLabel = "No stream available";
    return result;
  }
}

export async function renderViewer(path) {
  const app = document.getElementById("app");
  const parts = segs(path);

  const hasV = parts[0] === "v";
  const i = hasV ? 1 : 0;

  const country = parts[i + 0] || "";
  const city = parts[i + 1] || "";
  const clubId = parts[i + 2] || "";
  const courtId = parts[i + 3] || "";

  app.innerHTML = `
  <div class="wrap">
    <div class="nav">
      <div class="brand">
        <div class="logo"></div>
        <div>e-Scoreboards</div>
      </div>
      <div class="navlinks">
        <a href="/" data-nav>Home</a>
        <a href="/live" data-nav>Find courts</a>
      </div>
      <a class="cta" href="/live" data-nav>Change court</a>
    </div>

    <div class="panel section" style="min-height:120px;">
      <div class="badge" style="margin-bottom:18px;">
        <i></i> Match info
      </div>
      <div style="display:flex; flex-direction:column; gap:18px;">
        <div id="miTitle" style="font-weight:900; font-size:18px; letter-spacing:.2px;">
          Loading…
        </div>
        <div class="hint" id="miLine2">—</div>
      </div>
    </div>

    <div style="height:16px;"></div>

    <style>
      @media (max-width: 900px){
        .viewerWrap { grid-template-columns: 1fr !important; }
      }
    </style>

    <div class="viewerWrap" style="grid-template-columns: 1fr 1fr; gap:16px; align-items:stretch;">

      <div class="panel section" style="display:flex; flex-direction:column;">
        <div class="badge"><i></i> Live score</div>

        <div style="display:flex; gap:16px; margin: 10px 0 12px 0;">
          <div style="
              position:relative;
              flex:1 1 0;
              min-width:0;
              height:82px;
              display:flex;
              align-items:center;
              gap:12px;
              padding:12px;
              border-radius:14px;
              background: rgba(255,255,255,.04);
              border: 1px solid rgba(255,255,255,.10);
            ">
            <div style="
                width:56px; height:56px;
                border-radius:999px;
                background: rgba(255,255,255,.08);
                border: 1px solid rgba(255,255,255,.15);
                overflow:hidden;
                display:flex; align-items:center; justify-content:center;
                flex:0 0 auto;
              ">
              <img id="photoA" alt="A"
                   style="width:100%;height:100%;object-fit:cover;display:none;" />
              <span id="photoAph" style="opacity:.65; font-weight:900; letter-spacing:.5px;">A</span>
            </div>

            <div style="min-width:0; flex:1 1 auto; padding-right:54px;">
              <div id="photoATitle" style="
                  font-weight:900;
                  font-size:10px;
                  line-height:1.15;
                  display:-webkit-box;
                  -webkit-line-clamp:2;
                  -webkit-box-orient:vertical;
                  overflow:hidden;
                  word-break:break-word;
                ">Player A</div>
              <div class="hint" style="margin:3px 0 0 0;">Photo</div>
            </div>

            <span id="serveAIcon" style="
                display:none;
                position:absolute;
                right:14px;
                top:50%;
                transform:translateY(-50%);
                width:16px;
                height:16px;
                border-radius:999px;
                background:#ffd34d;
                box-shadow:
                  0 0 0 4px rgba(255,211,77,.16),
                  0 0 14px rgba(255,211,77,.55);
              "></span>
          </div>

          <div style="
              position:relative;
              flex:1 1 0;
              min-width:0;
              height:82px;
              display:flex;
              align-items:center;
              gap:12px;
              padding:12px;
              border-radius:14px;
              background: rgba(255,255,255,.04);
              border: 1px solid rgba(255,255,255,.10);
            ">
            <div style="
                width:56px; height:56px;
                border-radius:999px;
                background: rgba(255,255,255,.08);
                border: 1px solid rgba(255,255,255,.15);
                overflow:hidden;
                display:flex; align-items:center; justify-content:center;
                flex:0 0 auto;
              ">
              <img id="photoB" alt="B"
                   style="width:100%;height:100%;object-fit:cover;display:none;" />
              <span id="photoBph" style="opacity:.65; font-weight:900; letter-spacing:.5px;">B</span>
            </div>

            <div style="min-width:0; flex:1 1 auto; padding-right:54px;">
              <div id="photoBTitle" style="
                  font-weight:900;
                  font-size:10px;
                  line-height:1.15;
                  display:-webkit-box;
                  -webkit-line-clamp:2;
                  -webkit-box-orient:vertical;
                  overflow:hidden;
                  word-break:break-word;
                ">Player B</div>
              <div class="hint" style="margin:3px 0 0 0;">Photo</div>
            </div>

            <span id="serveBIcon" style="
                display:none;
                position:absolute;
                right:14px;
                top:50%;
                transform:translateY(-50%);
                width:16px;
                height:16px;
                border-radius:999px;
                background:#ffd34d;
                box-shadow:
                  0 0 0 4px rgba(255,211,77,.16),
                  0 0 14px rgba(255,211,77,.55);
              "></span>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Point</th>
              <th>Games</th>
              <th>Sets</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td id="nameA" style="font-weight:900; font-size:15px;">—</td>
              <td id="pointA">—</td>
              <td id="gamesA">—</td>
              <td id="setsA">—</td>
            </tr>

            <tr>
              <td id="nameB" style="font-weight:900; font-size:15px;">—</td>
              <td id="pointB">—</td>
              <td id="gamesB">—</td>
              <td id="setsB">—</td>
            </tr>
          </tbody>
        </table>

        <div class="hint" id="status">Waiting for data…</div>
        <div class="hint" id="photostatus" style="margin-top:6px;">PHOTOS / —</div>
        <div style="flex:1 1 auto;"></div>
      </div>

      <div class="panel section" style="display:flex; flex-direction:column;">
        <div class="badge"><i></i> Camera / Stream</div>

        <div class="hint" id="streamSourceLabel" style="margin-top:10px;">Source: detecting…</div>

        <div class="cam" style="margin-top:10px;">
          <video
            id="camVideo"
            controls
            playsinline
            muted
            autoplay
            style="
              width:100%;
              height:100%;
              object-fit:cover;
              display:block;
              background:black;
            "
          ></video>
        </div>

        <div style="flex:1 1 auto;"></div>
      </div>

    </div>

    <div class="footer">© <span id="y"></span> e-Scoreboards.</div>
  </div>
`;

  app.querySelector("#y").textContent = String(new Date().getFullYear());

  const miTitle = app.querySelector("#miTitle");
  const miLine2 = app.querySelector("#miLine2");

  const status = app.querySelector("#status");
  const photoStatus = app.querySelector("#photostatus");
  const streamSourceLabel = app.querySelector("#streamSourceLabel");
  const videoEl = app.querySelector("#camVideo");

  const nameAEl = app.querySelector("#nameA");
  const nameBEl = app.querySelector("#nameB");
  const pointAEl = app.querySelector("#pointA");
  const pointBEl = app.querySelector("#pointB");
  const gamesAEl = app.querySelector("#gamesA");
  const gamesBEl = app.querySelector("#gamesB");
  const setsAEl = app.querySelector("#setsA");
  const setsBEl = app.querySelector("#setsB");

  const photoAImg = app.querySelector("#photoA");
  const photoBImg = app.querySelector("#photoB");
  const photoAPh = app.querySelector("#photoAph");
  const photoBPh = app.querySelector("#photoBph");
  const photoATitle = app.querySelector("#photoATitle");
  const photoBTitle = app.querySelector("#photoBTitle");

  const serveAIcon = app.querySelector("#serveAIcon");
  const serveBIcon = app.querySelector("#serveBIcon");

  let currentSelectedStreamUrl = "";

  try {
    const data = await loadClubs();

    if (!data || !Array.isArray(data.countries)) {
      throw new Error("Invalid clubs.json: expected { countries: [...] }");
    }

    const countryObj = data.countries.find((c) => c.id === country);
    if (!countryObj) throw new Error(`Country not found: ${country}`);

    const cityObj = (countryObj.cities || []).find((c) => c.id === city);
    if (!cityObj) throw new Error(`City not found: ${city}`);

    const clubObj = (cityObj.clubs || []).find((c) => c.id === clubId);
    if (!clubObj) throw new Error(`Club not found: ${clubId}`);

    const courtObj = (clubObj.courts || []).find((c) => c.id === courtId);
    if (!courtObj) throw new Error(`Court not found: ${courtId}`);

    const stateUrl = resolveUrl(courtObj.state || "");
    const photosCourt = String(courtObj.photosCourt || courtId || "court-1").trim() || "court-1";
    const apiBase = isAbsUrl(stateUrl) ? new URL(stateUrl).origin : window.location.origin;

    miTitle.textContent = `🎾 ${clubObj.name} – ${courtObj.name}`;
    miLine2.textContent = `📍 ${cityObj.name}, ${countryObj.name}  •  🔴 LIVE`;

    async function refreshStreamSource() {
      try {
        const picked = await pickBestStreamSource({
          apiBase,
          courtObj,
          courtId
        });

        streamSourceLabel.textContent = `Source: ${picked.sourceLabel}`;

        if (!picked.selectedUrl) {
          status.textContent = "No stream source available.";
          destroyVideoHls(videoEl);
          try {
            videoEl.pause();
            videoEl.removeAttribute("src");
            videoEl.load();
          } catch (_) {}
          currentSelectedStreamUrl = "";
          return;
        }

        if (picked.selectedUrl !== currentSelectedStreamUrl) {
          currentSelectedStreamUrl = picked.selectedUrl;
          attachHlsToVideo(videoEl, picked.selectedUrl);
        }
      } catch (e) {
        streamSourceLabel.textContent = `Source: error (${e.message})`;
      }
    }

    await refreshStreamSource();
    setInterval(refreshStreamSource, 5000);

    if (!stateUrl) {
      status.textContent = "No state URL configured for this court.";
      return;
    }

    async function tickState() {
      try {
        const s = await fetchJson(stateUrl);

        const nameA = s.nameA ?? s.playerA?.name ?? "Player A";
        const nameB = s.nameB ?? s.playerB?.name ?? "Player B";

        const pointA = s.pointA ?? s.playerA?.points ?? s.playerA?.point ?? s.playerA?.score ?? "—";
        const pointB = s.pointB ?? s.playerB?.points ?? s.playerB?.point ?? s.playerB?.score ?? "—";

        const gamesA = s.gamesA ?? s.playerA?.games ?? "—";
        const gamesB = s.gamesB ?? s.playerB?.games ?? "—";

        const setsA = s.setsA ?? s.playerA?.sets ?? "—";
        const setsB = s.setsB ?? s.playerB?.sets ?? "—";

        const server = String(s.server || "").toUpperCase();
        serveAIcon.style.display = server === "A" ? "" : "none";
        serveBIcon.style.display = server === "B" ? "" : "none";

        nameAEl.textContent = clampText(nameA, 34);
        nameBEl.textContent = clampText(nameB, 34);
        pointAEl.textContent = String(pointA);
        pointBEl.textContent = String(pointB);
        gamesAEl.textContent = String(gamesA);
        gamesBEl.textContent = String(gamesB);
        setsAEl.textContent = String(setsA);
        setsBEl.textContent = String(setsB);

        photoATitle.textContent = clampText(nameA, 30);
        photoBTitle.textContent = clampText(nameB, 30);

        status.textContent = `LIVE ✓ Updated: ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        status.textContent = `Waiting… (${e.message})`;
      }
    }

    async function tickPhotos() {
      try {
        const url = `${apiBase}/api/photos?court=${encodeURIComponent(photosCourt)}`;
        const p = await fetchJson(url);
        setPhoto(photoAImg, photoAPh, p.playerA || "");
        setPhoto(photoBImg, photoBPh, p.playerB || "");
        photoStatus.textContent = `PHOTOS ✓ Updated: ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        photoStatus.textContent = `PHOTOS / Waiting… (${e.message})`;
        setPhoto(photoAImg, photoAPh, "");
        setPhoto(photoBImg, photoBPh, "");
      }
    }

    tickState();
    tickPhotos();
    setInterval(tickState, 1000);
    setInterval(tickPhotos, 2000);
  } catch (e) {
    miTitle.textContent = "Config load error";
    miLine2.textContent = String(e.message || e);
    status.textContent = "Fix config and refresh.";
  }
}
