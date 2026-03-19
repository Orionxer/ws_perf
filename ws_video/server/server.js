const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8080;
const RESOURCE_DIR = path.join(__dirname, 'resource');

if (!fs.existsSync(RESOURCE_DIR)) {
  fs.mkdirSync(RESOURCE_DIR, { recursive: true });
}

const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

wss.on('connection', (ws) => {
  const clientIp = ws._socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  const uploadCommandTime = Date.now();
  ws.send('/upload_video');
  console.log('Sent /upload_video command to client');

  let fileBuffer = Buffer.alloc(0);
  let isReceivingFile = false;
  let fileStartTime = null;
  let rttMs = null;

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      fileBuffer = Buffer.concat([fileBuffer, data]);
      console.log(`Received chunk: ${data.length} bytes, total: ${fileBuffer.length} bytes`);
      return;
    }

    const message = data.toString();
    console.log(`Received message: ${message}`);

    if (message === '/file_start') {
      isReceivingFile = true;
      fileBuffer = Buffer.alloc(0);
      fileStartTime = Date.now();
      rttMs = fileStartTime - uploadCommandTime;
      console.log('Starting to receive file...');
    } else if (message === '/file_end') {
      isReceivingFile = false;
      const fileEndTime = Date.now();
      const transferDurationMs = fileEndTime - fileStartTime;
      const transferDurationSec = transferDurationMs / 1000;
      console.log(`File transfer complete. Total size: ${fileBuffer.length} bytes (${transferDurationMs}ms, ${transferDurationSec.toFixed(3)}s)`);

      const filePath = path.join(RESOURCE_DIR, 'starship.mp4');
      fs.writeFileSync(filePath, fileBuffer);

      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      const sha256 = hash.digest('hex');
      console.log(`File SHA256: ${sha256}`);

      const rttSec = rttMs / 1000;
      const fileSizeMB = fileBuffer.length / (1024 * 1024);
      const bandwidthMBps = fileSizeMB / transferDurationSec;
      const bandwidthMbps = bandwidthMBps * 8;
      console.log(`RTT: ${rttMs}ms (${rttSec.toFixed(3)}s) | Bandwidth: ${bandwidthMBps.toFixed(2)} MB/s (${bandwidthMbps.toFixed(2)} Mbps)`);

      console.log(`File saved to: ${filePath}`);

      ws.send('/file_received');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
