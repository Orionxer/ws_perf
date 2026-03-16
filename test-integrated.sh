#!/bin/bash

echo "=========================================="
echo "集成测试 - 单一入口 http://localhost:8080"
echo "=========================================="
echo ""

pkill -f "node server.js" 2>/dev/null
sleep 1
node server.js > /tmp/server-test.log 2>&1 &
SERVER_PID=$!
echo "服务器 PID: $SERVER_PID"
echo ""

sleep 2

echo "=========================================="
echo "测试 1: HTTP 静态文件服务"
echo "=========================================="
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)
echo "HTTP 状态码: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ 静态文件服务正常"
else
  echo "❌ 静态文件服务失败"
fi
echo ""

echo "=========================================="
echo "测试 2: 非浏览器 WebSocket 客户端"
echo "=========================================="
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => {
  console.log('[客户端] 已连接');
  ws.send('Test message');
  setTimeout(() => ws.close(), 500);
});
ws.on('message', (data) => console.log('[客户端] 收到:', data.toString()));
ws.on('close', () => process.exit(0));
" 2>&1

echo ""
echo "=========================================="
echo "测试 3: 浏览器监控面板连接"
echo "=========================================="
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080', {
  headers: {
    'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'http://localhost:8080'
  }
});
ws.on('open', () => {
  console.log('[监控面板] 已连接');
  setTimeout(() => ws.close(), 500);
});
ws.on('message', (data) => console.log('[监控面板] 收到:', data.toString()));
ws.on('close', () => process.exit(0));
" 2>&1

echo ""
echo "=========================================="
echo "测试 4: 完整流程（客户端 + 监控面板）"
echo "=========================================="
node -e "
const WebSocket = require('ws');

const monitor = new WebSocket('ws://localhost:8080', {
  headers: {
    'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'http://localhost:8080'
  }
});

monitor.on('open', () => {
  console.log('[监控面板] 已连接，等待客户端...');
});

let clientClosed = false;
monitor.on('message', (data) => {
  const msg = data.toString();
  console.log('[监控面板] 收到:', msg);
  if (msg.includes('[DISCONNECT]')) {
    clientClosed = true;
  }
  if (clientClosed) {
    setTimeout(() => {
      monitor.close();
      process.exit(0);
    }, 500);
  }
});

setTimeout(() => {
  console.log('[客户端] 正在连接...');
  const client = new WebSocket('ws://localhost:8080');
  
  client.on('open', () => {
    console.log('[客户端] 已连接');
    client.send('Message 1');
    setTimeout(() => client.send('Message 2'), 200);
    setTimeout(() => client.close(), 500);
  });
  
  client.on('message', (data) => {
    console.log('[客户端] 收到:', data.toString());
  });
}, 500);
" 2>&1

echo ""
echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "使用方法："
echo "  浏览器访问: http://localhost:8080"
echo "  WebSocket 连接: ws://localhost:8080"
echo ""
echo "服务器日志:"
tail -10 /tmp/server-test.log 2>/dev/null || echo "无日志"
echo ""

kill $SERVER_PID 2>/dev/null
