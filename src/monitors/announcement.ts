import WebSocket from "ws";
import { config } from "../config.js";
import { matchesAnnouncementFilter } from "../domain/announcement.js";
import { buildAnnouncementUrl } from "../domain/binance.js";
import type { Monitor } from "../types.js";
import { NotifyDispatcher } from "../notifiers/dispatcher.js";
import {
  AnnouncementDeduper,
  announcementDedupKey,
} from "../utils/announcement-deduper.js";
import { applyNotificationPolicy } from "../utils/notification-policy.js";
import { hmacSha256, generateRandom } from "../utils/signature.js";
import { announcementBody } from "../utils/i18n.js";
import { wsMessageSchema, announcementDataSchema } from "../schemas.js";
import { createChildLogger } from "../utils/logger.js";
import { MonitorTelemetry } from "../runtime/monitor-telemetry.js";

const log = createChildLogger("announcement");

const WS_BASE = "wss://api.binance.com/sapi/wss";
const TOPIC = "com_announcement_en";

export class AnnouncementMonitor implements Monitor {
  readonly name = "announcement";
  private readonly telemetry = new MonitorTelemetry(this.name);
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = config.ws.reconnectMinMs;
  private running = false;

  constructor(
    private readonly dispatcher: NotifyDispatcher,
    private readonly deduper: AnnouncementDeduper,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.telemetry.state("starting");
    this.telemetry.alive();
    this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.telemetry.state("stopped");
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
      this.telemetry.state("connected");
      this.telemetry.alive();
      this.startPing();

      const subscribeMsg = JSON.stringify({
        command: "SUBSCRIBE",
        value: TOPIC,
      });
      this.ws!.send(subscribeMsg);
      this.telemetry.state("subscribing");
      log.info({ topic: TOPIC }, "subscribed");
    });

    this.ws.on("message", (raw: Buffer) => {
      this.handleMessage(raw.toString()).catch((err) => {
        this.telemetry.error(err);
        log.error({ err }, "message handler error");
      });
    });

    this.ws.on("close", (code, reason) => {
      log.warn({ code, reason: reason.toString() }, "websocket closed");
      this.telemetry.state(this.running ? "reconnecting" : "stopped");
      this.clearPing();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      this.telemetry.error(err);
      this.telemetry.state("error");
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

    this.telemetry.state("reconnecting");
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
      this.telemetry.error(parsed.error.message);
      log.warn({ error: parsed.error.message }, "invalid ws message schema");
      return;
    }
    const msg = parsed.data;

    if (msg.type === "COMMAND") {
      this.telemetry.state("subscribed");
      this.telemetry.alive();
      log.info({ data: msg.data, subType: msg.subType }, "command response");
      return;
    }

    if (msg.type !== "DATA" || !msg.data) {
      log.debug({ type: msg.type }, "ignoring non-data message");
      return;
    }

    this.telemetry.alive();

    const annParsed = announcementDataSchema.safeParse(JSON.parse(msg.data));
    if (!annParsed.success) {
      this.telemetry.error(annParsed.error.message);
      log.warn({ error: annParsed.error.message }, "invalid announcement data schema");
      return;
    }
    const announcement = annParsed.data;
    this.telemetry.count("seen");

    const dedupKey = announcementDedupKey({
      catalogId: announcement.catalogId,
      title: announcement.title,
      code: announcement.code,
    });

    if (!this.deduper.claim(dedupKey)) {
      this.telemetry.count("deduped");
      return;
    }

    if (!matchesAnnouncementFilter(announcement, config.announcement)) {
      this.deduper.confirm(dedupKey);
      this.telemetry.count("filtered");
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

    const url = buildAnnouncementUrl(announcement.code);

    try {
      await this.dispatcher.broadcast(
        applyNotificationPolicy(
          {
            title: `[${announcement.catalogName}] ${announcement.title}`,
            body: announcementBody(announcement.title),
            group: config.announcement.group,
            url,
            sound: config.bark.defaultSound,
          },
          {
            kind: "announcement",
            mode: "single",
            profile: config.notification.profile,
          },
        ),
      );
      this.deduper.confirm(dedupKey);
      this.telemetry.count("sent");
    } catch (err) {
      this.deduper.release(dedupKey);
      this.telemetry.error(err);
      log.error({ err, title: announcement.title }, "all channels failed, will retry");
    }
  }
}
