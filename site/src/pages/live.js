import { header } from "../ui/header.js";

function opt(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

function setOptions(select, items, placeholder) {
  select.innerHTML = "";
  select.appendChild(opt("", placeholder));
  for (const it of items) {
    select.appendChild(opt(it.id, it.name));
  }
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

  app.appendChild(
    header([
      { label: "Home", href: "/" },
      { label: "Find courts", href: "/live" }
    ], { back: true })
  );

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Find a court</h2>
    <p>Select Country → City → Club → Court and open the viewer.</p>

    <div class="row">
      <select id="selCountry"></select>
      <select id="selCity" disabled></select>
      <select id="selClub" disabled></select>
      <select id="selCourt" disabled></select>
      <button id="btnOpen" class="btn primary" disabled>Open</button>
    </div>

    <div class="demo">
      Demo:
      <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-1" data-nav>Open Kavouri Court 1</a>
      <a class="btn" href="/?p=/gr/attica/kavouri-tennis-club/court-2" data-nav>Open Kavouri Court 2</a>
    </div>
  `;
  app.appendChild(wrap);

  const selCountry = wrap.querySelector("#selCountry");
  const selCity = wrap.querySelector("#selCity");
  const selClub = wrap.querySelector("#selClub");
  const selCourt = wrap.querySelector("#selCourt");
  const btnOpen = wrap.querySelector("#btnOpen");

  let data = null;

  const getCountry = () => data.countries.find(c => c.id === selCountry.value);
  const getCity = () => (getCountry()?.cities || []).find(c => c.id === selCity.value);
  const getClub = () => (getCity()?.clubs || []).find(c => c.id === selClub.value);
  const getCourt = () => (getClub()?.courts || []).find(c => c.id === selCourt.value);

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

  selCountry.addEventListener("change", () => { updateCities(); updateOpen(); });
  selCity.addEventListener("change", () => { updateClubs(); updateOpen(); });
  selClub.addEventListener("change", () => { updateCourts(); updateOpen(); });
  selCourt.addEventListener("change", () => updateOpen());

  btnOpen.addEventListener("click", () => {
    const country = getCountry();
    const city = getCity();
    const club = getClub();
    const court = getCourt();
    if (!(country && city && club && court)) return;

    const p = `/${country.id}/${city.id}/${club.id}/${court.id}`;
    // ανοίγει viewer μέσω ?p=
    window.location.href = `${import.meta.env.BASE_URL}?p=${encodeURIComponent(p)}`;
  });

  // load data + init country dropdown
  (async () => {
    try {
      data = await loadClubs();
      setOptions(selCountry, data.countries || [], "Country");
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>Error</h2><pre>${String(e)}</pre></div>`;
    }
  })();
}
