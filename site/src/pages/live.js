function opt(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function setOptions(select, items, placeholder) {
  select.innerHTML = "";
  select.appendChild(opt("", placeholder));
  for (const item of items) select.appendChild(opt(item.id, item.name));
  select.disabled = items.length === 0;
}

async function loadClubs() {
  const url = `${import.meta.env.BASE_URL}config/clubs.json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load clubs.json: ${response.status}`);
  return response.json();
}

export function renderLive() {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";
  app.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "wrap vc-courts-page";
  wrap.innerHTML = `
    <header class="nav premium-nav vc-nav">
      <a class="brand brand-image" href="/" data-nav aria-label="VoxCourt home">
        <img src="${base}logoText.png" alt="VoxCourt" class="brand-logo-image" />
      </a>
      <nav class="navlinks" aria-label="Main navigation"><a href="/" data-nav>Home</a><a href="/live" data-nav>Find courts</a></nav>
      <a class="cta" href="/" data-nav>VoxCourt</a>
    </header>

    <main class="vc-courts-main">
      <section class="vc-courts-intro">
        <div class="eyebrow">LIVE COURTS</div>
        <h1>Choose a court.<br><span>Start watching.</span></h1>
        <p>Select the club and court. VoxCourt opens the live score and available video instantly.</p>
      </section>

      <section class="vc-selector-card" aria-labelledby="court-selector-title">
        <div class="vc-selector-heading">
          <div><div class="eyebrow">COURT SELECTOR</div><h2 id="court-selector-title">Find your match</h2></div>
          <span class="vc-live-pill">● Live network</span>
        </div>
        <div class="vc-select-grid">
          <label>Country<select id="selCountry" aria-label="Select country"></select></label>
          <label>City<select id="selCity" aria-label="Select city" disabled></select></label>
          <label>Club<select id="selClub" aria-label="Select club" disabled></select></label>
          <label>Court<select id="selCourt" aria-label="Select court" disabled></select></label>
        </div>
        <button id="btnOpen" class="btn primary vc-open-court" type="button" disabled>Open live court</button>
      </section>

      <section class="vc-courts-benefits">
        <span><b>Live score</b> Points, games & sets</span>
        <span><b>Video</b> When available</span>
        <span><b>Replay</b> Instant match moments</span>
      </section>
    </main>

    <footer class="footer premium-footer"><span>© <span id="y"></span> VoxCourt.</span><span>Live courts. Smart scoring.</span></footer>
  `;
  app.appendChild(wrap);

  wrap.querySelector("#y").textContent = String(new Date().getFullYear());
  const selCountry = wrap.querySelector("#selCountry");
  const selCity = wrap.querySelector("#selCity");
  const selClub = wrap.querySelector("#selClub");
  const selCourt = wrap.querySelector("#selCourt");
  const btnOpen = wrap.querySelector("#btnOpen");
  let data = null;

  const getCountry = () => data?.countries?.find(x => x.id === selCountry.value);
  const getCity = () => (getCountry()?.cities || []).find(x => x.id === selCity.value);
  const getClub = () => (getCity()?.clubs || []).find(x => x.id === selClub.value);
  const getCourt = () => (getClub()?.courts || []).find(x => x.id === selCourt.value);

  function updateCities() { setOptions(selCity, getCountry()?.cities || [], "City"); setOptions(selClub, [], "Club"); setOptions(selCourt, [], "Court"); btnOpen.disabled = true; }
  function updateClubs() { setOptions(selClub, getCity()?.clubs || [], "Club"); setOptions(selCourt, [], "Court"); btnOpen.disabled = true; }
  function updateCourts() { setOptions(selCourt, getClub()?.courts || [], "Court"); btnOpen.disabled = true; }
  function updateOpen() { btnOpen.disabled = !(getCountry() && getCity() && getClub() && getCourt()); }

  selCountry.addEventListener("change", () => { updateCities(); updateOpen(); });
  selCity.addEventListener("change", () => { updateClubs(); updateOpen(); });
  selClub.addEventListener("change", () => { updateCourts(); updateOpen(); });
  selCourt.addEventListener("change", updateOpen);
  btnOpen.addEventListener("click", () => {
    const country = getCountry(), city = getCity(), club = getClub(), court = getCourt();
    if (!(country && city && club && court)) return;
    const courtPath = `/${country.id}/${city.id}/${club.id}/${court.id}`;
    window.location.href = `${base}?p=${encodeURIComponent(courtPath)}`;
  });

  (async () => {
    try {
      data = await loadClubs();
      setOptions(selCountry, data.countries || [], "Country");
    } catch (error) {
      console.error("Failed to load court configuration:", error);
      const card = wrap.querySelector(".vc-selector-card");
      if (card) card.insertAdjacentHTML("beforeend", `<p class="vc-load-error">Court list is temporarily unavailable. Please try again.</p>`);
    }
  })();
}
