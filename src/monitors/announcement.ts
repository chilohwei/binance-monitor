import WebSocket from "ws";
import { config } from "../config.js";
import type { Monitor } from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import { PersistentStore } from "../utils/store.js";
import { hmacSha256, generateRandom } from "../utils/signature.js";
import { announcementBody } from "../utils/i18n.js";
import { wsMessageSchema, announcementDataSchema } from "../schemas.js";
import { reportAlive } from "../health.js";
import { createChildLogger } from "../utils/logger.js";
import { join } from "node:path";

const log = createChildLogger("announcement");

const WS_BASE = "wss://api.binance.com/sapi/wss";
const TOPIC = "com_announcement_en";

export class AnnouncementMonitor implements Monitor {
  readonly name = "announcement";
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = config.ws.reconnectMinMs;
  private running = false;
  private store: PersistentStore<boolean>;

  constructor(private readonly dispatcher: NotifyDispatcher) {
    this.store = new PersistentStore(
      join(config.dataDir, "announcement-seen.json"),
      config.store.ttlDays,
      config.store.flushDebounceMs,
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    this.running = true;
    this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.clearPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    await this.store.close();
  }

  private buildSignedUrl(): string {
    const random = generateRandom();
    const timestamp = Date.now();
    const recvWindow = 30000;

    const payload = `random=${random}&recvWindow=${recvWindow}&timestamp=${timestamp}&topic=${TOPIC}`;
    const signature = hmacSha256(config.binanceApiSecret, payload);

    return `${WS_BASE}?${payload}&signature=${signature}`;
  }

  private connect(): void {
    if (!this.running) return;

    const url = this.buildSignedUrl();
    log.info("connecting to binance CMS websocket");

    this.ws = new WebSocket(url, {
      headers: { "X-MBX-APIKEY": config.binanceApiKey },
    });

    this.ws.on("open", () => {
      log.info("websocket connected");
      this.reconnectDelay = config.ws.reconnectMinMs;
      this.startPing();

      const subscribeMsg = JSON.stringify({
        command: "SUBSCRIBE",
        value: TOPIC,
      });
      this.ws!.send(subscribeMsg);
      log.info({ topic: TOPIC }, "subscribed");
    });

    this.ws.on("message", (raw: Buffer) => {
      this.handleMessage(raw.toString()).catch((err) =>
        log.error({ err }, "message handler error"),
      );
    });

    this.ws.on("close", (code, reason) => {
      log.warn({ code, reason: reason.toString() }, "websocket closed");
      this.clearPing();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      log.error({ err }, "websocket error");
    });

    this.ws.on("pong", () => {
      log.debug("pong received");
    });
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, config.ws.pingIntervalMs);
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.running) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    log.info({ delayMs: this.reconnectDelay }, "reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      config.ws.reconnectMaxMs,
    );
  }

  private async handleMessage(raw: string): Promise<void> {
    const parsed = wsMessageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log.warn({ error: parsed.error.message }, "invalid ws message schema");
      return;
    }
    const msg = parsed.data;

    if (msg.type === "COMMAND") {
      log.info({ data: msg.data, subType: msg.subType }, "command response");
      return;
    }

    if (msg.type !== "DATA" || !msg.data) {
      log.debug({ type: msg.type }, "ignoring non-data message");
      return;
    }

    reportAlive(this.name);

    const annParsed = announcementDataSchema.safeParse(JSON.parse(msg.data));
    if (!annParsed.success) {
      log.warn({ error: annParsed.error.message }, "invalid announcement data schema");
      return;
    }
    const announcement = annParsed.data;

    const dedupKey = `${announcement.catalogId}:${announcement.publishDate}:${announcement.title}`;

    if (this.store.has(dedupKey)) return;

    if (!this.matchesFilter(announcement)) {
      log.debug(
        { title: announcement.title, catalogId: announcement.catalogId },
        "filtered out",
      );
      return;
    }

    log.info(
      {
        title: announcement.title,
        catalogId: announcement.catalogId,
        catalogName: announcement.catalogName,
      },
      "new announcement matched",
    );

    const url = announcement.code
      ? `https://www.binance.com/en/support/announcement/detail/${announcement.code}`
      : undefined;

    try {
      await this.dispatcher.broadcast({
        title: `[${announcement.catalogName}] ${announcement.title}`,
        body: announcementBody(announcement.title),
        group: config.announcement.group,
        url,
        level: config.bark.defaultLevel,
        sound: config.bark.defaultSound,
      });
      this.store.set(dedupKey, true);
    } catch (err) {
      log.error({ err, title: announcement.title }, "all channels failed, will retry");
    }
  }

  private matchesFilter(a: { catalogId: number; title: string; body: string }): boolean {
    const { catalogIds, keywords } = config.announcement;

    if (!catalogIds.includes(a.catalogId)) return false;

    if (keywords.length === 0) return true;

    return keywords.some((kw) => a.title.includes(kw) || a.body.includes(kw));
  }
}
