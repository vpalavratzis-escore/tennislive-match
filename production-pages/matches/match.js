"use strict";

const API_BASE =
  "https://api.voxcourt.com/api/matches/history/";

const VC_HISTORY_API_ORIGIN =
  new URL(API_BASE).origin;



function byId(id) {
  return document.getElementById(id);
}


function asString(value) {
  return value == null
    ? ""
    : String(value);
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


function formatDate(value) {
  const number =
    Number(value || 0);

  if (!number) {
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
  ).format(
    new Date(number)
  );
}


function formatDuration(seconds) {
  const value =
    Math.max(
      0,
      Number(seconds || 0)
    );

  if (!value) {
    return "—";
  }

  const hours =
    Math.floor(
      value / 3600
    );

  const minutes =
    Math.floor(
      (value % 3600) / 60
    );

  if (hours) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}


function setText(element, value) {
  element.textContent =
    asString(value);
}


/* ===== VC MATCH DETAIL DIRECT HELPERS V4 START ===== */

const VC_DEFAULT_PHOTO_A =
  "/tennislive-match/players/default-a.jpg";

const VC_DEFAULT_PHOTO_B =
  "/tennislive-match/players/default-b.jpg";


function vcFirstValue(...values) {
  for (const value of values) {
    const text =
      asString(value).trim();

    if (text) {
      return text;
    }
  }

  return "";
}


function resolveArchivedPlayerPhoto(
  match,
  side
) {
  const key =
    side === "B"
      ? "B"
      : "A";

  const fallback =
    key === "B"
      ? VC_DEFAULT_PHOTO_B
      : VC_DEFAULT_PHOTO_A;

  const metadata =
    match?.metadata || {};

  const players =
    match?.players ||
    metadata?.players ||
    {};

  const player =
    match?.[`player${key}`] ||
    metadata?.[`player${key}`] ||
    players?.[key] ||
    players?.[key.toLowerCase()] ||
    {};

  return vcFirstValue(
    match?.[`photo${key}`],
    match?.[`photoUrl${key}`],
    match?.[`playerPhoto${key}`],
    match?.[`avatar${key}`],
    match?.[`avatarUrl${key}`],

    metadata?.[`photo${key}`],
    metadata?.[`photoUrl${key}`],
    metadata?.[`playerPhoto${key}`],
    metadata?.[`avatar${key}`],
    metadata?.[`avatarUrl${key}`],

    player?.photo,
    player?.photoUrl,
    player?.avatar,
    player?.avatarUrl,
    player?.image,
    player?.imageUrl,

    fallback
  );
}


function vcEventSide(event) {
  const side =
    asString(
      event?.metadata?.scoringSide ||
      event?.scoringSide ||
      ""
    )
      .trim()
      .toUpperCase();

  return (
    side === "A" ||
    side === "B"
  )
    ? side
    : "";
}


function vcHasSetScore(state) {
  return Boolean(
    state &&
    state.setsA != null &&
    state.setsB != null
  );
}


function vcSetTotal(state) {
  if (!vcHasSetScore(state)) {
    return 0;
  }

  return (
    Number(state.setsA || 0) +
    Number(state.setsB || 0)
  );
}


function vcSetNumberForEvent(event) {
  const before =
    event?.before || null;

  const after =
    event?.after || null;

  /*
   * Best source:
   * the event belongs to whichever set was active
   * BEFORE the scoring action happened.
   */
  if (vcHasSetScore(before)) {
    return Math.max(
      1,
      vcSetTotal(before) + 1
    );
  }

  if (vcHasSetScore(after)) {
    const total =
      vcSetTotal(after);

    const type =
      eventType(event);

    /*
     * A SET event represents the set that just ended.
     */
    if (type === "SET") {
      return Math.max(
        1,
        total
      );
    }

    /*
     * Some engines close a set on the GAME event and
     * immediately reset games to 0-0.
     */
    if (
      type === "GAME" &&
      Number(after.gamesA || 0) === 0 &&
      Number(after.gamesB || 0) === 0 &&
      total > 0
    ) {
      return total;
    }

    return Math.max(
      1,
      total + 1
    );
  }

  return 1;
}


function vcSetsScoreEnteringEvent(event) {
  const state =
    vcHasSetScore(event?.before)
      ? event.before
      : event?.after;

  if (!vcHasSetScore(state)) {
    return "";
  }

  return (
    `${Number(state.setsA || 0)}` +
    "-" +
    `${Number(state.setsB || 0)}`
  );
}

/* ===== VC MATCH DETAIL DIRECT HELPERS V4 END ===== */

function makeDetailPlayer(
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
      ? "detail-player winner"
      : "detail-player";


  const photo =
    document.createElement(
      "div"
    );

  photo.className =
    "detail-player-photo";


  const image =
    document.createElement(
      "img"
    );

  image.alt =
    name || "Player";

  image.src =
    photoUrl ||
    (
      side === "B"
        ? VC_DEFAULT_PHOTO_B
        : VC_DEFAULT_PHOTO_A
    );

  image.onerror = () => {
    image.onerror = null;

    image.src =
      side === "B"
        ? VC_DEFAULT_PHOTO_B
        : VC_DEFAULT_PHOTO_A;
  };

  photo.appendChild(
    image
  );


  const player =
    document.createElement(
      "div"
    );

  player.className =
    "detail-player-name";

  if (isWinner) {
    const dot =
      document.createElement(
        "span"
      );

    dot.className =
      "winner-dot";

    player.appendChild(
      dot
    );
  }

  player.appendChild(
    document.createTextNode(
      name || "Player"
    )
  );


  const result =
    document.createElement(
      "div"
    );

  result.className =
    "detail-player-score";

  setText(
    result,
    score ?? "—"
  );


  row.append(
    photo,
    player,
    result
  );

  return row;
}


function renderHero(match) {
  const hero =
    byId("matchHero");

  hero.replaceChildren();

  const location =
    parseCourtId(
      match.courtId
    );


  const meta =
    document.createElement(
      "div"
    );

  meta.className =
    "detail-meta";


  const final =
    document.createElement(
      "span"
    );

  final.className =
    "final-pill";

  setText(
    final,
    "Final"
  );


  const date =
    document.createElement(
      "span"
    );

  setText(
    date,
    formatDate(
      match.endedAt ||
      match.archivedAt
    )
  );


  const locationText =
    document.createElement(
      "span"
    );

  setText(
    locationText,
    [
      prettyLabel(
        location.country
      ),
      prettyLabel(
        location.club
      ),
      prettyLabel(
        location.court
      )
    ]
      .filter(Boolean)
      .join(" · ")
  );


  meta.append(
    final,
    date,
    locationText
  );


  const scoreboard =
    document.createElement(
      "div"
    );

  scoreboard.className =
    "detail-scoreboard";


  scoreboard.append(
    makeDetailPlayer(
      match.nameA,
      match.setsA,
      match.winner === "A",
      resolveArchivedPlayerPhoto(
        match,
        "A"
      ),
      "A"
    )
  );


  const divider =
    document.createElement(
      "div"
    );

  divider.className =
    "detail-divider";

  scoreboard.appendChild(
    divider
  );


  scoreboard.append(
    makeDetailPlayer(
      match.nameB,
      match.setsB,
      match.winner === "B",
      resolveArchivedPlayerPhoto(
        match,
        "B"
      ),
      "B"
    )
  );


  hero.append(
    meta,
    scoreboard
  );


  document.title =
    `${match.nameA || "Player"} vs ${match.nameB || "Player"} — VoxCourt`;
}


function addInfoCard(
  container,
  label,
  value
) {
  const card =
    document.createElement(
      "div"
    );

  card.className =
    "info-card";

  const title =
    document.createElement(
      "span"
    );

  title.className =
    "info-label";

  setText(
    title,
    label
  );

  const body =
    document.createElement(
      "div"
    );

  body.className =
    "info-value";

  setText(
    body,
    value || "—"
  );

  card.append(
    title,
    body
  );

  container.appendChild(
    card
  );
}


function renderOverview(match) {
  const grid =
    byId("overviewGrid");

  grid.replaceChildren();

  const location =
    parseCourtId(
      match.courtId
    );

  addInfoCard(
    grid,
    "Result",
    match.finalScore ||
      `${match.setsA ?? "—"}-${match.setsB ?? "—"}`
  );

  addInfoCard(
    grid,
    "Winner",
    match.winnerName ||
      "—"
  );

  addInfoCard(
    grid,
    "Format",
    match.formatLabel ||
      match.metadata?.formatLabel ||
      "—"
  );

  addInfoCard(
    grid,
    "Duration",
    formatDuration(
      match.durationSeconds
    )
  );

  addInfoCard(
    grid,
    "Club",
    prettyLabel(
      location.club
    ) || "—"
  );

  addInfoCard(
    grid,
    "Court",
    prettyLabel(
      location.court
    ) || "—"
  );

  addInfoCard(
    grid,
    "Started",
    formatDate(
      match.startedAt
    )
  );

  addInfoCard(
    grid,
    "Finished",
    formatDate(
      match.endedAt
    )
  );
}


function eventType(event) {
  return asString(
    event.type ||
    event.eventType ||
    "EVENT"
  ).toUpperCase();
}


function eventTitle(event) {
  const type =
    eventType(event);

  const metadata =
    event.metadata || {};

  const side =
    asString(
      metadata.scoringSide
    );

  const nameA =
    asString(
      metadata.nameA
    );

  const nameB =
    asString(
      metadata.nameB
    );

  if (side === "A" && nameA) {
    return `${type} · ${nameA}`;
  }

  if (side === "B" && nameB) {
    return `${type} · ${nameB}`;
  }

  return type;
}


function scoreFromState(state) {
  if (!state) {
    return "";
  }

  const parts = [];

  if (
    state.pointA != null &&
    state.pointB != null
  ) {
    parts.push(
      `${state.pointA}-${state.pointB}`
    );
  }

  if (
    state.gamesA != null &&
    state.gamesB != null
  ) {
    parts.push(
      `Games ${state.gamesA}-${state.gamesB}`
    );
  }

  if (
    state.setsA != null &&
    state.setsB != null
  ) {
    parts.push(
      `Sets ${state.setsA}-${state.setsB}`
    );
  }

  return parts.join(" · ");
}


function eventTimestamp(event) {
  return Number(
    event.createdAt ||
    event.timestamp ||
    event.ts ||
    0
  );
}


function renderTimeline(match) {
  const container =
    byId("timelineList");

  container.replaceChildren();

  const events =
    Array.isArray(match.events)
      ? match.events
      : [];


  if (!events.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "archive-message";

    empty.innerHTML =
      "<strong>No timeline events available</strong><span>This match has no archived events.</span>";

    container.appendChild(
      empty
    );

    return;
  }


  let currentSet =
    null;


  events.forEach(
    event => {

      const setNumber =
        vcSetNumberForEvent(
          event
        );


      /*
       * Permanent SET divider.
       * Created ONCE during render.
       */
      if (
        setNumber !==
        currentSet
      ) {
        currentSet =
          setNumber;


        const setHeader =
          document.createElement(
            "section"
          );

        setHeader.className =
          "timeline-set-header";


        const kicker =
          document.createElement(
            "div"
          );

        kicker.className =
          "timeline-set-kicker";

        setText(
          kicker,
          `SET ${setNumber}`
        );


        const heading =
          document.createElement(
            "div"
          );

        heading.className =
          "timeline-set-heading";

        setText(
          heading,
          `Set ${setNumber}`
        );


        const description =
          document.createElement(
            "div"
          );

        description.className =
          "timeline-set-description";

        const enteringScore =
          vcSetsScoreEnteringEvent(
            event
          );

        setText(
          description,
          enteringScore
            ? `Match sets entering this section: ${enteringScore}`
            : "Point-by-point action"
        );


        setHeader.append(
          kicker,
          heading,
          description
        );

        container.appendChild(
          setHeader
        );
      }


      const row =
        document.createElement(
          "article"
        );

      const typeName =
        eventType(
          event
        );

      row.className =
        "timeline-event " +
        `timeline-event--${typeName.toLowerCase()}`;


      const leading =
        document.createElement(
          "div"
        );

      leading.className =
        "timeline-leading";


      const type =
        document.createElement(
          "div"
        );

      type.className =
        "timeline-type";

      setText(
        type,
        typeName
      );


      const side =
        vcEventSide(
          event
        );

      if (
        side === "A" ||
        side === "B"
      ) {
        const avatar =
          document.createElement(
            "img"
          );

        avatar.className =
          "timeline-player-photo";

        avatar.alt =
          side === "A"
            ? (match.nameA || "Player A")
            : (match.nameB || "Player B");

        avatar.src =
          resolveArchivedPlayerPhoto(
            match,
            side
          );

        avatar.onerror = () => {
          avatar.onerror = null;

          avatar.src =
            side === "B"
              ? VC_DEFAULT_PHOTO_B
              : VC_DEFAULT_PHOTO_A;
        };

        leading.appendChild(
          avatar
        );
      }


      leading.appendChild(
        type
      );


      const main =
        document.createElement(
          "div"
        );

      main.className =
        "timeline-main";


      const title =
        document.createElement(
          "div"
        );

      title.className =
        "timeline-title";


      const playerName =
        side === "A"
          ? asString(match.nameA)
          : side === "B"
            ? asString(match.nameB)
            : "";


      setText(
        title,
        playerName
          ? `${typeName} · ${playerName}`
          : eventTitle(event)
      );


      const score =
        document.createElement(
          "div"
        );

      score.className =
        "timeline-score";

      setText(
        score,
        scoreFromState(
          event.after
        )
      );


      main.append(
        title,
        score
      );


      const time =
        document.createElement(
          "div"
        );

      time.className =
        "timeline-time";


      const timestamp =
        eventTimestamp(
          event
        );

      setText(
        time,
        timestamp
          ? new Date(timestamp)
              .toLocaleTimeString(
                [],
                {
                  hour:
                    "2-digit",
                  minute:
                    "2-digit",
                  second:
                    "2-digit"
                }
              )
          : ""
      );


      row.append(
        leading,
        main,
        time
      );


      container.appendChild(
        row
      );
    }
  );
}


function replayInfo(event) {
  const metadata =
    event.metadata || {};

  return metadata.replay || {};
}


function hasReplay(event) {
  const replay =
    replayInfo(event);

  const type =
    eventType(event);

  const eventId =
    asString(
      event?.eventId
    ).trim();

  const stored =
    Boolean(
      event.clipUrl ||
      event.replayUrl ||
      metadataUrl(event) ||
      replay.url ||
      replay.clipUrl ||
      event.clip
    );

  return stored;
}


function metadataUrl(event) {
  const metadata =
    event.metadata || {};

  return (
    metadata.clipUrl ||
    metadata.replayUrl ||
    ""
  );
}


function getReplayUrl(event) {
  const replay =
    replayInfo(event);

  const stored =
    event.clipUrl ||
    event.replayUrl ||
    metadataUrl(event) ||
    replay.url ||
    replay.clipUrl ||
    "";

  if (stored) {
    return stored;
  }

  return "";
}


function getThumbnailUrl(event) {
  const eventId =
    asString(
      event?.eventId
    ).trim();

  const metadata =
    event?.metadata || {};

  const stored =
    event?.thumbnailUrl ||
    metadata?.thumbnailUrl ||
    "";

  if (stored) {
    return stored;
  }

  return "";
}


function renderHighlights(match) {
  const container =
    byId("highlightsGrid");

  container.replaceChildren();

  const events =
    Array.isArray(match.events)
      ? match.events
      : [];

  const highlights =
    events.filter(
      hasReplay
    );

  if (!highlights.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "archive-message";

    empty.innerHTML =
      "<strong>No saved highlights</strong><span>Highlights will appear here when replay media is attached to the archived match.</span>";

    container.appendChild(
      empty
    );

    return;
  }

  highlights.forEach(
    event => {
      const card =
        document.createElement(
          "a"
        );

      card.className =
        "highlight-card";

      const url =
        getReplayUrl(event);

      if (url) {
        card.href = url;
        card.target = "_blank";
        card.rel = "noopener";
      }


      const preview =
        document.createElement(
          "div"
        );

      preview.className =
        "highlight-preview";


      const thumbUrl =
        getThumbnailUrl(
          event
        );


      if (thumbUrl) {
        const image =
          document.createElement(
            "img"
          );

        image.className =
          "highlight-preview-image";

        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.src = thumbUrl;

        preview.appendChild(
          image
        );
      }


      const play =
        document.createElement(
          "span"
        );

      play.className =
        "highlight-preview-play";

      setText(
        play,
        "▶"
      );

      preview.appendChild(
        play
      );


      const copy =
        document.createElement(
          "div"
        );

      copy.className =
        "highlight-copy";


      const title =
        document.createElement(
          "strong"
        );

      setText(
        title,
        eventTitle(event)
      );


      const description =
        document.createElement(
          "span"
        );

      setText(
        description,
        scoreFromState(
          event.after
        ) ||
        "Replay"
      );


      copy.append(
        title,
        description
      );


      card.append(
        preview,
        copy
      );


      container.appendChild(
        card
      );
    }
  );
}


function activateTabs() {
  document
    .querySelectorAll(
      ".match-tab"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const target =
              button.dataset.tab;

            document
              .querySelectorAll(
                ".match-tab"
              )
              .forEach(
                item =>
                  item.classList.toggle(
                    "active",
                    item === button
                  )
              );

            document
              .querySelectorAll(
                ".tab-panel"
              )
              .forEach(
                panel =>
                  panel.classList.toggle(
                    "active",
                    panel.dataset.panel === target
                  )
              );
          }
        );
      }
    );
}


function showError(message) {
  const hero =
    byId("matchHero");

  hero.innerHTML = "";

  const box =
    document.createElement(
      "div"
    );

  box.className =
    "archive-message";

  const strong =
    document.createElement(
      "strong"
    );

  setText(
    strong,
    "Match unavailable"
  );

  const text =
    document.createElement(
      "span"
    );

  setText(
    text,
    message
  );

  box.append(
    strong,
    text
  );

  hero.appendChild(
    box
  );
}


async function loadMatch() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const matchId =
    asString(
      params.get("id")
    ).trim();

  if (!matchId) {
    showError(
      "No match ID was provided."
    );

    return;
  }

  try {
    const response =
      await fetch(
        API_BASE +
        encodeURIComponent(matchId),
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

    if (
      !data.ok ||
      !data.match
    ) {
      showError(
        "This match does not exist in the archive."
      );

      return;
    }

    const match =
      data.match;

    renderHero(match);
    renderOverview(match);
    renderHighlights(match);
    renderTimeline(match);

    byId("matchContent").hidden =
      false;

  } catch (error) {
    console.error(
      "Failed to load match:",
      error
    );

    showError(
      "The match could not be loaded. Please try again."
    );
  }
}


setText(
  byId("year"),
  new Date().getFullYear()
);


activateTabs();
loadMatch();
