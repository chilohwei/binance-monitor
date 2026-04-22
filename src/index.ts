import { config } from "./config.js";
import type { Monitor } from "./types.js";
import { BarkNotifier } from "./notifiers/bark.js";
import { TelegramNotifier } from "./notifiers/telegram.js";
import { NotifyDispatcher } from "./notifiers/dispatcher.js";
import { AnnouncementMonitor } from "./monitors/announcement.js";
import { AnnouncementPollMonitor } from "./monitors/announcement-poll.js";
import { AlphaApiMonitor } from "./monitors/alpha-api.js";
import { startHealthServer, stopHealthServer } from "./health.js";
import { closeAllPools } from "./utils/http.js";
import { AnnouncementDeduper } from "./utils/announcement-deduper.js";
import { logger } from "./utils/logger.js";
import { join } from "node:path";

const log = logger.child({ module: "main" });

process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "unhandled rejection");
});

process.on("uncaughtException", (err) => {
  log.fatal({ err }, "uncaught exception, exiting");
  process.exit(1);
});

async function main() {
  log.info("binance-monitor starting");
  log.info(
    {
      barkDevices: config.bark.keys.length,
      catalogIds: config.announcement.catalogIds,
      keywords: config.announcement.keywords,
      notificationProfile: config.notification.profile,
      notificationBatchWindowMs: config.notification.batchWindowMs,
      alphaPollInterval: config.alpha.apiPollInterval,
      announcementPollEnabled: config.announcementPoll.enabled,
      healthPort: config.healthPort,
    },
    "config loaded",
  );

  await startHealthServer(config.healthPort);

  const announcementDeduper = new AnnouncementDeduper(
    join(config.dataDir, "announcement-seen.json"),
    config.store.ttlDays,
    config.store.flushDebounceMs,
  );
  await announcementDeduper.load();

  const dispatcher = new NotifyDispatcher([
    new BarkNotifier(),
    new TelegramNotifier(),
  ], config.notification.batchWindowMs);

  const monitors: Monitor[] = [
    new AnnouncementMonitor(dispatcher, announcementDeduper),
    new AlphaApiMonitor(dispatcher),
  ];

  if (config.announcementPoll.enabled) {
    monitors.push(new AnnouncementPollMonitor(dispatcher, announcementDeduper));
  }

  for (const m of monitors) {
    try {
      await m.start();
      log.info({ monitor: m.name }, "monitor started");
    } catch (err) {
      log.error({ err, monitor: m.name }, "monitor failed to start");
    }
  }

  log.info("all monitors running");

  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info({ signal }, "shutting down");

    for (const m of monitors) {
      try {
        await m.stop();
        log.info({ monitor: m.name }, "monitor stopped");
      } catch (err) {
        log.error({ err, monitor: m.name }, "error stopping monitor");
      }
    }

    await dispatcher.close();
    await announcementDeduper.close();
    await stopHealthServer();
    await closeAllPools();
    log.info("shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "fatal error");
  process.exit(1);
});
