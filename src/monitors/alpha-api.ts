import { config } from "../config.js";
import {
  BINANCE_MONITOR_USER_AGENT,
  BINANCE_WEB_ORIGIN,
} from "../domain/binance.js";
import type {
  AlphaTokenApiItem,
  AlphaTokenSnapshot,
  Monitor,
  NotifyMessage,
} from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import { PersistentStore } from "../utils/store.js";
import { alphaEventTitle, alphaEventBody } from "../utils/i18n.js";
import { applyNotificationPolicy } from "../utils/notification-policy.js";
import {
  dedupeAlphaEventTypes,
  type AlphaEventType,
} from "../domain/alpha.js";
import { alphaApiResponseSchema } from "../schemas.js";
import { getPool } from "../utils/http.js";
import { createChildLogger } from "../utils/logger.js";
import { MonitorTelemetry } from "../runtime/monitor-telemetry.js";
import { PollingLoop } from "../runtime/polling-loop.js";
import { join } from "node:path";

const log = createChildLogger("alpha-api");

const PATH =
  "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";
const INITIAL_CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

interface PendingAlphaEvent {
  token: AlphaTokenApiItem;
  types: AlphaEventType[];
}

function formatAlphaNotification(
  events: PendingAlphaEvent[],
): NotifyMessage {
  const sound = config.bark.defaultSound;

  if (events.length === 1) {
    const event = events[0]!;
    return {
      title: alphaEventTitle(event.types, event.token.symbol),
      body: alphaEventBody(
        event.token.name,
        event.token.symbol,
        event.token.chainId,
        event.token.price,
        event.token.marketCap,
      ),
      group: config.alpha.group,
      sound,
    };
  }

  const body = events
    .map((event, index) =>
      [
        `${index + 1}. ${alphaEventTitle(event.types, event.token.symbol)}`,
        alphaEventBody(
          event.token.name,
          event.token.symbol,
          event.token.chainId,
          event.token.price,
          event.token.marketCap,
        ),
      ].join("\n"),
    )
    .join("\n\n———————————\n\n");

  return {
    title: `🚀 Alpha 更新 (${events.length} 条)`,
    body,
    group: config.alpha.group,
    sound,
  };
}

export class AlphaApiMonitor implements Monitor {
  readonly name = "alpha-api";
  private initialized = false;
  private store: PersistentStore<AlphaTokenSnapshot>;
  private readonly telemetry = new MonitorTelemetry(this.name);
  private readonly loop: PollingLoop;

  constructor(private readonly dispatcher: NotifyDispatcher) {
    this.store = new PersistentStore(
      join(config.dataDir, "alpha-state.json"),
      config.store.ttlDays,
      config.store.flushDebounceMs,
    );
    this.loop = new PollingLoop({
      intervalMs: config.alpha.apiPollInterval * 1000,
      run: () => this.poll(),
      onError: (err) => {
        this.telemetry.error(err);
        log.error({ err }, "poll error");
      },
    });
  }

  async start(): Promise<void> {
    await this.store.load();
    this.initialized = this.store.size > 0;
    await this.loop.start();
  }

  async stop(): Promise<void> {
    this.loop.stop();
    await this.store.close();
  }

  private async fetchTokenList(): Promise<AlphaTokenApiItem[]> {
    const pool = getPool(BINANCE_WEB_ORIGIN);
    const { statusCode, body } = await pool.request({
      path: PATH,
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": BINANCE_MONITOR_USER_AGENT,
      },
    });

    const raw = await body.text();
    if (statusCode !== 200) {
      throw new Error(`alpha api http ${statusCode}: ${raw.slice(0, 200)}`);
    }

    const parsed = alphaApiResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`alpha api schema validation failed: ${parsed.error.message}`);
    }

    return parsed.data.data;
  }

  private async poll(): Promise<void> {
    log.debug("polling alpha token list");
    this.telemetry.count("polls");
    const tokens = await this.fetchTokenList();
    log.info({ count: tokens.length }, "fetched alpha tokens");

    const pending: PendingAlphaEvent[] = [];
    const seedOnly: AlphaTokenApiItem[] = [];
    const now = Date.now();

    for (const token of tokens) {
      this.telemetry.count("seen");
      const prev = this.store.get(token.alphaId);

      if (!prev) {
        if (!this.initialized && token.listingTime < now - INITIAL_CATCH_UP_WINDOW_MS) {
          seedOnly.push(token);
          this.telemetry.count("seeded");
          continue;
        }

        const types: AlphaEventType[] = ["new_token"];
        if (token.onlineAirdrop) {
          types.push("airdrop_live");
        }
        if (token.onlineTge) {
          types.push("tge_live");
        }
        pending.push({ token, types: dedupeAlphaEventTypes(types) });
      } else {
        const types: AlphaEventType[] = [];
        if (!prev.onlineAirdrop && token.onlineAirdrop) {
          types.push("airdrop_live");
        }
        if (!prev.onlineTge && token.onlineTge) {
          types.push("tge_live");
        }
        if (types.length > 0) {
          pending.push({ token, types });
        }
      }
    }

    for (const token of seedOnly) {
      this.updateSnapshot(token);
    }

    if (pending.length > 0) {
      const message = applyNotificationPolicy(formatAlphaNotification(pending), {
        kind: "alpha",
        mode: pending.length > 1 ? "batch" : "single",
        alphaTypes: pending.flatMap((event) => event.types),
        profile: config.notification.profile,
      });

      log.info(
        {
          count: pending.length,
          firstSymbol: pending[0]!.token.symbol,
          firstTypes: pending[0]!.types,
        },
        pending.length === 1 ? "alpha update" : "alpha update batch",
      );

      try {
        await this.dispatcher.broadcast(message);
        for (const { token } of pending) {
          this.updateSnapshot(token);
        }
        this.telemetry.count("sent", pending.length);
      } catch (err) {
        this.telemetry.error(err, pending.length);
        log.error(
          { err, count: pending.length },
          "all channels failed, will retry next poll",
        );
      }
    }

    if (!this.initialized) {
      log.info(
        { baseline: tokens.length },
        "baseline established, skipping initial notifications",
      );
      this.initialized = true;
    }

    this.telemetry.alive();
  }

  private updateSnapshot(token: AlphaTokenApiItem): void {
    this.store.set(token.alphaId, {
      symbol: token.symbol,
      onlineAirdrop: token.onlineAirdrop,
      onlineTge: token.onlineTge,
    });
  }
}
