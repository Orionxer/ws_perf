const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
};

const STATIC_DIR = path.join(__dirname, "dashboard", "dist");

function serveStaticFile(req, res) {
  const clientAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[HTTP] ${req.method} ${req.url} from ${clientAddress}`);

  let filePath;
  let baseDir;

  // Handle /resource/ paths
  if (req.url.startsWith('/resource/')) {
    baseDir = path.join(__dirname, 'resource');
    filePath = path.join(baseDir, req.url.replace('/resource/', ''));
    
    // Path traversal guard
    if (!filePath.startsWith(baseDir)) {
      console.log(`[HTTP] 403 Forbidden: ${req.url} from ${clientAddress} (path traversal attempt)`);
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
  } else {
    // Existing logic for dashboard/dist/
    baseDir = STATIC_DIR;
    filePath = path.join(STATIC_DIR, req.url === "/" ? "/index.html" : req.url);
  }

  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log(`[HTTP] 404 Not Found: ${req.url} from ${clientAddress}`);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    console.log(`[HTTP] 200 OK: ${req.url} (${data.length} bytes) from ${clientAddress}`);
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}

const http = require("http");
const server = http.createServer((req, res) => {
  serveStaticFile(req, res);
});

server.listen(9999, "127.0.0.1", () => {
  console.log(`Server listening on http://127.0.0.1:9999`);
});
