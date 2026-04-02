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
