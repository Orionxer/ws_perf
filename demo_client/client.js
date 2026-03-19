const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WS_URL = 'ws://localhost:8080';
const VIDEO_FILE_PATH = path.join(__dirname, 'resource', 'starship.mp4');

const ws = new WebSocket(WS_URL);

let uploadCommandTime = null;
let fileStartTime = null;
let fileEndTime = null;

ws.on('open', () => {
  console.log('Connected to server');
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    console.log('Received binary data:', data.length, 'bytes');
    return;
  }

  const message = data.toString();
  console.log('Received message:', message);

  if (message === '/upload_video') {
    uploadCommandTime = Date.now();
    sendVideoFile();
  } else if (message === '/file_received') {
    fileEndTime = Date.now();
    const transferDurationMs = fileEndTime - fileStartTime;
    const transferDurationSec = transferDurationMs / 1000;
    console.log(`File transfer complete (${transferDurationMs}ms, ${transferDurationSec.toFixed(3)}s)`);
    console.log('Server confirmed file received successfully');
    printTransferStats();
  }
});

ws.on('close', () => {
  console.log('Connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

function sendVideoFile() {
  const readStream = fs.createReadStream(VIDEO_FILE_PATH);

  console.log(`Sending video file: ${VIDEO_FILE_PATH}`);

  fileStartTime = Date.now();
  ws.send('/file_start');

  readStream.on('data', (chunk) => {
    ws.send(chunk);
    console.log(`Sent chunk: ${chunk.length} bytes`);
  });

  readStream.on('end', () => {
    ws.send('/file_end');
  });

  readStream.on('error', (error) => {
    console.error('Error reading file:', error);
    ws.close();
  });
}

function printTransferStats() {
  const fileData = fs.readFileSync(VIDEO_FILE_PATH);
  const fileSize = fileData.length;

  const hash = crypto.createHash('sha256');
  hash.update(fileData);
  const sha256 = hash.digest('hex');
  console.log(`File SHA256: ${sha256}`);

  const rttMs = fileStartTime - uploadCommandTime;
  const rttSec = rttMs / 1000;
  const transferDurationMs = fileEndTime - fileStartTime;
  const transferDurationSec = transferDurationMs / 1000;
  const fileSizeMB = fileSize / (1024 * 1024);
  const bandwidthMBps = fileSizeMB / transferDurationSec;
  const bandwidthMbps = bandwidthMBps * 8;
  console.log(`RTT: ${rttMs}ms (${rttSec.toFixed(3)}s) | Bandwidth: ${bandwidthMBps.toFixed(2)} MB/s (${bandwidthMbps.toFixed(2)} Mbps)`);
}
