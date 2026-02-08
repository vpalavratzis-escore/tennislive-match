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
  const url = new URL(window.location.href);
  const base = import.meta.env.BASE_URL || "/";

  // path from ?p=... or from normal URL
  let path = url.searchParams.has("p")
    ? decodeURIComponent(url.searchParams.get("p") || "/")
    : url.pathname;

  // strip /tennislive-match prefix if present
  if (path.startsWith(base)) path = path.slice(base.length - 1);

  // normalize
  path = (path || "/").replace(/\/+$/, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();

  // Viewer: /v/<country>/<city>/<club>/<court>
  if (path.startsWith("/v/")) return renderViewer(path);

  // ALSO accept: /<country>/<city>/<club>/<court>
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 4) return renderViewer("/v/" + parts.join("/"));

  return renderHome();
}

window.addEventListener("popstate", route);
route();
