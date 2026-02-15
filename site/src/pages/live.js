function opt(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function setOptions(select, items, placeholder) {
  select.innerHTML = "";
  select.appendChild(opt("", placeholder));
  for (const it of items) select.appendChild(opt(it.id, it.name));
  select.disabled = items.length === 0;
}

async function loadClubs() {
  const url = `${import.meta.env.BASE_URL}config/clubs.json`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load clubs.json: ${r.status}`);
  return r.json();
}

export function renderLive() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML = `
    <!-- ===== NAV (same as Home) ===== -->
    <div class="nav">
      <div class="brand"><div class="logo"></div><div>e-Scoreboards</div></div>
      <div class="navlinks">
        <a href="/" data-nav>Home</a>
        <a href="/live" data-nav>Find courts</a>
        <a href="/#how" data-nav>How it works</a>
        <a href="/#contact" data-nav>Contact</a>
      </div>
      <a class="cta" href="/live" data-nav>Find a court</a>
    </div>

    <!-- ===== TOP TITLE STRIP ===== -->
    <div class="panel section" style="margin-top:18px;">
      <div class="badge"><i></i> Find a court</div>
      <div class="hint" style="margin-top:10px;">
        Select Country → City → Club → Court and open the live viewer.
      </div>
    </div>

    <!-- ===== MAIN GRID ===== -->
    <div class="viewerWrap">
      <!-- LEFT: selectors -->
      <div class="panel section">
        <div class="badge"><i></i> Court selector</div>

        <div class="selectRow">
          <select id="selCountry"></select>
          <select id="selCity" disabled></select>
          <select id="selClub" disabled></select>
          <select id="selCourt" disabled></select>
          <button id="btnOpen" class="btn primary" disabled>Open</button>
        </div>

        <div class="hint">
          Tip: If you are on-site, the court name usually matches the sign on the fence (Court 1, Court 2, etc).
        </div>
      </div>

      <!-- RIGHT: quick demo / how -->
      <div class="panel section">
        <div class="badge"><i></i> Quick demo</div>
        <div class="hint" style="margin-top:10px;">
          Try a demo court to see how the viewer looks with score + stream.
        </div>

        <div class="actions" style="margin-top:12px;">
          <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>Open Kavouri Court 1</a>
          <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-2" data-nav>Open Kavouri Court 2</a>
        </div>

        <div style="margin-top:16px; border-top:1px solid var(--line2); padding-top:14px;">
          <div class="badge"><i></i> How it works</div>
          <div class="hint" style="margin-top:10px; line-height:1.7;">
            <b>1.</b> Tablet controls the score<br/>
            <b>2.</b> Raspberry Pi streams the camera + syncs LED<br/>
            <b>3.</b> Cloud API updates the online viewer
          </div>
        </div>
      </div>
    </div>

    <!-- ===== BOTTOM DEMO STRIP ===== -->
    <div class="panel section">
      <div class="badge"><i></i> Demo courts</div>
      <div class="hint" style="margin-top:10px;">
        Tennis / Padel / Pickleball use the same viewer concept — pick a court and open it.
      </div>

      <div class="actions" style="margin-top:12px;">
        <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>Demo • Kavouri Court 1</a>
        <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-2" data-nav>Demo • Kavouri Court 2</a>
        <a class="btn" href="/" data-nav>Back to Home</a>
      </div>
    </div>

    <div class="footer">© <span id="y"></span> e-Scoreboards.</div>
  `;

  app.appendChild(wrap);

  const y = wrap.querySelector("#y");
  if (y) y.textContent = String(new Date().getFullYear());

  const selCountry = wrap.querySelector("#selCountry");
  const selCity = wrap.querySelector("#selCity");
  const selClub = wrap.querySelector("#selClub");
  const selCourt = wrap.querySelector("#selCourt");
  const btnOpen = wrap.querySelector("#btnOpen");

  let data = null;

  const getCountry = () => data?.countries?.find((c) => c.id === selCountry.value);
  const getCity = () => (getCountry()?.cities || []).find((c) => c.id === selCity.value);
  const getClub = () => (getCity()?.clubs || []).find((c) => c.id === selClub.value);
  const getCourt = () => (getClub()?.courts || []).find((c) => c.id === selCourt.value);

  function updateCities() {
    const c = getCountry();
    setOptions(selCity, c?.cities || [], "City");
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
  selCourt.addEventListener("change", () => updateOpen());

  btnOpen.addEventListener("click", () => {
    const country = getCountry();
    const city = getCity();
    const club = getClub();
    const court = getCourt();
    if (!(country && city && club && court)) return;

    const p = `/${country.id}/${city.id}/${club.id}/${court.id}`;
    window.location.href = `${import.meta.env.BASE_URL}?p=${encodeURIComponent(p)}`;
  });

  (async () => {
    try {
      data = await loadClubs();
      setOptions(selCountry, data.countries || [], "Country");
    } catch (e) {
      wrap.innerHTML = `
        <div class="wrap">
          <div class="panel section">
            <div class="badge"><i></i> Error</div>
            <pre style="margin-top:12px; white-space:pre-wrap;">${String(e)}</pre>
            <div class="actions" style="margin-top:12px;">
              <a class="btn" href="/" data-nav>Back to Home</a>
            </div>
          </div>
        </div>
      `;
    }
  })();
}
