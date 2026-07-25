export function renderHome() {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";

  app.innerHTML = `
    <div class="wrap home-page">

      <!-- ===== PREMIUM NAVBAR ===== -->
      <header class="nav premium-nav">
        <a class="brand brand-image" href="/" data-nav aria-label="VoxCourt home">
          <img
            src="${base}logoText.png"
            alt="VoxCourt"
            class="brand-logo-image"
          />
        </a>

        <nav class="navlinks" aria-label="Main navigation">
          <a href="/" data-nav>Home</a>
          <a href="/live" data-nav>Find courts</a>
          <a href="#system">The system</a>
          <a href="#sponsors">Sponsors</a>
          <a href="#voice-control">AI Voice Control</a>
          <a href="https://voxcourt.com/matches/">Match Results</a>
        </nav>

        <a class="cta" href="/live" data-nav>Open a court</a>
      </header>

      <!-- ===== HERO ===== -->
      <main>
        <section class="premium-hero">
          <div class="premium-hero-copy">
            <div class="hero-kicker">
              <span class="dot"></span>
              Smart scoring • Live streaming • LED integration
            </div>

            <h1 class="premium-hero-title">
              The connected scoring system for modern racquet courts.
            </h1>

            <p class="premium-hero-text">
              Control the score from a tablet or by voice, synchronize a
              professional LED scoreboard and share every match live online.
              Built for tennis, padel and pickleball clubs.
            </p>

            <div class="hero-actions">
              <a class="btn primary" href="/live" data-nav>
                Find a court
              </a>

              <a
                class="btn"
                href="/?p=/gr/attica/kavouri-tennis-club/court-1"
                data-nav
              >
                Watch live demo
              </a>
            </div>

            <div class="hero-trust-row">
              <span>✓ Real-time scoring</span>
              <span>✓ Live court video</span>
              <span>✓ LED synchronization</span>
              <span>✓ Multi-court ready</span>
            </div>
          </div>

          <div class="premium-hero-media">
            <div class="product-image-frame">
              <img
                src="${base}product.png"
                alt="VoxCourt smart scoring system installed on a tennis court"
                class="product-hero-image"
              />

              <div class="product-image-badge product-image-badge-top">
                <span class="product-status-dot"></span>
                Complete court system
              </div>

              <div class="product-image-badge product-image-badge-bottom">
                Tablet • LED • Cloud • Live stream
              </div>
            </div>
          </div>
        </section>

        <!-- ===== VALUE STRIP ===== -->
        <section class="value-strip" aria-label="VoxCourt benefits">
          <article class="value-item">
            <div class="value-number">01</div>
            <div>
              <h3>Simple control</h3>
              <p>Operate the full scoreboard from one clean interface.</p>
            </div>
          </article>

          <article class="value-item">
            <div class="value-number">02</div>
            <div>
              <h3>Live everywhere</h3>
              <p>Share score and court video with spectators in real time.</p>
            </div>
          </article>

          <article class="value-item">
            <div class="value-number">03</div>
            <div>
              <h3>Built for clubs</h3>
              <p>Portable, scalable and ready for multiple courts.</p>
            </div>
          </article>
        </section>

        <!-- ===== SYSTEM SECTION ===== -->
        <section id="system" class="brand-section system-section">
          <div class="section-heading">
            <div class="eyebrow">One connected platform</div>
            <h2>Everything the court needs. Working as one system.</h2>
            <p>
              VoxCourt combines match control, LED display, live streaming
              and online match data in one professional solution.
            </p>
          </div>

          <div class="system-grid">
            <article class="system-card">
              <div class="system-icon">🎙️</div>
              <h3>Voice and touch control</h3>
              <p>
                Update points, games and sets using the tablet interface or
                supported voice commands.
              </p>
            </article>

            <article class="system-card">
              <div class="system-icon">▦</div>
              <h3>Professional LED scoreboard</h3>
              <p>
                Give players and spectators a clear, highly visible live score
                directly beside the court.
              </p>
            </article>

            <article class="system-card">
              <div class="system-icon">◉</div>
              <h3>Live streaming</h3>
              <p>
                Connect the court camera and publish the match through a clean,
                branded online viewer.
              </p>
            </article>

            <article class="system-card">
              <div class="system-icon">☁</div>
              <h3>Cloud-connected courts</h3>
              <p>
                Organize clubs and courts through one scalable architecture,
                ready for future expansion.
              </p>
            </article>
          </div>
        </section>

        <!-- ===== SPONSOR OPPORTUNITY ===== -->
        <section id="sponsors" class="brand-section promo-section">
          <div class="promo-copy">
            <div class="eyebrow">Commercial opportunity</div>

            <h2>
              Turn every scoreboard into premium sponsor visibility.
            </h2>

            <p>
              The dedicated panel beneath the LED display creates a highly
              visible advertising position seen by players, spectators and
              club visitors throughout every match.
            </p>

            <div class="promo-points">
              <div>
                <strong>Maximum visibility</strong>
                <span>Prominent courtside placement throughout the event.</span>
              </div>

              <div>
                <strong>Custom sponsor branding</strong>
                <span>Display a sponsor logo, campaign or club partner.</span>
              </div>

              <div>
                <strong>New club revenue</strong>
                <span>Create a valuable sponsorship package around the court.</span>
              </div>
            </div>

            <a class="btn primary" href="#contact">
              Discuss sponsorship options
            </a>
          </div>

          <div class="promo-media">
            <img
              src="${base}logoHere.png"
              alt="VoxCourt scoreboard with dedicated sponsor advertising panel"
              class="promo-image"
            />
          </div>
        </section>

        <!-- ===== AI VOICE CONTROL ===== -->
        <section id="voice-control" class="brand-section voice-section">
          <div class="voice-media">
            <img
              src="${base}sponsor.png"
              alt="VoxCourt AI voice-controlled scoreboard system"
              class="voice-promo-image"
            />
          </div>

          <div class="voice-copy">
            <div class="eyebrow">Next-generation court control</div>

            <h2>Control the scoreboard with your voice.</h2>

            <p>
              VoxCourt is being designed around fast, natural match control.
              The operator can remain focused on the court while the system
              handles score commands and updates the connected displays.
            </p>

            <ul class="voice-feature-list">
              <li>Hands-free score commands</li>
              <li>Real-time LED and online updates</li>
              <li>Designed for remote and courtside control</li>
              <li>Scalable across clubs and tournaments</li>
            </ul>

            <a class="btn" href="/live" data-nav>
              Explore live courts
            </a>
          </div>
        </section>

        <!-- ===== HOW IT WORKS ===== -->
        <section id="how" class="brand-section how-section">
          <div class="section-heading centered">
            <div class="eyebrow">How it works</div>
            <h2>From the court to every screen.</h2>
          </div>

          <div class="steps-grid">
            <article class="step-card">
              <span class="step-number">01</span>
              <h3>Control the match</h3>
              <p>
                Use touch or voice to enter names, points, games and sets.
              </p>
            </article>

            <article class="step-card">
              <span class="step-number">02</span>
              <h3>Synchronize the court</h3>
              <p>
                The LED scoreboard and connected devices receive every update.
              </p>
            </article>

            <article class="step-card">
              <span class="step-number">03</span>
              <h3>Publish live</h3>
              <p>
                Score, player information and live video appear online for
                spectators.
              </p>
            </article>
          </div>
        </section>

        <!-- ===== FINAL CTA ===== -->
        <section class="final-cta-section">
          <div>
            <div class="eyebrow">Built for the future of racquet sports</div>
            <h2>Bring professional live scoring to your courts.</h2>
          </div>

          <div class="final-cta-actions">
            <a class="btn primary" href="/live" data-nav>
              View live courts
            </a>
            <a class="btn" href="#contact">
              Contact VoxCourt
            </a>
          </div>
        </section>

        <!-- ===== CONTACT ===== -->
        <section id="contact" class="contact-section">
          <div>
            <div class="eyebrow">Contact</div>
            <h2>Let’s talk about your club.</h2>
          </div>

          <div class="contact-details">
            <span>Email</span>
            <a href="mailto:info@escoreboards.eu">
              info@escoreboards.eu
            </a>
          </div>
        </section>
      </main>

      <footer class="footer premium-footer">
        <span>© <span id="y"></span> VoxCourt.</span>
        <span>Smart scoring for modern courts.</span>
      </footer>
    </div>
  `;

  const y = app.querySelector("#y");
  if (y) y.textContent = String(new Date().getFullYear());
}
