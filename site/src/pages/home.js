export function renderHome() {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";

  app.innerHTML = `
    <div class="wrap vc-home-prod">

      <header class="vc-home-nav">

        <a
          href="${base}"
          data-nav
          class="vc-home-brand"
          aria-label="VoxCourt home"
        >
          <img
            src="${base}logoText.png"
            alt="VoxCourt"
          />
        </a>

        <nav class="vc-home-links">
          <a class="active" href="${base}" data-nav>Home</a>
          <a href="${base}live" data-nav>Find courts</a>
          <a href="https://voxcourt.com/matches/">Match Results</a>
          <a href="https://voxcourt.com/members/manage.html">Members</a>
        </nav>

        <a
          href="${base}live"
          data-nav
          class="vc-home-open"
        >
          Open a court
          <span>›</span>
        </a>

      </header>


      <main class="vc-home-content">

        <section class="vc-home-hero">

          <!-- REAL HERO PHOTO -->
          <div class="vc-home-hero__art">
            <img
              src="${base}hero/voxcourt-multisport.png"
              alt=""
              aria-hidden="true"
            />
          </div>


          <div class="vc-home-hero__copy">

            <div class="vc-home-kicker">
              SMART SCORING · LIVE STREAMING · INSTANT REPLAY
            </div>

            <h1>
              The connected
              <span>scoring system</span>
              for modern
              racquet sports.
            </h1>

            <p>
              Live scoring, video, instant replay and connected
              court technology for tennis, padel and pickleball.
            </p>

            <div class="vc-home-actions">

              <a
                class="vc-home-primary"
                href="${base}live"
                data-nav
              >
                Find a court
                <span>›</span>
              </a>

              <a
                class="vc-home-secondary"
                href="${base}?p=/gr/attica/chalkida-sports-center/court-1"
                data-nav
              >
                <span class="vc-home-play">▶</span>
                Watch live demo
              </a>

            </div>


            <div class="vc-home-mini">

              <span>
                <i></i>
                Real-time scoring
              </span>

              <span>
                <i></i>
                Live streaming
              </span>

              <span>
                <i></i>
                Instant replay
              </span>

              <span>
                <i></i>
                Multi-sport
              </span>

            </div>

          </div>


          <div class="vc-home-sport-labels">
            <span>TENNIS</span>
            <span>PADEL</span>
            <span>PICKLEBALL</span>
          </div>

        </section>


        <section class="vc-home-features">

          <article>
            <div class="vc-home-feature-icon">
              <svg viewBox="0 0 24 24">
                <path d="M5 19V11M10 19V7M15 19V4M20 19v-9"/>
              </svg>
            </div>

            <h2>Live Score</h2>

            <p>
              Points, games and sets update instantly across every screen.
            </p>
          </article>


          <article>
            <div class="vc-home-feature-icon">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="6" width="13" height="12" rx="2"/>
                <path d="m16 10 5-3v10l-5-3z"/>
              </svg>
            </div>

            <h2>Live Streaming</h2>

            <p>
              Watch the court remotely from mobile, tablet or desktop.
            </p>
          </article>


          <article>
            <div class="vc-home-feature-icon">
              <svg viewBox="0 0 24 24">
                <path d="M4 12a8 8 0 1 0 3-6"/>
                <path d="M4 4v6h6"/>
                <path d="m10 9 6 3-6 3z"/>
              </svg>
            </div>

            <h2>Instant Replay</h2>

            <p>
              Save, review and share the moments that matter.
            </p>
          </article>


          <article>
            <div class="vc-home-feature-icon">
              <svg viewBox="0 0 24 24">
                <rect x="4" y="5" width="16" height="14" rx="2"/>
                <path d="M8 9h3v3H8zm5 0h3v3h-3zM8 14h3v2H8zm5 0h3v2h-3z"/>
              </svg>
            </div>

            <h2>Connected Courts</h2>

            <p>
              One platform for scoring, video and multiple club courts.
            </p>
          </article>

        </section>


        <section class="vc-home-simple">

          <div>
            <span>BUILT FOR CLUBS</span>

            <h2>
              One experience from the court to every screen.
            </h2>
          </div>

          <div class="vc-home-steps">

            <div>
              <strong>01</strong>
              <span>Choose a court</span>
            </div>

            <div>
              <strong>02</strong>
              <span>Follow live</span>
            </div>

            <div>
              <strong>03</strong>
              <span>Replay moments</span>
            </div>

          </div>

        </section>


        <section class="vc-home-cta">

          <div>
            <span>VOXCOURT LIVE</span>
            <h2>See what is happening on court.</h2>
          </div>

          <a href="${base}live" data-nav>
            Open live courts
            <span>›</span>
          </a>

        </section>

      </main>


      <footer class="vc-home-footer">
        <span>© <span id="y"></span> VoxCourt</span>
        <span>Live courts. Smart scoring.</span>
      </footer>

    </div>
  `;

  const year = app.querySelector("#y");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
}
