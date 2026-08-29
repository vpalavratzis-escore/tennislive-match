function opt(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function setOptions(select, items, placeholder) {
  select.innerHTML = "";
  select.appendChild(opt("", placeholder));

  for (const item of items) {
    select.appendChild(opt(item.id, item.name));
  }

  select.disabled = items.length === 0;
}

async function loadClubs() {
  const url = `${import.meta.env.BASE_URL}config/clubs.json`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load clubs.json: ${response.status}`);
  }

  return response.json();
}

export function renderLive() {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";

  app.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  wrap.innerHTML = `
    <style>
      .court-page {
        display: grid;
        gap: 24px;
      }

      .court-hero {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(520px, 1.1fr);
        gap: clamp(34px, 5vw, 78px);
        align-items: center;
        min-height: 520px;
        padding: clamp(42px, 5vw, 74px);
        border: 1px solid var(--line);
        border-radius: 32px;
        background:
          radial-gradient(circle at 88% 12%, rgba(8,184,187,.17), transparent 31%),
          radial-gradient(circle at 8% 92%, rgba(240,146,50,.10), transparent 28%),
          linear-gradient(135deg, rgba(6,18,21,.98), rgba(2,9,11,.98));
        box-shadow:
          0 32px 90px rgba(0,0,0,.48),
          inset 0 1px 0 rgba(255,255,255,.035);
      }

      .court-hero::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(rgba(255,255,255,.014) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px);
        background-size: 42px 42px;
        mask-image: linear-gradient(120deg, rgba(0,0,0,.45), transparent 72%);
      }

      .court-hero-copy,
      .court-selector-card {
        position: relative;
        z-index: 1;
      }

      .court-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: rgba(232,244,245,.74);
        font-size: 11px;
        font-weight: 850;
        letter-spacing: .14em;
        text-transform: uppercase;
      }

      .court-eyebrow::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--teal);
        box-shadow:
          0 0 0 6px rgba(8,184,187,.10),
          0 0 24px rgba(8,184,187,.55);
      }

      .court-title {
        max-width: 700px;
        margin: 24px 0 0;
        font-size: clamp(48px, 5vw, 78px);
        line-height: .98;
        letter-spacing: -.055em;
        text-wrap: balance;
      }

      .court-title span {
        color: var(--teal);
      }

      .court-intro {
        max-width: 640px;
        margin: 24px 0 0;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.68;
      }

      .court-sports {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 28px;
      }

      .court-sport {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 8px 13px;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 999px;
        background: rgba(255,255,255,.035);
        color: rgba(241,247,247,.73);
        font-size: 12px;
        font-weight: 780;
      }

      .court-selector-card {
        padding: 28px;
        border: 1px solid rgba(76,228,229,.17);
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(5,16,19,.93), rgba(2,9,11,.94));
        box-shadow:
          0 24px 70px rgba(0,0,0,.38),
          inset 0 1px 0 rgba(255,255,255,.035);
        backdrop-filter: blur(18px);
      }

      .court-selector-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
      }

      .court-selector-top h2 {
        margin: 10px 0 0;
        font-size: clamp(28px, 3vw, 42px);
        letter-spacing: -.035em;
      }

      .court-selector-top p {
        margin: 10px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .court-status {
        flex: 0 0 auto;
        padding: 9px 12px;
        border: 1px solid rgba(8,184,187,.20);
        border-radius: 999px;
        background: rgba(8,184,187,.08);
        color: var(--cyan);
        font-size: 11px;
        font-weight: 850;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .court-select-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 26px;
      }

      .court-field {
        display: grid;
        gap: 8px;
      }

      .court-field label {
        color: rgba(224,234,235,.58);
        font-size: 11px;
        font-weight: 820;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .court-field select {
        width: 100%;
        min-height: 52px;
        padding: 0 14px;
        border: 1px solid rgba(102,222,224,.15);
        border-radius: 14px;
        outline: 0;
        background: rgba(255,255,255,.045);
        color: var(--text);
        font-weight: 820;
        transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
      }

      .court-field select:focus {
        border-color: rgba(8,184,187,.55);
        background: rgba(255,255,255,.065);
        box-shadow: 0 0 0 3px rgba(8,184,187,.10);
      }

      .court-field select:disabled {
        opacity: .48;
        cursor: not-allowed;
      }

      .court-field option {
        background: #061216;
      }

      .court-open {
        width: 100%;
        min-height: 54px;
        margin-top: 14px;
      }

      .court-help {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255,255,255,.07);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55;
      }

      .court-help strong {
        color: var(--teal);
      }

      .court-value-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .court-value-card {
        min-height: 180px;
        padding: 26px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(7,17,20,.88), rgba(3,10,12,.90));
        box-shadow: var(--shadow-md);
      }

      .court-value-icon {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        margin-bottom: 22px;
        border: 1px solid rgba(8,184,187,.28);
        border-radius: 14px;
        background: rgba(8,184,187,.08);
        color: var(--teal);
        font-size: 22px;
      }

      .court-value-card h3 {
        margin: 0;
        font-size: 18px;
      }

      .court-value-card p {
        margin: 9px 0 0;
        color: var(--muted);
        line-height: 1.58;
      }

      .court-trust-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 24px 28px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(3,10,12,.78);
      }

      .court-trust-strip strong {
        font-size: 16px;
      }

      .court-trust-strip span {
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 1100px) {
        .court-hero {
          grid-template-columns: 1fr;
        }

        .court-selector-card {
          max-width: 820px;
        }
      }

      @media (max-width: 760px) {
        .court-hero {
          min-height: auto;
          padding: 30px 20px;
          border-radius: 24px;
        }

        .court-title {
          font-size: clamp(42px, 11vw, 60px);
        }

        .court-intro {
          font-size: 16px;
        }

        .court-select-grid,
        .court-value-grid {
          grid-template-columns: 1fr;
        }

        .court-selector-top,
        .court-trust-strip {
          align-items: flex-start;
          flex-direction: column;
        }

        .court-selector-card,
        .court-value-card {
          padding: 22px;
        }
      }
    </style>

    <div class="court-page">
      <!-- ===== SAME GLOBAL NAVBAR AS HOME ===== -->
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
          <a href="/#system" data-nav>The system</a>
          <a href="/#sponsors" data-nav>Sponsors</a>
          <a href="/#voice-control" data-nav>AI Voice Control</a>
          <a href="https://voxcourt.com/matches/">Match Results</a>
        </nav>

        <a class="cta" href="/live" data-nav>Open a court</a>
      </header>

      <main>
        <section class="court-hero">
          <div class="court-hero-copy">
            <div class="court-eyebrow">VoxCourt network</div>

            <h1 class="court-title">
              Find your court.<br />
              <span>Follow the match live.</span>
            </h1>

            <p class="court-intro">
              Select a club and court to open its live score, player information
              and available video stream in one professional match view.
            </p>

            <div class="court-sports" aria-label="Supported sports">
              <span class="court-sport">Tennis</span>
              <span class="court-sport">Padel</span>
              <span class="court-sport">Pickleball</span>
              <span class="court-sport">Multi-court clubs</span>
            </div>
          </div>

          <section class="court-selector-card" aria-labelledby="court-selector-title">
            <div class="court-selector-top">
              <div>
                <div class="badge"><i></i> Court selector</div>
                <h2 id="court-selector-title">Open a live court</h2>
                <p>Choose location, club and court to continue.</p>
              </div>

              <span class="court-status">Live network</span>
            </div>

            <div class="court-select-grid">
              <div class="court-field">
                <label for="selCountry">Country</label>
                <select id="selCountry" aria-label="Select country"></select>
              </div>

              <div class="court-field">
                <label for="selCity">City</label>
                <select id="selCity" aria-label="Select city" disabled></select>
              </div>

              <div class="court-field">
                <label for="selClub">Club</label>
                <select id="selClub" aria-label="Select club" disabled></select>
              </div>

              <div class="court-field">
                <label for="selCourt">Court</label>
                <select id="selCourt" aria-label="Select court" disabled></select>
              </div>
            </div>

            <button
              id="btnOpen"
              class="btn primary court-open"
              type="button"
              disabled
            >
              Open live court
              <span aria-hidden="true">›</span>
            </button>

            <div class="court-help">
              <strong>Tip</strong>
              <span>
                On-site court names usually match the sign on the fence,
                such as Court 1 or Court 2.
              </span>
            </div>
          </section>
        </section>

        <section class="court-value-grid" aria-label="VoxCourt features">
          <article class="court-value-card">
            <div class="court-value-icon">◉</div>
            <h3>Live score</h3>
            <p>
              Follow points, games and sets in real time from any connected device.
            </p>
          </article>

          <article class="court-value-card">
            <div class="court-value-icon">▷</div>
            <h3>Live video</h3>
            <p>
              Watch the court stream together with the match score when video is available.
            </p>
          </article>

          <article class="court-value-card">
            <div class="court-value-icon">↻</div>
            <h3>Connected system</h3>
            <p>
              Tablet control, LED scoreboard and cloud viewer stay synchronized.
            </p>
          </article>
        </section>

        <section class="court-trust-strip">
          <div>
            <strong>One platform for every racquet court.</strong><br />
            <span>Built for clubs, players, coaches and spectators.</span>
          </div>

          <a class="btn" href="/" data-nav>Back to Home</a>
        </section>
      </main>

      <footer class="footer premium-footer">
        <span>© <span id="y"></span> VoxCourt.</span>
        <span>Smart scoring for modern courts.</span>
      </footer>
    </div>
  `;

  app.appendChild(wrap);

  const year = wrap.querySelector("#y");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const selCountry = wrap.querySelector("#selCountry");
  const selCity = wrap.querySelector("#selCity");
  const selClub = wrap.querySelector("#selClub");
  const selCourt = wrap.querySelector("#selCourt");
  const btnOpen = wrap.querySelector("#btnOpen");

  let data = null;

  const getCountry = () =>
    data?.countries?.find(country => country.id === selCountry.value);

  const getCity = () =>
    (getCountry()?.cities || []).find(city => city.id === selCity.value);

  const getClub = () =>
    (getCity()?.clubs || []).find(club => club.id === selClub.value);

  const getCourt = () =>
    (getClub()?.courts || []).find(court => court.id === selCourt.value);

  function updateCities() {
    const country = getCountry();

    setOptions(selCity, country?.cities || [], "City");
    setOptions(selClub, [], "Club");
    setOptions(selCourt, [], "Court");

    btnOpen.disabled = true;
  }

  function updateClubs() {
    const city = getCity();

    setOptions(selClub, city?.clubs || [], "Club");
    setOptions(selCourt, [], "Court");

    btnOpen.disabled = true;
  }

  function updateCourts() {
    const club = getClub();

    setOptions(selCourt, club?.courts || [], "Court");

    btnOpen.disabled = true;
  }

  function updateOpen() {
    const country = getCountry();
    const city = getCity();
    const club = getClub();
    const court = getCourt();

    btnOpen.disabled = !(country && city && club && court);
  }

  selCountry.addEventListener("change", () => {
    updateCities();
    updateOpen();
  });

  selCity.addEventListener("change", () => {
    updateClubs();
    updateOpen();
  });

  selClub.addEventListener("change", () => {
    updateCourts();
    updateOpen();
  });

  selCourt.addEventListener("change", updateOpen);

  btnOpen.addEventListener("click", () => {
    const country = getCountry();
    const city = getCity();
    const club = getClub();
    const court = getCourt();

    if (!(country && city && club && court)) {
      return;
    }

    const courtPath =
      `/${country.id}/${city.id}/${club.id}/${court.id}`;

    window.location.href =
      `${base}?p=${encodeURIComponent(courtPath)}`;
  });

  (async () => {
    try {
      data = await loadClubs();
      setOptions(selCountry, data.countries || [], "Country");
    } catch (error) {
      console.error("Failed to load court configuration:", error);

      wrap.innerHTML = `
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

          <div></div>

          <a class="cta" href="/" data-nav>Back to Home</a>
        </header>

        <section class="panel section" style="margin-top:18px;">
          <div class="badge"><i></i> Error</div>

          <pre
            style="
              margin-top:12px;
              white-space:pre-wrap;
              color:var(--muted);
            "
          >${String(error)}</pre>

          <div class="actions" style="margin-top:12px;">
            <a class="btn" href="/" data-nav>Back to Home</a>
          </div>
        </section>
      `;
    }
  })();
}
