const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const HOST = "0.0.0.0";
const PORT = 8080;
const HEARTBEAT_INTERVAL_MS = 10000;
const STATIC_DIR = path.join(__dirname, "dashboard", "dist");
const RESOURCE_DIR = path.join(__dirname, "resource");
const VIDEO_FILE_NAME = "starship.mp4";
const VIDEO_FILE_PATH = path.join(RESOURCE_DIR, VIDEO_FILE_NAME);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};

if (!fs.existsSync(RESOURCE_DIR)) {
  fs.mkdirSync(RESOURCE_DIR, { recursive: true });
}

function serveStaticFile(req, res) {
  const clientAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[HTTP] ${req.method} ${req.url} from ${clientAddress}`);
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  let filePath;
  let baseDir;

  if (pathname.startsWith("/resource/")) {
    baseDir = RESOURCE_DIR;
    filePath = path.join(baseDir, pathname.replace("/resource/", ""));

    if (!filePath.startsWith(baseDir)) {
      console.log(`[HTTP] 403 Forbidden: ${req.url} from ${clientAddress} (path traversal attempt)`);
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
  } else {
    baseDir = STATIC_DIR;
    filePath = path.join(STATIC_DIR, pathname === "/" ? "/index.html" : pathname);
  }

  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  fs.stat(filePath, (err, stat) => {
    if (err) {
      console.log(`[HTTP] 404 Not Found: ${req.url} from ${clientAddress}`);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : total - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.writeHead(416, {
          "Content-Range": `bytes */${total}`,
        });
        res.end();
        return;
      }

      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on("error", (streamErr) => {
        console.error(`[HTTP] Stream error for ${req.url}: ${streamErr.message}`);
        res.end();
      });
      stream.pipe(res);
      return;
    }

    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Length": total,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", (streamErr) => {
      console.error(`[HTTP] Stream error for ${req.url}: ${streamErr.message}`);
      res.end();
    });
    stream.pipe(res);
  });
}

const clientsById = new Map();
const clientsBySocket = new Map();
const monitors = new Set();
let heartbeatEnabled = true;

function makeClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function isMonitorConnection(req) {
  const userAgent = req.headers["user-agent"] || "";
  const origin = req.headers.origin;
  const hasOrigin = origin !== undefined;

  const isBrowser = (
    userAgent.includes("Mozilla") ||
    userAgent.includes("WebKit") ||
    userAgent.includes("Gecko") ||
    userAgent.includes("Trident")
  ) && !userAgent.includes("node") &&
    !userAgent.includes("curl") &&
    !userAgent.includes("wget");

  const isMobile = (
    userAgent.includes("Mobile") ||
    userAgent.includes("Android") ||
    userAgent.includes("iPhone") ||
    userAgent.includes("iPad") ||
    userAgent.includes("iPod") ||
    userAgent.includes("webOS") ||
    userAgent.includes("BlackBerry")
  );

  return isBrowser && (isMobile || hasOrigin);
}

function sendText(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

function markConnectionAlive(ws) {
  ws.isAlive = true;
}

function broadcastToMonitors(message) {
  for (const monitor of monitors) {
    sendText(monitor, message);
  }
}

function syncHeartbeatStatus(targetWs = null) {
  const message = `[SYSTEM] HEARTBEAT ${heartbeatEnabled ? "ON" : "OFF"}`;
  if (targetWs) {
    sendText(targetWs, message);
    return;
  }

  broadcastToMonitors(message);
}

function removeClient(client, reason = "disconnect") {
  if (!client || !clientsById.has(client.id)) {
    return;
  }

  clientsById.delete(client.id);
  clientsBySocket.delete(client.ws);
  broadcastToMonitors(`[DISCONNECT] ${client.id}-${client.ip}`);
  console.log(`[client ${reason}] ${client.id}`);
}

function handleUploadCommand(monitorWs, targetClientId) {
  const client = clientsById.get(targetClientId);

  if (!client) {
    sendText(monitorWs, `[COMMAND_RESULT] UPLOAD_VIDEO_FAILED ${targetClientId} CLIENT_NOT_FOUND`);
    return;
  }

  try {
    fs.rmSync(VIDEO_FILE_PATH, { force: true });
  } catch (error) {
    console.error(`[upload] Failed to delete old video: ${error.message}`);
  }

  client.upload.commandTime = Date.now();
  client.upload.fileBuffer = [];
  client.upload.isReceivingFile = false;
  client.upload.fileStartTime = null;
  client.upload.rttMs = null;
  client.upload.totalBytes = 0;

  sendText(client.ws, "/upload_video");
  broadcastToMonitors(`[COMMAND_RESULT] UPLOAD_VIDEO_REQUESTED ${targetClientId}`);
  console.log(`[command] Sent /upload_video to ${targetClientId}`);
}

function finalizeUpload(client) {
  const fileBuffer = Buffer.concat(client.upload.fileBuffer);
  const fileEndTime = Date.now();
  const transferDurationMs = client.upload.fileStartTime === null
    ? 0
    : fileEndTime - client.upload.fileStartTime;
  const transferDurationSec = transferDurationMs > 0 ? transferDurationMs / 1000 : 0;

  fs.writeFileSync(VIDEO_FILE_PATH, fileBuffer);

  const hash = crypto.createHash("sha256");
  hash.update(fileBuffer);
  const sha256 = hash.digest("hex");
  const fileSizeMB = fileBuffer.length / (1024 * 1024);
  const bandwidthMBps = transferDurationSec > 0 ? fileSizeMB / transferDurationSec : 0;
  const bandwidthMbps = bandwidthMBps * 8;
  const rttMs = client.upload.rttMs ?? 0;

  console.log(`[upload] ${client.id} file transfer complete. Total size: ${fileBuffer.length} bytes (${transferDurationMs}ms, ${transferDurationSec.toFixed(3)}s)`);
  console.log(`[upload] ${client.id} file SHA256: ${sha256}`);
  console.log(`[upload] ${client.id} RTT: ${rttMs}ms | Bandwidth: ${bandwidthMBps.toFixed(2)} MB/s (${bandwidthMbps.toFixed(2)} Mbps)`);
  console.log(`[upload] ${client.id} file saved to: ${VIDEO_FILE_PATH}`);

  sendText(client.ws, "/file_received");
  broadcastToMonitors(`[MESSAGE] ${client.id}-${client.ip}: /file_end`);
  broadcastToMonitors(`[COMMAND_RESULT] UPLOAD_VIDEO_SAVED ${client.id} ${fileBuffer.length} ${fileSizeMB.toFixed(2)} ${sha256} ${rttMs} ${bandwidthMBps.toFixed(2)} ${bandwidthMbps.toFixed(2)} ${transferDurationMs}`);

  client.upload.fileBuffer = [];
  client.upload.isReceivingFile = false;
  client.upload.totalBytes = 0;
}

function handleClientMessage(client, data, isBinary) {
  if (isBinary) {
    if (client.upload.isReceivingFile) {
      const chunkBuffer = Buffer.from(data);
      client.upload.fileBuffer.push(chunkBuffer);
      client.upload.totalBytes += chunkBuffer.length;
      const totalBytes = client.upload.totalBytes;
      const totalMB = totalBytes / (1024 * 1024);
      console.log(`[upload] ${client.id} received chunk: ${chunkBuffer.length} bytes | total: ${totalBytes} bytes (${totalMB.toFixed(2)} MB)`);
      broadcastToMonitors(`[COMMAND_RESULT] UPLOAD_VIDEO_PROGRESS ${client.id} ${totalBytes} ${totalMB.toFixed(2)}`);
    }
    return;
  }

  const message = data.toString();
  console.log(`[message] ${client.id} ${message}`);

  if (message === "/file_start") {
    client.upload.isReceivingFile = true;
    client.upload.fileBuffer = [];
    client.upload.fileStartTime = Date.now();
    if (client.upload.commandTime !== null) {
      client.upload.rttMs = client.upload.fileStartTime - client.upload.commandTime;
    }
    broadcastToMonitors(`[MESSAGE] ${client.id}-${client.ip}: ${message}`);
    return;
  }

  if (message === "/file_end") {
    finalizeUpload(client);
    return;
  }

  broadcastToMonitors(`[MESSAGE] ${client.id}-${client.ip}: ${message}`);
}

function handleMonitorMessage(ws, rawMessage) {
  const message = rawMessage.toString();
  console.log(`[monitor message] ${message}`);

  if (message === "[COMMAND] CLOSE_ALL_CLIENTS") {
    let closedCount = 0;

    for (const client of clientsById.values()) {
      try {
        client.ws.close();
        closedCount += 1;
      } catch (error) {
        console.error(`[error] Failed to close client ${client.id}: ${error.message}`);
      }
    }

    sendText(ws, `[COMMAND_RESULT] CLOSE_ALL_CLIENTS ${closedCount}`);
    console.log(`[command] Closed ${closedCount} client(s)`);
    return;
  }

  if (message === "[COMMAND] TOGGLE_HEARTBEAT") {
    heartbeatEnabled = !heartbeatEnabled;
    syncHeartbeatStatus();
    sendText(ws, `[COMMAND_RESULT] HEARTBEAT_${heartbeatEnabled ? "ENABLED" : "DISABLED"}`);
    console.log(`[command] Heartbeat detection ${heartbeatEnabled ? "enabled" : "disabled"}`);
    return;
  }

  if (message.startsWith("[COMMAND] UPLOAD_VIDEO ")) {
    const targetClientId = message.replace("[COMMAND] UPLOAD_VIDEO ", "").trim();
    handleUploadCommand(ws, targetClientId);
  }
}

const server = http.createServer((req, res) => {
  serveStaticFile(req, res);
});

const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws, req) => {
  const clientAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  const monitorConnection = isMonitorConnection(req);
  markConnectionAlive(ws);

  console.log(`[WebSocket] Connection from ${clientAddress} (${monitorConnection ? "monitor" : "client"})`);

  if (monitorConnection) {
    monitors.add(ws);

    for (const client of clientsById.values()) {
      sendText(ws, `[CONNECT] ${client.id}-${client.ip}`);
    }
    syncHeartbeatStatus(ws);

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        handleMonitorMessage(ws, data);
      }
    });

    ws.on("close", () => {
      monitors.delete(ws);
      console.log(`[monitor disconnected] ${clientAddress}`);
    });

    ws.on("pong", () => {
      markConnectionAlive(ws);
    });

    ws.on("error", (error) => {
      monitors.delete(ws);
      console.error(`[monitor error] ${clientAddress} ${error.message}`);
    });

    return;
  }

  const client = {
    id: makeClientId(),
    ip: req.socket.remoteAddress || "unknown",
    ws,
    connectedAt: new Date().toISOString(),
    upload: {
      commandTime: null,
      fileBuffer: [],
      isReceivingFile: false,
      fileStartTime: null,
      rttMs: null,
      totalBytes: 0,
    },
  };

  clientsById.set(client.id, client);
  clientsBySocket.set(ws, client);
  broadcastToMonitors(`[CONNECT] ${client.id}-${client.ip}`);
  console.log(`[connected] ${clientAddress} (id: ${client.id})`);

  ws.on("message", (data, isBinary) => {
    handleClientMessage(client, data, isBinary);
  });

  ws.on("close", () => {
    removeClient(client);
  });

  ws.on("pong", () => {
    markConnectionAlive(ws);
  });

  ws.on("error", (error) => {
    console.error(`[client error] ${client.id} ${error.message}`);
    removeClient(client, "error");
  });
});

const heartbeatTimer = setInterval(() => {
  if (!heartbeatEnabled) {
    return;
  }

  for (const monitor of monitors) {
    if (monitor.isAlive === false) {
      console.log("[heartbeat timeout] monitor connection did not respond to ping in time");
      monitors.delete(monitor);
      monitor.terminate();
      continue;
    }

    monitor.isAlive = false;
    monitor.ping();
  }

  for (const client of clientsById.values()) {
    if (client.ws.isAlive === false) {
      console.log(`[heartbeat timeout] ${client.id} did not respond to ping in time`);
      removeClient(client, "heartbeat-timeout");
      client.ws.terminate();
      continue;
    }

    client.ws.isAlive = false;
    client.ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => {
  clearInterval(heartbeatTimer);
});

server.on("upgrade", (req, socket, head) => {
  console.log(`[WebSocket upgrade] Attempt from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`WebSocket server listening on ws://${HOST}:${PORT}`);
});
