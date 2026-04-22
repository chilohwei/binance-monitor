## 1.0.5 - 2026-04-22

### 修复
- Bark：发送前裁剪超长 payload，避免大批量公告摘要因 `PayloadTooLarge` 整体投递失败
- Telegram：将超长 HTML 消息自动拆成续传分片，避免批量公告因 `message is too long` 整体发送失败

## 1.0.4 - 2026-04-22

### 修复
- 让公告 WebSocket monitor 即使在第一条数据到来前也能出现在 `/health` 中，补充启动、连接、订阅、重连和错误状态
- 将 WebSocket 传输层错误写入 monitor telemetry，方便远程排障

### 变更
- 抽出 Binance URL、公告过滤、Alpha 事件定义和 monitor telemetry 公共层，减少各 monitor 之间的重复代码
- 新增可复用的轮询执行骨架，并保证 REST monitor 启动时首轮执行语义稳定可预期
- Docker Compose 默认改为构建当前工作区代码，同时保留通过 `IMAGE_NAME` / `IMAGE_TAG` 使用 GHCR 镜像的能力

## 1.0.3 - 2026-04-05

### 修复
- Bark：使用 `POST /push` 且 JSON 携带 `device_key`；识别 Cloudflare 人机页（`403` / 非 JSON HTML），跳过重试并输出简短可操作的错误提示

### 变更
- 文档与 `.env.example`：说明 Docker 下同网优先使用 `http://bark-server:<port>` 作为 `BARK_SERVER`，公网走 Cloudflare 时可能被拦截

## 1.0.2 - 2026-04-05

### 新增
- README 增加捐赠说明

### 变更
- Docker Compose 单文件化（移除 `docker-compose.prod.yml` overlay）：通过 `IMAGE_TAG` 拉取 GHCR 镜像、接入 `edge-proxy` 网络、健康检查端口绑定 `127.0.0.1`、资源限制改为 Compose 通用写法

## 1.0.1 - 2026-04-02

### 修复
- 修复远程 Docker 构建时 BuildKit npm cache 冲突问题，改为隔离且加锁的缓存挂载
- 兼容 Binance Alpha API 返回 `volume24h = null` 的真实线上数据，避免监控启动失败

## 1.0.0 - 2026-04-02

### 新功能
- 首次发布 `binance-monitor`
- 新增币安公告监控，支持 CMS WebSocket 与 BAPI 轮询兜底
- 新增 Binance Alpha 监控，覆盖新代币、空投状态与 TGE 状态变化
- 新增 Bark 与 Telegram 双通道推送，消息为英中双语格式
- 新增 GitHub Actions 多平台 Docker 镜像构建与 GHCR 发布能力，支持 `linux/amd64` 与 `linux/arm64`

### 修复
- 改进投递语义，只有推送成功后才标记为已处理，避免误丢通知
- 加强 WebSocket 重连、运行时 schema 校验与持久化 store 损坏恢复
- 新增健康检查端点、Docker healthcheck 集成与基础自动化测试
