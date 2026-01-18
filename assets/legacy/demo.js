async function loadConfig() {
  const r = await fetch('/config/clubs.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Cannot load /config/clubs.json');
  return r.json();
}

function clubCard(club) {
  const courts = (club.courts || []).map(c => {
    const href = `/club/${encodeURIComponent(club.id)}/court/${encodeURIComponent(c.id)}`;
    return `<div style="margin-top:10px; display:flex; gap:10px; align-items:center; justify-content:space-between">
      <div>
        <div style="font-weight:900">${c.name || c.id}</div>
        <div style="color:var(--muted); font-size:12px">Court ID: ${c.id}</div>
      </div>
      <a class="btn small primary" href="${href}">Open</a>
    </div>`;
  }).join('');

  return `<div class="card">
    <h3 style="margin:0 0 6px">${club.name}</h3>
    <p style="margin:0 0 10px; color:var(--muted)">Club ID: ${club.id}</p>
    ${courts || '<div class="notice">No courts configured yet.</div>'}
  </div>`;
}

(async () => {
  const host = document.getElementById('clubs');
  try {
    const cfg = await loadConfig();
    host.innerHTML = (cfg.clubs || []).map(clubCard).join('');
  } catch (e) {
    host.innerHTML = `<div class="card"><h3>Error</h3><p>${e.message}</p></div>`;
  }
})();

