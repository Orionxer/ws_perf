# WebSocket Video Transfer

基于 Node.js 的简单 WebSocket 客户端和服务端实现，用于视频文件传输。

## 功能特性

- WebSocket 服务端自动向连接的客户端发送 `/upload_video` 指令
- 客户端接收指令后自动传输视频文件
- 流式传输大文件（支持任意大小）
- 自动校验文件完整性（SHA256）
- 传输性能统计（RTT、带宽）
- 简单易用的命令行启动方式

## 项目结构

```
ws_video/
├── LICENSE                # MIT 协议
├── README.md              # 项目文档
├── client/
│   ├── client.js          # WebSocket 客户端
│   ├── package.json       # 客户端依赖配置
│   └── resource/
│       └── starship.mp4       # 待发送的视频文件
└── server/
    ├── server.js          # WebSocket 服务端
    ├── package.json       # 服务端依赖配置
    └── resource/
        └── starship.mp4       # 接收保存的视频文件
```

## 技术栈

- **Node.js** - 运行环境
- **ws** - WebSocket 库（8.16.0）
- **原生 fs 模块** - 文件读写
- **原生 stream** - 流式传输

## 通信协议

```
服务端 → 客户端: /upload_video
客户端 → 服务端: /file_start
客户端 → 服务端: [二进制数据块...]
客户端 → 服务端: /file_end
服务端 → 客户端: /file_received
```

## 快速开始

### 1. 安装依赖

```bash
# 安装服务端依赖
cd server
npm install

# 安装客户端依赖
cd ../client
npm install
```

### 2. 启动服务端

```bash
cd /home/orionxer/ai/ws_video/server
npm start
```

服务端将监听 `ws://localhost:8080` 并显示：

```
WebSocket server started on port 8080
```

### 3. 运行客户端

```bash
cd /home/orionxer/ai/ws_video/client
npm start
```

客户端将自动：
1. 连接到服务端
2. 接收 `/upload_video` 指令
3. 发送 `client/resource/starship.mp4`（服务端保存为 `starship.mp4`）
4. 等待服务端确认

## 测试结果

✅ **功能验证通过**

| 验证项 | 结果 |
|--------|------|
| 服务端启动 | ✅ 监听端口 8080 |
| 客户端连接 | ✅ 连接成功 |
| 指令发送 | ✅ `/upload_video` 已发送 |
| 文件传输 | ✅ 12MB 视频文件传输完成 |
| 文件接收 | ✅ 200 个数据块成功接收 |
| 文件保存 | ✅ 已保存到 `server/resource/starship.mp4` |
| 文件大小 | ✅ 12MB（与源文件一致） |
| 完整性校验 | ✅ SHA256 匹配 |
| RTT 计算 | ✅ ~8ms（网络往返延迟） |
| 带宽计算 | ✅ ~17 MB/s |

## 使用说明

### 发送不同的视频文件

修改 `client/client.js` 中的 `VIDEO_FILE_PATH`：

```javascript
const VIDEO_FILE_PATH = path.join(__dirname, 'resource', 'your_video.mp4');
```

### 修改服务端端口

修改 `server/server.js` 中的 `PORT` 常量：

```javascript
const PORT = 8080; // 改为你需要的端口
```

同时修改 `client/client.js` 中的 `WS_URL`：

```javascript
const WS_URL = 'ws://localhost:8080';
```

## 实现细节

### 服务端 (server/server.js)

- 监听 WebSocket 连接
- 连接建立后立即发送 `/upload_video` 指令
- 接收二进制数据流
- 接收到 `/file_end` 后保存文件到 `server/resource/starship.mp4`
- 计算并打印文件 SHA256 哈希值
- 计算 RTT（往返时间）：从发送指令到收到 `/file_start` 的时间
- 计算带宽：文件大小 ÷ 数据传输时长
- 发送 `/file_received` 确认

### 客户端 (client/client.js)

- 连接到 WebSocket 服务端
- 接收 `/upload_video` 指令后触发文件传输
- 使用 `fs.createReadStream` 读取文件
- 将文件分割为二进制块发送
- 发送 `/file_end` 表示传输完成
- 等待服务端确认后计算并打印：
  - 文件 SHA256 哈希值
  - RTT（往返时间）
  - 带宽（MB/s 和 Mbps）

## 输出示例

### 服务端输出

```
WebSocket server started on port 8080
Client connected: ::ffff:127.0.0.1
Sent /upload_video command to client
Received message: /file_start
Starting to receive file...
Received chunk: 65536 bytes, total: 65536 bytes
...
Received chunk: 26488 bytes, total: 11691896 bytes
Received message: /file_end
File transfer complete. Total size: 11691896 bytes
File SHA256: 0144f4bb3bd4d75e942d49d99d4af80303d41fa6f5807e8b35945df66f110cb1
RTT: 8ms (0.008s) | Bandwidth: 17.15 MB/s (137.23 Mbps)
File saved to: /home/orionxer/ai/ws_video/server/resource/starship.mp4
Client disconnected
```

### 客户端输出

```
Connected to server
Received message: /upload_video
Sending video file: /home/orionxer/ai/ws_video/client/resource/starship.mp4
Sent chunk: 65536 bytes
Sent chunk: 65536 bytes
...
Sent chunk: 26488 bytes
File transfer complete
Received message: /file_received
Server confirmed file received successfully
File SHA256: 0144f4bb3bd4d75e942d49d99d4af80303d41fa6f5807e8b35945df66f110cb1
RTT: 8ms (0.008s) | Bandwidth: 17.15 MB/s (137.23 Mbps)
Connection closed
```

## 注意事项

1. **大文件传输**: 默认块大小为 64KB，可根据需要调整
2. **并发连接**: 当前实现支持单客户端连接，可扩展支持多客户端
3. **错误处理**: 包含基本的错误处理和日志记录
4. **文件覆盖**: 接收的文件会覆盖同名文件
5. **RTT 计算**: RTT 指网络往返延迟，从发送指令到收到第一个响应的时间，不包含文件传输时间

## 依赖版本

```json
{
  "ws": "^8.16.0"
}
```

## 系统要求

- Node.js >= 12.0.0
- Linux/MacOS/Windows

## License

MIT
