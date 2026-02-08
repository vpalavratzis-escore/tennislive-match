import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderLive } from "./pages/live.js";
import { renderViewer } from "./pages/viewer.js";

function route() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = window.location.pathname.replace(base, "") || "/";

  if (path === "/") return renderHome();
  if (path === "/live") return renderLive();
  if (path.startsWith("/v/")) return renderViewer(path);

  return renderHome();
}

window.addEventListener("popstate", route);
route();
