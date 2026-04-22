## 1.0.5 - 2026-04-22

### Fixed
- Truncate oversized Bark payloads before send so large announcement digests no longer fail with `PayloadTooLarge`
- Split oversized Telegram HTML messages into continuation chunks so batched announcements stay deliverable instead of failing with `message is too long`

## 1.0.4 - 2026-04-22

### Fixed
- Make the announcement WebSocket monitor visible in `/health` even before the first data event by reporting startup, connection, subscription, reconnect, and error states
- Record WebSocket transport errors in monitor telemetry so failures are easier to diagnose remotely

### Changed
- Centralize Binance URLs, announcement filter logic, Alpha event definitions, and monitor telemetry helpers to reduce duplication across monitors
- Add a reusable polling loop with deterministic first-run startup semantics for REST-based monitors
- Let Docker Compose build the current workspace by default while keeping GHCR image deployment available via `IMAGE_NAME` / `IMAGE_TAG`

## 1.0.3 - 2026-04-05

### Fixed
- Bark pushes use `POST /push` with `device_key` in JSON; detect Cloudflare challenge pages (`403` / non-JSON HTML), skip pointless retries, and log compact errors with an actionable hint

### Changed
- Document `BARK_SERVER` for Docker: prefer internal `http://bark-server:<port>` on the same network when the public host is behind Cloudflare; expand `.env.example` comments

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
