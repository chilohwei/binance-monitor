## 1.0.2 - 2026-04-05

### Added
- Add a donate section to the README

### Changed
- Simplify Docker Compose to a single file (remove `docker-compose.prod.yml` overlay): pull GHCR image via `IMAGE_TAG`, attach `edge-proxy` network, bind health check port to `127.0.0.1`, and use Compose-compatible resource limits

## 1.0.1 - 2026-04-02

### Fixes
- Fix Docker BuildKit npm cache collisions during remote image builds by using isolated locked cache mounts
- Allow Binance Alpha API `volume24h` to be `null` so the monitor remains compatible with live API responses

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
