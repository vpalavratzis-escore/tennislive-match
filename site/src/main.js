import "./style.css";

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
