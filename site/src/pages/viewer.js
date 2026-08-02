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

function destroyVideoWebRtc(video) {
  if (!video) return;

  try {
    if (video._webrtcReader) {
      video._webrtcReader.close();
      video._webrtcReader = null;
    }
  } catch (_) {}

  try {
    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === "function") {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    video.srcObject = null;
  } catch (_) {}
}

function resetVideoElement(video) {
  if (!video) return;
  destroyVideoWebRtc(video);
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

function buildWebRtcUrl(apiBase, streamKey) {
  const base = String(apiBase || "").replace(/\/+$/, "");
  const key = String(streamKey || "").trim();
  if (!base || !key) return "";
  return `${base}/webrtc/${encodeURIComponent(key)}/whep`;
}

function buildWebRtcUrlFromHlsUrl(hlsUrl) {
  const raw = String(hlsUrl || "").trim();
  if (!raw) return "";

  try {
    const u = new URL(raw, window.location.origin);
    const match = u.pathname.match(/^\/hls\/(.+)\.m3u8$/i);
    if (!match) return "";

    const streamKey = decodeURIComponent(match[1]);
    return `${u.origin}/webrtc/${encodeURIComponent(streamKey)}/whep`;
  } catch (_) {
    return "";
  }
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
    webrtcUrl: "",
    hlsUrl: "",
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
      result.hlsUrl = buildMobileHlsUrl(apiBase, activeCam1.streamKey);
      result.webrtcUrl = buildWebRtcUrl(apiBase, activeCam1.streamKey);
      result.selectedUrl = result.hlsUrl;
      result.sourceLabel = `Mobile cam1 • ${activeCam1.deviceName || "Unknown device"}`;
      result.sourcesPayloadLabel = result.sourceLabel;
      return result;
    }

    if (activeCam2) {
      result.hlsUrl = buildMobileHlsUrl(apiBase, activeCam2.streamKey);
      result.webrtcUrl = buildWebRtcUrl(apiBase, activeCam2.streamKey);
      result.selectedUrl = result.hlsUrl;
      result.sourceLabel = `Mobile cam2 • ${activeCam2.deviceName || "Unknown device"}`;
      result.sourcesPayloadLabel = result.sourceLabel;
      return result;
    }

    if (legacyPiFallbackUrl) {
      result.hlsUrl = legacyPiFallbackUrl;
      result.webrtcUrl = buildWebRtcUrlFromHlsUrl(legacyPiFallbackUrl);
      result.selectedUrl = result.hlsUrl;
      result.sourceLabel = "Pi fallback stream";
      return result;
    }

    if (fallbackUrl) {
      result.hlsUrl = fallbackUrl;
      result.webrtcUrl = buildWebRtcUrlFromHlsUrl(fallbackUrl);
      result.selectedUrl = result.hlsUrl;
      result.sourceLabel = "Default / Config stream";
      return result;
    }

    result.selectedUrl = "";
    result.sourceLabel = "No active source";
    return result;
  } catch (_) {
    if (legacyPiFallbackUrl) {
      result.hlsUrl = legacyPiFallbackUrl;
      result.webrtcUrl = buildWebRtcUrlFromHlsUrl(legacyPiFallbackUrl);
      result.selectedUrl = result.hlsUrl;
      result.sourceLabel = "Pi fallback stream";
      return result;
    }

    if (fallbackUrl) {
      result.hlsUrl = fallbackUrl;
      result.webrtcUrl = buildWebRtcUrlFromHlsUrl(fallbackUrl);
      result.selectedUrl = result.hlsUrl;
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

function attachWebRtcToVideo(video, url, onReady, onFatal) {
  if (!video) return false;

  const u = String(url || "").trim();
  if (!u) return false;

  const Reader = window.MediaMTXWebRTCReader;
  if (typeof Reader !== "function") {
    console.warn("MediaMTXWebRTCReader is not loaded.");
    return false;
  }

  resetVideoElement(video);

  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";

  const mediaStream = new MediaStream();
  video.srcObject = mediaStream;

  let readyCalled = false;
  let fatalCalled = false;

  const safeReady = () => {
    if (readyCalled || fatalCalled) return;
    readyCalled = true;

    video.play?.().catch(() => {});

    if (typeof onReady === "function") {
      onReady();
    }
  };

  const safeFatal = (reason) => {
    if (fatalCalled || readyCalled) return;
    fatalCalled = true;

    console.warn("WebRTC stream error:", reason);

    if (typeof onFatal === "function") {
      onFatal(reason);
    }
  };

  try {
    const reader = new Reader({
      url: u,
      user: "",
      pass: "",
      token: "",

      onTrack: (evt) => {
        if (!evt?.track) return;

        const alreadyAdded = mediaStream
          .getTracks()
          .some((track) => track.id === evt.track.id);

        if (!alreadyAdded) {
          mediaStream.addTrack(evt.track);
        }

        evt.track.onunmute = safeReady;
        safeReady();
      },

      onError: (error) => {
        console.warn("MediaMTX WebRTC reader:", error);
      },

      onDataChannel: () => {}
    });

    video._webrtcReader = reader;

    video.onloadeddata = safeReady;
    video.oncanplay = safeReady;
    video.onplaying = safeReady;
    video.onerror = () => safeFatal("video element error");

    return true;
  } catch (error) {
    safeFatal(error?.message || String(error));
    return false;
  }
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

          <video
            id="replayVideo"
            playsinline
            controls
            style="
              position:absolute;
              inset:0;
              width:100%;
              height:100%;
              object-fit:contain;
              display:none;
              background:black;
              z-index:6;
            "
          ></video>

          <div
            id="videoModeBadge"
            class="video-mode-badge video-mode-badge--live"
          >
            <span class="video-mode-badge__dot"></span>
            <span id="videoModeBadgeText">LIVE</span>
          </div>

          <div
            id="replayLoadingOverlay"
            class="replay-loading-overlay"
            style="display:none;"
          >
            <div class="replay-loading-box">
              <div class="replay-loading-spinner"></div>
              <div class="replay-loading-title">Preparing replay…</div>
              <div class="replay-loading-text">Please wait a moment.</div>
            </div>
          </div>

          <div id="videoOverlay" class="videoOverlay videoOverlay--show">
            <div class="videoOverlay__box">
              <div class="videoOverlay__title">Checking video…</div>
              <div class="videoOverlay__text">Please wait.</div>
            </div>
          </div>
        </div>

        <div
          id="cameraButtons"
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin-top:12px;
          "
        ></div>

        <div style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:12px;
        ">
          <button id="btnReplay30" class="btn small" type="button">
            Replay 30s
          </button>

          <button
            id="btnBackLive"
            class="btn small"
            type="button"
            style="display:none;"
          >
            Back to Live
          </button>
        </div>

        <div class="hint" id="replayStatus" style="margin-top:8px;">
          Replay ready
        </div>

        <div style="flex:1 1 auto;"></div>
      </div>

    </div>

    <div
      class="panel section"
      style="
        margin-top:18px;
        display:flex;
        flex-direction:column;
        gap:12px;
      "
    >
      <div class="badge"><i></i> Match Timeline</div>

      <div
        id="timelineStatus"
        class="hint"
      >
        Waiting for match events…
      </div>

      <div
        id="timelineList"
        style="
          display:grid;
          gap:10px;
        "
      ></div>
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
  const videoModeBadge = app.querySelector("#videoModeBadge");
  const videoModeBadgeText = app.querySelector("#videoModeBadgeText");
  const replayLoadingOverlay = app.querySelector("#replayLoadingOverlay");
  const timelineStatus = app.querySelector("#timelineStatus");
  const timelineList = app.querySelector("#timelineList");

  const replayVideoEl = app.querySelector("#replayVideo");
  const cameraButtons = app.querySelector("#cameraButtons");
  const btnReplay30 = app.querySelector("#btnReplay30");
  const btnBackLive = app.querySelector("#btnBackLive");
  const replayStatus = app.querySelector("#replayStatus");

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

    let replayObjectUrl = "";
    let selectedReplayCam = "cam1";

    function renderCameraButtons(sources) {
      if (!cameraButtons) return;

      const list = Array.isArray(sources) ? sources : [];
      cameraButtons.innerHTML = "";

      const knownCams = ["cam1", "cam2", "cam3", "cam4"];

      for (const camRole of knownCams) {
        const source = list.find((s) => s?.camRole === camRole);
        const available = Boolean(source?.streamKey);
        const online = Boolean(source?.liveActive);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn small";
        button.dataset.camRole = camRole;

        const camNumber = camRole.replace("cam", "");

        button.textContent = `Camera ${camNumber}`;
        button.title = source?.deviceName
          ? `${source.deviceName} • ${online ? "LIVE" : "OFFLINE"}`
          : `${online ? "LIVE" : available ? "OFFLINE" : "Not configured"}`;

        button.disabled = !available;

        if (camRole === selectedReplayCam) {
          button.style.borderColor = "var(--teal)";
          button.style.boxShadow = "0 0 0 2px rgba(8,184,187,.15)";
        }

        button.addEventListener("click", () => {
          selectedReplayCam = camRole;
          renderCameraButtons(list);
          replayStatus.textContent = `Replay camera: ${camRole}`;
        });

        cameraButtons.appendChild(button);
      }
    }

    function cleanupReplayObjectUrl() {
      if (replayObjectUrl) {
        try {
          URL.revokeObjectURL(replayObjectUrl);
        } catch (_) {}
        replayObjectUrl = "";
      }
    }

    function setReplayLoading(loading, message = "Preparing replay…") {
      if (!replayLoadingOverlay) return;

      replayLoadingOverlay.style.display = loading ? "grid" : "none";

      const title = replayLoadingOverlay.querySelector(
        ".replay-loading-title"
      );

      if (title) {
        title.textContent = message;
      }
    }

    function setVideoMode(mode) {
      const replayMode = mode === "replay";

      videoModeBadge?.classList.toggle(
        "video-mode-badge--replay",
        replayMode
      );

      videoModeBadge?.classList.toggle(
        "video-mode-badge--live",
        !replayMode
      );

      if (videoModeBadgeText) {
        videoModeBadgeText.textContent = replayMode
          ? "REPLAY"
          : "LIVE";
      }
    }

    function backToLive() {
      cleanupReplayObjectUrl();

      try {
        replayVideoEl.pause();
      } catch (_) {}

      replayVideoEl.removeAttribute("src");
      replayVideoEl.load();
      replayVideoEl.style.display = "none";
      replayVideoEl.classList.remove("replay-video--active");
      setReplayLoading(false);

      btnBackLive.style.display = "none";
      btnReplay30.disabled = false;
      replayStatus.textContent = "Replay ready";

      videoEl.style.display = "block";
      videoEl.play?.().catch(() => {});
      setVideoMode("live");
    }

    async function openReplay(seconds = 30, cam = "cam1") {
      btnReplay30.disabled = true;
      replayStatus.textContent = `Preparing replay -${seconds}s…`;

      const replayUrl =
        `${apiBase}/api/replay` +
        `?courtId=${encodeURIComponent(`${country}/${city}/${clubId}/${courtId}`)}` +
        `&seconds=${encodeURIComponent(seconds)}` +
        `&cam=${encodeURIComponent(cam)}` +
        `&t=${Date.now()}`;

      try {
        const response = await fetch(replayUrl, {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          let detail = `HTTP ${response.status}`;
          try {
            const body = await response.text();
            if (body) detail = body.slice(0, 220);
          } catch (_) {}

          throw new Error(detail);
        }

        const blob = await response.blob();

        if (!blob || blob.size < 100000) {
          throw new Error("Replay file is empty or too small.");
        }

        cleanupReplayObjectUrl();
        replayObjectUrl = URL.createObjectURL(blob);

        try {
          replayVideoEl.pause();
        } catch (_) {}

        replayVideoEl.src = replayObjectUrl;
        replayVideoEl.currentTime = 0;
        replayVideoEl.style.display = "block";
        setVideoMode("replay");

        videoEl.style.display = "none";
        btnBackLive.style.display = "";
        replayStatus.textContent = `Replay ready • ${(blob.size / 1024 / 1024).toFixed(1)} MB`;

        await replayVideoEl.play();
      } catch (error) {
        replayStatus.textContent = `Replay error: ${error.message}`;
        btnReplay30.disabled = false;
        backToLive();
      }
    }

    btnReplay30?.addEventListener("click", () => {
      openReplay(30, selectedReplayCam);
    });

    btnBackLive?.addEventListener("click", () => {
      backToLive();
    });

    replayVideoEl?.addEventListener("ended", () => {
      replayStatus.textContent = "Replay finished • Returning to live…";

      window.setTimeout(() => {
        backToLive();
      }, 350);
    });

    replayVideoEl?.addEventListener("error", () => {
      replayStatus.textContent = "Replay playback failed • Returning to live…";

      window.setTimeout(() => {
        backToLive();
      }, 500);
    });

    function formatTimelineTime(timestamp) {
      const value = Number(timestamp || 0);

      if (!Number.isFinite(value) || value <= 0) {
        return "--:--";
      }

      return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    let lastTimelineSignature = "";
    let knownTimelineEventIds = new Set();

    function renderTimelineEvents(events) {
      if (!timelineList || !timelineStatus) return;

      const list = Array.isArray(events) ? events : [];

      const signature = list
        .map((event) => {
          const display = event?.display || {};

          return [
            event?.eventId || "",
            event?.timestamp || "",
            display?.replayAvailable === true ? "1" : "0",
            display?.title || "",
            display?.score || "",
            display?.games || "",
            display?.sets || ""
          ].join(":");
        })
        .join("|");

      if (signature === lastTimelineSignature) {
        return;
      }

      const previousScrollTop = timelineList.scrollTop;
      const previousIds = knownTimelineEventIds;

      lastTimelineSignature = signature;
      knownTimelineEventIds = new Set(
        list
          .map((event) => String(event?.eventId || ""))
          .filter(Boolean)
      );

      timelineList.innerHTML = "";

      if (list.length === 0) {
        timelineStatus.textContent = "No match events yet.";
        return;
      }

      timelineStatus.textContent = `${list.length} match event${list.length === 1 ? "" : "s"}`;

      for (const event of [...list].reverse()) {
        const display = event?.display || {};
        const metadata = event?.metadata || {};
        const eventId = String(event?.eventId || "");
        const eventType = String(display.type || event?.type || "EVENT").toUpperCase();
        const winnerSide = String(display.winner || metadata.winner || "").toUpperCase();

        const winnerName =
          winnerSide === "A"
            ? String(metadata.nameA || nameAEl?.textContent || "Player A")
            : winnerSide === "B"
              ? String(metadata.nameB || nameBEl?.textContent || "Player B")
              : "";

        const serverSide = String(display.server || "").toUpperCase();
        const serverName =
          serverSide === "A"
            ? String(metadata.nameA || nameAEl?.textContent || "Player A")
            : serverSide === "B"
              ? String(metadata.nameB || nameBEl?.textContent || "Player B")
              : "";

        const eventTime = formatTimelineTime(
          display.timestamp || event?.timestamp
        );

        let icon = "•";
        let titleText = eventType;

        if (eventType === "POINT") {
          icon = "🎾";
          titleText = winnerName
            ? `${winnerName} won the point`
            : "Point completed";
        } else if (eventType === "GAME") {
          icon = "🏆";
          titleText = winnerName
            ? `${winnerName} won the game`
            : "Game completed";
        } else if (eventType === "SET") {
          icon = "👑";
          titleText = winnerName
            ? `${winnerName} won the set`
            : "Set completed";
        } else if (eventType === "MATCH") {
          icon = "🥇";
          titleText = winnerName
            ? `${winnerName} won the match`
            : "Match completed";
        } else if (eventType === "SERVER_CHANGE") {
          icon = "🎯";
          titleText = serverName
            ? `${serverName} to serve`
            : "Server changed";
        }

        const card = document.createElement("div");

        const isNewEvent =
          Boolean(eventId) &&
          previousIds.size > 0 &&
          !previousIds.has(eventId);

        card.className = isNewEvent
          ? "timeline-event timeline-event--enter"
          : "timeline-event";

        card.style.cssText = `
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto auto;
          gap:14px;
          align-items:center;
          padding:10px 12px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:16px;
          background:rgba(255,255,255,.025);
        `;

        const iconBox = document.createElement("div");
        iconBox.className = "timeline-event-icon";
        iconBox.textContent = icon;
        iconBox.style.cssText = `
          width:48px;
          height:48px;
          display:grid;
          place-items:center;
          flex:0 0 auto;
          border-radius:14px;
          font-size:24px;
          background:rgba(255,255,255,.055);
          border:1px solid rgba(255,255,255,.06);
        `;

        const info = document.createElement("div");
        info.style.minWidth = "0";

        const title = document.createElement("strong");
        title.textContent = titleText;
        title.style.cssText = `
          display:block;
          font-size:15px;
          line-height:1.35;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        `;

        const summary = document.createElement("div");
        summary.className = "hint";
        summary.style.marginTop = "4px";

        if (eventType === "SERVER_CHANGE") {
          summary.textContent = serverName
            ? `Server: ${serverName}`
            : "Server changed";
        } else {
          summary.textContent =
            `Score ${display.score || "—"}  •  ` +
            `Games ${display.games || "—"}  •  ` +
            `Sets ${display.sets || "—"}`;
        }

        info.appendChild(title);
        info.appendChild(summary);

        const chips = document.createElement("div");
        chips.className = "timeline-event-chips";
        chips.style.cssText = `
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
        `;

        const makeChip = (value, active = false) => {
          const chip = document.createElement("span");
          chip.textContent = value || "—";
          chip.style.cssText = `
            min-width:58px;
            padding:7px 12px;
            text-align:center;
            border-radius:999px;
            font-weight:800;
            font-size:13px;
            color:#fff;
            background:${active ? "rgba(0,190,190,.28)" : "rgba(255,255,255,.06)"};
            border:1px solid ${active ? "rgba(0,220,220,.32)" : "rgba(255,255,255,.06)"};
          `;
          return chip;
        };

        chips.appendChild(makeChip(display.score || "—", true));
        chips.appendChild(makeChip(display.games || "—"));
        chips.appendChild(makeChip(display.sets || "—"));

        const rightSide = document.createElement("div");
        rightSide.className = "timeline-event-right";
        rightSide.style.cssText = `
          display:flex;
          align-items:center;
          gap:14px;
        `;

        const time = document.createElement("span");
        time.textContent = eventTime;
        time.className = "hint";
        time.style.whiteSpace = "nowrap";

        const actions = document.createElement("div");
        actions.className = "timeline-event-actions";

        const replayButton = document.createElement("button");
        replayButton.type = "button";
        replayButton.className = "btn small";

        const replayAvailable = display.replayAvailable === true;

        replayButton.textContent = replayAvailable
          ? "▶ Replay"
          : "Expired";

        replayButton.disabled = !eventId || !replayAvailable;

        if (!replayAvailable) {
          replayButton.classList.add("timeline-replay-expired");
          replayButton.title = "This replay is no longer available.";
        }

        replayButton.addEventListener("click", async () => {
          if (!eventId) return;

          replayButton.disabled = true;

          const originalButtonText = replayButton.textContent;
          replayButton.textContent = "Preparing…";

          setReplayLoading(
            true,
            `Preparing ${display.title || "event"} replay…`
          );

          replayStatus.textContent =
            `Preparing ${display.title || "event"} replay…`;

          const replayUrl =
            `${apiBase}/api/events/${encodeURIComponent(eventId)}/replay` +
            `?t=${Date.now()}`;

          try {
            const response = await fetch(replayUrl, {
              method: "GET",
              cache: "no-store"
            });

            if (!response.ok) {
              let detail = `HTTP ${response.status}`;

              try {
                const body = await response.text();
                if (body) detail = body.slice(0, 220);
              } catch (_) {}

              throw new Error(detail);
            }

            const blob = await response.blob();

            if (!blob || blob.size < 50000) {
              throw new Error("Replay file is empty or unavailable.");
            }

            cleanupReplayObjectUrl();
            replayObjectUrl = URL.createObjectURL(blob);

            try {
              replayVideoEl.pause();
            } catch (_) {}

            replayVideoEl.src = replayObjectUrl;
            replayVideoEl.currentTime = 0;
            replayVideoEl.style.display = "block";
            replayVideoEl.classList.add("replay-video--active");
            setReplayLoading(false);
            setVideoMode("replay");

            videoEl.style.display = "none";
            btnBackLive.style.display = "";
            btnBackLive.textContent = "← Back to Live";
            replayStatus.textContent =
              `${display.title || "Replay"} • ${(blob.size / 1024 / 1024).toFixed(1)} MB`;

            await replayVideoEl.play();
          } catch (error) {
            setReplayLoading(false);
            replayStatus.textContent = `Replay error: ${error.message}`;
          } finally {
            replayButton.disabled = false;
            replayButton.textContent = originalButtonText;
          }
        });

        actions.appendChild(replayButton);
        rightSide.appendChild(time);
        rightSide.appendChild(actions);

        card.appendChild(iconBox);
        card.appendChild(info);
        card.appendChild(chips);
        card.appendChild(rightSide);
        timelineList.appendChild(card);
      }

      requestAnimationFrame(() => {
        const hasNewEvent = list.some((event) => {
          const eventId = String(event?.eventId || "");

          return (
            eventId &&
            previousIds.size > 0 &&
            !previousIds.has(eventId)
          );
        });

        if (hasNewEvent && previousScrollTop < 40) {
          timelineList.scrollTop = 0;
        } else {
          timelineList.scrollTop = previousScrollTop;
        }
      });
    }

    async function refreshTimeline() {
      if (!timelineList || !timelineStatus) return;

      try {
        const activeMatchUrl =
          `${apiBase}/api/matches/active/${country}/${city}/${clubId}/${courtId}`;

        const activePayload = await fetchJson(activeMatchUrl);
        const matchId = String(activePayload?.match?.matchId || "");

        const eventsUrl =
          `${apiBase}/api/events/${country}/${city}/${clubId}/${courtId}` +
          `?limit=100` +
          (matchId ? `&matchId=${encodeURIComponent(matchId)}` : "");

        const payload = await fetchJson(eventsUrl);
        renderTimelineEvents(payload?.events);
      } catch (error) {
        timelineStatus.textContent = `Timeline unavailable: ${error.message}`;
      }
    }

    async function refreshStreamSource() {
      const myToken = ++streamCheckToken;

      try {
        const picked = await pickBestStreamSource({
          apiBase,
          courtObj,
          courtId: `${country}/${city}/${clubId}/${courtId}`
        });

        if (myToken !== streamCheckToken) return;

        renderCameraButtons(picked.mobileSources);

        const webrtcUrl = String(picked.webrtcUrl || "").trim();
        const hlsUrl = String(picked.hlsUrl || picked.selectedUrl || "").trim();
        const sourceIdentity = webrtcUrl || hlsUrl;

        if (!sourceIdentity) {
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

        if (
          sourceIdentity === lastFailedStreamUrl &&
          now - lastFailedAt < 15000
        ) {
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

        const alreadyPlaying =
          sourceIdentity === currentSelectedStreamUrl &&
          (
            videoEl._webrtcReader ||
            videoEl._hls ||
            videoEl.currentSrc ||
            videoEl.srcObject
          );

        if (alreadyPlaying) {
          return;
        }

        clearOpenAttemptTimer();

        showVideoLoading(
          videoEl,
          videoOverlay,
          "Checking video…",
          "Opening low-latency live stream."
        );

        let playbackStarted = false;
        let fallbackStarted = false;

        const markReady = (mode) => {
          if (myToken !== streamCheckToken) return;

          playbackStarted = true;
          clearOpenAttemptTimer();

          currentSelectedStreamUrl = sourceIdentity;
          lastFailedStreamUrl = "";
          lastFailedAt = 0;

          streamSourceLabel.textContent =
            `Source: ${picked.sourceLabel} • ${mode}`;

          showVideoReady(videoEl, videoOverlay);
        };

        const markFailed = (message) => {
          if (myToken !== streamCheckToken) return;

          clearOpenAttemptTimer();

          lastFailedStreamUrl = sourceIdentity;
          lastFailedAt = Date.now();
          currentSelectedStreamUrl = "";

          markCurrentVideoAsUnavailable(
            message,
            picked.sourcesPayloadLabel
              ? `${picked.sourcesPayloadLabel} (offline)`
              : `${picked.sourceLabel} (offline)`
          );
        };

        const startHlsFallback = async () => {
          if (fallbackStarted || playbackStarted) return;
          if (myToken !== streamCheckToken) return;

          fallbackStarted = true;
          clearOpenAttemptTimer();

          if (!hlsUrl) {
            markFailed("WebRTC failed and no HLS fallback is configured.");
            return;
          }

          streamSourceLabel.textContent =
            `Source: ${picked.sourceLabel} • switching to HLS fallback`;

          showVideoLoading(
            videoEl,
            videoOverlay,
            "Switching stream…",
            "WebRTC is unavailable. Trying HLS fallback."
          );

          const hlsReachable = await probeStreamUrl(hlsUrl, 4500);

          if (myToken !== streamCheckToken || playbackStarted) return;

          if (!hlsReachable) {
            markFailed(
              "Neither WebRTC nor the HLS fallback stream is responding."
            );
            return;
          }

          const hlsOk = attachHlsToVideo(
            videoEl,
            hlsUrl,
            () => markReady("HLS fallback"),
            () => markFailed("The HLS fallback stream could not be opened.")
          );

          if (!hlsOk) {
            markFailed("No valid HLS fallback URL.");
            return;
          }

          openAttemptTimer = setTimeout(() => {
            if (!playbackStarted) {
              markFailed("The HLS fallback stream did not start in time.");
            }
          }, 9000);
        };

        currentSelectedStreamUrl = sourceIdentity;

        if (webrtcUrl) {
          streamSourceLabel.textContent =
            `Source: ${picked.sourceLabel} • WebRTC`;

          const webrtcOk = attachWebRtcToVideo(
            videoEl,
            webrtcUrl,
            () => markReady("WebRTC"),
            () => startHlsFallback()
          );

          if (!webrtcOk) {
            await startHlsFallback();
            return;
          }

          openAttemptTimer = setTimeout(() => {
            if (!playbackStarted) {
              startHlsFallback();
            }
          }, 5000);

          return;
        }

        await startHlsFallback();
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

    await refreshTimeline();
    setInterval(refreshTimeline, 3000);

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
