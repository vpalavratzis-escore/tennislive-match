export function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="wrap">
      <div class="nav">
        <div class="brand"><div class="logo"></div><div>e-Scoreboards</div></div>
        <div class="navlinks">
          <a href="/" data-nav>Home</a>
          <a href="/live" data-nav>Find courts</a>
          <a href="#contact">Contact</a>
        </div>
        <a class="cta" href="/live" data-nav>Find a court</a>
      </div>

      <div class="hero">
        <div class="panel hero-left">
          <div class="kicker"><span class="dot"></span> Live courts • Smart scoring • Pro experience</div>
          <h1>Make every match look professional — on court and online.</h1>
          <p class="sub">
            LED scoreboards + camera streaming + real-time match data from your tablet.
            Built for tennis & padel clubs and tournaments.
          </p>

          <div class="actions">
          <a class="btn primary" href="/live" data-nav>Find courts</a>
          <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>
            Open demo court
          </a>
        </div>
        

          <div class="bullets">
            <div><span class="tick">✓</span> Real-time names, score, sets, match clock</div>
            <div><span class="tick">✓</span> Works with IP cameras (RTSP) + low latency</div>
            <div><span class="tick">✓</span> Multi-court ready, scalable for clubs</div>
            <div><span class="tick">✓</span> Built for reliability: offline-friendly</div>
          </div>
        </div>

        <div class="panel hero-right">
          <div class="mock-top">
            <div style="font-weight:900">Live match preview</div>
            <div class="pill">API ✓ • Stream ✓ • LED ✓</div>
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
                    <div class="mini"><span>G <b>2</b></span><span>S <b>0</b></span></div>
                  </div>
                </div>

                <div class="card">
                  <div class="label">Player B</div>
                  <div class="value">Player B</div>
                  <div class="score">
                    <div class="big">30</div>
                    <div class="mini"><span>G <b>3</b></span><span>S <b>0</b></span></div>
                  </div>
                </div>
              </div>

              <div style="padding:0 12px 12px"><div class="cam"></div></div>
            </div>
          </div>
        </div>
      </div>

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
