# Quick Start

## 1. 启动服务端

```bash
# 进入项目根目录
npm install
npm start
```

服务启动后访问：

```text
http://localhost:8080
```

如果需要让手机访问，使用：

```text
http://<你的电脑IP>:8080
```

## 2. 启动演示客户端

```bash
cd demo_client
npm install
npm start
```

## 3. 使用方式

1. 打开监控页面
2. 等待客户端出现在列表中
3. 点击某个客户端进入详情页
4. 点击“上传视频”
5. 等待上传完成并查看：
   - 上传进度
   - SHA256 / RTT / 带宽
   - 服务端保存后的视频播放结果

## 4. 目录说明

- `server.js`：服务端入口
- `dashboard/`：监控页面源码
- `demo_client/`：演示客户端
- `resource/starship.mp4`：服务端保存的视频
- `demo_client/resource/starship.mp4`：客户端上传源文件

## 5. 常用命令

重新构建 dashboard：

```bash
cd dashboard
npm install
npm run build
```

## 6. 说明

- 服务端默认端口：`8080`
- demo 客户端默认连接：`ws://localhost:8080`
- 如需修改客户端地址，编辑 `demo_client/client.js`
