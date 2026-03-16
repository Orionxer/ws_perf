const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('[TEST CLIENT] Connected');

  setTimeout(() => {
    ws.send('Hello from test client 1');
    console.log('[TEST CLIENT] Sent: Hello from test client 1');
  }, 1000);

  setTimeout(() => {
    ws.send('This is test message 2');
    console.log('[TEST CLIENT] Sent: This is test message 2');
  }, 3000);

  setTimeout(() => {
    ws.send('Final message before disconnect');
    console.log('[TEST CLIENT] Sent: Final message before disconnect');
  }, 5000);

  setTimeout(() => {
    ws.close();
    console.log('[TEST CLIENT] Disconnected');
  }, 7000);
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
