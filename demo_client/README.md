# WebSocket Video Transfer Client

基于 Node.js 的简单 WebSocket 客户端实现，用于视频文件传输。

## 功能特性

- 客户端接收 `/upload_video` 指令后自动传输视频文件
- 流式传输大文件（支持任意大小）
- 自动校验文件完整性（SHA256）
- 传输性能统计（RTT、带宽）
- 简单易用的命令行启动方式

## 项目结构

```text
demo_client/
├── README.md              # 项目文档
├── client.js              # WebSocket 客户端
├── package.json           # 客户端依赖配置
├── package-lock.json      # 锁定依赖版本
└── resource/
    └── starship.mp4       # 待发送的视频文件
```

## 技术栈

- **Node.js** - 运行环境
- **ws** - WebSocket 库（8.16.0）
- **原生 fs 模块** - 文件读写
- **原生 stream** - 流式传输

## 通信协议

```text
服务端 → 客户端: /upload_video
客户端 → 服务端: /file_start
客户端 → 服务端: [二进制数据块...]
客户端 → 服务端: /file_end
服务端 → 客户端: /file_received
```

## 快速开始

### 1. 安装依赖

```bash
# 进入项目根目录
cd demo_client
npm install
```

### 2. 运行客户端

```bash
# 进入项目根目录
cd demo_client
npm start
```

客户端将自动：
1. 连接到服务端
2. 接收 `/upload_video` 指令
3. 发送 `resource/starship.mp4`
4. 等待服务端确认

## 测试结果

✅ **功能验证通过**

| 验证项 | 结果 |
|--------|------|
| 客户端连接 | ✅ 连接成功 |
| 指令接收 | ✅ `/upload_video` 已接收 |
| 文件传输 | ✅ 视频文件传输完成 |
| 完整性校验 | ✅ SHA256 已计算 |
| RTT 计算 | ✅ 已输出往返延迟 |
| 带宽计算 | ✅ 已输出 MB/s 与 Mbps |

## 使用说明

### 发送不同的视频文件

修改 `client.js` 中的 `VIDEO_FILE_PATH`：

```javascript
const VIDEO_FILE_PATH = path.join(__dirname, 'resource', 'your_video.mp4');
```

### 修改服务端地址

修改 `client.js` 中的 `WS_URL`：

```javascript
const WS_URL = 'ws://localhost:8080';
```

## 实现细节

### 客户端 (client.js)

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

### 客户端输出

```text
Connected to server
Received message: /upload_video
Sending video file: /home/orionxer/ai/ws_perf/demo_client/resource/starship.mp4
Sent chunk: 65536 bytes
Sent chunk: 65536 bytes
...
Sent chunk: 26488 bytes
Received message: /file_received
File transfer complete (123ms, 0.123s)
Server confirmed file received successfully
File SHA256: 0144f4bb3bd4d75e942d49d99d4af80303d41fa6f5807e8b35945df66f110cb1
RTT: 8ms (0.008s) | Bandwidth: 17.15 MB/s (137.23 Mbps)
```

## 注意事项

1. **大文件传输**: 默认块大小为流式读取的分片大小，可根据需要调整
2. **错误处理**: 包含基本的错误处理和日志记录
3. **服务端依赖**: 运行客户端前需要确保目标 WebSocket 服务端已启动并支持上述协议
4. **RTT 计算**: RTT 指从收到上传指令到开始发送文件前的时间差，具体含义取决于服务端交互时序

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
