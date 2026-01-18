async function loadClubs() {
  const r = await fetch("/config/clubs.json", { cache: "no-store" });
  if (!r.ok) throw new Error("Cannot load /config/clubs.json");
  return r.json();
}

function uniq(arr) {
  return [...new Set(arr)];
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function renderLive() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="wrap">
      <div class="nav">
        <div class="brand"><div class="logo"></div><div>e-Scoreboards</div></div>
        <div class="navlinks">
          <a href="/" data-nav>Home</a>
          <a href="/live" data-nav>Find courts</a>
        </div>
        <a class="cta" href="/" data-nav>Back</a>
      </div>

      <div class="panel section">
        <div class="badge"><i></i> Find a court</div>
        <div class="hint">
          Select Country → City → Club → Court and open the viewer.
        </div>

        <div class="selectRow">
          <select id="country"></select>
          <select id="city"></select>
          <select id="club"></select>
          <select id="court"></select>
          <a class="btn primary" id="open" href="#">Open</a>
        </div>

        <div class="hint" style="margin-top:10px">
          Demo: <a class="btn" style="padding:10px 12px" href="/v/gr/attica/kavouri-tennis-club/court-1" data-nav>Open Kavouri Court 1</a>
        </div>
      </div>

      <div class="footer">© <span id="y"></span> e-Scoreboards.</div>
    </div>
  `;

  app.querySelector("#y").textContent = String(new Date().getFullYear());

  const cfg = await loadClubs();

  const countrySel = app.querySelector("#country");
  const citySel = app.querySelector("#city");
  const clubSel = app.querySelector("#club");
  const courtSel = app.querySelector("#court");
  const openBtn = app.querySelector("#open");

  const countries = uniq(cfg.clubs.map((c) => c.country));
  countrySel.innerHTML = countries.map((c) => `<option value="${c}">${c}</option>`).join("");

  function fillCities() {
    const country = countrySel.value;
    const cities = uniq(cfg.clubs.filter((c) => c.country === country).map((c) => c.city));
    citySel.innerHTML = cities.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  function fillClubs() {
    const country = countrySel.value;
    const city = citySel.value;
    const clubs = cfg.clubs.filter((c) => c.country === country && c.city === city);
    clubSel.innerHTML = clubs.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }

  function fillCourts() {
    const country = countrySel.value;
    const city = citySel.value;
    const clubs = cfg.clubs.filter((c) => c.country === country && c.city === city);
    const club = clubs.find((c) => c.id === clubSel.value) || clubs[0];
    if (!club) return (courtSel.innerHTML = "");
    courtSel.innerHTML = club.courts.map((ct) => `<option value="${ct.id}">${ct.name}</option>`).join("");
  }

  function updateOpenLink() {
    const country = countrySel.value;
    const city = citySel.value;
    const clubs = cfg.clubs.filter((c) => c.country === country && c.city === city);
    const club = clubs.find((c) => c.id === clubSel.value);
    if (!club) return;
    const court = club.courts.find((ct) => ct.id === courtSel.value);
    if (!court) return;

    const url = `/v/${slugify(club.country)}/${slugify(club.city)}/${slugify(club.id)}/${slugify(court.id)}`;
    openBtn.setAttribute("href", url);
  }

  ["change"].forEach((ev) => {
    countrySel.addEventListener(ev, () => {
      fillCities(); fillClubs(); fillCourts(); updateOpenLink();
    });
    citySel.addEventListener(ev, () => {
      fillClubs(); fillCourts(); updateOpenLink();
    });
    clubSel.addEventListener(ev, () => {
      fillCourts(); updateOpenLink();
    });
    courtSel.addEventListener(ev, updateOpenLink);
  });

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", openBtn.getAttribute("href"));
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  fillCities();
  fillClubs();
  fillCourts();
  updateOpenLink();
}
