# WebSocket 监控面板

单一入口 HTTP + WebSocket 服务器，浏览器访问 `http://localhost:8080` 即可使用监控面板。

## 快速开始

```bash
./start.sh
```

然后在浏览器中访问：
- 监控面板: `http://localhost:8080`
- WebSocket 连接: `ws://localhost:8080`

## 功能

- 监控所有已连接的 WebSocket 客户端
- 实时显示客户端连接/断开事件
- 查看每个客户端发送的所有消息
- 点击客户端卡片查看详情

## 浏览器检测规则

服务器通过以下方式识别浏览器监控面板：

1. 必须包含 `Origin` 请求头
2. `User-Agent` 包含浏览器标识（Mozilla、Chrome、Safari、Firefox、Edge）
3. 排除 Node.js 客户端

## 测试

```bash
./test-integrated.sh
```

## 前端构建说明

`server.js` 直接托管的是 `dashboard/dist` 下的静态文件，不会实时读取 `dashboard/src`。

如果修改了以下前端源码：

- `dashboard/src/main.js`
- `dashboard/src/style.css`

需要重新构建后，浏览器访问到的页面才会更新：

```bash
cd /home/orionxer/ai/ws_perf/dashboard
npm run build
```

如果页面表现和 `dashboard/src` 里的代码不一致，优先确认是否已经完成这一步。

## 项目结构

```
.
├── server.js              # HTTP + WebSocket 服务器
├── dashboard/
│   ├── dist/            # 构建输出（静态文件）
│   ├── src/
│   │   ├── main.js      # 前端逻辑
│   │   └── style.css    # 样式
│   └── package.json
├── start.sh             # 启动脚本
└── test-integrated.sh    # 集成测试
```
