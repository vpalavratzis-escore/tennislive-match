const API = "https://api.voxcourt.com";

function eventId() {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

export function renderController(parts) {
  const app = document.getElementById("app");
  const base = import.meta.env.BASE_URL || "/";
  const court = parts.filter(Boolean).slice(0, 4);
  if (court.length !== 4) {
    app.innerHTML = `<main class="controller-shell"><h1>Court required</h1><p>Open the controller from an assigned court.</p><a href="${base}live">Find a court</a></main>`;
    return;
  }
  const path = court.map(encodeURIComponent).join("/");
  const deviceId = localStorage.vcControllerDevice || (localStorage.vcControllerDevice = crypto.randomUUID());
  app.innerHTML = `<div class="controller-shell">
    <header class="controller-head"><a href="${base}"><img src="${base}logoText.png" alt="VoxCourt"></a><div><b>Score controller</b><span>${court.join(" · ")}</span></div><span id="connection" class="controller-connection">Connecting</span></header>
    <main class="controller-main"><section class="controller-score"><div><span id="serverA">●</span><strong id="nameA">Player A</strong><b id="scoreA">0</b></div><div><span id="serverB">●</span><strong id="nameB">Player B</strong><b id="scoreB">0</b></div><p id="matchState">PRE-MATCH</p></section>
    <section class="controller-points"><button data-action="POINT_A">PLAYER / TEAM A <strong>+ POINT</strong></button><button data-action="POINT_B">PLAYER / TEAM B <strong>+ POINT</strong></button></section>
    <section class="controller-actions"><button data-action="UNDO">Undo</button><button data-action="MARK_HIGHLIGHT">Highlight</button><button data-action="CHANGE_SERVER">Change server</button><button id="lifecycle" data-action="START_MATCH">Start match</button></section>
    <p id="feedback" class="controller-feedback">Secure court session required.</p></main></div>`;
  let token = sessionStorage.getItem(`vc-token:${path}`) || "";
  let current = {};
  const feedback = app.querySelector("#feedback");
  async function authenticate() {
    if (token) return true;
    const key = window.prompt("Enter the court controller access key");
    if (!key) return false;
    const r = await fetch(`${API}/api/controller/session/${path}`, {method:"POST", headers:{"X-API-Key":key}});
    if (!r.ok) throw new Error("Access key rejected");
    token = (await r.json()).token;
    sessionStorage.setItem(`vc-token:${path}`, token);
    return true;
  }
  function paint(s) {
    current = s || current;
    for (const side of ["A", "B"]) {
      app.querySelector(`#name${side}`).textContent = current[`name${side}`] || `Player ${side}`;
      app.querySelector(`#score${side}`).textContent = `${current[`sets${side}`] || 0}  ${current[`games${side}`] || 0}  ${current[`point${side}`] || "0"}`;
      app.querySelector(`#server${side}`).style.visibility = current.server === side ? "visible" : "hidden";
    }
    const live = ["LIVE","PLAYING","IN_PROGRESS"].includes(String(current.matchStatus || "").toUpperCase());
    app.querySelector("#matchState").textContent = live ? "LIVE" : (current.matchStatus || "PRE-MATCH");
    const lifecycle = app.querySelector("#lifecycle"); lifecycle.dataset.action = live ? "END_MATCH" : "START_MATCH"; lifecycle.textContent = live ? "End match" : "Start match";
  }
  async function refresh() {
    try { const r = await fetch(`${API}/api/state/${path}`, {cache:"no-store"}); if (!r.ok) throw new Error(); paint(await r.json()); app.querySelector("#connection").textContent="Connected"; }
    catch { app.querySelector("#connection").textContent="Offline"; }
  }
  app.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!(await authenticate())) return;
      const r = await fetch(`${API}/api/score-actions/${path}`, {method:"POST", headers:{"Content-Type":"application/json","X-Controller-Token":token}, body:JSON.stringify({action:button.dataset.action,eventId:eventId(),source:"web",deviceId})});
      if (r.status === 401) { token=""; sessionStorage.removeItem(`vc-token:${path}`); throw new Error("Session expired—try again"); }
      const body = await r.json(); if (!r.ok) throw new Error(body.detail || "Action failed"); paint(body.state); feedback.textContent = body.duplicate ? "Duplicate ignored safely." : `${button.dataset.action.replaceAll("_", " ")} saved`;
    } catch (error) { feedback.textContent = error.message; } finally { button.disabled = false; }
  }));
  refresh(); setInterval(refresh, 3000);
}
