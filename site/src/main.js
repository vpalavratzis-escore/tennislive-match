import "./style.css";
import "./home-production.css";
import "./find-courts-production.css";
import "./viewer-production.css";

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
import { renderController } from "./pages/controller.js";
import "./viewer-layout-final.css";

// ====== Router ======
function route() {
  const base = import.meta.env.BASE_URL || "/"; // "/tennislive-match/"
  const url = new URL(window.location.href);

  // ?p=... έχει προτεραιότητα (viewer deep link)
  const p = url.searchParams.get("p");

  if (p) {
    const decoded = decodeURIComponent(p);
    const viewerParts = decoded
      .split("/")
      .filter(Boolean);

    /*
     * A real viewer URL needs country/city/club/court.
     * Do NOT interpret ?p=/live as a court.
     */
    if (
      viewerParts.length >= 4 &&
      viewerParts[0] !== "live"
    ) {
      return renderViewer(decoded);
    }

    url.searchParams.delete("p");

    history.replaceState(
      {},
      "",
      url.pathname
    );
  }

  // normal pages (home/live) με base prefix
  let path = url.pathname;

  if (path.startsWith(base)) {
    path = path.slice(base.length - 1); // "/tennislive-match/live" -> "/live"
  }

  path = path.replace(/\/+$/, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();
  if (path.startsWith("/control/")) return renderController(path.slice(9).split("/"));

  // fallback
  return renderHome();
}

// ====== SPA navigation ======
function onLinkClick(e) {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  ) return;

  const a = e.target.closest("a");
  if (!a) return;

  const href = a.getAttribute("href");
  if (!href) return;

  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;

  const target = new URL(a.href, window.location.href);
  const spaRoot = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "") || "/";
  const isSpaPath = spaRoot === "/"
    ? target.origin === window.location.origin
    : target.origin === window.location.origin &&
      (target.pathname === spaRoot || target.pathname.startsWith(`${spaRoot}/`));

  // Root-level applications such as /matches/ and /members/ own their
  // navigation. Only links inside this SPA are handled with pushState.
  if (!isSpaPath) return;

  e.preventDefault();
  history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
  route();
}

// ====== Start ======
window.addEventListener("popstate", route);
window.addEventListener("voxcourt:language", route);
document.addEventListener("click", onLinkClick);

// ΚΑΛΕΣΕ ΤΟ ΤΩΡΑ
route();
