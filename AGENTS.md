# AGENTS.md

本文件供后续 AI/代理接手本仓库时快速建立上下文。

## 项目概览

这是一个最小化 WebSocket 演示项目，包含 3 个部分：

- `server.js`：根服务端，负责 HTTP 静态托管和 WebSocket 通信
- `dashboard/`：监控面板源码，构建产物由服务端托管
- `demo_client/`：Node.js 演示客户端，接收上传指令并发送视频文件

核心闭环：

1. monitor 页面连接服务端
2. demo client 连接服务端
3. monitor 对指定 client 下发上传命令
4. client 上传 `starship.mp4`
5. 服务端保存文件并广播上传结果
6. monitor 展示统计信息并播放视频

## 关键文件

- `server.js`：服务端入口，最重要
- `package.json`：根启动脚本
- `dashboard/src/main.js`：监控面板逻辑
- `dashboard/src/style.css`：监控面板样式
- `dashboard/dist/`：服务端实际托管的静态文件
- `demo_client/client.js`：演示客户端逻辑
- `resource/starship.mp4`：服务端保存后的文件
- `demo_client/resource/starship.mp4`：客户端上传源文件
- `README.md`：总体说明
- `Quick_Start.md`：极简启动文档
- `docs/PRD-ws-perf.md`：复盘用 PRD

## 如何运行

### 1. 启动服务端

```bash
# 进入项目根目录
npm install
npm start
```

访问：

```text
http://localhost:8080
```

### 2. 启动 demo client

```bash
cd demo_client
npm install
npm start
```

### 3. 如果修改了 dashboard 源码

注意：服务端托管的是 `dashboard/dist`，不是 `dashboard/src`。

```bash
cd dashboard
npm install
npm run build
```

如果你只改了 `dashboard/src` 但没有重新 build，页面不会反映你的改动。

## 当前协议

### Monitor -> Server

```text
[COMMAND] UPLOAD_VIDEO <clientId>
[COMMAND] TOGGLE_HEARTBEAT
[COMMAND] CLOSE_ALL_CLIENTS
```

### Server -> Client

```text
/upload_video
/file_received
```

### Client -> Server

```text
/file_start
<binary chunks>
/file_end
```

### Server -> Monitor

```text
[CONNECT] <clientId>-<ip>
[DISCONNECT] <clientId>-<ip>
[MESSAGE] <clientId>-<ip>: <message>
[COMMAND_RESULT] ...
[SYSTEM] HEARTBEAT ON|OFF
```

## 服务端行为要点

- 默认监听 `0.0.0.0:8080`
- HTTP 根路径 `/` 返回 `dashboard/dist/index.html`
- `/resource/*` 映射到根目录 `resource/`
- `/resource/starship.mp4` 支持 `HEAD` 和 `Range`
- 浏览器连接会被识别为 monitor
- Node.js 客户端连接会被识别为普通 client
- 服务端在上传前会删除旧的 `resource/starship.mp4`
- 上传完成后会计算 SHA256、RTT、上传耗时和带宽

## dashboard 行为要点

- WebSocket 地址由 `window.location.host` 动态推导
- 支持客户端列表页和详情页
- 支持上传按钮、心跳开关、关闭所有客户端
- 详情页会通过 `HEAD /resource/starship.mp4` 检查视频是否存在
- 上传成功后会刷新播放器 URL

## demo client 行为要点

- 默认连接 `ws://localhost:8080`
- 上传源文件默认是 `demo_client/resource/starship.mp4`
- 收到 `/upload_video` 后开始流式发送文件
- 收到 `/file_received` 后输出本地统计

## 修改时的注意事项

- 不要把 `dashboard/src` 的改动误以为会自动生效，必要时重新 build
- 不要随意改动协议字符串，monitor、server、client 三端是硬编码联动的
- 不要删除 `resource/` 或 `demo_client/resource/` 下的测试视频，除非你同步更新文档和代码
- `demo_client/client.js` 里的地址如果改成远程服务，请同时检查 README/Quick Start 是否需要同步
- monitor/client 的识别依赖请求头推断，修改连接判断时要回归测试浏览器和 Node.js 客户端
- 当前上传实现使用内存拼接文件，大文件场景要注意内存占用

## 推荐修改流程

1. 先读 `README.md`
2. 再看 `server.js`
3. 如果涉及页面交互，读 `dashboard/src/main.js`
4. 如果涉及上传链路，读 `demo_client/client.js`
5. 修改完成后按下面的最小回归验证

## 最小回归验证

如果你改了服务端、协议或页面逻辑，至少验证以下内容：

1. 服务端能正常启动
2. 浏览器能打开监控页面
3. demo client 连接后能出现在列表中
4. 上传按钮可触发上传
5. 页面能看到上传进度和成功结果
6. 上传后视频可播放
7. 心跳开关和关闭所有客户端仍可用

## 常见坑

- 只改 `dashboard/src` 没有 build，导致误判“代码没生效”
- 用手机打开页面时，如果 WebSocket 地址写死 `localhost` 会连接错误设备
- 修改协议文本但只改了一端，导致链路失配
- 上传结果依赖 `resource/starship.mp4`，路径改动需要同步前后端

## 相关文档

- `README.md`
- `Quick_Start.md`
- `docs/PRD-ws-perf.md`
- `demo_client/README.md`
- `docs/websocket-mobile-debugging-lessons.md`
