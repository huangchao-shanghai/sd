const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2] || 4173);
const rootDir = path.resolve(process.argv[3] || ".");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(parsed.pathname || "/");
  const cleanPath = pathname.replace(/^\/+/, "");
  const candidate = path.join(rootDir, cleanPath);
  const safePath = path.resolve(candidate);

  if (!safePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err) {
      sendFile(path.join(rootDir, "index.html"), res);
      return;
    }
    if (stat.isDirectory()) {
      sendFile(path.join(safePath, "index.html"), res);
      return;
    }
    sendFile(safePath, res);
  });
});

server.listen(port, "127.0.0.1");
