# WebSocket 移动端连接问题排查经验总结

**日期：** 2026-03-16
**问题类型：** WebSocket 跨设备访问
**影响范围：** 移动端浏览器无法显示监控数据

---

## 问题描述

### 现象
- ✅ PC 端访问 `http://localhost:8080` 正常显示监控面板
- ✅ 移动端（Safari）能访问并显示页面 UI
- ❌ 移动端无法显示任何已连接的设备
- ❌ 服务器日志显示移动端已成功连接

### 用户报告
> "移动端能够访问监控页面，但是无法显示已连接的设备，但是 server 端没有任何输出，但是 safari 已经显示监控页面了"

---

## 根因分析

### 技术根因
**前端 WebSocket URL 硬编码为 `localhost`，导致移动端连接到错误设备。**

### 问题代码
```javascript
// dashboard/src/main.js (原始代码)
const WS_URL = 'ws://localhost:8080';

const ws = new WebSocket(WS_URL);
```

### 原理解析

#### PC 端场景
```
浏览器访问：http://localhost:8080
WebSocket 连接：ws://localhost:8080
解析结果：运行服务器的电脑
结果：✅ 连接成功
```

#### 移动端场景
```
浏览器访问：http://192.168.1.100:8080
WebSocket 连接：ws://localhost:8080  // ← 错误！
解析结果：移动设备自己
结果：❌ 连接失败（移动设备上没有运行服务器）
```

### 为什么现象混淆
1. **HTTP 请求成功**：静态文件从服务器加载，页面正常显示
2. **WebSocket 连接失败但无报错**：连接到不存在的地址，静默失败
3. **服务器日志显示连接**：HTTP 请求记录了 WebSocket 握手（但实际连接到了移动设备自己）
4. **前端 UI 空白**：WebSocket 连接失败，无法接收 `[CONNECT]` 消息

---

## 解决方案

### 修复方案
**使用 `window.location.host` 动态获取 WebSocket URL**

### 修复代码
```javascript
// dashboard/src/main.js (修复后)
const WS_URL = `ws://${window.location.host}`;

const ws = new WebSocket(WS_URL);
```

### 工作原理
```javascript
// PC 端：访问 http://localhost:8080
window.location.host → "localhost:8080"
WS_URL → "ws://localhost:8080"  // ✅ 正确

// 移动端：访问 http://192.168.1.100:8080
window.location.host → "192.168.1.100:8080"
WS_URL → "ws://192.168.1.100:8080"  // ✅ 正确
```

### 配套改进

1. **增强日志**
```javascript
ws.onopen = () => {
  console.log(`[WebSocket] Connected to ${WS_URL}`);
};

ws.onerror = (error) => {
  console.error('[WebSocket] Connection error:', error);
};

ws.onclose = (event) => {
  console.log(`[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason || 'unknown'})`);
};
```

2. **自动重连**
```javascript
ws.onclose = (event) => {
  setTimeout(() => {
    const newWs = new WebSocket(WS_URL);
    newWs.onmessage = ws.onmessage;
    newWs.onopen = ws.onopen;
    // ... 绑定其他事件
  }, 3000);
};
```

3. **服务器日志完善**
```javascript
// 记录 HTTP 请求（原代码缺失）
console.log(`[HTTP] ${req.method} ${req.url} from ${clientAddress}`);

// 记录 WebSocket 升级（原代码不记录失败）
console.log(`[WebSocket upgrade] Attempt from ${clientAddress}`);

// 记录空 catch 块（原代码吞掉错误）
} catch (e) {
  console.error(`[error] Failed to send to monitor: ${e.message}`);
}
```

---

## 经验总结

### 核心原则

1. **永远不要硬编码 localhost 在跨设备场景**
   - `localhost` 是设备本地地址，不是"当前服务器"
   - 不同设备解析 `localhost` 为不同地址

2. **使用动态 URL 获取机制**
   ```javascript
   // ✅ 推荐
   const url = `ws://${window.location.host}`;

   // ❌ 避免
   const url = 'ws://localhost:8080';
   const url = 'ws://192.168.1.100:8080';  // 硬编码 IP
   ```

3. **完整的事件处理**
   - WebSocket 必须处理所有事件：`onopen`, `onmessage`, `onerror`, `onclose`
   - 任何事件缺失都可能导致静默失败

4. **调试日志的重要性**
   - 无日志 = 黑盒调试
   - 记录 URL、连接状态、错误代码

### 调试检查清单

当 WebSocket 连接问题时，按顺序检查：

#### 1. 前端检查
- [ ] WebSocket URL 是否正确（Console 输出）
- [ ] 是否有 `onerror` 错误信息
- [ ] `onclose` 的 code 和 reason 是什么
- [ ] Network 标签中 WebSocket 状态是否为 101

#### 2. 后端检查
- [ ] 服务器日志是否显示 WebSocket upgrade
- [ ] 是否有 HTTP 请求日志（静态文件加载）
- [ ] User-Agent 和 Origin 头是什么
- [ ] 是否有空 catch 块吞掉错误

#### 3. 网络检查
- [ ] 防火墙是否允许端口
- [ ] 是否在同一网络（开发环境）
- [ ] HTTPS/HTTP 混合是否正确
- [ ] 移动端是否能 ping 通服务器

### 常见 WebSocket 错误码

| Code | 含义 | 可能原因 | 解决方案 |
|-------|--------|-----------|----------|
| 1000 | 正常关闭 | 用户主动关闭 | 无需处理 |
| 1001 | 端点离开 | 页面关闭或导航 | 正常 |
| 1006 | 异常关闭 | 网络超时、服务器崩溃 | 添加重连 |
| 1000-1015 | 协议错误 | 握手失败、版本不兼容 | 检查 URL 和服务器配置 |

---

## 预防措施

### 开发阶段

1. **环境变量配置**
```javascript
// 开发环境自动适配
const WS_URL = process.env.NODE_ENV === 'development'
  ? `ws://${window.location.host}`
  : `wss://${window.location.host}`;
```

2. **URL 验证**
```javascript
if (WS_URL.includes('localhost') && !isLocalDev()) {
  console.warn('[Warning] Using localhost in production environment');
}
```

3. **连接状态可视化**
```javascript
// 在 UI 上显示连接状态
if (ws.readyState === WebSocket.CONNECTING) {
  showStatus('连接中...');
} else if (ws.readyState === WebSocket.OPEN) {
  showStatus('已连接');
} else {
  showStatus('连接断开');
}
```

### 测试阶段

1. **多设备测试清单**
   - [ ] Chrome（桌面）
   - [ ] Firefox（桌面）
   - [ ] Safari（桌面）
   - [ ] iOS Safari
   - [ ] Android Chrome
   - [ ] 微信内置浏览器

2. **网络场景测试**
   - [ ] 同一局域网
   - [ ] 不同局域网（VPN）
   - [ ] 移动数据（生产环境）

3. **日志完整性测试**
   - [ ] 所有 HTTP 请求都有日志
   - [ ] 所有 WebSocket 事件都有日志
   - [ ] 所有错误都被捕获

---

## 相关文件

### 修改的文件
- `dashboard/src/main.js` - WebSocket URL 修复、日志增强、重连机制
- `server.js` - HTTP 请求日志、WebSocket 升级日志、错误处理完善

### 新增日志类型
```
[HTTP] - HTTP 请求记录
[WebSocket upgrade] - WebSocket 升级尝试
[DEBUG] - 浏览器检测调试信息
[monitor connected] - 监控面板连接
[connected] - 普通客户端连接
[message] - 消息接收
[disconnected] - 连接断开
```

---

## 参考资料

### 相关技术点
1. **`window.location.host`**
   - 返回域名和端口号（如 `localhost:8080`, `192.168.1.100:8080`）
   - 自动适配当前访问地址

2. **WebSocket 连接状态**
   - 0: CONNECTING
   - 1: OPEN
   - 2: CLOSING
   - 3: CLOSED

3. **`window.location` 完整属性**
   ```javascript
   window.location.href    // 完整 URL
   window.location.host    // 域名 + 端口
   window.location.hostname // 仅域名
   window.location.port    // 仅端口
   window.location.protocol // 协议（http:）
   ```

### 扩展阅读
- [MDN - WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MDN - Location 对象](https://developer.mozilla.org/en-US/docs/Web/API/Location)
- [WebSocket 关闭码定义](https://datatracker.ietf.org/doc/html/rfc6455#section-7.4.1)

---

## 附录：完整调试流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     问题现象                              │
│  移动端访问页面正常，但无法显示连接的设备          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├─→ 检查前端 Console
                  │      ├─ WebSocket URL 是什么？
                  │      ├─ 是否有 onerror 错误？
                  │      └─ onclose 的 code 是什么？
                  │
                  ├─→ 检查服务器日志
                  │      ├─ 有 HTTP 请求日志吗？
                  │      ├─ 有 WebSocket upgrade 吗？
                  │      └─ 有错误信息吗？
                  │
                  ├─→ 检查 Network 标签
                  │      ├─ WebSocket 状态是什么？
                  │      └─ 握手是否成功（101）？
                  │
                  └─→ 根本原因
                         ↓
                    硬编码 localhost
                         ↓
                    修改为动态 URL
                         ↓
                      ✅ 问题解决
```

---

**文档维护者：** Sisyphus AI Agent
**审核状态：** 已验证
**最后更新：** 2026-03-16
