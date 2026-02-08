import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

function route() {
  const base = import.meta.env.BASE_URL || "/"; // π.χ. "/tennislive-match/"
  let path = window.location.pathname;

  // Κόβει το base prefix ώστε να δουλεύει σε GitHub Pages
  if (path.startsWith(base)) {
    path = path.slice(base.length - 1); // "/tennislive-match/live" -> "/live"
  }

  // Normalization
  path = path.replace(/\/+$/, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();
  if (path.startsWith("/v/")) return renderViewer(path);

  return renderHome();
}

window.addEventListener("popstate", route);
route();
