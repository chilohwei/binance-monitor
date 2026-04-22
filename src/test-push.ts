import { config } from "./config.js";
import type { NotifyMessage } from "./types.js";
import { BarkNotifier } from "./notifiers/bark.js";
import { TelegramNotifier } from "./notifiers/telegram.js";
import { NotifyDispatcher } from "./notifiers/dispatcher.js";
import { buildAnnouncementUrl } from "./domain/binance.js";
import {
  applyNotificationPolicy,
  type NotificationPolicyInput,
} from "./utils/notification-policy.js";
import { closeAllPools } from "./utils/http.js";
import { logger } from "./utils/logger.js";
import {
  announcementBody,
  alphaEventTitle,
  alphaEventBody,
} from "./utils/i18n.js";

const log = logger.child({ module: "test-push" });

type Scenario = {
  message: NotifyMessage;
  policy: NotificationPolicyInput;
};

const SCENARIOS: Record<string, Scenario> = {
  announcement: {
    message: {
      title:
        "[New Listing] Binance Futures Will Launch USDⓈ-Margined PRLUSDT Perpetual Contract (2026-04-01)",
      body: announcementBody(
        "Binance Futures Will Launch USDⓈ-Margined PRLUSDT Perpetual Contract (2026-04-01)",
      ),
      group: config.announcement.group,
      url: buildAnnouncementUrl("0116dd83010043bd95c37626e2277bbe"),
    },
    policy: { kind: "announcement", mode: "single" },
  },
  alpha: {
    message: {
      title: alphaEventTitle("new_token", "CHECK"),
      body: alphaEventBody(
        "Checkmate",
        "CHECK",
        "8453 (Base)",
        "0.0541",
        "17846050",
      ),
      group: config.alpha.group,
    },
    policy: { kind: "alpha", mode: "single", alphaTypes: ["new_token"] },
  },
  airdrop: {
    message: {
      title: alphaEventTitle("airdrop_live", "EDGE"),
      body: alphaEventBody("edgeX", "EDGE", "56 (BSC)", "0.686", "240081507"),
      group: config.alpha.group,
    },
    policy: { kind: "alpha", mode: "single", alphaTypes: ["airdrop_live"] },
  },
  tge: {
    message: {
      title: alphaEventTitle("tge_live", "KAT"),
      body: alphaEventBody("Katana", "KAT", "56 (BSC)", "0", "0"),
      group: config.alpha.group,
    },
    policy: { kind: "alpha", mode: "single", alphaTypes: ["tge_live"] },
  },
};

async function main() {
  const args = process.argv.slice(2);
  const keys = args.length > 0 ? args : Object.keys(SCENARIOS);

  for (const key of keys) {
    if (!SCENARIOS[key]) {
      log.error(
        { available: Object.keys(SCENARIOS) },
        `unknown scenario: ${key}`,
      );
      process.exit(1);
    }
  }

  const dispatcher = new NotifyDispatcher([
    new BarkNotifier(),
    new TelegramNotifier(),
  ]);

  for (const key of keys) {
    const scenario = SCENARIOS[key]!;
    const msg = applyNotificationPolicy(scenario.message, {
      ...scenario.policy,
      profile: config.notification.profile,
    });
    log.info({ scenario: key, title: msg.title }, "sending");
    await dispatcher.broadcast(msg);
    if (keys.length > 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  await closeAllPools();
  log.info("all done");
}

main().catch((err) => {
  log.fatal({ err }, "test-push failed");
  process.exit(1);
});
