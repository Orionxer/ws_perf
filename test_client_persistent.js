const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('[TEST CLIENT] Connected');

  setInterval(() => {
    ws.send('Periodic message: ' + new Date().toISOString());
    console.log('[TEST CLIENT] Sent periodic message');
  }, 3000);

  // Keep sending messages for 30 seconds
  setTimeout(() => {
    ws.close();
    console.log('[TEST CLIENT] Closing connection');
  }, 30000);
});

ws.on('message', (data) => {
  console.log('[TEST CLIENT] Received:', data.toString());
});

ws.on('close', () => {
  console.log('[TEST CLIENT] Connection closed');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('[TEST CLIENT] Error:', error.message);
  process.exit(1);
});
