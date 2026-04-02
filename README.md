# Binance Monitor

币安公告 + Alpha 代币实时监控，Bark + Telegram 双通道推送。

## 功能

- **公告监控 (WebSocket)** — 实时订阅币安 CMS 公告 (`com_announcement_en`)，按 catalogId + 关键词过滤
- **公告监控 (REST 轮询)** — 定时轮询 BAPI 公告接口作为 WebSocket 的备份
- **Alpha 监控** — 轮询官方 Token List API，检测新 token / 空投上线 / TGE 上线
- **Bark 推送** — 多设备并发 + 指数退避重试 + 连接池复用
- **Telegram 推送** — Bot sendMessage API + HTML 格式 + 速率限制处理
- **双语通知** — 英文优先，中文翻译，分割线分隔
- **健康检查** — HTTP 端点 + Docker 健康检查集成
- **至少一次投递** — 推送成功后才标记已读，失败自动重试

## 快速开始

### 使用预构建镜像（推荐）

```bash
# 拉取镜像（支持 amd64 / arm64）
docker compose pull

cp .env.example .env
# 编辑 .env 填入真实密钥

docker compose up -d
docker compose logs -f
```

### VPS / 生产部署（GHCR + NPM）

```bash
# 1. 登录 GHCR（私有镜像需要 read:packages）
echo "<github_pat>" | docker login ghcr.io -u chilohwei --password-stdin

# 2. 使用生产 overlay
cp .env.example .env
# 编辑 .env

IMAGE_TAG=v1.0.1 docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
IMAGE_TAG=v1.0.1 docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

生产 overlay 会额外接入外部网络 `edge-proxy`，用于：
- `Nginx Proxy Manager` 反向代理
- 容器间 `Origin` 健康检查

### 本地构建

```bash
cp .env.example .env
# 编辑 .env 填入真实密钥

docker compose up -d --build
docker compose logs -f
```

## 本地开发

```bash
npm install
cp .env.example .env
# 编辑 .env

npm run dev     # tsx 热运行
npm run build   # TypeScript 编译
npm start       # 运行编译产物
npm test        # 运行测试
```

## 配置项

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `BINANCE_API_KEY` | 是 | - | 币安 API Key |
| `BINANCE_API_SECRET` | 是 | - | 币安 API Secret |
| `BARK_SERVER` | 否 | `https://bark.chiloh.com` | Bark 服务器地址 |
| `BARK_KEYS` | 是 | - | Bark 设备 Key，逗号分隔 |
| `BARK_DEFAULT_LEVEL` | 否 | `critical` | 通知级别 |
| `BARK_DEFAULT_SOUND` | 否 | `alarm` | 通知声音 |
| `BARK_ICON` | 否 | Binance Logo | 通知图标 URL |
| `BARK_VOLUME` | 否 | `10` | 通知音量 0-10 |
| `BARK_BADGE` | 否 | `1` | 角标数 |
| `BARK_CALL` | 否 | `1` | 是否持续响铃 |
| `BARK_IS_ARCHIVE` | 否 | `1` | 是否归档 |
| `BARK_MAX_RETRIES` | 否 | `3` | 最大重试次数 |
| `TG_BOT_TOKEN` | 是 | - | Telegram Bot Token |
| `TG_CHAT_ID` | 是 | - | Telegram Chat ID |
| `TG_DISABLE_PREVIEW` | 否 | `false` | 禁用链接预览 |
| `TG_DISABLE_NOTIFICATION` | 否 | `false` | 静音推送 |
| `TG_MAX_RETRIES` | 否 | `3` | 最大重试次数 |
| `ANNOUNCEMENT_CATALOG_IDS` | 否 | `48` | 公告分类 ID |
| `ANNOUNCEMENT_KEYWORDS` | 否 | `Contract,Futures,合约,期货` | 关键词过滤 |
| `ANNOUNCEMENT_GROUP` | 否 | `币安公告` | 推送分组 |
| `ANNOUNCEMENT_POLL_ENABLED` | 否 | `true` | 启用 REST 轮询备份 |
| `ANNOUNCEMENT_POLL_INTERVAL_MS` | 否 | `30000` | 轮询间隔 (ms) |
| `ANNOUNCEMENT_POLL_PAGE_SIZE` | 否 | `10` | 每次拉取条数 |
| `ALPHA_API_POLL_INTERVAL` | 否 | `10` | Alpha 轮询间隔 (秒) |
| `ALPHA_GROUP` | 否 | `Alpha监控` | 推送分组 |
| `WS_PING_INTERVAL_MS` | 否 | `25000` | WS 心跳间隔 |
| `WS_RECONNECT_MIN_MS` | 否 | `1000` | 最小重连延迟 |
| `WS_RECONNECT_MAX_MS` | 否 | `30000` | 最大重连延迟 |
| `STORE_TTL_DAYS` | 否 | `30` | 去重数据保留天数 |
| `STORE_FLUSH_DEBOUNCE_MS` | 否 | `500` | 磁盘写入防抖 |
| `HEALTH_PORT` | 否 | `8080` | 健康检查端口 |
| `LOG_LEVEL` | 否 | `info` | 日志级别 |
| `DATA_DIR` | 否 | `./data` | 数据目录 |

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    index.ts                         │
│           启动所有 Monitor + 健康检查 + 优雅关停      │
└──────────┬──────────┬──────────┬────────────────────┘
           │          │          │
     ┌─────▼──┐ ┌─────▼──────┐ ┌──▼───────┐
     │ CMS WS │ │BAPI 轮询   │ │Alpha API │  ← Monitor 接口
     │ 公告   │ │ 公告(备份) │ │ 轮询     │
     └────┬───┘ └─────┬──────┘ └────┬─────┘
          │           │             │
          └───────────┼─────────────┘
                      │
               ┌──────▼──────┐
               │  Dispatcher  │  ← 并发广播，全失败时抛错
               └──┬───────┬──┘
            ┌────▼──┐ ┌──▼─────┐
            │ Bark  │ │Telegram│  ← Notifier 接口
            └───────┘ └────────┘
```

## CI/CD

推送到 `main` 分支或打 `v*` 标签时，GitHub Actions 自动构建多平台镜像并推送到 GHCR：

- **平台**: `linux/amd64`, `linux/arm64`
- **镜像**: `ghcr.io/<owner>/binance-monitor`
- **标签**: `main`, `v1.0.1`, `v1.0`, `<commit-sha>`
- PR 仅构建不推送

## 管理命令

```bash
docker compose pull             # 拉取最新镜像
docker compose up -d            # 启动
docker compose logs -f          # 实时日志
docker compose restart          # 重启
docker compose down             # 停止并删除
docker compose up -d --build    # 本地重新构建并启动
docker stats binance-monitor    # 资源占用
curl http://localhost:8080/health  # 健康检查
```

## 数据目录

```
data/
├── announcement-seen.json       # WS 公告去重
├── announcement-poll-seen.json  # 轮询公告去重
└── alpha-state.json             # Alpha token 状态快照
```

去重数据自动清理超过 30 天的记录（可通过 `STORE_TTL_DAYS` 配置）。

## 扩展

新增数据源：实现 `Monitor` 接口，在 `index.ts` 注册即可。

新增通知渠道：实现 `Notifier` 接口，加入 `NotifyDispatcher` 即可。

## Docker 安全加固

- `read_only: true` — 容器文件系统只读
- `no-new-privileges` — 禁止提权
- `init: true` — PID 1 信号转发 + 僵尸进程回收
- `USER node` — 非 root 运行
- `tmpfs /tmp` — 临时文件隔离
- Named volume — 持久化数据与容器解耦
