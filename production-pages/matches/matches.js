"use strict";

/* ===== VC ARCHIVE CARD PHOTOS V1 START ===== */

const VC_ARCHIVE_DEFAULT_A =
  "/tennislive-match/players/default-a.jpg";

const VC_ARCHIVE_DEFAULT_B =
  "/tennislive-match/players/default-b.jpg";


function archivedPlayerPhoto(
  match,
  side
) {
  const key =
    side === "B"
      ? "B"
      : "A";

  const metadata =
    match?.metadata || {};

  return (
    match?.[`photo${key}`] ||
    match?.[`photoUrl${key}`] ||
    metadata?.[`photo${key}`] ||
    metadata?.[`photoUrl${key}`] ||
    (
      key === "B"
        ? VC_ARCHIVE_DEFAULT_B
        : VC_ARCHIVE_DEFAULT_A
    )
  );
}

/* ===== VC ARCHIVE CARD PHOTOS V1 END ===== */

const API_URL =
  "https://api.voxcourt.com/api/matches/history?limit=1000&status=COMPLETED";

let allMatches = [];
const archiveLanguage = localStorage.getItem("voxcourt-language") || ((navigator.language || "").toLowerCase().startsWith("el") ? "el" : "en");
const archiveText = archiveLanguage === "el" ? { none:"Δεν υπάρχουν ακόμη ολοκληρωμένοι αγώνες", noneBody:"Οι ολοκληρωμένοι αγώνες θα εμφανίζονται αυτόματα εδώ.", filtered:"Δεν βρέθηκαν αγώνες με αυτά τα φίλτρα", filteredBody:"Δοκίμασε να αλλάξεις ή να καθαρίσεις τα φίλτρα.", match:"αγώνας", matches:"αγώνες", view:"Προβολή αγώνα →", final:"Τελικό", allSports:"Όλα τα αθλήματα", countries:"Όλες οι χώρες", clubs:"Όλοι οι σύλλογοι", courts:"Όλα τα γήπεδα", completed:"Ολοκληρωμένοι αγώνες VoxCourt", ready:"Το αρχείο είναι έτοιμο", unavailable:"Το αρχείο δεν είναι διαθέσιμο" } : { none:"No completed matches yet", noneBody:"Completed matches will appear here automatically.", filtered:"No matches match these filters", filteredBody:"Try changing or clearing the filters.", match:"match", matches:"matches", view:"View match →", final:"Final", allSports:"All sports", countries:"All countries", clubs:"All clubs", courts:"All courts", completed:"Completed VoxCourt matches", ready:"Archive ready", unavailable:"Archive unavailable" };
document.documentElement.lang = archiveLanguage;


function byId(id) {
  return document.getElementById(id);
}


function asString(value) {
  return value == null
    ? ""
    : String(value);
}


function parseCourtId(courtId) {
  const parts =
    asString(courtId)
      .split("/")
      .filter(Boolean);

  return {
    country: parts[0] || "",
    region: parts[1] || "",
    club: parts[2] || "",
    court: parts[3] || ""
  };
}

function matchSport(match) {
  return asString(match.sport || match.metadata?.sport || match.finalState?.sport || "tennis").toLowerCase();
}


function prettyLabel(value) {
  return asString(value)
    .replace(/-/g, " ")
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );
}


function getMatchDate(match) {
  const raw =
    Number(
      match.endedAt ||
      match.archivedAt ||
      0
    );

  return raw
    ? new Date(raw)
    : null;
}


function formatDate(match) {
  const date =
    getMatchDate(match);

  if (!date) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}


function matchDateKey(match) {
  const date =
    getMatchDate(match);

  if (!date) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function setText(element, value) {
  element.textContent =
    asString(value);
}


function makeOption(
  value,
  label
) {
  const option =
    document.createElement(
      "option"
    );

  option.value =
    value;

  option.textContent =
    label;

  return option;
}


function refillSelect(
  element,
  values,
  placeholder
) {
  const current =
    element.value;

  element.replaceChildren(
    makeOption(
      "",
      placeholder
    )
  );

  values.forEach(
    value => {
      element.appendChild(
        makeOption(
          value,
          prettyLabel(value)
        )
      );
    }
  );

  element.value =
    values.includes(current)
      ? current
      : "";
}


function renderFilterOptions() {
  const sports = [...new Set(allMatches.map(matchSport).filter(Boolean))].sort();
  const countries =
    [
      ...new Set(
        allMatches
          .map(
            match =>
              parseCourtId(
                match.courtId
              ).country
          )
          .filter(Boolean)
      )
    ].sort();

  const clubs =
    [
      ...new Set(
        allMatches
          .map(
            match =>
              parseCourtId(
                match.courtId
              ).club
          )
          .filter(Boolean)
      )
    ].sort();

  const courts =
    [
      ...new Set(
        allMatches
          .map(
            match =>
              parseCourtId(
                match.courtId
              ).court
          )
          .filter(Boolean)
      )
    ].sort();

  refillSelect(byId("sportFilter"), sports, archiveText.allSports);

  refillSelect(
    byId("countryFilter"),
    countries,
    archiveText.countries
  );

  refillSelect(
    byId("clubFilter"),
    clubs,
    archiveText.clubs
  );

  refillSelect(
    byId("courtFilter"),
    courts,
    archiveText.courts
  );
}


function getFilteredMatches() {
  const sport = byId("sportFilter").value;
  const country =
    byId("countryFilter").value;

  const club =
    byId("clubFilter").value;

  const court =
    byId("courtFilter").value;

  const playerQuery =
    byId("playerFilter")
      .value
      .trim()
      .toLocaleLowerCase();

  const date =
    byId("dateFilter").value;

  return allMatches.filter(
    match => {
      if (sport && matchSport(match) !== sport) return false;
      const location =
        parseCourtId(
          match.courtId
        );

      if (
        country &&
        location.country !== country
      ) {
        return false;
      }

      if (
        club &&
        location.club !== club
      ) {
        return false;
      }

      if (
        court &&
        location.court !== court
      ) {
        return false;
      }

      if (
        date &&
        matchDateKey(match) !== date
      ) {
        return false;
      }

      if (playerQuery) {
        const haystack =
          [
            match.nameA,
            match.nameB
          ]
            .map(asString)
            .join(" ")
            .toLocaleLowerCase();

        if (
          !haystack.includes(
            playerQuery
          )
        ) {
          return false;
        }
      }

      return true;
    }
  );
}


function makePlayerRow(
  name,
  score,
  isWinner,
  photoUrl,
  side
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    isWinner
      ? "player-row winner"
      : "player-row";


  const photo =
    document.createElement(
      "img"
    );

  photo.className =
    "match-card-player-photo";

  photo.alt =
    name || "Player";

  photo.src =
    photoUrl ||
    (
      side === "B"
        ? VC_ARCHIVE_DEFAULT_B
        : VC_ARCHIVE_DEFAULT_A
    );

  photo.onerror = () => {
    photo.onerror = null;

    photo.src =
      side === "B"
        ? VC_ARCHIVE_DEFAULT_B
        : VC_ARCHIVE_DEFAULT_A;
  };


  const playerName =
    document.createElement(
      "div"
    );

  playerName.className =
    "player-name";

  if (isWinner) {
    const dot =
      document.createElement(
        "span"
      );

    dot.className =
      "winner-dot";

    playerName.appendChild(
      dot
    );
  }

  playerName.appendChild(
    document.createTextNode(
      name || "Player"
    )
  );


  const playerScore =
    document.createElement(
      "div"
    );

  playerScore.className =
    "player-score";

  setText(
    playerScore,
    score ?? "—"
  );


  row.append(
    photo,
    playerName,
    playerScore
  );

  return row;
}


function makeMatchCard(match) {
  const article =
    document.createElement(
      "article"
    );

  article.className =
    "match-card";

  const link =
    document.createElement(
      "a"
    );

  link.className =
    "match-card-link";

  link.href =
    "/matches/match.html?id=" +
    encodeURIComponent(
      asString(match.matchId)
    );

  const top =
    document.createElement(
      "div"
    );

  top.className =
    "match-card-top";

  const date =
    document.createElement(
      "div"
    );

  date.className =
    "match-date";

  setText(
    date,
    formatDate(match)
  );

  const location =
    parseCourtId(
      match.courtId
    );

  const locationBox =
    document.createElement(
      "div"
    );

  locationBox.className =
    "match-location";

  const locationText =
    document.createElement(
      "span"
    );

  const club =
    prettyLabel(
      location.club
    );

  const court =
    prettyLabel(
      location.court
    );

  setText(
    locationText,
    [prettyLabel(matchSport(match)), club, court]
      .filter(Boolean)
      .join(" · ") ||
      "VoxCourt"
  );

  locationBox.appendChild(
    locationText
  );

  top.append(
    date,
    locationBox
  );


  const scoreboard =
    document.createElement(
      "div"
    );

  scoreboard.className =
    "match-scoreboard";

  scoreboard.append(
    makePlayerRow(
      match.nameA,
      match.setsA,
      match.winner === "A",
      archivedPlayerPhoto(
        match,
        "A"
      ),
      "A"
    ),
    makePlayerRow(
      match.nameB,
      match.setsB,
      match.winner === "B",
      archivedPlayerPhoto(
        match,
        "B"
      ),
      "B"
    )
  );


  const divider =
    document.createElement(
      "div"
    );

  divider.className =
    "match-divider";


  const bottom =
    document.createElement(
      "div"
    );

  bottom.className =
    "match-card-bottom";

  const status =
    document.createElement(
      "div"
    );

  status.className =
    "final-status";

  setText(
    status,
    [archiveText.final, match.finalScore || `${match.setsA ?? "—"}-${match.setsB ?? "—"}`, match.durationSeconds ? `${Math.max(1, Math.round(match.durationSeconds / 60))} min` : ""]
      .filter(Boolean).join(" · ")
  );

  const view =
    document.createElement(
      "div"
    );

  view.className =
    "view-match";

  setText(
    view,
    archiveText.view
  );

  bottom.append(
    status,
    view
  );

  link.append(
    top,
    scoreboard,
    divider,
    bottom
  );

  article.appendChild(
    link
  );

  return article;
}


function renderMatches() {
  const grid =
    byId("matchesGrid");

  const matches =
    getFilteredMatches();

  grid.replaceChildren();

  setText(
    byId("resultCount"),
    matches.length
  );

  setText(
    byId("resultLabel"),
    matches.length === 1
      ? archiveText.match
      : archiveText.matches
  );

  if (!matches.length) {
    const message =
      document.createElement(
        "div"
      );

    message.className =
      "archive-message";

    const strong =
      document.createElement(
        "strong"
      );

    setText(
      strong,
      allMatches.length
        ? archiveText.filtered
        : archiveText.none
    );

    const text =
      document.createElement(
        "span"
      );

    setText(
      text,
      allMatches.length
        ? archiveText.filteredBody
        : archiveText.noneBody
    );

    message.append(
      strong,
      text
    );

    grid.appendChild(
      message
    );

    return;
  }

  matches.forEach(
    match => {
      grid.appendChild(
        makeMatchCard(match)
      );
    }
  );
}


function applyFilters() {
  renderMatches();
}


function clearFilters() {
  byId("sportFilter").value = "";
  byId("countryFilter").value = "";
  byId("clubFilter").value = "";
  byId("courtFilter").value = "";
  byId("playerFilter").value = "";
  byId("dateFilter").value = "";

  renderMatches();
}


async function loadMatches() {
  const grid =
    byId("matchesGrid");

  grid.innerHTML =
    '<div class="archive-message">Loading matches…</div>';

  byId("refreshMatches").disabled =
    true;

  try {
    const response =
      await fetch(
        API_URL,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    allMatches =
      Array.isArray(data.items)
        ? data.items
        : [];

    allMatches.sort(
      (a, b) =>
        Number(
          b.endedAt ||
          b.archivedAt ||
          0
        ) -
        Number(
          a.endedAt ||
          a.archivedAt ||
          0
        )
    );

    setText(
      byId("archiveCount"),
      allMatches.length
    );

    setText(
      byId("archiveStatus"),
      allMatches.length
        ? archiveText.completed
        : archiveText.ready
    );

    renderFilterOptions();
    renderMatches();

  } catch (error) {
    console.error(
      "Failed to load match archive:",
      error
    );

    setText(
      byId("archiveCount"),
      "—"
    );

    setText(
      byId("archiveStatus"),
      archiveText.unavailable
    );

    grid.innerHTML =
      '<div class="archive-message"><strong>Could not load the archive</strong><span>Please try again.</span></div>';

  } finally {
    byId("refreshMatches").disabled =
      false;
  }
}


[
  "sportFilter",
  "countryFilter",
  "clubFilter",
  "courtFilter",
  "dateFilter"
].forEach(
  id => {
    byId(id).addEventListener(
      "change",
      applyFilters
    );
  }
);


byId("playerFilter")
  .addEventListener(
    "input",
    applyFilters
  );


byId("clearFilters")
  .addEventListener(
    "click",
    clearFilters
  );


byId("refreshMatches")
  .addEventListener(
    "click",
    loadMatches
  );


setText(
  byId("year"),
  new Date().getFullYear()
);

document.querySelectorAll("[data-language]").forEach(button => {
  button.classList.toggle("active", button.dataset.language === archiveLanguage);
  button.addEventListener("click", () => {
    localStorage.setItem("voxcourt-language", button.dataset.language);
    location.reload();
  });
});

byId("mobileNavToggle")?.addEventListener("click", event => {
  const open = document.body.classList.toggle("archive-menu-open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});


loadMatches();
