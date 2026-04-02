## 1.0.0 - 2026-04-02

### Features
- Initial release of `binance-monitor`
- Add Binance announcement monitoring with CMS WebSocket and BAPI polling fallback
- Add Binance Alpha monitoring for new tokens, airdrop status, and TGE status
- Add Bark and Telegram dual-channel notifications with bilingual message formatting
- Add GitHub Actions workflow for multi-platform Docker image builds (`linux/amd64`, `linux/arm64`) and GHCR publishing

### Fixes
- Improve delivery semantics so notifications are marked as seen only after a successful send
- Harden WebSocket reconnect handling, runtime schema validation, and persistent store recovery
- Add health endpoint, Docker healthcheck integration, and basic automated tests
