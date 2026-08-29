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
    

    <div class="court-page">
      <!-- ===== SAME GLOBAL NAVBAR AS HOME ===== -->
      
      <header class="vc-home-nav">

        <a
          href="${base}"
          data-nav
          class="vc-home-brand"
          aria-label="VoxCourt home"
        >
          <img src="${base}logoText.png" alt="VoxCourt" />
        </a>

        <nav class="vc-home-links" aria-label="Main navigation">
          <a href="${base}" data-nav>Home</a>
          <a class="active" href="${base}live" data-nav>Find courts</a>
          <a href="https://voxcourt.com/matches/">Match Results</a>
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


      <main>
        <section class="court-hero">
          <div class="court-hero-copy">
            <div class="court-eyebrow">VoxCourt network</div>

            <h1 class="court-title">
              Find a court.<br />
              <span>Watch live.</span>
            </h1>

            <p class="court-intro">
              Choose your location, club and court. VoxCourt opens the live match instantly.
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
