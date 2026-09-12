import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const siteRoot = resolve("dist");
const archiveRoot = resolve("../production-pages/matches");
const types = {
  ".css":"text/css; charset=utf-8", ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png",
  ".svg":"image/svg+xml", ".webp":"image/webp", ".woff2":"font/woff2",
};

function safeFile(root, relative) {
  const candidate = resolve(root, relative.replace(/^\/+/, ""));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try { return statSync(candidate).isFile() ? candidate : null; } catch { return null; }
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  let file = null;

  if (pathname.startsWith("/matches/")) {
    file = safeFile(archiveRoot, pathname.slice("/matches/".length) || "index.html");
  } else if (pathname === "/assets/logoText.png") {
    file = safeFile(siteRoot, "logoText.png");
  } else if (pathname.startsWith("/tennislive-match/")) {
    file = safeFile(siteRoot, pathname.slice("/tennislive-match/".length));
    if (!file) file = safeFile(siteRoot, "index.html");
  }

  if (!file) {
    response.writeHead(404, { "content-type":"text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control":"no-store",
  });
  createReadStream(file).pipe(response);
}).listen(4173, "127.0.0.1");
