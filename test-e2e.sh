#!/bin/bash

echo "=========================================="
echo "WebSocket 监控面板 - 端到端测试"
echo "=========================================="
echo ""

echo "启动服务器..."
pkill -f "node server.js" 2>/dev/null
sleep 1
node server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
echo "服务器 PID: $SERVER_PID"
echo ""

sleep 2

echo "启动 Vite 开发服务器..."
cd dashboard
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!
cd ..
echo "Vite PID: $VITE_PID"
echo ""

sleep 2

echo "验证服务器状态:"
netstat -tuln | grep -E ":(8080|5173)" || echo "服务器启动失败"
echo ""

echo "=========================================="
echo "测试 1: 非浏览器客户端连接"
echo "=========================================="
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  console.log('[客户端] 已连接到服务器');
  ws.send('Hello from regular client');
  setTimeout(() => ws.close(), 1000);
});
ws.on('message', (data) => console.log('[客户端] 收到:', data.toString()));
ws.on('close', () => process.exit(0));
" 2>&1

echo ""
echo "=========================================="
echo "测试 2: 浏览器模拟连接（监控面板）"
echo "=========================================="
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080', {
  headers: {
    'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'http://localhost:5173'
  }
});
let count = 0;
ws.on('open', () => {
  console.log('[监控面板] 已连接到服务器');
  setTimeout(() => {
    if (count === 0) console.log('[监控面板] 未收到任何客户端状态（正常，因为之前客户端已断开）');
  }, 500);
  setTimeout(() => ws.close(), 1000);
});
ws.on('message', (data) => {
  count++;
  console.log('[监控面板] 收到:', data.toString());
});
ws.on('close', () => process.exit(0));
" 2>&1

echo ""
echo "=========================================="
echo "测试 3: 完整流程（客户端 + 监控面板）"
echo "=========================================="
node -e "
const WebSocket = require('ws');

// 先启动监控面板
const monitor = new WebSocket('ws://localhost:8080', {
  headers: {
    'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'http://localhost:5173'
  }
});

let monitorReady = false;

monitor.on('open', () => {
  console.log('[监控面板] 已连接');
  monitorReady = true;
});

monitor.on('message', (data) => {
  const msg = data.toString();
  console.log('[监控面板] 收到:', msg);
  if (msg.includes('[DISCONNECT]')) {
    setTimeout(() => {
      monitor.close();
      process.exit(0);
    }, 500);
  }
});

// 1秒后连接普通客户端
setTimeout(() => {
  console.log('[客户端] 正在连接...');
  const client = new WebSocket('ws://localhost:8080');
  
  client.on('open', () => {
    console.log('[客户端] 已连接');
    client.send('Message 1');
    setTimeout(() => client.send('Message 2'), 500);
    setTimeout(() => client.send('Message 3'), 1000);
    setTimeout(() => client.close(), 1500);
  });
  
  client.on('message', (data) => {
    console.log('[客户端] 收到:', data.toString());
  });
}, 1000);
" 2>&1

echo ""
echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "服务器日志:"
tail -20 /tmp/server.log 2>/dev/null || echo "无服务器日志"
echo ""

echo "=========================================="
echo "如何手动测试："
echo "=========================================="
echo "1. 浏览器访问监控面板: http://localhost:5173"
echo "2. 使用 WebSocket 客户端连接: ws://localhost:8080"
echo "3. 观察监控面板实时显示客户端状态"
echo ""

kill $SERVER_PID $VITE_PID 2>/dev/null
