import "./style.css";
import "./preview-redesign.css";

// ====== App root ======
const app = document.getElementById("app");
if (!app) {
  console.error("Missing #app");
} else {
  // δείξε κάτι ΑΜΕΣΩΣ για να μην είναι ποτέ άδειο
  app.innerHTML = `<div style="padding:16px;font-family:Inter,system-ui,sans-serif">Loading…</div>`;
}

// ====== Router / Pages imports ======
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

// ====== Router ======
function route() {
  const base = import.meta.env.BASE_URL || "/"; // "/tennislive-match/"
  const url = new URL(window.location.href);

  // ?p=... έχει προτεραιότητα (viewer deep link)
  const p = url.searchParams.get("p");
  if (p) {
    const decoded = decodeURIComponent(p);
    return renderViewer(decoded);
  }

  // normal pages (home/live) με base prefix
  let path = url.pathname;

  if (path.startsWith(base)) {
    path = path.slice(base.length - 1); // "/tennislive-match/live" -> "/live"
  }

  path = path.replace(/\/+$/, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();

  // fallback
  return renderHome();
}

// ====== SPA navigation ======
function onLinkClick(e) {
  const a = e.target.closest("a");
  if (!a) return;

  const href = a.getAttribute("href");
  if (!href) return;

  // αφήνουμε external, mailto, tel, target=_blank
  const isExternal =
    href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
  if (isExternal || a.target === "_blank") return;

  // εσωτερικά links: route χωρίς reload
  if (href.startsWith("/")) {
    e.preventDefault();
    history.pushState({}, "", import.meta.env.BASE_URL.replace(/\/+$/, "") + href);
    route();
  }
}

// ====== Start ======
window.addEventListener("popstate", route);
document.addEventListener("click", onLinkClick);

// ΚΑΛΕΣΕ ΤΟ ΤΩΡΑ
route();


/* ==========================================================
   VOXCOURT PREVIEW SCOREBOARD V3
   Reads the legacy scoreboard; does not replace scoring logic.
   ========================================================== */

function installVoxCourtPreviewScoreboard(){

  const wrap = document.querySelector(".viewerWrap");

  const legacy =
    document.querySelector(".viewer-score-panel");

  if (!wrap || !legacy) return;

  if (
    wrap.querySelector(".vc3-scoreboard")
  ) return;


  const panel =
    document.createElement("section");

  panel.className =
    "vc3-scoreboard";


  panel.innerHTML = `

    <header class="vc3-scoreboard__head">

      <div>

        <div class="vc3-scoreboard__label">
          LIVE SCORE
        </div>

        <h2 class="vc3-scoreboard__title">
          Match score
        </h2>

      </div>


      <div class="vc3-scoreboard__live">

        <span
          class="vc3-scoreboard__live-dot"
        ></span>

        LIVE

      </div>

    </header>


    <div class="vc3-scoreboard__columns">

      <span>PLAYER</span>
      <span>POINTS</span>
      <span>GAMES</span>
      <span>SETS</span>

    </div>


    <div class="vc3-player vc3-player--a">

      <div class="vc3-player__identity">

        <div class="vc3-player__photo">

          <img
            data-vc-photo="A"
            alt=""
          />

          <span
            class="vc3-player__initial"
            data-vc-initial="A"
          >
            A
          </span>

        </div>


        <div class="vc3-player__namebox">

          <strong
            class="vc3-player__name"
            data-vc-name="A"
          >
            Player A
          </strong>

          <span class="vc3-player__sub">
            Player A
          </span>

        </div>


        <span
          class="vc3-player__serve"
          data-vc-serve="A"
        ></span>

      </div>


      <strong
        class="vc3-score vc3-score--point"
        data-vc-point="A"
      >
        —
      </strong>

      <strong
        class="vc3-score"
        data-vc-games="A"
      >
        —
      </strong>

      <strong
        class="vc3-score"
        data-vc-sets="A"
      >
        —
      </strong>

    </div>


    <div class="vc3-player vc3-player--b">

      <div class="vc3-player__identity">

        <div class="vc3-player__photo">

          <img
            data-vc-photo="B"
            alt=""
          />

          <span
            class="vc3-player__initial"
            data-vc-initial="B"
          >
            B
          </span>

        </div>


        <div class="vc3-player__namebox">

          <strong
            class="vc3-player__name"
            data-vc-name="B"
          >
            Player B
          </strong>

          <span class="vc3-player__sub">
            Player B
          </span>

        </div>


        <span
          class="vc3-player__serve"
          data-vc-serve="B"
        ></span>

      </div>


      <strong
        class="vc3-score vc3-score--point"
        data-vc-point="B"
      >
        —
      </strong>

      <strong
        class="vc3-score"
        data-vc-games="B"
      >
        —
      </strong>

      <strong
        class="vc3-score"
        data-vc-sets="B"
      >
        —
      </strong>

    </div>

  `;


  wrap.appendChild(panel);


  function text(id, fallback){

    const el =
      document.getElementById(id);

    const value =
      el?.textContent?.trim();

    return value || fallback;

  }


  function mirrorPlayer(side){

    const low =
      side.toLowerCase();

    const name =
      text(
        `name${side}`,
        `Player ${side}`
      );


    const title =
      text(
        `photo${side}Title`,
        name
      );


    const outputName =
      panel.querySelector(
        `[data-vc-name="${side}"]`
      );

    if (outputName)
      outputName.textContent =
        title || name;


    const p =
      panel.querySelector(
        `[data-vc-point="${side}"]`
      );

    const g =
      panel.querySelector(
        `[data-vc-games="${side}"]`
      );

    const s =
      panel.querySelector(
        `[data-vc-sets="${side}"]`
      );


    if (p)
      p.textContent =
        text(`point${side}`, "—");

    if (g)
      g.textContent =
        text(`games${side}`, "—");

    if (s)
      s.textContent =
        text(`sets${side}`, "—");


    const originalPhoto =
      document.getElementById(
        `photo${side}`
      );

    const photo =
      panel.querySelector(
        `[data-vc-photo="${side}"]`
      );

    const initial =
      panel.querySelector(
        `[data-vc-initial="${side}"]`
      );


    const src =
      originalPhoto?.getAttribute("src") || "";


    if (src){

      photo.src = src;
      photo.style.display = "block";

      initial.style.display = "none";

    } else {

      photo.removeAttribute("src");
      photo.style.display = "none";

      initial.style.display = "block";

    }


    const originalServe =
      document.getElementById(
        `serve${side}Icon`
      );

    const serve =
      panel.querySelector(
        `[data-vc-serve="${side}"]`
      );


    if (
      originalServe &&
      getComputedStyle(
        originalServe
      ).display !== "none"
    ){

      serve.style.display =
        "block";

    } else {

      serve.style.display =
        "none";

    }

  }


  function sync(){

    mirrorPlayer("A");
    mirrorPlayer("B");

  }


  sync();


  const observer =
    new MutationObserver(sync);


  observer.observe(
    legacy,
    {
      subtree:true,
      childList:true,
      characterData:true,
      attributes:true
    }
  );


  window.setInterval(
    sync,
    1000
  );

}


/* App pages render dynamically. */
const vcPreviewObserver =
  new MutationObserver(() => {

    installVoxCourtPreviewScoreboard();

  });


const vcPreviewRoot =
  document.getElementById("app");


if (vcPreviewRoot){

  vcPreviewObserver.observe(
    vcPreviewRoot,
    {
      childList:true,
      subtree:true
    }
  );

}


window.setTimeout(
  installVoxCourtPreviewScoreboard,
  50
);



/* ==========================================================
   VOXCOURT PREVIEW V4 — CLUB SPONSORS
   ========================================================== */

function vcGetCurrentClubSlug() {
  const url = new URL(window.location.href);
  const p = url.searchParams.get("p") || "";

  const parts = decodeURIComponent(p)
    .split("/")
    .filter(Boolean);

  /*
    Expected:
    /gr/attica/chalkida-sports-center/court-1
    Club = item before court.
  */
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return "";
}


async function installVoxCourtSponsors() {

  const viewerWrap =
    document.querySelector(".viewerWrap");

  if (!viewerWrap) return;

  /* Prevent duplicate async installs */
  if (window.__vcSponsorsInstalling) return;

  const existingSponsors =
    document.querySelectorAll(".vc-sponsors");

  if (existingSponsors.length) {
    /* Safety cleanup: keep only the first one */
    existingSponsors.forEach((el, index) => {
      if (index > 0) el.remove();
    });
    return;
  }

  window.__vcSponsorsInstalling = true;

  let data;

  try {

    const base =
      import.meta.env.BASE_URL || "/";

    const response =
      await fetch(
        `${base}config/sponsors.json`,
        { cache: "no-store" }
      );

    if (!response.ok)
      throw new Error("Sponsors config unavailable");

    data = await response.json();

  } catch (_) {

    window.__vcSponsorsInstalling = false;
    return;

  }


  const clubSlug =
    vcGetCurrentClubSlug();


  const sponsors =
    data?.clubs?.[clubSlug] ||
    data?.default ||
    [];


  if (!Array.isArray(sponsors) || !sponsors.length) {
    window.__vcSponsorsInstalling = false;
    return;
  }


  const section =
    document.createElement("section");

  section.className =
    "vc-sponsors";


  section.innerHTML = `

    <div class="vc-sponsors__intro">

      <span class="vc-sponsors__eyebrow">
        CLUB PARTNERS
      </span>

      <strong>
        Sponsors
      </strong>

      <span>
        Official partners of this venue
      </span>

    </div>


    <div class="vc-sponsors__logos">

      ${sponsors.map((sponsor) => `

        <a
          class="vc-sponsor"
          href="${sponsor.url || "#"}"
          ${sponsor.url && sponsor.url !== "#" ? 'target="_blank" rel="noopener noreferrer"' : ""}
          aria-label="${sponsor.name || "Sponsor"}"
        >

          <img
            src="${sponsor.logo}"
            alt="${sponsor.name || "Sponsor"}"
          />

        </a>

      `).join("")}

    </div>

  `;


  viewerWrap.insertAdjacentElement(
    "afterend",
    section
  );

  window.__vcSponsorsInstalling = false;

}


const vcSponsorObserver =
  new MutationObserver(() => {

    installVoxCourtSponsors();

  });


const vcSponsorRoot =
  document.getElementById("app");


if (vcSponsorRoot) {

  vcSponsorObserver.observe(
    vcSponsorRoot,
    {
      childList: true,
      subtree: true
    }
  );

}


window.setTimeout(
  installVoxCourtSponsors,
  100
);







