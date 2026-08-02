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

    <section
      id="matchHero"
      class="panel section match-hero match-hero--compact"
      aria-label="Match information"
    >
      <div class="compact-match-header">
        <div class="compact-match-header__content">
          <div class="badge compact-match-header__badge">
            <i></i> Match info
          </div>

          <div class="compact-match-header__main">
            <div class="compact-match-header__text">
              <h1 id="miTitle" class="compact-match-header__title">
                Loading…
              </h1>

              <div
                id="miLine2"
                class="hint compact-match-header__subtitle"
              >
                —
              </div>
            </div>

            <div
              id="matchStatusBadge"
              class="match-status match-status--ready"
            >
              <span class="match-status__dot"></span>
              <span id="matchStatusText">READY</span>
            </div>
          </div>
        </div>

        <div class="compact-match-header__actions">
          <button
            id="btnShareMatch"
            class="match-action-button"
            type="button"
          >
            <span aria-hidden="true">↗</span>
            <span id="shareMatchText">Share match</span>
          </button>

          <button
            id="btnMatchFullscreen"
            class="match-action-button match-action-button--accent"
            type="button"
          >
            <span aria-hidden="true">⛶</span>
            <span id="fullscreenMatchText">Fullscreen</span>
          </button>
        </div>
      </div>

      <div
        id="matchActionFeedback"
        class="match-action-feedback"
        aria-live="polite"
      ></div>
    </section>

    <div style="height:16px;"></div>

    <section
      id="matchEndSummary"
      class="panel section match-end-summary"
      style="display:none;"
      aria-label="Match result"
    >
      <div class="match-end-summary__top">
        <div>
          <div class="match-end-summary__eyebrow">
            🏆 MATCH FINISHED
          </div>

          <h2 class="match-end-summary__title">
            <span id="matchWinnerName">Winner</span>
          </h2>

          <div class="match-end-summary__subtitle">
            Final result
          </div>
        </div>

        <div class="match-end-summary__trophy" aria-hidden="true">
          🏆
        </div>
      </div>

      <div class="match-end-summary__score">
        <div class="match-end-result-row match-end-result-row--winner">
          <span id="matchEndNameA">Player A</span>

          <div class="match-end-result-values">
            <strong id="matchEndSetsA">0</strong>
            <span id="matchEndGamesA">0</span>
          </div>
        </div>

        <div class="match-end-result-row">
          <span id="matchEndNameB">Player B</span>

          <div class="match-end-result-values">
            <strong id="matchEndSetsB">0</strong>
            <span id="matchEndGamesB">0</span>
          </div>
        </div>
      </div>

      <div class="match-end-summary__meta">
        <div>
          <span>Duration</span>
          <strong id="matchEndDuration">—</strong>
        </div>

        <div>
          <span>Completed</span>
          <strong id="matchEndTime">—</strong>
        </div>
      </div>

      <div class="match-end-summary__actions">
        <button
          id="btnShareResult"
          class="match-action-button"
          type="button"
        >
          ↗ Share result
        </button>

        <button
          id="btnWatchHighlights"
          class="match-action-button match-action-button--accent"
          type="button"
        >
          ▶ Watch highlights
        </button>

        <button
          id="btnFullMatchReplay"
          class="match-action-button"
          type="button"
        >
          ⏯ Full match replay
        </button>
      </div>
    </section>

    <div id="matchEndSummarySpacer" style="height:16px; display:none;"></div>

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

        <section
          id="replayStudio"
          class="replay-studio"
          style="display:none;"
          aria-label="Replay Studio"
        >
          <div class="replay-studio__header">
            <div class="replay-studio__identity">
              <span class="replay-studio__eyebrow">
                VOXCOURT REPLAY STUDIO
              </span>

              <strong id="replayStudioTitle">
                Event Replay
              </strong>

              <span id="replayStudioSubtitle">
                Professional instant replay
              </span>
            </div>

            <button
              id="replayStudioBackLive"
              class="replay-studio__back-live"
              type="button"
            >
              <span aria-hidden="true">←</span>
              <span>Back to Live</span>
            </button>
          </div>

          <div class="replay-studio__timeline">
            <span id="replayCurrentTime">0:00</span>

            <input
              id="replayProgress"
              class="replay-studio__progress"
              type="range"
              min="0"
              max="1000"
              value="0"
              step="1"
              aria-label="Replay progress"
            />

            <span id="replayDuration">0:00</span>
          </div>

          <div class="replay-studio__main-controls">
            <button
              id="replaySeekBack"
              class="replay-control replay-control--secondary"
              type="button"
              aria-label="Go back 10 seconds"
            >
              <span class="replay-control__icon">↶</span>
              <span>-10s</span>
            </button>

            <button
              id="replayPlayPause"
              class="replay-control replay-control--primary"
              type="button"
              aria-label="Play replay"
            >
              <span id="replayPlayPauseIcon">▶</span>
              <span id="replayPlayPauseText">Play</span>
            </button>

            <button
              id="replaySeekForward"
              class="replay-control replay-control--secondary"
              type="button"
              aria-label="Go forward 10 seconds"
            >
              <span class="replay-control__icon">↷</span>
              <span>+10s</span>
            </button>
          </div>

          <div class="replay-studio__tools">
            <div class="replay-studio__speed-group">
              <span class="replay-studio__tool-label">
                Playback speed
              </span>

              <div
                id="replaySpeedButtons"
                class="replay-speed-buttons"
                role="group"
                aria-label="Playback speed"
              >
                <button
                  type="button"
                  class="replay-speed-button"
                  data-replay-speed="0.25"
                >
                  0.25×
                </button>

                <button
                  type="button"
                  class="replay-speed-button"
                  data-replay-speed="0.5"
                >
                  0.5×
                </button>

                <button
                  type="button"
                  class="replay-speed-button replay-speed-button--active"
                  data-replay-speed="1"
                >
                  1×
                </button>

                <button
                  type="button"
                  class="replay-speed-button"
                  data-replay-speed="1.5"
                >
                  1.5×
                </button>
              </div>
            </div>

            <div class="replay-studio__zoom-group">
              <span class="replay-studio__tool-label">
                Zoom & inspection
              </span>

              <div class="replay-zoom-controls">
                <button
                  id="replayZoomOut"
                  class="replay-tool-button replay-zoom-button"
                  type="button"
                  aria-label="Zoom out"
                >
                  −
                </button>

                <button
                  id="replayZoomReset"
                  class="replay-tool-button replay-zoom-reset"
                  type="button"
                  aria-label="Reset zoom"
                >
                  <span id="replayZoomValue">100%</span>
                </button>

                <button
                  id="replayZoomIn"
                  class="replay-tool-button replay-zoom-button"
                  type="button"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>

              <span class="replay-zoom-hint">
                Drag to move • Pinch or wheel to zoom
              </span>
            </div>

            <div class="replay-studio__action-group">
              <button
                id="replayFullscreen"
                class="replay-tool-button"
                type="button"
              >
                <span aria-hidden="true">⛶</span>
                <span>Fullscreen</span>
              </button>

              <button
                id="replayDownload"
                class="replay-tool-button"
                type="button"
              >
                <span aria-hidden="true">↓</span>
                <span>Download</span>
              </button>

              <button
                id="replayShare"
                class="replay-tool-button replay-tool-button--accent"
                type="button"
              >
                <span aria-hidden="true">↗</span>
                <span>Share</span>
              </button>
            </div>
          </div>
        </section>

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
        id="timelineFilters"
        class="timeline-filters"
        aria-label="Timeline filters"
      >
        <button
          type="button"
          class="timeline-filter timeline-filter--active"
          data-timeline-filter="all"
        >
          All
        </button>

        <button
          type="button"
          class="timeline-filter"
          data-timeline-filter="points"
        >
          🎾 Points
        </button>

        <button
          type="button"
          class="timeline-filter"
          data-timeline-filter="games"
        >
          🏆 Games & Sets
        </button>

        <button
          type="button"
          class="timeline-filter"
          data-timeline-filter="replays"
        >
          ▶ Replays
        </button>
      </div>

      <div class="timeline-toolbar">
        <div class="timeline-toolbar__group">
          <button
            id="timelineExpandAll"
            class="timeline-toolbar-button"
            type="button"
          >
            Expand all
          </button>

          <button
            id="timelineCollapseAll"
            class="timeline-toolbar-button"
            type="button"
          >
            Collapse all
          </button>
        </div>

        <button
          id="timelineJumpLatest"
          class="timeline-toolbar-button timeline-toolbar-button--accent"
          type="button"
        >
          ↑ Latest event
        </button>
      </div>

      <div
        id="timelineStatus"
        class="hint"
      >
        Waiting for match events…
      </div>

      <div class="timeline-scroll-wrapper">
        <button
          id="timelineNewEventButton"
          class="timeline-new-event-button"
          type="button"
          style="display:none;"
        >
          ↑ New event
        </button>

        <div
          id="timelineList"
          style="
            display:grid;
            gap:10px;
          "
        ></div>
      </div>
    </div>

    <section
      id="highlightsPanel"
      class="panel section highlights-panel"
      aria-label="Match highlights"
    >
      <div class="highlights-panel__header">
        <div>
          <div class="badge">
            <i></i> Match Highlights
          </div>

          <h2 class="highlights-panel__title">
            Replay the key moments
          </h2>

          <div
            id="highlightsStatus"
            class="hint highlights-panel__status"
          >
            Waiting for available highlights…
          </div>
        </div>

        <button
          id="highlightsPlayFeatured"
          class="match-action-button match-action-button--accent"
          type="button"
          disabled
        >
          ▶ Play featured
        </button>
      </div>

      <div
        id="highlightsFilters"
        class="highlights-filters"
        aria-label="Highlight filters"
      >
        <button
          type="button"
          class="highlights-filter highlights-filter--active"
          data-highlight-filter="featured"
        >
          ★ Featured
        </button>

        <button
          type="button"
          class="highlights-filter"
          data-highlight-filter="all"
        >
          All
        </button>

        <button
          type="button"
          class="highlights-filter"
          data-highlight-filter="point"
        >
          🎾 Points
        </button>

        <button
          type="button"
          class="highlights-filter"
          data-highlight-filter="game"
        >
          🏆 Games
        </button>

        <button
          type="button"
          class="highlights-filter"
          data-highlight-filter="set"
        >
          👑 Sets
        </button>
      </div>

      <div
        id="highlightsGrid"
        class="highlights-grid"
      ></div>
    </section>

    <div style="height:18px;"></div>

    <div class="footer">© <span id="y"></span> VoxCourt.</div>
  </div>
`;

  app.querySelector("#y").textContent = String(new Date().getFullYear());

  const miTitle = app.querySelector("#miTitle");
  const miLine2 = app.querySelector("#miLine2");

  const matchHero = app.querySelector("#matchHero");
  const matchStatusBadge = app.querySelector("#matchStatusBadge");
  const matchStatusText = app.querySelector("#matchStatusText");
  const matchStartedAt = app.querySelector("#matchStartedAt");
  const matchFormat = app.querySelector("#matchFormat");
  const matchActionFeedback = app.querySelector("#matchActionFeedback");

  const btnShareMatch = app.querySelector("#btnShareMatch");
  const shareMatchText = app.querySelector("#shareMatchText");
  const btnMatchFullscreen = app.querySelector("#btnMatchFullscreen");
  const fullscreenMatchText = app.querySelector("#fullscreenMatchText");

  const matchEndSummary = app.querySelector("#matchEndSummary");
  const matchEndSummarySpacer = app.querySelector("#matchEndSummarySpacer");
  const matchWinnerName = app.querySelector("#matchWinnerName");
  const matchEndNameA = app.querySelector("#matchEndNameA");
  const matchEndNameB = app.querySelector("#matchEndNameB");
  const matchEndSetsA = app.querySelector("#matchEndSetsA");
  const matchEndSetsB = app.querySelector("#matchEndSetsB");
  const matchEndGamesA = app.querySelector("#matchEndGamesA");
  const matchEndGamesB = app.querySelector("#matchEndGamesB");
  const matchEndDuration = app.querySelector("#matchEndDuration");
  const matchEndTime = app.querySelector("#matchEndTime");
  const btnShareResult = app.querySelector("#btnShareResult");
  const btnWatchHighlights = app.querySelector("#btnWatchHighlights");
  const btnFullMatchReplay = app.querySelector("#btnFullMatchReplay");

  const heroNameA = app.querySelector("#heroNameA");
  const heroNameB = app.querySelector("#heroNameB");
  const heroPointA = app.querySelector("#heroPointA");
  const heroPointB = app.querySelector("#heroPointB");
  const heroGamesA = app.querySelector("#heroGamesA");
  const heroGamesB = app.querySelector("#heroGamesB");
  const heroSetsA = app.querySelector("#heroSetsA");
  const heroSetsB = app.querySelector("#heroSetsB");
  const heroServeA = app.querySelector("#heroServeA");
  const heroServeB = app.querySelector("#heroServeB");

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
  const timelineFilters = app.querySelector("#timelineFilters");
  const timelineNewEventButton = app.querySelector(
    "#timelineNewEventButton"
  );
  const timelineExpandAll = app.querySelector("#timelineExpandAll");
  const timelineCollapseAll = app.querySelector("#timelineCollapseAll");
  const timelineJumpLatest = app.querySelector("#timelineJumpLatest");

  const highlightsPanel = app.querySelector("#highlightsPanel");
  const highlightsStatus = app.querySelector("#highlightsStatus");
  const highlightsFilters = app.querySelector("#highlightsFilters");
  const highlightsGrid = app.querySelector("#highlightsGrid");
  const highlightsPlayFeatured = app.querySelector(
    "#highlightsPlayFeatured"
  );

  const replayVideoEl = app.querySelector("#replayVideo");
  const cameraButtons = app.querySelector("#cameraButtons");
  const btnReplay30 = app.querySelector("#btnReplay30");
  const btnBackLive = app.querySelector("#btnBackLive");
  const replayStatus = app.querySelector("#replayStatus");

  const replayStudio = app.querySelector("#replayStudio");
  const replayStudioTitle = app.querySelector("#replayStudioTitle");
  const replayStudioSubtitle = app.querySelector("#replayStudioSubtitle");
  const replayStudioBackLive = app.querySelector(
    "#replayStudioBackLive"
  );

  const replayCurrentTime = app.querySelector("#replayCurrentTime");
  const replayDuration = app.querySelector("#replayDuration");
  const replayProgress = app.querySelector("#replayProgress");

  const replaySeekBack = app.querySelector("#replaySeekBack");
  const replaySeekForward = app.querySelector("#replaySeekForward");
  const replayPlayPause = app.querySelector("#replayPlayPause");
  const replayPlayPauseIcon = app.querySelector(
    "#replayPlayPauseIcon"
  );
  const replayPlayPauseText = app.querySelector(
    "#replayPlayPauseText"
  );

  const replaySpeedButtons = app.querySelector(
    "#replaySpeedButtons"
  );

  const replayFullscreen = app.querySelector("#replayFullscreen");
  const replayDownload = app.querySelector("#replayDownload");
  const replayShare = app.querySelector("#replayShare");

  const replayZoomIn = app.querySelector("#replayZoomIn");
  const replayZoomOut = app.querySelector("#replayZoomOut");
  const replayZoomReset = app.querySelector("#replayZoomReset");
  const replayZoomValue = app.querySelector("#replayZoomValue");

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

  let currentReplayBlob = null;
  let currentReplayFilename = "voxcourt-replay.mp4";
  let currentReplaySourceUrl = "";
  let currentReplayTitle = "Event Replay";

  let replayZoomScale = 1;
  let replayPanX = 0;
  let replayPanY = 0;

  let replayDragging = false;
  let replayDragStartX = 0;
  let replayDragStartY = 0;
  let replayDragOriginX = 0;
  let replayDragOriginY = 0;

  const replayPointers = new Map();
  let replayPinchStartDistance = 0;
  let replayPinchStartScale = 1;

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

    function formatMatchStart(value) {
      const timestamp = Number(value || 0);

      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "Not started";
      }

      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    let latestMatchState = null;
    let latestMatchLifecycle = null;

    function formatDuration(startedAt, endedAt) {
      const start = Number(startedAt || 0);
      const end = Number(endedAt || 0);

      if (!start || !end || end <= start) {
        return "—";
      }

      const totalSeconds = Math.floor((end - start) / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }

      return `${minutes} min`;
    }

    function renderMatchEndSummary(match, state) {
      if (!matchEndSummary || !matchEndSummarySpacer) return;

      const matchStatus = String(
        match?.status ||
        state?.matchStatus ||
        ""
      ).toUpperCase();

      if (matchStatus !== "ENDED") {
        matchEndSummary.style.display = "none";
        matchEndSummarySpacer.style.display = "none";
        return;
      }

      const source = state || {};
      const metadata = match?.metadata || {};

      const nameA = String(
        match?.nameA ||
        source.nameA ||
        source.playerA?.name ||
        "Player A"
      );

      const nameB = String(
        match?.nameB ||
        source.nameB ||
        source.playerB?.name ||
        "Player B"
      );

      const winnerSide = String(
        match?.winner ||
        source.winner ||
        ""
      ).toUpperCase();

      const winnerNameFromTablet = String(
        match?.winnerName ||
        source.winnerName ||
        ""
      ).trim();

      const winnerName =
        winnerNameFromTablet ||
        (
          winnerSide === "A"
            ? nameA
            : winnerSide === "B"
              ? nameB
              : "Match completed"
        );

      const finalScore = String(
        match?.finalScore ||
        source.finalScore ||
        ""
      ).trim();

      const durationSeconds = Number(
        match?.durationSeconds ??
        source.durationSeconds ??
        0
      );

      const formatLabel = String(
        match?.formatLabel ||
        metadata.formatLabel ||
        source.formatLabel ||
        ""
      ).trim();

      const rules =
        match?.rules ||
        metadata.rules ||
        source.rules ||
        {};

      if (matchWinnerName) {
        matchWinnerName.textContent = winnerName;
      }

      if (matchEndNameA) {
        matchEndNameA.textContent = nameA;
      }

      if (matchEndNameB) {
        matchEndNameB.textContent = nameB;
      }

      /*
       * Δεν υπολογίζουμε νικητή ή τελικό σκορ.
       * Εμφανίζουμε αποκλειστικά όσα έστειλε το tablet.
       */
      if (matchEndSetsA) {
        matchEndSetsA.textContent =
          finalScore || "—";
      }

      if (matchEndSetsB) {
        matchEndSetsB.textContent =
          formatLabel || "—";
      }

      if (matchEndGamesA) {
        matchEndGamesA.textContent =
          winnerSide || "—";
      }

      if (matchEndGamesB) {
        matchEndGamesB.textContent =
          Object.keys(rules).length > 0
            ? "Rules"
            : "—";
      }

      if (matchEndDuration) {
        if (durationSeconds > 0) {
          const totalMinutes = Math.floor(
            durationSeconds / 60
          );

          const hours = Math.floor(
            totalMinutes / 60
          );

          const minutes = totalMinutes % 60;

          matchEndDuration.textContent =
            hours > 0
              ? `${hours}h ${minutes}m`
              : `${minutes} min`;
        } else {
          matchEndDuration.textContent = "—";
        }
      }

      if (matchEndTime) {
        matchEndTime.textContent = match?.endedAt
          ? new Date(
              Number(match.endedAt)
            ).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })
          : "—";
      }

      const rows = matchEndSummary.querySelectorAll(
        ".match-end-result-row"
      );

      rows.forEach((row) => {
        row.classList.remove(
          "match-end-result-row--winner"
        );
      });

      if (winnerSide === "A") {
        rows[0]?.classList.add(
          "match-end-result-row--winner"
        );
      } else if (winnerSide === "B") {
        rows[1]?.classList.add(
          "match-end-result-row--winner"
        );
      }

      matchEndSummary.dataset.finalScore =
        finalScore;

      matchEndSummary.dataset.formatLabel =
        formatLabel;

      matchEndSummary.dataset.rules =
        JSON.stringify(rules);

      matchEndSummary.style.display = "grid";
      matchEndSummarySpacer.style.display = "block";
    }


    function setMatchStatus(status) {
      const normalized = String(status || "READY").toUpperCase();

      let visibleStatus = normalized;

      if (
        visibleStatus !== "LIVE" &&
        visibleStatus !== "ENDED" &&
        visibleStatus !== "READY"
      ) {
        visibleStatus = "READY";
      }

      if (matchStatusText) {
        matchStatusText.textContent = visibleStatus;
      }

      if (!matchStatusBadge) return;

      matchStatusBadge.classList.remove(
        "match-status--live",
        "match-status--ended",
        "match-status--ready",
        "match-status--waiting"
      );

      if (visibleStatus === "LIVE") {
        matchStatusBadge.classList.add("match-status--live");
      } else if (visibleStatus === "ENDED") {
        matchStatusBadge.classList.add("match-status--ended");
      } else {
        matchStatusBadge.classList.add("match-status--ready");
      }
    }


    function updateHeroScore({
      nameA,
      nameB,
      pointA,
      pointB,
      gamesA,
      gamesB,
      setsA,
      setsB,
      server
    }) {
      if (heroNameA) heroNameA.textContent = String(nameA || "Player A");
      if (heroNameB) heroNameB.textContent = String(nameB || "Player B");

      if (heroPointA) heroPointA.textContent = String(pointA ?? "—");
      if (heroPointB) heroPointB.textContent = String(pointB ?? "—");
      if (heroGamesA) heroGamesA.textContent = String(gamesA ?? "—");
      if (heroGamesB) heroGamesB.textContent = String(gamesB ?? "—");
      if (heroSetsA) heroSetsA.textContent = String(setsA ?? "—");
      if (heroSetsB) heroSetsB.textContent = String(setsB ?? "—");

      const serverSide = String(server || "").toUpperCase();

      if (heroServeA) {
        heroServeA.style.display = serverSide === "A" ? "" : "none";
      }

      if (heroServeB) {
        heroServeB.style.display = serverSide === "B" ? "" : "none";
      }
    }

    function showMatchActionFeedback(message) {
      if (!matchActionFeedback) return;

      matchActionFeedback.textContent = message;
      matchActionFeedback.classList.add(
        "match-action-feedback--visible"
      );

      window.clearTimeout(showMatchActionFeedback.timer);

      showMatchActionFeedback.timer = window.setTimeout(() => {
        matchActionFeedback.classList.remove(
          "match-action-feedback--visible"
        );
      }, 2200);
    }

    btnShareResult?.addEventListener("click", async () => {
      const winner = matchWinnerName?.textContent || "Match result";

      const resultText =
        `${winner} • ` +
        `${matchEndSetsA?.textContent || "0"}-${matchEndSetsB?.textContent || "0"} sets`;

      const shareData = {
        title: "VoxCourt match result",
        text: resultText,
        url: window.location.href
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(
            `${resultText}
${window.location.href}`
          );

          showMatchActionFeedback("Result copied.");
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          showMatchActionFeedback("Unable to share result.");
        }
      }
    });

    btnWatchHighlights?.addEventListener("click", () => {
      showMatchActionFeedback(
        "Highlights will be available in the next update."
      );
    });

    btnFullMatchReplay?.addEventListener("click", () => {
      showMatchActionFeedback(
        "Full match replay will be available in the next update."
      );
    });

    btnShareMatch?.addEventListener("click", async () => {
      const shareTitle =
        miTitle?.textContent ||
        "VoxCourt live match";

      const shareText =
        "Watch this match live on VoxCourt.";

      try {
        const result = await shareOrCopy({
          title: shareTitle,
          text: shareText,
          url: window.location.href
        });

        if (result === "copied") {
          if (shareMatchText) {
            shareMatchText.textContent = "Link copied";
          }

          showMatchActionFeedback(
            "Match link copied."
          );

          window.setTimeout(() => {
            if (shareMatchText) {
              shareMatchText.textContent = "Share match";
            }
          }, 1800);
        } else if (
          result === "shared-url" ||
          result === "shared-file"
        ) {
          showMatchActionFeedback(
            "Match shared."
          );
        }
      } catch (error) {
        showMatchActionFeedback(
          "Unable to share or copy the match link."
        );
      }
    });

    btnMatchFullscreen?.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await matchHero?.closest(".wrap")?.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      } catch (_) {
        showMatchActionFeedback(
          "Fullscreen is not available in this browser."
        );
      }
    });

    document.addEventListener("fullscreenchange", () => {
      const fullscreenActive = Boolean(document.fullscreenElement);

      document.body.classList.toggle(
        "voxcourt-viewer-fullscreen",
        fullscreenActive
      );

      if (fullscreenMatchText) {
        fullscreenMatchText.textContent = fullscreenActive
          ? "Exit fullscreen"
          : "Fullscreen";
      }
    });

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

    function isLikelyMobileDevice() {
      return (
        window.matchMedia?.("(pointer: coarse)")?.matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(
          navigator.userAgent || ""
        )
      );
    }

    async function copyTextSafely(value) {
      const textValue = String(value || "").trim();

      if (!textValue) {
        throw new Error("Nothing to copy.");
      }

      if (
        window.isSecureContext &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(textValue);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = textValue;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";

      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) {
        throw new Error("Clipboard copy failed.");
      }
    }

    function getReplayShareUrl() {
      try {
        if (currentReplaySourceUrl) {
          const url = new URL(
            currentReplaySourceUrl,
            window.location.href
          );

          /*
           * Αφαιρούμε το προσωρινό cache-buster.
           * Το event endpoint παραμένει κανονικό shareable URL.
           */
          url.searchParams.delete("t");

          if (
            url.protocol === "http:" ||
            url.protocol === "https:"
          ) {
            return url.href;
          }
        }
      } catch (_) {}

      return window.location.href;
    }

    async function shareOrCopy({
      title,
      text,
      url,
      file = null
    }) {
      const safeTitle = String(title || "VoxCourt");
      const safeText = String(text || "");
      const safeUrl = String(url || window.location.href);

      /*
       * File sharing μόνο σε κινητά και μόνο αν δηλώνεται
       * ξεκάθαρα ότι υποστηρίζεται.
       */
      if (
        file &&
        isLikelyMobileDevice() &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        try {
          await navigator.share({
            title: safeTitle,
            text: safeText,
            files: [file]
          });

          return "shared-file";
        } catch (error) {
          if (error?.name === "AbortError") {
            return "cancelled";
          }

          /*
           * Συνεχίζουμε σε URL share / clipboard fallback.
           */
        }
      }

      /*
       * URL sharing μόνο κυρίως σε κινητό.
       * Στο desktop αποφεύγουμε το προβληματικό Windows share dialog.
       */
      if (
        isLikelyMobileDevice() &&
        navigator.share
      ) {
        try {
          await navigator.share({
            title: safeTitle,
            text: safeText,
            url: safeUrl
          });

          return "shared-url";
        } catch (error) {
          if (error?.name === "AbortError") {
            return "cancelled";
          }
        }
      }

      await copyTextSafely(
        safeText
          ? `${safeText}
${safeUrl}`
          : safeUrl
      );

      return "copied";
    }

    function clampReplayPan() {
      if (!replayVideoEl) return;

      if (replayZoomScale <= 1) {
        replayPanX = 0;
        replayPanY = 0;
        return;
      }

      const stage = replayVideoEl.closest(".cam--viewer");
      const rect = stage?.getBoundingClientRect();

      if (!rect) return;

      const maxX = Math.max(
        0,
        (rect.width * (replayZoomScale - 1)) / 2
      );

      const maxY = Math.max(
        0,
        (rect.height * (replayZoomScale - 1)) / 2
      );

      replayPanX = Math.max(
        -maxX,
        Math.min(maxX, replayPanX)
      );

      replayPanY = Math.max(
        -maxY,
        Math.min(maxY, replayPanY)
      );
    }

    function applyReplayTransform() {
      if (!replayVideoEl) return;

      clampReplayPan();

      replayVideoEl.style.transform =
        `translate3d(${replayPanX}px, ${replayPanY}px, 0) ` +
        `scale(${replayZoomScale})`;

      replayVideoEl.style.cursor =
        replayZoomScale > 1
          ? replayDragging
            ? "grabbing"
            : "grab"
          : "zoom-in";

      replayVideoEl.classList.toggle(
        "replay-video--zoomed",
        replayZoomScale > 1
      );

      if (replayZoomValue) {
        replayZoomValue.textContent =
          `${Math.round(replayZoomScale * 100)}%`;
      }

      if (replayZoomOut) {
        replayZoomOut.disabled = replayZoomScale <= 1;
      }

      if (replayZoomIn) {
        replayZoomIn.disabled = replayZoomScale >= 5;
      }
    }

    function setReplayZoom(nextScale, focusX = null, focusY = null) {
      const oldScale = replayZoomScale;

      const newScale = Math.max(
        1,
        Math.min(5, Number(nextScale || 1))
      );

      if (
        focusX !== null &&
        focusY !== null &&
        oldScale > 0 &&
        newScale !== oldScale
      ) {
        const stage = replayVideoEl?.closest(".cam--viewer");
        const rect = stage?.getBoundingClientRect();

        if (rect) {
          const localX =
            Number(focusX) - rect.left - rect.width / 2;

          const localY =
            Number(focusY) - rect.top - rect.height / 2;

          const ratio = newScale / oldScale;

          replayPanX =
            localX - (localX - replayPanX) * ratio;

          replayPanY =
            localY - (localY - replayPanY) * ratio;
        }
      }

      replayZoomScale = newScale;

      if (replayZoomScale <= 1) {
        replayPanX = 0;
        replayPanY = 0;
      }

      applyReplayTransform();
    }

    function resetReplayZoom() {
      replayZoomScale = 1;
      replayPanX = 0;
      replayPanY = 0;

      replayDragging = false;
      replayPointers.clear();
      replayPinchStartDistance = 0;

      applyReplayTransform();
    }

    function getPointerDistance() {
      const values = [...replayPointers.values()];

      if (values.length < 2) {
        return 0;
      }

      return Math.hypot(
        values[0].x - values[1].x,
        values[0].y - values[1].y
      );
    }

    function getPointerMidpoint() {
      const values = [...replayPointers.values()];

      if (values.length < 2) {
        return null;
      }

      return {
        x: (values[0].x + values[1].x) / 2,
        y: (values[0].y + values[1].y) / 2
      };
    }

    function formatReplayClock(value) {
      const seconds = Math.max(
        0,
        Math.floor(Number(value || 0))
      );

      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
    }

    function ensureReplayHighlightNavigation() {
      if (
        replayHighlightPrevious ||
        replayHighlightNext
      ) {
        return;
      }

      const header = replayStudio?.querySelector(
        ".replay-studio__header"
      );

      if (!header) return;

      const navigation =
        document.createElement("div");

      navigation.className =
        "replay-highlight-navigation";

      replayHighlightPrevious =
        document.createElement("button");

      replayHighlightPrevious.type = "button";
      replayHighlightPrevious.className =
        "replay-highlight-nav-button";
      replayHighlightPrevious.innerHTML =
        "<span>‹</span><span>Previous</span>";

      replayHighlightPosition =
        document.createElement("span");

      replayHighlightPosition.className =
        "replay-highlight-position";
      replayHighlightPosition.textContent = "— / 0";

      replayHighlightNext =
        document.createElement("button");

      replayHighlightNext.type = "button";
      replayHighlightNext.className =
        "replay-highlight-nav-button";
      replayHighlightNext.innerHTML =
        "<span>Next</span><span>›</span>";

      replayHighlightPrevious.addEventListener(
        "click",
        () => {
          const nextIndex =
            currentHighlightIndex - 1;

          if (visibleHighlights[nextIndex]) {
            openHighlightEvent(
              visibleHighlights[nextIndex],
              nextIndex
            );
          }
        }
      );

      replayHighlightNext.addEventListener(
        "click",
        () => {
          const nextIndex =
            currentHighlightIndex + 1;

          if (visibleHighlights[nextIndex]) {
            openHighlightEvent(
              visibleHighlights[nextIndex],
              nextIndex
            );
          }
        }
      );

      navigation.append(
        replayHighlightPrevious,
        replayHighlightPosition,
        replayHighlightNext
      );

      header.insertAdjacentElement(
        "afterend",
        navigation
      );

      updateHighlightNavigation();
    }

    ensureReplayHighlightNavigation();

    function setReplayStudioVisible(visible) {
      if (replayStudio) {
        replayStudio.style.display = visible ? "grid" : "none";
      }

      cameraButtons?.classList.toggle(
        "camera-buttons--replay-active",
        visible
      );
    }

    function setReplayStudioMetadata({
      title = "Event Replay",
      subtitle = "Professional instant replay",
      filename = "voxcourt-replay.mp4",
      sourceUrl = ""
    } = {}) {
      currentReplayTitle = String(title || "Event Replay");
      currentReplayFilename = String(
        filename || "voxcourt-replay.mp4"
      );
      currentReplaySourceUrl = String(sourceUrl || "");

      if (replayStudioTitle) {
        replayStudioTitle.textContent = currentReplayTitle;
      }

      if (replayStudioSubtitle) {
        replayStudioSubtitle.textContent = String(
          subtitle || "Professional instant replay"
        );
      }
    }

    function updateReplayPlayPauseButton() {
      if (!replayVideoEl) return;

      const playing =
        !replayVideoEl.paused &&
        !replayVideoEl.ended;

      if (replayPlayPauseIcon) {
        replayPlayPauseIcon.textContent = playing ? "❚❚" : "▶";
      }

      if (replayPlayPauseText) {
        replayPlayPauseText.textContent = playing
          ? "Pause"
          : "Play";
      }

      replayPlayPause?.setAttribute(
        "aria-label",
        playing ? "Pause replay" : "Play replay"
      );
    }

    function updateReplayProgress() {
      if (!replayVideoEl) return;

      const current = Number(
        replayVideoEl.currentTime || 0
      );

      const duration = Number(
        replayVideoEl.duration || 0
      );

      if (replayCurrentTime) {
        replayCurrentTime.textContent =
          formatReplayClock(current);
      }

      if (replayDuration) {
        replayDuration.textContent =
          formatReplayClock(duration);
      }

      if (
        replayProgress &&
        Number.isFinite(duration) &&
        duration > 0
      ) {
        replayProgress.value = String(
          Math.round((current / duration) * 1000)
        );
      }
    }

    function resetReplayStudioControls() {
      if (replayProgress) {
        replayProgress.value = "0";
      }

      if (replayCurrentTime) {
        replayCurrentTime.textContent = "0:00";
      }

      if (replayDuration) {
        replayDuration.textContent = "0:00";
      }

      if (replayVideoEl) {
        replayVideoEl.playbackRate = 1;
      }

      replaySpeedButtons
        ?.querySelectorAll("[data-replay-speed]")
        .forEach((button) => {
          button.classList.toggle(
            "replay-speed-button--active",
            button.dataset.replaySpeed === "1"
          );
        });

      updateReplayPlayPauseButton();
    }

    function activateReplayStudio({
      blob,
      title,
      subtitle,
      filename,
      sourceUrl
    }) {
      currentReplayBlob = blob || null;

      setReplayStudioMetadata({
        title,
        subtitle,
        filename,
        sourceUrl
      });

      setReplayStudioVisible(true);
      resetReplayStudioControls();
      resetReplayZoom();
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
      setReplayStudioVisible(false);

      currentReplayBlob = null;
      currentReplaySourceUrl = "";
      currentReplayFilename = "voxcourt-replay.mp4";
      currentReplayTitle = "Event Replay";

      resetReplayStudioControls();
      resetReplayZoom();

      btnBackLive.style.display = "none";
      btnReplay30.disabled = false;
      replayStatus.textContent = "Replay ready";

      videoEl.style.display = "block";
      videoEl.play?.().catch(() => {});
      setVideoMode("live");

      currentHighlightIndex = -1;
      updateHighlightNavigation();

      const liveUrl = new URL(window.location.href);
      liveUrl.searchParams.delete("replay");

      window.history.replaceState(
        {},
        "",
        liveUrl
      );
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

        activateReplayStudio({
          blob,
          title: `Replay ${seconds}s`,
          subtitle: `Camera ${String(cam).replace("cam", "")}`,
          filename: `voxcourt-replay-${seconds}s.mp4`,
          sourceUrl: replayUrl
        });

        setReplayLoading(false);
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

    replayStudioBackLive?.addEventListener("click", () => {
      backToLive();
    });

    replayPlayPause?.addEventListener("click", () => {
      if (!replayVideoEl?.src) return;

      if (replayVideoEl.paused || replayVideoEl.ended) {
        replayVideoEl.play().catch(() => {});
      } else {
        replayVideoEl.pause();
      }
    });

    replaySeekBack?.addEventListener("click", () => {
      if (!replayVideoEl?.src) return;

      replayVideoEl.currentTime = Math.max(
        0,
        Number(replayVideoEl.currentTime || 0) - 10
      );
    });

    replaySeekForward?.addEventListener("click", () => {
      if (!replayVideoEl?.src) return;

      const duration = Number(
        replayVideoEl.duration || 0
      );

      replayVideoEl.currentTime = Math.min(
        Number.isFinite(duration) && duration > 0
          ? duration
          : Number(replayVideoEl.currentTime || 0) + 10,
        Number(replayVideoEl.currentTime || 0) + 10
      );
    });

    replayProgress?.addEventListener("input", () => {
      const duration = Number(
        replayVideoEl?.duration || 0
      );

      if (
        !replayVideoEl ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return;
      }

      replayVideoEl.currentTime =
        (Number(replayProgress.value || 0) / 1000) *
        duration;
    });

    replaySpeedButtons?.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-replay-speed]"
      );

      if (!button || !replayVideoEl) return;

      const speed = Number(
        button.dataset.replaySpeed || 1
      );

      replayVideoEl.playbackRate =
        Number.isFinite(speed) && speed > 0
          ? speed
          : 1;

      replaySpeedButtons
        .querySelectorAll("[data-replay-speed]")
        .forEach((item) => {
          item.classList.toggle(
            "replay-speed-button--active",
            item === button
          );
        });

      replayStatus.textContent =
        `${currentReplayTitle} • ${replayVideoEl.playbackRate}× speed`;
    });

    replayFullscreen?.addEventListener("click", async () => {
      const replayStage = replayVideoEl?.closest(
        ".cam--viewer"
      );

      try {
        if (!document.fullscreenElement) {
          await replayStage?.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      } catch (_) {
        replayStatus.textContent =
          "Fullscreen is unavailable in this browser.";
      }
    });

    replayDownload?.addEventListener("click", () => {
      if (!replayObjectUrl || !currentReplayBlob) {
        replayStatus.textContent =
          "Replay file is not ready yet.";
        return;
      }

      const link = document.createElement("a");
      link.href = replayObjectUrl;
      link.download = currentReplayFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      replayStatus.textContent =
        "Replay download started.";
    });

    replayShare?.addEventListener("click", async () => {
      const replayUrl = getReplayShareUrl();

      if (!replayUrl) {
        replayStatus.textContent =
          "Replay link is not available.";
        return;
      }

      try {
        const result = await shareOrCopy({
          title: currentReplayTitle || "VoxCourt Replay",
          text: "Watch this VoxCourt instant replay.",
          url: replayUrl
        });

        if (result === "copied") {
          replayStatus.textContent =
            "Replay link copied.";
        } else if (result === "shared-url") {
          replayStatus.textContent =
            "Replay shared successfully.";
        } else if (result === "cancelled") {
          replayStatus.textContent =
            "Replay sharing cancelled.";
        }
      } catch (error) {
        try {
          await copyTextSafely(replayUrl);
          replayStatus.textContent =
            "Replay link copied.";
        } catch (_) {
          replayStatus.textContent =
            "Unable to share or copy the replay link.";
        }
      }
    });

    replayZoomIn?.addEventListener("click", () => {
      setReplayZoom(replayZoomScale + 0.5);
    });

    replayZoomOut?.addEventListener("click", () => {
      setReplayZoom(replayZoomScale - 0.5);
    });

    replayZoomReset?.addEventListener("click", () => {
      resetReplayZoom();
    });

    replayVideoEl?.addEventListener(
      "wheel",
      (event) => {
        if (replayVideoEl.style.display === "none") {
          return;
        }

        event.preventDefault();

        const step = event.deltaY < 0 ? 0.25 : -0.25;

        setReplayZoom(
          replayZoomScale + step,
          event.clientX,
          event.clientY
        );
      },
      { passive: false }
    );

    replayVideoEl?.addEventListener("dblclick", (event) => {
      event.preventDefault();

      if (replayZoomScale > 1) {
        resetReplayZoom();
      } else {
        setReplayZoom(
          2,
          event.clientX,
          event.clientY
        );
      }
    });

    replayVideoEl?.addEventListener("pointerdown", (event) => {
      if (replayVideoEl.style.display === "none") {
        return;
      }

      replayPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      try {
        replayVideoEl.setPointerCapture(event.pointerId);
      } catch (_) {}

      if (replayPointers.size === 2) {
        replayPinchStartDistance = getPointerDistance();
        replayPinchStartScale = replayZoomScale;
        replayDragging = false;
        return;
      }

      if (replayZoomScale > 1) {
        replayDragging = true;
        replayDragStartX = event.clientX;
        replayDragStartY = event.clientY;
        replayDragOriginX = replayPanX;
        replayDragOriginY = replayPanY;

        applyReplayTransform();
      }
    });

    replayVideoEl?.addEventListener("pointermove", (event) => {
      if (!replayPointers.has(event.pointerId)) {
        return;
      }

      replayPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      if (
        replayPointers.size >= 2 &&
        replayPinchStartDistance > 0
      ) {
        event.preventDefault();

        const currentDistance = getPointerDistance();
        const midpoint = getPointerMidpoint();

        if (currentDistance > 0 && midpoint) {
          const ratio =
            currentDistance / replayPinchStartDistance;

          setReplayZoom(
            replayPinchStartScale * ratio,
            midpoint.x,
            midpoint.y
          );
        }

        return;
      }

      if (replayDragging && replayZoomScale > 1) {
        event.preventDefault();

        replayPanX =
          replayDragOriginX +
          event.clientX -
          replayDragStartX;

        replayPanY =
          replayDragOriginY +
          event.clientY -
          replayDragStartY;

        applyReplayTransform();
      }
    });

    const finishReplayPointer = (event) => {
      replayPointers.delete(event.pointerId);

      try {
        replayVideoEl.releasePointerCapture(event.pointerId);
      } catch (_) {}

      if (replayPointers.size < 2) {
        replayPinchStartDistance = 0;
      }

      if (replayPointers.size === 0) {
        replayDragging = false;
        applyReplayTransform();
      }
    };

    replayVideoEl?.addEventListener(
      "pointerup",
      finishReplayPointer
    );

    replayVideoEl?.addEventListener(
      "pointercancel",
      finishReplayPointer
    );

    replayVideoEl?.addEventListener(
      "lostpointercapture",
      finishReplayPointer
    );

    window.addEventListener("resize", () => {
      if (replayZoomScale > 1) {
        applyReplayTransform();
      }
    });

    replayVideoEl?.addEventListener(
      "loadedmetadata",
      updateReplayProgress
    );

    replayVideoEl?.addEventListener(
      "durationchange",
      updateReplayProgress
    );

    replayVideoEl?.addEventListener(
      "timeupdate",
      updateReplayProgress
    );

    replayVideoEl?.addEventListener(
      "play",
      updateReplayPlayPauseButton
    );

    replayVideoEl?.addEventListener(
      "pause",
      updateReplayPlayPauseButton
    );

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
    let currentTimelineFilter = "all";
    let latestTimelineEvents = [];
    const collapsedTimelineGames = new Set();

    let currentHighlightFilter = "featured";
    let availableHighlights = [];
    let visibleHighlights = [];
    let currentHighlightIndex = -1;
    let replayDeepLinkHandled = false;

    let replayHighlightPrevious = null;
    let replayHighlightNext = null;
    let replayHighlightPosition = null;

    function getHighlightEventType(event) {
      return String(
        event?.display?.type ||
        event?.type ||
        "EVENT"
      ).toUpperCase();
    }

    function getHighlightPriority(event) {
      const eventType = getHighlightEventType(event);

      if (eventType === "MATCH") return 100;
      if (eventType === "SET") return 80;
      if (eventType === "GAME") return 60;
      if (eventType === "POINT") return 30;

      return 10;
    }

    function buildReplayPageUrl(eventId) {
      const url = new URL(window.location.href);

      url.searchParams.set(
        "replay",
        String(eventId || "")
      );

      return url.href;
    }

    function getAvailableHighlights(events) {
      return (Array.isArray(events) ? events : [])
        .filter((event) => (
          event?.display?.replayAvailable === true &&
          String(event?.eventId || "")
        ))
        .sort((a, b) => (
          Number(b?.timestamp || 0) -
          Number(a?.timestamp || 0)
        ));
    }

    function getFeaturedHighlights(events) {
      const source = getAvailableHighlights(events);

      /*
       * Αυτόματο featured selection χωρίς νέα δεδομένα tablet:
       * - όλα τα SET
       * - έως 5 GAME
       * - νεότεροι διαθέσιμοι POINT
       * - συνολικά έως 12 highlights
       */
      const ranked = [...source].sort((a, b) => {
        const priorityDifference =
          getHighlightPriority(b) -
          getHighlightPriority(a);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (
          Number(b?.timestamp || 0) -
          Number(a?.timestamp || 0)
        );
      });

      const selected = [];
      let gameCount = 0;

      for (const event of ranked) {
        const eventType = getHighlightEventType(event);

        if (eventType === "GAME") {
          if (gameCount >= 5) continue;
          gameCount += 1;
        }

        selected.push(event);

        if (selected.length >= 12) {
          break;
        }
      }

      return selected.sort((a, b) => (
        Number(b?.timestamp || 0) -
        Number(a?.timestamp || 0)
      ));
    }

    function filterHighlights(events) {
      const source =
        currentHighlightFilter === "featured"
          ? getFeaturedHighlights(events)
          : getAvailableHighlights(events);

      if (
        currentHighlightFilter === "featured" ||
        currentHighlightFilter === "all"
      ) {
        return source;
      }

      return source.filter((event) => (
        getHighlightEventType(event).toLowerCase() ===
        currentHighlightFilter
      ));
    }

    function updateHighlightNavigation() {
      const total = visibleHighlights.length;
      const validIndex =
        currentHighlightIndex >= 0 &&
        currentHighlightIndex < total;

      if (replayHighlightPrevious) {
        replayHighlightPrevious.disabled =
          !validIndex ||
          currentHighlightIndex <= 0;
      }

      if (replayHighlightNext) {
        replayHighlightNext.disabled =
          !validIndex ||
          currentHighlightIndex >= total - 1;
      }

      if (replayHighlightPosition) {
        replayHighlightPosition.textContent =
          validIndex
            ? `${currentHighlightIndex + 1} / ${total}`
            : `— / ${total}`;
      }
    }

    async function openHighlightEvent(
      event,
      requestedIndex = -1
    ) {
      const eventId = String(event?.eventId || "");
      const display = event?.display || {};
      const metadata = event?.metadata || {};

      if (!eventId) return;

      const replayUrl =
        `${apiBase}/api/events/${encodeURIComponent(eventId)}/replay` +
        `?t=${Date.now()}`;

      currentHighlightIndex =
        requestedIndex >= 0
          ? requestedIndex
          : visibleHighlights.findIndex(
              (item) =>
                String(item?.eventId || "") === eventId
            );

      updateHighlightNavigation();

      setReplayLoading(
        true,
        `Preparing ${display.title || "highlight"}…`
      );

      replayStatus.textContent =
        `Preparing ${display.title || "highlight"}…`;

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
          throw new Error(
            "Replay file is empty or unavailable."
          );
        }

        cleanupReplayObjectUrl();
        replayObjectUrl = URL.createObjectURL(blob);

        try {
          replayVideoEl.pause();
        } catch (_) {}

        replayVideoEl.src = replayObjectUrl;
        replayVideoEl.currentTime = 0;
        replayVideoEl.style.display = "block";
        replayVideoEl.classList.add(
          "replay-video--active"
        );

        const eventTime = formatTimelineTime(
          event?.timestamp
        );

        const scoringSide = String(
          display.scoringSide ||
          display.winner ||
          metadata.scoringSide ||
          metadata.winner ||
          ""
        ).toUpperCase();

        const scoringName =
          scoringSide === "A"
            ? String(
                metadata.nameA ||
                nameAEl?.textContent ||
                "Player A"
              )
            : scoringSide === "B"
              ? String(
                  metadata.nameB ||
                  nameBEl?.textContent ||
                  "Player B"
                )
              : "Match highlight";

        activateReplayStudio({
          blob,
          title: display.title || "Match Highlight",
          subtitle:
            `${scoringName} • ${eventTime}`,
          filename: `voxcourt-${eventId}.mp4`,
          sourceUrl: buildReplayPageUrl(eventId)
        });

        setReplayLoading(false);
        setVideoMode("replay");

        videoEl.style.display = "none";
        btnBackLive.style.display = "";
        btnBackLive.textContent = "← Back to Live";

        replayStatus.textContent =
          `${display.title || "Highlight"} • ` +
          `${(blob.size / 1024 / 1024).toFixed(1)} MB`;

        updateHighlightNavigation();

        /*
         * Το URL του browser ενημερώνεται χωρίς refresh,
         * ώστε το Share να αντιγράφει το συγκεκριμένο replay.
         */
        const pageUrl = new URL(window.location.href);
        pageUrl.searchParams.set("replay", eventId);

        window.history.replaceState(
          {},
          "",
          pageUrl
        );

        await replayVideoEl.play();
      } catch (error) {
        setReplayLoading(false);

        replayStatus.textContent =
          `Replay error: ${error.message}`;
      }
    }

    function renderHighlights(events) {
      if (
        !highlightsGrid ||
        !highlightsStatus
      ) {
        return;
      }

      availableHighlights =
        getAvailableHighlights(events);

      visibleHighlights =
        filterHighlights(events);

      highlightsGrid.innerHTML = "";

      const counts = {
        featured: getFeaturedHighlights(events).length,
        all: availableHighlights.length,
        point: availableHighlights.filter(
          (event) =>
            getHighlightEventType(event) === "POINT"
        ).length,
        game: availableHighlights.filter(
          (event) =>
            getHighlightEventType(event) === "GAME"
        ).length,
        set: availableHighlights.filter(
          (event) =>
            getHighlightEventType(event) === "SET"
        ).length
      };

      highlightsFilters
        ?.querySelectorAll("[data-highlight-filter]")
        .forEach((button) => {
          const filter = String(
            button.dataset.highlightFilter || "all"
          );

          const labels = {
            featured: "★ Featured",
            all: "All",
            point: "🎾 Points",
            game: "🏆 Games",
            set: "👑 Sets"
          };

          button.textContent =
            `${labels[filter] || filter} ` +
            `${counts[filter] || 0}`;
        });

      if (highlightsPlayFeatured) {
        highlightsPlayFeatured.disabled =
          getFeaturedHighlights(events).length === 0;
      }

      if (visibleHighlights.length === 0) {
        highlightsStatus.textContent =
          availableHighlights.length === 0
            ? "No saved highlights are available yet."
            : "No highlights match this filter.";

        highlightsGrid.innerHTML = `
          <div class="highlights-empty">
            <span class="highlights-empty__icon">🎬</span>
            <strong>No highlights available</strong>
            <span>
              Saved point, game and set replays will appear here.
            </span>
          </div>
        `;

        updateHighlightNavigation();
        return;
      }

      highlightsStatus.textContent =
        `${visibleHighlights.length} highlight` +
        `${visibleHighlights.length === 1 ? "" : "s"} available`;

      visibleHighlights.forEach((event, index) => {
        const display = event?.display || {};
        const metadata = event?.metadata || {};
        const eventType = getHighlightEventType(event);

        const scoringSide = String(
          display.scoringSide ||
          display.winner ||
          metadata.scoringSide ||
          metadata.winner ||
          ""
        ).toUpperCase();

        const scoringName =
          scoringSide === "A"
            ? String(
                metadata.nameA ||
                nameAEl?.textContent ||
                "Player A"
              )
            : scoringSide === "B"
              ? String(
                  metadata.nameB ||
                  nameBEl?.textContent ||
                  "Player B"
                )
              : "";

        const card = document.createElement("article");
        card.className =
          `highlight-card highlight-card--${eventType.toLowerCase()}`;

        card.dataset.eventId =
          String(event?.eventId || "");

        const icon =
          eventType === "SET"
            ? "👑"
            : eventType === "GAME"
              ? "🏆"
              : eventType === "POINT"
                ? "🎾"
                : "🎬";

        card.innerHTML = `
          <button
            type="button"
            class="highlight-card__play"
            aria-label="Play ${display.title || "highlight"}"
          >
            <span class="highlight-card__visual">
              <span class="highlight-card__icon">${icon}</span>
              <span class="highlight-card__play-icon">▶</span>
            </span>

            <span class="highlight-card__body">
              <span class="highlight-card__type">
                ${eventType}
              </span>

              <strong class="highlight-card__title">
                ${display.title || "Match Highlight"}
              </strong>

              <span class="highlight-card__player">
                ${scoringName || "Match event"}
              </span>

              <span class="highlight-card__scores">
                <span>${display.score || "—"}</span>
                <span>Games ${display.games || "—"}</span>
                <span>Sets ${display.sets || "—"}</span>
              </span>
            </span>

            <span class="highlight-card__time">
              ${formatTimelineTime(event?.timestamp)}
            </span>
          </button>
        `;

        card
          .querySelector(".highlight-card__play")
          ?.addEventListener("click", () => {
            openHighlightEvent(event, index);
          });

        highlightsGrid.appendChild(card);
      });

      updateHighlightNavigation();
    }

    function getTimelineEventType(event) {
      const display = event?.display || {};

      return String(
        display.type || event?.type || ""
      ).toUpperCase();
    }

    function updateTimelineFilterCounts(events) {
      if (!timelineFilters) return;

      const list = Array.isArray(events) ? events : [];

      const counts = {
        all: list.length,
        points: 0,
        games: 0,
        replays: 0
      };

      for (const event of list) {
        const eventType = getTimelineEventType(event);
        const display = event?.display || {};

        if (eventType === "POINT") {
          counts.points += 1;
        }

        if (
          eventType === "GAME" ||
          eventType === "SET" ||
          eventType === "MATCH"
        ) {
          counts.games += 1;
        }

        if (display.replayAvailable === true) {
          counts.replays += 1;
        }
      }

      const labels = {
        all: "All",
        points: "🎾 Points",
        games: "🏆 Games & Sets",
        replays: "▶ Replays"
      };

      timelineFilters
        .querySelectorAll("[data-timeline-filter]")
        .forEach((button) => {
          const filter = String(
            button.dataset.timelineFilter || "all"
          );

          button.textContent =
            `${labels[filter] || filter} ${counts[filter] || 0}`;
        });
    }

    function eventMatchesTimelineFilter(event) {
      const display = event?.display || {};
      const eventType = String(
        display.type || event?.type || ""
      ).toUpperCase();

      if (currentTimelineFilter === "points") {
        return eventType === "POINT";
      }

      if (currentTimelineFilter === "games") {
        return (
          eventType === "GAME" ||
          eventType === "SET" ||
          eventType === "MATCH"
        );
      }

      if (currentTimelineFilter === "replays") {
        return display.replayAvailable === true;
      }

      return true;
    }

    function renderTimelineEvents(events) {
      if (!timelineList || !timelineStatus) return;

      latestTimelineEvents = Array.isArray(events)
        ? events
        : [];

      updateTimelineFilterCounts(latestTimelineEvents);
      renderHighlights(latestTimelineEvents);

      const list = latestTimelineEvents.filter(
        eventMatchesTimelineFilter
      );

      const signature = [
        currentTimelineFilter,
        ...list.map((event) => {
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
      ].join("|");

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
        timelineStatus.textContent =
          currentTimelineFilter === "all"
            ? "No match events yet."
            : "No events match this filter.";
        return;
      }

      const availableReplayCount = list.filter(
        (event) => event?.display?.replayAvailable === true
      ).length;

      timelineStatus.textContent =
        `${list.length} visible event${list.length === 1 ? "" : "s"}` +
        ` • ${availableReplayCount} replay${availableReplayCount === 1 ? "" : "s"} available`;

      let activeGameBody = null;
      let activeGameId = "";

      for (const event of [...list].reverse()) {

        const display = event?.display || {};
        const metadata = event?.metadata || {};
        const eventId = String(event?.eventId || "");
        const eventType = String(display.type || event?.type || "EVENT").toUpperCase();
        const winnerSide = String(
          display.scoringSide ||
          display.winner ||
          metadata.scoringSide ||
          metadata.winner ||
          ""
        ).toUpperCase();

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

            activateReplayStudio({
              blob,
              title: display.title || "Event Replay",
              subtitle:
                `${winnerName || "Match event"} • ${eventTime}`,
              filename: `voxcourt-${eventId}.mp4`,
              sourceUrl: replayUrl
            });

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

        if (eventType === "GAME") {
          const gameId = eventId || `game-${event?.timestamp || Date.now()}`;
          const group = document.createElement("section");
          group.className = "timeline-game-group";
          group.dataset.gameId = gameId;

          const gameHeader = document.createElement("div");
          gameHeader.className = "timeline-game-header";

          const toggleButton = document.createElement("button");
          toggleButton.type = "button";
          toggleButton.className = "timeline-game-toggle";
          toggleButton.setAttribute(
            "aria-label",
            "Show or hide the points of this game"
          );

          const gameBody = document.createElement("div");
          gameBody.className = "timeline-game-body";

          const collapsed = collapsedTimelineGames.has(gameId);

          group.classList.toggle(
            "timeline-game-group--collapsed",
            collapsed
          );

          toggleButton.textContent = collapsed ? "＋" : "−";
          toggleButton.setAttribute(
            "aria-expanded",
            collapsed ? "false" : "true"
          );

          toggleButton.addEventListener("click", () => {
            const willCollapse = !group.classList.contains(
              "timeline-game-group--collapsed"
            );

            group.classList.toggle(
              "timeline-game-group--collapsed",
              willCollapse
            );

            toggleButton.textContent = willCollapse ? "＋" : "−";
            toggleButton.setAttribute(
              "aria-expanded",
              willCollapse ? "false" : "true"
            );

            if (willCollapse) {
              collapsedTimelineGames.add(gameId);
            } else {
              collapsedTimelineGames.delete(gameId);
            }
          });

          gameHeader.appendChild(card);
          gameHeader.appendChild(toggleButton);

          group.appendChild(gameHeader);
          group.appendChild(gameBody);
          timelineList.appendChild(group);

          activeGameBody = gameBody;
          activeGameId = gameId;
        } else if (
          eventType === "POINT" &&
          activeGameBody &&
          activeGameId
        ) {
          card.classList.add("timeline-event--grouped-point");
          activeGameBody.appendChild(card);
        } else {
          activeGameBody = null;
          activeGameId = "";
          timelineList.appendChild(card);
        }
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
          hideTimelineNewEventButton();
        } else {
          timelineList.scrollTop = previousScrollTop;

          if (hasNewEvent && previousScrollTop >= 40) {
            showTimelineNewEventButton();
          }
        }
      });
    }

    highlightsFilters?.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(
          "[data-highlight-filter]"
        );

        if (!button) return;

        currentHighlightFilter = String(
          button.dataset.highlightFilter || "featured"
        );

        highlightsFilters
          .querySelectorAll("[data-highlight-filter]")
          .forEach((item) => {
            item.classList.toggle(
              "highlights-filter--active",
              item === button
            );
          });

        currentHighlightIndex = -1;
        renderHighlights(latestTimelineEvents);
      }
    );

    highlightsPlayFeatured?.addEventListener(
      "click",
      () => {
        currentHighlightFilter = "featured";

        highlightsFilters
          ?.querySelectorAll("[data-highlight-filter]")
          .forEach((item) => {
            item.classList.toggle(
              "highlights-filter--active",
              item.dataset.highlightFilter === "featured"
            );
          });

        renderHighlights(latestTimelineEvents);

        if (visibleHighlights[0]) {
          openHighlightEvent(
            visibleHighlights[0],
            0
          );
        }
      }
    );

    timelineFilters?.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-timeline-filter]"
      );

      if (!button) return;

      const nextFilter = String(
        button.dataset.timelineFilter || "all"
      );

      if (nextFilter === currentTimelineFilter) return;

      currentTimelineFilter = nextFilter;
      lastTimelineSignature = "";

      timelineFilters
        .querySelectorAll("[data-timeline-filter]")
        .forEach((item) => {
          item.classList.toggle(
            "timeline-filter--active",
            item === button
          );
        });

      renderTimelineEvents(latestTimelineEvents);
      timelineList.scrollTop = 0;
    });

    timelineExpandAll?.addEventListener("click", () => {
      collapsedTimelineGames.clear();
      lastTimelineSignature = "";
      renderTimelineEvents(latestTimelineEvents);
    });

    timelineCollapseAll?.addEventListener("click", () => {
      collapsedTimelineGames.clear();

      for (const event of latestTimelineEvents) {
        if (getTimelineEventType(event) !== "GAME") {
          continue;
        }

        const eventId = String(event?.eventId || "");
        const gameId =
          eventId || `game-${event?.timestamp || "unknown"}`;

        collapsedTimelineGames.add(gameId);
      }

      lastTimelineSignature = "";
      renderTimelineEvents(latestTimelineEvents);
    });

    timelineJumpLatest?.addEventListener("click", () => {
      timelineList?.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      hideTimelineNewEventButton();
    });

    function hideTimelineNewEventButton() {
      if (timelineNewEventButton) {
        timelineNewEventButton.style.display = "none";
      }
    }

    function showTimelineNewEventButton() {
      if (timelineNewEventButton) {
        timelineNewEventButton.style.display = "inline-flex";
      }
    }

    timelineNewEventButton?.addEventListener("click", () => {
      timelineList?.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      hideTimelineNewEventButton();
    });

    timelineList?.addEventListener(
      "scroll",
      () => {
        if (timelineList.scrollTop < 40) {
          hideTimelineNewEventButton();
        }
      },
      { passive: true }
    );

    async function refreshTimeline() {
      if (!timelineList || !timelineStatus) return;

      try {
        const latestMatchUrl =
          `${apiBase}/api/matches/latest/${country}/${city}/${clubId}/${courtId}`;

        const latestPayload = await fetchJson(latestMatchUrl);
        const latestMatch = latestPayload?.match || null;

        latestMatchLifecycle = latestMatch;

        renderMatchEndSummary(
          latestMatchLifecycle,
          latestMatchState
        );

        const activeMatch =
          String(latestMatch?.status || "").toUpperCase() === "LIVE"
            ? latestMatch
            : null;

        const matchId = String(
          latestMatch?.matchId || ""
        );

        if (activeMatch) {
          const activeStatus = String(
            activeMatch.status || "LIVE"
          ).toUpperCase();

          setMatchStatus(
            activeStatus === "ENDED"
              ? "ENDED"
              : "LIVE"
          );

          if (matchStartedAt) {
            matchStartedAt.textContent = formatMatchStart(
              activeMatch.startedAt
            );
          }

          if (activeMatch.nameA && heroNameA) {
            heroNameA.textContent = String(activeMatch.nameA);
          }

          if (activeMatch.nameB && heroNameB) {
            heroNameB.textContent = String(activeMatch.nameB);
          }
        } else {
          /*
           * Δεν αλλάζουμε εδώ το LIVE σε READY.
           * Το tickState() είναι αυτό που γνωρίζει αν υπάρχει
           * πραγματικό ενεργό score στο court.
           */
          const currentStatus = String(
            matchStatusText?.textContent || ""
          ).toUpperCase();

          if (
            currentStatus !== "LIVE" &&
            currentStatus !== "ENDED"
          ) {
            setMatchStatus("READY");
          }

          if (matchStartedAt) {
            matchStartedAt.textContent = "—";
          }
        }

        const eventsUrl =
          `${apiBase}/api/events/${country}/${city}/${clubId}/${courtId}` +
          `?limit=100` +
          (matchId ? `&matchId=${encodeURIComponent(matchId)}` : "");

        const payload = await fetchJson(eventsUrl);
        renderTimelineEvents(payload?.events);

        if (!replayDeepLinkHandled) {
          const replayEventId = new URL(
            window.location.href
          ).searchParams.get("replay");

          if (replayEventId) {
            const deepLinkedIndex =
              availableHighlights.findIndex(
                (event) =>
                  String(event?.eventId || "") ===
                  replayEventId
              );

            if (deepLinkedIndex >= 0) {
              replayDeepLinkHandled = true;

              currentHighlightFilter = "all";
              visibleHighlights =
                getAvailableHighlights(
                  latestTimelineEvents
                );

              const visibleIndex =
                visibleHighlights.findIndex(
                  (event) =>
                    String(event?.eventId || "") ===
                    replayEventId
                );

              openHighlightEvent(
                visibleHighlights[visibleIndex],
                visibleIndex
              );
            }
          } else {
            replayDeepLinkHandled = true;
          }
        }
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
        latestMatchState = s;

        renderMatchEndSummary(
          latestMatchLifecycle,
          latestMatchState
        );

        const stateUpdatedAt = Number(s.updatedAt || 0);

        const statePointA = String(
          s.pointA ??
          s.playerA?.points ??
          s.playerA?.point ??
          s.playerA?.score ??
          "0"
        ).toUpperCase();

        const statePointB = String(
          s.pointB ??
          s.playerB?.points ??
          s.playerB?.point ??
          s.playerB?.score ??
          "0"
        ).toUpperCase();

        const stateGamesA = Number(
          s.gamesA ?? s.playerA?.games ?? 0
        );

        const stateGamesB = Number(
          s.gamesB ?? s.playerB?.games ?? 0
        );

        const stateSetsA = Number(
          s.setsA ?? s.playerA?.sets ?? 0
        );

        const stateSetsB = Number(
          s.setsB ?? s.playerB?.sets ?? 0
        );

        const hasMeaningfulCourtState =
          stateUpdatedAt > 0 ||
          statePointA !== "0" ||
          statePointB !== "0" ||
          stateGamesA > 0 ||
          stateGamesB > 0 ||
          stateSetsA > 0 ||
          stateSetsB > 0;

        const currentStatus = String(
          matchStatusText?.textContent || ""
        ).toUpperCase();

        if (
          hasMeaningfulCourtState &&
          currentStatus !== "ENDED"
        ) {
          setMatchStatus("LIVE");
        } else if (
          !hasMeaningfulCourtState &&
          currentStatus !== "ENDED"
        ) {
          setMatchStatus("READY");
        }

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

        updateHeroScore({
          nameA,
          nameB,
          pointA,
          pointB,
          gamesA,
          gamesB,
          setsA,
          setsB,
          server
        });

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
