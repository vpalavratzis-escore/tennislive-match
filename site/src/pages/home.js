export function renderHome() {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";

  app.innerHTML = `
    <div class="wrap home-page vc-home">
      <header class="nav premium-nav vc-nav">
        <a class="brand brand-image" href="/" data-nav aria-label="VoxCourt home">
          <img src="${base}logoText.png" alt="VoxCourt" class="brand-logo-image" />
        </a>
        <nav class="navlinks" aria-label="Main navigation">
          <a href="/" data-nav>Home</a>
          <a href="/live" data-nav>Find courts</a>
          <a href="#system">System</a>
          <a href="https://voxcourt.com/matches/">Results</a>
        </nav>
        <a class="cta" href="/live" data-nav>Watch live</a>
      </header>

      <main>
        <section class="vc-home-hero">
          <div class="vc-home-copy">
            <div class="eyebrow">LIVE COURTS · SMART SCORING</div>
            <h1>One court.<br><span>One connected experience.</span></h1>
            <p>Live score, video and instant replay — together in one clean platform for racquet clubs.</p>
            <div class="vc-home-actions">
              <a class="btn primary" href="/live" data-nav>Find a court</a>
              <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>Watch demo</a>
            </div>
            <div class="vc-chip-row" aria-label="Core features">
              <span>Live scoring</span><span>Live video</span><span>Replay</span><span>Multi-court</span>
            </div>
          </div>
          <div class="vc-home-visual">
            <img src="${base}hero/home-bg.png" alt="Tennis court with VoxCourt live experience" />
            <div class="vc-home-score-card" aria-hidden="true">
              <small>LIVE · COURT 3</small>
              <div><strong>Player A</strong><b>40</b></div>
              <div><strong>Player B</strong><b>30</b></div>
              <span>Games 4–3 · Sets 1–0</span>
            </div>
          </div>
        </section>

        <section id="system" class="vc-feature-strip">
          <article><span>01</span><h3>Score</h3><p>Fast match control from the court.</p></article>
          <article><span>02</span><h3>Watch</h3><p>Live video with the score beside it.</p></article>
          <article><span>03</span><h3>Replay</h3><p>Instant replay and match highlights.</p></article>
          <article><span>04</span><h3>Connect</h3><p>Tablet, LED and online viewer in sync.</p></article>
        </section>

        <section class="vc-product-section">
          <div>
            <div class="eyebrow">FOR MODERN CLUBS</div>
            <h2>Professional on court.<br>Simple on screen.</h2>
            <p>VoxCourt gives players, spectators and clubs the information they need without clutter.</p>
            <a class="btn primary" href="/live" data-nav>Explore live courts</a>
          </div>
          <div class="vc-product-media">
            <img src="${base}product.png" alt="VoxCourt system" />
          </div>
        </section>

        <section class="vc-mini-grid">
          <article>
            <div class="eyebrow">SPONSORS</div>
            <h3>Premium courtside visibility.</h3>
            <p>Use the scoreboard and digital match experience as sponsor inventory.</p>
          </article>
          <article>
            <div class="eyebrow">CONTROL</div>
            <h3>Touch now. Voice when needed.</h3>
            <p>Keep match control fast and natural without changing the viewer experience.</p>
          </article>
        </section>

        <section id="contact" class="vc-final-cta">
          <div><div class="eyebrow">VOXCOURT</div><h2>Bring live scoring to your courts.</h2></div>
          <div class="vc-home-actions">
            <a class="btn primary" href="/live" data-nav>View live courts</a>
            <a class="btn" href="mailto:info@escoreboards.eu">Contact us</a>
          </div>
        </section>
      </main>

      <footer class="footer premium-footer"><span>© <span id="y"></span> VoxCourt.</span><span>Live courts. Smart scoring.</span></footer>
    </div>
  `;

  const year = app.querySelector("#y");
  if (year) year.textContent = String(new Date().getFullYear());
}
