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
          <a href="https://escoreboards.eu/matches/">Match Results</a>
          <a href="#contact">Contact</a>
        </div>

        <a class="cta" href="/live" data-nav>Open a court</a>
      </div>

              <!-- ===== HERO ===== -->
      <section class="hero hero-cinematic">
        <div class="hero-bg"></div>
        <div class="hero-overlay"></div>

        <div class="hero-shell">
          <div class="hero-copy">
            <div class="hero-kicker">
              <span class="dot"></span>
              Live score • Court stream • LED sync
            </div>

            <h1 class="hero-title">
              Smart Scoring & Live Streaming
              for Racquet Courts.
            </h1>

            <p class="hero-text">
              One connected system for live score, court streaming and
              LED scoreboard sync across Tennis, Padel and Pickleball.
            </p>

            <div class="hero-actions">
              <a class="btn primary" href="/live" data-nav>Find Courts</a>
              <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>Watch Demo</a>
            </div>

            <div class="sport-chips">
              <span class="sport-chip">🟢 Tennis</span>
              <span class="sport-chip">🟢 Padel</span>
              <span class="sport-chip">🟡 Pickleball</span>
            </div>
          </div>

          <div class="hero-feature-card">
            <div class="feature-head">
              <div class="feature-led"></div>
              <div>Live Score</div>
            </div>

            <div class="feature-scorebox">
              <div class="feature-side">
                <div class="feature-label">Player A</div>
                <div class="feature-score">15</div>
              </div>

              <div class="feature-center">
                <div>G <b>2</b></div>
                <div>S <b>0</b></div>
              </div>

              <div class="feature-side right">
                <div class="feature-label">Player B</div>
                <div class="feature-score">30</div>
              </div>
            </div>

            <div class="feature-row">
              <span>📹 Court Stream</span>
              <span>→</span>
            </div>

            <div class="feature-row">
              <span>🟩 LED Sync</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </section>

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
