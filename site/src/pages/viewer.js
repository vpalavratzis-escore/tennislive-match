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

function resetVideoElement(video) {
  if (!video) return;
  destroyVideoHls(video);
  try {
    video.pause();
  } catch (_) {}
  try {
    video.removeAttribute("src");
    video.load();
  } catch (_) {}
}

function buildMobileHlsUrl(apiBase, streamKey) {
  const base = String(apiBase || "").replace(/\/+$/, "");
  const key = String(streamKey || "").trim();
  if (!base || !key) return "";
  return `${base}/hls/${key}.m3u8`;
}

async function probeStreamUrl(url, timeoutMs = 4500) {
  const u = String(url || "").trim();
  if (!u) return false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(u, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal
    });

    if (!r.ok) return false;

    const text = await r.text();
    return text.includes("#EXTM3U");
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function pickBestStreamSource({ apiBase, courtObj, courtId }) {
  const fallbackUrlRaw =
    typeof courtObj.stream === "string"
      ? courtObj.stream
      : (courtObj.stream && typeof courtObj.stream === "object" ? courtObj.stream.url : "");

  const fallbackUrl = resolveUrl(fallbackUrlRaw || "");

  const courtLeaf = String(courtId || "").split("/").filter(Boolean).pop() || "";
  const legacyCourtNum = (courtLeaf.match(/^court-(\d+)$/i) || [])[1] || "";
  const legacyPiFallbackUrl =
    apiBase && legacyCourtNum ? `${String(apiBase).replace(/\/+$/, "")}/hls/court${legacyCourtNum}.m3u8` : "";

  const result = {
    selectedUrl: "",
    sourceLabel: "No stream available",
    sourcesPayloadLabel: "",
    fallbackUrl,
    legacyPiFallbackUrl,
    mobileSources: []
  };

  try {
    const sourcesUrl = `${apiBase}/api/court/sources?courtId=${encodeURIComponent(courtId)}`;
    const payload = await fetchJson(sourcesUrl);
    const sources = Array.isArray(payload?.sources) ? payload.sources : [];
    result.mobileSources = sources;

    const activeCam1 = sources.find(
      (s) => s && s.camRole === "cam1" && s.liveActive === true && s.streamKey
    );
    const activeCam2 = sources.find(
      (s) => s && s.camRole === "cam2" && s.liveActive === true && s.streamKey
    );

    if (activeCam1) {
      result.selectedUrl = buildMobileHlsUrl(apiBase, activeCam1.streamKey);
      result.sourceLabel = `Mobile cam1 • ${activeCam1.deviceName || "Unknown device"}`;
      result.sourcesPayloadLabel = result.sourceLabel;
      return result;
    }

    if (activeCam2) {
      result.selectedUrl = buildMobileHlsUrl(apiBase, activeCam2.streamKey);
      result.sourceLabel = `Mobile cam2 • ${activeCam2.deviceName || "Unknown device"}`;
      result.sourcesPayloadLabel = result.sourceLabel;
      return result;
    }

    if (legacyPiFallbackUrl) {
      result.selectedUrl = legacyPiFallbackUrl;
      result.sourceLabel = "Pi fallback stream";
      return result;
    }

    if (fallbackUrl) {
      result.selectedUrl = fallbackUrl;
      result.sourceLabel = "Default / Config stream";
      return result;
    }

    result.selectedUrl = "";
    result.sourceLabel = "No active source";
    return result;
  } catch (_) {
    if (legacyPiFallbackUrl) {
      result.selectedUrl = legacyPiFallbackUrl;
      result.sourceLabel = "Pi fallback stream";
      return result;
    }

    if (fallbackUrl) {
      result.selectedUrl = fallbackUrl;
      result.sourceLabel = "Default / Config stream";
      return result;
    }

    result.selectedUrl = "";
    result.sourceLabel = "No stream available";
    return result;
  }
}

function showOverlay(overlayEl, title, text) {
  if (!overlayEl) return;
  const titleEl = overlayEl.querySelector(".videoOverlay__title");
  const textEl = overlayEl.querySelector(".videoOverlay__text");
  if (titleEl) titleEl.textContent = title || "";
  if (textEl) textEl.textContent = text || "";
  overlayEl.classList.add("videoOverlay--show");
}

function hideOverlay(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove("videoOverlay--show");
}

function showVideoUnavailable(videoEl, overlayEl, title, text) {
  resetVideoElement(videoEl);
  if (videoEl) {
    videoEl.style.display = "none";
    videoEl.removeAttribute("controls");
  }
  showOverlay(
    overlayEl,
    title || "Video not available",
    text || "No live video source."
  );
}

function showVideoLoading(videoEl, overlayEl, title, text) {
  if (videoEl) {
    videoEl.style.display = "block";
    videoEl.setAttribute("controls", "controls");
  }
  showOverlay(
    overlayEl,
    title || "Checking video…",
    text || "Trying to open live stream."
  );
}

function showVideoReady(videoEl, overlayEl) {
  if (videoEl) {
    videoEl.style.display = "block";
    videoEl.setAttribute("controls", "controls");
  }
  hideOverlay(overlayEl);
}

function attachHlsToVideo(video, url, onReady, onFatal) {
  if (!video) return false;

  const u = String(url || "").trim();
  if (!u) return false;

  resetVideoElement(video);

  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";

  const ua = navigator.userAgent || "";
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  const safeReady = () => {
    if (typeof onReady === "function") onReady();
  };

  const safeFatal = () => {
    if (typeof onFatal === "function") onFatal();
  };

  video.onloadeddata = safeReady;
  video.oncanplay = safeReady;
  video.onplaying = safeReady;
  video.onerror = safeFatal;
  video.onstalled = safeFatal;
  video.onabort = safeFatal;
  video.onemptied = () => {};

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
    backBufferLength: 15,
    enableWorker: true,
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: 5,
    maxLiveSyncPlaybackRate: 1.08,
    liveSyncOnStallIncrease: 0.5,
    manifestLoadingTimeOut: 8000,
    manifestLoadingMaxRetry: 1,
    levelLoadingTimeOut: 8000,
    levelLoadingMaxRetry: 1,
    fragLoadingTimeOut: 8000,
    fragLoadingMaxRetry: 1
  });

  video._hls = hls;
  hls.attachMedia(video);

  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    try {
      hls.loadSource(u);
      hls.startLoad();
    } catch (_) {
      try {
        hls.destroy();
      } catch (_) {}
      video._hls = null;
      safeFatal();
    }
  });

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.play?.().catch(() => {});
  });

  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (!data || !data.fatal) return;
    try {
      hls.destroy();
    } catch (_) {}
    video._hls = null;
    safeFatal();
  });

  return true;
}

export async function renderViewer(path) {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";
  const parts = segs(path);

  const hasV = parts[0] === "v";
  const i = hasV ? 1 : 0;

  const country = parts[i + 0] || "";
  const city = parts[i + 1] || "";
  const clubId = parts[i + 2] || "";
  const courtId = parts[i + 3] || "";

  app.innerHTML = `
  <div class="wrap">
    <header class="nav premium-nav">
      <a
        class="brand brand-image"
        href="/"
        data-nav
        aria-label="Go to VoxCourt home"
      >
        <img
          src="${base}logoText.png"
          alt="VoxCourt"
          class="brand-logo-image"
        />
      </a>

      <nav class="navlinks" aria-label="Main navigation">
        <a href="/" data-nav>Home</a>
        <a href="/live" data-nav>Find courts</a>
      </nav>

      <a class="cta" href="/live" data-nav>Change court</a>
    </header>

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

      .cam--viewer {
        position: relative;
        overflow: hidden;
      }

      .videoOverlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: linear-gradient(180deg, rgba(0,0,0,.58), rgba(0,0,0,.74));
        z-index: 5;
        opacity: 0;
        pointer-events: none;
        transition: opacity .2s ease;
      }

      .videoOverlay--show {
        opacity: 1;
        pointer-events: auto;
      }

      .videoOverlay__box {
        min-width: 220px;
        max-width: 90%;
        text-align: center;
        padding: 18px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(12,12,12,.62);
        backdrop-filter: blur(10px);
        box-shadow: 0 16px 50px rgba(0,0,0,.35);
      }

      .videoOverlay__title {
        font-size: 18px;
        font-weight: 900;
        color: #fff;
        letter-spacing: .2px;
      }

      .videoOverlay__text {
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(255,255,255,.78);
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

        <div class="cam cam--viewer" style="margin-top:10px;">
          <video
            id="camVideo"
            playsinline
            muted
            autoplay
            style="
              width:100%;
              height:100%;
              object-fit:cover;
              display:none;
              background:black;
            "
          ></video>

          <div id="videoOverlay" class="videoOverlay videoOverlay--show">
            <div class="videoOverlay__box">
              <div class="videoOverlay__title">Checking video…</div>
              <div class="videoOverlay__text">Please wait.</div>
            </div>
          </div>
        </div>

        <div style="flex:1 1 auto;"></div>
      </div>

    </div>

    <div class="footer">© <span id="y"></span> VoxCourt.</div>
  </div>
`;

  app.querySelector("#y").textContent = String(new Date().getFullYear());

  const miTitle = app.querySelector("#miTitle");
  const miLine2 = app.querySelector("#miLine2");

  const status = app.querySelector("#status");
  const photoStatus = app.querySelector("#photostatus");
  const streamSourceLabel = app.querySelector("#streamSourceLabel");
  const videoEl = app.querySelector("#camVideo");
  const videoOverlay = app.querySelector("#videoOverlay");

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
  let streamCheckToken = 0;
  let lastFailedStreamUrl = "";
  let lastFailedAt = 0;
  let openAttemptTimer = null;

  function clearOpenAttemptTimer() {
    if (openAttemptTimer) {
      clearTimeout(openAttemptTimer);
      openAttemptTimer = null;
    }
  }

  function markCurrentVideoAsUnavailable(reasonText, customLabel) {
    clearOpenAttemptTimer();
    if (currentSelectedStreamUrl) {
      lastFailedStreamUrl = currentSelectedStreamUrl;
      lastFailedAt = Date.now();
    }
    currentSelectedStreamUrl = "";
    if (customLabel) {
      streamSourceLabel.textContent = `Source: ${customLabel}`;
    }
    showVideoUnavailable(
      videoEl,
      videoOverlay,
      "Video not available",
      reasonText || "No live video source."
    );
  }

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
      const myToken = ++streamCheckToken;

      try {
        const picked = await pickBestStreamSource({
          apiBase,
          courtObj,
          courtId: `${country}/${city}/${clubId}/${courtId}`
        });

        if (myToken !== streamCheckToken) return;

        const selectedUrl = String(picked.selectedUrl || "").trim();

        if (!selectedUrl) {
          status.textContent = "No stream source available.";
          streamSourceLabel.textContent = "Source: No live source";
          currentSelectedStreamUrl = "";
          showVideoUnavailable(
            videoEl,
            videoOverlay,
            "Video not available",
            "No active video source for this court."
          );
          return;
        }

        const now = Date.now();
        if (selectedUrl === lastFailedStreamUrl && now - lastFailedAt < 15000) {
          const cachedLabel = picked.sourcesPayloadLabel
            ? `${picked.sourcesPayloadLabel} (offline)`
            : `${picked.sourceLabel} (offline)`;

          streamSourceLabel.textContent = `Source: ${cachedLabel}`;
          currentSelectedStreamUrl = "";
          showVideoUnavailable(
            videoEl,
            videoOverlay,
            "Video not available",
            "Last detected source is offline."
          );
          return;
        }

        if (selectedUrl === currentSelectedStreamUrl && videoEl.currentSrc) {
          return;
        }

        showVideoLoading(
          videoEl,
          videoOverlay,
          "Checking video…",
          "Trying to open live stream."
        );

        const isReachable = await probeStreamUrl(selectedUrl, 4500);

        if (myToken !== streamCheckToken) return;

        if (!isReachable) {
          lastFailedStreamUrl = selectedUrl;
          lastFailedAt = Date.now();
          currentSelectedStreamUrl = "";

          const badLabel = picked.sourcesPayloadLabel
            ? `${picked.sourcesPayloadLabel} (offline)`
            : `${picked.sourceLabel} (offline)`;

          streamSourceLabel.textContent = `Source: ${badLabel}`;

          showVideoUnavailable(
            videoEl,
            videoOverlay,
            "Video not available",
            "The selected source exists in API but no live stream is responding."
          );
          return;
        }

        currentSelectedStreamUrl = selectedUrl;
        streamSourceLabel.textContent = `Source: ${picked.sourceLabel}`;

        const ok = attachHlsToVideo(
          videoEl,
          selectedUrl,
          () => {
            clearOpenAttemptTimer();
            showVideoReady(videoEl, videoOverlay);
          },
          () => {
            markCurrentVideoAsUnavailable(
              "The live stream could not be opened.",
              picked.sourcesPayloadLabel
                ? `${picked.sourcesPayloadLabel} (offline)`
                : `${picked.sourceLabel} (offline)`
            );
          }
        );

        if (!ok) {
          markCurrentVideoAsUnavailable(
            "No valid video URL.",
            picked.sourcesPayloadLabel
              ? `${picked.sourcesPayloadLabel} (offline)`
              : `${picked.sourceLabel} (offline)`
          );
          return;
        }

        clearOpenAttemptTimer();
        openAttemptTimer = setTimeout(() => {
          markCurrentVideoAsUnavailable(
            "The live stream did not start in time.",
            picked.sourcesPayloadLabel
              ? `${picked.sourcesPayloadLabel} (offline)`
              : `${picked.sourceLabel} (offline)`
          );
        }, 9000);
      } catch (e) {
        if (myToken !== streamCheckToken) return;
        streamSourceLabel.textContent = "Source: unavailable";
        showVideoUnavailable(
          videoEl,
          videoOverlay,
          "Video not available",
          `Unable to check stream source: ${e.message}`
        );
      }
    }

    await refreshStreamSource();
    setInterval(refreshStreamSource, 5000);

    if (!stateUrl) {
      status.textContent = "No state URL configured for this court.";
      showVideoUnavailable(
        videoEl,
        videoOverlay,
        "Video not available",
        "No state URL configured."
      );
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
    streamSourceLabel.textContent = "Source: unavailable";
    showVideoUnavailable(
      videoEl,
      videoOverlay,
      "Video not available",
      "Viewer configuration error."
    );
  }
}
