import { config } from "../config.js";
import type { AlphaTokenApiItem, AlphaTokenSnapshot, Monitor } from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import { PersistentStore } from "../utils/store.js";
import { alphaEventTitle, alphaEventBody } from "../utils/i18n.js";
import { alphaApiResponseSchema } from "../schemas.js";
import { getPool } from "../utils/http.js";
import { reportAlive } from "../health.js";
import { createChildLogger } from "../utils/logger.js";
import { join } from "node:path";

const log = createChildLogger("alpha-api");

const ORIGIN = "https://www.binance.com";
const PATH =
  "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";

export class AlphaApiMonitor implements Monitor {
  readonly name = "alpha-api";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private initialized = false;
  private store: PersistentStore<AlphaTokenSnapshot>;

  constructor(private readonly dispatcher: NotifyDispatcher) {
    this.store = new PersistentStore(
      join(config.dataDir, "alpha-state.json"),
      config.store.ttlDays,
      config.store.flushDebounceMs,
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    this.initialized = this.store.size > 0;
    this.running = true;
    await this.poll();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.store.close();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      try {
        await this.poll();
      } catch (err) {
        log.error({ err }, "poll error");
      }
      this.scheduleNext();
    }, config.alpha.apiPollInterval * 1000);
  }

  private async fetchTokenList(): Promise<AlphaTokenApiItem[]> {
    const pool = getPool(ORIGIN);
    const { statusCode, body } = await pool.request({
      path: PATH,
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "BinanceMonitor/1.0",
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
    const tokens = await this.fetchTokenList();
    log.info({ count: tokens.length }, "fetched alpha tokens");

    const events: Array<{ type: string; token: AlphaTokenApiItem }> = [];

    for (const token of tokens) {
      const prev = this.store.get(token.alphaId);

      if (!prev) {
        events.push({ type: "new_token", token });
      } else {
        if (!prev.onlineAirdrop && token.onlineAirdrop) {
          events.push({ type: "airdrop_live", token });
        }
        if (!prev.onlineTge && token.onlineTge) {
          events.push({ type: "tge_live", token });
        }
      }
    }

    if (!this.initialized) {
      for (const token of tokens) {
        this.updateSnapshot(token);
      }
      log.info(
        { baseline: tokens.length },
        "baseline established, skipping initial notifications",
      );
      this.initialized = true;
      reportAlive(this.name);
      return;
    }

    const failedTokens = new Set<string>();

    for (const event of events) {
      const { type, token } = event;
      log.info({ type, symbol: token.symbol, alphaId: token.alphaId }, type);

      try {
        await this.dispatcher.broadcast({
          title: alphaEventTitle(type, token.symbol),
          body: alphaEventBody(
            token.name,
            token.symbol,
            token.chainId,
            token.price,
            token.marketCap,
          ),
          group: config.alpha.group,
          level: config.bark.defaultLevel,
          sound: config.bark.defaultSound,
        });
      } catch (err) {
        failedTokens.add(token.alphaId);
        log.error(
          { err, type, symbol: token.symbol },
          "all channels failed, will retry next poll",
        );
      }
    }

    // Update snapshots: skip tokens whose notifications failed so changes are re-detected
    for (const token of tokens) {
      if (!failedTokens.has(token.alphaId)) {
        this.updateSnapshot(token);
      }
    }

    reportAlive(this.name);
  }

  private updateSnapshot(token: AlphaTokenApiItem): void {
    this.store.set(token.alphaId, {
      symbol: token.symbol,
      onlineAirdrop: token.onlineAirdrop,
      onlineTge: token.onlineTge,
    });
  }
}
