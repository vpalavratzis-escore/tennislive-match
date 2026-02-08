import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

function route() {
  const base = import.meta.env.BASE_URL || "/";
  let path = window.location.pathname;

  if (path.startsWith(base)) {
    path = path.slice(base.length - 1);
  }

  if (path === "/" || path === "") return renderHome();
  if (path === "/live") return renderLive();
  if (path.startsWith("/v/")) return renderViewer(path);

  return renderHome();
}

window.addEventListener("popstate", route);
route();
