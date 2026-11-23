import http from "node:http";
import path from "node:path";
import fs from "node:fs";
const root = path.resolve("dist"),
  port = Number(process.env.PORT || 4173);
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
http
  .createServer((req, res) => {
    let file;
    try {
      const url = new URL(req.url, "http://localhost");
      file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log("DockCheck listening on port " + port),
  );
