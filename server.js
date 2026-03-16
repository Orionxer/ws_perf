const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "0.0.0.0";
const PORT = 8080;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const STATIC_DIR = path.join(__dirname, "dashboard", "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function createAcceptValue(websocketKey) {
  return crypto
    .createHash("sha1")
    .update(websocketKey + WS_GUID, "binary")
    .digest("base64");
}

function decodeFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) === 0x80;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }

    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }

    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Payload too large");
    }

    payloadLength = Number(bigLength);
    offset += 8;
  }

  const maskLength = isMasked ? 4 : 0;
  const frameLength = offset + maskLength + payloadLength;
  if (buffer.length < frameLength) {
    return null;
  }

  let payload = buffer.subarray(offset + maskLength, frameLength);
  if (isMasked) {
    const mask = buffer.subarray(offset, offset + 4);
    const decoded = Buffer.alloc(payloadLength);

    for (let i = 0; i < payloadLength; i += 1) {
      decoded[i] = payload[i] ^ mask[i % 4];
    }

    payload = decoded;
  }

  return {
    frameLength,
    opcode,
    payload
  };
}

function encodeFrame(data) {
  const payload = Buffer.from(data, "utf8");
  const payloadLength = payload.length;

  if (payloadLength < 126) {
    return Buffer.concat([Buffer.from([0x81, payloadLength]), payload]);
  }

  if (payloadLength < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return Buffer.concat([header, payload]);
}

function serveStaticFile(req, res) {
  let filePath = path.join(STATIC_DIR, req.url === "/" ? "/index.html" : req.url);

  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}

const clients = new Map();
const monitors = new Set();

const server = http.createServer((req, res) => {
  serveStaticFile(req, res);
});

server.on("upgrade", (req, socket) => {
  const websocketKey = req.headers["sec-websocket-key"];
  const upgradeHeader = req.headers.upgrade;

  if (!websocketKey || upgradeHeader?.toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const acceptValue = createAcceptValue(websocketKey);
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptValue}`
  ];

  socket.write(`${responseHeaders.join("\r\n")}\r\n\r\n`);

  const clientAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  const userAgent = req.headers['user-agent'] || '';
  const hasOrigin = req.headers['origin'] !== undefined;

  const isBrowser = hasOrigin && (
    userAgent.includes('Mozilla') ||
    userAgent.includes('Chrome') ||
    userAgent.includes('Safari') ||
    userAgent.includes('Firefox') ||
    userAgent.includes('Edge')
  ) && !userAgent.includes('node');

  let clientId = null;

  if (isBrowser) {
    console.log(`[monitor connected] ${clientAddress}`);
    monitors.add(socket);

    clients.forEach((client) => {
      const connectMsg = `[CONNECT] ${client.id}-${client.ip}`;
      socket.write(encodeFrame(connectMsg));
    });
  } else {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ip = req.socket.remoteAddress || 'unknown';
    const connectedAt = new Date().toISOString();

    clients.set(socket, {
      id: clientId,
      ip: ip,
      socket: socket,
      connectedAt: connectedAt
    });

    console.log(`[connected] ${clientAddress} (id: ${clientId})`);

    const connectMsg = `[CONNECT] ${clientId}-${ip}`;
    monitors.forEach(monitor => {
      try {
        monitor.write(encodeFrame(connectMsg));
      } catch (e) {
      }
    });
  }

  let buffered = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);

    while (buffered.length > 0) {
      let frame;

      try {
        frame = decodeFrame(buffered);
      } catch (error) {
        console.error(`[error] ${clientAddress} ${error.message}`);
        socket.destroy();
        return;
      }

      if (!frame) {
        return;
      }

      buffered = buffered.subarray(frame.frameLength);

      if (frame.opcode === 0x8) {
        socket.end(Buffer.from([0x88, 0x00]));
        return;
      }

      if (frame.opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]));
        continue;
      }

      if (frame.opcode !== 0x1) {
        continue;
      }

      const message = frame.payload.toString("utf8");
      console.log(`[message] ${clientAddress} ${message}`);

      const reply = `Server received: ${message}`;
      socket.write(encodeFrame(reply));

      if (!isBrowser && clientId) {
        const client = clients.get(socket);
        if (client) {
          const messageMsg = `[MESSAGE] ${client.id}-${client.ip}: ${message}`;
          monitors.forEach(monitor => {
            try {
              monitor.write(encodeFrame(messageMsg));
            } catch (e) {
            }
          });
        }
      }
    }
  });

  socket.on("close", () => {
    console.log(`[disconnected] ${clientAddress}`);

    if (isBrowser) {
      monitors.delete(socket);
      console.log(`[monitor disconnected] ${clientAddress}`);
    } else if (clientId) {
      const client = clients.get(socket);
      if (client) {
        const disconnectMsg = `[DISCONNECT] ${client.id}-${client.ip}`;
        monitors.forEach(monitor => {
          try {
            monitor.write(encodeFrame(disconnectMsg));
          } catch (e) {
          }
        });

        clients.delete(socket);
        console.log(`[client disconnected] ${clientId}`);
      }
    }
  });

  socket.on("error", (error) => {
    console.error(`[socket error] ${clientAddress} ${error.message}`);

    if (isBrowser) {
      monitors.delete(socket);
    } else if (clientId) {
      const client = clients.get(socket);
      if (client) {
        const disconnectMsg = `[DISCONNECT] ${client.id}-${client.ip}`;
        monitors.forEach(monitor => {
          try {
            monitor.write(encodeFrame(disconnectMsg));
          } catch (e) {
          }
        });

        clients.delete(socket);
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`WebSocket server listening on ws://${HOST}:${PORT}`);
});
