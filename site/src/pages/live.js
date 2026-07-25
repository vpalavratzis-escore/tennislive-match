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

    <!-- ===== TOP TITLE STRIP ===== -->
    <section class="panel section" style="margin-top:18px;">
      <div class="badge"><i></i> Find a court</div>

      <div class="hint" style="margin-top:10px;">
        Select Country → City → Club → Court and open the live viewer.
      </div>
    </section>

    <!-- ===== MAIN GRID ===== -->
    <div class="viewerWrap">

      <!-- LEFT: COURT SELECTOR -->
      <section class="panel section">
        <div class="badge"><i></i> Court selector</div>

        <div class="selectRow">
          <select id="selCountry" aria-label="Select country"></select>
          <select id="selCity" aria-label="Select city" disabled></select>
          <select id="selClub" aria-label="Select club" disabled></select>
          <select id="selCourt" aria-label="Select court" disabled></select>

          <button
            id="btnOpen"
            class="btn primary"
            type="button"
            disabled
          >
            Open
          </button>
        </div>

        <div class="hint">
          Tip: If you are on-site, the court name usually matches the sign
          on the fence (Court 1, Court 2, etc).
        </div>
      </section>

      <!-- RIGHT: QUICK DEMO / HOW IT WORKS -->
      <section class="panel section">
        <div class="badge"><i></i> Quick demo</div>

        <div class="hint" style="margin-top:10px;">
          Try a demo court to see how the viewer looks with score + stream.
        </div>

        <div class="actions" style="margin-top:12px;">
          <a
            class="btn"
            href="/?p=/gr/attica/kavouri-tennis-club/court-1"
            data-nav
          >
            Open Kavouri Court 1
          </a>

          <a
            class="btn"
            href="/?p=/gr/attica/kavouri-tennis-club/court-2"
            data-nav
          >
            Open Kavouri Court 2
          </a>
        </div>

        <div
          style="
            margin-top:16px;
            border-top:1px solid var(--line-soft);
            padding-top:14px;
          "
        >
          <div class="badge"><i></i> How it works</div>

          <div
            class="hint"
            style="margin-top:10px; line-height:1.7;"
          >
            <b>1.</b> Tablet controls the score<br />
            <b>2.</b> Raspberry Pi streams the camera + syncs LED<br />
            <b>3.</b> Cloud API updates the online viewer
          </div>
        </div>
      </section>
    </div>

    <!-- ===== BOTTOM DEMO STRIP ===== -->
    <section class="panel section">
      <div class="badge"><i></i> Demo courts</div>

      <div class="hint" style="margin-top:10px;">
        Tennis, padel and pickleball use the same viewer concept.
        Pick a court and open it.
      </div>

      <div class="actions" style="margin-top:12px;">
        <a
          class="btn"
          href="/?p=/gr/attica/kavouri-tennis-club/court-1"
          data-nav
        >
          Demo • Kavouri Court 1
        </a>

        <a
          class="btn"
          href="/?p=/gr/attica/kavouri-tennis-club/court-2"
          data-nav
        >
          Demo • Kavouri Court 2
        </a>

        <a class="btn" href="/" data-nav>Back to Home</a>
      </div>
    </section>

    <footer class="footer premium-footer">
      <span>© <span id="y"></span> VoxCourt.</span>
      <span>Smart scoring for modern courts.</span>
    </footer>
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
