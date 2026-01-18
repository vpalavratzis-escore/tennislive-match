import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

function pathOnly() {
  const u = new URL(window.location.href);
  return u.pathname;
}

function route() {
  const path = pathOnly();

  // Marketing home
  if (path === "/") return renderHome();

  // Finder directory
  if (path === "/live") return renderLive();

  // Viewer: /v/<country>/<city>/<club>/<court>
  if (path.startsWith("/v/")) return renderViewer(path);

  // fallback
  return renderHome();
}

window.addEventListener("popstate", route);
route();
