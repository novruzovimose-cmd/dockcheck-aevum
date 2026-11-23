import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const index = path.join(root, "index.html");
if (!fs.existsSync(index)) {
  console.error(
    "The desk has not been built. Run npm ci and npm run build, or extract the prebuilt release ZIP.",
  );
  process.exit(1);
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json",
  ".sol": "text/plain",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4173);
const server = http.createServer((req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let file;
  try {
    const uri = new URL(req.url, "http://localhost");
    file = path.resolve(
      root,
      "." +
        decodeURIComponent(uri.pathname === "/" ? "/index.html" : uri.pathname),
    );
    if (file.includes("\0")) throw Error();
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!file.startsWith(root)) {
    res.writeHead(404).end();
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Content-Length": stat.size,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else {
      const input = fs.createReadStream(file);
      input.on("error", () => res.destroy());
      res.on("close", () => input.destroy());
      input.pipe(res);
    }
  });
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "The selected port is in use. Stop the existing server or set PORT to a free port."
      : e.message,
  );
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(
    "DockCheck listening on http://" + host + ":" + server.address().port + "/",
  ),
);
