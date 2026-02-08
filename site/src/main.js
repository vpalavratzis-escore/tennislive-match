import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

function getPath() {
  const base = import.meta.env.BASE_URL || "/";
  const url = new URL(window.location.href);

  // αν ήρθαμε από 404 redirect
  if (url.searchParams.has("p")) {
    return decodeURIComponent(url.searchParams.get("p") || "/");
  }
  

  let path = url.pathname;

  if (path.startsWith(base)) {
    path = path.slice(base.length - 1);
  }

  return path || "/";
}

function route() {
  let path = getPath();

  path = path.replace(/\/+$/, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();
  if (path.startsWith("/v/")) return renderViewer(path);

  return renderHome();
}

window.addEventListener("popstate", route);
route();
