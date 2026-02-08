function route() {
  const base = import.meta.env.BASE_URL || "/"; // "/tennislive-match/"
  const url = new URL(window.location.href);

  // αν υπάρχει ?p=..., αυτό έχει προτεραιότητα (viewer)
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
