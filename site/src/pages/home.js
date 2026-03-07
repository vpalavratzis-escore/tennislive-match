export function renderHome() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="wrap">
      <!-- ===== NAV ===== -->
      <div class="nav">
        <div class="brand">
          <div class="logo"></div>
          <div>e-Scoreboards</div>
        </div>

        <div class="navlinks">
          <a href="/" data-nav>Home</a>
          <a href="/live" data-nav>Find courts</a>
          <a href="#how" data-nav>How it works</a>
          <a href="#contact">Contact</a>
        </div>

        <a class="cta" href="/live" data-nav>Open a court</a>
      </div>

      <!-- ===== HERO ===== -->
      <div class="hero">
        <div class="panel hero-left">

          <div class="kicker">
            <span class="dot"></span>
            Live courts • Smart scoring • Streaming • LED integration
          </div>

          <h1>
            Professional live scoring & streaming
            for Tennis, Padel & Pickleball courts.
          </h1>

          <p class="sub">
            Tablet-controlled live scoring, camera streaming and LED scoreboard
            integration — all connected to a clean online viewer.
            Built for clubs, academies and tournaments.
          </p>

          <div class="actions">
            <a class="btn primary" href="/live" data-nav>Find courts</a>
            <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>
              Open demo court
            </a>
          </div>

          <div class="bullets">
            <div><span class="tick">✓</span> Real-time names, points, games & sets</div>
            <div><span class="tick">✓</span> Works with RTSP IP cameras (low latency HLS)</div>
            <div><span class="tick">✓</span> LED scoreboard sync (Raspberry Pi)</div>
            <div><span class="tick">✓</span> Multi-court ready & cloud connected</div>
          </div>
        </div>

        <!-- ===== PREVIEW PANEL ===== -->
        <div class="panel hero-right">
          <div class="mock-top">
            <div style="font-weight:900">Live Court Preview</div>
            <div class="pill">Score ✓ • Stream ✓ • LED ✓</div>
          </div>

          <div class="mock">
            <div class="screen">
              <div class="bar">
                <div class="live"><i></i> LIVE • Court 1</div>
                <div>api.escoreboards.eu</div>
              </div>

              <div class="grid2">
                <div class="card">
                  <div class="label">Player A</div>
                  <div class="value">Player A</div>
                  <div class="score">
                    <div class="big">15</div>
                    <div class="mini">
                      <span>G <b>2</b></span>
                      <span>S <b>0</b></span>
                    </div>
                  </div>
                </div>

                <div class="card">
                  <div class="label">Player B</div>
                  <div class="value">Player B</div>
                  <div class="score">
                    <div class="big">30</div>
                    <div class="mini">
                      <span>G <b>3</b></span>
                      <span>S <b>0</b></span>
                    </div>
                  </div>
                </div>
              </div>

              <div style="padding:0 12px 12px">
                <div class="cam"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== HOW IT WORKS ===== -->
      <div id="how" class="panel section">
        <div class="badge"><i></i> How it works</div>

        <div style="margin-top:16px; display:grid; gap:14px;">
          <div><b>1.</b> Tablet controls score (voice or touch)</div>
          <div><b>2.</b> Raspberry Pi streams camera + LED scoreboard</div>
          <div><b>3.</b> Cloud API syncs live data to your website</div>
        </div>
      </div>

      <!-- ===== CONTACT ===== -->
      <div id="contact" class="panel section">
        <div class="badge"><i></i> Contact</div>
        <div style="margin-top:12px;color:var(--muted);font-weight:700;line-height:1.7">
          Email: <b style="color: var(--text)">info@escoreboards.eu</b>
        </div>
      </div>

      <div class="footer">© <span id="y"></span> e-Scoreboards.</div>
    </div>
  `;

  const y = app.querySelector("#y");
  if (y) y.textContent = String(new Date().getFullYear());
}
