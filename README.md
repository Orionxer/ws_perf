# ws_perf

一个用于验证 WebSocket 连接管理、视频上传链路和监控面板交互的最小化演示项目。

项目当前由 3 个主要部分组成：

- 根目录 `server.js`：HTTP + WebSocket 服务端
- `dashboard/`：浏览器监控面板，构建产物由服务端直接托管
- `demo_client/`：Node.js WebSocket 演示客户端，用于接收上传指令并发送视频文件

## 项目能力

- 管理普通客户端连接与浏览器监控连接
- 在监控面板中实时查看客户端上下线和消息
- 从监控面板向指定客户端下发 `/upload_video` 指令
- 客户端按二进制流上传 `starship.mp4`
- 服务端保存上传文件到根目录 `resource/starship.mp4`
- 计算并展示上传文件的 SHA256、RTT、上传耗时和带宽
- 支持心跳检测开关与一键关闭所有客户端连接
- 支持通过 HTTP Range 请求播放已上传视频

## 目录结构

```text
ws_perf/
├── README.md
├── package.json                 # 根服务端依赖与启动脚本
├── server.js                    # HTTP + WebSocket 服务端
├── resource/
│   └── starship.mp4             # 服务端接收到并保存的视频
├── demo_client/
│   ├── README.md                # 演示客户端说明
│   ├── client.js                # Node.js WebSocket 客户端
│   ├── package.json
│   └── resource/
│       └── starship.mp4         # 客户端待上传的视频
├── dashboard/
│   ├── package.json
│   ├── index.html
│   ├── src/
│   │   ├── main.js              # 监控面板逻辑
│   │   └── style.css            # 监控面板样式
│   └── dist/
│       └── index.html           # 当前已构建的静态产物
└── docs/
    └── websocket-mobile-debugging-lessons.md
```

## 技术栈

- Node.js
- `ws`
- 原生 `http`、`fs`、`path`、`crypto`
- Vite（用于构建 `dashboard`）

## 系统设计

### 1. 服务端

根目录的 `server.js` 同时承担两件事：

- 提供静态资源服务
  - `/` 返回 `dashboard/dist/index.html`
  - `/resource/*` 返回根目录 `resource/` 下的文件
  - 支持 `HEAD` 和 `Range`，便于前端检测文件存在性并播放视频
- 提供 WebSocket 服务
  - 浏览器连接会被识别为 monitor
  - Node.js 客户端连接会被识别为普通 client

默认监听地址：

```text
ws://0.0.0.0:8080
http://localhost:8080
```

### 2. 监控面板

`dashboard` 是一个无框架前端页面，核心行为在 `dashboard/src/main.js`：

- 展示在线客户端列表
- 查看单个客户端详情和消息记录
- 发送上传命令
- 查看上传进度、哈希、RTT、带宽、上传耗时
- 播放服务端保存的视频 `/resource/starship.mp4`
- 切换心跳检测
- 关闭所有客户端

前端 WebSocket 地址会根据 `window.location.host` 自动推导，因此本机和局域网访问都可复用同一套页面逻辑。

### 3. 演示客户端

`demo_client/client.js` 的行为与 `demo_client/README.md` 保持一致：

- 连接 `ws://localhost:8080`
- 收到 `/upload_video` 后发送 `/file_start`
- 以流式方式发送 `demo_client/resource/starship.mp4`
- 发送 `/file_end`
- 收到 `/file_received` 后输出传输统计

## 通信协议

当前实现中的主要消息如下：

```text
监控面板 -> 服务端: [COMMAND] UPLOAD_VIDEO <clientId>
监控面板 -> 服务端: [COMMAND] TOGGLE_HEARTBEAT
监控面板 -> 服务端: [COMMAND] CLOSE_ALL_CLIENTS

服务端 -> 客户端: /upload_video
客户端 -> 服务端: /file_start
客户端 -> 服务端: <binary chunks>
客户端 -> 服务端: /file_end
服务端 -> 客户端: /file_received

服务端 -> 监控面板: [CONNECT] <clientId>-<ip>
服务端 -> 监控面板: [DISCONNECT] <clientId>-<ip>
服务端 -> 监控面板: [MESSAGE] <clientId>-<ip>: <message>
服务端 -> 监控面板: [COMMAND_RESULT] ...
服务端 -> 监控面板: [SYSTEM] HEARTBEAT ON|OFF
```

## 快速开始

### 1. 安装根目录依赖

```bash
# 进入项目根目录
npm install
```

### 2. 启动服务端

```bash
# 进入项目根目录
npm start
```

### 3. 打开监控面板

浏览器访问：

```text
http://localhost:8080
```

如果需要在手机上访问，可使用局域网地址：

```text
http://<你的电脑IP>:8080
```

### 4. 启动演示客户端

```bash
cd demo_client
npm install
npm start
```

### 5. 触发上传

在监控面板中：

1. 点击某个在线客户端
2. 进入详情页
3. 点击“上传视频”

之后可以在页面中看到：

- 上传中进度
- 上传完成后的哈希、RTT、带宽和耗时
- 服务端已保存的视频播放器

## 开发说明

### 修改 dashboard 源码

服务端实际托管的是 `dashboard/dist`。如果你修改了 `dashboard/src`，需要重新构建：

```bash
cd dashboard
npm install
npm run build
```

构建完成后，重新访问根服务即可看到最新页面。

### 修改演示客户端地址

如需连接其他服务端，修改 `demo_client/client.js` 中的 `WS_URL`：

```js
const WS_URL = 'ws://localhost:8080';
```

### 修改客户端上传文件

修改 `demo_client/client.js` 中的 `VIDEO_FILE_PATH`：

```js
const VIDEO_FILE_PATH = path.join(__dirname, 'resource', 'your_video.mp4');
```

## 实现细节

### 心跳检测

- 服务端每 10 秒对 monitor 和 client 发送一次 `ping`
- 未按时响应 `pong` 的连接会被移除
- 监控面板可通过按钮切换心跳检测开关

### 上传统计

服务端在完成上传后会：

- 将收到的二进制块拼接为完整文件
- 写入 `resource/starship.mp4`
- 计算 SHA256
- 计算 RTT、上传耗时、MB/s 和 Mbps
- 将结果广播给监控面板

### 视频访问

服务端对 `/resource/starship.mp4` 支持：

- `HEAD` 检查文件是否存在
- `Range` 分段读取，供浏览器视频播放器使用

## 注意事项

- 根目录和 `demo_client/` 都各自有一份 `starship.mp4`，前者是服务端保存结果，后者是客户端上传源文件
- 当前服务端每次触发上传前会先删除旧的根目录 `resource/starship.mp4`
- 浏览器是否被识别为 monitor，依赖 `User-Agent` 和 `Origin` 的组合判断
- 如果只修改了 `dashboard/src` 但没有重新构建，服务端页面不会自动反映源码变更

## 相关文档

- [docs/PRD-ws-perf.md](docs/PRD-ws-perf.md)
- [demo_client/README.md](demo_client/README.md)
- [docs/websocket-mobile-debugging-lessons.md](docs/websocket-mobile-debugging-lessons.md)
