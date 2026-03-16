#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "WebSocket 监控面板 - 单一入口"
echo "=========================================="
echo ""
echo "启动服务器..."
echo "访问地址: http://localhost:8080"
echo "WebSocket: ws://localhost:8080"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "=========================================="
echo ""

node server.js
